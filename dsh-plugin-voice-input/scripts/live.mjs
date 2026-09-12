// Live verification: drive the built /api/asr route handler with a real WAV
// clip against the live openspeech streaming ASR endpoint.
// Requires VOLC_APP_ID + VOLC_ACCESS_TOKEN in the environment.
// Usage: node scripts/live.mjs [path-to.wav]
import { readFileSync } from 'node:fs'
import { createAsrHandler } from '../lib/index.js'

const appId = process.env.VOLC_APP_ID
const accessToken = process.env.VOLC_ACCESS_TOKEN
if (!appId || !accessToken) {
  console.error('VOLC_APP_ID and VOLC_ACCESS_TOKEN must be set')
  process.exit(2)
}

const wavPath = process.argv[2] ?? new URL('../test/sample-zh.wav', import.meta.url)

const handler = createAsrHandler({
  appId,
  accessToken,
  resourceId: 'volc.bigasr.sauc.duration',
  wsUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream',
  language: 'zh',
  maxBytes: 25 * 1024 * 1024,
  timeoutMs: 60_000
})

const body = readFileSync(wavPath)
const req = {
  method: 'POST',
  headers: {
    host: '127.0.0.1:3080',
    'content-type': 'audio/wav',
    'content-length': String(body.length)
  },
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
const res = {
  writeHead(status, headers) {
    console.log('HTTP', status)
  },
  end(payload) {
    console.log('BODY', payload)
  }
}

const started = Date.now()
await handler(req, res)
console.log(`elapsed: ${Date.now() - started}ms`)
