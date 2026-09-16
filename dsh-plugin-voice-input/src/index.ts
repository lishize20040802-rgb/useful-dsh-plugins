// dsh-plugin-voice-input — node half (host side).
//
// Registers a /api/asr route on the host webserver that turns one recorded
// clip into text with a LOCAL engine: the sherpa-onnx offline CLI plus the
// open-source SenseVoice-Small ONNX model, both running on this machine's CPU
// (see src/local.ts). No credential, no cloud call, no per-use cost.
//
// - GET  answers the browser half with the bridge state — backend, engine,
//        whether the runtime is ready, and live first-run download progress;
// - POST receives raw WAV bytes and answers `{ text, ms }` with the transcript
//        produced by the local engine.
//
// The runtime (CLI ~19 MB + model ~228 MB) is fetched once by src/provision.ts
// into `runtimeDir` (default `<DSH_HOME>/third-party/data/voice-input`) on first use, through the
// proxy the machine already uses, and is never downloaded twice.
//
// Security stance (the webserver does no auth by itself): loopback-host only,
// same-origin enforcement via Origin and Fetch-Metadata, POST/GET only, a
// hard byte cap checked both against Content-Length and while streaming, and
// an engine timeout so a stalled or crashed child can never wedge the route.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { expandHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { resolve } from 'node:path'
// Type-only load activating the `ctx.webServer` declaration merge on the
// cordis Context. Erased at build.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SerialQueue, resolveThreads, runtimePaths, transcribeLocal, type EngineOptions, type RuntimePaths } from './local'
import { TOTAL_BYTES, defaultRuntimeDir, ensureRuntime, inspectRuntime, runtimeState, type ProvisionState, type RuntimeInspection } from './provision'

export { SerialQueue, buildArgs, normalizeWav, parseResult, parseWavHeader, resolveThreads, runtimePaths, transcribeLocal } from './local'
export type { EngineOptions, RuntimePaths, TranscribeOutcome, WavHeader } from './local'
export {
  ENGINE_BYTES,
  ENGINE_URLS,
  MODEL_FILES,
  MODEL_HOSTS,
  TOTAL_BYTES,
  defaultRuntimeDir,
  downloadFile,
  ensureRuntime,
  extractArchive,
  inspectRuntime,
  modelDownloadUrls,
  fileSha256,
  openResponse,
  resolveProxy,
  runtimeState,
  systemProxy
} from './provision'
export type { DownloadProgress, ProvisionState, RuntimeInspection } from './provision'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'voice-input'

/** Services required by the node half. */
export const inject = ['webServer']

/** Default sink for the engine CLI and model in DSH_HOME. */
export const FALLBACK_RUNTIME_DIR = defaultRuntimeDir()

/** Default upstream timeout for one transcription (engine startup included). */
export const DEFAULT_TIMEOUT_MS = 120_000

/** Default byte cap for one recorded clip (64 MB ≈ 33 min of 16k/16bit mono). */
export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/** Validated configuration shape (schema output contract). */
export interface VoiceInputConfig {
  runtimeDir: string
  exePath: string
  modelPath: string
  tokensPath: string
  language: string
  itn: boolean
  threads: number
  autoProvision: boolean
  proxy: string
  modelBaseUrl?: string
  maxBytes: number
  timeoutMs: number
}

export const Config = z.object({
  /** Runtime root; empty selects the third-party data directory or existing legacy directory. */
  runtimeDir: z.string().default(''),
  /** Advanced: use an engine CLI from somewhere else. */
  exePath: z.string().default(''),
  /** Advanced: use a model file from somewhere else. */
  modelPath: z.string().default(''),
  /** Advanced: use a token table from somewhere else. */
  tokensPath: z.string().default(''),
  /** SenseVoice language: auto | zh | en | ja | ko | yue. */
  language: z.string().default('zh'),
  /** Inverse text normalization (十点 → 10点). */
  itn: z.boolean().default(true),
  /** CPU threads for the ONNX session; 0 = auto (half the cores, 2…8). */
  threads: z.number().default(0),
  /** Fetch the engine and model on first use when they are missing. */
  autoProvision: z.boolean().default(true),
  /** Proxy for the first-run download; empty = HTTPS_PROXY or the Windows system proxy. */
  proxy: z.string().default(''),
  modelBaseUrl: z.string().default(''),
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
})

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

/** Options for the asr route handler (exported for unit testing). */
export interface AsrHandlerOptions {
  /** Engine paths + invocation settings. */
  engine: EngineOptions
  /** Hard byte cap for one request body. */
  maxBytes: number
  /** Fetch a missing runtime on demand. */
  autoProvision: boolean
  /** Serializes engine spawns (one 228 MB model load at a time). */
  queue: SerialQueue
  /** Runtime probe (injectable for tests). */
  inspect?: () => RuntimeInspection
  /** Runtime preparation (injectable for tests). */
  ensure?: () => Promise<RuntimePaths>
  /** Live preparation state for the health probe (injectable for tests). */
  state?: () => ProvisionState
  /** Injectable transcriber (defaults to the local engine). */
  transcribe?: (audio: Buffer) => Promise<string>
}

/** Build the asr route handler (exported for unit testing). */
export function createAsrHandler(options: AsrHandlerOptions) {
  const inspect = options.inspect ?? (() => inspectRuntime(options.engine))
  const state = options.state ?? (() => runtimeState(options.engine.dir))
  const transcribe = options.transcribe ?? ((audio: Buffer) => options.queue.run(async () => (await transcribeLocal(audio, options.engine)).text))
  return async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    // 1) trust fence: loopback peer and Host + same-origin
    const peer = req.socket?.remoteAddress
    if (peer !== '127.0.0.1' && peer !== '::1' && peer !== '::ffff:127.0.0.1') {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'forbidden: non-loopback peer' } }))
      return
    }
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

    // 2) health probe: the browser half polls this for state and progress
    if (req.method === 'GET') {
      const inspection = inspect()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        backend: 'local',
        engine: 'sense-voice',
        ready: inspection.ready,
        runtimeDir: options.engine.dir,
        missing: inspection.missing.map((path) => path.replace(/^.*[\\/]/, '')),
        downloadBytes: TOTAL_BYTES,
        provisioning: state()
      }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, POST' })
      res.end('method not allowed')
      return
    }

    // 3) the runtime must exist before any audio is accepted
    const inspection = inspect()
    if (!inspection.ready) {
      if (options.autoProvision && options.ensure !== undefined) {
        // Kick the download and answer immediately: the browser half polls the
        // GET probe for progress instead of holding a request open for minutes.
        void options.ensure().catch((err: unknown) => {
          console.error('[dsh-plugin-voice-input] runtime preparation failed:', err instanceof Error ? err.message : err)
        })
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: `本地识别引擎尚未就绪，正在首次下载（约 ${Math.round(TOTAL_BYTES / 1024 / 1024)} MB，只下载一次）。进度在输入框旁显示，完成后会自动继续。`
          },
          provisioning: true,
          runtimeDir: options.engine.dir
        }))
        return
      }
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        error: {
          message: `本地识别引擎未就绪：缺少 ${inspection.missing.map((path) => path.replace(/^.*[\\/]/, '')).join('、')}。请在该插件目录运行 npm run setup:local，或在配置里打开 autoProvision。`
        }
      }))
      return
    }

    // 4) byte cap: declared length, then streamed count
    const declared = Number(req.headers?.['content-length'])
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      res.writeHead(413)
      res.end('payload too large')
      return
    }
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > options.maxBytes) {
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

    // 5) transcribe locally and answer
    let text: string
    try {
      text = (await transcribe(audio)).trim()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('[dsh-plugin-voice-input] local transcription failed:', detail)
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: detail } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ text }))
  }
}

/**
 * Resolve the engine layout: explicit file overrides win, everything else
 * comes from `runtimeDir` (default loaded from ./provision).
 */
export function resolveEngine(config: VoiceInputConfig): EngineOptions {
  const home = resolveDshHome()
  const configuredPath = (value: string, fallback: string) => value.trim() === ''
    ? fallback
    : resolve(home, expandHomePath(value.trim()))
  const dir = configuredPath(config.runtimeDir, defaultRuntimeDir())
  const paths = runtimePaths(dir)
  return {
    ...paths,
    exePath: configuredPath(config.exePath, paths.exePath),
    modelPath: configuredPath(config.modelPath, paths.modelPath),
    tokensPath: configuredPath(config.tokensPath, paths.tokensPath),
    threads: resolveThreads(config.threads),
    language: config.language,
    itn: config.itn,
    timeoutMs: config.timeoutMs
  }
}

export function apply(ctx: Context, config: VoiceInputConfig) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error('voice-input: maxBytes must be a positive integer')
  }
  if (config.timeoutMs < 5000) {
    throw new Error('voice-input: timeoutMs must be at least 5000')
  }
  const engine = resolveEngine(config)
  const queue = new SerialQueue()
  // A route conflict (another plugin already owns /api/asr) must never crash
  // the host composition: degrade gracefully — the plugin stays active and the
  // browser half reports an HTTP error the user can read.
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'exact',
        path: '/api/asr',
        handler: createAsrHandler({
          engine,
          maxBytes: config.maxBytes,
          autoProvision: config.autoProvision,
          queue,
          ensure: () => ensureRuntime({ dir: engine.dir, proxy: config.proxy, modelBaseUrl: config.modelBaseUrl })
        })
      })
    } catch (err) {
      console.error('[dsh-plugin-voice-input] /api/asr route registration failed (another plugin may own it); voice input will report an HTTP error:', err)
      return () => {}
    }
  })
}
