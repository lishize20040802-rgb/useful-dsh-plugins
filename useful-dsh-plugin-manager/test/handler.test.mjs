import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { parse } from 'yaml'
import { createHandler, apply, resolveProfileDir, profileStoreDir, nativeStoreArgument, addManagedDisable } from '../lib/index.js'

function setup(t, specs = { 'my-plugin': '^1.0.0', other: '^1.0.0', 'useful-dsh-plugin-manager': '^0.3.0', '@deepseek-ai/dsh-base': '^0.1.5' }) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-manager-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const dir = join(home, 'profiles', 'web'); mkdirSync(dir, { recursive: true })
  const manifest = { dependencies: specs, dsh: { profile: { bundles: Object.keys(specs), patchReload: 'live' } } }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'cordis.patch.yml'), '# user comment\n- id: user-entry\n  config:\n    keep: true\n')
  for (const name of Object.keys(specs)) {
    const dest = join(dir, 'node_modules', name); mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  }
  const rows = [{ id: 'my-row', module: 'my-plugin', enabled: true, phase: 'active' },
    { id: 'other-row', module: 'other', enabled: true, phase: 'active' },
    { id: 'plugin-manager', module: 'useful-dsh-plugin-manager', enabled: true, phase: 'active' },
    { id: 'official', module: '@deepseek-ai/dsh-base', enabled: true, phase: 'active' },
    { id: 'hoisted', module: 'hoisted', enabled: true, phase: 'active' }]
  const options = { profileDir: dir, listRows: () => rows, maxBodyBytes: 1024, observeTimeoutMs: 0 }
  return { home, dir, rows, options, manifest, handler: createHandler(options), patch: () => readFileSync(join(dir, 'cordis.patch.yml'), 'utf8') }
}
async function call(handler, route, data, extras = {}) {
  const req = Readable.from(data === undefined ? [] : [Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))])
  req.url = '/api/plugin-manager' + route; req.method = data === undefined ? 'GET' : 'POST'
  req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json', ...extras.headers }
  req.socket = { remoteAddress: extras.remote ?? '127.0.0.1' }
  if (extras.method) req.method = extras.method
  const res = { status: 0, text: '', writeHead(status, headers) { this.status = status; this.headers = headers }, end(text) { this.text = text } }
  await handler(req, res)
  return { status: res.status, data: JSON.parse(res.text), headers: res.headers }
}

test('state exposes only direct third-party Loader rows and no machine path', async t => {
  const s = setup(t); const result = await call(s.handler, '/state')
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.rows.map(row => row.id), ['my-row', 'other-row', 'plugin-manager'])
  assert.equal(result.data.rows.find(row => row.id === 'plugin-manager').protected, true)
  assert.equal(result.data.profileDir, undefined)
  assert.equal(result.headers['cache-control'], 'no-store')
})
test('every toggle rejects official, self, unknown and hoisted rows', async t => {
  const s = setup(t); const before = s.patch()
  for (const id of ['official', 'plugin-manager', 'hoisted', 'unknown']) for (const action of ['/enable', '/disable']) {
    assert.equal((await call(s.handler, action, { id })).status, 403)
  }
  assert.equal(s.patch(), before)
})
test('enable/disable round trip uses name assertion and preserves user patch', async t => {
  const s = setup(t)
  const disabled = await call(s.handler, '/disable', { id: 'my-row', module: 'my-plugin' })
  assert.equal(disabled.status, 200); assert.equal(disabled.data.needsRestart, true)
  assert.deepEqual(parse(s.patch())[1], { id: 'my-row', name: 'my-plugin', disabled: true })
  assert.equal((await call(s.handler, '/enable', { id: 'my-row' })).status, 200)
  assert.deepEqual(parse(s.patch()), [{ id: 'user-entry', config: { keep: true } }])
  assert.match(s.patch(), /# user comment/)
})
test('refuses stale identity and a user-owned disable', async t => {
  const s = setup(t)
  assert.equal((await call(s.handler, '/disable', { id: 'my-row', module: 'old-module' })).status, 409)
  s.rows[0].enabled = false
  assert.equal((await call(s.handler, '/enable', { id: 'my-row' })).data.code, 'USER_DISABLED')
})
test('restore removes only currently permitted third-party markers', async t => {
  const s = setup(t)
  let text = s.patch()
  for (const [id, module] of [['my-row', 'my-plugin'], ['official', '@deepseek-ai/dsh-base'], ['plugin-manager', 'useful-dsh-plugin-manager'], ['missing', 'old-plugin']]) text = addManagedDisable(text, id, module).content
  writeFileSync(join(s.dir, 'cordis.patch.yml'), text)
  const res = await call(s.handler, '/restore', {})
  assert.equal(res.data.removed, 1)
  assert.deepEqual(parse(s.patch()).slice(1).map(row => row.id), ['official', 'plugin-manager', 'missing'])
})
test('parallel handlers serialize writes without losing another toggle', async t => {
  const s = setup(t), second = createHandler(s.options)
  const out = await Promise.all([call(s.handler, '/disable', { id: 'my-row' }), call(second, '/disable', { id: 'other-row' })])
  assert.deepEqual(out.map(res => res.status), [200, 200])
  assert.deepEqual(parse(s.patch()).slice(1).map(row => row.id).sort(), ['my-row', 'other-row'])
})
test('an existing lock or invalid YAML is not overwritten', async t => {
  const s = setup(t)
  writeFileSync(join(s.dir, '.plugin-manager.lock'), 'external operation')
  assert.equal((await call(s.handler, '/disable', { id: 'my-row' })).data.code, 'PROFILE_BUSY')
  rmSync(join(s.dir, '.plugin-manager.lock'))
  writeFileSync(join(s.dir, 'cordis.patch.yml'), '[]\n- id: invalid')
  const before = s.patch()
  assert.equal((await call(s.handler, '/disable', { id: 'my-row' })).status, 409)
  assert.equal(s.patch(), before)
})
test('reports live only when actual enabled and fiber state were observed', async t => {
  const s = setup(t)
  const handler = createHandler({ ...s.options, hasLiveReload: () => true, listRows: () => {
    const disabled = parse(s.patch()).some(row => row.id === 'my-row' && row.disabled)
    return s.rows.map(row => row.id === 'my-row' ? { ...row, enabled: !disabled, phase: disabled ? null : 'active' } : row)
  } })
  const result = await call(handler, '/disable', { id: 'my-row' })
  assert.equal(result.data.reload, 'observed'); assert.equal(result.data.needsRestart, false)
  assert.equal((await call(handler, '/enable', { id: 'my-row' })).data.applied, true)
  const unobserved = createHandler({ ...s.options, hasLiveReload: () => true })
  assert.equal((await call(unobserved, '/disable', { id: 'my-row' })).data.reload, 'not-observed')
})
test('rechecks changed manifest before mutating', async t => {
  const s = setup(t)
  delete s.manifest.dependencies['my-plugin']
  writeFileSync(join(s.dir, 'package.json'), JSON.stringify(s.manifest))
  assert.equal((await call(s.handler, '/disable', { id: 'my-row' })).status, 403)
})
test('declared bundle children are toggleable but remain owned by their aggregate', async t => {
  const s = setup(t, { 'suite-bundle': '^1.0.0' })
  const bundle = join(s.dir, 'node_modules', 'suite-bundle')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'suite-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } }, dependencies: { 'my-plugin': '^1.0.0', '@deepseek-ai/dsh-base': '^0.1.5' } }))
  const child = join(bundle, 'node_modules', 'my-plugin'); mkdirSync(child, { recursive: true })
  writeFileSync(join(child, 'package.json'), JSON.stringify({ name: 'my-plugin', version: '1.0.0' }))
  const state = await call(s.handler, '/state')
  assert.equal(state.data.rows.length, 1)
  assert.equal(state.data.rows[0].owner, 'suite-bundle')
  assert.equal(state.data.rows[0].direct, false)
  assert.equal((await call(s.handler, '/disable', { id: 'my-row' })).status, 200)
  for (const route of ['/update', '/repair']) assert.equal((await call(s.handler, route, { name: 'my-plugin' })).data.code, 'BUNDLE_OWNED_PACKAGE')
  assert.deepEqual(JSON.parse(readFileSync(join(s.dir, 'package.json'), 'utf8')).dependencies, { 'suite-bundle': '^1.0.0' })
})
test('aliases of official packages and ambiguous Loader ids are excluded', async t => {
  const s = setup(t)
  writeFileSync(join(s.dir, 'node_modules', 'my-plugin', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-base', version: '1.0.0' }))
  assert.equal((await call(s.handler, '/disable', { id: 'my-row' })).status, 403)
  s.rows.push({ ...s.rows[1], id: 'duplicate', patchId: 'other-row' })
  assert.equal((await call(s.handler, '/disable', { id: 'other-row' })).status, 403)
})
test('rejects shell package syntax and official repair/update through direct HTTP', async t => {
  const s = setup(t)
  for (const name of ['x&calc', 'x;calc', '-g', 'x@1.0', 'x%PATH%', 'x/../../a', 'x y', 'x`id`']) {
    assert.equal((await call(s.handler, '/update', { name })).status, 400)
  }
  for (const name of ['@deepseek-ai/dsh-base', 'useful-dsh-plugin-manager', 'missing']) for (const route of ['/update', '/repair']) {
    assert.equal((await call(s.handler, route, { name })).status, 403)
  }
  assert.equal((await call(s.handler, '/update-harness', {})).status, 404)
})
test('local package sources are preserved without registry calls', async t => {
  const s = setup(t, { 'my-plugin': 'file:../../plugin.tgz' })
  const handler = createHandler({ ...s.options, latestVersion: () => { throw new Error('must not fetch') } })
  for (const route of ['/update', '/repair']) assert.equal((await call(handler, route, { name: 'my-plugin' })).data.code, 'LOCAL_PLUGIN_SOURCE')
  assert.equal((await call(handler, '/check-all', {})).data.packages[0].local, true)
})
test('native DSH CLI receives an explicit quoted store argument while keeping its Node prefix raw', async t => {
  const s = setup(t), calls = []
  writeFileSync(join(s.dir, 'node_modules', '.modules.yaml'), 'storeDir: "D:/shared pnpm store/v11"\n')
  const handler = createHandler({ ...s.options, latestVersion: async () => '1.1.0', cliPath: '/official DSH/lib/bin.js', runCli: async (...args) => {
    calls.push(args)
    writeFileSync(join(s.dir, 'node_modules', 'my-plugin', 'package.json'), JSON.stringify({ name: 'my-plugin', version: '1.1.0' }))
  } })
  const out = await call(handler, '/update', { name: 'my-plugin' })
  assert.equal(out.status, 200); assert.equal(out.data.version, '1.1.0')
  assert.equal(calls[0][0], process.execPath)
  assert.deepEqual(calls[0][1], ['/official DSH/lib/bin.js', 'plugin', '--profile', 'web', 'add', 'my-plugin@1.1.0', '--store-dir',
    process.platform === 'win32' ? '"D:/shared pnpm store"' : 'D:/shared pnpm store'])
  assert.equal(calls[0][2].shell, false)
  assert.equal(calls[0][2].env.DSH_HOME, s.home)
  assert.equal(calls[0][2].env.npm_config_store_dir.replaceAll('\\', '/'), 'D:/shared pnpm store')
  assert.equal(out.data.needsRestart, true)
})

test('Windows store paths reject expansion syntax before starting a package command', async t => {
  const s = setup(t), file = join(s.dir, 'node_modules', '.modules.yaml')
  for (const value of ['D:/store%PATH%', 'D:/store!value!', 'D:/store"quote', 'D:/store\nline', 'D:/store\rline', 'D:/store\0nul']) {
    assert.throws(() => nativeStoreArgument(value, 'win32'), { code: 'UNSUPPORTED_STORE_PATH' })
  }
  assert.equal(nativeStoreArgument('D:/ordinary-store', 'win32'), 'D:/ordinary-store')
  assert.equal(nativeStoreArgument('D:\\shared store\\', 'win32'), '"D:/shared store/"')
  assert.equal(nativeStoreArgument('/store with spaces', 'linux'), '/store with spaces')
  if (process.platform === 'win32') {
    const handler = createHandler({ ...s.options, latestVersion: async () => '1.1.0', cliPath: '/official/bin.js', runCli: () => assert.fail('must not launch') })
    for (const storeDir of ['D:/store%PATH%/v11', 'D:/store!value!/v11', 'D:/store"quote/v11']) {
      writeFileSync(file, JSON.stringify({ storeDir }))
      assert.equal((await call(handler, '/update', { name: 'my-plugin' })).data.code, 'UNSUPPORTED_STORE_PATH')
    }
  }
})

test('Windows native shell forwards a quoted store as one literal pnpm argument', { skip: process.platform !== 'win32' }, t => {
  const s = setup(t), shim = join(s.home, 'pnpm.cmd'), capture = join(s.home, 'capture.cjs')
  writeFileSync(capture, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
  writeFileSync(shim, `@"${process.execPath}" "${capture}" %*\r\n`)
  for (const store of ['D:/shared pnpm store', 'D:/store & (other)^name', 'D:\\shared store\\']) {
    const out = spawnSync('pnpm', ['list', '--store-dir', nativeStoreArgument(store)], {
      cwd: s.home, shell: true, windowsHide: true, encoding: 'utf8', timeout: 15000,
    })
    assert.equal(out.status, 0, out.stderr)
    assert.deepEqual(JSON.parse(out.stdout), ['list', '--store-dir', store.replaceAll('\\', '/')])
  }
})
test('CLI partial failure is reported without overwriting official or user files', async t => {
  const s = setup(t), before = s.patch()
  const handler = createHandler({ ...s.options, latestVersion: async () => '1.1.0', cliPath: '/official/bin.js', runCli: async () => { throw new Error('secret-bearing output must not be returned') } })
  const out = await call(handler, '/update', { name: 'my-plugin' })
  assert.equal(out.status, 500); assert.equal(out.data.code, 'CLI_FAILED')
  assert.doesNotMatch(out.data.error, /secret-bearing/); assert.equal(s.patch(), before)
})
test('does not downgrade or claim success when requested version is absent', async t => {
  const s = setup(t)
  const handler = createHandler({ ...s.options, latestVersion: async () => '0.9.0', runCli: () => assert.fail('must not run') })
  assert.equal((await call(handler, '/update', { name: 'my-plugin' })).data.changed, false)
  const stale = createHandler({ ...s.options, latestVersion: async () => '1.1.0', cliPath: '/official/bin.js', runCli: async () => {} })
  assert.equal((await call(stale, '/update', { name: 'my-plugin' })).data.code, 'INSTALL_NOT_VERIFIED')
})
test('pnpm YAML and JSON metadata are parsed, malformed metadata fails closed', async t => {
  const s = setup(t), file = join(s.dir, 'node_modules', '.modules.yaml')
  for (const text of ['storeDir: /store/v11\n', '{"storeDir":"/store/v11"}']) {
    writeFileSync(file, text); assert.match(await profileStoreDir(s.dir), /[\\/]store$/)
  }
  writeFileSync(file, '[ invalid')
  await assert.rejects(profileStoreDir(s.dir), { code: 'INVALID_STORE_METADATA' })
})
test('HTTP trust fence checks socket, host, origin, metadata, method and JSON size', async t => {
  const s = setup(t)
  for (const extras of [{ remote: '192.0.2.9' }, { headers: { host: 'evil.example' } }, { headers: { origin: 'https://evil.example' } }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
    assert.equal((await call(s.handler, '/state', undefined, extras)).status, 403)
  }
  assert.equal((await call(s.handler, '/state', {})).status, 405)
  assert.equal((await call(s.handler, '/disable', {}, { headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await call(s.handler, '/disable', '{invalid')).status, 400)
  assert.equal((await call(s.handler, '/disable', { junk: 'x'.repeat(1100) })).status, 413)
})
test('host update is separate and uses the same trust fence and explicit body', async t => {
  const s = setup(t), requests = []
  const handler = createHandler({ ...s.options, hostStatus: async () => ({ supported: true, current: '1.0.0' }), updateHost: async data => { requests.push(data); return { ok: true, needsRestart: true } } })
  assert.equal((await call(handler, '/host')).data.current, '1.0.0')
  assert.equal((await call(handler, '/host/update', { version: '1.1.0', confirm: true })).data.needsRestart, true)
  assert.deepEqual(requests, [{ version: '1.1.0', confirm: true }])
  assert.equal((await call(handler, '/host/update', { version: '1.1.0', confirm: true }, { remote: '192.0.2.1' })).status, 403)
})
test('apply anchors at active root Loader profile and tolerates route conflict', async t => {
  const s = setup(t), ctx = new Context(); ctx.baseUrl = pathToFileURL(s.dir + sep).href
  const tree = {}; ctx.fiber.entry = { parent: { tree } }
  t.after(() => ctx.fiber.dispose())
  let handler
  ctx.provide('webServer', { register: route => { handler = route.handler; return () => {} } })
  ctx.provide('loader', { entries: () => s.rows.map(row => ({ id: row.id, parent: { tree }, options: { id: row.id, name: row.module }, disabled: false, fiber: { state: 2 } })) })
  apply(ctx, {})
  assert.equal((await call(handler, '/state')).status, 200)
  assert.equal(await resolveProfileDir(undefined, ctx.baseUrl), s.dir)
  assert.doesNotThrow(() => apply({ effect: fn => fn(), webServer: { register: () => { throw Error('duplicate') } } }, {}))
})

test('apply limits toggles and restore to its profile tree while keeping ordinary group children', async t => {
  const s = setup(t), ctx = new Context(), tree = {}, includedTree = {}
  ctx.baseUrl = pathToFileURL(s.dir + sep).href
  ctx.fiber.entry = { parent: { tree } }
  t.after(() => ctx.fiber.dispose())
  let handler
  const entry = (id, name, parentTree, options = {}) => ({ id, parent: { tree: parentTree }, options: { id, name, ...options }, disabled: false, fiber: { state: 2 } })
  const entries = [entry('my-row', 'my-plugin', tree), entry('other-row', 'other', includedTree),
    entry('group', 'my-plugin', tree, { group: true }), entry('group/child', 'my-plugin', tree, { id: 'child' }),
    entry('unknown-tree-row', 'my-plugin', undefined)]
  ctx.provide('webServer', { register: route => { handler = route.handler; return () => {} } })
  ctx.provide('loader', { entries: () => entries })
  apply(ctx, {})
  assert.deepEqual((await call(handler, '/state')).data.rows.map(row => row.id), ['my-row', 'group/child'])
  const before = s.patch()
  for (const id of ['other-row', 'unknown-tree-row', 'group']) for (const route of ['/disable', '/enable']) {
    assert.equal((await call(handler, route, { id })).status, 403)
  }
  assert.equal(s.patch(), before)
  assert.equal((await call(handler, '/disable', { id: 'group/child' })).status, 200)
  assert.deepEqual(parse(s.patch())[1], { id: 'child', name: 'my-plugin', disabled: true })
  writeFileSync(join(s.dir, 'cordis.patch.yml'), addManagedDisable(s.patch(), 'other-row', 'other').content)
  assert.equal((await call(handler, '/restore', {})).data.removed, 1)
  assert.equal(parse(s.patch()).some(row => row.id === 'other-row'), true)
})

test('apply refuses plugin operations when its own profile tree is unavailable', async t => {
  const s = setup(t), ctx = new Context(); ctx.baseUrl = pathToFileURL(s.dir + sep).href
  t.after(() => ctx.fiber.dispose())
  let handler
  ctx.provide('webServer', { register: route => { handler = route.handler; return () => {} } })
  ctx.provide('loader', { entries: () => [] })
  apply(ctx, {})
  const before = s.patch()
  for (const [route, data] of [['/state', undefined], ['/disable', { id: 'my-row' }], ['/restore', {}]]) {
    const out = await call(handler, route, data)
    assert.equal(out.status, 503); assert.equal(out.data.code, 'PROFILE_TREE_UNAVAILABLE')
  }
  assert.equal(s.patch(), before)
})
