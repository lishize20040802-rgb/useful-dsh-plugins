// dsh-plugin-doc-companion — DocumentStore integration tests (temp dir).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DocumentStore, detectKind } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')

const OPTS = { textBlockChars: 100, maxParagraphsPerBlock: 2, maxRowsPerBlock: 2 }

async function withStore(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  const store = new DocumentStore(root, OPTS)
  await store.init()
  try {
    await run(store, root)
  } finally {
    store.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

test('text documents chunk into blocks with locators', async () => {
  await withStore(async (store) => {
    const text = 'a'.repeat(250)
    const meta = await store.registerBytes('notes.txt', detectKind('notes.txt'), Buffer.from(text, 'utf8'))
    assert.equal(meta.kind, 'text')
    const blocks = await store.blocksFor(meta.id)
    assert.equal(blocks.length, 3)
    assert.equal(blocks[0].text.length, 100)
    assert.match(blocks[0].locator, /第 1 块/)
    assert.equal(store.isReady(meta.id), true)
    const one = await store.blockText(meta.id, 2)
    assert.equal(one.index, 2)
    assert.equal(one.text.length, 100)
  })
})

test('pdf documents extract pages lazily and index in background', async () => {
  await withStore(async (store) => {
    const bytes = await readFile(join(fixtures, 'demo.pdf'))
    const meta = await store.registerBytes('demo.pdf', detectKind('demo.pdf'), bytes)
    const one = await store.blockText(meta.id, 1)
    assert.match(one.locator, /第 1 页/)
    assert.ok(one.text.length > 0)
    // full index finishes eventually
    await store.blocksFor(meta.id)
    assert.equal(store.isReady(meta.id), true)
    const metaAfter = store.get(meta.id)
    assert.ok(metaAfter.totalBlocks >= 1)
  })
})

test('docx documents group paragraphs into blocks', async () => {
  await withStore(async (store) => {
    const bytes = await readFile(join(fixtures, 'demo.docx'))
    const meta = await store.registerBytes('demo.docx', detectKind('demo.docx'), bytes)
    const blocks = await store.blocksFor(meta.id)
    assert.equal(blocks.length, 2) // 3 paragraphs, 2 per block
    assert.match(blocks[0].locator, /第 1–2 段/)
    assert.match(blocks[1].locator, /第 3 段/)
  })
})

test('xlsx documents produce table blocks with row ranges', async () => {
  await withStore(async (store) => {
    const bytes = await readFile(join(fixtures, 'demo.xlsx'))
    const meta = await store.registerBytes('demo.xlsx', detectKind('demo.xlsx'), bytes)
    const blocks = await store.blocksFor(meta.id)
    assert.ok(blocks.length >= 1)
    assert.match(blocks[0].locator, /工作表「/)
    const table = await store.tableBlock(meta.id, 1)
    assert.ok(Array.isArray(table.columns))
    assert.ok(Array.isArray(table.rows))
  })
})

test('current position persists across restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  try {
    const store = new DocumentStore(root, OPTS)
    await store.init()
    const text = 'x'.repeat(500)
    const meta = await store.registerBytes('book.md', detectKind('book.md'), Buffer.from(text, 'utf8'))
    store.setCurrent(meta.id, 3)
    await store.flush()
    store.dispose()

    const reloaded = new DocumentStore(root, OPTS)
    await reloaded.init()
    const state = reloaded.currentState()
    assert.equal(state.docId, meta.id)
    assert.equal(state.block, 3)
    reloaded.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('close clears the current document', async () => {
  await withStore(async (store) => {
    const meta = await store.registerBytes('a.txt', detectKind('a.txt'), Buffer.from('hello world', 'utf8'))
    assert.equal(store.currentState().docId, meta.id)
    store.close()
    assert.equal(store.currentState().docId, null)
  })
})

test('reading positions are per-session', async () => {
  await withStore(async (store) => {
    const metaA = await store.registerBytes('a.txt', detectKind('a.txt'), Buffer.from('aaa', 'utf8'), 'session-a')
    const metaB = await store.registerBytes('b.txt', detectKind('b.txt'), Buffer.from('bbb', 'utf8'), 'session-b')
    store.setCurrent(metaB.id, 1, 'session-b')
    assert.equal(store.currentState('session-a').docId, metaA.id)
    assert.equal(store.currentState('session-b').docId, metaB.id)
    assert.equal(store.currentState('unknown-session').docId, null)
    // the session-less fallback position stays untouched
    assert.equal(store.currentState().docId, null)
    // closing one session never touches another
    store.close('session-b')
    assert.equal(store.currentState('session-b').docId, null)
    assert.equal(store.currentState('session-a').docId, metaA.id)
  })
})

test('per-session positions persist across restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  try {
    const store = new DocumentStore(root, OPTS)
    await store.init()
    const meta = await store.registerBytes('a.txt', detectKind('a.txt'), Buffer.from('aaaa', 'utf8'), 'session-x')
    store.setCurrent(meta.id, 2, 'session-x')
    await store.flush()
    store.dispose()

    const reloaded = new DocumentStore(root, OPTS)
    await reloaded.init()
    const state = reloaded.currentState('session-x')
    assert.equal(state.docId, meta.id)
    assert.equal(state.block, 2)
    assert.equal(reloaded.currentState('session-y').docId, null)
    reloaded.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unknown documents throw DOC_NOT_FOUND', async () => {
  await withStore(async (store) => {
    await assert.rejects(
      () => store.blockText('nope', 1),
      (err) => err.code === 'DOC_NOT_FOUND'
    )
  })
})

test('out-of-range blocks throw BLOCK_OUT_OF_RANGE', async () => {
  await withStore(async (store) => {
    const meta = await store.registerBytes('a.txt', detectKind('a.txt'), Buffer.from('hello', 'utf8'))
    await assert.rejects(
      () => store.blockText(meta.id, 99),
      (err) => err.code === 'BLOCK_OUT_OF_RANGE'
    )
  })
})

test('sidecar persists extracted text so restarts skip re-extraction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  try {
    const store = new DocumentStore(root, OPTS)
    await store.init()
    const meta = await store.registerBytes('b.md', detectKind('b.md'), Buffer.from('y'.repeat(300), 'utf8'))
    await store.blocksFor(meta.id)
    await store.flush()
    store.dispose()

    const reloaded = new DocumentStore(root, OPTS)
    await reloaded.init()
    const blocks = await reloaded.blocksFor(meta.id)
    assert.equal(blocks.length, 3)
    reloaded.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
