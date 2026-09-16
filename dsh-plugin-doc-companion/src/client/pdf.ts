// dsh-plugin-doc-companion — browser-half pdf.js loader and rendering.
//
// pdf.js is NOT bundled into the client bundle: it is served by the host
// half from the plugin's own node_modules (/doc-static) and pulled in with a
// runtime dynamic import. `new Function` keeps esbuild from trying to
// rewrite the URL import, and the worker + cmaps + standard fonts are wired
// to the same static origin.

/** The subset of the pdf.js module surface the panel uses. */
export interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(src: unknown): { promise: Promise<PdfDocument> }
}

/** pdf.js PDFDocumentProxy subset. */
export interface PdfDocument {
  numPages: number
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}

/** pdf.js PDFPageProxy subset. */
export interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number }
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[] }): { promise: Promise<void>; cancel(): void }
}

let pdfjsPromise: Promise<PdfJsModule> | null = null

/** Load pdf.js once and configure its worker; returns the module. */
export function pdfjs(): Promise<PdfJsModule> {
  if (pdfjsPromise === null) {
    pdfjsPromise = (new Function('u', 'return import(u)')('/doc-static/build/pdf.min.mjs') as Promise<PdfJsModule>)
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc = '/doc-static/build/pdf.worker.min.mjs'
        return module
      })
  }
  return pdfjsPromise
}

/** PDF document options: cmaps and standard fonts from the static origin. */
export function pdfDocumentOptions(data: Uint8Array): unknown {
  return {
    data,
    cMapUrl: '/doc-static/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/doc-static/standard_fonts/'
  }
}

/**
 * Render one page into a canvas at the given CSS width (device-pixel aware).
 * @returns the rendered page's CSS height in pixels (for layout accounting).
 */
export async function renderPdfPageToCanvas(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  zoom: number
): Promise<number> {
  const base = page.getViewport({ scale: 1 })
  const scale = (Math.max(cssWidth, 200) / base.width) * zoom
  const viewport = page.getViewport({ scale })
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  const context = canvas.getContext('2d')
  if (context === null) return viewport.height
  const task = page.render({
    canvasContext: context,
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
  })
  await task.promise
  return viewport.height
}
