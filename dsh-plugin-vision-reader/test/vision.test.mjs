// dsh-plugin-vision-reader — unit tests for the pure vision logic.
//
// Covers the transcription contract: non-image blocks pass through, image
// blocks are replaced by text (with the 【图片转述】 prefix), failed calls
// degrade to the failure placeholder, and the per-step cache avoids
// re-calling the model for the same attachment id.
import test from 'node:test'
import assert from 'node:assert/strict'
import { callVision, transcribeBlocks, findImagePaths, readImageRef, transcribeTextPaths, installAdmissionShim } from '../lib/index.js'

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
  transcribeImages: true,
  autoHideReadImage: true,
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

test('transcribeBlocks passes non-image blocks through untouched', async () => {
  const llm = fakeLlm()
  const blocks = [{ type: 'text', text: '你好' }, { type: 'reasoning', text: '思考' }]
  const out = await transcribeBlocks(llm, cfg, blocks, undefined, new Map())
  assert.deepEqual(out, blocks)
})

test('transcribeBlocks replaces image blocks with prefixed text', async () => {
  const llm = fakeLlm('一只猫')
  const blocks = [{ type: 'text', text: '看图：' }, imageBlock('att-1')]
  const out = await transcribeBlocks(llm, cfg, blocks, undefined, new Map())
  assert.equal(out.length, 2)
  assert.equal(out[1].type, 'text')
  assert.equal(out[1].text, '【图片转述】一只猫')
})

test('transcription caches by attachment id within one step', async () => {
  const llm = fakeLlm('同一张图')
  const blocks = [imageBlock('att-dup'), imageBlock('att-dup')]
  const out = await transcribeBlocks(llm, cfg, blocks, undefined, new Map())
  assert.equal(out.length, 2)
  assert.equal(out[0].text, out[1].text)
  assert.equal(llm.calls(), 1) // 同一 attachmentId 只调用一次
})

test('failed transcription degrades to the failure placeholder', async () => {
  const llm = {
    stream: async function* () {
      throw new Error('network down')
    },
  }
  const blocks = [imageBlock('att-bad')]
  const out = await transcribeBlocks(llm, cfg, blocks, undefined, new Map())
  assert.equal(out[0].type, 'text')
  assert.equal(out[0].text.includes('图片自动转述失败'), true)
})

// ── path transcription (upload-button uploads arrive as path text) ────────

test('findImagePaths recognizes Windows image paths in text', () => {
  const text = '请看这张图 `D:\\harness\\uploads\\a1b2c3d4e5f6-photo.png` 和 C:/x/y/pic.jpg'
  const paths = findImagePaths(text)
  assert.equal(paths.length, 2)
  assert.equal(paths[0].path, 'D:\\harness\\uploads\\a1b2c3d4e5f6-photo.png')
  assert.equal(paths[1].path, 'C:/x/y/pic.jpg')
})

test('findImagePaths ignores non-image extensions', () => {
  assert.equal(findImagePaths('D:\\a\\file.txt 和 C:/b/doc.pdf').length, 0)
})

test('transcribeTextPaths keeps the path and appends transcription', async () => {
  const llm = fakeLlm('一只猫')
  const fsFace = {
    resolve: async (p) => ({ displayPath: p }),
    readBytes: async () => new Uint8Array([1, 2, 3]),
  }
  const attFace = {
    imageLimits: { mediaTypes: ['image/png', 'image/jpeg'], maxImageBytes: 1000000 },
    saveImage: async () => ({ attachmentId: 'att-x', mediaType: 'image/png', bytes: 10, width: 1, height: 1 }),
  }
  const text = '请看 `D:\\harness\\uploads\\a1b2c3d4e5f6-photo.png`'
  const out = await transcribeTextPaths(llm, cfg, fsFace, attFace, text, undefined, new Map())
  assert.equal(out.includes('a1b2c3d4e5f6-photo.png'), true) // 路径保留
  assert.equal(out.includes('【图片转述】一只猫'), true) // 转述附加
})

test('transcribeTextPaths leaves unreadable paths untouched', async () => {
  const llm = fakeLlm()
  const fsFace = {
    resolve: async () => { throw new Error('not found') },
  }
  const attFace = { imageLimits: { mediaTypes: ['image/png'] }, saveImage: async () => ({}) }
  const text = 'D:\\missing\\photo.png'
  const out = await transcribeTextPaths(llm, cfg, fsFace, attFace, text, undefined, new Map())
  assert.equal(out, text) // 不可读路径不改变
})

test('readImageRef returns undefined for non-image paths', async () => {
  const fsFace = { resolve: async (p) => ({ displayPath: p }) }
  const attFace = { imageLimits: { mediaTypes: ['image/png'] }, saveImage: async () => ({}) }
  const ref = await readImageRef(fsFace, attFace, 'D:\\a\\note.txt', undefined)
  assert.equal(ref, undefined)
})

// ── admission shim (host gate relaxation for text-only main models) ───────

/** Build a fake cordis ctx whose `.llm` exposes services and symbols.original. */
function fakeCtx(services) {
  const target = { llm: services.llm }
  return {
    llm: { [Symbol.for('cordis.original')]: target.llm },
    get: (name) => (name === 'attachments' ? services[name] : undefined),
  }
}

test('admission shim drops inputModalities for the configured text-only route', async () => {
  const original = async () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', inputModalities: ['text'] })
  const llm = { resolveModelInfo: original }
  const ctx = fakeCtx({ llm, attachments: {} })
  const cfg = { provider: 'deepseek-official', model: 'deepseek-v4-flash', transcribeImages: true, autoHideReadImage: true, instruction: 'x' }
  const dispose = installAdmissionShim(ctx, cfg)
  try {
    // 主模型（纯文本）被放行：inputModalities 移除
    const info = await ctx.llm[Symbol.for('cordis.original')].resolveModelInfo('deepseek-official', 'deepseek-v4-flash')
    assert.equal(info.inputModalities, undefined)
    // 其他纯文本模型也被放行（shim 不限定具体模型）
    const other = await ctx.llm[Symbol.for('cordis.original')].resolveModelInfo('other-provider', 'other-text-model')
    assert.equal(other.inputModalities, undefined)
  } finally {
    dispose()
  }
  // 恢复后原样返回
  const after = await ctx.llm[Symbol.for('cordis.original')].resolveModelInfo('deepseek-official', 'deepseek-v4-flash')
  assert.deepEqual(after.inputModalities, ['text'])
})

test('admission shim leaves vision-capable routes untouched', async () => {
  const original = async () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp', inputModalities: ['text', 'image'] })
  const llm = { resolveModelInfo: original }
  const ctx = fakeCtx({ llm, attachments: {} })
  const cfg = { provider: 'deepseek-official', model: 'deepseek-v4-flash', transcribeImages: true, autoHideReadImage: true, instruction: 'x' }
  const dispose = installAdmissionShim(ctx, cfg)
  try {
    const info = await ctx.llm[Symbol.for('cordis.original')].resolveModelInfo('deepseek-official', 'deepseek-v4-flash-vision-exp')
    assert.deepEqual(info.inputModalities, ['text', 'image']) // 视觉模型不变
  } finally {
    dispose()
  }
})
