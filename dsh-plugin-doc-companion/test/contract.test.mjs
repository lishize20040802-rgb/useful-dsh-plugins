// dsh-plugin-doc-companion — plugin contract tests (fake ctx).
//
// Applies the real plugin against a stub context and asserts the official
// contract surface: the cordis plugin shape (name / inject / Config), the
// registered tool family with its parameter schemas, the HTTP route
// registrations, the system-prompt section, and end-to-end tool behavior on
// a temp store (open → current → page → search → goto → close).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, normalizeConfig } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')

/** Stub services the host half injects; every registration is captured. */
function makeFakeCtx() {
  const tools = []
  const routes = []
  const sections = []
  const effects = []
  const ctx = {
    tools: { register: (tool) => { tools.push(tool); return () => {} } },
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    systemPrompt: { section: (section) => sections.push(section) },
    // cordis semantics: the callback runs immediately; its return value is
    // the disposer collected for plugin teardown.
    effect: (fn) => {
      const disposer = fn()
      if (typeof disposer === 'function') effects.push(disposer)
      return disposer
    },
    get: (key) => {
      if (key === 'llm') return undefined
      if (key === 'attachments') return undefined
      return undefined
    }
  }
  return { ctx, tools, routes, sections, effects }
}

/** Wait for the async store-init path inside apply() to settle. */
async function settled(applyFn, tools, routes) {
  await applyFn
  // apply registers routes/tools after store.init() resolves; poll for them.
  for (let i = 0; i < 100; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    if (tools.length >= 7 && routes.length >= 2) return
  }
  throw new Error('doc-companion apply() did not register tools/routes in time')
}

async function withPlugin(run, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  const { ctx, tools, routes, sections, effects } = makeFakeCtx()
  const config = normalizeConfig({ storageDir: root, ...overrides })
  await settled(apply(ctx, config), tools, routes)
  try {
    await run({ ctx, tools, routes, sections, config, root })
  } finally {
    for (const dispose of effects.reverse()) await dispose()
    await rm(root, { recursive: true, force: true })
  }
}

test('plugin shape: name / inject / Config schema', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'doc-companion')
  assert.deepEqual(mod.inject, ['tools', 'systemPrompt', 'webServer'])
  assert.equal(typeof mod.Config, 'function') // schemastery schema (callable)
  const config = normalizeConfig({ maxBytes: 123 })
  assert.equal(config.maxBytes, 123)
  assert.equal(config.storageDir, '')
  assert.equal(config.searchMaxHits, 5)
})

test('disabling automatic transcription keeps PDF reading local', async () => {
  await withPlugin(async ({ ctx, tools }) => {
    ctx.get = () => { throw new Error('Disabled transcription must not request model or attachment services') }
    const exec = { signal: undefined, agent: { session: { id: 'offline-pdf', header: { cwd: process.cwd() } } } }
    await tools.find(tool => tool.name === 'doc_open').execute({ path: join(fixtures, 'demo.pdf') }, exec)
    const result = await tools.find(tool => tool.name === 'doc_current').execute({}, exec)
    assert.ok(result.text.includes('Synthetic document fixture'))
    assert.equal(result.image_path, undefined)
  }, { autoTranscribeScanned: false })
})

test('registers the full doc_* tool family with schemas', async () => {
  await withPlugin(async ({ tools }) => {
    const names = tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['doc_close', 'doc_current', 'doc_goto', 'doc_list', 'doc_open', 'doc_page', 'doc_search'])
    const page = tools.find((t) => t.name === 'doc_page')
    assert.equal(page.parameters.properties.block.type, 'integer')
    assert.ok(page.parameters.required.includes('block'))
    const search = tools.find((t) => t.name === 'doc_search')
    assert.ok(search.parameters.required.includes('query'))
    assert.equal(typeof search.execute, 'function')
    assert.equal(typeof search.output.render, 'function')
    assert.equal(typeof search.output.schema, 'object')
  })
})

test('registers the /api/doc and /doc-static routes', async () => {
  await withPlugin(async ({ routes }) => {
    const paths = routes.map((r) => r.path).sort()
    assert.deepEqual(paths, ['/api/doc', '/doc-static'])
    assert.ok(routes.every((r) => r.kind === 'prefix' && typeof r.handler === 'function'))
  })
})

test('adds the study-companion system prompt section', async () => {
  await withPlugin(async ({ sections }) => {
    assert.equal(sections.length, 1)
    const section = sections[0]
    assert.equal(section.name, 'tool:doc-companion')
    assert.ok(section.text.includes('doc_current'))
    assert.ok(section.text.includes('doc_search'))
    assert.ok(section.text.includes('先原文后解释'))
  })
})

test('tool flow: open → current → page → search → goto → close', async () => {
  await withPlugin(async ({ tools }) => {
    const open = tools.find((t) => t.name === 'doc_open')
    const current = tools.find((t) => t.name === 'doc_current')
    const page = tools.find((t) => t.name === 'doc_page')
    const search = tools.find((t) => t.name === 'doc_search')
    const goto = tools.find((t) => t.name === 'doc_goto')
    const close = tools.find((t) => t.name === 'doc_close')
    const exec = { signal: undefined, agent: { session: { id: 'test-session', header: { cwd: process.cwd() } } } }

    // no document yet — doc_current reports a helpful note
    const empty = await current.execute({}, exec)
    assert.equal(empty.ok, true)
    assert.ok(empty.note)

    // write a fixture and open it by path
    const source = join(fixtures, 'note.md')
    const opened = await open.execute({ path: source }, exec)
    assert.equal(opened.ok, true)
    assert.equal(opened.doc.kind, 'text')
    const docId = opened.doc.id

    // current position follows the open (block 1)
    const cur = await current.execute({}, exec)
    assert.equal(cur.doc.id, docId)
    assert.equal(cur.block, 1)
    assert.ok(cur.text.length > 0)

    // page reads a block without moving the reader
    const p2 = await page.execute({ block: 1 }, exec)
    assert.equal(p2.ok, true)

    // search finds terms inside the document
    const hits = await search.execute({ query: 'fixture' }, exec)
    assert.equal(hits.ok, true)
    assert.ok(hits.hits.length >= 1)
    assert.ok(hits.hits[0].locator.length > 0)
    assert.ok(hits.hits[0].snippet.length > 0)

    // goto moves the reader; close clears it
    const g = await goto.execute({ block: 1 }, exec)
    assert.equal(g.ok, true)
    const closed = await close.execute({}, exec)
    assert.equal(closed.ok, true)
    const afterClose = await current.execute({}, exec)
    assert.ok(afterClose.note)
  })
})

test('doc_search rejects an empty query; doc_page rejects a bad block', async () => {
  await withPlugin(async ({ tools }) => {
    const exec = { signal: undefined, agent: { session: { id: 'test-session' } } }
    const open = tools.find((t) => t.name === 'doc_open')
    const search = tools.find((t) => t.name === 'doc_search')
    const page = tools.find((t) => t.name === 'doc_page')
    const goto = tools.find((t) => t.name === 'doc_goto')
    // no document open — search/page/goto fail with a helpful message first
    await assert.rejects(() => search.execute({ query: 'x' }, exec), /当前没有打开/)
    await assert.rejects(() => page.execute({ block: 1 }, exec), /当前没有打开/)
    await assert.rejects(() => goto.execute({ block: 1 }, exec), /当前没有打开/)
    // with a document open, an empty query is rejected
    await open.execute({ path: join(fixtures, 'note.md') }, exec)
    await assert.rejects(() => search.execute({ query: '   ' }, exec), /不能为空/)
    await assert.rejects(() => page.execute({ block: -1 }, exec), /正整数/)
  })
})

test('reading positions are per-session and never leak across sessions', async () => {
  await withPlugin(async ({ tools }) => {
    const open = tools.find((t) => t.name === 'doc_open')
    const current = tools.find((t) => t.name === 'doc_current')
    const goto = tools.find((t) => t.name === 'doc_goto')
    const execA = { signal: undefined, agent: { session: { id: 'session-a', header: { cwd: process.cwd() } } } }
    const execB = { signal: undefined, agent: { session: { id: 'session-b', header: { cwd: process.cwd() } } } }

    // Session A opens a document; session B still has none.
    const openedA = await open.execute({ path: join(fixtures, 'note.md') }, execA)
    assert.equal(openedA.ok, true)
    const curA = await current.execute({}, execA)
    assert.equal(curA.doc.id, openedA.doc.id)
    const curB = await current.execute({}, execB)
    assert.equal(curB.ok, true)
    assert.ok(curB.note, 'session B must not see session A\'s document')

    // Session B opens its own document and navigates; A is untouched.
    const openedB = await open.execute({ path: join(fixtures, 'demo.xlsx') }, execB)
    assert.equal(openedB.ok, true)
    await goto.execute({ block: 1 }, execB)
    const curB2 = await current.execute({}, execB)
    assert.equal(curB2.doc.id, openedB.doc.id)
    const curA2 = await current.execute({}, execA)
    assert.equal(curA2.doc.id, openedA.doc.id, 'session A keeps its own document')

    // Closing B leaves A's reading position intact.
    const close = tools.find((t) => t.name === 'doc_close')
    await close.execute({}, execB)
    const curB3 = await current.execute({}, execB)
    assert.ok(curB3.note)
    const curA3 = await current.execute({}, execA)
    assert.equal(curA3.doc.id, openedA.doc.id)
  })
})

test('upload route rejects unsupported extensions', async () => {
  await withPlugin(async ({ routes }) => {
    const api = routes.find((r) => r.path === '/api/doc')
    // Directly exercise the trust fence + upload path via a minimal req/res pair.
    const req = {
      method: 'POST',
      url: '/api/doc/upload',
      headers: { host: '127.0.0.1:3080', 'x-file-name': 'evil.exe' },
      [Symbol.asyncIterator]() {
        return [][Symbol.iterator]()
      }
    }
    let status = 0
    let body = ''
    const res = {
      writeHead(code) { status = code },
      end(text) { body = text }
    }
    await api.handler(req, res)
    assert.equal(status, 415)
    assert.match(body, /unsupported file type/)
  })
})

test('state route reports the current document', async () => {
  await withPlugin(async ({ routes }) => {
    const api = routes.find((r) => r.path === '/api/doc')
    const req = {
      method: 'GET',
      url: '/api/doc/state',
      headers: { host: '127.0.0.1:3080' }
    }
    let status = 0
    let body = null
    const res = {
      writeHead(code, headers) { status = code; this.headers = headers },
      end(text) { body = JSON.parse(text) }
    }
    await api.handler(req, res)
    assert.equal(status, 200)
    assert.equal(body.doc, null)
  })
})

test('route trust fence rejects foreign hosts', async () => {
  await withPlugin(async ({ routes }) => {
    const api = routes.find((r) => r.path === '/api/doc')
    const req = {
      method: 'GET',
      url: '/api/doc/state',
      headers: { host: 'evil.example.com' }
    }
    let status = 0
    const res = {
      writeHead(code) { status = code },
      end() {}
    }
    await api.handler(req, res)
    assert.equal(status, 403)
  })
})
