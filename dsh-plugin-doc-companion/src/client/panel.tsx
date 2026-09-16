// dsh-plugin-doc-companion — browser-half reader panel.
//
// A root-scope surface on the `shell.overlay` seat (additive, always
// registrable — unlike the official `details` column, which only renders for
// engaged sessions and whose occupant shadows the shipped DetailsPanel).
// When visible, the panel makes room for itself by padding the layout
// frame's right edge: the grid tracks (sidebar / chat / details) reflow into
// the remaining space, so the chat column narrows automatically and the
// panel and the conversation read as two equal panes — never an overlay.
// React never rewrites `padding-right` (the frame only manages its
// grid-template-columns inline), so the reservation is stable. The panel
// follows the CURRENT SESSION (root-scope `useSessions`): every request
// carries that session id, and the host keeps one reading position per
// conversation.
//
// Two view modes:
//   - scroll (default): true continuous reading — the current block and its
//     neighbours are stacked vertically in one scroll container; scrolling is
//     smooth and seamless like a normal reader, the block under the viewport
//     centre is tracked and synced, more blocks are appended near the bottom
//     and reclaimed (height-placeholders kept) when too many are mounted.
//   - single: one block at a time with prev/next buttons.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  pdfjs,
  pdfDocumentOptions,
  renderPdfPageToCanvas,
  type PdfDocument
} from './pdf'
import { ACCEPT, uploadDocument, fetchDocState, type DocState } from './upload'
import { isPanelRequested, dismissPanel, subscribePanelRequested } from './store'
import type { DocCompanionLocaleKey } from './locales'

/** Minimal shape of the sessions snapshot the panel reads. */
export interface SessionsSnapshot {
  current?: string
}

/** Props injected by the slot framework (locale + global sessions hook). */
export interface PanelProps {
  t?: (key: DocCompanionLocaleKey, params?: Record<string, unknown>) => string
  /** Global sessions hook (root scope); gives the current session id. */
  useSessions?: <T>(selector: (snapshot: SessionsSnapshot) => T) => T
}

interface PanelDoc {
  id: string
  name: string
  kind: string
  total_blocks: number | null
  ready: boolean
}

interface TableData {
  sheet: string
  first_row: number
  columns: string[]
  rows: string[][]
}

/** Reading surface mode. */
type ViewMode = 'scroll' | 'single'

/** One mounted block inside the scroll container. */
interface ScrollBlock {
  block: number
  el: HTMLDivElement
  height: number
  canvas: HTMLCanvasElement | null
  unloaded: boolean
}

const POLL_MS = 2000
const FOLLOW_GRACE_MS = 1500
const SYNC_DEBOUNCE_MS = 400
const WIDTH_KEY = 'dsh-doc-companion.panelWidth'
const MODE_KEY = 'dsh-doc-companion.viewMode'
const MIN_WIDTH = 340
const MAX_PDF_CANVAS = 10
const MAX_BLOCKS = 90
const PRELOAD_AFTER = 3
const PRELOAD_BEFORE = 2

/** Remembered/default panel width (viewport-relative, clamped). */
function initialPanelWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(saved) && saved >= MIN_WIDTH) {
      return Math.min(Math.round(saved), Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.7)))
    }
  } catch {
    // localStorage unavailable — fall through to the viewport default
  }
  return Math.min(Math.max(Math.floor(window.innerWidth * 0.42), 380), 660)
}

function clampPanelWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), MIN_WIDTH), Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.7)))
}

/** Remembered reading mode (scroll by default). */
function initialViewMode(): ViewMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'single' ? 'single' : 'scroll'
  } catch {
    return 'scroll'
  }
}

/**
 * The layout frame hosting the three columns (sidebar / chat / details).
 * The panel lives inside its `[data-shell-overlay]` layer, whose parent IS
 * the frame. Reserving `padding-right` on it narrows the grid content box.
 */
function layoutFrame(): HTMLElement | null {
  const layer = document.querySelector('[data-shell-overlay]')
  const frame = layer?.parentElement
  return frame instanceof HTMLElement ? frame : null
}

/** Build the DOM table for one table block (xlsx/csv). */
function buildTableElement(data: TableData): HTMLTableElement {
  const tableEl = document.createElement('table')
  tableEl.style.cssText = 'border-collapse:collapse;font-size:12px;width:100%;'
  if (data.columns.length === 0 && data.rows.length === 0) return tableEl
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const cell of data.columns) {
    const th = document.createElement('th')
    th.textContent = cell
    th.style.cssText = `${cellStyleText};background:rgba(127,127,127,0.12);font-weight:600;`
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  tableEl.appendChild(thead)
  const tbody = document.createElement('tbody')
  for (const row of data.rows) {
    const tr = document.createElement('tr')
    for (const cell of row) {
      const td = document.createElement('td')
      td.textContent = cell
      td.style.cssText = cellStyleText
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  tableEl.appendChild(tbody)
  return tableEl
}

export function DocPanel(props: PanelProps): JSX.Element | null {
  const t = props.t ?? ((key: DocCompanionLocaleKey) => key)
  // Visibility is PER-SESSION intent: hidden until the user opens it in the
  // current conversation (or the conversation showed it before).
  const [visible, setVisible] = useState(false)
  const [doc, setDoc] = useState<PanelDoc | null>(null)
  const [block, setBlock] = useState(1)
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState<ViewMode>(initialViewMode)
  const [width, setWidth] = useState(initialPanelWidth)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<'synced' | 'pending'>('synced')
  const [pageText, setPageText] = useState<string | null>(null)
  const [table, setTable] = useState<TableData | null>(null)
  const [jumpInput, setJumpInput] = useState('')

  const pdfDocRef = useRef<PdfDocument | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = useRef<{ cancel(): void } | null>(null)
  const docRef = useRef<PanelDoc | null>(null)
  const blockRef = useRef(1)
  const totalRef = useRef(0)
  const zoomRef = useRef(1)
  const modeRef = useRef<ViewMode>('scroll')
  const widthRef = useRef(width)
  const sessionIdRef = useRef<string | undefined>(undefined)
  const lastNavAtRef = useRef(0)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navTokenRef = useRef(0)
  const loadingRef = useRef(false)
  const aliveRef = useRef(true)
  // scroll-mode bookkeeping
  const scrollBlocksRef = useRef<ScrollBlock[]>([])
  const pendingBlocksRef = useRef(new Set<number>())
  const scrollTokenRef = useRef(0)
  const scrollRafRef = useRef<number | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  zoomRef.current = zoom
  modeRef.current = mode
  widthRef.current = width

  // ── visibility & session ─────────────────────────────────────────────────
  const sessionsSnapshot = props.useSessions !== undefined
    ? props.useSessions((s) => s)
    : undefined
  const currentSessionId = sessionsSnapshot?.current
  sessionIdRef.current = currentSessionId

  // Follow the store intent of the CURRENT session (toolbar toggle / close).
  useEffect(() => subscribePanelRequested(() => {
    setVisible(isPanelRequested(sessionIdRef.current))
  }), [])

  // Session switch re-evaluates visibility from that session's own intent:
  // a conversation that never opened the panel stays panel-free.
  useEffect(() => {
    setVisible(isPanelRequested(currentSessionId))
  }, [currentSessionId])

  // Reserve space in the layout frame while visible; release it on close.
  useEffect(() => {
    const frame = layoutFrame()
    if (frame === null) return
    frame.style.paddingRight = visible ? `${width}px` : ''
  }, [visible, width])

  // Reset the reading state when the panel is hidden (release the PDF doc).
  useEffect(() => {
    if (visible) return
    if (docRef.current !== null) {
      docRef.current = null
      pdfDocRef.current = null
      setDoc(null)
      setPageText(null)
      setTable(null)
      setTotal(0)
      if (bodyRef.current !== null) bodyRef.current.innerHTML = ''
      scrollBlocksRef.current = []
    }
  }, [visible])

  // NOTE: no early return before this point — every hook above and below
  // must run on every render (React's rules of hooks forbid conditionally
  // skipped hooks), so visibility only gates the final JSX below.

  // ── position sync ────────────────────────────────────────────────────────
  const scheduleSync = useCallback((n: number): void => {
    const current = docRef.current
    if (current === null) return
    setSyncState('pending')
    if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      void fetch(`/api/doc/docs/${current.id}/position`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block: n, session: sessionIdRef.current })
      }).then(() => {
        if (aliveRef.current) setSyncState('synced')
      }).catch(() => {
        if (aliveRef.current) setSyncState('synced')
      })
    }, SYNC_DEBOUNCE_MS)
  }, [])

  // ── single-page mode ────────────────────────────────────────────────────
  const renderPdfBlock = useCallback(async (n: number): Promise<void> => {
    const pdf = pdfDocRef.current
    const body = bodyRef.current
    const canvas = canvasRef.current
    if (pdf === null || body === null || canvas === null) return
    try {
      renderTaskRef.current?.cancel()
      const page = await pdf.getPage(n)
      const cssWidth = Math.max(body.clientWidth - 24, 200)
      await renderPdfPageToCanvas(page, canvas, cssWidth, zoomRef.current)
    } catch {
      // render cancellation / page teardown — the next render wins
    }
  }, [])

  // ── scroll mode: block mounting ──────────────────────────────────────────

  /**
   * Mount (or restore) one block into the scroll container. The block is
   * appended in block order; concurrent duplicate requests are coalesced via
   * the pending set, and stale renders (after a rebuild) are dropped.
   */
  const ensureScrollBlock = useCallback(async (n: number): Promise<void> => {
    const doc = docRef.current
    const body = bodyRef.current
    if (doc === null || body === null || n < 1) return
    const total = totalRef.current
    if (total > 0 && n > total) return
    if (pendingBlocksRef.current.has(n)) return
    const list = scrollBlocksRef.current
    const existing = list.find((b) => b.block === n)
    if (existing !== undefined && !existing.unloaded) return

    pendingBlocksRef.current.add(n)
    const token = scrollTokenRef.current
    try {
      let el: HTMLDivElement
      if (existing !== undefined) {
        el = existing.el
        el.innerHTML = ''
        el.style.minHeight = ''
      } else {
        el = document.createElement('div')
        el.style.cssText = 'width:100%;display:flex;justify-content:center;'
        const prev = [...list].filter((b) => b.block < n).sort((a, b) => b.block - a.block)[0]
        body.insertBefore(el, prev !== undefined ? prev.el.nextSibling : body.firstChild)
        const insertAt = list.findIndex((b) => b.block > n)
        list.splice(insertAt === -1 ? list.length : insertAt, 0, { block: n, el, height: 0, canvas: null, unloaded: false })
      }

      let height = 0
      let canvas: HTMLCanvasElement | null = null
      if (doc.kind === 'pdf') {
        const pdf = pdfDocRef.current
        if (pdf !== null) {
          canvas = document.createElement('canvas')
          el.appendChild(canvas)
          const page = await pdf.getPage(n)
          const cssWidth = Math.max(body.clientWidth - 24, 200)
          height = await renderPdfPageToCanvas(page, canvas, cssWidth, zoomRef.current)
        }
      } else if (doc.kind === 'xlsx' || doc.kind === 'csv') {
        const res = await fetch(`/api/doc/docs/${doc.id}/block-table/${n}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as TableData
        const wrap = document.createElement('div')
        wrap.style.cssText = 'align-self:flex-start;width:100%;max-width:760px;overflow-x:auto;'
        wrap.appendChild(buildTableElement(data))
        el.appendChild(wrap)
        height = el.offsetHeight
      } else {
        const res = await fetch(`/api/doc/docs/${doc.id}/blocks/${n}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { text: string }
        const pre = document.createElement('pre')
        pre.textContent = data.text
        pre.style.cssText = 'align-self:flex-start;width:100%;max-width:46em;margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:15px;line-height:1.75;'
        el.appendChild(pre)
        height = el.offsetHeight
      }

      if (token !== scrollTokenRef.current) return // stale rebuild — drop
      const rec = list.find((b) => b.block === n)
      if (rec !== undefined) {
        rec.height = height
        rec.canvas = canvas
        rec.unloaded = false
      }
    } catch {
      // failed mount: keep the entry pending-free so a later attempt retries
    } finally {
      pendingBlocksRef.current.delete(n)
    }
  }, [])

  /** Which mounted block sits under the viewport centre line. */
  const currentCenterBlock = useCallback((): number => {
    const body = bodyRef.current
    if (body === null) return blockRef.current
    const centerY = body.scrollTop + body.clientHeight / 2
    for (const rec of scrollBlocksRef.current) {
      const top = rec.el.offsetTop
      if (centerY >= top && centerY < top + rec.height) return rec.block
    }
    return blockRef.current
  }, [])

  /** Drop the farthest mounted blocks (keeping height placeholders). */
  const reclaimScrollBlocks = useCallback((center: number): void => {
    const list = scrollBlocksRef.current
    const mounted = list.filter((b) => !b.unloaded)
    const mountedPdf = mounted.filter((b) => b.canvas !== null).length
    // Only MOUNTED blocks count towards the caps — reclaimed blocks stay in
    // the list as placeholders and must not force further reclaims.
    let toReclaim = Math.max(mounted.length - MAX_BLOCKS, mountedPdf - MAX_PDF_CANVAS)
    if (toReclaim <= 0) return
    const candidates = list
      .filter((b) => !b.unloaded && b.el.childElementCount > 0)
      .sort((a, b) => Math.abs(a.block - center) - Math.abs(b.block - center))
    // Reclaim FARTHEST from the viewport centre first — never the page the
    // reader is currently looking at.
    for (let i = candidates.length - 1; i >= 0 && toReclaim > 0; i -= 1) {
      const rec = candidates[i]!
      rec.el.innerHTML = ''
      rec.el.style.minHeight = `${rec.height}px`
      rec.canvas = null
      rec.unloaded = true
      toReclaim -= 1
    }
  }, [])

  /** Scroll handler: track the centre block, preload, and reclaim. */
  const handleScroll = useCallback((): void => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const body = bodyRef.current
      if (body === null || modeRef.current !== 'scroll') return
      const center = currentCenterBlock()
      // If the viewport-centre block is a reclaimed placeholder, restore its
      // render immediately so a stopped scroll never sits on blank space.
      const centerRec = scrollBlocksRef.current.find((b) => b.block === center)
      if (centerRec !== undefined && centerRec.unloaded) void ensureScrollBlock(center)
      if (center !== blockRef.current) {
        blockRef.current = center
        setBlock(center)
        lastNavAtRef.current = Date.now()
        scheduleSync(center)
      }
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - body.clientHeight * 1.5) {
        const last = scrollBlocksRef.current.reduce((max, b) => Math.max(max, b.block), 0)
        for (let i = 1; i <= PRELOAD_AFTER; i += 1) void ensureScrollBlock(last + i)
      }
      if (body.scrollTop < 60) {
        const first = scrollBlocksRef.current.reduce(
          (min, b) => Math.min(min, b.block),
          Number.MAX_SAFE_INTEGER
        )
        if (first > 1) {
          for (let i = 1; i <= PRELOAD_BEFORE; i += 1) void ensureScrollBlock(first - i)
        }
      }
      reclaimScrollBlocks(center)
    })
  }, [currentCenterBlock, ensureScrollBlock, reclaimScrollBlocks, scheduleSync])

  /** Rebuild the scroll container starting at block n and scroll to it. */
  const renderScrollFrom = useCallback(async (n: number, opts: { report: boolean }): Promise<void> => {
    const body = bodyRef.current
    if (body === null) return
    scrollTokenRef.current += 1
    const token = scrollTokenRef.current
    scrollBlocksRef.current = []
    pendingBlocksRef.current.clear()
    body.innerHTML = ''
    lastNavAtRef.current = Date.now()
    blockRef.current = n
    setBlock(n)
    if (opts.report) scheduleSync(n)
    const start = Math.max(1, n - PRELOAD_BEFORE)
    for (let k = start; k <= n + PRELOAD_AFTER; k += 1) {
      await ensureScrollBlock(k)
    }
    if (token !== scrollTokenRef.current) return // superseded
    const rec = scrollBlocksRef.current.find((b) => b.block === n)
    if (rec !== undefined) body.scrollTop = Math.max(rec.el.offsetTop - 8, 0)
  }, [ensureScrollBlock, scheduleSync])

  // ── block navigation (both modes) ───────────────────────────────────────
  const showBlock = useCallback(async (n: number, opts: { report: boolean }): Promise<void> => {
    const current = docRef.current
    if (current === null) return
    if (modeRef.current === 'scroll') {
      await renderScrollFrom(n, opts)
      return
    }
    const token = ++navTokenRef.current
    lastNavAtRef.current = Date.now()
    blockRef.current = n
    setBlock(n)
    if (opts.report) scheduleSync(n)
    if (current.kind === 'pdf') {
      setPageText(null)
      setTable(null)
      await renderPdfBlock(n)
    } else if (current.kind === 'xlsx' || current.kind === 'csv') {
      setPageText(null)
      setTable(null)
      try {
        const res = await fetch(`/api/doc/docs/${current.id}/block-table/${n}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as TableData
        if (token !== navTokenRef.current || !aliveRef.current) return
        setTable(data)
      } catch (err) {
        if (token === navTokenRef.current && aliveRef.current) setError(String(err instanceof Error ? err.message : err))
      }
    } else {
      setTable(null)
      setPageText(null)
      try {
        const res = await fetch(`/api/doc/docs/${current.id}/blocks/${n}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { text: string }
        if (token !== navTokenRef.current || !aliveRef.current) return
        setPageText(data.text)
      } catch (err) {
        if (token === navTokenRef.current && aliveRef.current) setError(String(err instanceof Error ? err.message : err))
      }
    }
  }, [renderPdfBlock, renderScrollFrom, scheduleSync])

  // ── document loading ─────────────────────────────────────────────────────
  const loadDoc = useCallback(async (info: PanelDoc, targetBlock: number): Promise<void> => {
    const token = ++navTokenRef.current
    loadingRef.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/doc/docs/${info.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      if (token !== navTokenRef.current) return
      docRef.current = info
      pdfDocRef.current = null
      setDoc(info)
      setReady(info.ready)
      if (info.kind === 'pdf') {
        const module = await pdfjs()
        const pdf = await module.getDocument(pdfDocumentOptions(new Uint8Array(buf))).promise
        if (token !== navTokenRef.current || docRef.current?.id !== info.id) {
          void pdf.destroy()
          return
        }
        pdfDocRef.current = pdf
        totalRef.current = pdf.numPages
        setTotal(pdf.numPages)
      } else {
        totalRef.current = info.total_blocks ?? 0
        setTotal(info.total_blocks ?? 0)
      }
      await showBlock(targetBlock, { report: true })
    } catch (err) {
      if (token === navTokenRef.current && aliveRef.current) {
        setError(String(err instanceof Error ? err.message : err))
      }
    } finally {
      if (token === navTokenRef.current) {
        loadingRef.current = false
        setBusy(false)
      }
    }
  }, [showBlock])

  // ── host sync (poll + immediate refresh share one body) ─────────────────
  const syncOnce = useCallback((): void => {
    // Without a current session there is nothing to follow: never surface
    // the session-less fallback position to the reader.
    if (!aliveRef.current || loadingRef.current || !isPanelRequested(sessionIdRef.current)) return
    const sessionId = sessionIdRef.current
    if (sessionId === undefined || sessionId === '') return
    void fetchDocState(sessionId).then((state: DocState) => {
      if (!aliveRef.current || loadingRef.current || !isPanelRequested(sessionIdRef.current)) return
      const current = docRef.current
      if (state.doc === null) {
        if (current !== null) {
          docRef.current = null
          pdfDocRef.current = null
          setDoc(null)
          setPageText(null)
          setTable(null)
          setTotal(0)
          if (bodyRef.current !== null) bodyRef.current.innerHTML = ''
          scrollBlocksRef.current = []
        }
        return
      }
      const info = state.doc
      if (current === null || current.id !== info.id) {
        void loadDoc(info, state.block ?? 1)
        return
      }
      if (info.total_blocks !== null && info.total_blocks !== totalRef.current && info.kind !== 'pdf') {
        totalRef.current = info.total_blocks
        setTotal(info.total_blocks)
      }
      setReady(info.ready)
      const target = state.block ?? 1
      if (target !== blockRef.current && Date.now() - lastNavAtRef.current > FOLLOW_GRACE_MS) {
        void showBlock(target, { report: false })
      }
    }).catch(() => {})
  }, [loadDoc, showBlock])

  useEffect(() => {
    const timer = setInterval(syncOnce, POLL_MS)
    return () => clearInterval(timer)
  }, [syncOnce])

  // Sync immediately when the panel opens or the current session changes —
  // no waiting for the next poll tick. (currentSessionId is defined above.)
  useEffect(() => {
    if (visible) syncOnce()
  }, [visible, currentSessionId, syncOnce])

  // ── resize / zoom re-renders the current view ────────────────────────────
  const reflow = useCallback((): void => {
    if (modeRef.current === 'scroll') {
      void renderScrollFrom(blockRef.current, { report: false })
    } else if (docRef.current?.kind === 'pdf') {
      void renderPdfBlock(blockRef.current)
    }
  }, [renderPdfBlock, renderScrollFrom])

  useEffect(() => {
    const onResize = (): void => {
      // Shrink the panel back into the viewport limit after window changes.
      setWidth((w) => clampPanelWidth(w))
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(reflow, 250)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current)
    }
  }, [reflow])

  // Zoom changes re-render the current view (both modes).
  useEffect(() => {
    if (docRef.current !== null) reflow()
  }, [zoom, reflow])

  // ── unmount cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current)
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
      renderTaskRef.current?.cancel()
      const frame = layoutFrame()
      if (frame !== null) frame.style.paddingRight = ''
    }
  }, [])

  // ── actions ──────────────────────────────────────────────────────────────
  const navTo = useCallback((n: number): void => {
    const clamped = Math.min(Math.max(1, n), Math.max(totalRef.current, 1))
    if (clamped === blockRef.current) return
    void showBlock(clamped, { report: true })
  }, [showBlock])

  const switchMode = useCallback((next: ViewMode): void => {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // ignore — mode just won't persist
    }
    if (next === 'scroll') {
      void renderScrollFrom(blockRef.current, { report: false })
    } else {
      void showBlock(blockRef.current, { report: false })
    }
  }, [renderScrollFrom, showBlock])

  const closePanel = useCallback((): void => {
    dismissPanel(sessionIdRef.current)
  }, [])

  const pickUpload = useCallback((): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.style.display = 'none'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file === undefined) return
      setUploading(true)
      setError(null)
      void uploadDocument(file, sessionIdRef.current)
        .then(async ({ doc_id }) => {
          const state = await fetchDocState(sessionIdRef.current)
          if (state.doc !== null && state.doc.id === doc_id) {
            await loadDoc(state.doc, state.block ?? 1)
          }
        })
        .catch((err: unknown) => {
          setError(String(err instanceof Error ? err.message : err))
        })
        .finally(() => setUploading(false))
    }
    input.click()
  }, [loadDoc])

  const footerText = doc !== null
    ? t('panel.blockOf', { block: String(block), total: String(total || '?') })
    : ''

  // All hooks have run above; visibility only decides whether to render.
  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width,
        zIndex: 30,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-base, #ffffff)',
        borderLeft: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
        fontFamily: 'var(--ds-font-family, system-ui, sans-serif)',
        fontSize: 13,
        color: 'var(--dsw-alias-text-primary, #1a1a1a)'
      }}
    >
      {/* resize handle */}
      <div
        onPointerDown={(e) => {
          e.preventDefault()
          const startX = e.clientX
          const startW = widthRef.current
          const onMove = (ev: PointerEvent): void => setWidth(clampPanelWidth(startW + startX - ev.clientX))
          const onUp = (): void => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            try {
              localStorage.setItem(WIDTH_KEY, String(widthRef.current))
            } catch {
              // ignore — width just won't persist
            }
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }}
        style={{
          position: 'absolute',
          left: -4,
          top: 0,
          bottom: 0,
          width: 9,
          cursor: 'col-resize',
          zIndex: 1,
          touchAction: 'none'
        }}
        title=""
      />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))' }}>
        <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc !== null ? doc.name : t('panel.title')}
        </span>
        {!ready && doc !== null && (
          <span style={{ opacity: 0.65 }}>{t('panel.indexing')}</span>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={pickUpload}
          title={t('panel.openDoc')}
          style={{ ...toolButtonStyle, fontWeight: 600, flexShrink: 0 }}
        >
          {uploading ? t('panel.uploading') : t('panel.openDoc')}
        </button>
        <button
          type="button"
          title={t('panel.close')}
          onClick={closePanel}
          style={iconButtonStyle}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {/* toolbar */}
      {doc !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))', flexWrap: 'wrap' }}>
          {mode === 'single' && (
            <>
              <button type="button" title={t('panel.prev')} disabled={block <= 1} onClick={() => navTo(block - 1)} style={toolButtonStyle}>{'‹'}</button>
              <button type="button" title={t('panel.next')} disabled={total > 0 && block >= total} onClick={() => navTo(block + 1)} style={toolButtonStyle}>{'›'}</button>
            </>
          )}
          <input
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number.parseInt(jumpInput, 10)
                if (Number.isInteger(n)) navTo(n)
                setJumpInput('')
              }
            }}
            placeholder={t('panel.jumpPlaceholder')}
            style={{
              width: 56,
              padding: '2px 6px',
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.4))',
              borderRadius: 4,
              background: 'transparent',
              color: 'inherit'
            }}
          />
          <span style={{ opacity: 0.75, margin: '0 4px' }}>{footerText}</span>
          {doc.kind === 'pdf' && (
            <>
              <button type="button" title={t('panel.zoomOut')} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z / 1.2) * 100) / 100))} style={toolButtonStyle}>{'−'}</button>
              <button type="button" title={t('panel.zoomIn')} onClick={() => setZoom((z) => Math.min(4, Math.round(z * 1.2 * 100) / 100))} style={toolButtonStyle}>{'+'}</button>
              <button type="button" title={t('panel.fitWidth')} onClick={() => setZoom(1)} style={toolButtonStyle}>{t('panel.fitWidth')}</button>
            </>
          )}
          <button
            type="button"
            onClick={() => switchMode(mode === 'scroll' ? 'single' : 'scroll')}
            style={{ ...toolButtonStyle, fontWeight: 600 }}
          >
            {mode === 'scroll' ? t('panel.scrollMode') : t('panel.singleMode')}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={uploading} onClick={pickUpload} style={{ ...toolButtonStyle, fontWeight: 600 }}>
            {uploading ? t('panel.uploading') : t('panel.openDoc')}
          </button>
        </div>
      )}

      {/* body */}
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 12,
          background: 'var(--dsw-alias-bg-base, #ffffff)'
        }}
      >
        {busy && doc === null && (
          <div style={{ alignSelf: 'center', opacity: 0.7 }}>{t('panel.loading')}</div>
        )}
        {doc === null && !busy && (
          <div style={{ alignSelf: 'center', textAlign: 'center', opacity: 0.8, maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>{t('panel.empty')}</div>
            <button type="button" disabled={uploading} onClick={pickUpload} style={{ ...toolButtonStyle, padding: '8px 16px', fontWeight: 600, alignSelf: 'center' }}>
              {uploading ? t('panel.uploading') : t('panel.openDoc')}
            </button>
          </div>
        )}
        {doc !== null && mode === 'single' && doc.kind === 'pdf' && (
          <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
        )}
        {doc !== null && mode === 'single' && (doc.kind === 'xlsx' || doc.kind === 'csv') && table !== null && (
          <div style={{ alignSelf: 'flex-start', width: '100%', maxWidth: 760, overflowX: 'auto' }}>
            {table.columns.length > 0 || table.rows.length > 0 ? (
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    {table.columns.map((cell, i) => (
                      <th key={i} style={{ ...cellStyle, background: 'var(--dsw-alias-bg-hover, rgba(127,127,127,0.12))', fontWeight: 600 }}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={cellStyle}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ opacity: 0.7 }}>{t('panel.tableEmpty')}</div>
            )}
          </div>
        )}
        {doc !== null && mode === 'single' && doc.kind !== 'pdf' && doc.kind !== 'xlsx' && doc.kind !== 'csv' && pageText !== null && (
          <pre
            style={{
              alignSelf: 'flex-start',
              width: '100%',
              maxWidth: '46em',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
              fontSize: 15,
              lineHeight: 1.75
            }}
          >
            {pageText}
          </pre>
        )}
        {doc !== null && mode === 'single' && doc.kind !== 'pdf' && doc.kind !== 'xlsx' && doc.kind !== 'csv' && pageText === null && !busy && (
          <div style={{ alignSelf: 'center', opacity: 0.7 }}>{t('panel.loading')}</div>
        )}
      </div>

      {/* footer */}
      {doc !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))', opacity: 0.75 }}>
          <span>{footerText}</span>
          <span style={{ opacity: 0.6 }}>{mode === 'scroll' ? t('panel.scrollMode') : t('panel.singleMode')}</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: syncState === 'synced' ? 'var(--dsw-alias-text-success, #2f9e44)' : 'var(--dsw-alias-text-warning, #e8590c)' }}>
            {syncState === 'synced' ? t('panel.synced') : t('panel.syncing')}
          </span>
        </div>
      )}

      {/* error banner */}
      {error !== null && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--dsw-alias-border-danger, rgba(230,73,73,0.4))', color: 'var(--dsw-alias-text-danger, #e64949)', background: 'var(--dsw-alias-bg-danger, rgba(230,73,73,0.08))', wordBreak: 'break-all' }}>
          {error}
        </div>
      )}
    </div>
  )
}

const iconButtonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  display: 'inline-flex',
  alignItems: 'center',
  color: 'inherit',
  borderRadius: 4
}

const toolButtonStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.4))',
  background: 'transparent',
  cursor: 'pointer',
  padding: '2px 8px',
  borderRadius: 4,
  color: 'inherit',
  fontSize: 13,
  lineHeight: 1.6
}

const cellStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.3))',
  padding: '4px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}

const cellStyleText = 'border:1px solid rgba(127,127,127,0.3);padding:4px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word;'
