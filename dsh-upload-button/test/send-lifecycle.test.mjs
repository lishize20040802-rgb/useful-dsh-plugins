import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Execute the actual TypeScript helper; no browser or network is needed.
const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/upload.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
const upload = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const item = { path: '/uploads/abcdef012345-note.txt', name: 'note.txt', bytes: 12 }

test('unloading restores the original prompt and reloading does not double-attach', async () => {
  const calls = []
  const session = { prompt(content) { assert.equal(this, session); calls.push(content); return Promise.resolve({ ok: true }) } }
  const original = session.prompt, sessions = { binding: () => ({ session }) }
  try {
    upload.addPendingFile('lifecycle', item)
    upload.installSendAttachment(sessions, 'lifecycle')
    upload.installSendAttachment(sessions, 'lifecycle')
    await session.prompt([{ type: 'text', text: 'hello' }])
    assert.equal(calls[0][0].text, 'hello\n`/uploads/abcdef012345-note.txt`')
    upload.disposeSendAttachments()
    assert.equal(session.prompt, original)
    upload.addPendingFile('lifecycle', item)
    upload.installSendAttachment(sessions, 'lifecycle')
    await session.prompt([{ type: 'text', text: 'again' }])
    assert.equal(calls[1][0].text, 'again\n`/uploads/abcdef012345-note.txt`')
  } finally { upload.disposeSendAttachments(); upload.removePendingFile('lifecycle', item.path) }
})

test('unloading leaves a newer wrapper in place and deactivates our nested hook', async () => {
  const calls = [], session = { prompt: async content => { calls.push(content); return { ok: true } } }
  upload.addPendingFile('nested', item)
  upload.installSendAttachment({ binding: () => ({ session }) }, 'nested')
  const inner = session.prompt
  const newer = (...args) => inner(...args)
  session.prompt = newer
  upload.disposeSendAttachments()
  assert.equal(session.prompt, newer)
  const content = [{ type: 'text', text: 'plain' }]
  await session.prompt(content)
  assert.equal(calls[0], content)
  upload.removePendingFile('nested', item.path)
})

test('unknown future content shapes pass through unchanged and missing services are tolerated', async () => {
  upload.installSendAttachment({}, 'future')
  let received
  const session = { prompt: async content => { received = content; return { ok: true } } }
  upload.addPendingFile('future', item)
  upload.installSendAttachment({ binding: () => ({ session }) }, 'future')
  const content = { futureShape: true }
  await session.prompt(content)
  assert.equal(received, content)
  assert.equal(upload.pendingOf('future').length, 1)
  upload.disposeSendAttachments(); upload.removePendingFile('future', item.path)
})

test('upload cards recognize Windows, UNC and POSIX saved paths', () => {
  for (const path of ['/uploads/abcdef012345-note.txt', 'C:\\uploads\\abcdef012345-note.txt', '\\\\server\\share\\abcdef012345-note.txt']) assert.equal(upload.UPLOAD_PATH_RE.test(path), true)
  assert.equal(upload.UPLOAD_PATH_RE.test('/uploads/note.txt'), false)
})
