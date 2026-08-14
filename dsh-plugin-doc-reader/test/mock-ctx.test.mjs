import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply, name as pluginName, inject } from '../lib/index.js'

/** Minimal stand-in for the cordis plugin context, capturing registrations. */
function fakeCtx({ statResult, bytes } = {}) {
  const registered = []
  const sections = []
  return {
    registered,
    sections,
    ctx: {
      tools: { register: tool => registered.push(tool) },
      systemPrompt: { section: s => sections.push(s) },
      fs: {
        resolve: async p => ({ displayPath: p }),
        stat: async () => statResult,
        readBytes: async () => bytes
      },
      emit() {},
      inject() {},
      get() {}
    }
  }
}

const CONFIG = { readLimit: 2000, maxFileBytes: 1024 * 1024, sheetRowLimit: 50 }

test('plugin exports the cordis contract', () => {
  assert.equal(pluginName, 'tool-doc-reader')
  assert.deepEqual(inject, ['tools', 'fs', 'systemPrompt'])
})

test('apply registers one tool named read_document and a prompt section', () => {
  const { ctx, registered, sections } = fakeCtx()
  apply(ctx, CONFIG)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'read_document')
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'tool:read-document')
})

test('execute reads a text fixture through ctx.fs and windows it', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/note.md', import.meta.url))
  const bytes = readFileSync(fixturePath)
  const { ctx, registered } = fakeCtx({
    statResult: { type: 'file', size: bytes.length, version: 1 },
    bytes
  })
  apply(ctx, CONFIG)
  const result = await registered[0].execute({ file_path: 'note.md' }, { signal: undefined })
  assert.equal(result.format, 'text')
  assert.equal(result.path, 'note.md')
  assert.ok(result.totalLines >= 4)
  assert.ok(result.lines.some(l => l.text.includes('fixture note')))
  assert.equal(result.lines[0].number, 1)
})

test('execute rejects a missing file with FS_NOT_FOUND', async () => {
  const { ctx, registered } = fakeCtx({ statResult: undefined })
  apply(ctx, CONFIG)
  await assert.rejects(
    () => registered[0].execute({ file_path: 'nope.md' }, { signal: undefined }),
    err => err.name === 'FsError' && err.code === 'FS_NOT_FOUND'
  )
})

test('execute rejects a directory with FS_NOT_REGULAR_FILE', async () => {
  const { ctx, registered } = fakeCtx({ statResult: { type: 'directory', version: 1 } })
  apply(ctx, CONFIG)
  await assert.rejects(
    () => registered[0].execute({ file_path: 'somedir' }, { signal: undefined }),
    err => err.code === 'FS_NOT_REGULAR_FILE'
  )
})

test('execute validates arguments', async () => {
  const { ctx, registered } = fakeCtx()
  apply(ctx, CONFIG)
  const tool = registered[0]
  await assert.rejects(() => tool.execute({ file_path: '' }, {}), /non-empty string/)
  await assert.rejects(() => tool.execute({ file_path: 'x', offset: 0 }, {}), /positive integer/)
  await assert.rejects(() => tool.execute({ file_path: 'x', limit: 99999 }, {}), /less than or equal/)
  // defineTool's schema layer rejects the bad enum before our own validation,
  // so accept either message wording.
  await assert.rejects(() => tool.execute({ file_path: 'x', format: 'doc' }, {}), /invalid arguments|unsupported format/)
})

test('apply survives a tool-registration conflict', () => {
  const ctx = {
    tools: { register: () => { throw new Error('tool "read_document" is already registered') } },
    systemPrompt: { section: () => {} },
    fs: {},
    emit() {},
    inject() {},
    get() {}
  }
  assert.doesNotThrow(() => apply(ctx, CONFIG))
})
