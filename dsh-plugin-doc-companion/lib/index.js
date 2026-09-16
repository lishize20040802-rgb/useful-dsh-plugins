// src/index.ts
import { createRequire as createRequire2 } from "node:module";
import { createReadStream, existsSync as existsSync2, statSync } from "node:fs";
import { dirname, extname as extname2, isAbsolute, resolve as resolve2 } from "node:path";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { expandHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";

// src/blocks.ts
import { extname, resolve, sep, win32 } from "node:path";
var TEXT_EXTS = /* @__PURE__ */ new Set([".txt", ".md", ".markdown", ".text"]);
function detectKind(fileName) {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".csv") return "csv";
  if (TEXT_EXTS.has(ext)) return "text";
  return null;
}
function sanitizeFileName(name2) {
  const base = win32.basename(name2).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[.\s]+$/g, "").trim();
  return base || "document";
}
function makeDocId() {
  return `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function clampIndex(n, total) {
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(total, 1));
}
function chunkText(text, blockChars) {
  const chars = Math.max(blockChars, 100);
  const out = [];
  for (let i = 0; i < text.length; i += chars) out.push(text.slice(i, i + chars));
  return out.length > 0 ? out : [""];
}
function chunkTotalChars(chunks, blockChars) {
  if (chunks.length === 0) return 0;
  return (chunks.length - 1) * Math.max(blockChars, 100) + chunks[chunks.length - 1].length;
}
function groupBy(items, perBlock) {
  const per = Math.max(perBlock, 1);
  const out = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out.length > 0 ? out : [[]];
}
function pageLocator(n) {
  return `\u7B2C ${n} \u9875`;
}
function textBlockLocator(index1, blockChars, totalChars) {
  const start = (index1 - 1) * Math.max(blockChars, 100) + 1;
  const end = Math.min(index1 * Math.max(blockChars, 100), Math.max(totalChars, 1));
  return `\u7B2C ${index1} \u5757\uFF08\u5B57\u7B26 ${start}\u2013${end}\uFF09`;
}
function paragraphBlockLocator(first, last) {
  return first === last ? `\u7B2C ${first} \u6BB5` : `\u7B2C ${first}\u2013${last} \u6BB5`;
}
function rowBlockLocator(sheet, first, last) {
  const base = first === last ? `\u7B2C ${first} \u884C` : `\u7B2C ${first}\u2013${last} \u884C`;
  return sheet ? `\u5DE5\u4F5C\u8868\u300C${sheet}\u300D${base}` : base;
}
function safeJoin(root, rel) {
  const clean = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const target = resolve(root, ...clean.split("/"));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}
function normalizeWhitespace(text) {
  return text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function detectBrokenTextLayer(blocks) {
  if (blocks.length > 0 && blocks.every((b) => b.text.trim().length === 0)) return true;
  const samples = blocks.filter((b) => b.text.length >= 20);
  if (samples.length < 5) return false;
  let cjk = 0;
  let noise = 0;
  let total = 0;
  for (const block of samples) {
    for (const ch of block.text) {
      const code = ch.codePointAt(0) ?? 0;
      total += 1;
      if (code >= 19968 && code <= 40959) cjk += 1;
      else if (code >= 128 && code <= 767 || code >= 7680 && code <= 7935) noise += 1;
    }
  }
  if (total === 0) return false;
  return cjk / total < 0.02 && noise / total > 0.05;
}

// src/store.ts
import { mkdir, readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// src/extract.ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
function isNodeBuffer(value) {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(value);
}
var pdfCache = /* @__PURE__ */ new Map();
var MAX_CACHED_PDFS = 3;
function openPdf(docId, data) {
  const cached = pdfCache.get(docId);
  if (cached !== void 0) return cached;
  const bytes = data instanceof Uint8Array && !isNodeBuffer(data) ? data : Uint8Array.from(data);
  const promise = (async () => {
    const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const handle = {
      numPages: doc.numPages,
      async pageText(page, signal) {
        const pdfPage = await doc.getPage(page);
        const content = await pdfPage.getTextContent({ disableNormalization: false });
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        return joinTextItems(content.items);
      },
      dispose() {
        void doc.destroy();
      }
    };
    return handle;
  })();
  pdfCache.set(docId, promise);
  promise.then((handle) => {
    if (pdfCache.size > MAX_CACHED_PDFS) {
      const oldest = pdfCache.keys().next().value;
      if (oldest !== void 0 && oldest !== docId) {
        pdfCache.delete(oldest);
        void pdfCache.get(oldest)?.then((h) => h.dispose()).catch(() => {
        });
      }
    }
  }).catch(() => {
  });
  return promise;
}
function joinTextItems(items) {
  let out = "";
  for (const raw of items) {
    const item = raw;
    if (typeof item.str !== "string") continue;
    out += item.str;
    out += item.hasEOL ? "\n" : " ";
  }
  return normalizeWhitespace(out);
}
async function extractDocxParagraphs(bytes) {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const paragraphs = result.value.split(/\n+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0);
  return paragraphs.length > 0 ? paragraphs : ["\uFF08\u6587\u6863\u6CA1\u6709\u53EF\u63D0\u53D6\u7684\u6587\u5B57\uFF09"];
}
async function extractXlsxSheets(bytes) {
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellDates: false });
  const out = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === void 0) continue;
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const rows = raw.map((row) => (Array.isArray(row) ? row : []).map(cellToString));
    out.push({ sheetName, rows });
  }
  return out;
}
function cellToString(cell) {
  if (cell === null || cell === void 0) return "";
  if (typeof cell === "number") return Object.is(cell, -0) ? "0" : String(cell);
  return String(cell);
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0));
}

// src/render.ts
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getDocument as getDocument2 } from "pdfjs-dist/legacy/build/pdf.mjs";
var requireFromPdfjs = createRequire(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
var canvasLibCache;
function canvasLib() {
  if (canvasLibCache !== void 0) return canvasLibCache;
  try {
    canvasLibCache = requireFromPdfjs("@napi-rs/canvas");
  } catch (error) {
    console.warn(
      "[dsh-plugin-doc-companion] cannot load @napi-rs/canvas:",
      error instanceof Error ? error.message : error
    );
    canvasLibCache = null;
  }
  return canvasLibCache;
}
function installCanvasGlobals(lib) {
  Object.defineProperty(globalThis, "Path2D", { value: lib.Path2D, configurable: true, writable: true });
  Object.defineProperty(globalThis, "DOMMatrix", { value: lib.DOMMatrix, configurable: true, writable: true });
}
var RENDER_SCALE = 2;
var MAX_CACHED_DOCS = 2;
var renderDocs = /* @__PURE__ */ new Map();
async function getRenderDoc(docId, data) {
  const cached = renderDocs.get(docId);
  if (cached !== void 0) return cached;
  const standardFontDataUrl = fileURLToPath(new URL("../../standard_fonts/", import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")));
  const promise = getDocument2({ data, useSystemFonts: false, standardFontDataUrl }).promise;
  renderDocs.set(docId, promise);
  promise.then((doc) => {
    if (renderDocs.size > MAX_CACHED_DOCS) {
      const oldest = renderDocs.keys().next().value;
      if (oldest !== void 0 && oldest !== docId) {
        const evicted = renderDocs.get(oldest);
        renderDocs.delete(oldest);
        void evicted?.then((d) => d.destroy()).catch(() => {
        });
      }
    }
  }).catch(() => {
  });
  return promise;
}
async function renderPdfPagePng(docId, data, pageNumber) {
  try {
    const lib = canvasLib();
    if (lib === null) return null;
    installCanvasGlobals(lib);
    const doc = await getRenderDoc(docId, data);
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = lib.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;
    return new Uint8Array(canvas.toBuffer("image/png"));
  } catch (error) {
    console.warn(
      `[dsh-plugin-doc-companion] page render failed (${docId} p${pageNumber}):`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// src/store.ts
var META_VERSION = 1;
var SAVE_DELAY_MS = 500;
var MAX_SESSION_STATES = 200;
var DocStoreError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "DocStoreError";
  }
};
var DocumentStore = class {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
  }
  docs = /* @__PURE__ */ new Map();
  /** Per-session reading positions (the panel follows the current session). */
  currentBySession = /* @__PURE__ */ new Map();
  /** Fallback position for session-less callers (tests, direct curl probes). */
  fallbackCurrent = { docId: null, block: 1 };
  blocksByDoc = /* @__PURE__ */ new Map();
  readySet = /* @__PURE__ */ new Set();
  /** docId → (block → extracted text) for PDF pages touched so far. */
  pageTextCache = /* @__PURE__ */ new Map();
  /** docId → (block → snapshot path) for scanned pages rendered by the panel. */
  images = /* @__PURE__ */ new Map();
  /** docId → last table block (xlsx/csv table rendering cache). */
  tableCache = /* @__PURE__ */ new Map();
  saveTimer = null;
  disposed = false;
  get docsDir() {
    return join(this.root, "docs");
  }
  get textDir() {
    return join(this.root, "text");
  }
  get imageDir() {
    return join(this.root, "images");
  }
  // ── lifecycle ────────────────────────────────────────────────────────────
  /** Ensure the storage layout exists and load the persisted registry. */
  async init() {
    await mkdir(this.docsDir, { recursive: true });
    await mkdir(this.textDir, { recursive: true });
    await mkdir(this.imageDir, { recursive: true });
    await this.loadMeta();
    for (const doc of this.docs.values()) this.kickIndex(doc.id);
  }
  async loadMeta() {
    const path = join(this.root, "meta.json");
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      for (const doc of raw.docs ?? []) {
        if (doc && typeof doc.id === "string") this.docs.set(doc.id, doc);
      }
      const cur = raw.current;
      if (cur && typeof cur === "object") {
        const restore = (state) => {
          if (state && typeof state.docId === "string" && this.docs.has(state.docId)) {
            return { docId: state.docId, block: typeof state.block === "number" ? state.block : 1 };
          }
          return null;
        };
        const fallback = restore(cur.fallback);
        if (fallback !== null) this.fallbackCurrent = fallback;
        for (const [sessionId, state] of Object.entries(cur.sessions ?? {})) {
          const restored = restore(state);
          if (restored !== null) this.currentBySession.set(sessionId, restored);
        }
        if ("docId" in cur && !("fallback" in cur)) {
          const legacy = restore(cur);
          if (legacy !== null) this.fallbackCurrent = legacy;
        }
      }
    } catch {
    }
  }
  scheduleSave() {
    if (this.disposed) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveMeta().catch(() => {
      });
    }, SAVE_DELAY_MS);
  }
  async saveMeta() {
    const meta = {
      version: META_VERSION,
      docs: [...this.docs.values()],
      current: {
        fallback: this.fallbackCurrent,
        sessions: Object.fromEntries(this.currentBySession)
      }
    };
    await writeFile(join(this.root, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }
  /** Dispose timers (used by tests). */
  dispose() {
    this.disposed = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
  /** Flush pending metadata to disk immediately (used by tests). */
  async flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveMeta();
  }
  // ── registry ─────────────────────────────────────────────────────────────
  /** All registered documents, oldest first. */
  list() {
    return [...this.docs.values()].sort((a, b) => a.addedAt - b.addedAt);
  }
  get(docId) {
    return this.docs.get(docId);
  }
  /** Absolute path of the stored file for one document. */
  filePath(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    return join(this.docsDir, meta.fileName);
  }
  /** Absolute path of the page snapshot for one block, if any. */
  imagePath(docId, block) {
    return this.images.get(docId)?.get(block);
  }
  /**
   * Register an uploaded file: persist the bytes and make it the current
   * document of the given session (or the fallback position) at block 1.
   * The index build starts in the background.
   */
  async registerBytes(fileName, kind, bytes, sessionId) {
    const meta = this.createMeta(fileName, kind);
    await writeFile(join(this.docsDir, meta.fileName), bytes);
    this.docs.set(meta.id, meta);
    this.scheduleSave();
    this.setCurrent(meta.id, 1, sessionId);
    this.kickIndex(meta.id);
    return meta;
  }
  /**
   * Register an existing file by path (doc_open): copy it into the store so
   * the reader and the tools serve one canonical location.
   */
  async registerFile(fileName, kind, sourcePath, sessionId) {
    const meta = this.createMeta(fileName, kind);
    await copyFile(sourcePath, join(this.docsDir, meta.fileName));
    this.docs.set(meta.id, meta);
    this.scheduleSave();
    this.setCurrent(meta.id, 1, sessionId);
    this.kickIndex(meta.id);
    return meta;
  }
  createMeta(fileName, kind) {
    const id = `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ext = fileName.slice(fileName.lastIndexOf("."));
    return {
      id,
      name: fileName,
      kind,
      fileName: `${id}${ext}`,
      totalBlocks: null,
      addedAt: Date.now()
    };
  }
  /** Forget a document entirely (file, index, snapshots). */
  async remove(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) return;
    this.docs.delete(docId);
    for (const [sessionId, state] of this.currentBySession) {
      if (state.docId === docId) this.currentBySession.delete(sessionId);
    }
    if (this.fallbackCurrent.docId === docId) this.fallbackCurrent = { docId: null, block: 1 };
    this.blocksByDoc.delete(docId);
    this.readySet.delete(docId);
    this.pageTextCache.delete(docId);
    this.images.delete(docId);
    this.tableCache.delete(docId);
    this.scheduleSave();
    await Promise.all([
      unlink(join(this.docsDir, meta.fileName)).catch(() => {
      }),
      unlink(join(this.textDir, `${docId}.json`)).catch(() => {
      })
    ]);
  }
  // ── current position ──────────────────────────────────────────────────────
  /**
   * Set the current reading position for one session (block clamped into
   * range). Session-less callers (tests, direct probes) use the fallback
   * position instead.
   */
  setCurrent(docId, block, sessionId) {
    if (!this.docs.has(docId)) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const total = this.docs.get(docId).totalBlocks ?? block;
    const next = { docId, block: clampIndex(block, total) };
    if (sessionId !== void 0 && sessionId !== "") {
      this.currentBySession.set(sessionId, next);
      if (this.currentBySession.size > MAX_SESSION_STATES) {
        const oldest = this.currentBySession.keys().next().value;
        if (oldest !== void 0) this.currentBySession.delete(oldest);
      }
    } else {
      this.fallbackCurrent = next;
    }
    this.scheduleSave();
  }
  /** The reading position of one session (null state when unset). */
  currentState(sessionId) {
    if (sessionId !== void 0 && sessionId !== "") {
      return this.currentBySession.get(sessionId) ?? { docId: null, block: 1 };
    }
    return this.fallbackCurrent;
  }
  /** Clear the reading position of one session (docs stay in the library). */
  close(sessionId) {
    if (sessionId !== void 0 && sessionId !== "") {
      this.currentBySession.delete(sessionId);
    } else {
      this.fallbackCurrent = { docId: null, block: 1 };
    }
    this.scheduleSave();
  }
  // ── block access ─────────────────────────────────────────────────────────
  /** Whether the full index (all block texts) is ready for one document. */
  isReady(docId) {
    return this.readySet.has(docId);
  }
  /**
   * Fast path: the text and locator of one block. For PDFs a single page is
   * extracted on demand (the full index keeps building in the background);
   * other kinds fall back to the (fast) full build.
   */
  async blockText(docId, block, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    if (meta.kind === "pdf") {
      this.kickIndex(docId);
      const cache = this.pageTextFor(docId);
      let text = cache.get(block);
      if (text === void 0) {
        const handle = await openPdf(docId, await readFile(this.filePath(docId)));
        const total = handle.numPages;
        if (meta.totalBlocks !== total) {
          meta.totalBlocks = total;
          this.scheduleSave();
        }
        if (block < 1 || block > total) {
          throw new DocStoreError(`doc_companion: block ${block} out of range (1..${total})`, "BLOCK_OUT_OF_RANGE");
        }
        text = await handle.pageText(block, signal);
        cache.set(block, text);
      }
      return { index: block, locator: pageLocator(block), text };
    }
    const blocks = await this.blocksFor(docId, signal);
    const found = blocks[block - 1];
    if (found === void 0) {
      throw new DocStoreError(`doc_companion: block ${block} out of range (1..${blocks.length})`, "BLOCK_OUT_OF_RANGE");
    }
    return found;
  }
  /**
   * Full index: every block text of the document, in block order. Non-PDF
   * kinds build synchronously (fast); PDFs extract page by page and the
   * result is cached on disk. Callers should pass the exec signal so a
   * long PDF build can be aborted.
   */
  async blocksFor(docId, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    let promise = this.blocksByDoc.get(docId);
    if (promise === void 0) promise = this.buildBlocks(docId);
    const blocks = await promise;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return blocks;
  }
  /** Start the full index build without awaiting it (PDF fast-path helper). */
  kickIndex(docId) {
    if (this.disposed) return;
    const meta = this.docs.get(docId);
    if (meta === void 0 || this.blocksByDoc.has(docId) || this.readySet.has(docId)) return;
    const promise = this.buildBlocks(docId);
    this.blocksByDoc.set(docId, promise);
    promise.then(() => {
      if (!this.disposed) this.readySet.add(docId);
    }).catch((error) => {
      this.blocksByDoc.delete(docId);
      if (!this.disposed) console.warn(`[dsh-plugin-doc-companion] index build failed for ${docId}:`, error);
    });
  }
  async buildBlocks(docId) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const sidecar = await this.tryReadSidecar(docId);
    if (sidecar !== null) {
      meta.totalBlocks = sidecar.length;
      if (meta.kind === "pdf") this.checkTextLayerHealth(meta, sidecar);
      this.scheduleSave();
      return sidecar;
    }
    const filePath = this.filePath(docId);
    let blocks;
    switch (meta.kind) {
      case "pdf": {
        const handle = await openPdf(docId, await readFile(filePath));
        meta.totalBlocks = handle.numPages;
        this.scheduleSave();
        const cache = this.pageTextFor(docId);
        blocks = [];
        for (let page = 1; page <= handle.numPages; page += 1) {
          let text = cache.get(page);
          if (text === void 0) {
            text = await handle.pageText(page);
            cache.set(page, text);
          }
          blocks.push({ index: page, locator: pageLocator(page), text });
        }
        break;
      }
      case "text": {
        const text = await readFile(filePath, "utf8");
        const chunks = chunkText(text, this.opts.textBlockChars);
        const totalChars = chunkTotalChars(chunks, this.opts.textBlockChars);
        blocks = chunks.map((chunk, i) => ({
          index: i + 1,
          locator: textBlockLocator(i + 1, this.opts.textBlockChars, totalChars),
          text: chunk
        }));
        break;
      }
      case "docx": {
        const paragraphs = await extractDocxParagraphs(await readFile(filePath));
        const groups = groupBy(paragraphs, this.opts.maxParagraphsPerBlock);
        blocks = groups.map((group, i) => {
          const first = i * this.opts.maxParagraphsPerBlock + 1;
          const last = first + group.length - 1;
          return { index: i + 1, locator: paragraphBlockLocator(first, last), text: group.join("\n") };
        });
        break;
      }
      case "xlsx": {
        const sheets = await extractXlsxSheets(await readFile(filePath));
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last));
        break;
      }
      case "csv": {
        const rows = parseCsv(await readFile(filePath, "utf8"));
        const sheets = [{ sheetName: "", rows }];
        blocks = this.sheetBlocks(sheets, (sheetName, first, last) => rowBlockLocator(sheetName, first, last));
        break;
      }
    }
    if (this.disposed) return blocks;
    meta.totalBlocks = blocks.length;
    if (meta.kind === "pdf") this.checkTextLayerHealth(meta, blocks);
    this.scheduleSave();
    await this.writeSidecar(docId, blocks);
    return blocks;
  }
  /**
   * Whole-document glyph-mapping health check for PDFs: when the text layer
   * is broken (see detectBrokenTextLayer), the flag is persisted on the meta
   * so every page is served through the vision transcription path and search
   * is reported as unavailable instead of returning garbage hits.
   */
  checkTextLayerHealth(meta, blocks) {
    const broken = detectBrokenTextLayer(blocks);
    if (broken !== meta.textLayerBroken) {
      meta.textLayerBroken = broken;
      this.scheduleSave();
    }
  }
  sheetBlocks(sheets, locator) {
    const blocks = [];
    let index = 1;
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock);
      for (const group of groups) {
        const first = this.rowOffsetOf(sheet.rows, group);
        const last = first + group.length - 1;
        blocks.push({
          index,
          locator: locator(sheet.sheetName, first, last),
          text: group.map((row) => row.join("	")).join("\n")
        });
        index += 1;
      }
    }
    return blocks;
  }
  rowOffsetOf(rows, group) {
    const idx = rows.indexOf(group[0]);
    return idx < 0 ? 1 : idx + 1;
  }
  /**
   * The table-shaped view of one block (xlsx/csv rendering). Returns the
   * header cells plus the data rows of the requested block.
   */
  async tableBlock(docId, block, signal) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    if (meta.kind !== "xlsx" && meta.kind !== "csv") {
      throw new DocStoreError(`doc_companion: "${meta.name}" has no table view`, "NOT_A_TABLE");
    }
    const cached = this.tableCache.get(docId);
    if (cached !== void 0 && cached.index === block) return cached;
    const filePath = this.filePath(docId);
    const sheets = meta.kind === "xlsx" ? await extractXlsxSheets(await readFile(filePath)) : [{ sheetName: "", rows: parseCsv(await readFile(filePath, "utf8")) }];
    let index = 1;
    for (const sheet of sheets) {
      const groups = groupBy(sheet.rows, this.opts.maxRowsPerBlock);
      for (const group of groups) {
        if (index === block) {
          const firstRow = this.rowOffsetOf(sheet.rows, group);
          const columns = group[0] ?? [];
          const rows = group.slice(1);
          const table = { index, sheet: sheet.sheetName, firstRow, columns, rows };
          this.tableCache.set(docId, table);
          if (signal?.aborted) throw new DOMException("aborted", "AbortError");
          return table;
        }
        index += 1;
      }
    }
    throw new DocStoreError(`doc_companion: block ${block} out of range`, "BLOCK_OUT_OF_RANGE");
  }
  // ── scanned-page snapshots ───────────────────────────────────────────────
  /** Record a page snapshot saved by the reader panel. */
  setBlockImage(docId, block, path) {
    let map = this.images.get(docId);
    if (map === void 0) {
      map = /* @__PURE__ */ new Map();
      this.images.set(docId, map);
    }
    map.set(block, path);
  }
  /** Persist a page snapshot (PNG bytes) and register it for one block. */
  async saveBlockImage(docId, block, bytes) {
    const meta = this.docs.get(docId);
    if (meta === void 0) throw new DocStoreError(`doc_companion: unknown document "${docId}"`, "DOC_NOT_FOUND");
    const path = join(this.imageDir, `${docId}-b${block}.png`);
    await writeFile(path, bytes);
    this.setBlockImage(docId, block, path);
    return path;
  }
  /** Cache an extracted/transcribed block text (scanned-page results). */
  cacheBlockText(docId, block, text) {
    this.pageTextFor(docId).set(block, text);
  }
  /**
   * Transcription cache for PDF pages (vision-first reading): maps
   * `docId:block` to the vision-transcribed text. In-memory only — a restart
   * re-transcribes on first access, exactly like the page-text cache.
   */
  transcribedPages = /* @__PURE__ */ new Map();
  /** The vision-transcribed text of a PDF page, or undefined when not yet done. */
  transcribedText(docId, block) {
    return this.transcribedPages.get(`${docId}:${block}`);
  }
  /** Record a successful vision transcription (also feeds the page-text cache). */
  markTranscribed(docId, block, text) {
    this.transcribedPages.set(`${docId}:${block}`, text);
    this.pageTextFor(docId).set(block, text);
  }
  /**
   * Ensure a page snapshot exists for one block, rendering it HOST-SIDE when
   * the reader panel never showed the page (pdf.js + @napi-rs/canvas). This
   * is the background path: the agent can read any page through the vision
   * model without the user navigating there.
   * @returns the snapshot path, or undefined when unavailable/failed.
   */
  async ensurePageImage(docId, block) {
    const existing = this.imagePath(docId, block);
    if (existing !== void 0) return existing;
    const meta = this.docs.get(docId);
    if (meta === void 0 || meta.kind !== "pdf") return void 0;
    const filePath = this.filePath(docId);
    try {
      const bytes = await readFile(filePath);
      const png = await renderPdfPagePng(docId, new Uint8Array(bytes), block);
      if (png === null) return void 0;
      return await this.saveBlockImage(docId, block, png);
    } catch (error) {
      console.warn(
        `[dsh-plugin-doc-companion] ensurePageImage failed (${docId} p${block}):`,
        error instanceof Error ? error.message : error
      );
      return void 0;
    }
  }
  // ── caches & sidecars ────────────────────────────────────────────────────
  pageTextFor(docId) {
    let map = this.pageTextCache.get(docId);
    if (map === void 0) {
      map = /* @__PURE__ */ new Map();
      this.pageTextCache.set(docId, map);
    }
    return map;
  }
  async tryReadSidecar(docId) {
    const path = join(this.textDir, `${docId}.json`);
    if (!existsSync(path)) return null;
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      if (!Array.isArray(raw)) return null;
      const blocks = raw.filter((b) => typeof b === "object" && b !== null && typeof b.index === "number" && typeof b.locator === "string" && typeof b.text === "string");
      return blocks.length > 0 ? blocks : null;
    } catch {
      return null;
    }
  }
  async writeSidecar(docId, blocks) {
    if (this.disposed) return;
    const path = join(this.textDir, `${docId}.json`);
    await writeFile(path, JSON.stringify(blocks), "utf8");
  }
};

// src/search.ts
function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}
function queryTerms(query) {
  return query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}
function searchBlocks(blocks, query, maxHits = 5, window = 140) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (const block of blocks) {
    const lower = block.text.toLowerCase();
    const present = terms.filter((term) => lower.includes(term));
    if (present.length < terms.length) continue;
    const matches = present.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
    const firstTerm = present[0];
    const at = lower.indexOf(firstTerm);
    hits.push({
      block: block.index,
      locator: block.locator,
      snippet: makeSnippet(block.text, at, firstTerm.length, window),
      matches
    });
  }
  hits.sort((a, b) => b.matches - a.matches || a.block - b.block);
  return hits.slice(0, maxHits);
}
function countMatches(blockText, query) {
  const terms = queryTerms(query);
  if (terms.length === 0) return 0;
  const lower = blockText.toLowerCase();
  return terms.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
}
function makeSnippet(text, at, termLen, window) {
  const start = Math.max(0, at - window);
  const end = Math.min(text.length, at + termLen + window);
  const lead = start > 0 ? "\u2026" : "";
  const tail = end < text.length ? "\u2026" : "";
  return `${lead}${text.slice(start, end).replace(/\s+/g, " ").trim()}${tail}`;
}

// src/vision.ts
import { readFile as readFile2 } from "node:fs/promises";
import { basename } from "node:path";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
var VISION_SYSTEM = "\u4F60\u662F\u4E00\u4E2A\u591A\u6A21\u6001\u89C6\u89C9\u8BC6\u522B\u4EE3\u7406\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u5F20\u4E66\u672C/\u8BD5\u5377\u9875\u9762\u7684\u622A\u56FE\uFF0C\u4F60\u9700\u8981\u539F\u6837\u63D0\u53D6\u8FD9\u4E00\u9875\u7684\u5168\u90E8\u6587\u5B57\u5185\u5BB9\uFF0C\u5305\u62EC\u6B63\u6587\u3001\u516C\u5F0F\u3001\u8868\u683C\u91CC\u7684\u6587\u5B57\u3002\u4FDD\u6301\u539F\u6709\u5206\u6BB5\u548C\u7F16\u53F7\uFF0C\u53EA\u8F93\u51FA\u63D0\u53D6\u7684\u6587\u5B57\uFF0C\u4E0D\u8981\u89E3\u91CA\u3001\u4E0D\u8981\u603B\u7ED3\u3001\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u8BF4\u660E\u3002";
async function transcribeImage(llm, attachments, cfg, imagePath, instruction, signal) {
  try {
    const data = await readFile2(imagePath);
    const ref = await attachments.saveImage({ data, mediaType: "image/png", name: basename(imagePath) });
    const content = [
      { type: "text", text: instruction },
      { type: "image", attachment: ref }
    ];
    const parts = [];
    for await (const chunk of llm.stream({
      provider: cfg.provider,
      model: cfg.model,
      system: VISION_SYSTEM,
      messages: [createUserMessage({ content, source: { kind: "user" } })],
      signal
    })) {
      if (chunk.type === "text-delta") parts.push(chunk.text);
    }
    const text = parts.join("").trim();
    if (!text) return { ok: false, error: "vision model returned empty content" };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
var TRANSCRIBE_INSTRUCTION = "\u8BF7\u628A\u8FD9\u4E00\u9875\u7684\u5168\u90E8\u6587\u5B57\u5185\u5BB9\u539F\u6837\u63D0\u53D6\u51FA\u6765\uFF0C\u5305\u62EC\u6B63\u6587\u3001\u516C\u5F0F\u3001\u8868\u683C\u4E2D\u7684\u6587\u5B57\uFF0C\u4FDD\u6301\u5206\u6BB5\u4E0E\u7F16\u53F7\u3002";

// src/index.ts
var name = "doc-companion";
var inject = ["tools", "systemPrompt", "webServer"];
var Config = Schema.object({
  storageDir: Schema.string().default(""),
  maxBytes: Schema.natural().default(256 * 1024 * 1024),
  maxImageBytes: Schema.natural().default(20 * 1024 * 1024),
  textBlockChars: Schema.natural().default(2600),
  maxParagraphsPerBlock: Schema.natural().default(40),
  maxRowsPerBlock: Schema.natural().default(50),
  autoTranscribeScanned: Schema.boolean().default(true),
  visionProvider: Schema.string().default("deepseek-official"),
  visionModel: Schema.string().default("deepseek-v4-flash-vision-exp"),
  searchMaxHits: Schema.natural().default(5)
});
function normalizeConfig(raw) {
  const config = raw ?? {};
  return {
    storageDir: typeof config.storageDir === "string" ? config.storageDir.trim() : "",
    maxBytes: typeof config.maxBytes === "number" && config.maxBytes > 0 ? config.maxBytes : 256 * 1024 * 1024,
    maxImageBytes: typeof config.maxImageBytes === "number" && config.maxImageBytes > 0 ? config.maxImageBytes : 20 * 1024 * 1024,
    textBlockChars: typeof config.textBlockChars === "number" && config.textBlockChars > 0 ? config.textBlockChars : 2600,
    maxParagraphsPerBlock: typeof config.maxParagraphsPerBlock === "number" && config.maxParagraphsPerBlock > 0 ? config.maxParagraphsPerBlock : 40,
    maxRowsPerBlock: typeof config.maxRowsPerBlock === "number" && config.maxRowsPerBlock > 0 ? config.maxRowsPerBlock : 50,
    autoTranscribeScanned: config.autoTranscribeScanned !== false,
    visionProvider: typeof config.visionProvider === "string" && config.visionProvider.trim() ? config.visionProvider.trim() : "deepseek-official",
    visionModel: typeof config.visionModel === "string" && config.visionModel.trim() ? config.visionModel.trim() : "deepseek-v4-flash-vision-exp",
    searchMaxHits: typeof config.searchMaxHits === "number" && config.searchMaxHits > 0 ? config.searchMaxHits : 5
  };
}
function isTrustedRequest(req) {
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
async function readBody(req, cap) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk;
    total += buf.length;
    if (total > cap) throw new HttpError(413, "body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
function sendFile(res, path, mime) {
  const size = statSync(path).size;
  res.writeHead(200, {
    "content-type": mime,
    "content-length": size,
    "cache-control": "public, max-age=3600"
  });
  createReadStream(path).pipe(res);
}
var MIME_BY_EXT = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};
function mimeOf(path) {
  return MIME_BY_EXT[extname2(path).toLowerCase()] ?? "application/octet-stream";
}
var requireFromPlugin = createRequire2(import.meta.url);
var pdfjsRootCache = null;
function pdfjsRoot() {
  if (pdfjsRootCache === null) {
    pdfjsRootCache = dirname(requireFromPlugin.resolve("pdfjs-dist/package.json"));
  }
  return pdfjsRootCache;
}
function docInfoValue(meta) {
  return {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    ...meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {},
    ...meta.textLayerBroken === true ? { text_layer_broken: true } : {}
  };
}
var BLOCK_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    doc: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        kind: { type: "string", required: true },
        total_blocks: { type: "integer" },
        text_layer_broken: { type: "boolean" }
      }
    },
    block: { type: "integer" },
    locator: { type: "string" },
    text: { type: "string" },
    image_path: { type: "string" },
    scanned: { type: "boolean" },
    note: { type: "string" }
  }
};
async function resolveBlock(store, cfg, llm, attachments, docId, block, signal) {
  const meta = store.get(docId);
  const isPdf = meta.kind === "pdf";
  const transcribed = store.transcribedText(docId, block);
  const found = await store.blockText(docId, block, signal);
  let text = transcribed ?? found.text;
  let visionRead = transcribed !== void 0;
  let note;
  if (isPdf && cfg.autoTranscribeScanned && transcribed === void 0) {
    let snapshot2 = store.imagePath(docId, block);
    if (snapshot2 === void 0) snapshot2 = await store.ensurePageImage(docId, block);
    const llmFace = llm?.();
    const attachmentFace = attachments?.();
    if (snapshot2 !== void 0 && llmFace !== void 0 && attachmentFace !== void 0) {
      const result = await transcribeImage(
        llmFace,
        attachmentFace,
        { provider: cfg.visionProvider, model: cfg.visionModel },
        snapshot2,
        TRANSCRIBE_INSTRUCTION,
        signal
      );
      if (result.ok) {
        text = result.text;
        store.markTranscribed(docId, block, text);
        visionRead = true;
      } else if (text.trim().length > 0 && meta.textLayerBroken !== true) {
        note = `\u89C6\u89C9\u8F6C\u5199\u5931\u8D25\uFF08${result.error}\uFF09\uFF0C\u4EE5\u4E0B\u4E3A\u8BE5\u9875\u6587\u5B57\u5C42\u7684\u63D0\u53D6\u6587\u672C\u3002`;
      } else {
        note = `\u89C6\u89C9\u8F6C\u5199\u5931\u8D25\uFF1A${result.error}\u3002\u53EF\u8BA9\u7528\u6237\u628A\u9875\u9762\u622A\u56FE\u53D1\u7ED9\u4F60\uFF0C\u6216\u7528 vision \u5DE5\u5177\u8BFB\u53D6 image_path\u3002`;
      }
    } else if (snapshot2 === void 0) {
      note = "\u5F53\u524D\u9875\u65E0\u6CD5\u751F\u6210\u9875\u9762\u5FEB\u7167\uFF0C\u4EE5\u4E0B\u4E3A\u6587\u5B57\u5C42\u63D0\u53D6\uFF08\u82E5\u4E71\u7801\u8BF7\u544A\u77E5\u6211\u622A\u56FE\uFF09\u3002";
    }
  }
  const snapshot = store.imagePath(docId, block);
  return {
    ok: true,
    doc: docInfoValue(meta),
    block,
    locator: found.locator,
    text,
    ...snapshot !== void 0 ? { image_path: snapshot } : {},
    ...visionRead ? { scanned: true } : {},
    ...note !== void 0 ? { note } : {}
  };
}
function resolveStorageDir(value = "") {
  return resolve2(resolveDshHome(), expandHomePath(value.trim() || "ebooks"));
}
function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  const storageDir = resolveStorageDir(cfg.storageDir);
  const store = new DocumentStore(storageDir, {
    textBlockChars: cfg.textBlockChars,
    maxParagraphsPerBlock: cfg.maxParagraphsPerBlock,
    maxRowsPerBlock: cfg.maxRowsPerBlock
  });
  let active = true;
  ctx.effect(() => () => {
    active = false;
    store.dispose();
  }, "doc-companion: document store");
  const llm = () => ctx.get("llm");
  const attachments = () => ctx.get("attachments");
  const registerTool = (tool) => {
    ctx.effect(() => ctx.tools.register(tool), `doc-companion: ${tool.name}`);
  };
  void store.init().then(() => {
    if (!active) return;
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/api/doc",
      handler: apiHandler
    }), "doc-companion: /api/doc");
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/doc-static",
      handler: staticHandler
    }), "doc-companion: /doc-static");
    registerTool(docCurrentTool(store, cfg, llm, attachments));
    registerTool(docPageTool(store, cfg, llm, attachments));
    registerTool(docGotoTool(store));
    registerTool(docSearchTool(store, cfg));
    registerTool(docOpenTool(store, cfg));
    registerTool(docCloseTool(store));
    registerTool(docListTool(store));
  }).catch((error) => {
    console.error("[dsh-plugin-doc-companion] store init failed; doc tools are disabled:", error);
  });
  ctx.systemPrompt.section({
    name: "tool:doc-companion",
    order: 97,
    text: "\u672C\u4F1A\u8BDD\u7531 dsh-plugin-doc-companion \u63D0\u4F9B\u300C\u6587\u6863\u4F34\u8BFB\u300D\u80FD\u529B\u3002\u7528\u6237\u5728\u53F3\u4FA7\u9605\u8BFB\u9762\u677F\u4E2D\u6253\u5F00\u6587\u6863\uFF08PDF / Word / Excel / CSV / TXT / MD\uFF09\u5E76\u7FFB\u9875\u65F6\uFF0C\u5F53\u524D\u5757\uFF08\u9875/\u5757\u53F7\uFF09\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1A\u9700\u8981\u77E5\u9053\u7528\u6237\u5F53\u524D\u770B\u5230\u54EA\u4E00\u9875\u53CA\u5185\u5BB9 \u2192 doc_current\uFF1B\u7528\u6237\u95EE\u300C\u7B2C N \u9875/\u5757\u300D\u6216\u8981\u8BFB\u7279\u5B9A\u4F4D\u7F6E \u2192 doc_page({block})\uFF1B\u7528\u6237\u8BF4\u300C\u7FFB\u5230/\u8DF3\u5230\u7B2C N \u9875\u300D\u2192 doc_goto({block})\uFF08\u9605\u8BFB\u9762\u677F\u540C\u6B65\u8DF3\u8F6C\uFF09\uFF1B\u7528\u6237\u7ED9\u51FA\u6587\u4EF6\u8DEF\u5F84\u60F3\u6253\u5F00 \u2192 doc_open({path})\uFF1B\u6587\u6863\u5217\u8868 \u2192 doc_list\uFF1B\u5173\u95ED \u2192 doc_close\u3002\n\u9605\u8BFB\u65B9\u5F0F\uFF1APDF \u4E00\u5F8B\u91C7\u7528\u300C\u89C6\u89C9\u4F18\u5148\u300D\u2014\u2014doc_current / doc_page \u8FD4\u56DE\u7684 PDF \u9875\u6587\u5B57\u7531\u9875\u9762\u622A\u56FE\u7ECF\u89C6\u89C9\u6A21\u578B\u8F6C\u5199\uFF08\u65E0\u9700\u7528\u6237\u7FFB\u9875\uFF0Chost \u81EA\u52A8\u6E32\u67D3\u4EFB\u610F\u9875\uFF09\uFF0C\u56E0\u6B64\u54EA\u6015\u6587\u672C\u5C42\u635F\u574F\u4E5F\u80FD\u8BFB\u5230\u51C6\u786E\u7684\u516C\u5F0F\u4E0E\u6392\u7248\uFF1B\u8FD4\u56DE\u91CC scanned=true \u8868\u793A\u8BE5\u9875\u4E3A\u89C6\u89C9\u8F6C\u5199\u7ED3\u679C\uFF0Cimage_path \u662F\u9875\u9762\u5FEB\u7167\u3002\u9700\u8981\u5B9A\u4F4D\u5185\u5BB9\u65F6\u7528 doc_search({query}) \u505A\u6587\u5B57\u68C0\u7D22\uFF08\u5FEB\uFF09\uFF0C\u547D\u4E2D\u540E\u7528 doc_page \u89C6\u89C9\u9605\u8BFB\u8BE5\u9875\u3002Word/Excel/CSV/TXT \u65E0\u9875\u9762\u6982\u5FF5\uFF0C\u76F4\u63A5\u4F7F\u7528\u5176\u63D0\u53D6\u6587\u672C\u3002\n\u5F15\u7528\u4E0E\u4F5C\u7B54\u89C4\u8303\uFF1A\n1. \u5F15\u7528\u6587\u6863\u5185\u5BB9\u65F6\u5FC5\u987B\u8D34\u51FA\u539F\u6587\u7247\u6BB5\u5E76\u6CE8\u660E\u4F4D\u7F6E\uFF08\u5982\u300C\u7B2C 12 \u9875\u300D\u300C\u5DE5\u4F5C\u8868\u300C\u771F\u9898\u300D\u7B2C 10\u201329 \u884C\u300D\u300C\u7B2C 45\u201360 \u6BB5\u300D\uFF09\uFF0C\u5148\u539F\u6587\u540E\u89E3\u91CA\uFF1B\n2. \u7528\u6237\u505A\u7EC3\u4E60\u4F1A\u5148\u8BF4\u51FA\u81EA\u5DF1\u7684\u505A\u6CD5/\u7B54\u6848\uFF1A\u5148\u660E\u786E\u5224\u65AD\u5BF9\u9519\u5E76\u6307\u51FA\u5BF9\u5728\u54EA\u3001\u9519\u5728\u54EA\uFF0C\u518D\u7ED9\u51FA\u6B63\u786E\u7B54\u6848\u4E0E\u5B8C\u6574\u6B65\u9AA4\uFF0C\u7136\u540E\u7ED9\u51FA\u9488\u5BF9\u6027\u4FEE\u6539\u610F\u89C1\uFF0C\u5C3D\u91CF\u8054\u7CFB\u539F\u6587\u77E5\u8BC6\u70B9\u89E3\u91CA\u539F\u7406\uFF1B\n3. \u68C0\u7D22\u65E0\u7ED3\u679C\u6216\u6587\u6863\u6587\u672C\u5C42\u635F\u574F\u5BFC\u81F4\u68C0\u7D22\u4E0D\u53EF\u7528\u65F6\u5982\u5B9E\u8BF4\u660E\uFF0C\u4E0D\u8981\u7F16\u9020\u539F\u6587\u3002"
  });
  async function apiHandler(req, res) {
    try {
      if (!isTrustedRequest(req)) {
        sendText(res, 403, "forbidden");
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "POST" && parts[2] === "upload") {
        await handleUpload(req, res, cfg, store);
        return;
      }
      if (req.method === "GET" && parts[2] === "list") {
        sendJson(res, 200, {
          docs: store.list().map((meta) => ({ id: meta.id, name: meta.name, kind: meta.kind, total_blocks: meta.totalBlocks, added_at: meta.addedAt }))
        });
        return;
      }
      if (req.method === "GET" && parts[2] === "state") {
        const sessionId = url.searchParams.get("session") ?? void 0;
        const current = store.currentState(sessionId);
        const meta = current.docId !== null ? store.get(current.docId) : void 0;
        sendJson(res, 200, {
          doc: meta !== void 0 ? { ...docInfoValue(meta), ready: store.isReady(meta.id) } : null,
          block: current.docId !== null ? current.block : null
        });
        return;
      }
      if (parts[2] === "docs" && typeof parts[3] === "string") {
        await handleDocs(req, res, store, cfg, parts, url);
        return;
      }
      sendJson(res, 404, { error: "no such route" });
    } catch (error) {
      if (error instanceof HttpError) {
        sendText(res, error.status, error.message);
        return;
      }
      console.error("[dsh-plugin-doc-companion] /api/doc handler error:", error);
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  async function handleDocs(req, res, store2, cfg2, parts, url) {
    const docId = parts[3];
    const meta = store2.get(docId);
    if (meta === void 0) {
      sendJson(res, 404, { error: "unknown document" });
      return;
    }
    if (req.method === "GET" && parts.length === 4) {
      const filePath = store2.filePath(docId);
      if (!existsSync2(filePath)) {
        sendJson(res, 404, { error: "file missing" });
        return;
      }
      sendFile(res, filePath, mimeOf(meta.fileName));
      return;
    }
    if (req.method === "GET" && parts[4] === "blocks" && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? "", 10);
      try {
        const found = await store2.blockText(docId, block);
        sendJson(res, 200, { block: found.index, locator: found.locator, text: found.text });
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message });
        else throw error;
      }
      return;
    }
    if (req.method === "GET" && parts[4] === "block-table" && parts.length === 6) {
      const block = Number.parseInt(parts[5] ?? "", 10);
      try {
        const table = await store2.tableBlock(docId, block);
        sendJson(res, 200, { sheet: table.sheet, first_row: table.firstRow, columns: table.columns, rows: table.rows });
      } catch (error) {
        if (error instanceof DocStoreError) sendJson(res, 404, { error: error.message });
        else throw error;
      }
      return;
    }
    if (req.method === "POST" && parts[4] === "position") {
      const body = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8"));
      if (typeof body.block !== "number" || !Number.isInteger(body.block)) {
        sendJson(res, 400, { error: "block must be an integer" });
        return;
      }
      store2.setCurrent(docId, body.block, typeof body.session === "string" ? body.session : void 0);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && parts[4] === "block-image") {
      const block = Number.parseInt(url.searchParams.get("block") ?? "", 10);
      if (!Number.isInteger(block)) {
        sendJson(res, 400, { error: "block query param required" });
        return;
      }
      const bytes = await readBody(req, cfg2.maxImageBytes);
      const imagePath = await store2.saveBlockImage(docId, block, bytes);
      sendJson(res, 200, { path: imagePath });
      return;
    }
    sendJson(res, 404, { error: "no such route" });
  }
  async function staticHandler(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[1];
      if (req.method !== "GET" || first === void 0 || !["build", "cmaps", "standard_fonts"].includes(first)) {
        sendText(res, 404, "not found");
        return;
      }
      const target = safeJoin(pdfjsRoot(), parts.slice(1).join("/"));
      if (target === null) {
        sendText(res, 403, "forbidden");
        return;
      }
      if (!existsSync2(target) || !statSync(target).isFile()) {
        sendText(res, 404, "not found");
        return;
      }
      sendFile(res, target, mimeOf(target));
    } catch (error) {
      console.error("[dsh-plugin-doc-companion] /doc-static handler error:", error);
      sendText(res, 500, "internal error");
    }
  }
}
async function handleUpload(req, res, cfg, store) {
  const rawNameHeader = req.headers["x-file-name"];
  const rawName = typeof rawNameHeader === "string" ? decodeURIComponent(rawNameHeader) : "document";
  const sessionHeader = req.headers["x-session"];
  const sessionId = typeof sessionHeader === "string" && sessionHeader !== "" ? sessionHeader : void 0;
  const fileName = sanitizeFileName(rawName);
  const kind = detectKind(fileName);
  if (kind === null) {
    sendJson(res, 415, { error: `unsupported file type "${extname2(fileName)}" (support: PDF / DOCX / XLSX / CSV / TXT / MD)` });
    return;
  }
  const bytes = await readBody(req, cfg.maxBytes);
  const meta = await store.registerBytes(fileName, kind, bytes, sessionId);
  sendJson(res, 200, {
    doc_id: meta.id,
    name: meta.name,
    kind: meta.kind,
    total_blocks: meta.totalBlocks
  });
}
function sessionIdOf(exec) {
  const id = exec.agent?.session?.id;
  return typeof id === "string" && id !== "" ? id : void 0;
}
function docCurrentTool(store, cfg, llm, attachments) {
  return defineTool({
    name: "doc_current",
    description: '\u83B7\u53D6\u7528\u6237\u5F53\u524D\u9605\u8BFB\u72B6\u6001\uFF1A\u6B63\u5728\u8BFB\u7684\u6587\u6863\u3001\u5F53\u524D\u5757\u53F7\uFF08\u9875\u7801/\u5757\u53F7\uFF09\u3001\u8BE5\u5757\u7684\u5168\u90E8\u6587\u5B57\u4E0E\u4F4D\u7F6E\u6807\u7B7E\u3002\u7528\u6237\u95EE"\u8FD9\u4E00\u9875/\u73B0\u5728\u770B\u5230\u54EA/\u5F53\u524D\u5185\u5BB9"\u65F6\u8C03\u7528\uFF1B\u5224\u65AD\u7528\u6237\u505A\u9898\u4E4B\u524D\u4E5F\u5EFA\u8BAE\u5148\u8C03\u7528\u4EE5\u5BF9\u9F50\u4E0A\u4E0B\u6587\u3002',
    parameters: {},
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderBlockRead(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) {
        return {
          ok: true,
          note: "\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u4EFB\u4F55\u6587\u6863\u3002\u7528\u6237\u5C1A\u672A\u4E0A\u4F20/\u6253\u5F00\u6587\u6863\u65F6\uFF0C\u5F15\u5BFC\u7528\u6237\u901A\u8FC7\u9605\u8BFB\u9762\u677F\u4E0A\u4F20\uFF0C\u6216\u4F7F\u7528 doc_open \u6253\u5F00\u6587\u4EF6\u8DEF\u5F84\u3002"
        };
      }
      return resolveBlock(store, cfg, llm, attachments, current.docId, current.block, exec.signal);
    }
  });
}
function docPageTool(store, cfg, llm, attachments) {
  return defineTool({
    name: "doc_page",
    description: '\u8BFB\u53D6\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\u4E2D\u7B2C N \u5757\uFF08\u9875\uFF09\u7684\u6587\u5B57\u4E0E\u4F4D\u7F6E\uFF0C\u4E0D\u6539\u52A8\u9605\u8BFB\u9762\u677F\u7684\u9875\u7801\u3002\u7528\u6237\u95EE"\u7B2C N \u9875\u8BB2\u4E86\u4EC0\u4E48"\u6216\u9700\u8981\u8BFB\u7279\u5B9A\u4F4D\u7F6E\u65F6\u8C03\u7528\u3002',
    parameters: {
      block: {
        type: "integer",
        required: true,
        description: "\u8981\u8BFB\u53D6\u7684\u5757\u53F7\uFF08PDF \u4E3A\u9875\u7801\uFF0C\u4ECE 1 \u5F00\u59CB\uFF09"
      }
    },
    output: {
      schema: BLOCK_READ_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderBlockRead(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_page: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863\uFF08\u7528\u6237\u5C1A\u672A\u4E0A\u4F20/\u6253\u5F00\u6587\u6863\uFF09");
      const block = typeof args.block === "number" ? args.block : Number.NaN;
      if (!Number.isInteger(block) || block < 1) throw new Error("doc_page: block \u5FC5\u987B\u662F\u6B63\u6574\u6570");
      const meta = store.get(current.docId);
      const total = meta.totalBlocks ?? block;
      if (block > total) throw new Error(`doc_page: block ${block} \u8D85\u51FA\u8303\u56F4\uFF081..${total}\uFF09`);
      return resolveBlock(store, cfg, llm, attachments, current.docId, block, exec.signal);
    }
  });
}
function docGotoTool(store) {
  return defineTool({
    name: "doc_goto",
    description: '\u628A\u9605\u8BFB\u9762\u677F\u8DF3\u8F6C\u5230\u7B2C N \u5757\uFF08\u9875\uFF09\u3002\u7528\u6237\u8BF4"\u7FFB\u5230/\u8DF3\u5230\u7B2C N \u9875"\u65F6\u8C03\u7528\uFF1B\u9875\u7801\u4F1A\u5B9E\u65F6\u540C\u6B65\u5230\u9762\u677F\u3002',
    parameters: {
      block: {
        type: "integer",
        required: true,
        description: "\u76EE\u6807\u5757\u53F7\uFF08PDF \u4E3A\u9875\u7801\uFF0C\u4ECE 1 \u5F00\u59CB\uFF09"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          doc: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", required: true },
              name: { type: "string", required: true },
              kind: { type: "string", required: true },
              total_blocks: { type: "integer" },
              text_layer_broken: { type: "boolean" }
            }
          },
          block: { type: "integer", required: true },
          locator: { type: "string", required: true }
        }
      },
      render: (_args, value) => {
        const v = value;
        return [{
          type: "text",
          text: `<doc-goto>
\u6587\u6863\uFF1A${v.doc?.name ?? ""}
\u5DF2\u8DF3\u8F6C\u5230\uFF1A${v.locator ?? ""}
</doc-goto>`
        }];
      }
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_goto: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863");
      const block = typeof args.block === "number" ? args.block : Number.NaN;
      if (!Number.isInteger(block) || block < 1) throw new Error("doc_goto: block \u5FC5\u987B\u662F\u6B63\u6574\u6570");
      const meta = store.get(current.docId);
      const total = meta.totalBlocks;
      if (total !== null && block > total) throw new Error(`doc_goto: block ${block} \u8D85\u51FA\u8303\u56F4\uFF081..${total}\uFF09`);
      store.setCurrent(current.docId, block, sessionIdOf(exec));
      return {
        ok: true,
        doc: docInfoValue(meta),
        block,
        locator: meta.kind === "pdf" ? `\u7B2C ${block} \u9875` : `\u7B2C ${block} \u5757`
      };
    }
  });
}
function docSearchTool(store, cfg) {
  return defineTool({
    name: "doc_search",
    description: "\u5728\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\u5185\u90E8\u5168\u6587\u68C0\u7D22\uFF08\u5757=\u9875/\u6BB5\u843D\u7EC4/\u884C\u7EC4\uFF09\u3002\u95EE\u9898\u6D89\u53CA\u6587\u6863\u5185\u90E8\u4F46\u8D85\u51FA\u5F53\u524D\u9875\u65F6\u8C03\u7528\uFF1A\u8FD4\u56DE\u547D\u4E2D\u4F4D\u7F6E\u4E0E\u4E0A\u4E0B\u6587\u7247\u6BB5\uFF0C\u53EF\u518D\u914D\u5408 doc_page \u8BFB\u53D6\u5B8C\u6574\u539F\u6587\u3002\u591A\u4E2A\u8BCD\u7528\u7A7A\u683C\u5206\u9694\uFF08\u5168\u90E8\u547D\u4E2D\u624D\u8FD4\u56DE\uFF09\u3002",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: '\u68C0\u7D22\u8BCD\uFF0C\u4F8B\u5982 "\u6CF0\u52D2\u516C\u5F0F" \u6216 "\u6781\u9650 \u6D1B\u5FC5\u8FBE"'
      },
      max_hits: {
        type: "integer",
        description: "\u6700\u591A\u8FD4\u56DE\u51E0\u4E2A\u547D\u4E2D\uFF08\u9ED8\u8BA4 5\uFF09"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          query: { type: "string", required: true },
          hits: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                block: { type: "integer", required: true },
                locator: { type: "string", required: true },
                snippet: { type: "string", required: true },
                matches: { type: "integer", required: true }
              }
            }
          },
          note: { type: "string" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: renderSearch(value)
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const current = store.currentState(sessionIdOf(exec));
      if (current.docId === null) throw new Error("doc_search: \u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u6587\u6863");
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (query.length === 0) throw new Error("doc_search: query \u4E0D\u80FD\u4E3A\u7A7A");
      const meta = store.get(current.docId);
      const maxHits = typeof args.max_hits === "number" && args.max_hits > 0 ? Math.floor(args.max_hits) : cfg.searchMaxHits;
      const blocks = await store.blocksFor(current.docId, exec.signal);
      if (meta.textLayerBroken === true) {
        return {
          ok: true,
          query,
          hits: [],
          note: `\u300C${meta.name}\u300D\u6CA1\u6709\u53EF\u68C0\u7D22\u7684\u6587\u672C\u5C42\uFF08\u626B\u63CF\u4EF6\uFF0C\u6216\u5B57\u5F62\u6620\u5C04\u635F\u574F\uFF09\uFF0C\u5168\u6587\u68C0\u7D22\u4E0D\u53EF\u7528\u3002\u4F60\u5173\u5FC3\u7684\u9875\u9762\u53EF\u7528 doc_page \u8BFB\u53D6\uFF08\u4F1A\u81EA\u52A8\u622A\u56FE\u8F6C\u5199\uFF09\uFF0C\u6216\u5C06\u9875\u9762\u622A\u56FE\u53D1\u7ED9\u6211\u3002`
        };
      }
      const hits = searchBlocks(blocks, query, maxHits);
      const note = hits.length === 0 ? `\u5728\u300C${meta.name}\u300D\u4E2D\u6CA1\u6709\u627E\u5230\u4E0E "${query}" \u76F8\u5173\u7684\u5185\u5BB9\u3002` : void 0;
      return { ok: true, query, hits, ...note !== void 0 ? { note } : {} };
    }
  });
}
function docOpenTool(store, cfg) {
  return defineTool({
    name: "doc_open",
    description: "\u6309\u6587\u4EF6\u8DEF\u5F84\u6253\u5F00\u4E00\u4E2A\u6587\u6863\uFF08PDF / DOCX / XLSX / CSV / TXT / MD\uFF09\u3002\u6253\u5F00\u540E\u9605\u8BFB\u9762\u677F\u81EA\u52A8\u52A0\u8F7D\u5E76\u8DF3\u8F6C\u5230\u7B2C 1 \u5757\u3002\u7528\u6237\u63D0\u5230\u67D0\u4E2A\u6587\u4EF6\u8DEF\u5F84\u60F3\u8BFB\u65F6\u8C03\u7528\uFF1B\u8DEF\u5F84\u53EF\u7528\u7EDD\u5BF9\u8DEF\u5F84\u6216\u76F8\u5BF9\u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55\u7684\u8DEF\u5F84\u3002",
    parameters: {
      path: {
        type: "string",
        required: true,
        description: "\u6587\u6863\u6587\u4EF6\u8DEF\u5F84"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          doc: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", required: true },
              name: { type: "string", required: true },
              kind: { type: "string", required: true },
              total_blocks: { type: "integer" },
              text_layer_broken: { type: "boolean" }
            }
          },
          note: { type: "string" }
        }
      },
      render: (_args, value) => {
        const doc = value.doc;
        return [{
          type: "text",
          text: `<doc-open>
\u5DF2\u6253\u5F00\uFF1A${doc?.name ?? ""}\uFF08${doc?.kind ?? ""}${doc?.total_blocks != null ? ` \xB7 ${doc.total_blocks} \u5757` : ""}\uFF09
</doc-open>`
        }];
      }
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const rawPath = typeof args.path === "string" ? args.path.trim() : "";
      if (rawPath.length === 0) throw new Error("doc_open: path \u4E0D\u80FD\u4E3A\u7A7A");
      const cwd = exec.agent?.session?.header?.cwd;
      const target = isAbsolute(rawPath) ? rawPath : cwd !== void 0 ? resolve2(cwd, rawPath) : resolve2(rawPath);
      const kind = detectKind(target);
      if (kind === null) {
        throw new Error(`doc_open: \u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B\uFF08\u652F\u6301 PDF / DOCX / XLSX / CSV / TXT / MD\uFF09: ${rawPath}`);
      }
      if (!existsSync2(target)) throw new Error(`doc_open: \u627E\u4E0D\u5230\u6587\u4EF6 "${rawPath}"`);
      const size = statSync(target).size;
      if (size > cfg.maxBytes) throw new Error(`doc_open: \u6587\u4EF6\u8FC7\u5927\uFF08${size} \u5B57\u8282 > ${cfg.maxBytes}\uFF09`);
      const meta = await store.registerFile(sanitizeFileName(rawPath), kind, target, sessionIdOf(exec));
      return { ok: true, doc: docInfoValue(meta) };
    }
  });
}
function docCloseTool(store) {
  return defineTool({
    name: "doc_close",
    description: "\u5173\u95ED\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863\uFF08\u9605\u8BFB\u9762\u677F\u56DE\u5230\u7A7A\u72B6\u6001\uFF1B\u6587\u6863\u5E93\u91CC\u7684\u6587\u6863\u4FDD\u7559\uFF09\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true }
        }
      },
      render: () => [{ type: "text", text: "<doc-close>\u5DF2\u5173\u95ED\u5F53\u524D\u6587\u6863</doc-close>" }]
    },
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      store.close(sessionIdOf(exec));
      return { ok: true };
    }
  });
}
function docListTool(store) {
  return defineTool({
    name: "doc_list",
    description: "\u5217\u51FA\u6587\u6863\u5E93\u91CC\u5DF2\u6709\u7684\u6587\u6863\uFF08id\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u5757\u6570\uFF09\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          docs: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                kind: { type: "string", required: true },
                total_blocks: { type: "integer" },
                added_at: { type: "integer", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => {
        const docs = value.docs;
        if (docs.length === 0) return [{ type: "text", text: "<doc-list>\uFF08\u6587\u6863\u5E93\u4E3A\u7A7A\uFF09</doc-list>" }];
        const lines = docs.map((doc) => `- ${doc.name}\uFF08${doc.kind}${doc.total_blocks != null ? ` \xB7 ${doc.total_blocks} \u5757` : ""}\uFF09id=${doc.id}`);
        return [{ type: "text", text: `<doc-list>
${lines.join("\n")}
</doc-list>` }];
      }
    },
    isConcurrencySafe: () => true,
    async execute() {
      return {
        ok: true,
        docs: store.list().map((meta) => ({
          id: meta.id,
          name: meta.name,
          kind: meta.kind,
          ...meta.totalBlocks !== null ? { total_blocks: meta.totalBlocks } : {},
          added_at: meta.addedAt
        }))
      };
    }
  });
}
function renderBlockRead(value) {
  const lines = [];
  lines.push("<doc-block>");
  const doc = value.doc;
  if (doc !== void 0) {
    lines.push(`\u6587\u6863\uFF1A${doc.name}\uFF08${doc.kind}${doc.total_blocks != null ? ` \xB7 \u5171 ${doc.total_blocks} \u5757` : ""}\uFF09`);
  }
  if (value.locator !== void 0) lines.push(`\u4F4D\u7F6E\uFF1A${value.locator}`);
  if (value.scanned === true) lines.push("\u626B\u63CF\u9875\uFF1A\u662F\uFF08\u65E0\u6587\u5B57\u5C42\uFF09");
  if (typeof value.text === "string" && value.text.length > 0) {
    lines.push("<block-text>");
    lines.push(value.text);
    lines.push("</block-text>");
  }
  if (value.image_path !== void 0) lines.push(`\u9875\u9762\u5FEB\u7167\uFF1A${value.image_path}`);
  if (value.note !== void 0) lines.push(`\u63D0\u793A\uFF1A${value.note}`);
  lines.push("</doc-block>");
  return lines.join("\n");
}
function renderSearch(value) {
  const lines = [];
  lines.push(`<doc-search query="${value.query}">`);
  if (value.hits.length === 0) {
    lines.push(value.note ?? "\uFF08\u6CA1\u6709\u547D\u4E2D\uFF09");
  } else {
    lines.push(`\u5171 ${value.hits.length} \u4E2A\u547D\u4E2D\uFF1A`);
    for (const hit of value.hits) {
      lines.push(`\u2500\u2500 \u3010${hit.locator}\u3011\u2500\u2500`);
      lines.push(hit.snippet);
    }
  }
  lines.push("</doc-search>");
  return lines.join("\n");
}
export {
  Config,
  DocStoreError,
  DocumentStore,
  TRANSCRIBE_INSTRUCTION,
  apply,
  chunkText,
  chunkTotalChars,
  clampIndex,
  countMatches,
  detectBrokenTextLayer,
  detectKind,
  extractDocxParagraphs,
  extractXlsxSheets,
  groupBy,
  inject,
  joinTextItems,
  makeDocId,
  makeSnippet,
  name,
  normalizeConfig,
  normalizeWhitespace,
  openPdf,
  pageLocator,
  paragraphBlockLocator,
  parseCsv,
  queryTerms,
  renderPdfPagePng,
  resolveStorageDir,
  rowBlockLocator,
  safeJoin,
  sanitizeFileName,
  searchBlocks,
  textBlockLocator,
  transcribeImage
};
