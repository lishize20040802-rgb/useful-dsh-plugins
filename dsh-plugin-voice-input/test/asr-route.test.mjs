// dsh-plugin-voice-input — node-half tests (engine geometry, local route).
// Run against the built lib: `npm run build && npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  MODEL_FILES,
  SerialQueue,
  TOTAL_BYTES,
  buildArgs,
  createAsrHandler,
  defaultRuntimeDir,
  normalizeWav,
  parseResult,
  parseWavHeader,
  resolveProxy,
  resolveEngine,
  runtimePaths,
  transcribeLocal
} from '../lib/index.js'

const TEST_RUNTIME = join(tmpdir(), 'voice-test-runtime')
const TEST_CLIP = join(tmpdir(), 'voice-test-clip.wav')

// ---- WAV header parsing ----

function makeWav({ rate = 16000, bits = 16, channels = 1, pcmBytes = 160 } = {}) {
  const buffer = Buffer.alloc(44 + pcmBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + pcmBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE((rate * bits / 8) * channels, 28)
  buffer.writeUInt16LE((bits / 8) * channels, 32)
  buffer.writeUInt16LE(bits, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(pcmBytes, 40)
  return buffer
}

/** WAV carrying real samples (16-bit little endian). */
function makeSamples(samples, { rate = 16000, channels = 1 } = {}) {
  const buffer = makeWav({ rate, channels, pcmBytes: samples.length * 2 })
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i], 44 + i * 2)
  return buffer
}

test('parseWavHeader reads the PCM geometry', () => {
  const header = parseWavHeader(makeWav({ rate: 16000, bits: 16, channels: 1, pcmBytes: 320 }))
  assert.equal(header.sampleRate, 16000)
  assert.equal(header.bits, 16)
  assert.equal(header.channels, 1)
  assert.equal(header.dataOffset, 44)
  assert.equal(header.dataLength, 320)
})

test('parseWavHeader walks extra chunks before data', () => {
  const pcmBytes = 64
  const listSize = 12
  const buffer = Buffer.alloc(44 + 8 + listSize + pcmBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + 8 + listSize + pcmBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('LIST', 36, 'ascii')
  buffer.writeUInt32LE(listSize, 40)
  buffer.write('data', 56, 'ascii')
  buffer.writeUInt32LE(pcmBytes, 60)
  const header = parseWavHeader(buffer)
  assert.equal(header.dataOffset, 64)
  assert.equal(header.dataLength, pcmBytes)
})

test('parseWavHeader rejects non-WAV input', () => {
  assert.throws(() => parseWavHeader(Buffer.from('not a wav file at all')))
})

// ---- Normalization to 16 kHz mono ----

test('normalizeWav keeps a 16 kHz mono clip intact', () => {
  const source = makeSamples([0, 100, -100, 32767, -32768])
  const out = normalizeWav(source)
  const header = parseWavHeader(out)
  assert.equal(header.sampleRate, 16000)
  assert.equal(header.channels, 1)
  assert.equal(header.bits, 16)
  for (let i = 0; i < 5; i++) assert.equal(out.readInt16LE(44 + i * 2), source.readInt16LE(44 + i * 2))
})

test('normalizeWav downmixes stereo to mono', () => {
  const stereo = makeWav({ channels: 2, pcmBytes: 8 })
  stereo.writeInt16LE(1000, 44)
  stereo.writeInt16LE(3000, 46)
  stereo.writeInt16LE(-1000, 48)
  stereo.writeInt16LE(-3000, 50)
  const out = normalizeWav(stereo)
  assert.equal(parseWavHeader(out).channels, 1)
  assert.equal(out.readInt16LE(44), 2000)
  assert.equal(out.readInt16LE(46), -2000)
})

test('normalizeWav resamples 48 kHz input to 16 kHz', () => {
  const samples = new Array(4800).fill(0).map((_, i) => Math.round(10000 * Math.sin(i / 20)))
  const out = normalizeWav(makeSamples(samples, { rate: 48000 }))
  const header = parseWavHeader(out)
  assert.equal(header.sampleRate, 16000)
  const frames = header.dataLength / 2
  assert.ok(Math.abs(frames - 1600) <= 2, `expected ~1600 frames, got ${frames}`)
})

test('normalizeWav rejects non-16-bit input with a readable message', () => {
  assert.throws(() => normalizeWav(makeWav({ bits: 8 })), /16-bit PCM expected/)
})

// ---- Engine invocation ----

const ENGINE = {
  ...runtimePaths(TEST_RUNTIME),
  threads: 6,
  language: 'zh',
  itn: true,
  timeoutMs: 5000
}

test('buildArgs points the CLI at the model, tokens, threads and clip', () => {
  const args = buildArgs(TEST_CLIP, ENGINE)
  assert.ok(args.includes(`--sense-voice-model=${ENGINE.modelPath}`))
  assert.ok(args.includes(`--tokens=${ENGINE.tokensPath}`))
  assert.ok(args.includes('--sense-voice-use-itn=true'))
  assert.ok(args.includes('--num-threads=6'))
  assert.ok(args.includes('--sense-voice-language=zh'))
  assert.ok(args.includes('--print-args=false'))
  assert.equal(args.at(-1), TEST_CLIP)
})

test('buildArgs omits the language flag for auto detection', () => {
  const args = buildArgs('clip.wav', { ...ENGINE, language: 'auto' })
  assert.equal(args.some((arg) => arg.startsWith('--sense-voice-language')), false)
  const off = buildArgs('clip.wav', { ...ENGINE, itn: false })
  assert.ok(off.includes('--sense-voice-use-itn=false'))
})

test('parseResult takes the last JSON result and ignores noise', () => {
  const stdout = [
    'Started',
    '{"text": "第一段"}',
    'some progress',
    '{"text": "第二段，完整的结果。"}'
  ].join('\n')
  assert.equal(parseResult(stdout), '第二段，完整的结果。')
  assert.equal(parseResult(''), '')
  assert.equal(parseResult('no json at all'), '')
})

test('SerialQueue runs one task at a time and survives failures', async () => {
  const queue = new SerialQueue()
  const order = []
  const first = queue.run(async () => {
    order.push('a-start')
    await new Promise((resolve) => setTimeout(resolve, 20))
    order.push('a-end')
  })
  const failing = queue.run(async () => {
    order.push('b')
    throw new Error('boom')
  })
  const third = queue.run(async () => {
    order.push('c')
    return 'ok'
  })
  await first
  await assert.rejects(failing, /boom/)
  assert.equal(await third, 'ok')
  assert.deepEqual(order, ['a-start', 'a-end', 'b', 'c'])
})

test('transcribeLocal leaves no clip behind when the engine cannot start', async () => {
  const leftovers = () => readdirSync(tmpdir()).filter((name) => name.startsWith('dsh-voice-input-'))
  const before = leftovers()
  await assert.rejects(
    transcribeLocal(makeSamples([0, 1000, -1000]), { ...ENGINE, exePath: join(tmpdir(), 'missing-sherpa-onnx-offline.exe') }),
    /本地识别引擎/
  )
  assert.deepEqual(leftovers(), before)
})

// ---- Route behavior ----

function makeReq({ method = 'POST', host = '127.0.0.1:3080', peer = '127.0.0.1', origin, secFetchSite, body = Buffer.alloc(0) } = {}) {
  const headers = { host }
  if (origin !== undefined) headers.origin = origin
  if (secFetchSite !== undefined) headers['sec-fetch-site'] = secFetchSite
  if (body.length > 0) headers['content-length'] = String(body.length)
  return {
    method,
    headers,
    url: '/api/asr',
    socket: { remoteAddress: peer },
    [Symbol.asyncIterator]() {
      let sent = false
      return {
        next: async () => {
          if (sent) return { done: true }
          sent = true
          return { value: body, done: false }
        }
      }
    }
  }
}

function makeRes() {
  const calls = []
  return {
    calls,
    writeHead(status, headers) {
      calls.push(['head', status, headers])
    },
    end(body) {
      calls.push(['end', String(body)])
    }
  }
}

const IDLE_STATE = {
  active: false,
  phase: 'idle',
  label: '',
  received: 0,
  total: TOTAL_BYTES,
  error: '',
  startedAt: 0,
  finishedAt: 0
}

function makeHandler(overrides = {}) {
  const paths = runtimePaths(TEST_RUNTIME)
  return createAsrHandler({
    engine: { ...paths, threads: 4, language: 'zh', itn: true, timeoutMs: 5000 },
    maxBytes: 1024 * 1024,
    autoProvision: true,
    queue: new SerialQueue(),
    inspect: () => ({ ready: true, missing: [], bytes: TOTAL_BYTES }),
    ensure: async () => paths,
    state: () => IDLE_STATE,
    transcribe: async () => '  你好，世界  ',
    ...overrides
  })
}

test('GET answers the bridge probe with the local engine state', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ method: 'GET' }), res)
  assert.equal(res.calls[0][1], 200)
  const body = JSON.parse(res.calls[1][1])
  assert.equal(body.ok, true)
  assert.equal(body.backend, 'local')
  assert.equal(body.engine, 'sense-voice')
  assert.equal(body.ready, true)
  assert.equal(body.downloadBytes, TOTAL_BYTES)
  assert.equal(body.provisioning.active, false)
})

test('POST transcribes locally and returns the text', async () => {
  const seen = []
  const handler = makeHandler({
    transcribe: async (audio) => {
      seen.push(audio.length)
      return '  你好，世界  '
    }
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('RIFF-fake') }), res)
  assert.deepEqual(seen, [Buffer.from('RIFF-fake').length])
  assert.deepEqual(res.calls[0], ['head', 200, { 'content-type': 'application/json' }])
  assert.deepEqual(JSON.parse(res.calls[1][1]), { text: '你好，世界' })
})

test('POST with a missing runtime starts preparation and answers 503', async () => {
  let prepared = 0
  const handler = makeHandler({
    inspect: () => ({ ready: false, missing: ['model.int8.onnx'], bytes: 0 }),
    ensure: async () => {
      prepared += 1
      return runtimePaths(TEST_RUNTIME)
    }
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('RIFF-fake') }), res)
  assert.equal(res.calls[0][1], 503)
  const body = JSON.parse(res.calls[1][1])
  assert.equal(body.provisioning, true)
  assert.match(body.error.message, /首次下载/)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(prepared, 1)
})

test('POST without autoProvision explains how to prepare the runtime', async () => {
  const handler = makeHandler({
    autoProvision: false,
    inspect: () => ({ ready: false, missing: ['model.int8.onnx'], bytes: 0 })
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('RIFF-fake') }), res)
  assert.equal(res.calls[0][1], 503)
  assert.match(JSON.parse(res.calls[1][1]).error.message, /setup:local/)
})

test('engine failure surfaces its message as a 502', async () => {
  const handler = makeHandler({
    transcribe: async () => {
      throw new Error('本地识别引擎不存在：test-engine.exe')
    }
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('RIFF-fake') }), res)
  assert.equal(res.calls[0][1], 502)
  assert.match(JSON.parse(res.calls[1][1]).error.message, /test-engine/)
})

test('non-loopback host is rejected', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ host: 'evil.example.com' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('a remote client cannot bypass the local boundary by spoofing Host', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ host: '127.0.0.1:3080', peer: '192.0.2.10' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('invalid sample rates and empty PCM are rejected before resampling', () => {
  assert.throws(() => normalizeWav(makeWav({ rate: 1 })), /sample rate/)
  assert.throws(() => normalizeWav(makeWav({ rate: 0 })), /sample rate/)
  assert.throws(() => normalizeWav(makeWav({ pcmBytes: 0 })), /no PCM samples/)
})

test('truncated and compressed WAV are rejected', () => {
  assert.throws(() => normalizeWav(makeWav().subarray(0, 50)), /truncated/)
  const compressed = makeWav()
  compressed.writeUInt16LE(3, 20)
  assert.throws(() => normalizeWav(compressed), /PCM WAV expected/)
})

test('cross-site fetch metadata is rejected', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ secFetchSite: 'cross-site' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('cross-origin requests are rejected', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ origin: 'https://evil.example.com' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('oversized payload is rejected with 413', async () => {
  const res = makeRes()
  await makeHandler({ maxBytes: 10 })(makeReq({ body: Buffer.alloc(100) }), res)
  assert.equal(res.calls[0][1], 413)
})

test('empty body is rejected with 400', async () => {
  const res = makeRes()
  await makeHandler()(makeReq({ body: Buffer.alloc(0) }), res)
  assert.equal(res.calls[0][1], 400)
})

// ---- Runtime layout and proxy resolution ----

test('runtimePaths keeps the engine and the model under one root', () => {
  const paths = runtimePaths(TEST_RUNTIME)
  assert.equal(paths.exePath, join(TEST_RUNTIME, 'bin', 'sherpa-onnx-offline.exe'))
  assert.equal(paths.modelPath, join(TEST_RUNTIME, 'models', 'sense-voice', 'model.int8.onnx'))
  assert.equal(paths.tokensPath, join(TEST_RUNTIME, 'models', 'sense-voice', 'tokens.txt'))
})

test('the download budget covers the engine and every model file', () => {
  assert.ok(TOTAL_BYTES > 240 * 1024 * 1024)
  assert.ok(MODEL_FILES.some((file) => file.name === 'model.int8.onnx' && file.bytes > 200 * 1024 * 1024))
  assert.ok(MODEL_FILES.some((file) => file.name === 'tokens.txt'))
})

test('defaultRuntimeDir is an absolute path', () => {
  const dir = defaultRuntimeDir()
  assert.match(dir, /^[A-Za-z]:\\|^\//)
})

test('default runtime follows DSH_HOME including relative and tilde paths', () => {
  const saved = process.env.DSH_HOME
  try {
    const cases = [
      [undefined, join(homedir(), '.dsh')],
      [' \t ', join(homedir(), '.dsh')],
      [join(tmpdir(), 'voice-home-test'), join(tmpdir(), 'voice-home-test')],
      ['relative-home-test', resolve('relative-home-test')],
      ['~', homedir()],
      ['~/portable-home', join(homedir(), 'portable-home')],
      ['~\\portable-home', join(homedir(), 'portable-home')],
    ]
    for (const [declared, expected] of cases) {
      if (declared === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = declared
      const legacy = join(expected, 'voice-input')
      let hasLegacy = false
      try { hasLegacy = statSync(legacy).isDirectory() } catch {}
      assert.equal(defaultRuntimeDir(), hasLegacy ? legacy : join(expected, 'third-party', 'data', 'voice-input'))
    }
  } finally {
    if (saved === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = saved
  }
})

test('an explicitly configured voice runtime remains unchanged', () => {
  const declared = TEST_RUNTIME
  const engine = resolveEngine({ runtimeDir: declared, exePath: '', modelPath: '', tokensPath: '', threads: 2, language: 'zh', itn: true, timeoutMs: 30000 })
  assert.equal(engine.dir, declared)
  assert.equal(engine.modelPath, runtimePaths(declared).modelPath)
})

test('new homes use third-party data and existing legacy directories are reused', () => {
  const home = mkdtempSync(join(tmpdir(), 'voice-layout-test-'))
  const previous = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = home
    assert.equal(defaultRuntimeDir(), join(home, 'third-party', 'data', 'voice-input'))
    const legacy = join(home, 'voice-input')
    mkdirSync(legacy)
    assert.equal(defaultRuntimeDir(), legacy)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
})

test('relative host configuration is anchored in DSH_HOME, including explicit file overrides', () => {
  const previous = process.env.DSH_HOME
  const home = join(tmpdir(), 'voice-config-home')
  try {
    process.env.DSH_HOME = home
    const config = { runtimeDir: 'third-party/data/voice-input', exePath: 'custom/engine.exe', modelPath: '', tokensPath: '', threads: 2, language: 'zh', itn: true, timeoutMs: 30000 }
    const engine = resolveEngine(config)
    assert.equal(engine.dir, join(home, 'third-party', 'data', 'voice-input'))
    assert.equal(engine.exePath, join(home, 'custom', 'engine.exe'))
    assert.equal(engine.modelPath, join(engine.dir, 'models', 'sense-voice', 'model.int8.onnx'))
    assert.equal(resolveEngine({ ...config, runtimeDir: '~/voice-custom' }).dir, join(homedir(), 'voice-custom'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('resolveProxy prefers config, then the environment', () => {
  assert.equal(resolveProxy('http://127.0.0.1:7890'), 'http://127.0.0.1:7890')
  const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.https_proxy, HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy }
  try {
    delete process.env.HTTPS_PROXY
    delete process.env.https_proxy
    delete process.env.HTTP_PROXY
    delete process.env.http_proxy
    process.env.HTTPS_PROXY = 'http://env-proxy:8080'
    assert.equal(resolveProxy(''), 'http://env-proxy:8080')
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
