// Updating the host is separate from managing third-party plugin rows.
// Never replace an individual official module or assume a development checkout
// is the global npm installation. The running process is left alive.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, realpath, mkdir, open, writeFile, lstat } from 'node:fs/promises'
import { dirname, join, isAbsolute, normalize } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import semver from 'semver'

const execute = promisify(execFile)
const REGISTRY = 'https://registry.npmjs.org'
const PACKAGE = '@deepseek-ai/dsh'
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }) }
function validVersion(value) { return typeof value === 'string' && value.length < 80 && semver.valid(value) === value }
async function command(npmCli, args) {
  return execute(process.execPath, [npmCli, ...args], {
    shell: false, windowsHide: true, timeout: 600_000, maxBuffer: 2 * 1024 * 1024,
  })
}
async function manifest(path) { return JSON.parse(await readFile(path, 'utf8')) }

export async function inspectHostInstallation(options = {}) {
  const unsupported = (reason, current = null) => ({ supported: false, reason, current })
  const entry = options.entry ?? process.argv[1]
  const execPath = options.execPath ?? process.execPath
  const env = options.env ?? process.env
  const run = options.run ?? command
  const platform = options.platform ?? process.platform
  if (!entry) return unsupported('The running DSH entry point could not be identified.')
  const actualEntry = await realpath(entry).catch(() => null)
  if (!actualEntry) return unsupported('The running DSH entry point no longer exists.')
  let pkgDir = dirname(actualEntry)
  let pkg
  for (let depth = 0; depth < 7; depth++) {
    pkg = await manifest(join(pkgDir, 'package.json')).catch(() => null)
    if (pkg?.name === PACKAGE) break
    const parent = dirname(pkgDir)
    if (parent === pkgDir) break
    pkgDir = parent
  }
  if (pkg?.name !== PACKAGE || !validVersion(pkg.version)) return unsupported('This process is not a recognized DSH CLI installation.')
  const candidates = [
    env.npm_execpath,
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(pkgDir)), 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean)
  let npmCli
  for (const candidate of candidates) {
    const actual = await realpath(candidate).catch(() => null)
    if (!actual) continue
    const npmPackage = await manifest(join(dirname(dirname(actual)), 'package.json')).catch(() => null)
    if (npmPackage?.name === 'npm') { npmCli = actual; break }
  }
  if (!npmCli) return unsupported('A local npm CLI could not be identified. Update through your installation manager.', pkg.version)
  let rootResult, prefixResult
  try {
    rootResult = await run(npmCli, ['root', '--global'])
    prefixResult = await run(npmCli, ['prefix', '--global'])
  } catch { return unsupported('npm global installation paths could not be inspected.', pkg.version) }
  const root = rootResult.stdout.trim()
  const prefix = prefixResult.stdout.trim()
  if (!isAbsolute(root) || !isAbsolute(prefix) || /[\r\n\0]/.test(root + prefix)) return unsupported('npm returned an invalid global path.', pkg.version)
  const samePath = (a, b) => a && b && (platform === 'win32' ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b))
  const expectedRoot = await realpath(join(prefix, ...(platform === 'win32' ? [] : ['lib']), 'node_modules')).catch(() => null)
  const actualRoot = await realpath(root).catch(() => null)
  if (!samePath(expectedRoot, actualRoot)) return unsupported('npm global root and prefix do not describe one installation.', pkg.version)
  const packagePath = join(root, '@deepseek-ai', 'dsh')
  const packageStat = await lstat(packagePath).catch(() => null)
  if (!packageStat?.isDirectory() || packageStat.isSymbolicLink()) return unsupported('Linked or development DSH installations must be updated through their original installation manager.', pkg.version)
  const expected = await realpath(packagePath).catch(() => null)
  if (!samePath(expected, await realpath(pkgDir))) return unsupported('The running DSH is not the current npm global installation. Update through the tool that installed it.', pkg.version)
  return { supported: true, reason: '', current: pkg.version, npmCli, prefix, pkgDir }
}

export async function fetchHostMetadata() {
  const response = await fetch(`${REGISTRY}/%40deepseek-ai%2Fdsh`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw fail(502, 'REGISTRY_UNAVAILABLE', 'The official npm registry could not be reached.')
  return response.json()
}

export async function hostStatus(options = {}) {
  const installed = await (options.inspect ?? inspectHostInstallation)()
  let metadata
  try { metadata = await (options.fetchMetadata ?? fetchHostMetadata)() } catch {
    return { current: installed.current, latest: null, supported: installed.supported, reason: installed.reason, updateAvailable: false, registryAvailable: false }
  }
  const tag = metadata?.['dist-tags']?.latest
  const latest = validVersion(tag) && metadata.versions?.[tag] ? tag : null
  return {
    current: installed.current, latest, supported: installed.supported,
    reason: installed.reason, registryAvailable: Boolean(latest),
    updateAvailable: Boolean(latest && installed.current && semver.gt(latest, installed.current)),
    channel: 'latest', needsRestart: false,
  }
}

export async function updateHost(body, options = {}) {
  if (body?.confirm !== true) throw fail(400, 'CONFIRM_REQUIRED', 'Confirm the DSH host update and the required restart.')
  if (!validVersion(body.version)) throw fail(400, 'INVALID_VERSION', 'An exact published semantic version is required.')
  const installed = await (options.inspect ?? inspectHostInstallation)()
  if (!installed.supported) throw fail(409, 'UNSUPPORTED_INSTALLATION', installed.reason)
  const metadata = await (options.fetchMetadata ?? fetchHostMetadata)()
  const target = metadata?.['dist-tags']?.latest
  if (target !== body.version || !metadata.versions?.[body.version]) throw fail(409, 'VERSION_CHANGED', 'The latest npm release changed. Check again before updating.')
  if (!semver.gt(body.version, installed.current)) throw fail(409, 'NO_UPGRADE', 'The selected release is not newer than the running DSH version.')
  const nodeRange = metadata.versions[body.version]?.engines?.node
  if (nodeRange && !semver.satisfies(process.versions.node, nodeRange)) throw fail(409, 'NODE_VERSION', `This DSH release requires Node.js ${nodeRange}.`)
  const dataHome = resolveDshHome(options.home)
  const updates = join(dataHome, 'third-party', 'data', 'plugin-manager', 'host-updates')
  await mkdir(updates, { recursive: true, mode: 0o700 })
  let lock
  try { lock = await open(join(updates, 'update.lock'), 'wx') } catch (error) {
    if (error.code === 'EEXIST') throw fail(409, 'UPDATE_BUSY', 'A host update is running or needs recovery. Inspect the local host-updates record before retrying.')
    throw error
  }
  const run = options.run ?? ((args) => command(installed.npmCli, args))
  const journalDir = join(updates, `${Date.now()}-${body.version}`)
  const journal = { previous: installed.current, target: body.version, status: 'preparing', prefix: installed.prefix, startedAt: new Date().toISOString() }
  const readInstalled = options.readInstalled ?? (() => manifest(join(installed.pkgDir, 'package.json')))
  let installAttempted = false
  const save = () => writeFile(join(journalDir, 'update.json'), JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 })
  try {
    await mkdir(journalDir, { recursive: true, mode: 0o700 })
    await lock.writeFile(JSON.stringify({ pid: process.pid, journal: journalDir }))
    await save()
    // Preserve the previous official release before any mutation. npm verifies
    // tarball integrity; no user config, credentials, or conversations are packed.
    const packed = await run(['pack', `${PACKAGE}@${installed.current}`, '--ignore-scripts', '--json', '--pack-destination', journalDir, `--registry=${REGISTRY}`])
    const result = JSON.parse(packed.stdout)
    if (!Array.isArray(result) || !/^[A-Za-z0-9_.-]+\.tgz$/.test(result[0]?.filename ?? '')) throw fail(502, 'BACKUP_FAILED', 'The previous DSH release could not be saved; no upgrade was attempted.')
    journal.rollbackArchive = result[0].filename
    journal.status = 'installing'
    await save()
    installAttempted = true
    await run(['install', '--global', '--prefix', installed.prefix, `${PACKAGE}@${body.version}`, `--registry=${REGISTRY}`, '--no-fund', '--no-audit'])
    if ((await readInstalled()).version !== body.version) throw fail(500, 'VERSION_MISMATCH', 'npm completed but the installed version did not match. Inspect the recovery record.')
    journal.status = 'installed-awaiting-restart'
    journal.completedAt = new Date().toISOString()
    await save()
    return { ok: true, previous: installed.current, version: body.version, needsRestart: true }
  } catch (error) {
    journal.status = 'failed'
    journal.failureCode = error.code ?? 'NPM_FAILED'
    // Best-effort restoration of the official root package. Its archive does
    // not snapshot every dependency; a restart and verification remain needed.
    // A killed npm may have surviving lifecycle children, so avoid starting a
    // competing installer in that ambiguous state.
    if (installAttempted && journal.rollbackArchive && !error.killed) {
      journal.status = 'restoring-previous-release'
      await save().catch(() => {})
      try {
        await run(['install', '--global', '--prefix', installed.prefix, join(journalDir, journal.rollbackArchive), `--registry=${REGISTRY}`, '--no-fund', '--no-audit'])
        if ((await readInstalled()).version !== installed.current) throw new Error('rollback version mismatch')
        journal.status = 'previous-release-restored'
        journal.rollback = 'root-package-version-verified; dependencies-not-snapshotted'
      } catch {
        journal.status = 'rollback-failed'
        journal.rollback = 'manual-recovery-required'
      }
    } else if (installAttempted) {
      journal.status = 'recovery-required'
    }
    await save().catch(() => {})
    // npm output may contain personal paths or credentials; keep response generic.
    if (installAttempted) {
      const restored = journal.status === 'previous-release-restored'
      throw fail(500, restored ? 'HOST_UPDATE_RESTORED' : 'HOST_UPDATE_RECOVERY_REQUIRED', restored
        ? 'DSH update failed. The previous root package version was restored; dependencies were not snapshotted. Restart and verify the host before continuing.'
        : 'DSH update failed and installation recovery is required. Do not restart until the local host-updates recovery record has been checked.')
    }
    if (error.status) throw error
    throw fail(500, 'HOST_UPDATE_FAILED', 'DSH update failed. The local host-updates record contains the previous version and recovery archive; no running session was deliberately stopped.')
  } finally {
    await lock.close()
    const { unlink } = await import('node:fs/promises')
    await unlink(join(updates, 'update.lock')).catch(() => {})
  }
}
