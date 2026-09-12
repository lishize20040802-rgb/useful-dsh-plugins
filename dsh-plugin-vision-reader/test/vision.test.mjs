// dsh-plugin-vision-reader — unit tests for the pure vision logic.
//
// Covers the one image route: image blocks reach the main model verbatim, the
// persisted copy appends its `【图片已保存】<path>` note, and nothing is ever
// turned into a description on the main model's behalf. The `vision` tool's
// model call is covered by the `callVision` tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  callVision,
  hasAnyImage,
  planPreStep,
  SAVED_IMAGE_PREFIX,
  persistImageFile,
} from '../lib/index.js'

/** A fake LLM service face that returns canned text per call. */
function fakeLlm(text = '一张测试图片') {
  let calls = 0
  return {
    stream: async function* () {
      calls += 1
      yield { type: 'text-delta', text }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
    calls: () => calls,
  }
}

/** A minimal resolved config for tests. */
const cfg = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash-vision-exp',
  instruction: '请详细描述这张图片的内容',
}

const imageBlock = (id = 'att-1') => ({
  type: 'image',
  attachment: {
    attachmentId: id,
    mediaType: 'image/png',
    bytes: 1024,
    width: 100,
    height: 80,
  },
})

test('callVision assembles streamed deltas into text', async () => {
  const llm = fakeLlm('一只猫')
  const result = await callVision(llm, cfg, '描述内容', [{ attachmentId: 'a', mediaType: 'image/png', bytes: 10 }])
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.text, '一只猫')
  assert.equal(llm.calls(), 1)
})

test('callVision reports a finish error as failure', async () => {
  const llm = {
    stream: async function* () {
      yield { type: 'text-delta', text: '部分内容' }
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'X', message: 'boom' } } }
    },
  }
  const result = await callVision(llm, cfg, 'x', [])
  assert.equal(result.ok, false)
  assert.equal(result.ok || result.error.includes('error'), true)
})

// ── pre-step pass-through (images reach the main model untouched) ─────────

const SAVED = 'D:\\inbox\\abc123-pasted-image.png'

test('hasAnyImage detects image blocks and ignores text-only messages', () => {
  assert.equal(hasAnyImage([{ content: [{ type: 'text', text: '你好' }] }]), false)
  assert.equal(hasAnyImage([{ content: [{ type: 'text', text: '看 D:\\a\\b.png' }] }]), false)
  assert.equal(hasAnyImage([{ content: [imageBlock()] }]), true)
  assert.equal(hasAnyImage([{ content: [{ type: 'text', text: 'x' }] }, { content: [imageBlock('b')] }]), true)
  assert.equal(hasAnyImage([]), false)
})

test('planPreStep keeps the image verbatim and appends the saved path', async () => {
  const messages = [{ content: [{ type: 'text', text: '这张图' }, imageBlock()] }]
  const out = await planPreStep(messages, async () => SAVED)
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].content, [
    { type: 'text', text: '这张图' },
    imageBlock(),
    { type: 'text', text: `${SAVED_IMAGE_PREFIX}\`${SAVED}\`` },
  ])
})

test('planPreStep leaves text-only messages untouched, image paths included', async () => {
  const messages = [
    { content: [{ type: 'text', text: '看看 `D:\\up\\photo.png`' }] },
    { content: [{ type: 'reasoning', text: '思考' }] },
  ]
  let persistCalls = 0
  const out = await planPreStep(messages, async () => { persistCalls += 1; return SAVED })
  assert.deepEqual(out, messages)
  assert.equal(persistCalls, 0)
})

test('planPreStep keeps the image when persistence is unavailable', async () => {
  const messages = [{ content: [imageBlock()] }]
  const out = await planPreStep(messages, async () => null)
  assert.deepEqual(out[0].content, [imageBlock()])
})

test('planPreStep never drops the image when persist rejects', async () => {
  const messages = [{ content: [imageBlock()] }]
  const out = await planPreStep(messages, async () => { throw new Error('disk full') })
  assert.deepEqual(out[0].content, [imageBlock()])
})

test('planPreStep does not mutate the input messages', async () => {
  const original = [{ content: [imageBlock()] }]
  const snapshot = JSON.parse(JSON.stringify(original))
  await planPreStep(original, async () => SAVED)
  assert.deepEqual(original, snapshot)
})

test('planPreStep persists every image in a multi-image message', async () => {
  const messages = [{ content: [imageBlock('a'), imageBlock('b')] }]
  const saved = []
  const out = await planPreStep(messages, async (attachment) => {
    saved.push(attachment.attachmentId)
    return `D:\\inbox\\${attachment.attachmentId}.png`
  })
  assert.deepEqual(saved, ['a', 'b'])
  assert.deepEqual(out[0].content, [
    imageBlock('a'),
    { type: 'text', text: `${SAVED_IMAGE_PREFIX}\`D:\\inbox\\a.png\`` },
    imageBlock('b'),
    { type: 'text', text: `${SAVED_IMAGE_PREFIX}\`D:\\inbox\\b.png\`` },
  ])
})

// ── image persistence (pasted images land on disk for re-reading) ─────────

test('persistImageFile writes content-addressed files with the right extension', async () => {
  const { mkdtemp, readdir, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'vision-inbox-'))
  try {
    const data = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const first = await persistImageFile(dir, data, 'image/png', 'pasted-image')
    assert.equal(first.includes('-pasted-image.png'), true)
    assert.match(first, /[0-9a-f]{12}-pasted-image\.png$/)
    // identical content dedupes to the same file (no EEXIST failure)
    const second = await persistImageFile(dir, data, 'image/png', 'pasted-image')
    assert.equal(second, first)
    const files = await readdir(dir)
    assert.equal(files.length, 1)
    assert.deepEqual([...await readFile(first)], [...data])
    // media type drives the extension
    const jpeg = await persistImageFile(dir, new Uint8Array([255, 216, 255]), 'image/jpeg', 'shot')
    assert.equal(jpeg.endsWith('-shot.jpg'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
