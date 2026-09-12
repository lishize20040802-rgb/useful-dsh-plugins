window.__ModuleLoader__.load({ id: "dsh-plugin-doc-companion", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/client/style.ts
var CSS = `
.dsh-doc-companion-canvas-wrap {
  display: flex;
  justify-content: center;
}
`;
var injected = false;
function injectCss() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

// src/client/locales.ts
var zh = {
  // Toolbar toggle
  "toggle.title": "\u6587\u6863\u4F34\u8BFB",
  // Panel shell
  "panel.title": "\u6587\u6863\u4F34\u8BFB",
  "panel.close": "\u5173\u95ED\u9762\u677F",
  "panel.openDoc": "\u6253\u5F00\u6587\u6863",
  "panel.empty": "\u8FD8\u6CA1\u6709\u6253\u5F00\u6587\u6863 \u2014 \u70B9\u300C\u6253\u5F00\u6587\u6863\u300D\u4E0A\u4F20\uFF0C\u6216\u76F4\u63A5\u8BA9 AI \u5E2E\u4F60\u6253\u5F00",
  "panel.uploading": "\u4E0A\u4F20\u4E2D\u2026",
  "panel.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "panel.indexing": "\u5168\u6587\u7D22\u5F15\u6784\u5EFA\u4E2D\uFF08\u641C\u7D22\u53EF\u7528\u524D\uFF09\u2026",
  "panel.loadFailed": "\u52A0\u8F7D\u5931\u8D25\uFF1A{message}",
  "panel.uploadFailed": "\u4E0A\u4F20\u5931\u8D25\uFF1A{message}",
  // Navigation
  "panel.prev": "\u4E0A\u4E00\u5757",
  "panel.next": "\u4E0B\u4E00\u5757",
  "panel.jumpPlaceholder": "\u9875\u7801",
  "panel.blockOf": "\u7B2C {block} / {total} \u5757",
  "panel.scanned": "\xB7 \u626B\u63CF\u9875",
  // Zoom (PDF)
  "panel.zoomOut": "\u7F29\u5C0F",
  "panel.zoomIn": "\u653E\u5927",
  "panel.fitWidth": "\u9002\u5E94\u5BBD\u5EA6",
  // View mode
  "panel.scrollMode": "\u8FDE\u7EED\u6EDA\u52A8",
  "panel.singleMode": "\u5355\u9875",
  // Sync status
  "panel.synced": "\u5DF2\u540C\u6B65",
  "panel.syncing": "\u540C\u6B65\u4E2D\u2026",
  // Table view
  "panel.tableTitle": "{sheet} \u7B2C {first}\u2013{last} \u884C",
  "panel.tableEmpty": "\uFF08\u7A7A\u8868\u683C\uFF09"
};
var en = {
  "toggle.title": "Doc companion",
  "panel.title": "Doc companion",
  "panel.close": "Close panel",
  "panel.openDoc": "Open document",
  "panel.empty": "No document open \u2014 upload one here, or ask the AI to open it",
  "panel.uploading": "Uploading\u2026",
  "panel.loading": "Loading\u2026",
  "panel.indexing": "Building full-text index (before search is ready)\u2026",
  "panel.loadFailed": "Failed to load: {message}",
  "panel.uploadFailed": "Upload failed: {message}",
  "panel.prev": "Previous block",
  "panel.next": "Next block",
  "panel.jumpPlaceholder": "Page",
  "panel.blockOf": "Block {block} / {total}",
  "panel.scanned": "\xB7 scanned page",
  "panel.zoomOut": "Zoom out",
  "panel.zoomIn": "Zoom in",
  "panel.fitWidth": "Fit width",
  "panel.scrollMode": "Continuous scroll",
  "panel.singleMode": "Single page",
  "panel.synced": "synced",
  "panel.syncing": "syncing\u2026",
  "panel.tableTitle": "{sheet} rows {first}\u2013{last}",
  "panel.tableEmpty": "(empty table)"
};
var NS = "dsh-plugin-doc-companion";

// src/client/store.ts
var listeners = /* @__PURE__ */ new Set();
var panelRequestedBySession = /* @__PURE__ */ new Map();
function isPanelRequested(sessionId) {
  if (sessionId === void 0 || sessionId === "") return false;
  return panelRequestedBySession.get(sessionId) === true;
}
function requestPanel(sessionId) {
  if (sessionId === void 0 || sessionId === "") return;
  panelRequestedBySession.set(sessionId, true);
  for (const listener of listeners) listener();
}
function dismissPanel(sessionId) {
  if (sessionId === void 0 || sessionId === "") return;
  panelRequestedBySession.set(sessionId, false);
  for (const listener of listeners) listener();
}
function subscribePanelRequested(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// src/client/panel.tsx
var import_react = require("react");

// src/client/pdf.ts
var pdfjsPromise = null;
function pdfjs() {
  if (pdfjsPromise === null) {
    pdfjsPromise = new Function("u", "return import(u)")("/doc-static/build/pdf.min.mjs").then((module2) => {
      module2.GlobalWorkerOptions.workerSrc = "/doc-static/build/pdf.worker.min.mjs";
      return module2;
    });
  }
  return pdfjsPromise;
}
function pdfDocumentOptions(data) {
  return {
    data,
    cMapUrl: "/doc-static/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/doc-static/standard_fonts/"
  };
}
async function renderPdfPageToCanvas(page, canvas, cssWidth, zoom) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(cssWidth, 200) / base.width * zoom;
  const viewport = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const context = canvas.getContext("2d");
  if (context === null) return viewport.height;
  const task = page.render({
    canvasContext: context,
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : void 0
  });
  await task.promise;
  return viewport.height;
}

// src/client/upload.ts
var ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.markdown";
async function uploadDocument(file, sessionId) {
  const headers = { "x-file-name": encodeURIComponent(file.name) };
  if (sessionId !== void 0 && sessionId !== "") headers["x-session"] = sessionId;
  const res = await fetch("/api/doc/upload", {
    method: "POST",
    headers,
    body: file
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return res.json();
}
async function fetchDocState(sessionId) {
  const query = sessionId !== void 0 && sessionId !== "" ? `?session=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`/api/doc/state${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// src/client/panel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var POLL_MS = 2e3;
var FOLLOW_GRACE_MS = 1500;
var SYNC_DEBOUNCE_MS = 400;
var WIDTH_KEY = "dsh-doc-companion.panelWidth";
var MODE_KEY = "dsh-doc-companion.viewMode";
var MIN_WIDTH = 340;
var MAX_PDF_CANVAS = 10;
var MAX_BLOCKS = 90;
var PRELOAD_AFTER = 3;
var PRELOAD_BEFORE = 2;
function initialPanelWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_WIDTH) {
      return Math.min(Math.round(saved), Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.7)));
    }
  } catch {
  }
  return Math.min(Math.max(Math.floor(window.innerWidth * 0.42), 380), 660);
}
function clampPanelWidth(width) {
  return Math.min(Math.max(Math.round(width), MIN_WIDTH), Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.7)));
}
function initialViewMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "single" ? "single" : "scroll";
  } catch {
    return "scroll";
  }
}
function layoutFrame() {
  const layer = document.querySelector("[data-shell-overlay]");
  const frame = layer?.parentElement;
  return frame instanceof HTMLElement ? frame : null;
}
function buildTableElement(data) {
  const tableEl = document.createElement("table");
  tableEl.style.cssText = "border-collapse:collapse;font-size:12px;width:100%;";
  if (data.columns.length === 0 && data.rows.length === 0) return tableEl;
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const cell of data.columns) {
    const th = document.createElement("th");
    th.textContent = cell;
    th.style.cssText = `${cellStyleText};background:rgba(127,127,127,0.12);font-weight:600;`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  tableEl.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      td.style.cssText = cellStyleText;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
  return tableEl;
}
function DocPanel(props) {
  const t = props.t ?? ((key) => key);
  const [visible, setVisible] = (0, import_react.useState)(false);
  const [doc, setDoc] = (0, import_react.useState)(null);
  const [block, setBlock] = (0, import_react.useState)(1);
  const [total, setTotal] = (0, import_react.useState)(0);
  const [ready, setReady] = (0, import_react.useState)(false);
  const [zoom, setZoom] = (0, import_react.useState)(1);
  const [mode, setMode] = (0, import_react.useState)(initialViewMode);
  const [width, setWidth] = (0, import_react.useState)(initialPanelWidth);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [uploading, setUploading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [syncState, setSyncState] = (0, import_react.useState)("synced");
  const [pageText, setPageText] = (0, import_react.useState)(null);
  const [table, setTable] = (0, import_react.useState)(null);
  const [jumpInput, setJumpInput] = (0, import_react.useState)("");
  const pdfDocRef = (0, import_react.useRef)(null);
  const bodyRef = (0, import_react.useRef)(null);
  const canvasRef = (0, import_react.useRef)(null);
  const renderTaskRef = (0, import_react.useRef)(null);
  const docRef = (0, import_react.useRef)(null);
  const blockRef = (0, import_react.useRef)(1);
  const totalRef = (0, import_react.useRef)(0);
  const zoomRef = (0, import_react.useRef)(1);
  const modeRef = (0, import_react.useRef)("scroll");
  const widthRef = (0, import_react.useRef)(width);
  const sessionIdRef = (0, import_react.useRef)(void 0);
  const lastNavAtRef = (0, import_react.useRef)(0);
  const syncTimerRef = (0, import_react.useRef)(null);
  const navTokenRef = (0, import_react.useRef)(0);
  const loadingRef = (0, import_react.useRef)(false);
  const aliveRef = (0, import_react.useRef)(true);
  const scrollBlocksRef = (0, import_react.useRef)([]);
  const pendingBlocksRef = (0, import_react.useRef)(/* @__PURE__ */ new Set());
  const scrollTokenRef = (0, import_react.useRef)(0);
  const scrollRafRef = (0, import_react.useRef)(null);
  const resizeTimerRef = (0, import_react.useRef)(null);
  zoomRef.current = zoom;
  modeRef.current = mode;
  widthRef.current = width;
  const sessionsSnapshot = props.useSessions !== void 0 ? props.useSessions((s) => s) : void 0;
  const currentSessionId = sessionsSnapshot?.current;
  sessionIdRef.current = currentSessionId;
  (0, import_react.useEffect)(() => subscribePanelRequested(() => {
    setVisible(isPanelRequested(sessionIdRef.current));
  }), []);
  (0, import_react.useEffect)(() => {
    setVisible(isPanelRequested(currentSessionId));
  }, [currentSessionId]);
  (0, import_react.useEffect)(() => {
    const frame = layoutFrame();
    if (frame === null) return;
    frame.style.paddingRight = visible ? `${width}px` : "";
  }, [visible, width]);
  (0, import_react.useEffect)(() => {
    if (visible) return;
    if (docRef.current !== null) {
      docRef.current = null;
      pdfDocRef.current = null;
      setDoc(null);
      setPageText(null);
      setTable(null);
      setTotal(0);
      if (bodyRef.current !== null) bodyRef.current.innerHTML = "";
      scrollBlocksRef.current = [];
    }
  }, [visible]);
  const scheduleSync = (0, import_react.useCallback)((n) => {
    const current = docRef.current;
    if (current === null) return;
    setSyncState("pending");
    if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void fetch(`/api/doc/docs/${current.id}/position`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ block: n, session: sessionIdRef.current })
      }).then(() => {
        if (aliveRef.current) setSyncState("synced");
      }).catch(() => {
        if (aliveRef.current) setSyncState("synced");
      });
    }, SYNC_DEBOUNCE_MS);
  }, []);
  const renderPdfBlock = (0, import_react.useCallback)(async (n) => {
    const pdf = pdfDocRef.current;
    const body = bodyRef.current;
    const canvas = canvasRef.current;
    if (pdf === null || body === null || canvas === null) return;
    try {
      renderTaskRef.current?.cancel();
      const page = await pdf.getPage(n);
      const cssWidth = Math.max(body.clientWidth - 24, 200);
      await renderPdfPageToCanvas(page, canvas, cssWidth, zoomRef.current);
    } catch {
    }
  }, []);
  const ensureScrollBlock = (0, import_react.useCallback)(async (n) => {
    const doc2 = docRef.current;
    const body = bodyRef.current;
    if (doc2 === null || body === null || n < 1) return;
    const total2 = totalRef.current;
    if (total2 > 0 && n > total2) return;
    if (pendingBlocksRef.current.has(n)) return;
    const list = scrollBlocksRef.current;
    const existing = list.find((b) => b.block === n);
    if (existing !== void 0 && !existing.unloaded) return;
    pendingBlocksRef.current.add(n);
    const token = scrollTokenRef.current;
    try {
      let el;
      if (existing !== void 0) {
        el = existing.el;
        el.innerHTML = "";
        el.style.minHeight = "";
      } else {
        el = document.createElement("div");
        el.style.cssText = "width:100%;display:flex;justify-content:center;";
        const prev = [...list].filter((b) => b.block < n).sort((a, b) => b.block - a.block)[0];
        body.insertBefore(el, prev !== void 0 ? prev.el.nextSibling : body.firstChild);
        const insertAt = list.findIndex((b) => b.block > n);
        list.splice(insertAt === -1 ? list.length : insertAt, 0, { block: n, el, height: 0, canvas: null, unloaded: false });
      }
      let height = 0;
      let canvas = null;
      if (doc2.kind === "pdf") {
        const pdf = pdfDocRef.current;
        if (pdf !== null) {
          canvas = document.createElement("canvas");
          el.appendChild(canvas);
          const page = await pdf.getPage(n);
          const cssWidth = Math.max(body.clientWidth - 24, 200);
          height = await renderPdfPageToCanvas(page, canvas, cssWidth, zoomRef.current);
        }
      } else if (doc2.kind === "xlsx" || doc2.kind === "csv") {
        const res = await fetch(`/api/doc/docs/${doc2.id}/block-table/${n}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const wrap = document.createElement("div");
        wrap.style.cssText = "align-self:flex-start;width:100%;max-width:760px;overflow-x:auto;";
        wrap.appendChild(buildTableElement(data));
        el.appendChild(wrap);
        height = el.offsetHeight;
      } else {
        const res = await fetch(`/api/doc/docs/${doc2.id}/blocks/${n}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const pre = document.createElement("pre");
        pre.textContent = data.text;
        pre.style.cssText = "align-self:flex-start;width:100%;max-width:46em;margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:15px;line-height:1.75;";
        el.appendChild(pre);
        height = el.offsetHeight;
      }
      if (token !== scrollTokenRef.current) return;
      const rec = list.find((b) => b.block === n);
      if (rec !== void 0) {
        rec.height = height;
        rec.canvas = canvas;
        rec.unloaded = false;
      }
    } catch {
    } finally {
      pendingBlocksRef.current.delete(n);
    }
  }, []);
  const currentCenterBlock = (0, import_react.useCallback)(() => {
    const body = bodyRef.current;
    if (body === null) return blockRef.current;
    const centerY = body.scrollTop + body.clientHeight / 2;
    for (const rec of scrollBlocksRef.current) {
      const top = rec.el.offsetTop;
      if (centerY >= top && centerY < top + rec.height) return rec.block;
    }
    return blockRef.current;
  }, []);
  const reclaimScrollBlocks = (0, import_react.useCallback)((center) => {
    const list = scrollBlocksRef.current;
    const mounted = list.filter((b) => !b.unloaded);
    const mountedPdf = mounted.filter((b) => b.canvas !== null).length;
    let toReclaim = Math.max(mounted.length - MAX_BLOCKS, mountedPdf - MAX_PDF_CANVAS);
    if (toReclaim <= 0) return;
    const candidates = list.filter((b) => !b.unloaded && b.el.childElementCount > 0).sort((a, b) => Math.abs(a.block - center) - Math.abs(b.block - center));
    for (let i = candidates.length - 1; i >= 0 && toReclaim > 0; i -= 1) {
      const rec = candidates[i];
      rec.el.innerHTML = "";
      rec.el.style.minHeight = `${rec.height}px`;
      rec.canvas = null;
      rec.unloaded = true;
      toReclaim -= 1;
    }
  }, []);
  const handleScroll = (0, import_react.useCallback)(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const body = bodyRef.current;
      if (body === null || modeRef.current !== "scroll") return;
      const center = currentCenterBlock();
      const centerRec = scrollBlocksRef.current.find((b) => b.block === center);
      if (centerRec !== void 0 && centerRec.unloaded) void ensureScrollBlock(center);
      if (center !== blockRef.current) {
        blockRef.current = center;
        setBlock(center);
        lastNavAtRef.current = Date.now();
        scheduleSync(center);
      }
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - body.clientHeight * 1.5) {
        const last = scrollBlocksRef.current.reduce((max, b) => Math.max(max, b.block), 0);
        for (let i = 1; i <= PRELOAD_AFTER; i += 1) void ensureScrollBlock(last + i);
      }
      if (body.scrollTop < 60) {
        const first = scrollBlocksRef.current.reduce(
          (min, b) => Math.min(min, b.block),
          Number.MAX_SAFE_INTEGER
        );
        if (first > 1) {
          for (let i = 1; i <= PRELOAD_BEFORE; i += 1) void ensureScrollBlock(first - i);
        }
      }
      reclaimScrollBlocks(center);
    });
  }, [currentCenterBlock, ensureScrollBlock, reclaimScrollBlocks, scheduleSync]);
  const renderScrollFrom = (0, import_react.useCallback)(async (n, opts) => {
    const body = bodyRef.current;
    if (body === null) return;
    scrollTokenRef.current += 1;
    const token = scrollTokenRef.current;
    scrollBlocksRef.current = [];
    pendingBlocksRef.current.clear();
    body.innerHTML = "";
    lastNavAtRef.current = Date.now();
    blockRef.current = n;
    setBlock(n);
    if (opts.report) scheduleSync(n);
    const start = Math.max(1, n - PRELOAD_BEFORE);
    for (let k = start; k <= n + PRELOAD_AFTER; k += 1) {
      await ensureScrollBlock(k);
    }
    if (token !== scrollTokenRef.current) return;
    const rec = scrollBlocksRef.current.find((b) => b.block === n);
    if (rec !== void 0) body.scrollTop = Math.max(rec.el.offsetTop - 8, 0);
  }, [ensureScrollBlock, scheduleSync]);
  const showBlock = (0, import_react.useCallback)(async (n, opts) => {
    const current = docRef.current;
    if (current === null) return;
    if (modeRef.current === "scroll") {
      await renderScrollFrom(n, opts);
      return;
    }
    const token = ++navTokenRef.current;
    lastNavAtRef.current = Date.now();
    blockRef.current = n;
    setBlock(n);
    if (opts.report) scheduleSync(n);
    if (current.kind === "pdf") {
      setPageText(null);
      setTable(null);
      await renderPdfBlock(n);
    } else if (current.kind === "xlsx" || current.kind === "csv") {
      setPageText(null);
      setTable(null);
      try {
        const res = await fetch(`/api/doc/docs/${current.id}/block-table/${n}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (token !== navTokenRef.current || !aliveRef.current) return;
        setTable(data);
      } catch (err) {
        if (token === navTokenRef.current && aliveRef.current) setError(String(err instanceof Error ? err.message : err));
      }
    } else {
      setTable(null);
      setPageText(null);
      try {
        const res = await fetch(`/api/doc/docs/${current.id}/blocks/${n}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (token !== navTokenRef.current || !aliveRef.current) return;
        setPageText(data.text);
      } catch (err) {
        if (token === navTokenRef.current && aliveRef.current) setError(String(err instanceof Error ? err.message : err));
      }
    }
  }, [renderPdfBlock, renderScrollFrom, scheduleSync]);
  const loadDoc = (0, import_react.useCallback)(async (info, targetBlock) => {
    const token = ++navTokenRef.current;
    loadingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doc/docs/${info.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (token !== navTokenRef.current) return;
      docRef.current = info;
      pdfDocRef.current = null;
      setDoc(info);
      setReady(info.ready);
      if (info.kind === "pdf") {
        const module2 = await pdfjs();
        const pdf = await module2.getDocument(pdfDocumentOptions(new Uint8Array(buf))).promise;
        if (token !== navTokenRef.current || docRef.current?.id !== info.id) {
          void pdf.destroy();
          return;
        }
        pdfDocRef.current = pdf;
        totalRef.current = pdf.numPages;
        setTotal(pdf.numPages);
      } else {
        totalRef.current = info.total_blocks ?? 0;
        setTotal(info.total_blocks ?? 0);
      }
      await showBlock(targetBlock, { report: true });
    } catch (err) {
      if (token === navTokenRef.current && aliveRef.current) {
        setError(String(err instanceof Error ? err.message : err));
      }
    } finally {
      if (token === navTokenRef.current) {
        loadingRef.current = false;
        setBusy(false);
      }
    }
  }, [showBlock]);
  const syncOnce = (0, import_react.useCallback)(() => {
    if (!aliveRef.current || loadingRef.current || !isPanelRequested(sessionIdRef.current)) return;
    const sessionId = sessionIdRef.current;
    if (sessionId === void 0 || sessionId === "") return;
    void fetchDocState(sessionId).then((state) => {
      if (!aliveRef.current || loadingRef.current || !isPanelRequested(sessionIdRef.current)) return;
      const current = docRef.current;
      if (state.doc === null) {
        if (current !== null) {
          docRef.current = null;
          pdfDocRef.current = null;
          setDoc(null);
          setPageText(null);
          setTable(null);
          setTotal(0);
          if (bodyRef.current !== null) bodyRef.current.innerHTML = "";
          scrollBlocksRef.current = [];
        }
        return;
      }
      const info = state.doc;
      if (current === null || current.id !== info.id) {
        void loadDoc(info, state.block ?? 1);
        return;
      }
      if (info.total_blocks !== null && info.total_blocks !== totalRef.current && info.kind !== "pdf") {
        totalRef.current = info.total_blocks;
        setTotal(info.total_blocks);
      }
      setReady(info.ready);
      const target = state.block ?? 1;
      if (target !== blockRef.current && Date.now() - lastNavAtRef.current > FOLLOW_GRACE_MS) {
        void showBlock(target, { report: false });
      }
    }).catch(() => {
    });
  }, [loadDoc, showBlock]);
  (0, import_react.useEffect)(() => {
    const timer = setInterval(syncOnce, POLL_MS);
    return () => clearInterval(timer);
  }, [syncOnce]);
  (0, import_react.useEffect)(() => {
    if (visible) syncOnce();
  }, [visible, currentSessionId, syncOnce]);
  const reflow = (0, import_react.useCallback)(() => {
    if (modeRef.current === "scroll") {
      void renderScrollFrom(blockRef.current, { report: false });
    } else if (docRef.current?.kind === "pdf") {
      void renderPdfBlock(blockRef.current);
    }
  }, [renderPdfBlock, renderScrollFrom]);
  (0, import_react.useEffect)(() => {
    const onResize = () => {
      setWidth((w) => clampPanelWidth(w));
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(reflow, 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current);
    };
  }, [reflow]);
  (0, import_react.useEffect)(() => {
    if (docRef.current !== null) reflow();
  }, [zoom, reflow]);
  (0, import_react.useEffect)(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      renderTaskRef.current?.cancel();
      const frame = layoutFrame();
      if (frame !== null) frame.style.paddingRight = "";
    };
  }, []);
  const navTo = (0, import_react.useCallback)((n) => {
    const clamped = Math.min(Math.max(1, n), Math.max(totalRef.current, 1));
    if (clamped === blockRef.current) return;
    void showBlock(clamped, { report: true });
  }, [showBlock]);
  const switchMode = (0, import_react.useCallback)((next) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
    }
    if (next === "scroll") {
      void renderScrollFrom(blockRef.current, { report: false });
    } else {
      void showBlock(blockRef.current, { report: false });
    }
  }, [renderScrollFrom, showBlock]);
  const closePanel = (0, import_react.useCallback)(() => {
    dismissPanel(sessionIdRef.current);
  }, []);
  const pickUpload = (0, import_react.useCallback)(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file === void 0) return;
      setUploading(true);
      setError(null);
      void uploadDocument(file, sessionIdRef.current).then(async ({ doc_id }) => {
        const state = await fetchDocState(sessionIdRef.current);
        if (state.doc !== null && state.doc.id === doc_id) {
          await loadDoc(state.doc, state.block ?? 1);
        }
      }).catch((err) => {
        setError(String(err instanceof Error ? err.message : err));
      }).finally(() => setUploading(false));
    };
    input.click();
  }, [loadDoc]);
  const footerText = doc !== null ? t("panel.blockOf", { block: String(block), total: String(total || "?") }) : "";
  if (!visible) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        zIndex: 30,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        background: "var(--dsw-alias-bg-base, #ffffff)",
        borderLeft: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        fontFamily: "var(--ds-font-family, system-ui, sans-serif)",
        fontSize: 13,
        color: "var(--dsw-alias-text-primary, #1a1a1a)"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            onPointerDown: (e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = widthRef.current;
              const onMove = (ev) => setWidth(clampPanelWidth(startW + startX - ev.clientX));
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                try {
                  localStorage.setItem(WIDTH_KEY, String(widthRef.current));
                } catch {
                }
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            },
            style: {
              position: "absolute",
              left: -4,
              top: 0,
              bottom: 0,
              width: 9,
              cursor: "col-resize",
              zIndex: 1,
              touchAction: "none"
            },
            title: ""
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: doc !== null ? doc.name : t("panel.title") }),
          !ready && doc !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.65 }, children: t("panel.indexing") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              disabled: uploading,
              onClick: pickUpload,
              title: t("panel.openDoc"),
              style: { ...toolButtonStyle, fontWeight: 600, flexShrink: 0 },
              children: uploading ? t("panel.uploading") : t("panel.openDoc")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              title: t("panel.close"),
              onClick: closePanel,
              style: iconButtonStyle,
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2 2l10 10M12 2L2 12" }) })
            }
          )
        ] }),
        doc !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))", flexWrap: "wrap" }, children: [
          mode === "single" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("panel.prev"), disabled: block <= 1, onClick: () => navTo(block - 1), style: toolButtonStyle, children: "\u2039" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("panel.next"), disabled: total > 0 && block >= total, onClick: () => navTo(block + 1), style: toolButtonStyle, children: "\u203A" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              value: jumpInput,
              onChange: (e) => setJumpInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  const n = Number.parseInt(jumpInput, 10);
                  if (Number.isInteger(n)) navTo(n);
                  setJumpInput("");
                }
              },
              placeholder: t("panel.jumpPlaceholder"),
              style: {
                width: 56,
                padding: "2px 6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.4))",
                borderRadius: 4,
                background: "transparent",
                color: "inherit"
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.75, margin: "0 4px" }, children: footerText }),
          doc.kind === "pdf" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("panel.zoomOut"), onClick: () => setZoom((z) => Math.max(0.5, Math.round(z / 1.2 * 100) / 100)), style: toolButtonStyle, children: "\u2212" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("panel.zoomIn"), onClick: () => setZoom((z) => Math.min(4, Math.round(z * 1.2 * 100) / 100)), style: toolButtonStyle, children: "+" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("panel.fitWidth"), onClick: () => setZoom(1), style: toolButtonStyle, children: t("panel.fitWidth") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              onClick: () => switchMode(mode === "scroll" ? "single" : "scroll"),
              style: { ...toolButtonStyle, fontWeight: 600 },
              children: mode === "scroll" ? t("panel.scrollMode") : t("panel.singleMode")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: uploading, onClick: pickUpload, style: { ...toolButtonStyle, fontWeight: 600 }, children: uploading ? t("panel.uploading") : t("panel.openDoc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            ref: bodyRef,
            onScroll: handleScroll,
            style: {
              position: "relative",
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: 12,
              background: "var(--dsw-alias-bg-base, #ffffff)"
            },
            children: [
              busy && doc === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { alignSelf: "center", opacity: 0.7 }, children: t("panel.loading") }),
              doc === null && !busy && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { alignSelf: "center", textAlign: "center", opacity: 0.8, maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: t("panel.empty") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: uploading, onClick: pickUpload, style: { ...toolButtonStyle, padding: "8px 16px", fontWeight: 600, alignSelf: "center" }, children: uploading ? t("panel.uploading") : t("panel.openDoc") })
              ] }),
              doc !== null && mode === "single" && doc.kind === "pdf" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", { ref: canvasRef, style: { maxWidth: "100%", height: "auto" } }),
              doc !== null && mode === "single" && (doc.kind === "xlsx" || doc.kind === "csv") && table !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { alignSelf: "flex-start", width: "100%", maxWidth: 760, overflowX: "auto" }, children: table.columns.length > 0 || table.rows.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: 12, width: "100%" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: table.columns.map((cell, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: { ...cellStyle, background: "var(--dsw-alias-bg-hover, rgba(127,127,127,0.12))", fontWeight: 600 }, children: cell }, i)) }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: table.rows.map((row, ri) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: row.map((cell, ci) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: cellStyle, children: cell }, ci)) }, ri)) })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.7 }, children: t("panel.tableEmpty") }) }),
              doc !== null && mode === "single" && doc.kind !== "pdf" && doc.kind !== "xlsx" && doc.kind !== "csv" && pageText !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "pre",
                {
                  style: {
                    alignSelf: "flex-start",
                    width: "100%",
                    maxWidth: "46em",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                    fontSize: 15,
                    lineHeight: 1.75
                  },
                  children: pageText
                }
              ),
              doc !== null && mode === "single" && doc.kind !== "pdf" && doc.kind !== "xlsx" && doc.kind !== "csv" && pageText === null && !busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { alignSelf: "center", opacity: 0.7 }, children: t("panel.loading") })
            ]
          }
        ),
        doc !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderTop: "1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))", opacity: 0.75 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: footerText }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.6 }, children: mode === "scroll" ? t("panel.scrollMode") : t("panel.singleMode") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: syncState === "synced" ? "var(--dsw-alias-text-success, #2f9e44)" : "var(--dsw-alias-text-warning, #e8590c)" }, children: syncState === "synced" ? t("panel.synced") : t("panel.syncing") })
        ] }),
        error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "6px 12px", borderTop: "1px solid var(--dsw-alias-border-danger, rgba(230,73,73,0.4))", color: "var(--dsw-alias-text-danger, #e64949)", background: "var(--dsw-alias-bg-danger, rgba(230,73,73,0.08))", wordBreak: "break-all" }, children: error })
      ]
    }
  );
}
var iconButtonStyle = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 4,
  display: "inline-flex",
  alignItems: "center",
  color: "inherit",
  borderRadius: 4
};
var toolButtonStyle = {
  border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.4))",
  background: "transparent",
  cursor: "pointer",
  padding: "2px 8px",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
  lineHeight: 1.6
};
var cellStyle = {
  border: "1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.3))",
  padding: "4px 8px",
  textAlign: "left",
  verticalAlign: "top",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};
var cellStyleText = "border:1px solid rgba(127,127,127,0.3);padding:4px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word;";

// src/client/toggle.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function DocToggle(props) {
  const t = props.t ?? ((key) => key);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      title: t("toggle.title"),
      "aria-label": t("toggle.title"),
      onClick: () => props.openPanel?.(),
      style: {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 4,
        display: "inline-flex",
        alignItems: "center",
        color: "var(--dsw-alias-text-secondary, #6b7280)"
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 3.5C6.8 2.7 5.2 2.4 3.5 2.6c-.6.1-1 .5-1 1.1v8.2c0 .6.4 1 1 1.1 1.7.2 3.3-.1 4.5-.9 1.2.8 2.8 1.1 4.5.9.6-.1 1-.5 1-1.1V3.7c0-.6-.4-1-1-1.1-1.7-.2-3.3.1-4.5.9z" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 3.5v9" })
      ] })
    }
  );
}

// src/client.tsx
var inject = ["slots", "locale"];
function apply(ctx) {
  injectCss();
  ctx.effect(() => {
    const disposeZh = ctx.locale.register(NS, "zh", zh);
    const disposeEn = ctx.locale.register(NS, "en", en);
    return () => {
      disposeZh();
      disposeEn();
    };
  }, `${NS}: dictionaries`);
  const guarded = (label, register) => {
    try {
      return register();
    } catch (err) {
      console.warn(`[dsh-plugin-doc-companion] slot "${label}" registration failed; that UI seat stays absent:`, err);
      return () => {
      };
    }
  };
  const layout = () => ctx.get("layout");
  ctx.slots.inject("shell.overlay", () => guarded(
    "shell.overlay",
    () => ctx.slots.register({
      name: "shell.overlay",
      id: "doc-companion-panel",
      order: 50,
      locale: NS
    }, DocPanel)
  ));
  ctx.slots.inject("conversation.input.left", () => guarded(
    "conversation.input.left",
    () => ctx.slots.register({
      name: "conversation.input.left",
      id: "doc-companion-toggle",
      order: 100,
      locale: NS,
      // Session-scope inject: the framework passes the session id first, so
      // the open intent is recorded for THIS conversation only.
      inject: (sessionId) => ({ openPanel: () => {
        requestPanel(sessionId);
        layout()?.closeRightbar();
      } })
    }, DocToggle)
  ));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
