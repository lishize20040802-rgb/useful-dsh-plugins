// dsh-plugin-voice-input — node-half route + protocol tests.
// Run against the built lib: `npm run build && npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFrame, createAsrHandler, parseWavHeader } from '../lib/index.js'

/** Minimal IncomingMessage stand-in with a one-chunk async body. */
function makeReq({ method = 'POST', host = '127.0.0.1:3080', origin, secFetchSite, body = Buffer.alloc(0) } = {}) {
  const headers = { host }
  if (origin !== undefined) headers.origin = origin
  if (secFetchSite !== undefined) headers['sec-fetch-site'] = secFetchSite
  if (body.length > 0) headers['content-length'] = String(body.length)
  return {
    method,
    headers,
    url: '/api/asr',
    socket: {},
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

/** Minimal ServerResponse stand-in recording writeHead/end calls. */
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

const BASE_OPTS = {
  appId: 'test-app-id',
  accessToken: 'tok-test',
  resourceId: 'volc.bigasr.sauc.duration',
  wsUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream',
  language: 'zh',
  maxBytes: 1024 * 1024,
  timeoutMs: 5000
}

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
  buffer.writeUInt32LE(rate * bits / 8 * channels, 28)
  buffer.writeUInt16LE(bits / 8 * channels, 32)
  buffer.writeUInt16LE(bits, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(pcmBytes, 40)
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
  // RIFF + fmt + LIST(extra) + data
  const pcmBytes = 64
  const listSize = 12
  const buffer = Buffer.alloc(44 + listSize + pcmBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + listSize + pcmBytes, 4)
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

// ---- Frame encoding ----

test('buildFrame encodes the full client request header', () => {
  const payload = Buffer.from('{"user":{}}')
  const frame = buildFrame(1, 1, payload, { serialization: 1, compression: 1, sequence: 1 })
  // byte1: type 0b0001<<4 | POS_SEQ 0b0001; byte2: JSON<<4 | gzip
  assert.deepEqual([...frame.subarray(0, 4)], [0x11, 0x11, 0x11, 0x00])
  assert.equal(frame.readInt32BE(4), 1) // sequence
  assert.equal(frame.readUInt32BE(8), payload.length)
  assert.equal(frame.subarray(12).toString(), payload.toString())
})

test('buildFrame encodes audio and negative frames', () => {
  const audio = buildFrame(2, 1, Buffer.from([1, 2, 3]), { compression: 1, sequence: 2 })
  assert.deepEqual([...audio.subarray(0, 4)], [0x11, 0x21, 0x01, 0x00])
  assert.equal(audio.readInt32BE(4), 2)
  const negative = buildFrame(2, 3, Buffer.alloc(0), { compression: 1, sequence: -3 })
  assert.deepEqual([...negative.subarray(0, 4)], [0x11, 0x23, 0x01, 0x00])
  assert.equal(negative.readInt32BE(4), -3)
  assert.equal(negative.readUInt32BE(8), 0)
})

// ---- Route behavior ----

test('POST transcribes through the injected function and returns the text', async () => {
  const calls = []
  const handler = createAsrHandler({
    ...BASE_OPTS,
    transcribe: async (audio) => {
      calls.push(audio.length)
      return '  你好，世界  '
    }
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('RIFF-fake') }), res)
  assert.equal(calls.length, 1)
  assert.deepEqual(res.calls[0], ['head', 200, { 'content-type': 'application/json' }])
  assert.deepEqual(JSON.parse(res.calls[1][1]), { text: '你好，世界' })
})

test('GET answers the health probe', async () => {
  const handler = createAsrHandler(BASE_OPTS)
  const res = makeRes()
  await handler(makeReq({ method: 'GET' }), res)
  assert.equal(res.calls[0][1], 200)
  assert.deepEqual(JSON.parse(res.calls[1][1]), { ok: true, configured: true, resourceId: 'volc.bigasr.sauc.duration' })
})

test('missing credentials is a 503 with a configuration hint', async () => {
  const handler = createAsrHandler({ ...BASE_OPTS, appId: '  ', accessToken: '' })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('wav') }), res)
  assert.equal(res.calls[0][1], 503)
  assert.match(JSON.parse(res.calls[1][1]).error.message, /appId/)
})

test('non-loopback host is rejected', async () => {
  const handler = createAsrHandler(BASE_OPTS)
  const res = makeRes()
  await handler(makeReq({ host: 'evil.example.com' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('cross-site fetch metadata is rejected', async () => {
  const handler = createAsrHandler(BASE_OPTS)
  const res = makeRes()
  await handler(makeReq({ secFetchSite: 'cross-site' }), res)
  assert.equal(res.calls[0][1], 403)
})

test('upstream failure surfaces its message as a 502', async () => {
  const handler = createAsrHandler({
    ...BASE_OPTS,
    transcribe: async () => {
      throw new Error('ASR rejected: {"error":"not granted"}')
    }
  })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.from('wav') }), res)
  assert.equal(res.calls[0][1], 502)
  assert.match(JSON.parse(res.calls[1][1]).error.message, /not granted/)
})

test('oversized payload is rejected with 413', async () => {
  const handler = createAsrHandler({ ...BASE_OPTS, maxBytes: 10 })
  const res = makeRes()
  await handler(makeReq({ body: Buffer.alloc(100) }), res)
  assert.equal(res.calls[0][1], 413)
})

test('empty body is rejected with 400', async () => {
  const handler = createAsrHandler(BASE_OPTS)
  const res = makeRes()
  await handler(makeReq({ body: Buffer.alloc(0) }), res)
  assert.equal(res.calls[0][1], 400)
})
