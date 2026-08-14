import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHandler, apply } from '../lib/index.js'

function makeReq(body, method = 'POST', url = '/api/plugin-manager/state', headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json', ...headers }
  return req
}

function makeRes() {
  return {
    status: 0,
    body: '',
    writeHead(code, headers = {}) {
      this.status = code
      this.headers = headers
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
    }
  }
}

async function send(req, handler) {
  const res = makeRes()
  await handler(req, res)
  return res
}

function freshProfile() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-manager-test-'))
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: user-entry\n  config:\n    keep: true\n')
  return dir
}

test('disable/enable round trip edits the profile patch file', async () => {
  const dir = freshProfile()
  const handler = createHandler({ profileDir: dir, maxBodyBytes: 1024 })

  const dis = await send(makeReq({ id: 'my-plugin' }, 'POST', '/api/plugin-manager/disable'), handler)
  assert.equal(dis.status, 200)
  const patch = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('- id: user-entry'))
  assert.ok(patch.includes('- id: my-plugin'))

  const st = await send(makeReq(undefined, 'GET', '/api/plugin-manager/state'), handler)
  assert.deepEqual(JSON.parse(st.body).managed, ['my-plugin'])

  const en = await send(makeReq({ id: 'my-plugin' }, 'POST', '/api/plugin-manager/enable'), handler)
  assert.equal(en.status, 200)
  const after = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.ok(!after.includes('- id: my-plugin'))
  assert.ok(after.includes('- id: user-entry'))
})

test('restore clears all managed entries', async () => {
  const dir = freshProfile()
  const handler = createHandler({ profileDir: dir, maxBodyBytes: 1024 })
  await send(makeReq({ id: 'a' }, 'POST', '/api/plugin-manager/disable'), handler)
  await send(makeReq({ id: 'b' }, 'POST', '/api/plugin-manager/disable'), handler)
  const res = await send(makeReq(undefined, 'POST', '/api/plugin-manager/restore'), handler)
  assert.equal(res.status, 200)
  assert.equal(JSON.parse(res.body).removed, 2)
  const patch = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.ok(!patch.includes('useful-dsh-plugin-manager managed entry'))
})

test('invalid ids and names are rejected', async () => {
  const dir = freshProfile()
  const handler = createHandler({ profileDir: dir, maxBodyBytes: 1024 })
  const badId = await send(makeReq({ id: 'bad id\n- id: x' }, 'POST', '/api/plugin-manager/disable'), handler)
  assert.equal(badId.status, 400)
  const badName = await send(makeReq({ name: 'x; rm -rf /' }, 'POST', '/api/plugin-manager/update'), handler)
  assert.equal(badName.status, 400)
})

test('trust fence rejects non-loopback hosts and cross-origin', async () => {
  const dir = freshProfile()
  const handler = createHandler({ profileDir: dir, maxBodyBytes: 1024 })
  const badHost = await send(makeReq(undefined, 'GET', '/api/plugin-manager/state', { host: 'evil.example.com' }), handler)
  assert.equal(badHost.status, 403)
  const crossOrigin = await send(makeReq(undefined, 'GET', '/api/plugin-manager/state', { origin: 'https://evil.example.com' }), handler)
  assert.equal(crossOrigin.status, 403)
})

test('check-all reports installed vs registry latest', async () => {
  const dir = freshProfile()
  mkdirSync(join(dir, 'node_modules', 'fake-plugin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', 'fake-plugin', 'package.json'), JSON.stringify({ name: 'fake-plugin', version: '1.0.0' }))

  // Offline registry stub: no network in unit tests.
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => ({ version: '2.0.0' })
  })
  try {
    const handler = createHandler({ profileDir: dir, maxBodyBytes: 1024 })
    const res = await send(makeReq(undefined, 'POST', '/api/plugin-manager/check-all'), handler)
    assert.equal(res.status, 200)
    const { packages } = JSON.parse(res.body)
    const row = packages.find(p => p.name === 'fake-plugin')
    assert.ok(row !== undefined)
    assert.equal(row.installed, '1.0.0')
    assert.equal(row.latest, '2.0.0')
    assert.equal(row.upToDate, false)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('apply survives a duplicate-route registration conflict', async () => {
  const ctx = {
    effect: (fn) => {
      fn()
      return () => {}
    },
    webServer: {
      register: () => { throw new Error('webserver: duplicate prefix route "/api/plugin-manager"') }
    }
  }
  assert.doesNotThrow(() => apply(ctx, { profileDir: '.', maxBodyBytes: 1024 }))
})
