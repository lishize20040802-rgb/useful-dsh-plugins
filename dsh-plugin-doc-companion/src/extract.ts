// dsh-plugin-doc-companion — document text extraction (host side).
//
// One extraction path per kind, all pure-ish (I/O in, text out):
//   - PDF:  pdfjs-dist legacy build, per-page getTextContent (no DOM needed).
//   - DOCX: mammoth extractRawText → paragraph list.
//   - XLSX: SheetJS read → per-sheet row matrices.
//   - CSV:  a small self-contained parser (quoted fields, doubled quotes).
// Text kinds are chunked by src/blocks.ts, so only paragraphs/rows matter here.
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { normalizeWhitespace } from './blocks.js'

/** True when a Uint8Array is actually a Node Buffer (pdf.js rejects those). */
function isNodeBuffer(value: Uint8Array): boolean {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value)
}

// ── PDF ────────────────────────────────────────────────────────────────────

/** A live PDF document with per-page text access. */
export interface PdfHandle {
  /** Total page count (1-based page numbers = block indexes). */
  numPages: number
  /** Extract the plain text of one page. */
  pageText(page: number, signal?: AbortSignal): Promise<string>
  /** Release the underlying PDFDocumentProxy. */
  dispose(): void
}

/** Recently opened PDFs, keyed by document id (LRU by insertion order). */
const pdfCache = new Map<string, Promise<PdfHandle>>()

const MAX_CACHED_PDFS = 3

/**
 * Open a PDF from raw bytes and return a handle. The handle promise is cached
 * per document id so the reader panel, the tools and the index builder share
 * one parse; the oldest entry is evicted when the cache overflows.
 * @param docId - document id (cache key).
 * @param data - raw PDF bytes.
 * @returns a cached or fresh handle promise.
 */
export function openPdf(docId: string, data: Uint8Array): Promise<PdfHandle> {
  const cached = pdfCache.get(docId)
  if (cached !== undefined) return cached
  // pdf.js rejects Node Buffers explicitly; copy into a plain Uint8Array.
  const bytes = data instanceof Uint8Array && !isNodeBuffer(data)
    ? data
    : Uint8Array.from(data)
  const promise = (async () => {
    const doc: PDFDocumentProxy = await getDocument({ data: bytes, useSystemFonts: true }).promise
    const handle: PdfHandle = {
      numPages: doc.numPages,
      async pageText(page, signal) {
        const pdfPage = await doc.getPage(page)
        const content = await pdfPage.getTextContent({ disableNormalization: false })
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
        return joinTextItems(content.items)
      },
      dispose() {
        void doc.destroy()
      }
    }
    return handle
  })()
  pdfCache.set(docId, promise)
  promise.then((handle) => {
    if (pdfCache.size > MAX_CACHED_PDFS) {
      const oldest = pdfCache.keys().next().value
      if (oldest !== undefined && oldest !== docId) {
        pdfCache.delete(oldest)
        void pdfCache.get(oldest)?.then((h) => h.dispose()).catch(() => {})
      }
    }
  }).catch(() => {})
  return promise
}

/**
 * Join pdf.js text-content items into a readable paragraph-ish string.
 * Item order is visual order; `hasEOL` marks line ends.
 */
export function joinTextItems(items: readonly unknown[]): string {
  let out = ''
  for (const raw of items) {
    const item = raw as { str?: unknown; hasEOL?: unknown }
    if (typeof item.str !== 'string') continue
    out += item.str
    out += item.hasEOL ? '\n' : ' '
  }
  return normalizeWhitespace(out)
}

// ── DOCX ───────────────────────────────────────────────────────────────────

/**
 * Extract the paragraph list of a DOCX file. Paragraph boundaries are the
 * document's real line breaks (mammoth raw text), so block locators stay
 * meaningful for the reader and for search.
 * @param bytes - raw DOCX bytes.
 * @returns one trimmed non-empty string per paragraph.
 */
export async function extractDocxParagraphs(bytes: Uint8Array): Promise<string[]> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  const paragraphs = result.value
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
  return paragraphs.length > 0 ? paragraphs : ['（文档没有可提取的文字）']
}

// ── XLSX ───────────────────────────────────────────────────────────────────

/** One worksheet with its raw row matrix. */
export interface SheetTable {
  /** Sheet name ('' when unnamed). */
  sheetName: string
  /** One entry per row; cells are always strings. */
  rows: string[][]
}

/**
 * Extract every worksheet of an XLSX workbook as string row matrices.
 * @param bytes - raw XLSX bytes.
 * @returns one SheetTable per sheet, in workbook order.
 */
export async function extractXlsxSheets(bytes: Uint8Array): Promise<SheetTable[]> {
  const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellDates: false })
  const out: SheetTable[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (sheet === undefined) continue
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
    const rows = raw.map((row) => (Array.isArray(row) ? row : []).map(cellToString))
    out.push({ sheetName, rows })
  }
  return out
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'number') return Object.is(cell, -0) ? '0' : String(cell)
  return String(cell)
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into a row matrix. Handles quoted fields containing commas,
 * newlines and doubled quotes; CRLF is normalized. Blank rows are dropped.
 * @param text - the raw CSV content.
 * @returns one entry per row; cells are trimmed strings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0))
}
