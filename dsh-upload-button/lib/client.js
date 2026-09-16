window.__ModuleLoader__.load({ id: "dsh-upload-button", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
var STYLE_TAG = "dsh-upload-button/style.css";
var STYLE_CSS = `
.dsh-up-button{border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);cursor:pointer;border-radius:6px;padding:4px;display:inline-flex;align-items:center;justify-content:center;line-height:0}
.dsh-up-button:hover:not(:disabled){color:var(--dsw-alias-label-primary,currentColor)}
.dsh-up-button:disabled{opacity:.45;cursor:default}
/* Alignment mirrors the official QueueDock formula, so the card row lines up
   with the composer card below it. */
.dsh-up-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto 6px;padding:0 var(--dsh-composer-dock-inset);display:flex;flex-wrap:wrap;gap:8px;flex:none}
/* Windows-icon posture: a vertical card, portrait page badge on top, two-line
   clamped name below, corner \u2715 \u2014 long names wrap instead of stretching wide. */
.dsh-up-card{position:relative;flex-direction:column;align-items:center;gap:5px;width:88px;flex:none;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));border-radius:12px;padding:12px 8px 9px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,inherit)}
.dsh-up-badge{width:44px;height:56px;border-radius:6px;color:#fff;font-size:12px;font-weight:700;font-family:var(--ds-font-family-code,monospace);display:inline-flex;align-items:center;justify-content:center;letter-spacing:.5px;flex:none;box-shadow:inset 0 -10px 14px rgba(0,0,0,.14),inset 0 10px 12px rgba(255,255,255,.16)}
.dsh-up-name{width:100%;font-size:12px;line-height:16px;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.dsh-up-size{color:var(--dsw-alias-label-tertiary,inherit);font-size:10.5px;flex:none}
.dsh-up-remove{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;padding:2px;border-radius:4px;display:inline-flex;line-height:0;flex:none}
.dsh-up-remove:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-up-card>.dsh-up-remove{position:absolute;top:4px;right:4px}
.dsh-up-error{display:inline-flex;align-items:center;gap:8px;max-width:100%;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-interactive-bg-hover-danger,rgba(216,97,97,.14));color:var(--dsw-alias-state-error-primary,#d86161);border-radius:10px;padding:6px 8px 6px 10px;font-size:13px}
.dsh-up-error-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
/* Sent user message: the bubble shows the user's words only \u2014 upload paths
   stay out of the display. Each attached file floats above the bubble as the
   same Microsoft-classic card the composer dock uses: portrait page badge
   colored by type (red PDF, blue Word, green Excel...), two-line clamped
   name \u2014 identical visual language, whole card clickable. */
.dsh-up-msg-row{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.dsh-up-msg-stack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}
.dsh-up-msg-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.dsh-up-msg-text{white-space:pre-wrap}
.dsh-up-msg-chip{display:inline-flex;align-items:center;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit);padding:0 6px;font-size:14px;line-height:22px;margin:0 2px}
/* The negative bottom margin pulls the bubble up under the cards so they
   float on its top edge instead of sitting in a separate row. */
.dsh-up-msg-files{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;position:relative;z-index:1;margin-bottom:-14px}
/* Same visual as .dsh-up-card / .dsh-up-badge / .dsh-up-name in the composer
   dock (shared classes below), rendered as one clickable card. */
.dsh-up-msg-file{position:relative;flex-direction:column;align-items:center;gap:5px;width:88px;flex:none;display:flex;text-align:center;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));border-radius:12px;padding:12px 8px 9px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-up-msg-file:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-up-msg-file .dsh-up-name{color:var(--dsw-alias-label-primary,inherit)}
/* Actions row mirroring the official MessageIconActions (time + copy). */
.dsh-up-msg-actions{align-items:center;gap:10px;height:28px;display:flex}
.dsh-up-msg-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}
@media (hover:hover){[data-time-hover-root] .dsh-up-msg-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .dsh-up-msg-time,[data-time-hover-root]:focus-within .dsh-up-msg-time{opacity:1}}
.dsh-up-msg-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}
.dsh-up-msg-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
`;
function injectCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-upload-button";
  tag.dataset.pluginCss = STYLE_TAG;
  tag.textContent = STYLE_CSS;
  document.head.appendChild(tag);
}

// src/client/locales.ts
var zh = {
  // Composer toolbar button
  "upload.button": "\u4E0A\u4F20\u6587\u4EF6",
  "upload.buttonBusy": "\u4E0A\u4F20\u4E2D\u2026",
  // Dock file cards
  "upload.remove": "\u79FB\u9664",
  // Error banner
  "upload.dismissError": "\u5173\u95ED\u9519\u8BEF\u63D0\u793A",
  "upload.insertFailed": "\u6587\u4EF6\u5DF2\u4E0A\u4F20\u4F46\u672A\u80FD\u52A0\u5165\u8F93\u5165\u6846: {path}",
  "upload.failed": "\u4E0A\u4F20\u5931\u8D25: {message}",
  // Message-bubble file chips
  "upload.openFile": "\u6253\u5F00\u6587\u4EF6",
  // Message-image gallery labels (bubble renderer)
  "image.label": "\u56FE\u7247",
  "image.openOriginal": "\u67E5\u770B\u539F\u56FE",
  "image.openOriginalLabel": "\u67E5\u770B\u539F\u56FE: {label}",
  "image.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "image.loadFailed": "\u52A0\u8F7D\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5",
  "image.lightboxDialog": "\u56FE\u7247\u9884\u89C8",
  "image.lightboxClose": "\u5173\u95ED",
  "image.serviceUnavailable": "\u56FE\u7247\u8BFB\u53D6\u670D\u52A1\u4E0D\u53EF\u7528",
  // Conversation surface strings the bubble renderer reuses
  "message.extraBlock": "\u9644\u52A0\u5185\u5BB9\u5757",
  "json.truncated": "\u2026 \u5DF2\u622A\u65AD\uFF0C\u5171 {total} \u5B57\u7B26",
  "clock.md": "{m}\u6708{d}\u65E5",
  "clock.ymd": "{y}\u5E74{m}\u6708{d}\u65E5"
};
var en = {
  "upload.button": "Upload file",
  "upload.buttonBusy": "Uploading\u2026",
  "upload.remove": "Remove",
  "upload.dismissError": "Dismiss error",
  "upload.insertFailed": "File uploaded but could not be inserted into the input: {path}",
  "upload.failed": "Upload failed: {message}",
  "upload.openFile": "Open file",
  "image.label": "Image",
  "image.openOriginal": "View original",
  "image.openOriginalLabel": "View original: {label}",
  "image.loading": "Loading\u2026",
  "image.loadFailed": "Failed to load, click to retry",
  "image.lightboxDialog": "Image preview",
  "image.lightboxClose": "Close",
  "image.serviceUnavailable": "Image loading service unavailable",
  "message.extraBlock": "Extra content block",
  "json.truncated": "\u2026 truncated, {total} characters total",
  "clock.md": "{m}/{d}",
  "clock.ymd": "{y}-{m}-{d}"
};
var dicts = {
  zh,
  en
};
var NS = "dsh-upload-button";

// src/client/upload.ts
var UPLOAD_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/|\\\\).*[\\/][0-9a-f]{12}-[^\\/]+$/;
var pendingBySession = /* @__PURE__ */ new Map();
var EMPTY_PENDING = [];
var pendingListeners = /* @__PURE__ */ new Set();
function publishPending() {
  for (const listener of pendingListeners) listener();
}
function subscribePending(listener) {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}
function pendingOf(sessionId) {
  return pendingBySession.get(sessionId) ?? EMPTY_PENDING;
}
function setPending(sessionId, files) {
  pendingBySession.set(sessionId, files);
  publishPending();
}
function addPendingFile(sessionId, file) {
  setPending(sessionId, [...pendingOf(sessionId), file]);
}
function removePendingFile(sessionId, path) {
  setPending(sessionId, pendingOf(sessionId).filter((f) => f.path !== path));
}
function clearPending(sessionId) {
  if (pendingOf(sessionId).length > 0) setPending(sessionId, []);
}
var uploadMeta = /* @__PURE__ */ new Map();
var uploadError = null;
var errorSeq = 0;
var errorListeners = /* @__PURE__ */ new Set();
function subscribeErrors(listener) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}
function getUploadError() {
  return uploadError;
}
function setUploadError(text) {
  uploadError = { seq: ++errorSeq, text };
  for (const listener of errorListeners) listener();
}
function clearUploadError() {
  uploadError = null;
  for (const listener of errorListeners) listener();
}
function badgeStyle(name) {
  const ext = name.slice(name.lastIndexOf(".") + 1).toUpperCase().slice(0, 4);
  const lower = ext.toLowerCase();
  if (lower === "pdf") return { bg: "#C93B2E", ext: "PDF" };
  if (lower === "doc" || lower === "docx") return { bg: "#2B579A", ext: "DOC" };
  if (lower === "xls" || lower === "xlsx" || lower === "csv") return { bg: "#217346", ext: "XLS" };
  if (lower === "ppt" || lower === "pptx") return { bg: "#C43E1C", ext: "PPT" };
  if (lower === "txt" || lower === "md") return { bg: "#757575", ext: "TXT" };
  if (lower === "zip" || lower === "rar" || lower === "7z") return { bg: "#7A5BB0", ext: "ZIP" };
  return { bg: "#5B7DB1", ext: ext === "" ? "FILE" : ext };
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function nameFromPath(path) {
  const base = path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);
  return base === "" ? path : base;
}
function displayName(path) {
  return nameFromPath(path).replace(/^[0-9a-f]{12}-/, "");
}
var wrappedFaces = /* @__PURE__ */ new Map();
function disposeSendAttachments() {
  for (const [session, state] of wrappedFaces) {
    state.active = false;
    if (session.prompt === state.wrapper) session.prompt = state.original;
  }
  wrappedFaces.clear();
}
function installSendAttachment(sessions, sessionId) {
  const session = sessions?.binding?.(sessionId)?.session;
  if (session === void 0 || typeof session.prompt !== "function" || wrappedFaces.has(session)) return;
  const original = session.prompt;
  const state = { original, wrapper: original, active: true };
  const wrapper = (content, mode) => {
    const pending = pendingOf(sessionId);
    if (!state.active || pending.length === 0 || !Array.isArray(content)) return original.call(session, content, mode);
    const parts = Array.isArray(content) ? [...content] : [];
    const paths = pending.map((f) => `\`${f.path}\``).join("\n");
    const last = parts.length > 0 ? parts[parts.length - 1] : void 0;
    if (last !== void 0 && last.type === "text" && typeof last.text === "string") {
      parts[parts.length - 1] = { ...last, text: last.text === "" ? paths : `${last.text}
${paths}` };
    } else {
      parts.push({ type: "text", text: paths });
    }
    return Promise.resolve(original.call(session, parts, mode)).then((result) => {
      if (result?.ok === true) clearPending(sessionId);
      return result;
    });
  };
  state.wrapper = wrapper;
  session.prompt = wrapper;
  wrappedFaces.set(session, state);
}
async function attachFile(sessions, sessionId, file, t) {
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-file-name": encodeURIComponent(file.name) },
      body: file
    });
    if (!res.ok) throw new Error(`${file.name}: HTTP ${res.status}`);
    const payload = await res.json();
    if (typeof payload.path !== "string") throw new Error("missing path in response");
    const name = payload.name ?? file.name;
    const bytes = payload.bytes ?? file.size;
    uploadMeta.set(payload.path, { name, bytes });
    addPendingFile(sessionId, { path: payload.path, name, bytes });
    installSendAttachment(sessions, sessionId);
    clearUploadError();
  } catch (err) {
    setUploadError(t("upload.failed", { message: err instanceof Error ? err.message : String(err) }));
    throw err;
  }
}

// src/client/composer.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function UploadButton({ attach, t }) {
  const [busy, setBusy] = (0, import_react.useState)(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length === 0) return;
      setBusy(true);
      void (async () => {
        for (const file of files) {
          try {
            await attach?.(file);
          } catch {
          }
        }
        setBusy(false);
      })();
    };
    input.click();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: busy ? t("upload.buttonBusy") : t("upload.button"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-up-button", "aria-label": t("upload.button"), disabled: busy, onClick: pick, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPaperclipOutline16, { size: 14 }) }) });
}
function UploadDock({ sessionId, t }) {
  const files = (0, import_react.useSyncExternalStore)(subscribePending, () => pendingOf(sessionId));
  const error = (0, import_react.useSyncExternalStore)(subscribeErrors, getUploadError);
  if (files.length === 0 && error === null) return null;
  const removeCard = (path) => {
    removePendingFile(sessionId, path);
    void fetch(`/api/upload?path=${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => {
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-up-dock", children: [
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-up-error", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-up-error-text", title: error.text, children: error.text }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-up-remove",
          "aria-label": t("upload.dismissError"),
          onClick: clearUploadError,
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { size: 12 })
        }
      )
    ] }, `error-${error.seq}`),
    files.map((file) => {
      const { bg, ext } = badgeStyle(file.name);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-up-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-up-badge", style: { background: bg }, children: ext }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-up-name", title: file.path, children: file.name }),
        file.bytes > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-up-size", children: formatBytes(file.bytes) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("upload.remove"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-up-remove",
            "aria-label": t("upload.remove"),
            onClick: () => removeCard(file.path),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { size: 12 })
          }
        ) })
      ] }, file.path);
    })
  ] });
}

// src/client/message-bubble.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
function contentParts(content) {
  const texts = [];
  const images = [];
  const rest = [];
  for (const block of content) {
    if (block.type === "text") texts.push(block.text);
    else if (block.type === "image") images.push({ attachment: block.attachment });
    else rest.push(block);
  }
  return { text: texts.join(""), images, rest };
}
var INLINE_CODE_RE = /`([^`\n]+)`/g;
function stripUploadTokens(text) {
  const files = [];
  let visible = "";
  let cursor = 0;
  let m;
  INLINE_CODE_RE.lastIndex = 0;
  while ((m = INLINE_CODE_RE.exec(text)) !== null) {
    const token = m[1] ?? "";
    if (!UPLOAD_PATH_RE.test(token)) continue;
    visible += text.slice(cursor, m.index);
    files.push({ path: token, name: displayName(token) });
    cursor = m.index + m[0].length;
  }
  if (files.length === 0) return { visible: text, files };
  visible += text.slice(cursor);
  visible = visible.replace(/[ \t\n]+$/, "");
  return { visible, files };
}
function projectRefTokens(text) {
  const re = /(^|\s)([/@][\w-]+)(?=\s|$)/g;
  const parts = [];
  let cursor = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tokenStart = m.index + (m[1]?.length ?? 0);
    const label = m[2] ?? "";
    if (tokenStart > cursor) parts.push(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-msg-text", children: text.slice(cursor, tokenStart) }, cursor));
    parts.push(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-msg-chip", "data-ref-chip": label.startsWith("@") ? "subagent" : "skill", children: label }, `chip-${tokenStart}`));
    cursor = tokenStart + label.length;
  }
  if (parts.length === 0) return [/* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-msg-text", children: text }, 0)];
  if (cursor < text.length) parts.push(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-msg-text", children: text.slice(cursor) }, cursor));
  return parts;
}
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function formatMessageClock(time, t, now = Date.now()) {
  const d = new Date(time);
  const n = new Date(now);
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  return `${d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)} ${clock}`;
}
function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function msUntilNextLocalMidnight(ms) {
  const next = startOfLocalDay(ms) + 24 * 60 * 60 * 1e3;
  return Math.max(1e3, next - ms);
}
function useCalendarDay() {
  const [day, setDay] = (0, import_react2.useState)(() => startOfLocalDay(Date.now()));
  (0, import_react2.useEffect)(() => {
    let timer;
    const arm = () => {
      const now = Date.now();
      setDay(startOfLocalDay(now));
      timer = setTimeout(arm, msUntilNextLocalMidnight(now));
    };
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()));
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return day;
}
function UserBubbleActions({ text, time, t }) {
  const [copied, setCopied] = (0, import_react2.useState)(false);
  const copyTimer = (0, import_react2.useRef)(null);
  const day = useCalendarDay();
  const onCopy = () => {
    if (copied || copyTimer.current !== null) return;
    void (0, import_dsh_client_ui_primitives2.writeClipboard)(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null;
        setCopied(false);
      }, 1e3);
    });
  };
  const clockEl = time === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-msg-time", children: formatMessageClock(time, t, day) });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-up-msg-actions", children: [
    clockEl,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: copied ? t("copied") : t("copy"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsh-up-msg-action", "aria-label": copied ? t("copied") : t("copy"), onClick: onCopy, children: copied ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCheckOutline16, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCopyOutline16, {}) }) })
  ] });
}
var UserMessageWithUploads = (0, import_react2.memo)(function UserMessageWithUploads2({ node, openFile, renderMessageImages, t }) {
  const content = node.data.content;
  const { text, images, rest } = contentParts(content);
  const { visible, files } = stripUploadTokens(text);
  const showBubble = visible !== "" || rest.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-up-msg-row", "data-time-hover-root": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-up-msg-stack", children: [
      images.length > 0 && renderMessageImages({ images, align: "end" }),
      files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-up-msg-files", children: files.map((f) => {
        const { bg, ext } = badgeStyle(f.name);
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-up-msg-file",
            title: f.path,
            "aria-label": t("upload.openFile"),
            onClick: () => {
              try {
                openFile(f.path);
              } catch {
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-badge", style: { background: bg }, children: ext }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-up-name", children: f.name })
            ]
          },
          f.path
        );
      }) }),
      showBubble && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-up-msg-bubble", children: [
        projectRefTokens(visible),
        rest.map((block, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.JsonBlock, { label: t("message.extraBlock"), payload: block, truncatedLabel: (total) => t("json.truncated", { total }) }, i))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UserBubbleActions, { text, time: node.data.time, t })
  ] });
});

// src/client.tsx
var inject = ["slots", "sessions", "locale"];
function apply(ctx) {
  injectCss();
  ctx.effect(() => disposeSendAttachments, `${NS}: send attachment hooks`);
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`);
  const t = ctx.locale.bind(NS);
  const guarded = (label, register) => {
    try {
      return register();
    } catch (err) {
      console.warn(`[dsh-upload-button] slot "${label}" registration failed; that UI seat stays absent:`, err);
      return () => {
      };
    }
  };
  ctx.slots.inject("conversation.input.left", () => guarded(
    "conversation.input.left",
    () => ctx.slots.register({
      name: "conversation.input.left",
      id: "upload-file-button",
      order: 0,
      locale: NS,
      inject: (sessionId) => ({
        attach: (file) => attachFile(ctx.sessions, sessionId, file, t)
      })
    }, UploadButton)
  ));
  ctx.slots.inject("conversation.input.dock", () => guarded(
    "conversation.input.dock",
    () => ctx.slots.register({
      name: "conversation.input.dock",
      id: "upload-file-dock",
      order: 5,
      locale: NS
    }, UploadDock)
  ));
  for (const key of ["user", "steering"]) {
    ctx.slots.inject("conversation.chat.node", () => guarded(
      `conversation.chat.node:${key}`,
      () => ctx.slots.register({
        name: "conversation.chat.node",
        key,
        priority: -1,
        locale: NS
      }, UserMessageWithUploads)
    ));
  }
}
return module.exports; } });
