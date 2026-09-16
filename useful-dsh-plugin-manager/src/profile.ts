import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { open, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { parseDocument } from 'yaml'
import semver from 'semver'
import { fail, isPackageName } from './patch'

export const PACKAGE = 'useful-dsh-plugin-manager'
export const OFFICIAL = '@deepseek-ai/'
const queues = new Map<string, Promise<unknown>>()
export async function readManifest(dir: string) {
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.dsh?.profile?.bundles)) fail(409, 'INVALID_PROFILE', 'The selected directory is not a DSH profile.')
  return manifest
}
export async function resolveProfileDir(preferred?: string, profileBaseUrl?: string) {
  if (preferred || profileBaseUrl) {
    const dir = await realpath(preferred ? (isAbsolute(preferred) ? preferred : resolve(resolveDshHome(), preferred)) : fileURLToPath(profileBaseUrl))
    await readManifest(dir)
    return dir
  }
  const root = join(resolveDshHome(), 'profiles'), candidates: string[] = []
  for (const item of await readdir(root)) {
    const dir = join(root, item)
    try { if ((await readManifest(dir)).dsh.profile.bundles.includes(PACKAGE)) candidates.push(dir) } catch {}
  }
  if (candidates.length !== 1) fail(409, 'PROFILE_AMBIGUOUS', 'An unambiguous active Loader profile or explicit profileDir is required.')
  return realpath(candidates[0])
}
export async function profileStoreDir(profileDir: string) {
  let text: string
  try { text = await readFile(join(profileDir, 'node_modules', '.modules.yaml'), 'utf8') }
  catch (err) { if (err.code === 'ENOENT') return undefined; throw err }
  const doc = parseDocument(text)
  if (doc.errors.length) fail(409, 'INVALID_STORE_METADATA', 'pnpm store metadata is invalid; package changes were stopped.')
  const store = doc.get('storeDir')
  if (store === undefined) return undefined
  if (typeof store !== 'string' || !store.trim() || /[\r\n\0]/.test(store)) fail(409, 'INVALID_STORE_METADATA', 'pnpm store metadata is invalid.')
  return /[\\/]v\d+[\\/]?$/.test(store) ? dirname(store.replace(/[\\/]$/, '')) : store
}
// DSH 0.1.5 forwards pnpm arguments through cmd.exe on Windows. Only quote
// that inner boundary; Node's own script path and the DSH launcher flags stay raw.
export function nativeStoreArgument(store: string, platform: string = process.platform) {
  if (/[\r\n\0]/.test(store) || (platform === 'win32' && /["%!]/.test(store))) {
    fail(409, 'UNSUPPORTED_STORE_PATH', 'The pnpm store path contains unsupported shell expansion characters; use a store path without quotes, percent or exclamation marks.')
  }
  if (platform !== 'win32') return store
  // Forward slashes are accepted by Windows and avoid a trailing backslash
  // escaping our closing quote when a package-manager launcher starts Node.
  const value = store.replaceAll('\\', '/')
  return /[\s&|<>^()]/.test(value) ? `"${value}"` : value
}
export async function profilePackages(profileDir: string) {
  const manifest = await readManifest(profileDir)
  const direct = { ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.dependencies }
  const rows = new Map<string, any>(), seen = new Set<string>()
  let visited = 0
  const visit = async (name: string, spec: string, parent: string, owner: string, depth: number) => {
    if (!isPackageName(name) || name.startsWith(OFFICIAL) || typeof spec !== 'string') return
    if (depth > 8 || ++visited > 256) fail(409, 'BUNDLE_TREE_LIMIT', 'The installed bundle dependency tree exceeds the manager limit.')
    try {
      const location = depth === 0 ? join(parent, 'node_modules', name, 'package.json') : createRequire(join(parent, 'package.json')).resolve(`${name}/package.json`)
      const canonical = await realpath(location)
      if (seen.has(`${owner}:${canonical}`)) return
      seen.add(`${owner}:${canonical}`)
      const pkg = JSON.parse(await readFile(canonical, 'utf8'))
      if (typeof pkg.name !== 'string' || pkg.name.startsWith(OFFICIAL) || pkg.name !== name || !semver.valid(pkg.version)) return
      const previous = rows.get(name)
      if (!previous || depth === 0) rows.set(name, { name, installed: pkg.version, bundle: typeof pkg.dsh?.bundle?.patch === 'string', local: /^(?:file:|link:|workspace:|npm:|git[+:]|github:|https?:|[./\\])/i.test(spec), self: name === PACKAGE, direct: depth === 0, owner, owners: [owner] })
      else if (!previous.owners.includes(owner)) previous.owners.push(owner)
      // Only declared bundle owners can make their installed dependencies manageable.
      if (typeof pkg.dsh?.bundle?.patch === 'string') {
        for (const [child, childSpec] of Object.entries(pkg.dependencies ?? {})) await visit(child, childSpec as string, dirname(canonical), owner, depth + 1)
      }
    } catch (error) { if (error.status) throw error }
  }
  for (const [name, spec] of Object.entries(direct)) await visit(name, spec as string, profileDir, name, 0)
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
}
export async function npmLatest(name: string) {
  if (!isPackageName(name) || name.startsWith(OFFICIAL)) return null
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) return null
    const result = await response.json()
    return semver.valid(result.version) ? result.version : null
  } catch { return null }
}
export async function withProfileLock<T>(dir: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(dir) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(async () => {
    const lock = join(dir, '.plugin-manager.lock')
    let handle
    try { handle = await open(lock, 'wx', 0o600) }
    catch (err) { if (err.code === 'EEXIST') fail(409, 'PROFILE_BUSY', 'Another manager operation holds the profile lock.'); throw err }
    try { return await task() }
    finally { await handle.close(); await rm(lock, { force: true }) }
  })
  queues.set(dir, current)
  try { return await current }
  finally { if (queues.get(dir) === current) queues.delete(dir) }
}
export function hostCli() {
  try {
    const anchor = createRequire(process.argv[1]), pkgPath = anchor.resolve('@deepseek-ai/dsh/package.json'), pkg = anchor(pkgPath)
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.dsh
    return pkg.name === '@deepseek-ai/dsh' && typeof bin === 'string' ? resolve(dirname(pkgPath), bin) : undefined
  } catch { return undefined }
}
