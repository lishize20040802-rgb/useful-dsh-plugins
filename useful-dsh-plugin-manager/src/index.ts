// Only direct third-party profile packages are managed here. Official rows are protected.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import semver from 'semver'
import { fail, isValidId, isPackageName, patchDocument, listManaged, addManagedDisable, removeManagedDisable, removeAllManaged } from './patch'
import { OFFICIAL, readManifest, resolveProfileDir, profileStoreDir, nativeStoreArgument, profilePackages, npmLatest, withProfileLock, hostCli } from './profile'
import { hostStatus, updateHost } from './host-update.js'
export { isValidId, isPackageName, addManagedDisable, removeManagedDisable, listManaged, removeAllManaged, resolveProfileDir, profileStoreDir, nativeStoreArgument, profilePackages, npmLatest }

export const name = 'plugin-manager'
export const inject = ['webServer']
export const Config = z.object({ profileDir: z.string(), maxBodyBytes: z.number().default(65536) })
const execAsync = promisify(execFile)
const phases = ['pending', 'loading', 'active', 'failed', null, 'unloading']

export function createHandler(options: any = {}) {
  const maxBytes = Math.max(1024, Math.min(1024 * 1024, Number(options.maxBodyBytes) || 65536))
  const listRows = options.listRows ?? (() => [])
  const runCli = options.runCli ?? execAsync
  const latestVersion = options.latestVersion ?? npmLatest
  let profilePromise: Promise<string> | undefined
  const profile = () => profilePromise ??= resolveProfileDir(options.profileDir, options.profileBaseUrl)
  const send = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(JSON.stringify(data))
  }
  const patch = async (dir: string) => {
    const path = join(dir, 'cordis.patch.yml')
    try {
      if ((await lstat(path)).isSymbolicLink()) fail(409, 'PATCH_SYMLINK', 'The manager does not edit a linked patch file.')
      return await readFile(path, 'utf8')
    } catch (err) { if (err.code === 'ENOENT') return '[]\n'; throw err }
  }
  const snapshot = async (dir: string) => {
    const installed = await profilePackages(dir), direct = new Map(installed.map(pkg => [pkg.name, pkg]))
    const allRows = await listRows()
    if (!Array.isArray(allRows)) fail(503, 'INVENTORY_UNAVAILABLE', 'The current Loader inventory is unavailable.')
    const counts = new Map<string, number>()
    for (const row of allRows) counts.set(row.patchId ?? row.id, (counts.get(row.patchId ?? row.id) ?? 0) + 1)
    const rows = allRows.filter(row => !row.group && isValidId(row.id) && isValidId(row.patchId ?? row.id) &&
      isPackageName(row.module) && !row.module.startsWith(OFFICIAL) && direct.has(row.module) &&
      counts.get(row.patchId ?? row.id) === 1).map(row => ({ ...row, patchId: row.patchId ?? row.id,
        protected: direct.get(row.module).self || row.id === 'plugin-manager' || row.patchId === 'plugin-manager',
        owner: direct.get(row.module).owner, direct: direct.get(row.module).direct }))
    const manifest = await readManifest(dir)
    const live = (manifest.dsh.profile.patchReload ?? 'live') === 'live' && options.hasLiveReload?.() === true
    const packages = installed.filter(pkg => pkg.bundle || rows.some(row => row.module === pkg.name))
    return { rows, packages, live }
  }
  const writePatch = async (dir: string, mutate: (text: string) => any) => {
    const before = await patch(dir), result = mutate(before)
    if (result.content === before) return result
    patchDocument(result.content)
    const file = join(dir, 'cordis.patch.yml'), tmp = `${file}.manager-${randomUUID()}.tmp`
    const output = await open(tmp, 'wx', 0o600)
    try {
      await output.writeFile(result.content, 'utf8'); await output.sync(); await output.close()
      if (await patch(dir) !== before) fail(409, 'PATCH_CONFLICT', 'The profile patch changed during this operation; review it and retry.')
      await rename(tmp, file)
    } finally { await output.close().catch(() => {}); await rm(tmp, { force: true }) }
    return result
  }
  const body = async req => {
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] ?? ''))) fail(415, 'JSON_REQUIRED', 'Use application/json for manager writes.')
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length
      if (size > maxBytes) fail(413, 'BODY_TOO_LARGE', 'Request body too large.')
      chunks.push(bytes)
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
      return value
    } catch { fail(400, 'INVALID_JSON', 'Invalid JSON object.') }
  }
  const observed = async (dir: string, targets: any[], live: boolean) => {
    if (!targets.length) return { applied: true, needsRestart: false, reload: 'unchanged' }
    if (!live) return { applied: false, needsRestart: true, reload: 'startup' }
    const deadline = Date.now() + (options.observeTimeoutMs ?? 2500)
    do {
      const current = await snapshot(dir)
      if (targets.every(target => {
        const row = current.rows.find(item => item.id === target.id && item.module === target.module)
        return row && row.enabled === target.enabled && (target.enabled ? row.phase === 'active' : row.phase === null)
      })) return { applied: true, needsRestart: false, reload: 'observed' }
      if (Date.now() >= deadline) break
      await new Promise(resolve => setTimeout(resolve, 100))
    } while (true)
    return { applied: false, needsRestart: true, reload: 'not-observed' }
  }
  return async (req, res) => {
    try {
      const host = String(req.headers?.host ?? ''), remote = req.socket?.remoteAddress
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) fail(403, 'LOCAL_ONLY', 'Manager access requires a loopback connection.')
      const origin = req.headers.origin
      if (origin !== undefined && origin !== `${req.socket?.encrypted ? 'https' : 'http'}://${host}`) fail(403, 'SAME_ORIGIN', 'Cross-origin access is forbidden.')
      const site = req.headers['sec-fetch-site']
      if (site !== undefined && !['same-origin', 'none'].includes(site)) fail(403, 'SAME_ORIGIN', 'Cross-site access is forbidden.')
      const route = new URL(req.url ?? '', 'http://localhost').pathname.replace(/^\/api\/plugin-manager/, '')
      if (!['/state', '/disable', '/enable', '/restore', '/check-all', '/update', '/repair', '/host', '/host/update'].includes(route)) return send(res, 404, { error: 'Unknown manager route.' })
      if (req.method !== (['/state', '/host'].includes(route) ? 'GET' : 'POST')) return send(res, 405, { error: 'Method not allowed.' })
      if (route === '/host') return send(res, 200, await (options.hostStatus ?? hostStatus)(options.hostOptions))
      if (route === '/host/update') return send(res, 200, await (options.updateHost ?? updateHost)(await body(req), options.hostOptions))
      const dir = await profile()
      if (route === '/state') {
        const current = await snapshot(dir), managedIds = listManaged(await patch(dir))
        return send(res, 200, { ...current, paths: { base: '$DSH_HOME', profile: `profiles/${basename(dir)}`, packages: 'third-party/packages', archives: 'third-party/archives', data: 'third-party/data', voiceRuntime: 'third-party/data/voice-input' }, managed: current.rows.filter(row => !row.protected && managedIds.includes(row.patchId)).map(row => row.id) })
      }
      const data = await body(req)
      if (route === '/check-all') {
        const current = await snapshot(dir), packages = []
        for (const pkg of current.packages) {
          const latest = pkg.local ? null : await latestVersion(pkg.name)
          packages.push({ ...pkg, latest, upToDate: latest === null ? null : !semver.gt(latest, pkg.installed), canUpdate: pkg.direct && !pkg.local && !pkg.self && latest !== null && semver.gt(latest, pkg.installed) })
        }
        return send(res, 200, { packages })
      }
      const result = await withProfileLock(dir, async () => {
        // Re-read both the manifest and Loader immediately before every mutation.
        const current = await snapshot(dir)
        if (['/disable', '/enable', '/restore'].includes(route)) {
          let targets: any[] = [], change
          if (route === '/restore') {
            const allowed = new Map(current.rows.filter(row => !row.protected).map(row => [row.patchId, row.module]))
            const ids = listManaged(await patch(dir))
            targets = current.rows.filter(row => allowed.has(row.patchId) && ids.includes(row.patchId)).map(row => ({ ...row, enabled: true }))
            change = await writePatch(dir, text => removeAllManaged(text, allowed))
          } else {
            if (!isValidId(data.id)) fail(400, 'INVALID_ID', 'Invalid plugin id.')
            const row = current.rows.find(item => item.id === data.id)
            if (!row || row.protected) fail(403, 'PLUGIN_PROTECTED', 'Only current third-party rows in this profile tree can be toggled; manager and official rows are protected.')
            if (data.module !== undefined && data.module !== row.module) fail(409, 'STALE_ROW', 'The selected row changed. Refresh the manager.')
            if (route === '/enable') {
              change = await writePatch(dir, text => removeManagedDisable(text, row.patchId, row.module))
              if (!change.changed && !row.enabled) fail(409, 'USER_DISABLED', 'Another configuration layer disables this row. The manager will not overwrite it.')
            } else change = await writePatch(dir, text => addManagedDisable(text, row.patchId, row.module))
            if (change.changed) targets = [{ ...row, enabled: route === '/enable' }]
          }
          return { ok: true, ...(route === '/restore' ? { removed: change.removed } : { changed: change.changed }), ...await observed(dir, targets, current.live) }
        }
        if (!isPackageName(data.name)) fail(400, 'INVALID_PACKAGE', 'Invalid package name.')
        const pkg = current.packages.find(item => item.name === data.name)
        if (!pkg || pkg.self || data.name.startsWith(OFFICIAL)) fail(403, 'PACKAGE_PROTECTED', 'Only installed direct third-party profile packages may be changed; update the manager with the native CLI.')
        if (!pkg.direct) fail(409, 'BUNDLE_OWNED_PACKAGE', `This package is managed by its bundle owner (${pkg.owners.join(', ')}). Update or reinstall that owner; it will not be promoted to a direct dependency.`)
        if (pkg.local) fail(409, 'LOCAL_PLUGIN_SOURCE', 'This plugin uses a local or non-registry source. Rebuild, repack and install it locally with DSH; registry repair would replace that source.')
        const version = route === '/repair' ? pkg.installed : await latestVersion(pkg.name)
        if (!semver.valid(version)) fail(502, 'REGISTRY_UNAVAILABLE', 'Cannot resolve a valid package version.')
        if (route === '/update' && !semver.gt(version, pkg.installed)) return { ok: true, changed: false, needsRestart: false }
        const cli = options.cliPath ?? hostCli()
        if (!cli) fail(409, 'CLI_UNAVAILABLE', 'Cannot locate the active official DSH CLI. Use dsh plugin from a terminal.')
        const profileName = basename(dir), home = dirname(dirname(dir))
        if (!/^[A-Za-z0-9_-]+$/.test(profileName) || basename(dirname(dir)) !== 'profiles') fail(409, 'PROFILE_CLI_UNSUPPORTED', 'Native package operations require a named DSH_HOME/profiles profile.')
        const storeDir = await profileStoreDir(dir)
        const args = [cli, 'plugin', '--profile', profileName, 'add', `${pkg.name}@${version}`]
        if (storeDir !== undefined) args.push('--store-dir', nativeStoreArgument(storeDir))
        if (route === '/repair') args.push('--force')
        try {
          await runCli(process.execPath, args, { cwd: dir, shell: false, timeout: 300000, maxBuffer: 1024 * 1024, windowsHide: true,
            env: { ...process.env, DSH_HOME: home, ...(storeDir === undefined ? {} : { npm_config_store_dir: storeDir }) } })
        } catch { fail(500, 'CLI_FAILED', 'The native DSH plugin command failed. It may have partly changed the profile; inspect package and bundle state before retrying.') }
        const after = (await profilePackages(dir)).find(item => item.name === pkg.name)
        if (after?.installed !== version) fail(409, 'INSTALL_NOT_VERIFIED', 'DSH completed but the requested version was not observed. Inspect the profile before retrying.')
        return { ok: true, changed: true, version, needsRestart: true }
      })
      return send(res, 200, result)
    } catch (err) {
      return send(res, err.status ?? 500, { ok: false, code: err.code ?? 'MANAGER_ERROR', error: err.status ? err.message : 'Manager operation failed; no successful result is claimed.' })
    }
  }
}
export function apply(ctx: Context, config: any = {}) {
  let profileBaseUrl = ctx.root?.baseUrl
  if (!profileBaseUrl) { try { profileBaseUrl = ctx.get('loader')?.ctx?.root?.baseUrl } catch {} }
  const listRows = () => {
    const loader = ctx.get('loader')
    if (typeof loader?.entries !== 'function') fail(503, 'INVENTORY_UNAVAILABLE', 'The current Loader inventory is unavailable.')
    // Profile patches index their own configuration tree, including ordinary groups.
    // Loader.entries() also visits Include trees whose rows cannot be patched here.
    const tree = ctx.fiber?.entry?.parent?.tree
    if (!tree) fail(503, 'PROFILE_TREE_UNAVAILABLE', 'The current profile tree cannot be verified; plugin management is unavailable.')
    return [...loader.entries()].filter(entry => entry?.parent?.tree === tree).map(entry => ({ id: entry.id, patchId: entry.options.id, module: entry.options.name,
      group: Boolean(entry.options.group), enabled: !entry.disabled, phase: entry.fiber === undefined ? null : phases[entry.fiber.state] ?? null }))
  }
  const hasLiveReload = () => { try { return typeof ctx.get('hmr')?.registerConfig === 'function' } catch { return false } }
  ctx.effect(() => {
    try { return ctx.webServer.register({ kind: 'prefix', path: '/api/plugin-manager', handler: createHandler({ ...config, profileBaseUrl, listRows, hasLiveReload }) }) }
    catch { console.error('[useful-dsh-plugin-manager] route registration failed; the manager is unavailable.') }
  })
}
