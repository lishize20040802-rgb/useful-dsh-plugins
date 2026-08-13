// Pure document parsing, line windowing and result rendering for the
// read_document tool. No harness services in this module: every function is
// unit-testable without a running dsh process.
import { extname } from 'node:path'
// pdf-parse's root index.js waits on stdin when imported outside CJS require;
// importing the lib subpath directly avoids that trap.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export const FORMAT_BY_EXTENSION = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx'
}

export const SUPPORTED_FORMATS = new Set(['text', 'pdf', 'docx', 'xlsx'])

/** Default and maximum characters kept per output line. */
export const MAX_LINE_LENGTH = 2000

/**
 * Detect the document format from a path's file extension.
 * @param {string} filePath
 * @returns {'pdf'|'docx'|'xlsx'|'text'}
 */
export function detectFormat(filePath) {
  const ext = extname(filePath).toLowerCase()
  return FORMAT_BY_EXTENSION[ext] ?? 'text'
}

/**
 * Decode UTF-8 text, rejecting binary content so the model never sees garbage.
 * @param {Buffer} bytes
 * @returns {string}
 */
export function parseText(bytes) {
  const head = bytes.subarray(0, 8000)
  if (head.includes(0)) {
    throw new Error('file looks binary (contains NUL bytes); read_document handles text, PDF, DOCX and XLSX files')
  }
  return bytes.toString('utf8').replace(/^\uFEFF/, '')
}

/**
 * Extract raw text from a PDF buffer.
 * @param {Buffer} bytes
 * @returns {Promise<string>}
 */
export async function parsePdf(bytes) {
  const data = await pdfParse(bytes)
  return String(data.text ?? '')
}

/**
 * Extract raw text from a DOCX buffer.
 * @param {Buffer} bytes
 * @returns {Promise<string>}
 */
export async function parseDocx(bytes) {
  const result = await mammoth.extractRawText({ buffer: bytes })
  return result.value ?? ''
}

/**
 * Serialize an XLSX workbook to TSV-ish text, one section per sheet.
 * @param {Buffer} bytes
 * @param {number} rowLimit - rows kept per sheet
 * @returns {string}
 */
export function parseXlsx(bytes, rowLimit) {
  const wb = XLSX.read(bytes, { type: 'buffer' })
  const parts = []
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false })
    parts.push(`# sheet: ${name}`)
    for (const row of rows.slice(0, rowLimit)) {
      parts.push(row.map(cell => cell == null ? '' : String(cell)).join('\t'))
    }
    if (rows.length > rowLimit) {
      parts.push(`... (${rows.length - rowLimit} more rows in this sheet)`)
    }
  }
  return parts.join('\n')
}

/**
 * Parse a document buffer into text, dispatching on format.
 * @param {Buffer} bytes
 * @param {'pdf'|'docx'|'xlsx'|'text'} format
 * @param {{ sheetRowLimit: number }} options
 * @returns {Promise<string>}
 */
export async function parseDocument(bytes, format, { sheetRowLimit }) {
  switch (format) {
    case 'text': return parseText(bytes)
    case 'pdf': return await parsePdf(bytes)
    case 'docx': return await parseDocx(bytes)
    case 'xlsx': return parseXlsx(bytes, sheetRowLimit)
    default: throw new Error(`unsupported format "${format}"`)
  }
}

/**
 * Apply the built-in read tool's windowing semantics to extracted text:
 * 1-based line numbering, strip a single trailing empty line, cap line length.
 * @param {string} text
 * @param {number} offset - 1-based first line
 * @param {number} limit - maximum lines returned
 * @param {number} maxLineLength
 * @returns {{ lines: Array<{number: number, text: string}>, totalLines: number }}
 */
export function windowLines(text, offset, limit, maxLineLength = MAX_LINE_LENGTH) {
  let lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  lines = lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line)
  const totalLines = lines.length
  if (offset > totalLines && !(totalLines === 0 && offset === 1)) {
    throw new Error(`offset ${offset} is out of range (file has ${totalLines} lines)`)
  }
  const window = lines.slice(offset - 1, offset - 1 + limit).map((text, i) => ({
    number: offset + i,
    text: text.length > maxLineLength
      ? `${text.substring(0, maxLineLength)}... (line truncated to ${maxLineLength} chars)`
      : text
  }))
  return { lines: window, totalLines }
}

/**
 * Render a windowed document outcome as the OpenCode-style model envelope.
 * @param {string} path
 * @param {string} type
 * @param {{ offset: number, lines: Array<{number: number, text: string}>, totalLines: number }} outcome
 * @returns {string}
 */
export function renderEnvelope(path, type, outcome) {
  const endLine = outcome.lines.length > 0
    ? outcome.lines[outcome.lines.length - 1].number
    : Math.max(0, outcome.offset - 1)
  let footer
  if (endLine < outcome.totalLines) {
    footer = `(Showing lines ${outcome.offset}-${endLine} of ${outcome.totalLines}. Use offset=${endLine + 1} to continue.)`
  } else {
    footer = `(End of file - total ${outcome.totalLines} lines)`
  }
  const body = outcome.lines.length > 0
    ? `${outcome.lines.map(line => `${line.number}: ${line.text}`).join('\n')}\n\n${footer}`
    : footer
  return `<path>${path}</path>\n<type>${type}</type>\n<content>\n${body}\n</content>`
}
