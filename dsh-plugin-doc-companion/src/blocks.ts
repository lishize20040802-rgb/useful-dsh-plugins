// dsh-plugin-doc-companion — document-model primitives (pure, unit-testable).
//
// Everything here is free of I/O and cordis: kind detection, name
// sanitization, block chunking, human locator labels, and path safety. The
// "block" is the shared unit between the reader panel and the agent tools —
// PDF pages, text slices, paragraph groups and spreadsheet row groups all map
// onto one 1-based block space.
import { basename, extname, resolve, sep } from 'node:path'

/** Document kinds the companion can open. */
export type DocKind = 'pdf' | 'text' | 'docx' | 'xlsx' | 'csv'

/** One block of a document: 1-based index, human locator, extracted text. */
export interface BlockText {
  /** 1-based block index (PDF page numbers live in the same space). */
  index: number
  /** Human locator label, e.g. "第 12 页" or "工作表「真题」第 10–29 行". */
  locator: string
  /** Extracted plain text of this block ('' for scanned PDF pages). */
  text: string
}

/** A spreadsheet block: one sheet, a row range, and its cells. */
export interface TableBlock {
  /** 1-based block index. */
  index: number
  /** Sheet name the rows come from. */
  sheet: string
  /** 1-based first row of this block in the sheet ('' header row included). */
  firstRow: number
  /** Header cells (first row of the block). */
  columns: string[]
  /** Data cells, one row per entry. */
  rows: string[][]
}

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.text'])

/**
 * Map a file name onto a supported document kind.
 * @param fileName - the original file name (any path separators tolerated).
 * @returns the kind, or `null` when the extension is unsupported.
 */
export function detectKind(fileName: string): DocKind | null {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.xlsx') return 'xlsx'
  if (ext === '.csv') return 'csv'
  if (TEXT_EXTS.has(ext)) return 'text'
  return null
}

/**
 * Sanitize an uploaded file name for display and storage: keep the basename,
 * strip path separators and control characters, trim trailing dots/spaces.
 * @param name - the raw name as supplied by the client.
 * @returns a display-safe file name, never empty.
 */
export function sanitizeFileName(name: string): string {
  const base = basename(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim()
  return base || 'document'
}

/** Create a short unique document id (timestamp base36 + random suffix). */
export function makeDocId(): string {
  return `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Clamp a 1-based index into [1, total], tolerating NaN and negatives. */
export function clampIndex(n: number, total: number): number {
  if (!Number.isInteger(n) || n < 1) return 1
  return Math.min(n, Math.max(total, 1))
}

/**
 * Split a long text into fixed-size blocks. Boundaries are pure character
 * slices so the browser and the host always agree on the block space.
 * @param text - the full document text.
 * @param blockChars - target characters per block (floored at 100).
 * @returns one string per block; a single empty string for empty input.
 */
export function chunkText(text: string, blockChars: number): string[] {
  const chars = Math.max(blockChars, 100)
  const out: string[] = []
  for (let i = 0; i < text.length; i += chars) out.push(text.slice(i, i + chars))
  return out.length > 0 ? out : ['']
}

/** Total characters covered by a chunkText result. */
export function chunkTotalChars(chunks: readonly string[], blockChars: number): number {
  if (chunks.length === 0) return 0
  return (chunks.length - 1) * Math.max(blockChars, 100) + chunks[chunks.length - 1]!.length
}

/**
 * Group an array into fixed-size slices (used for paragraphs and rows).
 * @param items - the flat item array (paragraphs or row arrays).
 * @param perBlock - items per block (floored at 1).
 * @returns one group per block; a single empty group for an empty input.
 */
export function groupBy<T>(items: readonly T[], perBlock: number): T[][] {
  const per = Math.max(perBlock, 1)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out.length > 0 ? out : [[]]
}

/** Locator for one PDF page. */
export function pageLocator(n: number): string {
  return `第 ${n} 页`
}

/** Locator for one fixed-size text block. */
export function textBlockLocator(index1: number, blockChars: number, totalChars: number): string {
  const start = (index1 - 1) * Math.max(blockChars, 100) + 1
  const end = Math.min(index1 * Math.max(blockChars, 100), Math.max(totalChars, 1))
  return `第 ${index1} 块（字符 ${start}–${end}）`
}

/** Locator for one paragraph-group block. */
export function paragraphBlockLocator(first: number, last: number): string {
  return first === last ? `第 ${first} 段` : `第 ${first}–${last} 段`
}

/** Locator for one row-group block. */
export function rowBlockLocator(sheet: string, first: number, last: number): string {
  const base = first === last ? `第 ${first} 行` : `第 ${first}–${last} 行`
  return sheet ? `工作表「${sheet}」${base}` : base
}

/**
 * Resolve a relative path inside a root, rejecting any traversal outside it.
 * @param root - the absolute serving root.
 * @param rel - the raw relative path from the request URL.
 * @returns the absolute safe target, or `null` when the path escapes the root.
 */
export function safeJoin(root: string, rel: string): string | null {
  const clean = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  const target = resolve(root, ...clean.split('/'))
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

/** Normalize extracted text: collapse spaces, trim line whitespace. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Whole-document health check: can the extracted text layer be trusted for
 * searching? Two shapes of "no" are caught here, and both must be, because
 * doc_search treats an unsearchable document differently from one that simply
 * has no match:
 *
 *   1. A pure image scan — every page extracts to '' (no text layer at all).
 *      Judged on the whole document, not a sample: a scan of any page count
 *      gets flagged, not just books long enough to sample.
 *   2. A text layer whose glyph mapping is broken. Per-page noise varies (some
 *      pages 5%, some 30%), so a per-page heuristic alone would miss pages —
 *      instead sample the whole book: a document that is essentially free of
 *      CJK while carrying a meaningful share of Latin-1/Latin-Extended noise
 *      almost certainly has a broken glyph mapping (a genuine English book is
 *      pure ASCII; genuine CJK text keeps its CJK ratio).
 *
 * Reading is vision-first anyway, so the flag exists to keep doc_search
 * honest (a text layer like the above cannot be searched).
 * @param blocks - the document's extracted block texts.
 * @returns whether the whole text layer is unusable for search.
 */
export function detectBrokenTextLayer(blocks: readonly BlockText[]): boolean {
  if (blocks.length > 0 && blocks.every((b) => b.text.trim().length === 0)) return true

  const samples = blocks.filter((b) => b.text.length >= 20)
  if (samples.length < 5) return false
  let cjk = 0
  let noise = 0
  let total = 0
  for (const block of samples) {
    for (const ch of block.text) {
      const code = ch.codePointAt(0) ?? 0
      total += 1
      if (code >= 0x4e00 && code <= 0x9fff) cjk += 1
      else if ((code >= 0x80 && code <= 0x2ff) || (code >= 0x1e00 && code <= 0x1eff)) noise += 1
    }
  }
  if (total === 0) return false
  return cjk / total < 0.02 && noise / total > 0.05
}
