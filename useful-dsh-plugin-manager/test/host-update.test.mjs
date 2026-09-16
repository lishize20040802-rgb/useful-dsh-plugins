import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostStatus, updateHost, inspectHostInstallation } from '../src/host-update.js'
const metadata = { 'dist-tags': { latest: '0.2.0' }, versions: { '0.2.0': { engines: { node: '>=22' } } } }
const inspect = async () => ({ supported: true, current: '0.1.5-rc.2', prefix: '/example', pkgDir: '/example/node_modules/@deepseek-ai/dsh' })
const options = { inspect, fetchMetadata: async () => metadata }
test('host status follows latest tag, not arbitrary newest publish timestamps', async () => {
  const state = await hostStatus(options)
  assert.equal(state.latest, '0.2.0')
  assert.equal(state.updateAvailable, true)
})
test('host update rejects unconfirmed requests, shell input and unsupported installations before mutation', async () => {
  await assert.rejects(updateHost({ version: '0.2.0' }, options), { code: 'CONFIRM_REQUIRED' })
  await assert.rejects(updateHost({ version: '0.2.0 & echo injected', confirm: true }, options), { code: 'INVALID_VERSION' })
  await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, { ...options, inspect: async () => ({ supported: false, reason: 'source checkout' }) }), { code: 'UNSUPPORTED_INSTALLATION' })
})
test('host update rejects stale target and downgrade', async () => {
  await assert.rejects(updateHost({ version: '0.1.6', confirm: true }, options), { code: 'VERSION_CHANGED' })
  await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, { ...options, inspect: async () => ({ ...(await inspect()), current: '0.3.0' }) }), { code: 'NO_UPGRADE' })
})
test('host update saves recovery release before fixed-package install and checks installed version', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'))
  try {
    const calls = []
    const result = await updateHost({ version: '0.2.0', confirm: true }, {
      ...options, home,
      run: async args => { calls.push(args); return { stdout: args[0] === 'pack' ? '[{"filename":"deepseek-ai-dsh-0.1.5-rc.2.tgz"}]' : '' } },
      readInstalled: async () => ({ version: '0.2.0' }),
    })
    assert.equal(calls[0][0], 'pack')
    assert.equal(calls[1][0], 'install')
    assert.ok(calls[1].includes('@deepseek-ai/dsh@0.2.0'))
    assert.equal(result.needsRestart, true)
    const dirs = await readdir(join(home, 'third-party', 'data', 'plugin-manager', 'host-updates'))
    assert.equal(dirs.length, 1)
    const record = JSON.parse(await readFile(join(home, 'third-party', 'data', 'plugin-manager', 'host-updates', dirs[0], 'update.json'), 'utf8'))
    assert.equal(record.status, 'installed-awaiting-restart')
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('a failed backup never reaches installation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'))
  try {
    let calls = 0
    await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, { ...options, home, run: async () => { calls++; throw new Error('offline') } }), { code: 'HOST_UPDATE_FAILED' })
    assert.equal(calls, 1)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('a failed global upgrade restores the fixed previous archive and verifies its version', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'))
  try {
    const calls = []
    await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, {
      ...options, home,
      run: async args => {
        calls.push(args)
        if (args[0] === 'pack') return { stdout: '[{"filename":"previous.tgz"}]' }
        if (calls.length === 2) throw new Error('installation failed after mutation')
        return { stdout: '' }
      },
      readInstalled: async () => ({ version: '0.1.5-rc.2' }),
    }), { code: 'HOST_UPDATE_RESTORED' })
    assert.equal(calls.length, 3)
    assert.equal(calls[2][0], 'install')
    assert.equal(calls[2][3], '/example')
    assert.ok(calls[2][4].endsWith('previous.tgz'))
    const dirs = await readdir(join(home, 'third-party', 'data', 'plugin-manager', 'host-updates'))
    const record = JSON.parse(await readFile(join(home, 'third-party', 'data', 'plugin-manager', 'host-updates', dirs[0], 'update.json'), 'utf8'))
    assert.equal(record.status, 'previous-release-restored')
    assert.match(record.rollback, /dependencies-not-snapshotted/)
    assert.ok(!dirs.includes('update.lock'))
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('a failed restoration is reported as requiring recovery', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'))
  try {
    let calls = 0
    await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, {
      ...options, home,
      run: async args => { calls++; if (args[0] === 'pack') return { stdout: '[{"filename":"previous.tgz"}]' }; throw new Error('install failure') },
    }), { code: 'HOST_UPDATE_RECOVERY_REQUIRED' })
    assert.equal(calls, 3)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('a killed installer does not race another installer for rollback', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'))
  try {
    let calls = 0
    await assert.rejects(updateHost({ version: '0.2.0', confirm: true }, {
      ...options, home,
      run: async args => { calls++; if (args[0] === 'pack') return { stdout: '[{"filename":"previous.tgz"}]' }; throw Object.assign(new Error('timeout'), { killed: true }) },
    }), { code: 'HOST_UPDATE_RECOVERY_REQUIRED' })
    assert.equal(calls, 2)
  } finally { await rm(home, { recursive: true, force: true }) }
})

async function installationFixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-installation-test-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const prefix = join(base, 'prefix')
  const root = join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules')
  const pkgDir = join(root, '@deepseek-ai', 'dsh')
  const npmDir = join(root, 'npm')
  await mkdir(join(pkgDir, 'lib'), { recursive: true })
  await mkdir(join(npmDir, 'bin'), { recursive: true })
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' }))
  await writeFile(join(pkgDir, 'lib', 'bin.js'), '// synthetic fixture')
  await writeFile(join(npmDir, 'package.json'), JSON.stringify({ name: 'npm' }))
  await writeFile(join(npmDir, 'bin', 'npm-cli.js'), '// never executed')
  return {
    base, prefix, root, pkgDir,
    inspectOptions: {
      entry: join(pkgDir, 'lib', 'bin.js'), execPath: join(base, 'node'),
      env: { npm_execpath: join(npmDir, 'bin', 'npm-cli.js') },
      run: async (_, args) => ({ stdout: args[0] === 'root' ? root : prefix }),
    }
  }
}

test('installation inspection accepts a consistent npm global layout', async t => {
  const fixture = await installationFixture(t)
  const result = await inspectHostInstallation(fixture.inspectOptions)
  assert.equal(result.supported, true)
  assert.equal(result.prefix, fixture.prefix)
})

test('installation inspection rejects relative prefixes and mismatched roots', async t => {
  const fixture = await installationFixture(t)
  for (const prefix of ['relative-prefix', fixture.base]) {
    const result = await inspectHostInstallation({
      ...fixture.inspectOptions, run: async (_, args) => ({ stdout: args[0] === 'root' ? fixture.root : prefix }),
    })
    assert.equal(result.supported, false)
  }
})

test('npm-linked source checkout is not mistaken for an installed global release', async t => {
  const fixture = await installationFixture(t)
  const source = join(fixture.base, 'source-checkout')
  await mkdir(join(source, 'lib'), { recursive: true })
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' }))
  await writeFile(join(source, 'lib', 'bin.js'), '// synthetic fixture')
  await rm(fixture.pkgDir, { recursive: true, force: true })
  await symlink(source, fixture.pkgDir, process.platform === 'win32' ? 'junction' : 'dir')
  const result = await inspectHostInstallation({ ...fixture.inspectOptions, entry: join(source, 'lib', 'bin.js') })
  assert.equal(result.supported, false)
  assert.match(result.reason, /Linked or development/)
})
