// useful-dsh-plugin-manager — node half (host side).
//
// A visual plugin manager backend: HTTP routes under /api/plugin-manager that
// (a) disable/enable ANY Loader row by writing marked entries into the active
// profile's `cordis.patch.yml` (the official patch-layer mechanism — changes
// take effect on the next `dsh web` restart), and (b) check/update the
// out-of-tree packages installed in that profile against the npm registry.
//
// Security stance mirrors dsh-upload-button: loopback-only, same-origin
// Origin/Fetch-Metadata checks, JSON bodies capped, ids and package names
// validated before use.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'plugin-manager'

/** Services required by the node half. */
export const inject = ['webServer']

const MANAGED_MARKER = '# useful-dsh-plugin-manager managed entry'
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i
const DEFAULT_MAX_BODY = 64 * 1024
const execFileAsync = promisify(execFile)

export const Config = z.object({
  profileDir: z.string(),
  maxBodyBytes: z.number().default(DEFAULT_MAX_BODY)
})

// ── patch-file editing (pure text transforms, unit-tested) ─────────────────

/** Whether `id` is a sane Loader entry id / package name to write into YAML. */
export function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9@._/-]+$/.test(id) && id.length <= 200
}

/** Append one marked `disabled: true` entry for `id` (idempotent). */
export function addManagedDisable(content, id) {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i] === MANAGED_MARKER && lines[i + 1] === `- id: ${id}` && lines[i + 2] === '  disabled: true') {
      return { content, changed: false }
    }
  }
  let base = content
  if (base !== '' && !base.endsWith('\n')) base += '\n'
  return { content: `${base}\n${MANAGED_MARKER}\n- id: ${id}\n  disabled: true\n`, changed: true }
}

/** Remove the marked entry for `id`. */
export function removeManagedDisable(content, id) {
  const lines = content.split('\n')
  const kept = []
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === MANAGED_MARKER && lines[i + 1] === `- id: ${id}` && lines[i + 2] === '  disabled: true') {
      changed = true
      i += 2
      continue
    }
    kept.push(lines[i])
  }
  return { content: kept.join('\n'), changed }
}

/** Ids of every marked entry. */
export function listManaged(content) {
  const lines = content.split('\n')
  const ids = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === MANAGED_MARKER) {
      const match = /^- id: (.+)$/.exec(lines[i + 1] ?? '')
      if (match !== null) ids.push(match[1])
    }
  }
  return ids
}

/** Remove every marked entry (one-click restore). */
export function removeAllManaged(content) {
  const lines = content.split('\n')
  const kept = []
  let removed = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === MANAGED_MARKER) {
      removed++
      i += 2
      continue
    }
    kept.push(lines[i])
  }
  return { content: kept.join('\n'), removed }
}

// ── profile resolution ─────────────────────────────────────────────────────

/**
 * Locate the active profile directory: the configured value, else the
 * profile under $DSH_HOME/profiles whose bundles list this plugin or the
 * useful-dsh-plugins meta package.
 */
export async function resolveProfileDir(preferred) {
  if (preferred !== undefined && preferred !== '') return preferred
  const home = resolveDshHome()
  const profilesRoot = join(home, 'profiles')
  const names = await readdir(profilesRoot).catch(() => [])
  const candidates = []
  for (const name of names) {
    try {
      const manifest = JSON.parse(await readFile(join(profilesRoot, name, 'package.json'), 'utf8'))
      const bundles = manifest?.dsh?.profile?.bundles ?? []
      if (bundles.includes('useful-dsh-plugin-manager') || bundles.includes('useful-dsh-plugins')) {
        candidates.push(join(profilesRoot, name))
      }
    } catch {
      // not a profile directory
    }
  }
  if (candidates.length === 1) return candidates[0]
  for (const candidate of candidates) {
    try {
      await readFile(join(candidate, 'node_modules', 'useful-dsh-plugin-manager', 'package.json'), 'utf8')
      return candidate
    } catch {
      // try the next candidate
    }
  }
  if (candidates.length > 0) return candidates[0]
  throw new Error(`cannot locate the active profile under ${profilesRoot}; configure "profileDir" explicitly`)
}

// ── registry helpers ───────────────────────────────────────────────────────

async function readPkgVersion(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    return typeof pkg?.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

/** Every npm package installed in the profile's node_modules (out-of-tree). */
export async function profilePackages(profileDir) {
  const root = join(profileDir, 'node_modules')
  const entries = await readdir(root).catch(() => [])
  const out = []
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'pnpm') continue
    if (entry.startsWith('@')) {
      const subs = await readdir(join(root, entry)).catch(() => [])
      for (const sub of subs) {
        const version = await readPkgVersion(join(root, entry, sub))
        if (version !== undefined) out.push({ name: `${entry}/${sub}`, installed: version })
      }
    } else {
      const version = await readPkgVersion(join(root, entry))
      if (version !== undefined) out.push({ name: entry, installed: version })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Latest published version for one package, or null when unreachable. */
export async function npmLatest(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return null
    const json = await res.json()
    return typeof json?.version === 'string' ? json.version : null
  } catch {
    return null
  }
}

/** Registry metadata for one exact version: `{ version, tarball }` or null. */
export async function npmMetadata(name, version) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return null
    const json = await res.json()
    if (typeof json?.dist?.tarball !== 'string') return null
    return { version: json.version, tarball: json.dist.tarball }
  } catch {
    return null
  }
}

// ── package-dir resolution ─────────────────────────────────────────────────

const requireFromHere = createRequire(import.meta.url)

/**
 * Locate the on-disk directory of an installed package. Primary path: Node
 * resolution from this module (works for profile-installed third-party
 * packages). Fallback: the harness fallback directory
 * `$DSH_HOME/profiles/node_modules`, whose junction/symlink targets point at
 * the harness installation's packages (official rows).
 */
export async function installedPackageDir(name) {
  try {
    return dirname(requireFromHere.resolve(`${name}/package.json`))
  } catch {
    // fall through to the fallback-dir junction walk
  }
  const fallback = join(resolveDshHome(), 'profiles', 'node_modules')
  const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : undefined
  const base = scope !== undefined ? name.slice(name.indexOf('/') + 1) : name
  const entries = await readdir(scope !== undefined ? join(fallback, scope) : fallback).catch(() => [])
  for (const entry of entries) {
    if (scope !== undefined ? entry !== base : entry !== name) continue
    const linkPath = scope !== undefined ? join(fallback, scope, entry) : join(fallback, entry)
    try {
      const target = await readlink(linkPath)
      const resolved = resolveRelative(linkPath, target)
      try {
        await readFile(join(resolved, 'package.json'), 'utf8')
        return resolved
      } catch {
        // not a package dir
      }
    } catch {
      // not a link
    }
  }
  throw new Error(`cannot locate installed package "${name}"`)
}

function resolveRelative(linkPath, target) {
  if (target.startsWith('\\\\?\\') || /^[A-Za-z]:[\\/]/.test(target) || target.startsWith('/')) return target
  return join(dirname(linkPath), target)
}

// ── one-click repair ───────────────────────────────────────────────────────

/**
 * Restore a package to its pristine published files: download the registry
 * tarball of `version`, extract it, and replace the installed package
 * directory. `version` semantics — third-party: the currently installed
 * version; official (`@deepseek-ai/*`): the version of the installed `dsh`
 * suite, so the harness stays internally coherent.
 * @returns { ok, replaced, version, note }
 */
export async function repairPackage(name, version) {
  const meta = await npmMetadata(name, version)
  if (meta === null) throw new Error(`cannot fetch registry metadata for ${name}@${version}`)
  const targetDir = await installedPackageDir(name)
  const staging = join(targetDir, `..`, `.dsh-repair-${Date.now()}`)
  const tarballPath = `${staging}.tgz`
  try {
    await mkdir(staging, { recursive: true })
    const res = await fetch(meta.tarball, { signal: AbortSignal.timeout(120000) })
    if (!res.ok) throw new Error(`tarball download failed: HTTP ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    await writeFile(tarballPath, bytes)
    try {
      await execFileAsync('tar', ['-xzf', tarballPath, '-C', staging], { timeout: 120000, windowsHide: true })
    } catch (err) {
      throw new Error(`tar extraction failed (is tar available on PATH?): ${err?.message ?? String(err)}`)
    }
    const extracted = join(staging, 'package')
    try {
      await readFile(join(extracted, 'package.json'), 'utf8')
    } catch {
      throw new Error('tarball did not contain a package/ directory')
    }
    await rm(targetDir, { recursive: true, force: true })
    await rename(extracted, targetDir)
    return { ok: true, replaced: true, version: meta.version }
  } catch (err) {
    const message = err?.message ?? String(err)
    if (/EBUSY|EPERM|ENOTEMPTY/.test(message)) {
      return { ok: false, replaced: false, version: meta.version, note: 'package files are in use — close dsh web, restart, then click 修复 again' }
    }
    return { ok: false, replaced: false, version: meta.version, note: message }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    await rm(tarballPath, { force: true }).catch(() => {})
  }
}

// ── HTTP handler ───────────────────────────────────────────────────────────

/**
 * Build the /api/plugin-manager route handler (exported for testing).
 * The profile directory resolves lazily on first use — an unconfigured
 * `profileDir` (the common case) must never fail at plugin activation.
 * @param {{ profileDir?: string, maxBodyBytes: number }} options
 */
export function createHandler(options) {
  const { maxBodyBytes } = options
  const configuredDir = options.profileDir !== undefined && options.profileDir !== '' ? options.profileDir : undefined

  let dirPromise = null
  const dir = () => {
    if (dirPromise === null) dirPromise = resolveProfileDir(configuredDir)
    return dirPromise
  }
  const patchFile = async () => join(await dir(), 'cordis.patch.yml')

  const json = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  }

  const readPatch = async () => {
    const content = await readFile(await patchFile(), 'utf8').catch(() => '[]\n')
    return content
  }

  const writePatch = async (mutate) => {
    const before = await readPatch()
    const result = mutate(before)
    const content = result?.content ?? result
    const pf = await patchFile()
    await mkdir(dirname(pf), { recursive: true })
    const tmp = `${pf}.tmp`
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, pf)
    return result
  }

  const readBody = async (req) => {
    const chunks = []
    let total = 0
    for await (const chunk of req) {
      total += chunk.length
      if (total > maxBodyBytes) throw { status: 413, message: 'payload too large' }
      chunks.push(chunk)
    }
    if (total === 0) return {}
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw { status: 400, message: 'invalid JSON body' }
    }
  }

  return async (req, res) => {
    try {
      // trust fence: loopback + same-origin (mirrors dsh-upload-button)
      const host = String(req.headers?.host ?? '')
      if (!LOOPBACK_HOST.test(host)) return json(res, 403, { error: 'forbidden: non-loopback host' })
      const origin = req.headers?.origin
      if (origin !== undefined) {
        const scheme = req.socket?.encrypted ? 'https' : 'http'
        if (origin !== `${scheme}://${host}`) return json(res, 403, { error: 'forbidden: cross-origin' })
      }
      const secFetchSite = req.headers?.['sec-fetch-site']
      if (secFetchSite !== undefined && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        return json(res, 403, { error: 'forbidden: cross-site' })
      }

      const path = new URL(req.url ?? '', 'http://localhost').pathname

      if (path === '/api/plugin-manager/state') {
        const content = await readPatch()
        return json(res, 200, { profileDir: await dir(), managed: listManaged(content) })
      }

      if (path === '/api/plugin-manager/disable' && req.method === 'POST') {
        const body = await readBody(req)
        if (!isValidId(body?.id)) return json(res, 400, { error: 'invalid plugin id' })
        const { changed } = await writePatch(content => addManagedDisable(content, body.id))
        return json(res, 200, { ok: true, changed, needsRestart: true })
      }

      if (path === '/api/plugin-manager/enable' && req.method === 'POST') {
        const body = await readBody(req)
        if (!isValidId(body?.id)) return json(res, 400, { error: 'invalid plugin id' })
        const { changed } = await writePatch(content => removeManagedDisable(content, body.id))
        return json(res, 200, { ok: true, changed, needsRestart: true })
      }

      if (path === '/api/plugin-manager/restore' && req.method === 'POST') {
        const { removed } = await writePatch(content => removeAllManaged(content))
        return json(res, 200, { ok: true, removed, needsRestart: true })
      }

      if (path === '/api/plugin-manager/check-all' && req.method === 'POST') {
        const packages = await profilePackages(await dir())
        const rows = await Promise.all(packages.map(async pkg => {
          const latest = await npmLatest(pkg.name)
          return { name: pkg.name, installed: pkg.installed, latest, upToDate: latest === null ? null : latest === pkg.installed }
        }))
        return json(res, 200, { packages: rows })
      }

      if (path === '/api/plugin-manager/update' && req.method === 'POST') {
        const body = await readBody(req)
        // package-name shape: optionally scoped
        if (typeof body?.name !== 'string' || !/^(@[^/]+\/)?[^/]+$/.test(body.name) || body.name.length > 200) {
          return json(res, 400, { error: 'invalid package name' })
        }
        try {
          // minimumReleaseAge=0: pnpm ≥ 11.7 otherwise skips releases younger
          // than its supply-chain age gate — "update" must reach the newest
          // published version deterministically.
          await execFileAsync('pnpm', ['add', `${body.name}@latest`, '--config.minimumReleaseAge=0'], {
            cwd: await dir(),
            shell: process.platform === 'win32',
            timeout: 300000,
            maxBuffer: 1024 * 1024,
            windowsHide: true
          })
          return json(res, 200, { ok: true, needsRestart: true })
        } catch (err) {
          const detail = err?.stderr !== undefined && err.stderr !== '' ? err.stderr : err?.message ?? String(err)
          return json(res, 500, { ok: false, error: `update failed: ${detail}` })
        }
      }

      if (path === '/api/plugin-manager/repair' && req.method === 'POST') {
        const body = await readBody(req)
        if (typeof body?.name !== 'string' || !/^(@[^/]+\/)?[^/]+$/.test(body.name) || body.name.length > 200) {
          return json(res, 400, { error: 'invalid package name' })
        }
        // Repair version: official packages restore at the installed dsh
        // suite version (coherence); third-party at their installed version.
        let version
        try {
          if (body.name.startsWith('@deepseek-ai/')) {
            const suiteDir = await installedPackageDir('@deepseek-ai/dsh')
            const suite = JSON.parse(await readFile(join(suiteDir, 'package.json'), 'utf8'))
            version = typeof suite?.version === 'string' ? suite.version : undefined
            if (version === undefined) throw new Error('installed dsh suite version unknown')
          } else {
            const dir = await installedPackageDir(body.name)
            const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
            version = typeof pkg?.version === 'string' ? pkg.version : undefined
            if (version === undefined) throw new Error('installed package version unknown')
          }
        } catch (err) {
          return json(res, 500, { ok: false, error: `cannot resolve repair version: ${err?.message ?? String(err)}` })
        }
        const result = await repairPackage(body.name, version)
        return json(res, result.ok ? 200 : 500, result)
      }

      return json(res, 404, { error: 'unknown plugin-manager route' })
    } catch (err) {
      if (err?.status !== undefined) return json(res, err.status, { error: err.message })
      console.error('[useful-dsh-plugin-manager] handler error:', err)
      return json(res, 500, { error: 'internal error' })
    }
  }
}

export function apply(ctx: Context, config) {
  const dir = config.profileDir ?? undefined
  ctx.effect(() => {
    // Route conflicts must never crash the host composition (community rule).
    try {
      return ctx.webServer.register({
        kind: 'prefix',
        path: '/api/plugin-manager',
        handler: createHandler({ profileDir: dir, maxBodyBytes: config.maxBodyBytes })
      })
    } catch (err) {
      console.error('[useful-dsh-plugin-manager] /api/plugin-manager route registration failed:', err)
      return undefined
    }
  })
}
