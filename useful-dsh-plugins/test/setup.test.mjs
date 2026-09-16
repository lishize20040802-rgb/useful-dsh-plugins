import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { gzipSync } from 'node:zlib'
import { PACKAGE_NAMES, sha256, validateRelease, inspectArchive, findDsh, buildPlan, preview, applySetup, applyUninstall, parseArgs, parseStoreDirMetadata, nativeCommand } from '../scripts/setup.mjs'

const json = value => JSON.stringify(value, null, 2) + '\n'
const packageManifest = (name, version) => ({ name, version, type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } })
function tarEntry(name, data, type = '0') {
  const bytes = Buffer.from(data), header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii')
  header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii')
  header.fill(32, 148, 156); header.write(type, 156, 1, 'ascii'); header.write('ustar\0', 257, 6, 'ascii')
  const checksum = header.reduce((a, b) => a + b, 0)
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)])
}
function archive(name, version = '1.2.3', extra = []) {
  return gzipSync(Buffer.concat([
    tarEntry('package/package.json', json(packageManifest(name, version))),
    tarEntry('package/cordis.patch.yml', '- insert: []\n'),
    tarEntry('package/lib/index.js', 'export const synthetic = true\n'),
    ...extra, Buffer.alloc(1024),
  ]))
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'useful-setup-'))
  t.after(async () => { assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('useful-setup-')); await fs.rm(root, { recursive: true, force: true }) })
  const home = path.join(root, 'home with spaces'), dsh = path.join(root, 'global DSH'), profile = path.join(home, 'profiles', 'web')
  await fs.mkdir(profile, { recursive: true }); await fs.mkdir(path.join(dsh, 'lib'), { recursive: true })
  await fs.writeFile(path.join(dsh, 'package.json'), json({ name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' }))
  await fs.writeFile(path.join(dsh, 'lib', 'bin.js'), '// never executed: native CLI is mocked')
  const current = { name: 'native-web-profile', dependencies: { untouched: '1.0.0', 'useful-dsh-plugins': '0.4.2' }, dsh: { profile: { bundles: ['official-bundle', 'useful-dsh-plugins'] } }, custom: { preserve: true } }
  await fs.writeFile(path.join(profile, 'package.json'), json(current))
  await fs.writeFile(path.join(profile, 'cordis.patch.yml'), '# synthetic custom data directory override, preserved byte-for-byte\n')
  await fs.writeFile(path.join(profile, 'pnpm-lock.yaml'), 'before native lock\n')
  const data = path.join(home, 'third-party', 'data', 'retained.txt')
  await fs.mkdir(path.dirname(data), { recursive: true }); await fs.writeFile(data, 'user data remains local')
  const archives = new Map(), release = { schemaVersion: 1, version: '0.5.0', tag: 'v0.5.0', packages: [] }
  for (const name of PACKAGE_NAMES) {
    const bytes = archive(name), filename = `${name}-1.2.3.tgz`
    archives.set(filename, bytes); release.packages.push({ name, version: '1.2.3', filename, sha256: sha256(bytes) })
  }
  const options = { dshHome: home, dshPackage: dsh, release, storeDir: path.join(root, 'native store') }
  const plan = await buildPlan(options), calls = [], fetched = []
  const fetch = async url => { assert.ok(url.startsWith('https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/v0.5.0/')); fetched.push(url); return new Response(archives.get(url.split('/').at(-1))) }
  const run = async command => {
    calls.push(command)
    assert.equal(command.executable, process.execPath)
    // Node receives the real script path directly, without literal quote characters.
    assert.equal(command.args[0], path.join(dsh, 'lib', 'bin.js'))
    assert.equal(command.env.DSH_HOME, home)
    const storeFlag = command.args.indexOf('--store-dir')
    assert.ok(storeFlag >= 0, 'pnpm 11 needs an explicit store option')
    assert.equal(command.args[storeFlag + 1].replace(/^"|"$/g, ''), process.platform === 'win32' ? plan.storeDir.replaceAll('\\', '/') : plan.storeDir)
    assert.equal(command.args.includes('--ignore-scripts'), !command.label.startsWith('remove'), 'remove rejects install-only flags')
    const manifestFile = path.join(profile, 'package.json'), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
    if (command.label === 'remove previous aggregate') {
      delete manifest.dependencies['useful-dsh-plugins']
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== 'useful-dsh-plugins')
    } else if (command.label === 'install five plugins') {
      for (const p of plan.packages) {
        const archivePath = process.platform === 'win32' ? p.archive.replaceAll('\\', '/') : p.archive
        assert.ok(command.args.some(arg => arg.replace(/^"|"$/g, '') === 'file:' + archivePath))
        manifest.dependencies[p.name] = 'file:' + p.archive
        if (!manifest.dsh.profile.bundles.includes(p.name)) manifest.dsh.profile.bundles.push(p.name)
        const installed = path.join(profile, 'node_modules', p.name)
        await fs.mkdir(installed, { recursive: true }); await fs.writeFile(path.join(installed, 'package.json'), json(packageManifest(p.name, p.version)))
      }
    } else if (command.label === 'refresh native lockfile') {
      for (const p of plan.packages) assert.equal(manifest.dependencies[p.name], p.dependency)
      await fs.writeFile(path.join(profile, 'pnpm-lock.yaml'), 'opaque native-generated lock\n')
    } else if (command.label === 'remove useful plugins') {
      for (const name of [...PACKAGE_NAMES, 'useful-dsh-plugins']) delete manifest.dependencies[name]
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => !PACKAGE_NAMES.includes(name) && name !== 'useful-dsh-plugins')
    } else throw new Error('Unexpected native command')
    await fs.writeFile(manifestFile, json(manifest))
  }
  return { root, home, dsh, profile, options, plan, archives, release, data, current, fetch, run, calls, fetched }
}

test('CLI and release schema reject bad commands, traversal, missing digests and unexpected versions', async t => {
  assert.deepEqual(parseArgs(['setup', '--preview', '--profile', 'web-test']), { operation: 'setup', preview: true, profile: 'web-test' })
  assert.throws(() => parseArgs(['publish']), /Expected/)
  assert.throws(() => parseArgs(['setup', '--profile']), /Missing/)
  const f = await fixture(t)
  await assert.rejects(buildPlan({ ...f.options, profile: '../../outside' }), /Profile/)
  await assert.rejects(buildPlan({ ...f.options, profile: 'desktop' }), /reserved/)
  assert.throws(() => validateRelease({ ...f.release, version: '0.6.0' }), /version/)
  assert.throws(() => validateRelease({ ...f.release, packages: [] }), /schema/)
  const bad = structuredClone(f.release); bad.packages[0].sha256 = 'missing'
  assert.throws(() => validateRelease(bad), /SHA256/)
})

test('preview has no writes or downloads and uses the actual global DSH package', async t => {
  const f = await fixture(t), before = await fs.readFile(path.join(f.profile, 'package.json'))
  const result = preview(await buildPlan(f.options))
  assert.equal(result.actualDshPackage, await fs.realpath(f.dsh))
  assert.equal(result.packages.length, 5)
  assert.equal(f.calls.length, 0); assert.equal(f.fetched.length, 0)
  assert.deepEqual(await fs.readFile(path.join(f.profile, 'package.json')), before)
  assert.deepEqual(await fs.readdir(path.join(f.home, 'third-party')), ['data'])
})

test('setup stages every package before native commands, backs up custom config and normalizes only owned dependencies', async t => {
  const f = await fixture(t)
  const result = await applySetup(f.plan, { fetch: f.fetch, run: async command => { assert.equal(f.fetched.length, 5); await f.run(command) } })
  assert.deepEqual(f.calls.map(call => call.label), ['remove previous aggregate', 'install five plugins', 'refresh native lockfile'])
  assert.equal(result.installed.length, 5)
  assert.equal(await fs.readFile(f.data, 'utf8'), 'user data remains local')
  assert.deepEqual(await fs.readFile(path.join(result.backup, 'cordis.patch.yml')), await fs.readFile(path.join(f.profile, 'cordis.patch.yml')))
  const manifest = JSON.parse(await fs.readFile(path.join(f.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies.untouched, '1.0.0'); assert.equal(manifest.custom.preserve, true)
  assert.equal(manifest.dependencies['useful-dsh-plugins'], undefined)
  for (const p of f.plan.packages) {
    assert.equal(manifest.dependencies[p.name], `file:../../third-party/archives/${p.filename}`)
    assert.equal(sha256(await fs.readFile(p.archive)), p.sha256)
    assert.equal(JSON.parse(await fs.readFile(path.join(p.expanded, 'package.json'))).name, p.name)
  }
  assert.equal(await fs.readFile(path.join(f.profile, 'pnpm-lock.yaml'), 'utf8'), 'opaque native-generated lock\n')
  await applySetup(await buildPlan(f.options), { fetch: async () => { throw new Error('Cached install must not download') }, run: f.run })
})

test('digest mismatch in the final download prevents every native operation', async t => {
  const f = await fixture(t), before = await fs.readFile(path.join(f.profile, 'package.json'))
  const last = f.release.packages.at(-1).filename
  await assert.rejects(applySetup(f.plan, { fetch: async url => url.endsWith(last) ? new Response(Buffer.from('tampered')) : f.fetch(url), run: f.run }), /SHA256 mismatch/)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(await fs.readFile(path.join(f.profile, 'package.json')), before)
  assert.equal(await fs.readFile(f.data, 'utf8'), 'user data remains local')
})

test('a matching digest cannot hide an archive with the wrong package version', async t => {
  const f = await fixture(t), first = f.release.packages[0], bytes = archive(first.name, '9.0.0')
  first.sha256 = sha256(bytes); f.archives.set(first.filename, bytes)
  await assert.rejects(applySetup(await buildPlan(f.options), { fetch: f.fetch, run: f.run }), /name, version or DSH bundle/)
  assert.equal(f.calls.length, 0)
})

test('tar inspection rejects traversal, absolute paths, links and case-insensitive duplicates', () => {
  const expected = { name: PACKAGE_NAMES[0], version: '1.2.3' }
  for (const name of ['package/../escape', '/absolute/path', 'package/a\\b', 'package/CON']) assert.throws(() => inspectArchive(archive(expected.name, expected.version, [tarEntry(name, 'bad')]), expected), /Unsafe|traversal/)
  assert.throws(() => inspectArchive(archive(expected.name, expected.version, [tarEntry('package/link', '', '2')]), expected), /entry type/)
  assert.throws(() => inspectArchive(archive(expected.name, expected.version, [tarEntry('package/LIB/index.js', 'duplicate')]), expected), /Duplicate/)
})

test('native add failure reports the backup and preserves data without claiming rollback', async t => {
  const f = await fixture(t)
  await assert.rejects(applySetup(f.plan, { fetch: f.fetch, run: async command => { if (command.label === 'install five plugins') throw new Error('mock pnpm failure'); await f.run(command) } }), /Profile backup:.*[\s\S]*no automatic rollback/)
  const after = JSON.parse(await fs.readFile(path.join(f.profile, 'package.json'), 'utf8'))
  assert.equal(after.dependencies['useful-dsh-plugins'], undefined, 'native prior removal remains visible')
  assert.equal(after.dependencies.untouched, '1.0.0')
  const backups = await fs.readdir(path.join(f.home, 'third-party', 'backups'))
  const original = JSON.parse(await fs.readFile(path.join(f.home, 'third-party', 'backups', backups[0], 'package.json')))
  assert.equal(original.dependencies['useful-dsh-plugins'], '0.4.2')
  assert.equal(await fs.readFile(f.data, 'utf8'), 'user data remains local')
})

test('uninstall uses native remove and retains archives, expanded code and all user data', async t => {
  const f = await fixture(t)
  await applySetup(f.plan, { fetch: f.fetch, run: f.run })
  const result = await applyUninstall(await buildPlan(f.options), { run: f.run })
  assert.equal(result.removed.length, 5)
  assert.equal(await fs.readFile(f.data, 'utf8'), 'user data remains local')
  for (const p of f.plan.packages) assert.equal(sha256(await fs.readFile(p.archive)), p.sha256)
  const manifest = JSON.parse(await fs.readFile(path.join(f.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies.untouched, '1.0.0')
  assert.deepEqual((await applyUninstall(await buildPlan(f.options), { run: f.run })).removed, [])
})

test('npx cached DSH peers are never accepted as the user global installation', async t => {
  const f = await fixture(t), cached = path.join(f.root, '_npx', 'peer', 'node_modules', '@deepseek-ai', 'dsh')
  await fs.mkdir(path.join(cached, 'lib'), { recursive: true })
  await fs.writeFile(path.join(cached, 'package.json'), json({ name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' }))
  await fs.writeFile(path.join(cached, 'lib', 'bin.js'), '// peer')
  await assert.rejects(findDsh({ dshPackage: cached }), /outside npx caches/)
})

test('store metadata supports pnpm YAML/JSON and removes only its version suffix', () => {
  assert.equal(parseStoreDirMetadata('storeDir: C:\\cache\\store\\v10\n'), 'C:\\cache\\store')
  assert.equal(parseStoreDirMetadata("storeDir: '/cache with spaces/store/v11'\n"), '/cache with spaces/store')
  assert.equal(parseStoreDirMetadata(JSON.stringify({ storeDir: '/cache/store/v10' })), '/cache/store')
  assert.equal(parseStoreDirMetadata('storeDir: /cache/versioned-store\n'), '/cache/versioned-store')
  assert.throws(() => parseStoreDirMetadata('storeDir: *alias\n'), /Unsupported/)
})

test('existing profile store is inferred unless explicit or environment configuration overrides it', async t => {
  const f = await fixture(t), modules = path.join(f.profile, 'node_modules')
  await fs.mkdir(modules, { recursive: true })
  const cache = path.join(f.root, 'existing pnpm store')
  await fs.writeFile(path.join(modules, '.modules.yaml'), 'storeDir: ' + JSON.stringify(path.join(cache, 'v11')) + '\n')
  const inferred = await buildPlan({ ...f.options, storeDir: undefined, env: {} })
  assert.equal(inferred.storeDir, cache); assert.equal(inferred.storeSource, 'existing-profile')
  const environment = await buildPlan({ ...f.options, storeDir: undefined, env: { npm_config_store_dir: path.join(f.root, 'environment store') } })
  assert.equal(environment.storeSource, 'environment')
  assert.equal(environment.storeDir, path.join(f.root, 'environment store'))
  const explicit = await buildPlan({ ...f.options, env: { npm_config_store_dir: 'ignored' } })
  assert.equal(explicit.storeSource, 'explicit'); assert.equal(explicit.storeDir, f.options.storeDir)
})

test('native flag grammar quotes store paths only at the inner shell and omits install flags for remove/list', async t => {
  const f = await fixture(t)
  for (const operation of ['remove', 'list']) {
    const command = nativeCommand(f.plan, [operation], 'read-only grammar check')
    assert.equal(command.args[0], path.join(f.dsh, 'lib', 'bin.js'))
    assert.deepEqual(command.args.slice(1, 4), ['plugin', '--profile', 'web'])
    assert.ok(!command.args.includes('--ignore-scripts'))
    assert.ok(!command.args.includes('--offline'))
    const store = command.args[command.args.indexOf('--store-dir') + 1]
    assert.equal(store, process.platform === 'win32' ? '"' + f.plan.storeDir.replaceAll('\\', '/') + '"' : f.plan.storeDir)
  }
  assert.ok(nativeCommand(f.plan, ['install', '--lockfile-only'], 'refresh').args.includes('--ignore-scripts'))
})
