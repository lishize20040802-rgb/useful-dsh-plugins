// dsh-plugin-doc-companion — pure document-model unit tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import {
  detectKind,
  sanitizeFileName,
  makeDocId,
  clampIndex,
  chunkText,
  chunkTotalChars,
  groupBy,
  pageLocator,
  textBlockLocator,
  paragraphBlockLocator,
  rowBlockLocator,
  detectBrokenTextLayer,
  safeJoin,
  normalizeWhitespace
} from '../lib/index.js'

test('detectKind maps supported extensions', () => {
  assert.equal(detectKind('book.pdf'), 'pdf')
  assert.equal(detectKind('notes.txt'), 'text')
  assert.equal(detectKind('notes.md'), 'text')
  assert.equal(detectKind('readme.markdown'), 'text')
  assert.equal(detectKind('doc.docx'), 'docx')
  assert.equal(detectKind('sheet.xlsx'), 'xlsx')
  assert.equal(detectKind('data.csv'), 'csv')
  assert.equal(detectKind('archive.zip'), null)
  assert.equal(detectKind('noext'), null)
  assert.equal(detectKind('BOOK.PDF'), 'pdf') // case-insensitive
})

test('sanitizeFileName strips separators and keeps CJK', () => {
  assert.equal(sanitizeFileName('C:\\Users\\x\\高等数学.pdf'), '高等数学.pdf')
  assert.equal(sanitizeFileName('a<b>:c|d?.pdf'), 'a_b__c_d_.pdf')
  assert.equal(sanitizeFileName('  trailing...'), 'trailing')
  assert.equal(sanitizeFileName('...'), 'document')
})

test('makeDocId is unique and short', () => {
  const ids = new Set(Array.from({ length: 100 }, () => makeDocId()))
  assert.equal(ids.size, 100)
  for (const id of ids) assert.ok(id.startsWith('d'))
})

test('clampIndex bounds 1-based indexes', () => {
  assert.equal(clampIndex(0, 10), 1)
  assert.equal(clampIndex(-3, 10), 1)
  assert.equal(clampIndex(11, 10), 10)
  assert.equal(clampIndex(3, 10), 3)
  assert.equal(clampIndex(Number.NaN, 10), 1)
})

test('chunkText slices by fixed size and never returns empty', () => {
  const text = 'a'.repeat(1000)
  const chunks = chunkText(text, 300)
  assert.equal(chunks.length, 4)
  assert.equal(chunks[0].length, 300)
  assert.equal(chunks[3].length, 100)
  assert.deepEqual(chunkText('', 300), [''])
  assert.equal(chunkTotalChars(chunks, 300), 1000)
})

test('groupBy slices arrays into fixed groups', () => {
  assert.deepEqual(groupBy([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(groupBy([], 2), [[]])
  assert.deepEqual(groupBy([1], 0), [[1]]) // perBlock floored at 1
})

test('locators are human readable', () => {
  assert.equal(pageLocator(12), '第 12 页')
  assert.equal(textBlockLocator(2, 100, 250), '第 2 块（字符 101–200）')
  assert.equal(paragraphBlockLocator(41, 80), '第 41–80 段')
  assert.equal(paragraphBlockLocator(5, 5), '第 5 段')
  assert.equal(rowBlockLocator('真题', 10, 29), '工作表「真题」第 10–29 行')
  assert.equal(rowBlockLocator('', 3, 3), '第 3 行')
})

test('safeJoin rejects traversal', () => {
  const root = resolve('synthetic-root')
  assert.equal(safeJoin(root, 'build/pdf.mjs'), join(root, 'build', 'pdf.mjs'))
  assert.equal(safeJoin(root, '..\\secret'), null)
  assert.equal(safeJoin(root, 'a/../../secret'), null)
  assert.equal(safeJoin(root, 'build\\..\\..\\x'), null)
  assert.equal(safeJoin(root, ''), root)
})

test('normalizeWhitespace collapses spaces and trims line edges', () => {
  assert.equal(normalizeWhitespace('a  b   c'), 'a b c')
  assert.equal(normalizeWhitespace('a \n b\n\n\nc'), 'a\nb\n\nc')
  assert.equal(normalizeWhitespace('  lead and tail  '), 'lead and tail')
})

test('detectBrokenTextLayer flags unsearchable text layers (scans and broken glyph mappings)', () => {
  const noise = 'ò Ÿ 8 ‹ ÜN ß Ó Ç ÿ ¥ É á è ÷ S N ƒ ã é l ˙ n z › ? ß œ è @ ¨ „ å ü Ã † ÷ Ã K'
  const english = 'This is a normal English sentence with enough length to judge correctly.'
  const chinese = '集合是数学的基本概念，元素 x 属于集合 S。极限与连续是分析学的基础。'

  // A "Chinese book" whose extracted pages carry no CJK at all → broken.
  const brokenBook = Array.from({ length: 12 }, (_, i) => ({
    index: i + 1,
    locator: `第 ${i + 1} 页`,
    text: i % 3 === 0 ? noise : `${noise} ${noise}`
  }))
  assert.equal(detectBrokenTextLayer(brokenBook), true)

  // Genuine Chinese book → healthy.
  const chineseBook = Array.from({ length: 12 }, (_, i) => ({
    index: i + 1,
    locator: `第 ${i + 1} 页`,
    text: `${chinese} 第${i + 1}节内容。`
  }))
  assert.equal(detectBrokenTextLayer(chineseBook), false)

  // Genuine English book (pure ASCII) → healthy.
  const englishBook = Array.from({ length: 12 }, (_, i) => ({
    index: i + 1,
    locator: `page ${i + 1}`,
    text: `${english} Page ${i + 1}.`
  }))
  assert.equal(detectBrokenTextLayer(englishBook), false)

  // A scanned book: every page is one image, so every block extracts to ''.
  // The old sample-based check called such a book healthy, and doc_search then
  // reported "not in the book" for content the book does contain.
  const scannedBook = Array.from({ length: 12 }, (_, i) => ({
    index: i + 1,
    locator: `第 ${i + 1} 页`,
    text: ''
  }))
  assert.equal(detectBrokenTextLayer(scannedBook), true)

  // Whitespace-only pages are empty pages.
  assert.equal(detectBrokenTextLayer(scannedBook.map((b) => ({ ...b, text: ' \n ' }))), true)

  // A one-page scan is exactly as unsearchable as a long one.
  assert.equal(detectBrokenTextLayer([{ index: 1, locator: '第 1 页', text: '' }]), true)

  // No blocks at all is no evidence of anything.
  assert.equal(detectBrokenTextLayer([]), false)

  // One page of real text among the scans keeps the document searchable.
  assert.equal(detectBrokenTextLayer([
    ...scannedBook.slice(0, 11),
    { index: 12, locator: '第 12 页', text: `${chinese} 第12节内容。` }
  ]), false)

  // Too few pages to judge → healthy.
  assert.equal(detectBrokenTextLayer([{ index: 1, locator: '第 1 页', text: noise }]), false)
})
