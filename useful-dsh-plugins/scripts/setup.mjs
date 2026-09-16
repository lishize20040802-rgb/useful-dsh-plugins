#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PACKAGE_NAMES = Object.freeze(['dsh-plugin-doc-companion', 'dsh-plugin-vision-reader', 'dsh-plugin-voice-input', 'dsh-upload-button', 'useful-dsh-plugin-manager'])
const RELEASE_BASE = 'https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/v0.5.0/'
const SELF = 'useful-dsh-plugins'
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const MAX_ARCHIVE = 32 * 1024 * 1024, MAX_EXPANDED = 128 * 1024 * 1024
const json = value => JSON.stringify(value, null, 2) + '\n'
const slash = value => value.split(path.sep).join('/')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
async function read(file) { try { return await fs.readFile(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
async function stat(file) { try { return await fs.lstat(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
async function readJson(file) { const bytes = await read(file); return bytes === null ? null : JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }
function inside(root, target) { const rel = path.relative(root, target); return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel) }
function expandHome(value) { return value === '~' ? os.homedir() : /^~[/\\]/.test(value) ? path.join(os.homedir(), value.slice(2)) : value }

/** Refuse links under our data tree, including a link at a not-yet-created target. */
async function safeTarget(root, target) {
  if (!inside(root, target)) throw new Error('Target is outside its managed root: ' + target)
  for (let current = target; current !== root; current = path.dirname(current)) {
    const info = await stat(current)
    if (info?.isSymbolicLink()) throw new Error('Managed path must not traverse a link: ' + current)
    if (info && current !== target && !info.isDirectory()) throw new Error('Managed parent is not a directory: ' + current)
  }
}

export function validateRelease(value) {
  if (value?.schemaVersion !== 1 || value.version !== '0.5.0' || value.tag !== 'v0.5.0' || !Array.isArray(value.packages) || value.packages.length !== PACKAGE_NAMES.length) throw new Error('Unsupported release.json schema or version')
  const seen = new Set()
  for (const p of value.packages) {
    if (!PACKAGE_NAMES.includes(p.name) || seen.has(p.name)) throw new Error('Release contains an unexpected or duplicate package')
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(p.version) || p.filename !== `${p.name}-${p.version}.tgz` || !/^[a-f0-9]{64}$/.test(p.sha256)) throw new Error('Invalid package filename, version or SHA256 in release.json: ' + p.name)
    seen.add(p.name)
  }
  return value
}

async function officialPackage(candidate) {
  if (!candidate || /(?:^|[/\\])_npx(?:[/\\]|$)/i.test(candidate)) return null
  try {
    const root = await fs.realpath(candidate), metadata = await readJson(path.join(root, 'package.json'))
    if (metadata?.name !== '@deepseek-ai/dsh' || !(await stat(path.join(root, 'lib', 'bin.js')))?.isFile()) return null
    if (/(?:^|[/\\])_npx(?:[/\\]|$)/i.test(root)) return null
    return { root, executable: process.execPath, prefix: [path.join(root, 'lib', 'bin.js')], version: metadata.version }
  } catch { return null }
}

/** Resolve the user's launcher/global install, never a peer installed by npx. */
export async function findDsh(options = {}) {
  if (options.dshPackage) {
    const dsh = await officialPackage(path.resolve(options.dshPackage))
    if (!dsh) throw new Error('--dsh-package must point to an installed official @deepseek-ai/dsh package outside npx caches')
    return dsh
  }
  const env = options.env ?? process.env, candidates = []
  for (const entry of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    if (/(?:_npx|node_modules[/\\]\.bin)(?:[/\\]|$)/i.test(entry)) continue
    candidates.push(path.join(entry, 'node_modules', '@deepseek-ai', 'dsh'), path.resolve(entry, '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh'))
    try {
      const launcher = await fs.realpath(path.join(entry, 'dsh'))
      candidates.push(path.dirname(path.dirname(launcher)))
    } catch {}
  }
  if (env.APPDATA) candidates.push(path.join(env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'))
  candidates.push(path.join(path.dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh'))
  for (const candidate of [...new Set(candidates)]) { const found = await officialPackage(candidate); if (found) return found }
  throw new Error('Official DSH installation not found. Put its global launcher on PATH or pass --dsh-package PATH; npx peer copies are intentionally ignored.')
}

/** pnpm writes this field as a plain/quoted YAML scalar (JSON is valid too). */
export function parseStoreDirMetadata(text) {
  let value
  if (text.trimStart().startsWith('{')) value = JSON.parse(text).storeDir
  else {
    const raw = /^storeDir:[ \t]*(.*?)[ \t]*$/m.exec(text)?.[1]
    if (!raw) return undefined
    if (raw.startsWith('"')) value = JSON.parse(raw)
    else if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) throw new Error('Invalid quoted storeDir in pnpm metadata')
      value = raw.slice(1, -1).replaceAll("''", "'")
    } else {
      if (/^[&*!|>\[{]/.test(raw)) throw new Error('Unsupported storeDir scalar in pnpm metadata')
      value = raw.replace(/\s+#.*$/, '')
    }
  }
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) throw new Error('Invalid storeDir in pnpm metadata')
  const clean = value.trim().replace(/[/\\]+$/, '')
  return /(?:^|[/\\])v\d+$/.test(clean) ? clean.replace(/[/\\]v\d+$/, '') : clean
}

export async function buildPlan(options = {}) {
  const profile = options.profile ?? 'web'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(profile) || profile === 'desktop' || profile === 'node_modules') throw new Error('Profile must be one native profile name; desktop is reserved')
  const namedHome = options.dshHome?.trim() || process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  let home = path.resolve(expandHome(namedHome))
  if (await stat(home)) home = await fs.realpath(home)
  const dsh = await findDsh(options), release = validateRelease(options.release ?? await readJson(path.join(PACKAGE_ROOT, 'release.json')))
  const managed = path.join(home, 'third-party'), profileRoot = path.join(home, 'profiles', profile), manifest = path.join(profileRoot, 'package.json')
  await safeTarget(home, managed); await safeTarget(home, manifest)
  const current = await readJson(manifest)
  if (current && !Array.isArray(current.dsh?.profile?.bundles)) throw new Error('Existing profile is not an official initialized DSH profile')
  const packages = release.packages.map(p => ({ ...p, url: RELEASE_BASE + p.filename,
    archive: path.join(managed, 'archives', p.filename), expanded: path.join(managed, 'packages', p.name, p.version),
    dependency: 'file:' + slash(path.relative(profileRoot, path.join(managed, 'archives', p.filename))),
  }))
  for (const p of packages) { await safeTarget(home, p.archive); await safeTarget(home, p.expanded) }
  const env = options.env ?? process.env
  const metadata = await read(path.join(profileRoot, 'node_modules', '.modules.yaml'))
  const explicitStore = options.storeDir?.trim()
  const environmentStore = (env.npm_config_store_dir ?? env.NPM_CONFIG_STORE_DIR)?.trim()
  const inferredStore = !explicitStore && !environmentStore && metadata ? parseStoreDirMetadata(metadata.toString('utf8')) : undefined
  const storeValue = explicitStore || environmentStore || inferredStore
  return { home, managed, profile, profileRoot, manifest, dsh, packages, current,
    storeDir: storeValue ? path.resolve(profileRoot, expandHome(storeValue)) : undefined,
    storeSource: explicitStore ? 'explicit' : environmentStore ? 'environment' : inferredStore ? 'existing-profile' : undefined,
    testedDSHVersions: ['0.1.5-rc.2'],
  }
}

export function preview(plan, operation = 'setup') {
  return { operation, mode: 'preview', profile: plan.profile, dshHome: plan.home,
    actualDshPackage: plan.dsh.root, actualDshVersion: plan.dsh.version, testedDSHVersions: plan.testedDSHVersions,
    storeDir: plan.storeDir, storeSource: plan.storeSource,
    directories: Object.fromEntries(['archives', 'packages', 'data', 'sources', 'backups'].map(name => [name, path.join(plan.managed, name)])),
    packages: plan.packages.map(({ name, version, url, sha256, archive, expanded, dependency }) => ({ name, version, url, sha256, archive, expanded, dependency })),
    removeOldAggregate: Boolean(plan.current?.dependencies?.[SELF]),
    behavior: operation === 'uninstall' ? 'Remove the five direct plugin dependencies through official DSH. Keep archives, expanded code, sources and all data.' : 'Verify and stage all five archives before native installation. Back up profile metadata, remove any old aggregate dependency, add direct packages, normalize only their file references and ask native pnpm to refresh the lock.',
    dataPolicy: 'Existing data/config paths are preserved. This command does not edit cordis.patch.yml or relocate user data.',
    failurePolicy: 'Native command failure can leave partial profile changes. Backups are retained; no automatic rollback is claimed.',
  }
}

function tarNumber(buffer) {
  const value = buffer.toString('ascii').replace(/\0.*$/, '').trim()
  if (!/^[0-7]*$/.test(value)) throw new Error('Unsupported tar numeric encoding')
  return value ? parseInt(value, 8) : 0
}
function tarText(buffer) { return buffer.toString('utf8').replace(/\0.*$/, '') }
function archivePath(name) {
  if (!name.startsWith('package/') || name.includes('\\') || /[:\x00-\x1f\x7f]/.test(name)) throw new Error('Unsafe archive path: ' + name)
  const relative = name.slice('package/'.length).replace(/\/$/, '')
  if (!relative) return ''
  if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) throw new Error('Archive path contains traversal or ambiguous segments')
  return relative
}

/** Strict, bounded npm tar reader. Unsupported extended/link entries fail closed. */
export function inspectArchive(bytes, expected) {
  if (bytes.length > MAX_ARCHIVE) throw new Error('Archive exceeds compressed size limit')
  const tar = gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED }), entries = [], seen = new Set()
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(value => value === 0)) break
    const checksum = tarNumber(header.subarray(148, 156))
    let actual = 0
    for (let i = 0; i < 512; i++) actual += i >= 148 && i < 156 ? 32 : header[i]
    if (actual !== checksum) throw new Error('Invalid tar header checksum')
    const length = tarNumber(header.subarray(124, 136)), type = String.fromCharCode(header[156])
    if (!['0', '\0', '5'].includes(type)) throw new Error('Unsupported archive entry type (links and extended paths are forbidden)')
    const prefix = tarText(header.subarray(345, 500)), name = (prefix ? prefix + '/' : '') + tarText(header.subarray(0, 100))
    const relative = archivePath(name), key = relative.toLowerCase()
    if (seen.has(key)) throw new Error('Duplicate archive path')
    seen.add(key)
    const start = offset + 512, end = start + length
    if (end > tar.length || (type === '5' && length !== 0)) throw new Error('Truncated or malformed tar entry')
    if (relative) entries.push({ relative, directory: type === '5', bytes: tar.subarray(start, end) })
    if (entries.length > 10000) throw new Error('Archive contains too many entries')
    offset = start + Math.ceil(length / 512) * 512
  }
  const manifest = entries.find(item => item.relative === 'package.json' && !item.directory)
  if (!manifest) throw new Error('Archive has no package.json')
  const metadata = JSON.parse(manifest.bytes.toString('utf8'))
  if (metadata.name !== expected.name || metadata.version !== expected.version || typeof metadata.dsh?.bundle?.patch !== 'string') throw new Error('Archive package name, version or DSH bundle contract does not match release.json')
  const patch = metadata.dsh.bundle.patch.replace(/^\.\//, '')
  archivePath('package/' + patch)
  if (!entries.some(item => item.relative === patch && !item.directory)) throw new Error('Archive is missing its declared bundle patch')
  return entries
}

async function download(p, fetchImpl) {
  const response = await fetchImpl(p.url, { redirect: 'follow', signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error('Archive download failed: HTTP ' + response.status + ' for ' + p.filename)
  const declared = Number(response.headers?.get?.('content-length'))
  if (declared > MAX_ARCHIVE) throw new Error('Download exceeds archive size limit')
  let bytes
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = []
    let total = 0
    try { while (true) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > MAX_ARCHIVE) throw new Error('Download exceeds archive size limit'); chunks.push(Buffer.from(item.value)) } }
    finally { await reader.cancel().catch(() => {}) }
    bytes = Buffer.concat(chunks)
  } else bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_ARCHIVE || sha256(bytes) !== p.sha256) throw new Error('SHA256 mismatch for ' + p.filename)
  return bytes
}

async function extract(root, entries) {
  await fs.mkdir(root, { recursive: true })
  for (const entry of entries) {
    const target = path.join(root, ...entry.relative.split('/'))
    await safeTarget(root, target)
    if (entry.directory) await fs.mkdir(target, { recursive: true })
    else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, entry.bytes, { flag: 'wx' }) }
  }
}

/** DSH 0.1.5 forwards through a Windows shell; quote data before that boundary. */
function nativeArg(value) {
  if (process.platform !== 'win32') return value
  if (/["%!\r\n\0]/.test(value)) throw new Error('Native Windows path contains unsupported shell expansion characters')
  // Forward slashes also keep a trailing backslash from escaping a quote in
  // cmd shim -> Node argument parsing. The outer Node script path stays raw.
  value = value.replaceAll('\\', '/')
  return /[\s&|<>^()]/.test(value) ? '"' + value + '"' : value
}
export function runNative(command) {
  const child = spawnSync(command.executable, command.args, { cwd: command.cwd, env: command.env, stdio: 'inherit', windowsHide: true, shell: false, timeout: 120000 })
  if (child.error || child.status !== 0) throw new Error(command.label + ' failed: ' + (child.error?.message ?? 'exit ' + child.status))
}
export function nativeCommand(plan, args, label) {
  const env = { ...process.env, DSH_HOME: plan.home }
  delete env.npm_config_store_dir; delete env.NPM_CONFIG_STORE_DIR
  // pnpm 11 does not honor npm_config_store_dir here, and remove/list reject
  // install-only flags. Quote only forwarded arguments for DSH's inner shell.
  const flags = ['add', 'install', 'update'].includes(args[0]) ? ['--ignore-scripts'] : []
  if (plan.storeDir) flags.push('--store-dir', plan.storeDir)
  return { executable: plan.dsh.executable, args: [...plan.dsh.prefix, 'plugin', '--profile', plan.profile, ...[...args, ...flags].map(nativeArg)],
    cwd: plan.home, env, label,
  }
}
async function backup(plan) {
  const target = path.join(plan.managed, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex'))
  await safeTarget(plan.home, target); await fs.mkdir(target, { recursive: true })
  const copied = []
  for (const file of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const bytes = await read(path.join(plan.profileRoot, file))
    if (bytes) { await fs.writeFile(path.join(target, file), bytes, { flag: 'wx' }); copied.push(file) }
  }
  await fs.writeFile(path.join(target, 'backup.json'), json({ profile: plan.profile, files: copied, note: 'Metadata backup only. Native failures may leave changes; no automatic rollback.' }))
  return target
}

export async function applySetup(plan, { fetch: fetchImpl = globalThis.fetch, run = runNative } = {}) {
  await safeTarget(plan.home, plan.managed)
  for (const name of ['archives', 'packages', 'data', 'sources', 'backups']) { const target = path.join(plan.managed, name); await safeTarget(plan.home, target); await fs.mkdir(target, { recursive: true }) }
  const staging = await fs.mkdtemp(path.join(plan.managed, '.setup-'))
  let savedBackup
  try {
    const staged = []
    for (const p of plan.packages) {
      await safeTarget(plan.home, p.archive)
      const cached = await read(p.archive)
      if (cached && sha256(cached) !== p.sha256) throw new Error('Cached archive SHA256 mismatch; remove the corrupted archive and retry: ' + p.filename)
      const bytes = cached ?? await download(p, fetchImpl), entries = inspectArchive(bytes, p)
      const expanded = path.join(staging, p.name)
      await extract(expanded, entries)
      staged.push({ p, bytes, entries, expanded, cached: cached !== null })
    }
    // No native command runs until every package passes digest and structure checks.
    for (const { p, bytes, entries, expanded, cached } of staged) {
      await safeTarget(plan.home, p.archive); await safeTarget(plan.home, p.expanded)
      if (!cached) await fs.writeFile(p.archive, bytes, { flag: 'wx' })
      if (await stat(p.expanded)) {
        for (const entry of entries.filter(item => !item.directory)) {
          const target = path.join(p.expanded, ...entry.relative.split('/'))
          await safeTarget(plan.home, target)
          if (!(await read(target))?.equals(entry.bytes)) throw new Error('Existing expanded package differs from its immutable archive: ' + p.name)
        }
      } else {
        await fs.mkdir(path.dirname(p.expanded), { recursive: true })
        if (!inside(staging, expanded) || !inside(plan.managed, p.expanded)) throw new Error('Invalid package staging move')
        await fs.rename(expanded, p.expanded)
      }
    }
    savedBackup = await backup(plan)
    const before = await readJson(plan.manifest)
    if (before?.dependencies?.[SELF]) await run(nativeCommand(plan, ['remove', SELF], 'remove previous aggregate'))
    await run(nativeCommand(plan, ['add', ...plan.packages.map(p => 'file:' + p.archive)], 'install five plugins'))
    const after = await readJson(plan.manifest)
    if (!after?.dependencies) throw new Error('Native installation did not create profile dependencies')
    for (const p of plan.packages) {
      if (!after.dependencies[p.name]) throw new Error('Native installation did not declare ' + p.name)
      after.dependencies[p.name] = p.dependency
    }
    await safeTarget(plan.home, plan.manifest)
    await fs.writeFile(plan.manifest, json(after))
    await run(nativeCommand(plan, ['install', '--lockfile-only'], 'refresh native lockfile'))
    const verified = await readJson(plan.manifest)
    for (const p of plan.packages) {
      const installed = await readJson(path.join(plan.profileRoot, 'node_modules', p.name, 'package.json'))
      if (installed?.name !== p.name || installed.version !== p.version || verified.dependencies?.[p.name] !== p.dependency || !verified.dsh?.profile?.bundles?.includes(p.name)) throw new Error('Native package or bundle verification failed for ' + p.name)
    }
    return { installed: plan.packages.map(p => p.name + '@' + p.version), backup: savedBackup, profile: plan.profile, restartRequired: true, dataPreserved: true }
  } catch (error) {
    throw new Error(error.message + (savedBackup ? '\nProfile backup: ' + savedBackup + '. Native operations may have left partial changes; no automatic rollback was performed.' : '\nNo native installation was started; staged release files may remain cached.'))
  } finally {
    await safeTarget(plan.home, staging)
    if (path.dirname(staging) !== plan.managed || !path.basename(staging).startsWith('.setup-')) throw new Error('Unsafe staging cleanup')
    await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function applyUninstall(plan, { run = runNative } = {}) {
  const current = await readJson(plan.manifest), names = [...PACKAGE_NAMES, SELF].filter(name => current?.dependencies?.[name])
  if (!names.length) return { removed: [], dataPreserved: true }
  const savedBackup = await backup(plan)
  try {
    await run(nativeCommand(plan, ['remove', ...names], 'remove useful plugins'))
    const after = await readJson(plan.manifest)
    if (names.some(name => after?.dependencies?.[name])) throw new Error('Native removal left plugin dependencies installed')
    return { removed: names, backup: savedBackup, restartRequired: true, dataPreserved: true }
  } catch (error) { throw new Error(error.message + '\nProfile backup: ' + savedBackup + '. Partial native changes may remain; no automatic rollback was performed.') }
}

export function parseArgs(args) {
  const options = { operation: 'setup', preview: false }
  const values = { '--profile': 'profile', '--dsh-package': 'dshPackage', '--dsh-home': 'dshHome', '--store-dir': 'storeDir' }
  if (args[0] && !args[0].startsWith('-')) options.operation = args.shift()
  if (!['setup', 'uninstall'].includes(options.operation)) throw new Error('Expected setup or uninstall')
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--preview') options.preview = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (values[arg]) { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + arg); options[values[arg]] = args[++i] }
    else throw new Error('Unknown option: ' + arg)
  }
  return options
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) console.log('useful-dsh-plugins setup|uninstall [--preview] [--profile NAME] [--dsh-home PATH] [--dsh-package PATH] [--store-dir PATH]')
    else {
      const plan = await buildPlan(options)
      console.log(json(preview(plan, options.operation)))
      if (!options.preview) console.log(json(await (options.operation === 'uninstall' ? applyUninstall(plan) : applySetup(plan))))
    }
  } catch (error) { console.error('useful-dsh-plugins: ' + error.message); process.exitCode = 1 }
}
