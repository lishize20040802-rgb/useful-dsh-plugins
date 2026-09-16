// dsh-plugin-doc-companion — host half (cordis plugin).
//
// The reading panel's counterpart: a document store plus
//   - HTTP routes under /api/doc (upload, file bytes, block text, table
//     blocks, position sync, scanned-page snapshots, state polling) and
//     /doc-static (pdf.js assets served from the plugin's node_modules),
//   - the doc_* tool family the model uses to follow along (doc_current /
//     doc_page / doc_goto / doc_search / doc_open / doc_close / doc_list),
//   - a system-prompt section teaching the study-companion behavior.
//
// All configurable values live in the schemastery Config (no hardcoded
// machine paths); storage defaults to $DSH_HOME/ebooks.
import { createRequire } from 'node:module'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { expandHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type * as WebServerModule from '@deepseek-ai/dsh-host-webserver'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  detectKind,
  sanitizeFileName,
  safeJoin,
  type DocKind
} from './blocks.js'
import { DocumentStore, DocStoreError, type DocMeta } from './store.js'
import { searchBlocks, type SearchHit } from './search.js'
import { transcribeImage, TRANSCRIBE_INSTRUCTION, type VisionLlm, type VisionAttachments } from './vision.js'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'doc-companion'

/** Services required by the host half. */
export const inject = ['tools', 'systemPrompt', 'webServer']

/** Minimal llm service face (structural subset of the host service). */
export interface LlmFace {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Validated configuration shape (schema output contract). */
export interface DocCompanionConfig {
  /** Storage root; empty resolves to $DSH_HOME/ebooks. */
  storageDir: string
  /** Upload body cap in bytes. */
  maxBytes: number
  /** Scanned-page snapshot cap in bytes. */
  maxImageBytes: number
  /** Target characters per text block (TXT/MD). */
  textBlockChars: number
  /** Paragraphs per DOCX block. */
  maxParagraphsPerBlock: number
  /** Rows per XLSX/CSV block. */
  maxRowsPerBlock: number
  /** Transcribe scanned pages through the vision model automatically. */
  autoTranscribeScanned: boolean
  /** Vision provider route (same key as the main model). */
  visionProvider: string
  /** Vision model id on that provider. */
  visionModel: string
  /** Default hit cap for doc_search. */
  searchMaxHits: number
}

export const Config: Schema<DocCompanionConfig> = Schema.object({
  storageDir: Schema.string().default(''),
  maxBytes: Schema.natural().default(256 * 1024 * 1024),
  maxImageBytes: Schema.natural().default(20 * 1024 * 1024),
  textBlockChars: Schema.natural().default(2600),
  maxParagraphsPerBlock: Schema.natural().default(40),
  maxRowsPerBlock: Schema.natural().default(50),
  autoTranscribeScanned: Schema.boolean().default(true),
  visionProvider: Schema.string().default('deepseek-official'),
  visionModel: Schema.string().default('deepseek-v4-flash-vision-exp'),
  searchMaxHits: Schema.natural().default(5)
})

/** Normalize and validate the plugin configuration. */
export function normalizeConfig(raw: unknown): DocCompanionConfig {
  const config = (raw ?? {}) as Partial<DocCompanionConfig>
  return {
    storageDir: typeof config.storageDir === 'string' ? config.storageDir.trim() : '',
    maxBytes: typeof config.maxBytes === 'number' && config.maxBytes > 0 ? config.maxBytes : 256 * 1024 * 1024,
    maxImageBytes: typeof config.maxImageBytes === 'number' && config.maxImageBytes > 0 ? config.maxImageBytes : 20 * 1024 * 1024,
    textBlockChars: typeof config.textBlockChars === 'number' && config.textBlockChars > 0 ? config.textBlockChars : 2600,
    maxParagraphsPerBlock: typeof config.maxParagraphsPerBlock === 'number' && config.maxParagraphsPerBlock > 0 ? config.maxParagraphsPerBlock : 40,
    maxRowsPerBlock: typeof config.maxRowsPerBlock === 'number' && config.maxRowsPerBlock > 0 ? config.maxRowsPerBlock : 50,
    autoTranscribeScanned: config.autoTranscribeScanned !== false,
    visionProvider: typeof config.visionProvider === 'string' && config.visionProvider.trim() ? config.visionProvider.trim() : 'deepseek-official',
    visionModel: typeof config.visionModel === 'string' && config.visionModel.trim() ? config.visionModel.trim() : 'deepseek-v4-flash-vision-exp',
    searchMaxHits: typeof config.searchMaxHits === 'number' && config.searchMaxHits > 0 ? config.searchMaxHits : 5
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

/** Loopback + same-origin trust fence for the custom /api/doc routes. */
function isTrustedRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? ''
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/** Read the whole request body with a byte cap (413 beyond it). */
async function readBody(req: IncomingMessage, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > cap) throw new HttpError(413, 'body too large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

/** Small HTTP error carrying a status code. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

/** Stream a file with a mime type derived from its extension. */
function sendFile(res: ServerResponse, path: string, mime: string): void {
  const size = statSync(path).size
  res.writeHead(200, {
    'content-type': mime,
    'content-length': size,
    'cache-control': 'public, max-age=3600'
  })
  createReadStream(path).pipe(res)
}

const MIME_BY_EXT: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
}

function mimeOf(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** Root of the plugin's own pdfjs-dist installation (static asset base). */
const requireFromPlugin = createRequire(import.meta.url)
let pdfjsRootCache: string | null = null
function pdfjsRoot(): string {
  if (pdfjsRootCache === null) {
    pdfjsRootCache = dirname(requireFromPlugin.resolve('pdfjs-dist/package.json'))
  }
  return pdfjsRootCache
}

// ── tool value types ───────────────────────────────────────────────────────

interface DocInfoValue {
  id: string
  name: string
  kind: DocKind
  /** 1-based block count; omitted until the index is built. */
  total_blocks?: number
  /** PDFs only: text layer glyph mapping is broken (vision transcription needed). */
  text_layer_broken?: boolean
}

function docInfoValue(meta: DocMeta): DocInfoValue {
  return {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    ...(meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {}),
    ...(meta.textLayerBroken === true ? { text_layer_broken: true } : {})
  }
}

/** Shared result of doc_current / doc_page. */
interface BlockReadValue {
  ok: boolean
  doc?: DocInfoValue
  block?: number
  locator?: string
  text?: string
  image_path?: string
  scanned?: boolean
  note?: string
}

const BLOCK_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    doc: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        kind: { type: 'string', required: true },
        total_blocks: { type: 'integer' },
        text_layer_broken: { type: 'boolean' }
      }
    },
    block: { type: 'integer' },
    locator: { type: 'string' },
    text: { type: 'string' },
    image_path: { type: 'string' },
    scanned: { type: 'boolean' },
    note: { type: 'string' }
  }
} as const

// ── shared block resolution ────────────────────────────────────────────────

/**
 * Resolve the text of one block for the model. Reading is VISION-FIRST:
 * every PDF page is transcribed through the vision model from a page
 * snapshot (the reader panel's, or one the host renders on demand — the
 * agent can read any page without the user navigating there). The extracted
 * text layer is only a fallback when transcription is unavailable or fails,
 * and is still what doc_search uses for fast locating. Non-PDF kinds have no
 * page concept and always use their extracted text.
 */
async function resolveBlock(
  store: DocumentStore,
  cfg: DocCompanionConfig,
  llm: (() => LlmFace | undefined) | undefined,
  attachments: (() => VisionAttachments | undefined) | undefined,
  docId: string,
  block: number,
  signal: AbortSignal | undefined
): Promise<BlockReadValue> {
  const meta = store.get(docId)!
  const isPdf = meta.kind === 'pdf'
  // Transcription cache hit → the vision result is already the page text.
  const transcribed = store.transcribedText(docId, block)
  const found = await store.blockText(docId, block, signal)
  let text = transcribed ?? found.text
  let visionRead = transcribed !== undefined
  let note: string | undefined

  if (isPdf && cfg.autoTranscribeScanned && transcribed === undefined) {
    // Vision-first: produce (or reuse) the page snapshot and transcribe.
    let snapshot = store.imagePath(docId, block)
    if (snapshot === undefined) snapshot = await store.ensurePageImage(docId, block)
    const llmFace = llm?.()
    const attachmentFace = attachments?.()
    if (snapshot !== undefined && llmFace !== undefined && attachmentFace !== undefined) {
      const result = await transcribeImage(
        llmFace,
        attachmentFace,
        { provider: cfg.visionProvider, model: cfg.visionModel },
        snapshot,
        TRANSCRIBE_INSTRUCTION,
        signal
      )
      if (result.ok) {
        text = result.text
        store.markTranscribed(docId, block, text)
        visionRead = true
      } else if (text.trim().length > 0 && meta.textLayerBroken !== true) {
        // Transcription failed but the text layer is usable — keep it, note
        // the failure so the model knows the source.
        note = `视觉转写失败（${result.error}），以下为该页文字层的提取文本。`
      } else {
        note = `视觉转写失败：${result.error}。可让用户把页面截图发给你，或用 vision 工具读取 image_path。`
      }
    } else if (snapshot === undefined) {
      note = '当前页无法生成页面快照，以下为文字层提取（若乱码请告知我截图）。'
    }
  }

  // Lossless-JSON contract: optional fields are OMITTED when unset — an
  // `undefined` property value would fail the registry's validation.
  const snapshot = store.imagePath(docId, block)
  return {
    ok: true,
    doc: docInfoValue(meta),
    block,
    locator: found.locator,
    text,
    ...(snapshot !== undefined ? { image_path: snapshot } : {}),
    ...(visionRead ? { scanned: true } : {}),
    ...(note !== undefined ? { note } : {})
  }
}

// ── plugin body ────────────────────────────────────────────────────────────

/** Resolve once when loading the plugin, independently of later cwd changes. */
export function resolveStorageDir(value = ''): string {
  return resolve(resolveDshHome(), expandHomePath(value.trim() || 'ebooks'))
}

export function apply(ctx: Context, rawConfig: unknown): void {
  const cfg = normalizeConfig(rawConfig)
  const storageDir = resolveStorageDir(cfg.storageDir)
  const store = new DocumentStore(storageDir, {
    textBlockChars: cfg.textBlockChars,
    maxParagraphsPerBlock: cfg.maxParagraphsPerBlock,
    maxRowsPerBlock: cfg.maxRowsPerBlock
  })
  let active = true
  ctx.effect(() => () => { active = false; store.dispose() }, 'doc-companion: document store')

  // Optional services (scanned-page transcription degrades without them).
  const llm = (): LlmFace | undefined => ctx.get('llm') as LlmFace | undefined
  const attachments = (): VisionAttachments | undefined => ctx.get('attachments') as VisionAttachments | undefined

  const registerTool = (tool: ReturnType<typeof defineTool>): void => {
    ctx.effect(() => ctx.tools.register(tool), `doc-companion: ${tool.name}`)
  }

  void store.init().then(() => {
    if (!active) return
    // ── routes ─────────────────────────────────────────────────────────────
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/doc',
      handler: apiHandler
    }), 'doc-companion: /api/doc')
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/doc-static',
      handler: staticHandler
    }), 'doc-companion: /doc-static')

    // ── tools ──────────────────────────────────────────────────────────────
    registerTool(docCurrentTool(store, cfg, llm, attachments))
    registerTool(docPageTool(store, cfg, llm, attachments))
    registerTool(docGotoTool(store))
    registerTool(docSearchTool(store, cfg))
    registerTool(docOpenTool(store, cfg))
    registerTool(docCloseTool(store))
    registerTool(docListTool(store))
  }).catch((error) => {
    console.error('[dsh-plugin-doc-companion] store init failed; doc tools are disabled:', error)
  })

  // ── system prompt ────────────────────────────────────────────────────────
  ctx.systemPrompt.section({
    name: 'tool:doc-companion',
    order: 97,
    text:
      '本会话由 dsh-plugin-doc-companion 提供「文档伴读」能力。用户在右侧阅读面板中打开文档（PDF / Word / Excel / CSV / TXT / MD）并翻页时，' +
      '当前块（页/块号）会自动同步：需要知道用户当前看到哪一页及内容 → doc_current；用户问「第 N 页/块」或要读特定位置 → doc_page({block})；' +
      '用户说「翻到/跳到第 N 页」→ doc_goto({block})（阅读面板同步跳转）；用户给出文件路径想打开 → doc_open({path})；文档列表 → doc_list；关闭 → doc_close。\n' +
      '阅读方式：PDF 一律采用「视觉优先」——doc_current / doc_page 返回的 PDF 页文字由页面截图经视觉模型转写（无需用户翻页，host 自动渲染任意页），' +
      '因此哪怕文本层损坏也能读到准确的公式与排版；返回里 scanned=true 表示该页为视觉转写结果，image_path 是页面快照。' +
      '需要定位内容时用 doc_search({query}) 做文字检索（快），命中后用 doc_page 视觉阅读该页。' +
      'Word/Excel/CSV/TXT 无页面概念，直接使用其提取文本。\n' +
      '引用与作答规范：\n' +
      '1. 引用文档内容时必须贴出原文片段并注明位置（如「第 12 页」「工作表「真题」第 10–29 行」「第 45–60 段」），先原文后解释；\n' +
      '2. 用户做练习会先说出自己的做法/答案：先明确判断对错并指出对在哪、错在哪，再给出正确答案与完整步骤，然后给出针对性修改意见，尽量联系原文知识点解释原理；\n' +
      '3. 检索无结果或文档文本层损坏导致检索不可用时如实说明，不要编造原文。'
  })

  // ── route bodies ─────────────────────────────────────────────────────────
  async function apiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!isTrustedRequest(req)) {
        sendText(res, 403, 'forbidden')
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean) // ['api','doc', ...]

      // POST /api/doc/upload
      if (req.method === 'POST' && parts[2] === 'upload') {
        await handleUpload(req, res, cfg, store)
        return
      }
      // GET /api/doc/list
      if (req.method === 'GET' && parts[2] === 'list') {
        sendJson(res, 200, {
          docs: store.list().map((meta) => ({ id: meta.id, name: meta.name, kind: meta.kind, total_blocks: meta.totalBlocks, added_at: meta.addedAt }))
        })
        return
      }
      // GET /api/doc/state — reader position polling (per session)
      if (req.method === 'GET' && parts[2] === 'state') {
        const sessionId = url.searchParams.get('session') ?? undefined
        const current = store.currentState(sessionId)
        const meta = current.docId !== null ? store.get(current.docId) : undefined
        sendJson(res, 200, {
          doc: meta !== undefined ? { ...docInfoValue(meta), ready: store.isReady(meta.id) } : null,
          block: current.docId !== null ? current.block : null
        })
        return
      }
      // /api/doc/docs/<id>[...]
      if (parts[2] === 'docs' && typeof parts[3] === 'string') {
        await handleDocs(req, res, store, cfg, parts, url)
        return
      }
      sendJson(res, 404, { error: 'no such route' })
    } catch (error) {
      if (error instanceof HttpError) {
        sendText(res, error.status, error.message)
        return
      }
      console.error('[dsh-plugin-doc-companion] /api/doc handler error:', error)
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function handleDocs(
    req: IncomingMessage,
    res: ServerResponse,
    store: DocumentStore,
    cfg: DocCompanionConfig,
    parts: string[],
    url: URL
  ): Promise<void> {
    const docId = parts[3]!
    const meta = store.get(docId)
    if (meta === undefined) {
      sendJson(res, 404, { error: 'unknown document' })
      return
    }
    // GET /api/doc/docs/<id> — raw file bytes (reader rendering)
    if (req.method === 'GET' && parts.length === 4) {
      const filePath = store.filePath(docId)
      if (!existsSync(filePath)) {
        sendJson(res, 404, { error: 'file missing' })
        return
      }
      sendFile(res, filePath, mimeOf(meta.fileName))
      return
    }
    // GET /api/doc/docs/<id>/blocks/<k> — one block's extracted text
    if (req.method === 'GET' && parts[4] === 'blocks' && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? '', 10)
      try {
        const found = await store.blockText(docId, block)
        sendJson(res, 200, { block: found.index, locator: found.locator, text: found.text })
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message })
        else throw error
      }
      return
    }
    // GET /api/doc/docs/<id>/block-table/<k> — table view of one block
    if (req.method === 'GET' && parts[4] === 'block-table' && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? '', 10)
      try {
        const table = await store.tableBlock(docId, block)
        sendJson(res, 200, { sheet: table.sheet, first_row: table.firstRow, columns: table.columns, rows: table.rows })
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message })
        else throw error
      }
      return
    }
    // POST /api/doc/docs/<id>/position — reader position sync (per session)
    if (req.method === 'POST' && parts[4] === 'position') {
      const body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8')) as { block?: unknown; session?: unknown }
      if (typeof body.block !== 'number' || !Number.isInteger(body.block)) {
        sendJson(res, 400, { error: 'block must be an integer' })
        return
      }
      store.setCurrent(docId, body.block, typeof body.session === 'string' ? body.session : undefined)
      sendJson(res, 200, { ok: true })
      return
    }
    // POST /api/doc/docs/<id>/block-image?block=<k> — scanned page snapshot
    if (req.method === 'POST' && parts[4] === 'block-image') {
      const block = Number.parseInt(url.searchParams.get('block') ?? '', 10)
      if (!Number.isInteger(block)) {
        sendJson(res, 400, { error: 'block query param required' })
        return
      }
      const bytes = await readBody(req, cfg.maxImageBytes)
      const imagePath = await store.saveBlockImage(docId, block, bytes)
      sendJson(res, 200, { path: imagePath })
      return
    }
    sendJson(res, 404, { error: 'no such route' })
  }

  async function staticHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean) // ['doc-static', ...]
      const first = parts[1]
      if (req.method !== 'GET' || first === undefined || !['build', 'cmaps', 'standard_fonts'].includes(first)) {
        sendText(res, 404, 'not found')
        return
      }
      const target = safeJoin(pdfjsRoot(), parts.slice(1).join('/'))
      if (target === null) {
        sendText(res, 403, 'forbidden')
        return
      }
      if (!existsSync(target) || !statSync(target).isFile()) {
        sendText(res, 404, 'not found')
        return
      }
      sendFile(res, target, mimeOf(target))
    } catch (error) {
      console.error('[dsh-plugin-doc-companion] /doc-static handler error:', error)
      sendText(res, 500, 'internal error')
    }
  }
}

// ── upload ─────────────────────────────────────────────────────────────────

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: DocCompanionConfig,
  store: DocumentStore
): Promise<void> {
  const rawNameHeader = req.headers['x-file-name']
  const rawName = typeof rawNameHeader === 'string' ? decodeURIComponent(rawNameHeader) : 'document'
  const sessionHeader = req.headers['x-session']
  const sessionId = typeof sessionHeader === 'string' && sessionHeader !== '' ? sessionHeader : undefined
  const fileName = sanitizeFileName(rawName)
  const kind = detectKind(fileName)
  if (kind === null) {
    sendJson(res, 415, { error: `unsupported file type "${extname(fileName)}" (support: PDF / DOCX / XLSX / CSV / TXT / MD)` })
    return
  }
  const bytes = await readBody(req, cfg.maxBytes)
  const meta = await store.registerBytes(fileName, kind, bytes, sessionId)
  sendJson(res, 200, {
    doc_id: meta.id,
    name: meta.name,
    kind: meta.kind,
    total_blocks: meta.totalBlocks
  })
}

// ── tools ──────────────────────────────────────────────────────────────────

/** The calling session id from a tool exec context (undefined outside agents). */
function sessionIdOf(exec: { agent?: { session?: { id?: string } } }): string | undefined {
  const id = exec.agent?.session?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

function docCurrentTool(
  store: DocumentStore,
  cfg: DocCompanionConfig,
  llm: () => LlmFace | undefined,
  attachments: () => VisionAttachments | undefined
): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_current',
    description:
      '获取用户当前阅读状态：正在读的文档、当前块号（页码/块号）、该块的全部文字与位置标签。用户问"这一页/现在看到哪/当前内容"时调用；' +
      '判断用户做题之前也建议先调用以对齐上下文。',
    parameters: {},
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderBlockRead(value as BlockReadValue) }]
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const current = store.currentState(sessionIdOf(exec))
      if (current.docId === null) {
        return {
          ok: true,
          note: '当前没有打开任何文档。用户尚未上传/打开文档时，引导用户通过阅读面板上传，或使用 doc_open 打开文件路径。'
        }
      }
      return resolveBlock(store, cfg, llm, attachments, current.docId, current.block, exec.signal)
    }
  })
}

function docPageTool(
  store: DocumentStore,
  cfg: DocCompanionConfig,
  llm: () => LlmFace | undefined,
  attachments: () => VisionAttachments | undefined
): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_page',
    description: '读取当前打开的文档中第 N 块（页）的文字与位置，不改动阅读面板的页码。用户问"第 N 页讲了什么"或需要读特定位置时调用。',
    parameters: {
      block: {
        type: 'integer',
        required: true,
        description: '要读取的块号（PDF 为页码，从 1 开始）'
      }
    },
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderBlockRead(value as BlockReadValue) }]
    },
    isConcurrencySafe: () => true,
    async execute(args: { block?: unknown }, exec) {
      const current = store.currentState(sessionIdOf(exec))
      if (current.docId === null) throw new Error('doc_page: 当前没有打开的文档（用户尚未上传/打开文档）')
      const block = typeof args.block === 'number' ? args.block : Number.NaN
      if (!Number.isInteger(block) || block < 1) throw new Error('doc_page: block 必须是正整数')
      const meta = store.get(current.docId)!
      const total = meta.totalBlocks ?? block
      if (block > total) throw new Error(`doc_page: block ${block} 超出范围（1..${total}）`)
      return resolveBlock(store, cfg, llm, attachments, current.docId, block, exec.signal)
    }
  })
}

function docGotoTool(store: DocumentStore): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_goto',
    description: '把阅读面板跳转到第 N 块（页）。用户说"翻到/跳到第 N 页"时调用；页码会实时同步到面板。',
    parameters: {
      block: {
        type: 'integer',
        required: true,
        description: '目标块号（PDF 为页码，从 1 开始）'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          doc: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              name: { type: 'string', required: true },
              kind: { type: 'string', required: true },
              total_blocks: { type: 'integer' },
              text_layer_broken: { type: 'boolean' }
            }
          },
          block: { type: 'integer', required: true },
          locator: { type: 'string', required: true }
        }
      },
      render: (_args, value) => {
        const v = value as { doc?: { name?: string }; locator?: string }
        return [{
          type: 'text',
          text: `<doc-goto>\n文档：${v.doc?.name ?? ''}\n已跳转到：${v.locator ?? ''}\n</doc-goto>`
        }]
      }
    },
    isConcurrencySafe: () => false,
    async execute(args: { block?: unknown }, exec) {
      const current = store.currentState(sessionIdOf(exec))
      if (current.docId === null) throw new Error('doc_goto: 当前没有打开的文档')
      const block = typeof args.block === 'number' ? args.block : Number.NaN
      if (!Number.isInteger(block) || block < 1) throw new Error('doc_goto: block 必须是正整数')
      const meta = store.get(current.docId)!
      const total = meta.totalBlocks
      if (total !== null && block > total) throw new Error(`doc_goto: block ${block} 超出范围（1..${total}）`)
      store.setCurrent(current.docId, block, sessionIdOf(exec))
      return {
        ok: true,
        doc: docInfoValue(meta),
        block,
        locator: meta.kind === 'pdf' ? `第 ${block} 页` : `第 ${block} 块`
      }
    }
  })
}

function docSearchTool(store: DocumentStore, cfg: DocCompanionConfig): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_search',
    description:
      '在当前打开的文档内部全文检索（块=页/段落组/行组）。问题涉及文档内部但超出当前页时调用：返回命中位置与上下文片段，' +
      '可再配合 doc_page 读取完整原文。多个词用空格分隔（全部命中才返回）。',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: '检索词，例如 "泰勒公式" 或 "极限 洛必达"'
      },
      max_hits: {
        type: 'integer',
        description: '最多返回几个命中（默认 5）'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          query: { type: 'string', required: true },
          hits: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                block: { type: 'integer', required: true },
                locator: { type: 'string', required: true },
                snippet: { type: 'string', required: true },
                matches: { type: 'integer', required: true }
              }
            }
          },
          note: { type: 'string' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderSearch(value as { query: string; hits: SearchHit[]; note?: string })
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args: { query?: unknown; max_hits?: unknown }, exec) {
      const current = store.currentState(sessionIdOf(exec))
      if (current.docId === null) throw new Error('doc_search: 当前没有打开的文档')
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (query.length === 0) throw new Error('doc_search: query 不能为空')
      const meta = store.get(current.docId)!
      const maxHits = typeof args.max_hits === 'number' && args.max_hits > 0 ? Math.floor(args.max_hits) : cfg.searchMaxHits
      const blocks = await store.blocksFor(current.docId, exec.signal)
      // An unusable text layer (a pure image scan, or one whose glyph mapping
      // is broken) yields nothing to match — searching it would return
      // meaningless hits or, worse, a false "not in the book". Be honest
      // instead (pages can still be read through the per-page vision
      // transcription of doc_current / doc_page).
      if (meta.textLayerBroken === true) {
        return {
          ok: true,
          query,
          hits: [],
          note: `「${meta.name}」没有可检索的文本层（扫描件，或字形映射损坏），全文检索不可用。你关心的页面可用 doc_page 读取（会自动截图转写），或将页面截图发给我。`
        }
      }
      const hits = searchBlocks(blocks, query, maxHits)
      const note = hits.length === 0
        ? `在「${meta.name}」中没有找到与 "${query}" 相关的内容。`
        : undefined
      // Lossless JSON: omit the optional note when there are hits.
      return { ok: true, query, hits, ...(note !== undefined ? { note } : {}) }
    }
  })
}

function docOpenTool(store: DocumentStore, cfg: DocCompanionConfig): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_open',
    description:
      '按文件路径打开一个文档（PDF / DOCX / XLSX / CSV / TXT / MD）。打开后阅读面板自动加载并跳转到第 1 块。' +
      '用户提到某个文件路径想读时调用；路径可用绝对路径或相对当前工作目录的路径。',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: '文档文件路径'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          doc: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              name: { type: 'string', required: true },
              kind: { type: 'string', required: true },
              total_blocks: { type: 'integer' },
              text_layer_broken: { type: 'boolean' }
            }
          },
          note: { type: 'string' }
        }
      },
      render: (_args, value) => {
        const doc = (value as { doc?: DocInfoValue }).doc
        return [{
          type: 'text',
          text: `<doc-open>\n已打开：${doc?.name ?? ''}（${doc?.kind ?? ''}${doc?.total_blocks != null ? ` · ${doc.total_blocks} 块` : ''}）\n</doc-open>`
        }]
      }
    },
    isConcurrencySafe: () => false,
    async execute(args: { path?: unknown }, exec) {
      const rawPath = typeof args.path === 'string' ? args.path.trim() : ''
      if (rawPath.length === 0) throw new Error('doc_open: path 不能为空')
      const cwd = exec.agent?.session?.header?.cwd
      const target = isAbsolute(rawPath) ? rawPath : cwd !== undefined ? resolve(cwd, rawPath) : resolve(rawPath)
      const kind = detectKind(target)
      if (kind === null) {
        throw new Error(`doc_open: 不支持的文件类型（支持 PDF / DOCX / XLSX / CSV / TXT / MD）: ${rawPath}`)
      }
      if (!existsSync(target)) throw new Error(`doc_open: 找不到文件 "${rawPath}"`)
      const size = statSync(target).size
      if (size > cfg.maxBytes) throw new Error(`doc_open: 文件过大（${size} 字节 > ${cfg.maxBytes}）`)
      const meta = await store.registerFile(sanitizeFileName(rawPath), kind, target, sessionIdOf(exec))
      return { ok: true, doc: docInfoValue(meta) }
    }
  })
}

function docCloseTool(store: DocumentStore): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_close',
    description: '关闭当前打开的文档（阅读面板回到空状态；文档库里的文档保留）。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true }
        }
      },
      render: () => [{ type: 'text', text: '<doc-close>已关闭当前文档</doc-close>' }]
    },
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      store.close(sessionIdOf(exec))
      return { ok: true }
    }
  })
}

function docListTool(store: DocumentStore): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'doc_list',
    description: '列出文档库里已有的文档（id、名称、类型、块数）。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          docs: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                total_blocks: { type: 'integer' },
                added_at: { type: 'integer', required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => {
        const docs = (value as { docs: DocInfoValue[] }).docs
        if (docs.length === 0) return [{ type: 'text', text: '<doc-list>（文档库为空）</doc-list>' }]
        const lines = docs.map((doc) => `- ${doc.name}（${doc.kind}${doc.total_blocks != null ? ` · ${doc.total_blocks} 块` : ''}）id=${doc.id}`)
        return [{ type: 'text', text: `<doc-list>\n${lines.join('\n')}\n</doc-list>` }]
      }
    },
    isConcurrencySafe: () => true,
    async execute() {
      return {
        ok: true,
        docs: store.list().map((meta) => ({
          id: meta.id,
          name: meta.name,
          kind: meta.kind,
          ...(meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {}),
          added_at: meta.addedAt
        }))
      }
    }
  })
}

// ── renders ────────────────────────────────────────────────────────────────

function renderBlockRead(value: BlockReadValue): string {
  const lines: string[] = []
  lines.push('<doc-block>')
  const doc = value.doc
  if (doc !== undefined) {
    lines.push(`文档：${doc.name}（${doc.kind}${doc.total_blocks != null ? ` · 共 ${doc.total_blocks} 块` : ''}）`)
  }
  if (value.locator !== undefined) lines.push(`位置：${value.locator}`)
  if (value.scanned === true) lines.push('扫描页：是（无文字层）')
  if (typeof value.text === 'string' && value.text.length > 0) {
    lines.push('<block-text>')
    lines.push(value.text)
    lines.push('</block-text>')
  }
  if (value.image_path !== undefined) lines.push(`页面快照：${value.image_path}`)
  if (value.note !== undefined) lines.push(`提示：${value.note}`)
  lines.push('</doc-block>')
  return lines.join('\n')
}

function renderSearch(value: { query: string; hits: SearchHit[]; note?: string }): string {
  const lines: string[] = []
  lines.push(`<doc-search query="${value.query}">`)
  if (value.hits.length === 0) {
    lines.push(value.note ?? '（没有命中）')
  } else {
    lines.push(`共 ${value.hits.length} 个命中：`)
    for (const hit of value.hits) {
      lines.push(`── 【${hit.locator}】──`)
      lines.push(hit.snippet)
    }
  }
  lines.push('</doc-search>')
  return lines.join('\n')
}

// Re-export the pure pieces so tests and consumers can exercise them without
// a running host (same pattern as official plugins exposing helpers).
export {
  detectKind,
  sanitizeFileName,
  makeDocId,
  safeJoin,
  clampIndex,
  chunkText,
  chunkTotalChars,
  groupBy,
  pageLocator,
  textBlockLocator,
  paragraphBlockLocator,
  rowBlockLocator,
  normalizeWhitespace,
  detectBrokenTextLayer,
  type DocKind,
  type BlockText,
  type TableBlock
} from './blocks.js'
export {
  openPdf,
  joinTextItems,
  extractDocxParagraphs,
  extractXlsxSheets,
  parseCsv,
  type PdfHandle,
  type SheetTable
} from './extract.js'
export {
  searchBlocks,
  queryTerms,
  countMatches,
  makeSnippet,
  type SearchHit
} from './search.js'
export {
  transcribeImage,
  TRANSCRIBE_INSTRUCTION,
  type VisionLlm,
  type VisionAttachments
} from './vision.js'
export {
  renderPdfPagePng
} from './render.js'
export {
  DocumentStore,
  DocStoreError,
  type DocMeta,
  type CurrentState,
  type StoreOptions
} from './store.js'
