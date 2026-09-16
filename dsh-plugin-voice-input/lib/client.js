window.__ModuleLoader__.load({ id: "dsh-plugin-voice-input", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
var STYLE_ID = "dsh-voice-input-style";
function injectCss() {
  if (document.getElementById(STYLE_ID) !== null) return () => {
  };
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.dsh-vi-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.dsh-vi-button:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.12);
}
.dsh-vi-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-vi-button[data-recording="true"] {
  color: #e5484d;
}
.dsh-vi-button[data-recording="true"] svg {
  animation: dsh-vi-pulse 1.1s ease-in-out infinite;
}
@keyframes dsh-vi-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
.dsh-vi-status {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 220px;
  margin-left: 6px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.dsh-vi-status[data-tone="recording"] { color: #e5484d; }
.dsh-vi-status[data-tone="processing"] { color: inherit; opacity: 0.7; }
.dsh-vi-status[data-tone="error"] { color: #e5484d; cursor: help; }
`;
  document.head.appendChild(style);
  return () => style.remove();
}

// src/client/locales.ts
var zh = {
  // Composer toolbar button
  "voice.button": "\u6309\u4F4F\u8BF4\u8BDD",
  "voice.hotkey": "\uFF08\u6216\u6309\u4F4F {key}\uFF09",
  "voice.recording": "\u677E\u5F00\u7ED3\u675F",
  "voice.processing": "\u8BC6\u522B\u4E2D\u2026",
  // First-run preparation of the local engine (download + verify)
  "voice.preparing": "\u51C6\u5907\u672C\u5730\u6A21\u578B {percent}%",
  "voice.notReady": "\u672C\u5730\u8BC6\u522B\u672A\u5C31\u7EEA\uFF1A\u9996\u6B21\u4F7F\u7528\u9700\u4E0B\u8F7D\u6A21\u578B\uFF08\u7EA6 258 MB\uFF09",
  // Inline status
  "voice.listening": "\u8046\u542C\u4E2D {seconds}s",
  "voice.silent": "\u6CA1\u542C\u5230\u58F0\u97F3\uFF0C\u8BF7\u9760\u8FD1\u9EA6\u514B\u98CE\u518D\u8BD5",
  "voice.error.mic": "\u65E0\u6CD5\u4F7F\u7528\u9EA6\u514B\u98CE\uFF0C\u8BF7\u68C0\u67E5\u7CFB\u7EDF\u5F55\u97F3\u6743\u9650\u540E\u91CD\u8BD5",
  "voice.error.short": "\u8BF4\u8BDD\u65F6\u95F4\u592A\u77ED\uFF0C\u8BF7\u6309\u4F4F\u8BF4\u5B8C\u4E00\u6574\u53E5",
  "voice.error.bridge": "\u672C\u5730\u8BC6\u522B\u670D\u52A1\u4E0D\u53EF\u7528\uFF08\u91CD\u542F\u5E94\u7528\u540E\u91CD\u8BD5\uFF09",
  "voice.error.engine": "\u8BC6\u522B\u5931\u8D25\uFF1A{message}"
};
var en = {
  "voice.button": "Hold to talk",
  "voice.hotkey": " (or hold {key})",
  "voice.recording": "Release to finish",
  "voice.processing": "Transcribing\u2026",
  "voice.preparing": "Preparing the local model {percent}%",
  "voice.notReady": "Local recognition is not ready: the model (~258 MB) is downloaded on first use",
  "voice.listening": "Listening {seconds}s",
  "voice.silent": "No speech detected, try again closer to the mic",
  "voice.error.mic": "Microphone unavailable \u2014 check the system recording permission",
  "voice.error.short": "Too short \u2014 hold and speak a full sentence",
  "voice.error.bridge": "Local voice service unavailable (restart the app and retry)",
  "voice.error.engine": "Transcription failed: {message}"
};
var dicts = {
  zh,
  en
};
var NS = "dsh-plugin-voice-input";

// src/client/mic.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/recorder.ts
var RAW_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  channelCount: { ideal: 1 }
};
var CAPTURE_WORKLET = `
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.live = true;
    this.buffer = new Float32Array(1024);
    this.used = 0;
    this.port.onmessage = (event) => {
      if (event.data !== 'stop') return;
      this.live = false;
      this.flush();
      this.port.postMessage({ stopped: true });
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.used = 0;
  }
  process(inputs) {
    if (!this.live) return false;
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let frame = 0; frame < channels[0].length; frame++) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame] / channels.length;
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('dsh-voice-capture', VoiceCapture);
`;
function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const tag = (offset2, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset2 + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
async function createRecorder(options) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone requires localhost or HTTPS.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO_CONSTRAINTS });
  let context;
  let source;
  let processor;
  let sink;
  let ticker;
  let autoStop;
  let live = true;
  let stopping = false;
  let frames = 0;
  let peak = 0;
  const chunks = [];
  const cleanup = async () => {
    live = false;
    clearInterval(ticker);
    clearTimeout(autoStop);
    for (const track of stream.getTracks()) track.stop();
    source?.disconnect();
    processor?.disconnect();
    sink?.disconnect();
    if (context && context.state !== "closed") await context.close().catch(() => {
    });
  };
  try {
    try {
      context = new AudioContext({ sampleRate: 16e3 });
    } catch {
      context = new AudioContext();
    }
    await context.resume();
    source = context.createMediaStreamSource(stream);
    sink = context.createGain();
    sink.gain.value = 0;
    const rate = context.sampleRate;
    const frameLimit = options.maxSeconds > 0 ? Math.floor(options.maxSeconds * rate) : Infinity;
    const collect = (data) => {
      if (!live || frames >= frameLimit) return;
      const count = Math.min(data.length, frameLimit - frames);
      const copy = data.slice(0, count);
      chunks.push(copy);
      frames += count;
      for (const sample of copy) peak = Math.max(peak, Math.abs(sample));
    };
    let flush = async () => {
    };
    if (context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(context, "dsh-voice-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCountMode: "max",
        channelInterpretation: "discrete"
      });
      processor = node;
      let acknowledge;
      node.port.onmessage = (event) => {
        if (event.data.samples) collect(event.data.samples);
        if (event.data.stopped) acknowledge?.();
      };
      flush = () => new Promise((resolve) => {
        const timer = setTimeout(() => {
          node.port.close();
          resolve();
        }, 1e3);
        acknowledge = () => {
          clearTimeout(timer);
          node.port.close();
          resolve();
        };
        node.port.postMessage("stop");
      });
    } else {
      const channels = Math.max(1, Math.min(2, stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1));
      const node = context.createScriptProcessor(1024, channels, 1);
      node.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const mono = new Float32Array(input.length);
        for (let channel = 0; channel < input.numberOfChannels; channel++) {
          const data = input.getChannelData(channel);
          for (let frame = 0; frame < mono.length; frame++) mono[frame] += data[frame] / input.numberOfChannels;
        }
        collect(mono);
      };
      processor = node;
    }
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
    let resolveResult;
    const done = new Promise((resolve) => {
      resolveResult = resolve;
    });
    const stop = () => {
      if (stopping) return done;
      stopping = true;
      for (const track of stream.getTracks()) track.stop();
      void (async () => {
        try {
          await flush();
        } finally {
          await cleanup();
          resolveResult({ blob: encodeWav(chunks, rate), seconds: frames / rate, silent: peak < 1e-4 });
        }
      })();
      return done;
    };
    ticker = setInterval(() => options.onDuration?.(frames / rate), 250);
    if (options.maxSeconds > 0) autoStop = setTimeout(() => {
      void stop();
    }, options.maxSeconds * 1e3);
    return { stop, done };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// src/client/bridge.ts
function percentOf(progress, downloadBytes = 0) {
  if (progress === void 0) return 0;
  const total = progress.total > 0 ? progress.total : downloadBytes;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(progress.received / total * 100)));
}
async function fetchStatus(signal) {
  try {
    const res = await fetch("/api/asr", { headers: { accept: "application/json" }, signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function requestTranscription(blob, signal) {
  const res = await fetch("/api/asr", {
    method: "POST",
    headers: { "content-type": "audio/wav", "x-file-name": "speech.wav" },
    body: blob,
    signal
  });
  const body = await res.json().catch(() => null);
  if (res.ok) return { ok: true, text: body?.text ?? "" };
  return {
    ok: false,
    message: body?.error?.message ?? "",
    provisioning: body?.provisioning === true
  };
}
async function waitUntilReady(onProgress, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    signal?.throwIfAborted();
    const status = await fetchStatus(signal);
    if (status === null) continue;
    if (status.ready) {
      onProgress(100, "");
      return true;
    }
    const state = status.provisioning;
    if (state !== void 0 && state.error !== "") return false;
    onProgress(percentOf(state, status.downloadBytes), state?.label ?? "");
  }
  return false;
}

// src/client/mic.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var DEFAULT_MAX_SECONDS = 600;
var DEFAULT_HOTKEY = "AltLeft+Backquote+Digit1";
var OS_MODIFIER_PROP = {
  AltLeft: "altKey",
  AltRight: "altKey",
  ControlLeft: "ctrlKey",
  ControlRight: "ctrlKey",
  ShiftLeft: "shiftKey",
  ShiftRight: "shiftKey",
  MetaLeft: "metaKey",
  MetaRight: "metaKey"
};
var MODIFIER_ALIASES = {
  Alt: "AltLeft",
  Ctrl: "ControlLeft",
  Control: "ControlLeft",
  Shift: "ShiftLeft",
  Win: "MetaLeft",
  Meta: "MetaLeft"
};
function normalizeHotkey(raw) {
  if (raw === void 0) return DEFAULT_HOTKEY;
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  if (trimmed === "" || lowered === "none" || lowered === "off" || lowered === "false" || lowered === "disable" || lowered === "disabled") {
    return null;
  }
  const parts = trimmed.split("+").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) return null;
  const mapped = parts.map((part) => {
    if (part === "`" || part === "~") return "Backquote";
    return MODIFIER_ALIASES[part] ?? part;
  });
  return mapped.join("+");
}
var CODE_LABELS = {
  Backquote: "`",
  AltLeft: "Alt",
  AltRight: "Alt",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  MetaLeft: "Win",
  MetaRight: "Win"
};
function hotkeyLabel(spec) {
  return spec.split("+").map((code) => CODE_LABELS[code] ?? code).join(" + ");
}
var CHARS_BY_CODE = {
  Backquote: ["`", "~", "\xB7"],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Digit0: ["0", ")"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Space: [" "]
};
var MIN_SECONDS = 0.4;
var PREPARE_TIMEOUT_MS = 30 * 60 * 1e3;
function mergeDraft(current, text) {
  if (current === "") return text;
  return current + (current.endsWith(" ") ? "" : " ") + text;
}
function MicIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "9", y: "3", width: "6", height: "11", rx: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 11a7 7 0 0 0 14 0" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "18", x2: "12", y2: "21" })
  ] });
}
function MicButton({ inputActions, useInput, t, maxSeconds, hotkey }) {
  const [phase, setPhase] = (0, import_react.useState)("idle");
  const [seconds, setSeconds] = (0, import_react.useState)(0);
  const [error, setError] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)(null);
  const [ready, setReady] = (0, import_react.useState)(true);
  const draft = useInput((s) => s.draft);
  (0, import_react.useEffect)(() => {
    let live = true;
    void fetchStatus().then((state) => {
      if (live && state !== null) setReady(state.ready);
    });
    return () => {
      live = false;
    };
  }, []);
  const capSeconds = typeof maxSeconds === "number" && Number.isFinite(maxSeconds) ? Math.max(0, Math.floor(maxSeconds)) : DEFAULT_MAX_SECONDS;
  const hotkeySpec = hotkey !== void 0 ? hotkey : DEFAULT_HOTKEY;
  const specParts = hotkeySpec === null ? [] : hotkeySpec.split("+").map((code) => code.trim()).filter((code) => code !== "");
  const osModifierProp = specParts.length > 1 ? OS_MODIFIER_PROP[specParts[0] ?? ""] : void 0;
  const triggerCodes = specParts.length === 1 || osModifierProp === void 0 ? specParts : specParts.slice(1);
  const isOsChord = osModifierProp !== void 0 && specParts.length > 1;
  const hotkeyCodes = specParts;
  const draftRef = (0, import_react.useRef)(draft);
  draftRef.current = draft;
  const recorderRef = (0, import_react.useRef)(null);
  const pressIdRef = (0, import_react.useRef)(0);
  const releasedRef = (0, import_react.useRef)(false);
  const pointerHandledRef = (0, import_react.useRef)(false);
  const phaseRef = (0, import_react.useRef)("idle");
  phaseRef.current = phase;
  const hotkeyHeldRef = (0, import_react.useRef)(false);
  const mountedRef = (0, import_react.useRef)(true);
  const requestRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++pressIdRef.current;
      releasedRef.current = true;
      requestRef.current?.abort();
      void recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, []);
  const fail = (message) => {
    if (!mountedRef.current) return;
    phaseRef.current = "idle";
    setPhase("idle");
    setSeconds(0);
    setError(message);
  };
  function beginPress() {
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "recording";
    setError(null);
    const pressId = ++pressIdRef.current;
    releasedRef.current = false;
    setPhase("recording");
    setSeconds(0);
    void createRecorder({ maxSeconds: capSeconds, onDuration: setSeconds }).then((recorder) => {
      if (pressIdRef.current !== pressId || releasedRef.current) {
        void recorder.stop().then(() => {
        });
        if (pressIdRef.current === pressId) setPhase("idle");
        return;
      }
      recorderRef.current = recorder;
      void recorder.done.then((result) => {
        if (!mountedRef.current || pressIdRef.current !== pressId) return;
        recorderRef.current = null;
        settle(result.blob, result.seconds);
      });
    }).catch(() => {
      if (pressIdRef.current === pressId) fail(t("voice.error.mic"));
    });
  }
  function endPress() {
    const recorder = recorderRef.current;
    releasedRef.current = true;
    if (recorder === null) return;
    recorderRef.current = null;
    void recorder.stop();
  }
  const settle = (blob, resultSeconds) => {
    if (!mountedRef.current) return;
    if (resultSeconds < MIN_SECONDS) {
      fail(t("voice.error.short"));
      return;
    }
    setPhase("processing");
    phaseRef.current = "processing";
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus(null);
    void (async () => {
      try {
        let result = await requestTranscription(blob, controller.signal);
        if (!result.ok && result.provisioning) {
          setStatus({ percent: 0, label: "" });
          const becameReady = await waitUntilReady(
            (percent, label) => setStatus({ percent, label }),
            PREPARE_TIMEOUT_MS,
            controller.signal
          );
          setStatus(null);
          if (!becameReady) {
            fail(t("voice.error.bridge"));
            return;
          }
          setReady(true);
          result = await requestTranscription(blob, controller.signal);
        }
        if (!result.ok) {
          fail(result.message !== "" ? t("voice.error.engine", { message: result.message }) : t("voice.error.bridge"));
          return;
        }
        const text = result.text.trim();
        if (text === "") {
          fail(t("voice.silent"));
          return;
        }
        if (!mountedRef.current || controller.signal.aborted) return;
        inputActions.setDraft(mergeDraft(draftRef.current, text));
        phaseRef.current = "idle";
        setPhase("idle");
        setSeconds(0);
      } catch {
        fail(t("voice.error.bridge"));
      }
    })();
  };
  const pressActionsRef = (0, import_react.useRef)({ begin: beginPress, end: endPress });
  pressActionsRef.current = { begin: beginPress, end: endPress };
  (0, import_react.useEffect)(() => {
    if (hotkeyCodes.length === 0 || triggerCodes.length === 0) return;
    const modifierProp = osModifierProp;
    const usable = (event) => {
      if (event.isComposing) return false;
      if (modifierProp !== void 0) {
        if (modifierProp !== "altKey" && event.altKey) return false;
        if (modifierProp !== "ctrlKey" && event.ctrlKey) return false;
        if (modifierProp !== "shiftKey" && event.shiftKey) return false;
        if (modifierProp !== "metaKey" && event.metaKey) return false;
      } else if (event.altKey || event.ctrlKey || event.metaKey) {
        return false;
      }
      return true;
    };
    const held = /* @__PURE__ */ new Set();
    let active = false;
    let osModDown = false;
    const modDown = () => modifierProp !== void 0 ? osModDown : held.has(hotkeyCodes[0] ?? "");
    const gestureComplete = () => triggerCodes.every((code) => held.has(code)) && modDown();
    let lockedElement = null;
    let lockedPrevious = null;
    const isEditable = (el) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "TEXTAREA" || tag === "INPUT" || el.isContentEditable;
    };
    const applyLock = () => {
      const el = document.activeElement;
      if (lockedElement === el) return;
      releaseLock();
      if (!isEditable(el)) return;
      lockedElement = el;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") {
        const field = el;
        lockedPrevious = field.readOnly;
        field.readOnly = true;
      } else {
        lockedPrevious = el.contentEditable;
        el.contentEditable = "false";
      }
    };
    const releaseLock = () => {
      const el = lockedElement;
      lockedElement = null;
      if (el === null) return;
      try {
        const tag = el.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") {
          el.readOnly = lockedPrevious === true;
        } else {
          el.contentEditable = typeof lockedPrevious === "string" ? lockedPrevious : "true";
        }
      } catch {
      }
      lockedPrevious = null;
    };
    const armed = () => active || modDown();
    const activate = () => {
      if (active || phaseRef.current !== "idle") return;
      active = true;
      hotkeyHeldRef.current = true;
      applyLock();
      pressActionsRef.current.begin();
    };
    const deactivate = (event) => {
      if (!active) return;
      active = false;
      hotkeyHeldRef.current = false;
      event?.preventDefault();
      pressActionsRef.current.end();
    };
    const onKeyDown = (event) => {
      if (!hotkeyCodes.includes(event.code) || !usable(event)) return;
      if (phaseRef.current === "processing") return;
      if (modifierProp !== void 0 && event[modifierProp]) osModDown = true;
      const isOsModifierKey = modifierProp !== void 0 && event.code === hotkeyCodes[0];
      if (isOsModifierKey) {
        return;
      }
      if (event.repeat) {
        if (armed()) event.preventDefault();
        return;
      }
      if (hotkeyCodes.length > 1 && !modifierProp && event.code === hotkeyCodes[0]) {
        held.add(event.code);
        event.preventDefault();
        applyLock();
        if (gestureComplete()) activate();
        return;
      }
      if (armed()) {
        held.add(event.code);
        event.preventDefault();
        applyLock();
        if (gestureComplete()) activate();
        return;
      }
      if (hotkeyCodes.length === 1) {
        held.add(event.code);
        event.preventDefault();
        applyLock();
        if (!event.repeat) activate();
      }
    };
    const onKeyUp = (event) => {
      if (!hotkeyCodes.includes(event.code)) return;
      if (modifierProp !== void 0 && !event[modifierProp]) osModDown = false;
      held.delete(event.code);
      if (event.code === hotkeyCodes[0] && hotkeyCodes.length > 1) {
        if (active) deactivate(event);
      } else if (active) {
        deactivate(event);
      }
      if (held.size === 0 && !osModDown) releaseLock();
    };
    const onBlur = () => {
      deactivate();
      releaseLock();
      osModDown = false;
      held.clear();
    };
    const onFocusIn = () => {
      if (armed()) applyLock();
    };
    const onBeforeInput = (event) => {
      if (!armed()) return;
      const inputType = event.inputType ?? "";
      const isComposition = inputType.startsWith("insertComposition") || inputType === "insertFromComposition";
      const data = event.data;
      if (typeof data !== "string" || data === "") return;
      const blocked = /* @__PURE__ */ new Set();
      for (const code of triggerCodes) {
        for (const char of CHARS_BY_CODE[code] ?? []) blocked.add(char);
      }
      const match = isComposition ? ["\xB7", "`", "~"].some((char) => data.includes(char)) : data.split("").some((char) => blocked.has(char));
      if (match) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("blur", onBlur);
      releaseLock();
    };
  }, [hotkeyCodes.join("+"), triggerCodes.join("+"), osModifierProp]);
  const onPointerDown = (event) => {
    if (phase !== "idle") return;
    pointerHandledRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginPress();
  };
  const onPointerUp = () => {
    pointerHandledRef.current = true;
    endPress();
  };
  const onClick = () => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    if (phase === "recording") endPress();
    else if (phase === "idle") beginPress();
  };
  const recording = phase === "recording";
  const idleLabel = ready ? hotkeyCodes.length > 0 ? `${t("voice.button")}${t("voice.hotkey", { key: hotkeyLabel(hotkeyCodes.join("+")) })}` : t("voice.button") : t("voice.notReady");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: recording ? t("voice.recording") : phase === "processing" ? t("voice.processing") : idleLabel, side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-vi-button",
        "data-recording": recording || void 0,
        "aria-label": recording ? t("voice.recording") : t("voice.button"),
        "aria-pressed": recording,
        disabled: phase === "processing",
        onPointerDown,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onClick,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicIcon, {})
      }
    ) }),
    recording && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-vi-status", "data-tone": "recording", "aria-live": "polite", children: t("voice.listening", { seconds: Math.round(seconds) }) }),
    phase === "processing" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "span",
      {
        className: "dsh-vi-status",
        "data-tone": "processing",
        "aria-live": "polite",
        title: status !== null && status.label !== "" ? status.label : void 0,
        children: status === null ? t("voice.processing") : t("voice.preparing", { percent: status.percent })
      }
    ),
    phase === "idle" && error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-vi-status", "data-tone": "error", title: error, role: "alert", children: error })
  ] });
}

// src/client.tsx
var inject = ["slots", "locale"];
function apply(ctx, rawConfig) {
  ctx.effect(() => injectCss(), `${NS}: styles`);
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`);
  const config = rawConfig ?? {};
  const maxSeconds = typeof config.maxSeconds === "number" && Number.isFinite(config.maxSeconds) ? Math.max(0, Math.floor(config.maxSeconds)) : void 0;
  const hotkey = normalizeHotkey(typeof config.hotkey === "string" ? config.hotkey : void 0);
  const guarded = (label, register) => {
    try {
      return register();
    } catch (err) {
      console.warn(`[dsh-plugin-voice-input] slot "${label}" registration failed; that UI seat stays absent:`, err);
      return () => {
      };
    }
  };
  ctx.slots.inject("conversation.input.left", () => guarded(
    "conversation.input.left",
    () => ctx.slots.register({
      name: "conversation.input.left",
      id: "voice-input-button",
      order: 10,
      locale: NS,
      inject: () => ({
        ...maxSeconds !== void 0 ? { maxSeconds } : {},
        ...hotkey !== null ? { hotkey } : { hotkey: null }
      })
    }, MicButton)
  ));
}
return module.exports; } });
