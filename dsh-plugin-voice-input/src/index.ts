// dsh-plugin-voice-input — node half (host side).
//
// Registers a /api/asr route on the host webserver that bridges one recorded
// clip to Volcengine's Doubao streaming speech recognition (大模型流式语音
// 识别, `bigmodel_nostream` mode) over the openspeech WebSocket protocol:
// - GET    answers `{ ok, configured, resourceId }` so the browser half can
//          show the bridge state (offline / credentials missing);
// - POST   receives raw WAV bytes, streams the PCM payload through the
//          binary WebSocket protocol (gzip-compressed full request → audio
//          frames with sequence numbers → negative packet), and answers
//          `{ text }` with the final transcript.
//
// Auth uses the Volcengine Speech console credentials — API ID (AppID) +
// Access Token — sent as X-Api-App-Key / X-Api-Access-Key handshake headers
// (no signing is required for the big-model WebSocket API). The credentials
// are read from the profile configuration or environment variables, never
// shipped in the package, and never echoed back to the browser.
//
// Security stance (the webserver does no auth by itself): loopback-host only,
// same-origin enforcement via Origin and Fetch-Metadata, POST/GET only, a
// hard byte cap checked both against Content-Length and while streaming, and
// an upstream timeout so a stalled ASR call can never wedge the route.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
// Type-only load activating the `ctx.webServer` declaration merge on the
// cordis Context. Erased at build.
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'voice-input'

/** Services required by the node half. */
export const inject = ['webServer']

/** Default big-model streaming ASR endpoint (push-to-talk mode). */
export const DEFAULT_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream'

/** Default resource id: 豆包流式语音识别 1.0 小时版 (granted on this account). */
export const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration'

/** Default upstream timeout for one transcription (long clips need room). */
export const DEFAULT_TIMEOUT_MS = 120_000

/** Default byte cap for one recorded clip (64 MB ≈ 33 min of 16k/16bit mono). */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/** Audio payload per frame (~200 ms at 16 kHz / 16 bit / mono). */
const FRAME_BYTES = 6400

// Binary protocol constants (openspeech big-model WebSocket).
const MSG_FULL_REQUEST = 0b0001
const MSG_AUDIO = 0b0010
const MSG_SERVER_RESPONSE = 0b1001
const MSG_SERVER_ERROR = 0b1111
const FLAG_POS_SEQ = 0b0001
const FLAG_LAST = 0b0010
const SERIAL_JSON = 0b0001
const COMPRESS_GZIP = 0b0001

/** Validated configuration shape (schema output contract). */
export interface VoiceInputConfig {
  appId: string
  accessToken: string
  resourceId: string
  wsUrl: string
  language: string
  maxBytes: number
  timeoutMs: number
}

export const Config = z.object({
  appId: z.string().default(''),
  accessToken: z.string().default(''),
  resourceId: z.string().default(DEFAULT_RESOURCE_ID),
  wsUrl: z.string().default(DEFAULT_WS_URL),
  language: z.string().default('zh'),
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
})

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

/** Parse a RIFF/WAVE header (chunk-walking, so any fmt layout works). */
export interface WavHeader {
  channels: number
  sampleRate: number
  bits: number
  dataOffset: number
  dataLength: number
}

export function parseWavHeader(buffer: Buffer): WavHeader {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('invalid audio: not a RIFF/WAVE file')
  }
  const channels = buffer.readUInt16LE(22)
  const sampleRate = buffer.readUInt32LE(24)
  const bits = buffer.readUInt16LE(34)
  let offset = 12
  let dataOffset = -1
  let dataLength = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'data') {
      dataOffset = offset + 8
      dataLength = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataOffset < 0) throw new Error('invalid audio: missing data chunk')
  return { channels, sampleRate, bits, dataOffset, dataLength }
}

/** Frame build options (exported for unit testing). */
export interface FrameOptions {
  /** Payload serialization: 1 = JSON (full request), 0 = none (audio). */
  serialization?: number
  /** Payload compression: 1 = gzip. */
  compression?: number
  /** Optional 4-byte big-endian sequence number (positive or negative). */
  sequence?: number
}

/**
 * Build one binary protocol frame: 4-byte header + optional sequence +
 * big-endian payload size + payload. Protocol version 1, header size 4.
 */
export function buildFrame(messageType: number, flags: number, payload: Buffer, options: FrameOptions = {}): Buffer {
  const header = Buffer.from([
    0x11, // protocol version 1 | header size 1 (x4 bytes)
    (messageType << 4) | flags,
    ((options.serialization ?? 0) << 4) | (options.compression ?? 0),
    0x00
  ])
  const sequence = options.sequence
  const seqBuf = sequence === undefined ? Buffer.alloc(0) : (() => {
    const buf = Buffer.alloc(4)
    buf.writeInt32BE(sequence, 0)
    return buf
  })()
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length)
  return Buffer.concat([header, seqBuf, size, payload])
}

/** Upstream settings for one transcription (exported for unit testing). */
export interface AsrUpstream {
  appId: string
  accessToken: string
  resourceId: string
  wsUrl: string
  language: string
  timeoutMs: number
}

/**
 * Transcribe one WAV clip through the openspeech big-model streaming API
 * (流式输入模式: upload everything, then the negative packet; the server
 * answers with the final result). All payloads are gzip-compressed and every
 * frame carries a sequence number, matching the reference protocol.
 * @param audio - WAV bytes
 * @param upstream - credentials and protocol settings
 * @returns the recognized text
 */
export function transcribeWav(audio: Buffer, upstream: AsrUpstream): Promise<string> {
  return new Promise((resolve, reject) => {
    let header: WavHeader
    try {
      header = parseWavHeader(audio)
    } catch (err) {
      reject(err)
      return
    }
    const pcm = audio.subarray(header.dataOffset)

    const ws = new WebSocket(upstream.wsUrl, {
      handshakeTimeout: 10_000,
      headers: {
        'X-Api-App-Key': upstream.appId,
        'X-Api-Access-Key': upstream.accessToken,
        'X-Api-Resource-Id': upstream.resourceId,
        'X-Api-Connect-Id': randomUUID()
      }
    })

    let settled = false
    let finalText = ''
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // already closed
      }
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('ASR upstream timeout'))), upstream.timeoutMs)

    const sendFrame = (messageType: number, flags: number, payload: Buffer, options: FrameOptions) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buildFrame(messageType, flags, payload, options))
    }

    ws.on('open', () => {
      const request = {
        user: { uid: upstream.appId },
        audio: {
          format: 'pcm',
          codec: 'raw',
          rate: header.sampleRate,
          bits: header.bits,
          channel: header.channels,
          language: upstream.language
        },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          enable_ddc: false,
          show_utterances: false,
          result_type: 'full'
        }
      }
      // 1) full client request (gzip + JSON + sequence 1)
      sendFrame(MSG_FULL_REQUEST, FLAG_POS_SEQ, gzipSync(Buffer.from(JSON.stringify(request))), {
        serialization: SERIAL_JSON,
        compression: COMPRESS_GZIP,
        sequence: 1
      })
      // 2) audio frames (~200 ms each); the last one is the negative packet
      let seq = 2
      for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
        const end = Math.min(offset + FRAME_BYTES, pcm.length)
        const isLast = end >= pcm.length
        sendFrame(MSG_AUDIO, isLast ? FLAG_LAST | FLAG_POS_SEQ : FLAG_POS_SEQ, gzipSync(pcm.subarray(offset, end)), {
          compression: COMPRESS_GZIP,
          sequence: isLast ? -seq : seq
        })
        if (!isLast) seq += 1
      }
      if (pcm.length === 0) {
        sendFrame(MSG_AUDIO, FLAG_LAST | FLAG_POS_SEQ, gzipSync(Buffer.alloc(0)), {
          compression: COMPRESS_GZIP,
          sequence: -seq
        })
      }
    })

    const decodePayload = (serialization: number, compression: number, payload: Buffer): unknown => {
      let decoded: Buffer = payload
      if (compression === COMPRESS_GZIP && payload.length > 0) decoded = gunzipSync(payload)
      if (serialization === SERIAL_JSON && decoded.length > 0) return JSON.parse(decoded.toString('utf8'))
      return decoded
    }

    ws.on('message', (data, isBinary) => {
      if (!isBinary || settled) return
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      if (buf.length < 4) return
      const headerSize = buf[0] & 0x0f
      const messageType = buf[1] >> 4
      const flags = buf[1] & 0x0f
      const serialization = buf[2] >> 4
      const compression = buf[2] & 0x0f
      let offset = headerSize * 4
      if (flags & FLAG_POS_SEQ) offset += 4

      if (messageType === MSG_SERVER_ERROR) {
        offset += 4 // error code
        const payloadSize = buf.readUInt32BE(offset)
        offset += 4
        let detail: unknown
        try {
          detail = decodePayload(serialization, compression, buf.subarray(offset, offset + payloadSize))
        } catch {
          detail = buf.subarray(offset, offset + payloadSize).toString('utf8')
        }
        const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
        finish(() => reject(new Error(`ASR rejected: ${text.slice(0, 300)}`)))
        return
      }

      if (messageType === MSG_SERVER_RESPONSE) {
        const payloadSize = buf.readUInt32BE(offset)
        offset += 4
        let parsed: unknown
        try {
          parsed = decodePayload(serialization, compression, buf.subarray(offset, offset + payloadSize))
        } catch {
          return // malformed frame — keep waiting
        }
        if (parsed !== null && typeof parsed === 'object') {
          const result = (parsed as { result?: { text?: unknown } }).result
          if (result !== undefined && typeof result.text === 'string' && result.text !== '') {
            finalText = result.text
          }
          if (flags & FLAG_LAST) {
            finish(() => resolve(finalText))
          }
        }
      }
      // other message types (e.g. ACK) are informational — keep waiting
    })

    ws.on('error', (err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))))
    ws.on('close', (code) => {
      if (!settled) finish(() => reject(new Error(`ASR connection closed (${code})`)))
    })
  })
}

/** Options for the asr route handler (exported for unit testing). */
export interface AsrHandlerOptions extends AsrUpstream {
  /** Hard byte cap for one request body. */
  maxBytes: number
  /** Injectable transcriber for tests (defaults to the WebSocket upstream). */
  transcribe?: (audio: Buffer) => Promise<string>
}

/**
 * Build the asr route handler (exported for unit testing).
 * @param options - upstream, admission, and (test) transcription options
 * @returns an async `(req, res)` handler
 */
export function createAsrHandler(options: AsrHandlerOptions) {
  const { appId, accessToken, resourceId, wsUrl, language, timeoutMs, maxBytes } = options
  const transcribe = options.transcribe ?? ((audio: Buffer) => transcribeWav(audio, { appId, accessToken, resourceId, wsUrl, language, timeoutMs }))
  return async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    // 1) trust fence: loopback Host + same-origin
    const host = String(req.headers?.host ?? '')
    if (!LOOPBACK_HOST.test(host)) {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'forbidden: non-loopback host' } }))
      return
    }
    const origin = req.headers?.origin
    if (origin !== undefined) {
      const scheme = (req.socket as { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http'
      if (origin !== `${scheme}://${host}`) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'forbidden: cross-origin' } }))
        return
      }
    }
    const secFetchSite = req.headers?.['sec-fetch-site']
    if (secFetchSite !== undefined && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'forbidden: cross-site' } }))
      return
    }

    // 2) health probe: the browser half pings before offering the button
    if (req.method === 'GET') {
      const configured = appId !== '' && accessToken !== ''
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, configured, resourceId }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, POST' })
      res.end('method not allowed')
      return
    }

    // 3) credentials must be present before we accept any body
    if (appId === '' || accessToken === '') {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'voice input is not configured: set appId and accessToken in the profile patch (or VOLC_APP_ID / VOLC_ACCESS_TOKEN)' } }))
      return
    }

    // 4) byte cap: declared length, then streamed count
    const declared = Number(req.headers?.['content-length'])
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.writeHead(413)
      res.end('payload too large')
      return
    }
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        res.writeHead(413)
        res.end('payload too large')
        return
      }
      chunks.push(buf)
    }
    if (total === 0) {
      res.writeHead(400)
      res.end('empty body')
      return
    }
    const audio = Buffer.concat(chunks)

    // 5) transcribe and answer
    let text: string
    try {
      text = (await transcribe(audio)).trim()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('[dsh-plugin-voice-input] transcription failed:', detail)
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: detail } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ text }))
  }
}

/** Resolve a credential: explicit config wins, then the environment. */
function resolveSecret(configValue: string, envName: string): string {
  const fromConfig = configValue.trim()
  if (fromConfig !== '') return fromConfig
  const fromEnv = process.env[envName]
  return (fromEnv ?? '').trim()
}

export function apply(ctx: Context, config: VoiceInputConfig) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error('voice-input: maxBytes must be a positive integer')
  }
  if (config.timeoutMs < 5000) {
    throw new Error('voice-input: timeoutMs must be at least 5000')
  }
  const appId = resolveSecret(config.appId, 'VOLC_APP_ID')
  const accessToken = resolveSecret(config.accessToken, 'VOLC_ACCESS_TOKEN')
  // A route conflict (another plugin already owns /api/asr) must never
  // crash the host composition: degrade gracefully — the plugin stays
  // active and the browser half reports an HTTP error the user can read.
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'prefix',
        path: '/api/asr',
        handler: createAsrHandler({
          appId,
          accessToken,
          resourceId: config.resourceId,
          wsUrl: config.wsUrl,
          language: config.language,
          maxBytes: config.maxBytes,
          timeoutMs: config.timeoutMs
        })
      })
    } catch (err) {
      console.error('[dsh-plugin-voice-input] /api/asr route registration failed (another plugin may own it); voice input will report an HTTP error:', err)
      return () => {}
    }
  })
}
