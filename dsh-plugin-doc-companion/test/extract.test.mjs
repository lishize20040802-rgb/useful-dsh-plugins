// dsh-plugin-doc-companion — extraction smoke tests against real fixtures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  openPdf,
  joinTextItems,
  extractDocxParagraphs,
  extractXlsxSheets,
  parseCsv
} from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')

test('pdf extraction returns page text for a real PDF', async () => {
  const bytes = await readFile(join(fixtures, 'demo.pdf'))
  const handle = await openPdf('test-pdf', bytes)
  assert.ok(handle.numPages >= 1)
  const text = await handle.pageText(1)
  assert.ok(text.length > 0, 'page 1 should contain extractable text')
  handle.dispose()
})

test('pdf pageText rejects out-of-range pages', async () => {
  const bytes = await readFile(join(fixtures, 'demo.pdf'))
  const handle = await openPdf('test-pdf-range', bytes)
  await assert.rejects(() => handle.pageText(handle.numPages + 1))
  handle.dispose()
})

test('joinTextItems respects line breaks', () => {
  const items = [
    { str: '第一行', hasEOL: true },
    { str: '第二行', hasEOL: true },
    { str: 'same', hasEOL: false },
    { str: 'line', hasEOL: false }
  ]
  assert.equal(joinTextItems(items), '第一行\n第二行\nsame line')
})

test('docx extraction returns paragraphs', async () => {
  const bytes = await readFile(join(fixtures, 'demo.docx'))
  const paragraphs = await extractDocxParagraphs(bytes)
  assert.equal(paragraphs.length, 3)
  assert.ok(paragraphs[0].includes('极限'))
  assert.ok(paragraphs[1].includes('泰勒'))
  assert.ok(paragraphs[2].includes('洛必达'))
})

test('docx extraction rejects non-docx input', async () => {
  const bytes = await readFile(join(fixtures, 'demo.pdf'))
  await assert.rejects(() => extractDocxParagraphs(bytes))
})

test('xlsx extraction returns sheets with string rows', async () => {
  const bytes = await readFile(join(fixtures, 'demo.xlsx'))
  const sheets = await extractXlsxSheets(bytes)
  assert.ok(sheets.length >= 1)
  const totalCells = sheets.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.length, 0), 0)
  assert.ok(totalCells > 0)
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) assert.equal(typeof cell, 'string')
    }
  }
})

test('csv parser handles quotes, commas and CRLF', () => {
  const csv = 'name,note\r\n"张,三","说""你好""",\r\n李四,ok\n'
  const rows = parseCsv(csv)
  assert.deepEqual(rows, [
    ['name', 'note'],
    ['张,三', '说"你好"', ''],
    ['李四', 'ok']
  ])
})

test('csv parser drops blank rows and trims cells', () => {
  const rows = parseCsv('a,b\n,\n\n c , d \n')
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd']
  ])
})
