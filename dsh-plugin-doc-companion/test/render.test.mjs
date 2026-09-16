// dsh-plugin-doc-companion — host-side page rendering smoke tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { renderPdfPagePng, DocumentStore, detectKind } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')

test('renderPdfPagePng produces a real PNG for a real PDF page', async () => {
  const bytes = await readFile(join(fixtures, 'demo.pdf'))
  const png = await renderPdfPagePng('test-render', new Uint8Array(bytes), 1)
  assert.ok(png !== null, 'page should render')
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(png.length > 1000, 'PNG should have real content')
  // A large blank canvas also exceeds 1000 bytes. Confirm actual ink exists,
  // so a missing standard-font path cannot silently pass this smoke test.
  const requireFromPdfjs = createRequire(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
  const { createCanvas, loadImage } = requireFromPdfjs('@napi-rs/canvas')
  const image = await loadImage(Buffer.from(png))
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height).data
  let darkPixels = 0
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] < 128 && pixels[i + 1] < 128 && pixels[i + 2] < 128) darkPixels++
  assert.ok(darkPixels > 100, 'synthetic text must render as visible dark pixels')
})

test('out-of-range pages render to null (not throw)', async () => {
  const bytes = await readFile(join(fixtures, 'demo.pdf'))
  const png = await renderPdfPagePng('test-render-range', new Uint8Array(bytes), 9999)
  assert.equal(png, null)
})

test('store.ensurePageImage renders pages the panel never showed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-doc-companion-'))
  const store = new DocumentStore(root, { textBlockChars: 100, maxParagraphsPerBlock: 2, maxRowsPerBlock: 2 })
  await store.init()
  try {
    const bytes = await readFile(join(fixtures, 'demo.pdf'))
    const meta = await store.registerBytes('demo.pdf', detectKind('demo.pdf'), bytes, 'session-r')
    // No image exists until requested...
    assert.equal(store.imagePath(meta.id, 1), undefined)
    // ...and ensurePageImage produces one host-side.
    const path = await store.ensurePageImage(meta.id, 1)
    assert.ok(path !== undefined, 'host-side snapshot should be created')
    assert.ok(path.includes('.png'))
    assert.equal(store.imagePath(meta.id, 1), path)
    const png = await readFile(path)
    assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  } finally {
    store.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
