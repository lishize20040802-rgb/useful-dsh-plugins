import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUploadHandler, sanitizeFileName } from '../lib/index.js'

function makeReq(body, headers = {}, method = 'POST', url = undefined) {
  const req = Readable.from(body === null ? [] : [Buffer.from(body)])
  req.method = method
  req.headers = { host: '127.0.0.1:3080', ...headers }
  if (url !== undefined) req.url = url
  return req
}

function makeRes() {
  return {
    status: 0,
    headers: {},
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

test('sanitizeFileName strips traversal, separators and control chars', () => {
  assert.equal(sanitizeFileName('../../evil\\path/\u0000name.txt'), 'evil_path_name.txt')
  assert.equal(sanitizeFileName('..hidden'), 'hidden')
  assert.equal(sanitizeFileName('   '), 'upload.bin')
  assert.equal(sanitizeFileName('a'.repeat(300)).length, 120)
})

test('upload writes the file and returns its path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-upload-test-'))
  const handler = createUploadHandler({ dir, maxBytes: 1024 })
  const res = await send(makeReq('hello world', { 'x-file-name': 'note.txt' }), handler)
  assert.equal(res.status, 200)
  const payload = JSON.parse(res.body)
  assert.equal(payload.name, 'note.txt')
  assert.equal(payload.bytes, 11)
  assert.ok(existsSync(payload.path))
  assert.equal(readFileSync(payload.path, 'utf8'), 'hello world')
})

test('re-uploading identical content deduplicates to the same path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-upload-test-'))
  const handler = createUploadHandler({ dir, maxBytes: 1024 })
  const first = JSON.parse((await send(makeReq('same bytes', { 'x-file-name': 'dup.txt' }), handler)).body)
  assert.equal(first.deduplicated, undefined)
  const secondRes = await send(makeReq('same bytes', { 'x-file-name': 'dup.txt' }), handler)
  assert.equal(secondRes.status, 200)
  const second = JSON.parse(secondRes.body)
  assert.equal(second.path, first.path)
  assert.equal(second.deduplicated, true)
})

test('rejects non-POST methods', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq('x', {}, 'GET'), handler)
  assert.equal(res.status, 405)
})

test('rejects non-loopback hosts', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq('x', { host: 'evil.example.com' }), handler)
  assert.equal(res.status, 403)
})

test('rejects cross-origin requests', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq('x', { origin: 'https://evil.example.com' }), handler)
  assert.equal(res.status, 403)
})

test('rejects cross-site fetch-metadata', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq('x', { 'sec-fetch-site': 'cross-site' }), handler)
  assert.equal(res.status, 403)
})

test('rejects oversized uploads via content-length', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 10 })
  const res = await send(makeReq('x'.repeat(20), { 'content-length': '20' }), handler)
  assert.equal(res.status, 413)
})

test('rejects oversized uploads while streaming', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 10 })
  const res = await send(makeReq('x'.repeat(20)), handler)
  assert.equal(res.status, 413)
})

test('rejects empty uploads', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq(''), handler)
  assert.equal(res.status, 400)
})

test('enforces the extension whitelist', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024, allowedExtensions: ['pdf', 'docx'] })
  const res = await send(makeReq('data', { 'x-file-name': 'evil.exe' }), handler)
  assert.equal(res.status, 415)
})

test('delete removes an uploaded file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-upload-test-'))
  const handler = createUploadHandler({ dir, maxBytes: 1024 })
  const up = await send(makeReq('payload', { 'x-file-name': 'gone.txt' }), handler)
  const { path } = JSON.parse(up.body)
  assert.ok(existsSync(path))
  const del = await send(makeReq(null, {}, 'DELETE', `/api/upload?path=${encodeURIComponent(path)}`), handler)
  assert.equal(del.status, 200)
  assert.deepEqual(JSON.parse(del.body), { removed: true })
  assert.ok(!existsSync(path))
})

test('delete rejects a missing path', async () => {
  const handler = createUploadHandler({ dir: '.', maxBytes: 1024 })
  const res = await send(makeReq(null, {}, 'DELETE', '/api/upload'), handler)
  assert.equal(res.status, 400)
})

test('delete rejects paths outside uploadDir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-upload-test-'))
  const handler = createUploadHandler({ dir, maxBytes: 1024 })
  const res = await send(makeReq(null, {}, 'DELETE', '/api/upload?path=%2Fetc%2Fpasswd'), handler)
  assert.equal(res.status, 403)
})

test('delete reports missing files as 404', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-upload-test-'))
  const handler = createUploadHandler({ dir, maxBytes: 1024 })
  const res = await send(makeReq(null, {}, 'DELETE', `/api/upload?path=${encodeURIComponent(join(dir, 'nope.bin'))}`), handler)
  assert.equal(res.status, 404)
})
