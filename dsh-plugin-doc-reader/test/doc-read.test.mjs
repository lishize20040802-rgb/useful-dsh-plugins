import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  detectFormat,
  parseText,
  parseXlsx,
  parseDocument,
  windowLines,
  renderEnvelope,
  SUPPORTED_FORMATS
} from '../lib/doc-read.js'

test('detectFormat maps extensions', () => {
  assert.equal(detectFormat('report.PDF'), 'pdf')
  assert.equal(detectFormat('report.docx'), 'docx')
  assert.equal(detectFormat('data.XLSX'), 'xlsx')
  assert.equal(detectFormat('data.xlsm'), 'xlsx')
  assert.equal(detectFormat('note.md'), 'text')
  assert.equal(detectFormat('code.py'), 'text')
  assert.equal(detectFormat('noext'), 'text')
})

test('parseText decodes utf8 and strips BOM', () => {
  const text = parseText(Buffer.from('\uFEFFhello\nworld\n'))
  assert.equal(text, 'hello\nworld\n')
})

test('parseText rejects binary content', () => {
  assert.throws(() => parseText(Buffer.from([0x00, 0x01, 0x02])), /binary/)
})

test('parseXlsx round-trips a workbook', () => {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'value'],
    ['alpha', 1],
    ['beta', 2]
  ])
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const text = parseXlsx(buf, 100)
  assert.ok(text.includes('# sheet: Sheet1'))
  assert.ok(text.includes('name\tvalue'))
  assert.ok(text.includes('alpha\t1'))
  assert.ok(text.includes('beta\t2'))
})

test('parseXlsx respects rowLimit', () => {
  const wb = XLSX.utils.book_new()
  const rows = [['i']]
  for (let i = 1; i <= 60; i++) rows.push([i])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const text = parseXlsx(buf, 10)
  // 61 total rows (header + 60 data), 10 kept -> 51 remaining
  assert.ok(text.includes('... (51 more rows in this sheet)'))
  assert.ok(!text.split('\n').includes('11'))
})

test('parseDocument dispatches by format', async () => {
  assert.equal(await parseDocument(Buffer.from('plain'), 'text', { sheetRowLimit: 10 }), 'plain')
  await assert.rejects(() => parseDocument(Buffer.from('x'), 'wat', { sheetRowLimit: 10 }), /unsupported format/)
  assert.equal(SUPPORTED_FORMATS.has('pdf'), true)
})

test('windowLines numbers lines from offset and caps limit', () => {
  const { lines, totalLines } = windowLines('a\nb\nc\nd\ne\n', 2, 2)
  assert.equal(totalLines, 5)
  assert.deepEqual(lines, [{ number: 2, text: 'b' }, { number: 3, text: 'c' }])
})

test('windowLines drops one trailing empty line and strips CR', () => {
  const { lines, totalLines } = windowLines('a\r\nb\r\n', 1, 10)
  assert.equal(totalLines, 2)
  assert.deepEqual(lines, [{ number: 1, text: 'a' }, { number: 2, text: 'b' }])
})

test('windowLines allows offset 1 on empty text', () => {
  const { lines, totalLines } = windowLines('', 1, 10)
  assert.equal(totalLines, 0)
  assert.deepEqual(lines, [])
})

test('windowLines rejects out-of-range offset', () => {
  assert.throws(() => windowLines('a\nb\n', 5, 10), /out of range/)
})

test('windowLines truncates long lines', () => {
  const long = 'x'.repeat(5000)
  const { lines } = windowLines(long, 1, 1, 2000)
  assert.ok(lines[0].text.endsWith('... (line truncated to 2000 chars)'))
})

test('renderEnvelope emits continuation footer', () => {
  const text = renderEnvelope('C:/f.md', 'document', {
    offset: 1,
    lines: [{ number: 1, text: 'a' }],
    totalLines: 3
  })
  assert.ok(text.includes('<path>C:/f.md</path>'))
  assert.ok(text.includes('<type>document</type>'))
  assert.ok(text.includes('1: a'))
  assert.ok(text.includes('Use offset=2 to continue.'))
})

test('renderEnvelope emits end-of-file footer', () => {
  const text = renderEnvelope('f.md', 'document', {
    offset: 1,
    lines: [{ number: 1, text: 'a' }],
    totalLines: 1
  })
  assert.ok(text.includes('(End of file - total 1 lines)'))
})
