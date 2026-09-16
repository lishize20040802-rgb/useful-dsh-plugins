// src/index.ts
import z from "@deepseek-ai/schemastery";
import { expandHomePath, resolveDshHome as resolveDshHome2 } from "@deepseek-ai/dsh-home-paths";
import { resolve } from "node:path";

// src/local.ts
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
var TARGET_RATE = 16e3;
function parseWavHeader(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("invalid audio: not a RIFF/WAVE file");
  }
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) throw new Error("invalid audio: truncated WAV chunk");
    if (id === "fmt ") {
      if (size < 16) throw new Error("invalid audio: truncated format chunk");
      format = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bits = buffer.readUInt16LE(offset + 22);
    }
    if (id === "data") {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + size % 2;
  }
  if (dataOffset < 0) throw new Error("invalid audio: missing data chunk");
  if (format !== 1) throw new Error("unsupported audio: PCM WAV expected");
  if (channels < 1 || channels > 32) throw new Error("unsupported audio: invalid channel count");
  if (sampleRate < 8e3 || sampleRate > 192e3) throw new Error("unsupported audio: sample rate must be 8000..192000 Hz");
  return { channels, sampleRate, bits, dataOffset, dataLength };
}
function encodePcm16(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2);
  return buffer;
}
function resample(samples, from, to) {
  const length = Math.max(1, Math.round(samples.length * to / from));
  const out = new Int16Array(length);
  const ratio = (samples.length - 1) / Math.max(1, length - 1);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const weight = position - left;
    out[i] = Math.round((samples[left] ?? 0) * (1 - weight) + (samples[right] ?? 0) * weight);
  }
  return out;
}
function normalizeWav(buffer) {
  const header = parseWavHeader(buffer);
  if (header.bits !== 16) {
    throw new Error(`unsupported audio: ${header.bits}-bit samples (16-bit PCM expected)`);
  }
  if (header.channels < 1) throw new Error("unsupported audio: zero channels");
  const available = Math.max(0, Math.min(header.dataLength, buffer.length - header.dataOffset));
  const frames = Math.floor(available / 2 / header.channels);
  if (frames === 0) throw new Error("invalid audio: no PCM samples");
  const mono = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < header.channels; channel++) {
      sum += buffer.readInt16LE(header.dataOffset + (frame * header.channels + channel) * 2);
    }
    mono[frame] = Math.max(-32768, Math.min(32767, Math.round(sum / header.channels)));
  }
  const samples = header.sampleRate === TARGET_RATE ? mono : resample(mono, header.sampleRate, TARGET_RATE);
  return encodePcm16(samples, TARGET_RATE);
}
function runtimePaths(dir) {
  const modelDir = join(dir, "models", "sense-voice");
  return {
    dir,
    engineDir: join(dir, "bin"),
    exePath: join(dir, "bin", "sherpa-onnx-offline.exe"),
    modelDir,
    modelPath: join(modelDir, "model.int8.onnx"),
    tokensPath: join(modelDir, "tokens.txt")
  };
}
function buildArgs(wavPath, options) {
  const args = [
    `--tokens=${options.tokensPath}`,
    `--sense-voice-model=${options.modelPath}`,
    `--sense-voice-use-itn=${options.itn ? "true" : "false"}`,
    `--num-threads=${options.threads}`,
    "--print-args=false"
  ];
  const language = options.language.trim().toLowerCase();
  if (language !== "" && language !== "auto") args.push(`--sense-voice-language=${language}`);
  args.push(wavPath);
  return args;
}
function parseResult(stdout) {
  let text = "";
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.text === "string" && parsed.text !== "") text = parsed.text;
    } catch {
    }
  }
  return text.trim();
}
function engineMissing(exePath, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (cause?.code === "ENOENT") {
    return new Error(`\u672C\u5730\u8BC6\u522B\u5F15\u64CE\u4E0D\u5B58\u5728\uFF1A${exePath}\uFF08\u9996\u6B21\u4F7F\u7528\u8BF7\u5728\u63D2\u4EF6\u76EE\u5F55\u8FD0\u884C npm run setup:local\uFF0C\u6216\u5728\u914D\u7F6E\u91CC\u6307\u5B9A runtimeDir\uFF09`);
  }
  return new Error(`\u672C\u5730\u8BC6\u522B\u5F15\u64CE\u65E0\u6CD5\u542F\u52A8\uFF1A${detail}`);
}
function engineFailure(stderr, code) {
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.includes("parse-options.cc") && !line.startsWith("At line:"));
  const detail = lines.slice(-3).join(" ").slice(0, 300);
  return detail === "" ? `\u672C\u5730\u8BC6\u522B\u5F15\u64CE\u5F02\u5E38\u9000\u51FA\uFF08exit ${code}\uFF09` : `\u672C\u5730\u8BC6\u522B\u5931\u8D25\uFF1A${detail}`;
}
function exited(child, budgetMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve2) => {
    const timer = setTimeout(resolve2, budgetMs);
    child.once("close", () => {
      clearTimeout(timer);
      resolve2();
    });
  });
}
async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`[dsh-plugin-voice-input] \u4E34\u65F6\u97F3\u9891\u76EE\u5F55\u5220\u9664\u5931\u8D25\uFF0C\u53EF\u624B\u52A8\u5220\u9664\uFF1A${dir}`, err instanceof Error ? err.message : err);
        return;
      }
      await new Promise((resolve2) => setTimeout(resolve2, 200));
    }
  }
}
function runEngine(exePath, args, timeoutMs) {
  return new Promise((resolve2, reject) => {
    let child;
    try {
      child = spawn(exePath, args, { windowsHide: true });
    } catch (err) {
      reject(engineMissing(exePath, err));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        await exited(child, 2e3);
        reject(new Error(`\u672C\u5730\u8BC6\u522B\u8D85\u65F6\uFF08\u8D85\u8FC7 ${Math.round(timeoutMs / 1e3)} \u79D2\uFF09`));
      })();
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(engineMissing(exePath, err));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve2({ stdout, stderr, code });
    });
  });
}
async function transcribeLocal(wav, options) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-voice-input-"));
  const wavPath = join(dir, "clip.wav");
  try {
    await writeFile(wavPath, normalizeWav(wav));
    const started = Date.now();
    const { stdout, stderr, code } = await runEngine(options.exePath, buildArgs(wavPath, options), options.timeoutMs);
    const ms = Date.now() - started;
    if (code !== 0) throw new Error(engineFailure(stderr, code));
    return { text: parseResult(stdout), ms };
  } finally {
    await removeTempDir(dir);
  }
}
function resolveThreads(configured) {
  if (Number.isFinite(configured) && configured > 0) return Math.min(64, Math.max(1, Math.floor(configured)));
  const cores = Number(process.env.NUMBER_OF_PROCESSORS ?? 0) || 4;
  return Math.max(2, Math.min(8, Math.floor(cores / 2)));
}
var SerialQueue = class {
  tail = Promise.resolve();
  run(task) {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
};

// src/provision.ts
import { spawn as spawn2, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, rename, rm as rm2, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { join as join2 } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { URL } from "node:url";
import { pipeline } from "node:stream/promises";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
var ENGINE_VERSION = "1.13.8";
var ENGINE_ARCHIVE = `sherpa-onnx-v${ENGINE_VERSION}-win-x64-shared-MD-Release-no-tts.tar.bz2`;
var ENGINE_ARCHIVE_ROOT = `sherpa-onnx-v${ENGINE_VERSION}-win-x64-shared-MD-Release-no-tts`;
var ENGINE_BYTES = 19164933;
var ENGINE_URLS = [
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${ENGINE_VERSION}/${ENGINE_ARCHIVE}`
];
var MODEL_REPO = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
var MODEL_HOSTS = [
  `https://huggingface.co/${MODEL_REPO}/resolve/main`,
  `https://hf-mirror.com/${MODEL_REPO}/resolve/main`
];
var MODEL_RELEASE_BASE_URL = "https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/voice-model-sensevoice-2024-07-17";
var MODEL_FILES = [
  { name: "model.int8.onnx", bytes: 239233841, sha256: "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51" },
  { name: "tokens.txt", bytes: 315894, sha256: "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc" }
];
function modelDownloadUrls(name2, configured = "") {
  const base = (configured.trim() || process.env.DSH_VOICE_MODEL_BASE_URL || MODEL_RELEASE_BASE_URL).replace(/\/$/, "");
  if (base && new URL(base).protocol !== "https:") throw new Error("modelBaseUrl must use HTTPS");
  return [...base ? [`${base}/${name2}`] : [], ...MODEL_HOSTS.map((host) => `${host}/${name2}`)];
}
async function fileSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
var TOTAL_BYTES = ENGINE_BYTES + MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0);
var states = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
function existingBytes(paths) {
  let total = 0;
  for (const path of [paths.exePath, paths.modelPath, paths.tokensPath]) {
    try {
      total += statSync(path).size;
    } catch {
    }
  }
  return total;
}
function inspectRuntime(paths) {
  const missing = [];
  try {
    if (statSync(paths.exePath).size < 1024 * 1024) missing.push(paths.exePath);
  } catch {
    missing.push(paths.exePath);
  }
  for (const path of [paths.modelPath, paths.tokensPath, join2(paths.engineDir, "onnxruntime.dll"), join2(paths.engineDir, "onnxruntime_providers_shared.dll")]) {
    try {
      if (statSync(path).size === 0) missing.push(path);
    } catch {
      missing.push(path);
    }
  }
  return { ready: missing.length === 0, missing, bytes: existingBytes(paths) };
}
function defaultRuntimeDir() {
  const home = resolveDshHome();
  const legacy = join2(home, "voice-input");
  try {
    if (statSync(legacy).isDirectory()) return legacy;
  } catch {
  }
  return join2(home, "third-party", "data", "voice-input");
}
function systemProxy() {
  if (process.platform !== "win32") return "";
  try {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const result = spawnSync("reg", ["query", key], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0 || typeof result.stdout !== "string") return "";
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(result.stdout);
    const match = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(result.stdout);
    if (!enabled || match === null) return "";
    const server = (match[1] ?? "").trim();
    if (server === "") return "";
    const first = server.split(";")[0] ?? "";
    const host = (first.includes("=") ? first.split("=").slice(1).join("=") : first).trim();
    if (host === "") return "";
    return /^https?:\/\//i.test(host) ? host : `http://${host}`;
  } catch {
    return "";
  }
}
function resolveProxy(configured) {
  const explicit = (configured ?? "").trim();
  if (explicit !== "") return explicit;
  for (const name2 of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    const value = (process.env[name2] ?? "").trim();
    if (value !== "") return value;
  }
  return systemProxy();
}
async function openResponse(url, proxy, headers, redirects = 0) {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("download URL must use HTTPS");
  const response = await new Promise((resolve2, reject) => {
    const onResponse = (res) => resolve2({ status: res.statusCode ?? 0, headers: res.headers, stream: res });
    const onError = (err) => reject(err);
    if (proxy === "") {
      const req = https.request(
        {
          host: target.hostname,
          port: target.port === "" ? 443 : Number(target.port),
          path: `${target.pathname}${target.search}`,
          method: "GET",
          headers
        },
        onResponse
      );
      req.on("error", onError);
      req.setTimeout(3e4, () => req.destroy(new Error("download timed out")));
      req.end();
      return;
    }
    const proxyUrl = new URL(/^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`);
    if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
      reject(new Error("download proxy must use HTTP or HTTPS"));
      return;
    }
    const proxyHeaders = {};
    if (proxyUrl.username !== "") {
      const raw = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
      proxyHeaders["proxy-authorization"] = `Basic ${Buffer.from(raw).toString("base64")}`;
    }
    const connectReq = (proxyUrl.protocol === "https:" ? https : http).request({
      host: proxyUrl.hostname,
      port: proxyUrl.port === "" ? proxyUrl.protocol === "https:" ? 443 : 80 : Number(proxyUrl.port),
      method: "CONNECT",
      path: `${target.hostname}:${target.port === "" ? 443 : target.port}`,
      headers: proxyHeaders
    });
    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`proxy refused CONNECT (${res.statusCode})`));
        return;
      }
      const tlsSocket = tlsConnect({ socket, servername: target.hostname }, () => {
        const req = https.request(
          {
            host: target.hostname,
            port: target.port === "" ? 443 : Number(target.port),
            path: `${target.pathname}${target.search}`,
            method: "GET",
            headers,
            agent: false,
            createConnection: () => tlsSocket
          },
          onResponse
        );
        req.on("error", onError);
        req.setTimeout(3e4, () => req.destroy(new Error("download timed out")));
        req.end();
      });
      tlsSocket.on("error", onError);
    });
    connectReq.on("error", onError);
    connectReq.setTimeout(3e4, () => connectReq.destroy(new Error("proxy connection timed out")));
    connectReq.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    response.stream.resume();
    if (redirects >= 5 || !response.headers.location) throw new Error("invalid or excessive download redirects");
    return openResponse(new URL(response.headers.location, target).href, proxy, headers, redirects + 1);
  }
  return response;
}
async function fetchOne(url, dest, options) {
  const part = `${dest}.part`;
  let start = 0;
  try {
    start = (await stat(part)).size;
  } catch {
    start = 0;
  }
  const headers = { "user-agent": "dsh-plugin-voice-input" };
  if (start > 0) headers.range = `bytes=${start}-`;
  const response = await openResponse(url, options.proxy, headers);
  if (response.status === 416) {
    response.stream.resume();
    await rm2(part, { force: true });
    throw new Error("range not satisfiable \u2014 restarting this file");
  }
  if (response.status !== 200 && response.status !== 206) {
    response.stream.resume();
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  }
  const restart = response.status === 200 && start > 0;
  if (response.status === 206 && !String(response.headers["content-range"]).startsWith(`bytes ${start}-`)) {
    response.stream.resume();
    await rm2(part, { force: true });
    throw new Error("invalid download range");
  }
  const receivedFrom = restart ? 0 : start;
  const declared = Number(response.headers["content-length"] ?? 0) + receivedFrom;
  const total = options.expected > 0 ? options.expected : declared;
  const sink = createWriteStream(part, restart ? { flags: "w" } : { flags: "a" });
  let received = receivedFrom;
  let lastReport = 0;
  response.stream.on("data", (chunk) => {
    received += chunk.length;
    if (options.expected > 0 && received > options.expected) {
      response.stream.destroy(new Error("download exceeds expected size"));
      return;
    }
    const now = Date.now();
    if (now - lastReport > 300) {
      lastReport = now;
      options.onProgress?.({ received, total });
    }
  });
  await pipeline(response.stream, sink);
  options.onProgress?.({ received, total });
  if (options.expected > 0 && received !== options.expected) {
    throw new Error(`size mismatch: expected ${options.expected} bytes, got ${received}`);
  }
  if (options.sha256 && await fileSha256(part) !== options.sha256) {
    await rm2(part, { force: true });
    throw new Error("download SHA-256 mismatch");
  }
  await rename(part, dest);
}
async function downloadFile(urls, dest, options) {
  const expected = options.expected ?? 0;
  if (expected > 0) {
    try {
      if ((await stat(dest)).size === expected && (!options.sha256 || await fileSha256(dest) === options.sha256)) {
        options.onProgress?.({ received: expected, total: expected });
        return;
      }
    } catch {
    }
  }
  await mkdir(join2(dest, ".."), { recursive: true }).catch(() => {
  });
  const failures = [];
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await fetchOne(url, dest, { proxy: options.proxy ?? "", expected, sha256: options.sha256, onProgress: options.onProgress });
        return;
      } catch (err) {
        failures.push(`${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  throw new Error(`\u4E0B\u8F7D\u5931\u8D25\uFF08\u5DF2\u5C1D\u8BD5 ${urls.length} \u4E2A\u6E90\uFF09\uFF1A${failures.slice(-3).join(" | ")}`);
}
async function extractArchive(archive, destDir) {
  await mkdir(destDir, { recursive: true });
  await new Promise((resolve2, reject) => {
    const child = spawn2("tar", ["-xjf", archive, "-C", destDir], { windowsHide: true });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => reject(new Error(`\u65E0\u6CD5\u8C03\u7528 tar \u89E3\u538B\uFF1A${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve2();
      else reject(new Error(`\u89E3\u538B\u5931\u8D25\uFF08tar exit ${code}\uFF09\uFF1A${stderr.trim().slice(0, 200)}`));
    });
  });
}
function runtimeState(dir) {
  return states.get(dir) ?? {
    active: false,
    phase: "idle",
    label: "",
    received: 0,
    total: TOTAL_BYTES,
    error: "",
    startedAt: 0,
    finishedAt: 0
  };
}
function update(dir, patch) {
  const current = runtimeState(dir);
  states.set(dir, { ...current, ...patch });
}
function ensureRuntime(options) {
  const paths = runtimePaths(options.dir);
  if (options.force !== true && inspectRuntime(paths).ready) {
    update(options.dir, { active: false, phase: "done", label: "\u672C\u5730\u5F15\u64CE\u5DF2\u5C31\u7EEA", received: TOTAL_BYTES, total: TOTAL_BYTES, error: "" });
    return Promise.resolve(paths);
  }
  if (process.platform !== "win32" || process.arch !== "x64") {
    return Promise.reject(new Error("Automatic runtime setup currently supports Windows x64 only."));
  }
  const running = inflight.get(options.dir);
  if (running !== void 0) return running;
  const task = (async () => {
    const proxy = resolveProxy(options.proxy);
    update(options.dir, { active: true, phase: "engine", label: "\u51C6\u5907\u672C\u5730\u8BC6\u522B\u5F15\u64CE", received: 0, total: TOTAL_BYTES, error: "", startedAt: Date.now(), finishedAt: 0 });
    const cache = join2(options.dir, ".cache");
    await mkdir(cache, { recursive: true });
    try {
      const engineMissing2 = inspectRuntime(paths).missing.some((path) => path.startsWith(paths.engineDir));
      if (engineMissing2 || options.force === true) {
        const archive = join2(cache, ENGINE_ARCHIVE);
        await downloadFile(ENGINE_URLS, archive, {
          proxy,
          expected: ENGINE_BYTES,
          onProgress: ({ received }) => update(options.dir, { phase: "engine", label: "\u4E0B\u8F7D\u672C\u5730\u8BC6\u522B\u5F15\u64CE", received })
        });
        update(options.dir, { phase: "engine", label: "\u89E3\u538B\u672C\u5730\u8BC6\u522B\u5F15\u64CE", received: ENGINE_BYTES });
        const staging = join2(cache, "engine");
        await rm2(staging, { recursive: true, force: true });
        await extractArchive(archive, staging);
        await rm2(paths.engineDir, { recursive: true, force: true });
        await mkdir(join2(options.dir), { recursive: true });
        await rename(join2(staging, ENGINE_ARCHIVE_ROOT, "bin"), paths.engineDir);
        await rm2(staging, { recursive: true, force: true });
        await rm2(archive, { force: true }).catch(() => {
        });
      }
      await mkdir(paths.modelDir, { recursive: true });
      let modelBytes = 0;
      for (const file of MODEL_FILES) {
        await downloadFile(
          modelDownloadUrls(file.name, options.modelBaseUrl),
          join2(paths.modelDir, file.name),
          {
            proxy,
            expected: file.bytes,
            sha256: file.sha256,
            onProgress: ({ received }) => update(options.dir, { phase: "model", label: "\u4E0B\u8F7D\u4E2D\u6587\u8BED\u97F3\u6A21\u578B", received: ENGINE_BYTES + modelBytes + received })
          }
        );
        modelBytes += file.bytes;
      }
      update(options.dir, { phase: "verify", label: "\u6821\u9A8C\u672C\u5730\u5F15\u64CE", received: TOTAL_BYTES });
      const inspection = inspectRuntime(paths);
      if (!inspection.ready) {
        throw new Error(`\u8FD0\u884C\u65F6\u4ECD\u4E0D\u5B8C\u6574\uFF1A\u7F3A\u5C11 ${inspection.missing.join("\u3001")}`);
      }
      update(options.dir, { active: false, phase: "done", label: "\u672C\u5730\u5F15\u64CE\u5DF2\u5C31\u7EEA", received: TOTAL_BYTES, total: TOTAL_BYTES, finishedAt: Date.now() });
      return paths;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      update(options.dir, { active: false, phase: "failed", label: "\u672C\u5730\u5F15\u64CE\u51C6\u5907\u5931\u8D25", error: detail, finishedAt: Date.now() });
      throw err;
    } finally {
      inflight.delete(options.dir);
    }
  })();
  inflight.set(options.dir, task);
  return task;
}

// src/index.ts
var name = "voice-input";
var inject = ["webServer"];
var FALLBACK_RUNTIME_DIR = defaultRuntimeDir();
var DEFAULT_TIMEOUT_MS = 12e4;
var DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
var Config = z.object({
  /** Runtime root; empty selects the third-party data directory or existing legacy directory. */
  runtimeDir: z.string().default(""),
  /** Advanced: use an engine CLI from somewhere else. */
  exePath: z.string().default(""),
  /** Advanced: use a model file from somewhere else. */
  modelPath: z.string().default(""),
  /** Advanced: use a token table from somewhere else. */
  tokensPath: z.string().default(""),
  /** SenseVoice language: auto | zh | en | ja | ko | yue. */
  language: z.string().default("zh"),
  /** Inverse text normalization (十点 → 10点). */
  itn: z.boolean().default(true),
  /** CPU threads for the ONNX session; 0 = auto (half the cores, 2…8). */
  threads: z.number().default(0),
  /** Fetch the engine and model on first use when they are missing. */
  autoProvision: z.boolean().default(true),
  /** Proxy for the first-run download; empty = HTTPS_PROXY or the Windows system proxy. */
  proxy: z.string().default(""),
  modelBaseUrl: z.string().default(""),
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
});
var LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function createAsrHandler(options) {
  const inspect = options.inspect ?? (() => inspectRuntime(options.engine));
  const state = options.state ?? (() => runtimeState(options.engine.dir));
  const transcribe = options.transcribe ?? ((audio) => options.queue.run(async () => (await transcribeLocal(audio, options.engine)).text));
  return async (req, res) => {
    const peer = req.socket?.remoteAddress;
    if (peer !== "127.0.0.1" && peer !== "::1" && peer !== "::ffff:127.0.0.1") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "forbidden: non-loopback peer" } }));
      return;
    }
    const host = String(req.headers?.host ?? "");
    if (!LOOPBACK_HOST.test(host)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "forbidden: non-loopback host" } }));
      return;
    }
    const origin = req.headers?.origin;
    if (origin !== void 0) {
      const scheme = req.socket?.encrypted ? "https" : "http";
      if (origin !== `${scheme}://${host}`) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "forbidden: cross-origin" } }));
        return;
      }
    }
    const secFetchSite = req.headers?.["sec-fetch-site"];
    if (secFetchSite !== void 0 && secFetchSite !== "same-origin" && secFetchSite !== "none") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "forbidden: cross-site" } }));
      return;
    }
    if (req.method === "GET") {
      const inspection2 = inspect();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        backend: "local",
        engine: "sense-voice",
        ready: inspection2.ready,
        runtimeDir: options.engine.dir,
        missing: inspection2.missing.map((path) => path.replace(/^.*[\\/]/, "")),
        downloadBytes: TOTAL_BYTES,
        provisioning: state()
      }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "GET, POST" });
      res.end("method not allowed");
      return;
    }
    const inspection = inspect();
    if (!inspection.ready) {
      if (options.autoProvision && options.ensure !== void 0) {
        void options.ensure().catch((err) => {
          console.error("[dsh-plugin-voice-input] runtime preparation failed:", err instanceof Error ? err.message : err);
        });
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: {
            message: `\u672C\u5730\u8BC6\u522B\u5F15\u64CE\u5C1A\u672A\u5C31\u7EEA\uFF0C\u6B63\u5728\u9996\u6B21\u4E0B\u8F7D\uFF08\u7EA6 ${Math.round(TOTAL_BYTES / 1024 / 1024)} MB\uFF0C\u53EA\u4E0B\u8F7D\u4E00\u6B21\uFF09\u3002\u8FDB\u5EA6\u5728\u8F93\u5165\u6846\u65C1\u663E\u793A\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u7EE7\u7EED\u3002`
          },
          provisioning: true,
          runtimeDir: options.engine.dir
        }));
        return;
      }
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({
        error: {
          message: `\u672C\u5730\u8BC6\u522B\u5F15\u64CE\u672A\u5C31\u7EEA\uFF1A\u7F3A\u5C11 ${inspection.missing.map((path) => path.replace(/^.*[\\/]/, "")).join("\u3001")}\u3002\u8BF7\u5728\u8BE5\u63D2\u4EF6\u76EE\u5F55\u8FD0\u884C npm run setup:local\uFF0C\u6216\u5728\u914D\u7F6E\u91CC\u6253\u5F00 autoProvision\u3002`
        }
      }));
      return;
    }
    const declared = Number(req.headers?.["content-length"]);
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      res.writeHead(413);
      res.end("payload too large");
      return;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > options.maxBytes) {
        res.writeHead(413);
        res.end("payload too large");
        return;
      }
      chunks.push(buf);
    }
    if (total === 0) {
      res.writeHead(400);
      res.end("empty body");
      return;
    }
    const audio = Buffer.concat(chunks);
    let text;
    try {
      text = (await transcribe(audio)).trim();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[dsh-plugin-voice-input] local transcription failed:", detail);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: detail } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text }));
  };
}
function resolveEngine(config) {
  const home = resolveDshHome2();
  const configuredPath = (value, fallback) => value.trim() === "" ? fallback : resolve(home, expandHomePath(value.trim()));
  const dir = configuredPath(config.runtimeDir, defaultRuntimeDir());
  const paths = runtimePaths(dir);
  return {
    ...paths,
    exePath: configuredPath(config.exePath, paths.exePath),
    modelPath: configuredPath(config.modelPath, paths.modelPath),
    tokensPath: configuredPath(config.tokensPath, paths.tokensPath),
    threads: resolveThreads(config.threads),
    language: config.language,
    itn: config.itn,
    timeoutMs: config.timeoutMs
  };
}
function apply(ctx, config) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error("voice-input: maxBytes must be a positive integer");
  }
  if (config.timeoutMs < 5e3) {
    throw new Error("voice-input: timeoutMs must be at least 5000");
  }
  const engine = resolveEngine(config);
  const queue = new SerialQueue();
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: "exact",
        path: "/api/asr",
        handler: createAsrHandler({
          engine,
          maxBytes: config.maxBytes,
          autoProvision: config.autoProvision,
          queue,
          ensure: () => ensureRuntime({ dir: engine.dir, proxy: config.proxy, modelBaseUrl: config.modelBaseUrl })
        })
      });
    } catch (err) {
      console.error("[dsh-plugin-voice-input] /api/asr route registration failed (another plugin may own it); voice input will report an HTTP error:", err);
      return () => {
      };
    }
  });
}
export {
  Config,
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  ENGINE_BYTES,
  ENGINE_URLS,
  FALLBACK_RUNTIME_DIR,
  MODEL_FILES,
  MODEL_HOSTS,
  SerialQueue,
  TOTAL_BYTES,
  apply,
  buildArgs,
  createAsrHandler,
  defaultRuntimeDir,
  downloadFile,
  ensureRuntime,
  extractArchive,
  fileSha256,
  inject,
  inspectRuntime,
  modelDownloadUrls,
  name,
  normalizeWav,
  openResponse,
  parseResult,
  parseWavHeader,
  resolveEngine,
  resolveProxy,
  resolveThreads,
  runtimePaths,
  runtimeState,
  systemProxy,
  transcribeLocal
};
