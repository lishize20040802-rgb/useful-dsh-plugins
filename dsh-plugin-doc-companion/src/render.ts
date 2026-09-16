// dsh-plugin-doc-companion — host-side PDF page rendering.
//
// Renders any PDF page to a PNG snapshot with pdf.js + @napi-rs/canvas, so
// the host can produce page images for pages the reader panel never showed
// (scanned/garbled pages the agent needs to read through the vision model).
// The canvas context types differ between the DOM lib and the native
// library, hence the casts at the boundary.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** The subset of @napi-rs/canvas this module uses. */
interface CanvasLib {
  createCanvas(width: number, height: number): {
    getContext(kind: '2d'): unknown
    toBuffer(kind: 'image/png'): Uint8Array
  }
  Path2D: unknown
  DOMMatrix: unknown
}

// pdf.js in Node loads @napi-rs/canvas from ITS OWN module scope (a nested copy
// whenever the versions differ) and builds its internal image canvases — and
// polyfills the DOM globals — from THAT copy. Two native copies of
// @napi-rs/canvas cannot exchange objects: a canvas of one copy drawn into a
// context of the other is a native type mismatch that CRASHES THE HOST PROCESS
// with a segfault (observed on scanned PDFs, whose pages are one full-page
// image each; vector-text pages never hand pdf.js objects across, which is why
// they used to render fine). A JS try/catch cannot survive that, so there is
// only one cure: use pdf.js's own copy for the destination canvas and the
// globals, resolved through pdf.js's module scope rather than ours.
const requireFromPdfjs = createRequire(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))

let canvasLibCache: CanvasLib | null | undefined

/** The @napi-rs/canvas copy pdf.js itself uses, or null when unavailable. */
function canvasLib(): CanvasLib | null {
  if (canvasLibCache !== undefined) return canvasLibCache
  try {
    canvasLibCache = requireFromPdfjs('@napi-rs/canvas') as CanvasLib
  } catch (error) {
    console.warn('[dsh-plugin-doc-companion] cannot load @napi-rs/canvas:',
      error instanceof Error ? error.message : error)
    canvasLibCache = null
  }
  return canvasLibCache
}

// Re-assert pdf.js's own Path2D/DOMMatrix on every render (belt and braces):
// another plugin loaded in the same host may have installed a different copy.
function installCanvasGlobals(lib: CanvasLib): void {
  Object.defineProperty(globalThis, 'Path2D', { value: lib.Path2D, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'DOMMatrix', { value: lib.DOMMatrix, configurable: true, writable: true })
}

/** Raster scale: 2x gives a crisp snapshot for the vision model. */
const RENDER_SCALE = 2
const MAX_CACHED_DOCS = 2

/** Recently opened render documents (parsing is the slow part). */
const renderDocs = new Map<string, Promise<PDFDocumentProxy>>()

async function getRenderDoc(docId: string, data: Uint8Array): Promise<PDFDocumentProxy> {
  const cached = renderDocs.get(docId)
  if (cached !== undefined) return cached
  const standardFontDataUrl = fileURLToPath(new URL('../../standard_fonts/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')))
  const promise = getDocument({ data, useSystemFonts: false, standardFontDataUrl }).promise
  renderDocs.set(docId, promise)
  promise.then((doc) => {
    if (renderDocs.size > MAX_CACHED_DOCS) {
      const oldest = renderDocs.keys().next().value
      if (oldest !== undefined && oldest !== docId) {
        const evicted = renderDocs.get(oldest)
        renderDocs.delete(oldest)
        void evicted?.then((d) => d.destroy()).catch(() => {})
      }
    }
  }).catch(() => {})
  return promise
}

/**
 * Render one PDF page to a PNG buffer.
 * @param docId - document id (cache key for the parsed PDF).
 * @param data - raw PDF bytes.
 * @param pageNumber - 1-based page number.
 * @returns PNG bytes, or null when rendering fails.
 */
export async function renderPdfPagePng(
  docId: string,
  data: Uint8Array,
  pageNumber: number
): Promise<Uint8Array | null> {
  try {
    const lib = canvasLib()
    if (lib === null) return null
    installCanvasGlobals(lib)
    const doc = await getRenderDoc(docId, data)
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = lib.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport
    }).promise
    return new Uint8Array(canvas.toBuffer('image/png'))
  } catch (error) {
    console.warn(`[dsh-plugin-doc-companion] page render failed (${docId} p${pageNumber}):`,
      error instanceof Error ? error.message : error)
    return null
  }
}
