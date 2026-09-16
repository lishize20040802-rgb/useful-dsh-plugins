// dsh-plugin-voice-input — first-run preparation of the local engine.
//
// The plugin ships no binaries and no model, so the runtime is fetched once
// into a directory the user chose (default `<DSH_HOME>/third-party/data/voice-input`): the
// sherpa-onnx offline CLI build (`~19 MB`) and the SenseVoice-Small int8
// ONNX model (`~228 MB`). Everything here is idempotent — an existing file
// with the expected size is kept, a partial `.part` file is resumed with a
// Range request, and a finished runtime is never touched again.
//
// Downloads go through the proxy the machine already uses when one is set
// (config → `HTTPS_PROXY`/`HTTP_PROXY` → the Windows system proxy), so a
// machine behind a local proxy needs no extra configuration. Mirror hosts are
// tried in order for each artifact.
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { connect as tlsConnect } from 'node:tls'
import { URL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runtimePaths, type RuntimePaths } from './local'

/** sherpa-onnx release holding the Windows CLI build. */
export const ENGINE_VERSION = '1.13.8'

/** The Windows x64 shared build (CLI + onnxruntime DLLs, no TTS). */
export const ENGINE_ARCHIVE = `sherpa-onnx-v${ENGINE_VERSION}-win-x64-shared-MD-Release-no-tts.tar.bz2`

/** Archive root directory created by the tarball. */
export const ENGINE_ARCHIVE_ROOT = `sherpa-onnx-v${ENGINE_VERSION}-win-x64-shared-MD-Release-no-tts`

/** Exact byte size of the release asset (verified after download). */
export const ENGINE_BYTES = 19_164_933

/** Where the engine tarball is fetched from, in order. */
export const ENGINE_URLS = [
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${ENGINE_VERSION}/${ENGINE_ARCHIVE}`
]

/** The open-source model repository (FunASR SenseVoice-Small, ONNX export). */
export const MODEL_REPO = 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'

/** Model hosts, in order: the origin and its mirror. */
export const MODEL_HOSTS = [
  `https://huggingface.co/${MODEL_REPO}/resolve/main`,
  `https://hf-mirror.com/${MODEL_REPO}/resolve/main`
]

export const MODEL_RELEASE_BASE_URL = 'https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/voice-model-sensevoice-2024-07-17'

/** Model files with their exact sizes. */
export const MODEL_FILES: readonly { name: string; bytes: number; sha256: string }[] = [
  { name: 'model.int8.onnx', bytes: 239_233_841, sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51' },
  { name: 'tokens.txt', bytes: 315_894, sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc' }
]

/** Optional release asset directory; pinned model digests apply to every source. */
export function modelDownloadUrls(name: string, configured = ''): string[] {
  const base = (configured.trim() || process.env.DSH_VOICE_MODEL_BASE_URL || MODEL_RELEASE_BASE_URL).replace(/\/$/, '')
  if (base && new URL(base).protocol !== 'https:') throw new Error('modelBaseUrl must use HTTPS')
  return [...(base ? [`${base}/${name}`] : []), ...MODEL_HOSTS.map((host) => `${host}/${name}`)]
}

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Total bytes a complete first-run preparation downloads. */
export const TOTAL_BYTES = ENGINE_BYTES + MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0)

/** Progress of one download callback. */
export interface DownloadProgress {
  /** Bytes of this file already on disk. */
  received: number
  /** Expected size of this file (0 when unknown). */
  total: number
}

/** Live state of the runtime preparation, as reported to the browser half. */
export interface ProvisionState {
  active: boolean
  phase: 'idle' | 'engine' | 'model' | 'verify' | 'done' | 'failed'
  /** Human-readable step, shown while the user waits. */
  label: string
  received: number
  total: number
  error: string
  startedAt: number
  finishedAt: number
}

const states = new Map<string, ProvisionState>()
const inflight = new Map<string, Promise<RuntimePaths>>()

/** Bytes of everything already present under `paths`. */
function existingBytes(paths: RuntimePaths): number {
  let total = 0
  for (const path of [paths.exePath, paths.modelPath, paths.tokensPath]) {
    try {
      total += statSync(path).size
    } catch {
      // missing file counts as zero
    }
  }
  return total
}

/** What is present and what still has to be fetched. */
export interface RuntimeInspection {
  ready: boolean
  missing: string[]
  bytes: number
}

/** Check the runtime without touching the network. */
export function inspectRuntime(paths: RuntimePaths): RuntimeInspection {
  const missing: string[] = []
  try {
    if (statSync(paths.exePath).size < 1024 * 1024) missing.push(paths.exePath)
  } catch {
    missing.push(paths.exePath)
  }
  for (const path of [paths.modelPath, paths.tokensPath, join(paths.engineDir, 'onnxruntime.dll'), join(paths.engineDir, 'onnxruntime_providers_shared.dll')]) {
    try {
      if (statSync(path).size === 0) missing.push(path)
    } catch {
      missing.push(path)
    }
  }
  return { ready: missing.length === 0, missing, bytes: existingBytes(paths) }
}

/**
 * Runtime root used when the profile does not configure one.
 *
 * Follow the host's DSH_HOME resolution; an explicit runtimeDir still wins.
 */
export function defaultRuntimeDir(): string {
  const home = resolveDshHome()
  const legacy = join(home, 'voice-input')
  try {
    // Keep existing legacy resources in place; changing the default alone
    // must not trigger a second model download or move user-managed files.
    if (statSync(legacy).isDirectory()) return legacy
  } catch {
    // No legacy directory: use the common third-party data tree.
  }
  return join(home, 'third-party', 'data', 'voice-input')
}

/** The Windows system proxy, or `` when none is configured. */
export function systemProxy(): string {
  if (process.platform !== 'win32') return ''
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    const result = spawnSync('reg', ['query', key], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0 || typeof result.stdout !== 'string') return ''
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(result.stdout)
    const match = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(result.stdout)
    if (!enabled || match === null) return ''
    const server = (match[1] ?? '').trim()
    if (server === '') return ''
    const first = server.split(';')[0] ?? ''
    const host = (first.includes('=') ? first.split('=').slice(1).join('=') : first).trim()
    if (host === '') return ''
    return /^https?:\/\//i.test(host) ? host : `http://${host}`
  } catch {
    return ''
  }
}

/**
 * Resolve the proxy to use: explicit config, then environment, then the
 * Windows system proxy. An empty string means "connect directly".
 */
export function resolveProxy(configured?: string): string {
  const explicit = (configured ?? '').trim()
  if (explicit !== '') return explicit
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = (process.env[name] ?? '').trim()
    if (value !== '') return value
  }
  return systemProxy()
}

/** A finished HTTP response plus the stream to read it from. */
interface OpenResponse {
  status: number
  headers: http.IncomingHttpHeaders
  stream: http.IncomingMessage
}

/** GET `url`, tunnelling through `proxy` when one is configured. */
export async function openResponse(url: string, proxy: string, headers: Record<string, string>, redirects = 0): Promise<OpenResponse> {
  const target = new URL(url)
  if (target.protocol !== 'https:') throw new Error('download URL must use HTTPS')
  const response: OpenResponse = await new Promise((resolve, reject) => {
    const onResponse = (res: http.IncomingMessage) => resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res })
    const onError = (err: Error) => reject(err)
    if (proxy === '') {
      const req = https.request(
        {
          host: target.hostname,
          port: target.port === '' ? 443 : Number(target.port),
          path: `${target.pathname}${target.search}`,
          method: 'GET',
          headers
        },
        onResponse
      )
      req.on('error', onError)
      req.setTimeout(30000, () => req.destroy(new Error('download timed out')))
      req.end()
      return
    }
    const proxyUrl = new URL(/^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`)
    if (proxyUrl.protocol !== 'http:' && proxyUrl.protocol !== 'https:') {
      reject(new Error('download proxy must use HTTP or HTTPS'))
      return
    }
    const proxyHeaders: Record<string, string> = {}
    if (proxyUrl.username !== '') {
      const raw = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`
      proxyHeaders['proxy-authorization'] = `Basic ${Buffer.from(raw).toString('base64')}`
    }
    const connectReq = (proxyUrl.protocol === 'https:' ? https : http).request({
      host: proxyUrl.hostname,
      port: proxyUrl.port === '' ? (proxyUrl.protocol === 'https:' ? 443 : 80) : Number(proxyUrl.port),
      method: 'CONNECT',
      path: `${target.hostname}:${target.port === '' ? 443 : target.port}`,
      headers: proxyHeaders
    })
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`proxy refused CONNECT (${res.statusCode})`))
        return
      }
      const tlsSocket = tlsConnect({ socket, servername: target.hostname }, () => {
        const req = https.request(
          {
            host: target.hostname,
            port: target.port === '' ? 443 : Number(target.port),
            path: `${target.pathname}${target.search}`,
            method: 'GET',
            headers,
            agent: false,
            createConnection: () => tlsSocket
          },
          onResponse
        )
        req.on('error', onError)
        req.setTimeout(30000, () => req.destroy(new Error('download timed out')))
        req.end()
      })
      tlsSocket.on('error', onError)
    })
    connectReq.on('error', onError)
    connectReq.setTimeout(30000, () => connectReq.destroy(new Error('proxy connection timed out')))
    connectReq.end()
  })
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    response.stream.resume()
    if (redirects >= 5 || !response.headers.location) throw new Error('invalid or excessive download redirects')
    return openResponse(new URL(response.headers.location, target).href, proxy, headers, redirects + 1)
  }
  return response
}

/** Fetch one URL to `dest.part`, resuming, then rename it into place. */
async function fetchOne(
  url: string,
  dest: string,
  options: { proxy: string; expected: number; sha256?: string; onProgress?: (progress: DownloadProgress) => void }
): Promise<void> {
  const part = `${dest}.part`
  let start = 0
  try {
    start = (await stat(part)).size
  } catch {
    start = 0
  }
  const headers: Record<string, string> = { 'user-agent': 'dsh-plugin-voice-input' }
  if (start > 0) headers.range = `bytes=${start}-`
  const response = await openResponse(url, options.proxy, headers)
  if (response.status === 416) {
    response.stream.resume()
    // The server has nothing left to give: the partial file is the whole file.
    await rm(part, { force: true })
    throw new Error('range not satisfiable — restarting this file')
  }
  if (response.status !== 200 && response.status !== 206) {
    response.stream.resume()
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`)
  }
  const restart = response.status === 200 && start > 0
  if (response.status === 206 && !String(response.headers['content-range']).startsWith(`bytes ${start}-`)) {
    response.stream.resume()
    await rm(part, { force: true })
    throw new Error('invalid download range')
  }
  const receivedFrom = restart ? 0 : start
  const declared = Number(response.headers['content-length'] ?? 0) + receivedFrom
  const total = options.expected > 0 ? options.expected : declared
  const sink = createWriteStream(part, restart ? { flags: 'w' } : { flags: 'a' })
  let received = receivedFrom
  let lastReport = 0
  response.stream.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (options.expected > 0 && received > options.expected) {
        response.stream.destroy(new Error('download exceeds expected size'))
        return
      }
      const now = Date.now()
      if (now - lastReport > 300) {
        lastReport = now
        options.onProgress?.({ received, total })
      }
  })
  await pipeline(response.stream, sink)
  options.onProgress?.({ received, total })
  if (options.expected > 0 && received !== options.expected) {
    throw new Error(`size mismatch: expected ${options.expected} bytes, got ${received}`)
  }
  if (options.sha256 && await fileSha256(part) !== options.sha256) {
    await rm(part, { force: true })
    throw new Error('download SHA-256 mismatch')
  }
  await rename(part, dest)
}

/** Try every mirror in order, then give up with the last error. */
export async function downloadFile(
  urls: readonly string[],
  dest: string,
  options: { proxy?: string; expected?: number; sha256?: string; onProgress?: (progress: DownloadProgress) => void }
): Promise<void> {
  const expected = options.expected ?? 0
  if (expected > 0) {
    try {
      if ((await stat(dest)).size === expected && (!options.sha256 || await fileSha256(dest) === options.sha256)) {
        options.onProgress?.({ received: expected, total: expected })
        return
      }
    } catch {
      // not downloaded yet
    }
  }
  await mkdir(join(dest, '..'), { recursive: true }).catch(() => {})
  const failures: string[] = []
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await fetchOne(url, dest, { proxy: options.proxy ?? '', expected, sha256: options.sha256, onProgress: options.onProgress })
        return
      } catch (err) {
        failures.push(`${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  throw new Error(`下载失败（已尝试 ${urls.length} 个源）：${failures.slice(-3).join(' | ')}`)
}

/** Extract a .tar.bz2 archive with the tar that ships with Windows. */
export async function extractArchive(archive: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xjf', archive, '-C', destDir], { windowsHide: true })
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => reject(new Error(`无法调用 tar 解压：${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`解压失败（tar exit ${code}）：${stderr.trim().slice(0, 200)}`))
    })
  })
}

/** Current preparation state for one runtime directory. */
export function runtimeState(dir: string): ProvisionState {
  return states.get(dir) ?? {
    active: false,
    phase: 'idle',
    label: '',
    received: 0,
    total: TOTAL_BYTES,
    error: '',
    startedAt: 0,
    finishedAt: 0
  }
}

function update(dir: string, patch: Partial<ProvisionState>): void {
  const current = runtimeState(dir)
  states.set(dir, { ...current, ...patch })
}

/**
 * Download everything the local engine needs, at most once per directory.
 *
 * Two callers racing for the same directory share one promise, so a plugin
 * start and a browser request can never download the same 230 MB twice.
 */
export function ensureRuntime(options: { dir: string; proxy?: string; modelBaseUrl?: string; force?: boolean }): Promise<RuntimePaths> {
  const paths = runtimePaths(options.dir)
  if (options.force !== true && inspectRuntime(paths).ready) {
    update(options.dir, { active: false, phase: 'done', label: '本地引擎已就绪', received: TOTAL_BYTES, total: TOTAL_BYTES, error: '' })
    return Promise.resolve(paths)
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    return Promise.reject(new Error('Automatic runtime setup currently supports Windows x64 only.'))
  }
  const running = inflight.get(options.dir)
  if (running !== undefined) return running
  const task = (async () => {
    const proxy = resolveProxy(options.proxy)
    update(options.dir, { active: true, phase: 'engine', label: '准备本地识别引擎', received: 0, total: TOTAL_BYTES, error: '', startedAt: Date.now(), finishedAt: 0 })
    const cache = join(options.dir, '.cache')
    await mkdir(cache, { recursive: true })
    try {
      const engineMissing = inspectRuntime(paths).missing.some((path) => path.startsWith(paths.engineDir))
      if (engineMissing || options.force === true) {
        const archive = join(cache, ENGINE_ARCHIVE)
        await downloadFile(ENGINE_URLS, archive, {
          proxy,
          expected: ENGINE_BYTES,
          onProgress: ({ received }) => update(options.dir, { phase: 'engine', label: '下载本地识别引擎', received })
        })
        update(options.dir, { phase: 'engine', label: '解压本地识别引擎', received: ENGINE_BYTES })
        const staging = join(cache, 'engine')
        await rm(staging, { recursive: true, force: true })
        await extractArchive(archive, staging)
        await rm(paths.engineDir, { recursive: true, force: true })
        await mkdir(join(options.dir), { recursive: true })
        await rename(join(staging, ENGINE_ARCHIVE_ROOT, 'bin'), paths.engineDir)
        await rm(staging, { recursive: true, force: true })
        await rm(archive, { force: true }).catch(() => {})
      }
      await mkdir(paths.modelDir, { recursive: true })
      let modelBytes = 0
      for (const file of MODEL_FILES) {
        await downloadFile(
          modelDownloadUrls(file.name, options.modelBaseUrl),
          join(paths.modelDir, file.name),
          {
            proxy,
            expected: file.bytes,
            sha256: file.sha256,
            onProgress: ({ received }) => update(options.dir, { phase: 'model', label: '下载中文语音模型', received: ENGINE_BYTES + modelBytes + received })
          }
        )
        modelBytes += file.bytes
      }
      update(options.dir, { phase: 'verify', label: '校验本地引擎', received: TOTAL_BYTES })
      const inspection = inspectRuntime(paths)
      if (!inspection.ready) {
        throw new Error(`运行时仍不完整：缺少 ${inspection.missing.join('、')}`)
      }
      update(options.dir, { active: false, phase: 'done', label: '本地引擎已就绪', received: TOTAL_BYTES, total: TOTAL_BYTES, finishedAt: Date.now() })
      return paths
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      update(options.dir, { active: false, phase: 'failed', label: '本地引擎准备失败', error: detail, finishedAt: Date.now() })
      throw err
    } finally {
      inflight.delete(options.dir)
    }
  })()
  inflight.set(options.dir, task)
  return task
}
