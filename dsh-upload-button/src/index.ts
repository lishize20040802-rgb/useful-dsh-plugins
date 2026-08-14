// dsh-upload-button — node half (host side).
//
// Registers a /api/upload route on the host webserver:
// - POST   saves the request body to a configurable directory and answers
//          `{ path, name, bytes }`;
// - DELETE `?path=<file>` removes a previously uploaded file (path must stay
//          inside the configured directory).
//
// Security stance (the webserver does no auth by itself): loopback-host only,
// same-origin enforcement via Origin and Fetch-Metadata, POST/DELETE only, a
// hard byte cap checked both against Content-Length and while streaming,
// filename sanitization, and an optional extension whitelist.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createHash } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'upload-button'

/** Services required by the node half. */
export const inject = ['webServer']

/** Default byte cap for one upload. */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

export const Config = z.object({
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  uploadDir: z.string(),
  allowedExtensions: z.array(z.string())
})

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

/**
 * Strip path separators, parent traversal, control characters and leading
 * dots from a client-supplied file name; never empty.
 * @param raw - decoded file name
 * @returns a safe basename
 */
export function sanitizeFileName(raw) {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
  const segments = cleaned.split(/[\\/]/).filter(s => s !== '' && s !== '.' && s !== '..')
  const name = segments.join('_').replace(/^\.+/, '').trim().slice(0, 120)
  return name === '' ? 'upload.bin' : name
}

/**
 * Build the upload route handler (exported for unit testing).
 * @param {{ dir: string, maxBytes: number, allowedExtensions?: string[] }} options
 * @returns an async `(req, res)` handler
 */
export function createUploadHandler(options) {
  const { dir, maxBytes, allowedExtensions } = options
  return async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'POST, DELETE' })
      res.end('method not allowed')
      return
    }
    // 1) trust fence: loopback Host + same-origin
    const host = String(req.headers?.host ?? '')
    if (!LOOPBACK_HOST.test(host)) {
      res.writeHead(403)
      res.end('forbidden: non-loopback host')
      return
    }
    const origin = req.headers?.origin
    if (origin !== undefined) {
      const scheme = req.socket?.encrypted ? 'https' : 'http'
      if (origin !== `${scheme}://${host}`) {
        res.writeHead(403)
        res.end('forbidden: cross-origin')
        return
      }
    }
    const secFetchSite = req.headers?.['sec-fetch-site']
    if (secFetchSite !== undefined && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      res.writeHead(403)
      res.end('forbidden: cross-site')
      return
    }
    if (req.method === 'DELETE') {
      // removal: the target path must resolve inside the upload directory
      const url = new URL(req.url ?? '', 'http://localhost')
      const target = decodeURIComponent(url.searchParams.get('path') ?? '')
      if (target === '') {
        res.writeHead(400)
        res.end('missing path')
        return
      }
      const root = resolve(dir)
      const resolved = resolve(target)
      if (resolved !== root && !resolved.startsWith(root + sep)) {
        res.writeHead(403)
        res.end('path outside uploadDir')
        return
      }
      try {
        await unlink(resolved)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ removed: true }))
      } catch {
        res.writeHead(404)
        res.end('not found')
      }
      return
    }
    // 2) byte cap: declared length, then streamed count
    const declared = Number(req.headers?.['content-length'])
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.writeHead(413)
      res.end('payload too large')
      return
    }
    const chunks = []
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
      res.end('empty upload')
      return
    }
    const data = Buffer.concat(chunks)
    // 3) file name from the x-file-name header, sanitized
    let rawName = 'upload.bin'
    try {
      const header = String(req.headers?.['x-file-name'] ?? '')
      if (header !== '') rawName = decodeURIComponent(header)
    } catch {
      // keep the fallback name
    }
    const name = sanitizeFileName(rawName)
    const ext = extname(name).slice(1).toLowerCase()
    if (allowedExtensions !== undefined && allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
      res.writeHead(415)
      res.end(`extension ".${ext}" not allowed`)
      return
    }
    // 4) persist content-addressed: <sha256-prefix>-<name>. Identical content
    //    maps to the same file, so a re-upload of the same bytes succeeds by
    //    returning the existing path (content-addressed deduplication).
    try {
      await mkdir(dir, { recursive: true })
      const digest = createHash('sha256').update(data).digest('hex').slice(0, 12)
      const dest = join(dir, `${digest}-${name}`)
      let deduplicated = false
      try {
        await writeFile(dest, data, { flag: 'wx' })
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') deduplicated = true
        else throw err
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ path: dest, name, bytes: data.length, ...(deduplicated ? { deduplicated: true } : {}) }))
    } catch (err) {
      console.error('[dsh-upload-button] upload persist failed:', err)
      res.writeHead(500)
      res.end('write failed')
    }
  }
}

export function apply(ctx: Context, config) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error('upload-button: maxBytes must be a positive integer')
  }
  const dir = config.uploadDir ?? join(process.cwd(), 'uploads')
  // A route conflict (another plugin already owns /api/upload) must never
  // crash the host composition: degrade gracefully — the plugin stays
  // active and uploads simply report an HTTP error the user can read.
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'prefix',
        path: '/api/upload',
        handler: createUploadHandler({ dir, maxBytes: config.maxBytes, allowedExtensions: config.allowedExtensions })
      })
    } catch (err) {
      console.error('[dsh-upload-button] /api/upload route registration failed (another plugin may own it); uploads will fail with a clear error:', err)
      return undefined
    }
  })
}
