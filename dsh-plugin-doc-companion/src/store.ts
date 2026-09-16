// dsh-plugin-doc-companion — document store (host state).
//
// Owns everything about the documents the companion knows:
//   - the registry (meta.json: docs + current position, debounced save),
//   - stored files under <root>/docs,
//   - extracted block texts, cached in memory and persisted to a sidecar
//     (text/<id>.json) so a restart does not re-extract big books,
//   - page snapshots of scanned pages under <root>/images.
//
// Block model: every kind maps onto one 1-based block space — PDF pages, text
// slices, paragraph groups, row groups. `blockText()` is the fast path (a
// single PDF page is extracted on demand); `blocksFor()` is the full index
// used by search, built in the background for PDFs.
import { mkdir, readFile, writeFile, copyFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  chunkText,
  chunkTotalChars,
  detectBrokenTextLayer,
  groupBy,
  pageLocator,
  paragraphBlockLocator,
  rowBlockLocator,
  textBlockLocator,
  clampIndex,
  type BlockText,
  type DocKind,
  type TableBlock
} from './blocks.js'
import { extractDocxParagraphs, extractXlsxSheets, openPdf, parseCsv, type SheetTable } from './extract.js'
import { renderPdfPagePng } from './render.js'

/** One registered document. */
export interface DocMeta {
  id: string
  name: string
  kind: DocKind
  /** Stored file name under <root>/docs. */
  fileName: string
  /** 1-based block count; null until the index is built. */
  totalBlocks: number | null
  /** PDFs only: text layer glyphs map to broken code points (see detectBrokenTextLayer). */
  textLayerBroken?: boolean
  addedAt: number
}

/** The current reading position. */
export interface CurrentState {
  docId: string | null
  block: number
}

/** Tunables that shape the block model. */
export interface StoreOptions {
  textBlockChars: number
  maxParagraphsPerBlock: number
  maxRowsPerBlock: number
}

interface MetaFile {
  version: 1
  docs: DocMeta[]
  /** Reading positions: one per session, plus a fallback for session-less callers. */
  current: {
    fallback: CurrentState
    sessions: Record<string, CurrentState>
  }
}

const META_VERSION = 1 as const
const SAVE_DELAY_MS = 500
/** Cap on persisted per-session positions (oldest evicted first). */
const MAX_SESSION_STATES = 200

/** Errors thrown for document-level problems (aligned with harness codes). */
export class DocStoreError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'DocStoreError'
  }
}

export class DocumentStore {
  private readonly docs = new Map<string, DocMeta>()
  /** Per-session reading positions (the panel follows the current session). */
  private readonly currentBySession = new Map<string, CurrentState>()
  /** Fallback position for session-less callers (tests, direct curl probes). */
  private fallbackCurrent: CurrentState = { docId: null, block: 1 }
  private readonly blocksByDoc = new Map<string, Promise<BlockText[]>>()
  private readonly readySet = new Set<string>()
  /** docId → (block → extracted text) for PDF pages touched so far. */
  private readonly pageTextCache = new Map<string, Map<number, string>>()
  /** docId → (block → snapshot path) for scanned pages rendered by the panel. */
  private readonly images = new Map<string, Map<number, string>>()
  /** docId → last table block (xlsx/csv table rendering cache). */
  private readonly tableCache = new Map<string, TableBlock>()
  private saveTimer: NodeJS.Timeout | null = null
  private disposed = false

  constructor(
    private readonly root: string,
    private readonly opts: StoreOptions
  ) {}

  get docsDir(): string {
    return join(this.root, 'docs')
  }

  get textDir(): string {
    return join(this.root, 'text')
  }

  get imageDir(): string {
    return join(this.root, 'images')
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  /** Ensure the storage layout exists and load the persisted registry. */
  async init(): Promise<void> {
    await mkdir(this.docsDir, { recursive: true })
    await mkdir(this.textDir, { recursive: true })
    await mkdir(this.imageDir, { recursive: true })
    await this.loadMeta()
    // Rebuild indexes in the background so search/ready are fresh after a
    // restart (sidecars make this cheap for already-extracted documents).
    for (const doc of this.docs.values()) this.kickIndex(doc.id)
  }

  private async loadMeta(): Promise<void> {
    const path = join(this.root, 'meta.json')
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<MetaFile>
      for (const doc of raw.docs ?? []) {
        if (doc && typeof doc.id === 'string') this.docs.set(doc.id, doc)
      }
      const cur = raw.current
      if (cur && typeof cur === 'object') {
        const restore = (state: CurrentState | undefined): CurrentState | null => {
          if (state && typeof state.docId === 'string' && this.docs.has(state.docId)) {
            return { docId: state.docId, block: typeof state.block === 'number' ? state.block : 1 }
          }
          return null
        }
        const fallback = restore(cur.fallback)
        if (fallback !== null) this.fallbackCurrent = fallback
        for (const [sessionId, state] of Object.entries(cur.sessions ?? {})) {
          const restored = restore(state)
          if (restored !== null) this.currentBySession.set(sessionId, restored)
        }
        // Legacy single-position format ({ docId, block }): migrate into the
        // session-less fallback so an upgrade keeps the reading position.
        if ('docId' in cur && !('fallback' in cur)) {
          const legacy = restore(cur as unknown as CurrentState)
          if (legacy !== null) this.fallbackCurrent = legacy
        }
      }
    } catch {
      // first run — nothing persisted yet
    }
  }

  private scheduleSave(): void {
    if (this.disposed) return
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.saveMeta().catch(() => {})
    }, SAVE_DELAY_MS)
  }

  private async saveMeta(): Promise<void> {
    const meta: MetaFile = {
      version: META_VERSION,
      docs: [...this.docs.values()],
      current: {
        fallback: this.fallbackCurrent,
        sessions: Object.fromEntries(this.currentBySession)
      }
    }
    await writeFile(join(this.root, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  }

  /** Dispose timers (used by tests). */
  dispose(): void {
    this.disposed = true
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  /** Flush pending metadata to disk immediately (used by tests). */
  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.saveMeta()
  }

  // ── registry ─────────────────────────────────────────────────────────────

  /** All registered documents, oldest first. */
  list(): DocMeta[] {
    return [...this.docs.values()].sort((a, b) => a.addedAt - b.addedAt)
  }

  get(docId: string): DocMeta | undefined {
    return this.docs.get(docId)
  }

  /** Absolute path of the stored file for one document. */
  filePath(docId: string): string {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    return join(this.docsDir, meta.fileName)
  }

  /** Absolute path of the page snapshot for one block, if any. */
  imagePath(docId: string, block: number): string | undefined {
    return this.images.get(docId)?.get(block)
  }

  /**
   * Register an uploaded file: persist the bytes and make it the current
   * document of the given session (or the fallback position) at block 1.
   * The index build starts in the background.
   */
  async registerBytes(fileName: string, kind: DocKind, bytes: Uint8Array, sessionId?: string): Promise<DocMeta> {
    const meta = this.createMeta(fileName, kind)
    await writeFile(join(this.docsDir, meta.fileName), bytes)
    this.docs.set(meta.id, meta)
    this.scheduleSave()
    this.setCurrent(meta.id, 1, sessionId)
    this.kickIndex(meta.id)
    return meta
  }

  /**
   * Register an existing file by path (doc_open): copy it into the store so
   * the reader and the tools serve one canonical location.
   */
  async registerFile(fileName: string, kind: DocKind, sourcePath: string, sessionId?: string): Promise<DocMeta> {
    const meta = this.createMeta(fileName, kind)
    await copyFile(sourcePath, join(this.docsDir, meta.fileName))
    this.docs.set(meta.id, meta)
    this.scheduleSave()
    this.setCurrent(meta.id, 1, sessionId)
    this.kickIndex(meta.id)
    return meta
  }

  private createMeta(fileName: string, kind: DocKind): DocMeta {
    const id = `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const ext = fileName.slice(fileName.lastIndexOf('.'))
    return {
      id,
      name: fileName,
      kind,
      fileName: `${id}${ext}`,
      totalBlocks: null,
      addedAt: Date.now()
    }
  }

  /** Forget a document entirely (file, index, snapshots). */
  async remove(docId: string): Promise<void> {
    const meta = this.docs.get(docId)
    if (meta === undefined) return
    this.docs.delete(docId)
    for (const [sessionId, state] of this.currentBySession) {
      if (state.docId === docId) this.currentBySession.delete(sessionId)
    }
    if (this.fallbackCurrent.docId === docId) this.fallbackCurrent = { docId: null, block: 1 }
    this.blocksByDoc.delete(docId)
    this.readySet.delete(docId)
    this.pageTextCache.delete(docId)
    this.images.delete(docId)
    this.tableCache.delete(docId)
    this.scheduleSave()
    await Promise.all([
      unlink(join(this.docsDir, meta.fileName)).catch(() => {}),
      unlink(join(this.textDir, `${docId}.json`)).catch(() => {})
    ])
  }

  // ── current position ──────────────────────────────────────────────────────

  /**
   * Set the current reading position for one session (block clamped into
   * range). Session-less callers (tests, direct probes) use the fallback
   * position instead.
   */
  setCurrent(docId: string, block: number, sessionId?: string): void {
    if (!this.docs.has(docId)) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    const total = this.docs.get(docId)!.totalBlocks ?? block
    const next: CurrentState = { docId, block: clampIndex(block, total) }
    if (sessionId !== undefined && sessionId !== '') {
      this.currentBySession.set(sessionId, next)
      if (this.currentBySession.size > MAX_SESSION_STATES) {
        const oldest = this.currentBySession.keys().next().value
        if (oldest !== undefined) this.currentBySession.delete(oldest)
      }
    } else {
      this.fallbackCurrent = next
    }
    this.scheduleSave()
  }

  /** The reading position of one session (null state when unset). */
  currentState(sessionId?: string): CurrentState {
    if (sessionId !== undefined && sessionId !== '') {
      return this.currentBySession.get(sessionId) ?? { docId: null, block: 1 }
    }
    return this.fallbackCurrent
  }

  /** Clear the reading position of one session (docs stay in the library). */
  close(sessionId?: string): void {
    if (sessionId !== undefined && sessionId !== '') {
      this.currentBySession.delete(sessionId)
    } else {
      this.fallbackCurrent = { docId: null, block: 1 }
    }
    this.scheduleSave()
  }

  // ── block access ─────────────────────────────────────────────────────────

  /** Whether the full index (all block texts) is ready for one document. */
  isReady(docId: string): boolean {
    return this.readySet.has(docId)
  }

  /**
   * Fast path: the text and locator of one block. For PDFs a single page is
   * extracted on demand (the full index keeps building in the background);
   * other kinds fall back to the (fast) full build.
   */
  async blockText(docId: string, block: number, signal?: AbortSignal): Promise<BlockText> {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    if (meta.kind === 'pdf') {
      this.kickIndex(docId)
      const cache = this.pageTextFor(docId)
      let text = cache.get(block)
      if (text === undefined) {
        const handle = await openPdf(docId, await readFile(this.filePath(docId)))
        const total = handle.numPages
        if (meta.totalBlocks !== total) {
          meta.totalBlocks = total
          this.scheduleSave()
        }
        if (block < 1 || block > total) {
          throw new DocStoreError(`doc_companion: block ${block} out of range (1..${total})`, 'BLOCK_OUT_OF_RANGE')
        }
        text = await handle.pageText(block, signal)
        cache.set(block, text)
      }
      return { index: block, locator: pageLocator(block), text }
    }
    const blocks = await this.blocksFor(docId, signal)
    const found = blocks[block - 1]
    if (found === undefined) {
      throw new DocStoreError(`doc_companion: block ${block} out of range (1..${blocks.length})`, 'BLOCK_OUT_OF_RANGE')
    }
    return found
  }

  /**
   * Full index: every block text of the document, in block order. Non-PDF
   * kinds build synchronously (fast); PDFs extract page by page and the
   * result is cached on disk. Callers should pass the exec signal so a
   * long PDF build can be aborted.
   */
  async blocksFor(docId: string, signal?: AbortSignal): Promise<BlockText[]> {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    let promise = this.blocksByDoc.get(docId)
    if (promise === undefined) promise = this.buildBlocks(docId)
    const blocks = await promise
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return blocks
  }

  /** Start the full index build without awaiting it (PDF fast-path helper). */
  kickIndex(docId: string): void {
    if (this.disposed) return
    const meta = this.docs.get(docId)
    if (meta === undefined || this.blocksByDoc.has(docId) || this.readySet.has(docId)) return
    const promise = this.buildBlocks(docId)
    this.blocksByDoc.set(docId, promise)
    promise.then(() => {
      if (!this.disposed) this.readySet.add(docId)
    }).catch((error) => {
      this.blocksByDoc.delete(docId)
      if (!this.disposed) console.warn(`[dsh-plugin-doc-companion] index build failed for ${docId}:`, error)
    })
  }

  private async buildBlocks(docId: string): Promise<BlockText[]> {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    const sidecar = await this.tryReadSidecar(docId)
    if (sidecar !== null) {
      meta.totalBlocks = sidecar.length
      if (meta.kind === 'pdf') this.checkTextLayerHealth(meta, sidecar)
      this.scheduleSave()
      return sidecar
    }

    const filePath = this.filePath(docId)
    let blocks: BlockText[]
    switch (meta.kind) {
      case 'pdf': {
        const handle = await openPdf(docId, await readFile(filePath))
        meta.totalBlocks = handle.numPages
        this.scheduleSave()
        const cache = this.pageTextFor(docId)
        blocks = []
        for (let page = 1; page <= handle.numPages; page += 1) {
          let text = cache.get(page)
          if (text === undefined) {
            text = await handle.pageText(page)
            cache.set(page, text)
          }
          blocks.push({ index: page, locator: pageLocator(page), text })
        }
        break
      }
      case 'text': {
        const text = await readFile(filePath, 'utf8')
        const chunks = chunkText(text, this.opts.textBlockChars)
        const totalChars = chunkTotalChars(chunks, this.opts.textBlockChars)
        blocks = chunks.map((chunk, i) => ({
          index: i + 1,
          locator: textBlockLocator(i + 1, this.opts.textBlockChars, totalChars),
          text: chunk
        }))
        break
      }
      case 'docx': {
        const paragraphs = await extractDocxParagraphs(await readFile(filePath))
        const groups = groupBy(paragraphs, this.opts.maxParagraphsPerBlock)
        blocks = groups.map((group, i) => {
          const first = i * this.opts.maxParagraphsPerBlock + 1
          const last = first + group.length - 1
          return { index: i + 1, locator: paragraphBlockLocator(first, last), text: group.join('\n') }
        })
        break
      }
      case 'xlsx': {
        const sheets = await extractXlsxSheets(await readFile(filePath))
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last))
        break
      }
      case 'csv': {
        const rows = parseCsv(await readFile(filePath, 'utf8'))
        const sheets: SheetTable[] = [{ sheetName: '', rows }]
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last))
        break
      }
    }

    if (this.disposed) return blocks
    meta.totalBlocks = blocks.length
    if (meta.kind === 'pdf') this.checkTextLayerHealth(meta, blocks)
    this.scheduleSave()
    await this.writeSidecar(docId, blocks)
    return blocks
  }

  /**
   * Whole-document glyph-mapping health check for PDFs: when the text layer
   * is broken (see detectBrokenTextLayer), the flag is persisted on the meta
   * so every page is served through the vision transcription path and search
   * is reported as unavailable instead of returning garbage hits.
   */
  private checkTextLayerHealth(meta: DocMeta, blocks: BlockText[]): void {
    const broken = detectBrokenTextLayer(blocks)
    if (broken !== meta.textLayerBroken) {
      meta.textLayerBroken = broken
      this.scheduleSave()
    }
  }

  private sheetBlocks(
    sheets: readonly SheetTable[],
    locator: (sheetName: string, first: number, last: number) => string
  ): BlockText[] {
    const blocks: BlockText[] = []
    let index = 1
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock)
      for (const group of groups) {
        const first = this.rowOffsetOf(sheet.rows, group)
        const last = first + group.length - 1
        blocks.push({
          index,
          locator: locator(sheet.sheetName, first, last),
          text: group.map((row) => row.join('\t')).join('\n')
        })
        index += 1
      }
    }
    return blocks
  }

  private rowOffsetOf(rows: readonly string[][], group: readonly string[][]): number {
    // Groups are contiguous slices of `rows`; find the slice start by identity.
    const idx = rows.indexOf(group[0]!)
    return idx < 0 ? 1 : idx + 1
  }

  /**
   * The table-shaped view of one block (xlsx/csv rendering). Returns the
   * header cells plus the data rows of the requested block.
   */
  async tableBlock(docId: string, block: number, signal?: AbortSignal): Promise<TableBlock> {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    if (meta.kind !== 'xlsx' && meta.kind !== 'csv') {
      throw new DocStoreError(`doc_companion: "${meta.name}" has no table view`, 'NOT_A_TABLE')
    }
    const cached = this.tableCache.get(docId)
    if (cached !== undefined && cached.index === block) return cached

    const filePath = this.filePath(docId)
    const sheets: SheetTable[] = meta.kind === 'xlsx'
      ? await extractXlsxSheets(await readFile(filePath))
      : [{ sheetName: '', rows: parseCsv(await readFile(filePath, 'utf8')) }]

    let index = 1
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock)
      for (const group of groups) {
        if (index === block) {
          const firstRow = this.rowOffsetOf(sheet.rows, group)
          const columns = group[0] ?? []
          const rows = group.slice(1)
          const table: TableBlock = { index, sheet: sheet.sheetName, firstRow, columns, rows }
          this.tableCache.set(docId, table)
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
          return table
        }
        index += 1
      }
    }
    throw new DocStoreError(`doc_companion: block ${block} out of range`, 'BLOCK_OUT_OF_RANGE')
  }

  // ── scanned-page snapshots ───────────────────────────────────────────────

  /** Record a page snapshot saved by the reader panel. */
  setBlockImage(docId: string, block: number, path: string): void {
    let map = this.images.get(docId)
    if (map === undefined) {
      map = new Map()
      this.images.set(docId, map)
    }
    map.set(block, path)
  }

  /** Persist a page snapshot (PNG bytes) and register it for one block. */
  async saveBlockImage(docId: string, block: number, bytes: Uint8Array): Promise<string> {
    const meta = this.docs.get(docId)
    if (meta === undefined) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, 'DOC_NOT_FOUND')
    const path = join(this.imageDir, `${docId}-b${block}.png`)
    await writeFile(path, bytes)
    this.setBlockImage(docId, block, path)
    return path
  }

  /** Cache an extracted/transcribed block text (scanned-page results). */
  cacheBlockText(docId: string, block: number, text: string): void {
    this.pageTextFor(docId).set(block, text)
  }

  /**
   * Transcription cache for PDF pages (vision-first reading): maps
   * `docId:block` to the vision-transcribed text. In-memory only — a restart
   * re-transcribes on first access, exactly like the page-text cache.
   */
  private readonly transcribedPages = new Map<string, string>()

  /** The vision-transcribed text of a PDF page, or undefined when not yet done. */
  transcribedText(docId: string, block: number): string | undefined {
    return this.transcribedPages.get(`${docId}:${block}`)
  }

  /** Record a successful vision transcription (also feeds the page-text cache). */
  markTranscribed(docId: string, block: number, text: string): void {
    this.transcribedPages.set(`${docId}:${block}`, text)
    this.pageTextFor(docId).set(block, text)
  }

  /**
   * Ensure a page snapshot exists for one block, rendering it HOST-SIDE when
   * the reader panel never showed the page (pdf.js + @napi-rs/canvas). This
   * is the background path: the agent can read any page through the vision
   * model without the user navigating there.
   * @returns the snapshot path, or undefined when unavailable/failed.
   */
  async ensurePageImage(docId: string, block: number): Promise<string | undefined> {
    const existing = this.imagePath(docId, block)
    if (existing !== undefined) return existing
    const meta = this.docs.get(docId)
    if (meta === undefined || meta.kind !== 'pdf') return undefined
    const filePath = this.filePath(docId)
    try {
      const bytes = await readFile(filePath)
      const png = await renderPdfPagePng(docId, new Uint8Array(bytes), block)
      if (png === null) return undefined
      return await this.saveBlockImage(docId, block, png)
    } catch (error) {
      console.warn(`[dsh-plugin-doc-companion] ensurePageImage failed (${docId} p${block}):`,
        error instanceof Error ? error.message : error)
      return undefined
    }
  }

  // ── caches & sidecars ────────────────────────────────────────────────────

  private pageTextFor(docId: string): Map<number, string> {
    let map = this.pageTextCache.get(docId)
    if (map === undefined) {
      map = new Map()
      this.pageTextCache.set(docId, map)
    }
    return map
  }

  private async tryReadSidecar(docId: string): Promise<BlockText[] | null> {
    const path = join(this.textDir, `${docId}.json`)
    if (!existsSync(path)) return null
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (!Array.isArray(raw)) return null
      const blocks: BlockText[] = raw.filter((b): b is BlockText =>
        typeof b === 'object' && b !== null &&
        typeof (b as BlockText).index === 'number' &&
        typeof (b as BlockText).locator === 'string' &&
        typeof (b as BlockText).text === 'string')
      return blocks.length > 0 ? blocks : null
    } catch {
      return null
    }
  }

  private async writeSidecar(docId: string, blocks: BlockText[]): Promise<void> {
    if (this.disposed) return
    const path = join(this.textDir, `${docId}.json`)
    await writeFile(path, JSON.stringify(blocks), 'utf8')
  }
}
