import { test } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { downloadFile, modelDownloadUrls, openResponse } from '../lib/index.js'

function mockResponses(t, responses) {
  const requests = []
  t.mock.method(https, 'request', (options, callback) => {
    requests.push(options)
    const req = new EventEmitter()
    req.setTimeout = () => req
    req.end = () => queueMicrotask(() => {
      const next = responses.shift()
      assert.ok(next, 'unexpected request')
      const res = new PassThrough()
      res.statusCode = next.status ?? 200
      res.headers = next.headers ?? {}
      callback(res)
      res.end(next.body ?? '')
    })
    return req
  })
  return requests
}

test('release downloads follow HTTPS redirects and keep range headers', async (t) => {
  const requests = mockResponses(t, [
    { status: 302, headers: { location: 'https://assets.example.org/model' } },
    { status: 206, headers: { 'content-range': 'bytes 5-7/8' }, body: 'abc' }
  ])
  const response = await openResponse('https://example.org/release', '', { range: 'bytes=5-' })
  assert.equal(response.status, 206)
  assert.equal(requests[1].host, 'assets.example.org')
  assert.equal(requests[1].headers.range, 'bytes=5-')
  response.stream.resume()
})

test('release downloads reject HTTPS to HTTP downgrade', async (t) => {
  mockResponses(t, [{ status: 302, headers: { location: 'http://example.org/model' } }])
  await assert.rejects(openResponse('https://example.org/release', '', {}), /must use HTTPS/)
})

test('model bytes are verified by digest before becoming installed files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'voice-provision-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const data = Buffer.from('synthetic-model')
  const digest = createHash('sha256').update(data).digest('hex')
  mockResponses(t, [{ body: data }])
  const dest = join(dir, 'model.onnx')
  await downloadFile(['https://example.org/model'], dest, { expected: data.length, sha256: digest })
  assert.deepEqual(await readFile(dest), data)
})

test('an equal-length modified model fails digest validation', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'voice-provision-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  mockResponses(t, [{ body: 'evil' }, { body: 'evil' }])
  await assert.rejects(downloadFile(['https://example.org/model'], join(dir, 'model.onnx'), { expected: 4, sha256: '0'.repeat(64) }), /SHA-256 mismatch/)
  await assert.rejects(readFile(join(dir, 'model.onnx')), { code: 'ENOENT' })
})

test('a configured release is preferred and insecure model bases are rejected', () => {
  assert.equal(modelDownloadUrls('tokens.txt', 'https://example.org/release/')[0], 'https://example.org/release/tokens.txt')
  assert.throws(() => modelDownloadUrls('tokens.txt', 'http://example.org'), /must use HTTPS/)
})
