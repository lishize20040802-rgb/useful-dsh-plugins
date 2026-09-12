// dsh-plugin-doc-companion — in-document search unit tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchBlocks, queryTerms, countMatches, makeSnippet } from '../lib/index.js'

function block(index, text) {
  return { index, locator: `第 ${index} 页`, text }
}

test('queryTerms splits and lowercases', () => {
  assert.deepEqual(queryTerms(' 泰勒公式 极限  '), ['泰勒公式', '极限'])
  assert.deepEqual(queryTerms('Taylor Series'), ['taylor', 'series'])
  assert.deepEqual(queryTerms('   '), [])
})

test('searchBlocks finds and ranks hits', () => {
  const blocks = [
    block(1, '第一章 函数与极限。极限的定义。'),
    block(2, '第二章 导数与微分。'),
    block(3, '泰勒公式及其应用。极限计算专题。')
  ]
  const hits = searchBlocks(blocks, '极限', 5)
  assert.equal(hits.length, 2)
  assert.equal(hits[0].block, 1) // equal match counts → earlier block wins
  assert.equal(hits[1].block, 3)
})

test('searchBlocks requires every term (AND)', () => {
  const blocks = [
    block(1, '极限的定义与性质。'),
    block(2, '泰勒公式展开。')
  ]
  const hits = searchBlocks(blocks, '泰勒 极限', 5)
  assert.equal(hits.length, 0)
  const both = searchBlocks([block(9, '泰勒公式与极限的关系。')], '泰勒 极限', 5)
  assert.equal(both.length, 1)
  assert.equal(both[0].block, 9)
  assert.equal(both[0].matches, 2)
})

test('searchBlocks caps results and sorts by matches then position', () => {
  const blocks = [
    block(1, '极限 A 极限'),
    block(2, '极限 B'),
    block(3, '极限 C 极限 极限')
  ]
  const hits = searchBlocks(blocks, '极限', 2)
  assert.equal(hits.length, 2)
  assert.equal(hits[0].block, 3) // most matches first
  assert.equal(hits[1].block, 1)
})

test('snippets carry ellipses and collapse whitespace', () => {
  const text = `开头${'x'.repeat(200)}泰勒公式出现在这里${'y'.repeat(200)}结尾`
  const hit = makeSnippet(text, 200, 4, 20)
  assert.ok(hit.startsWith('…'))
  assert.ok(hit.endsWith('…'))
  assert.ok(hit.includes('泰勒公式'))
})

test('countMatches counts total occurrences', () => {
  assert.equal(countMatches('极限 极限', '极限'), 2)
  assert.equal(countMatches('a b', 'a c'), 1)
  assert.equal(countMatches('a', 'b'), 0)
})

test('searchBlocks empty query returns no hits', () => {
  assert.deepEqual(searchBlocks([block(1, 'x')], '   ', 5), [])
})

test('hit shape is stable', () => {
  const [hit] = searchBlocks([block(7, '泰勒公式')], '泰勒', 1)
  assert.deepEqual(hit, { block: 7, locator: '第 7 页', snippet: '泰勒公式', matches: 1 })
})
