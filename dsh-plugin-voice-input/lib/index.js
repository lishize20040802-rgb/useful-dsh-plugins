// src/index.ts
import z from "@deepseek-ai/schemastery";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
var name = "voice-input";
var inject = ["webServer"];
var DEFAULT_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
var DEFAULT_RESOURCE_ID = "volc.bigasr.sauc.duration";
var DEFAULT_TIMEOUT_MS = 12e4;
var DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
var FRAME_BYTES = 6400;
var MSG_FULL_REQUEST = 1;
var MSG_AUDIO = 2;
var MSG_SERVER_RESPONSE = 9;
var MSG_SERVER_ERROR = 15;
var FLAG_POS_SEQ = 1;
var FLAG_LAST = 2;
var SERIAL_JSON = 1;
var COMPRESS_GZIP = 1;
var Config = z.object({
  appId: z.string().default(""),
  accessToken: z.string().default(""),
  resourceId: z.string().default(DEFAULT_RESOURCE_ID),
  wsUrl: z.string().default(DEFAULT_WS_URL),
  language: z.string().default("zh"),
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
});
var LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function parseWavHeader(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("invalid audio: not a RIFF/WAVE file");
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bits = buffer.readUInt16LE(34);
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + size % 2;
  }
  if (dataOffset < 0) throw new Error("invalid audio: missing data chunk");
  return { channels, sampleRate, bits, dataOffset, dataLength };
}
function buildFrame(messageType, flags, payload, options = {}) {
  const header = Buffer.from([
    17,
    // protocol version 1 | header size 1 (x4 bytes)
    messageType << 4 | flags,
    (options.serialization ?? 0) << 4 | (options.compression ?? 0),
    0
  ]);
  const sequence = options.sequence;
  const seqBuf = sequence === void 0 ? Buffer.alloc(0) : (() => {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(sequence, 0);
    return buf;
  })();
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  return Buffer.concat([header, seqBuf, size, payload]);
}
function transcribeWav(audio, upstream) {
  return new Promise((resolve, reject) => {
    let header;
    try {
      header = parseWavHeader(audio);
    } catch (err) {
      reject(err);
      return;
    }
    const pcm = audio.subarray(header.dataOffset);
    const ws = new WebSocket(upstream.wsUrl, {
      handshakeTimeout: 1e4,
      headers: {
        "X-Api-App-Key": upstream.appId,
        "X-Api-Access-Key": upstream.accessToken,
        "X-Api-Resource-Id": upstream.resourceId,
        "X-Api-Connect-Id": randomUUID()
      }
    });
    let settled = false;
    let finalText = "";
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
      }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("ASR upstream timeout"))), upstream.timeoutMs);
    const sendFrame = (messageType, flags, payload, options) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buildFrame(messageType, flags, payload, options));
    };
    ws.on("open", () => {
      const request = {
        user: { uid: upstream.appId },
        audio: {
          format: "pcm",
          codec: "raw",
          rate: header.sampleRate,
          bits: header.bits,
          channel: header.channels,
          language: upstream.language
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: false,
          show_utterances: false,
          result_type: "full"
        }
      };
      sendFrame(MSG_FULL_REQUEST, FLAG_POS_SEQ, gzipSync(Buffer.from(JSON.stringify(request))), {
        serialization: SERIAL_JSON,
        compression: COMPRESS_GZIP,
        sequence: 1
      });
      let seq = 2;
      for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
        const end = Math.min(offset + FRAME_BYTES, pcm.length);
        const isLast = end >= pcm.length;
        sendFrame(MSG_AUDIO, isLast ? FLAG_LAST | FLAG_POS_SEQ : FLAG_POS_SEQ, gzipSync(pcm.subarray(offset, end)), {
          compression: COMPRESS_GZIP,
          sequence: isLast ? -seq : seq
        });
        if (!isLast) seq += 1;
      }
      if (pcm.length === 0) {
        sendFrame(MSG_AUDIO, FLAG_LAST | FLAG_POS_SEQ, gzipSync(Buffer.alloc(0)), {
          compression: COMPRESS_GZIP,
          sequence: -seq
        });
      }
    });
    const decodePayload = (serialization, compression, payload) => {
      let decoded = payload;
      if (compression === COMPRESS_GZIP && payload.length > 0) decoded = gunzipSync(payload);
      if (serialization === SERIAL_JSON && decoded.length > 0) return JSON.parse(decoded.toString("utf8"));
      return decoded;
    };
    ws.on("message", (data, isBinary) => {
      if (!isBinary || settled) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 4) return;
      const headerSize = buf[0] & 15;
      const messageType = buf[1] >> 4;
      const flags = buf[1] & 15;
      const serialization = buf[2] >> 4;
      const compression = buf[2] & 15;
      let offset = headerSize * 4;
      if (flags & FLAG_POS_SEQ) offset += 4;
      if (messageType === MSG_SERVER_ERROR) {
        offset += 4;
        const payloadSize = buf.readUInt32BE(offset);
        offset += 4;
        let detail;
        try {
          detail = decodePayload(serialization, compression, buf.subarray(offset, offset + payloadSize));
        } catch {
          detail = buf.subarray(offset, offset + payloadSize).toString("utf8");
        }
        const text = typeof detail === "string" ? detail : JSON.stringify(detail);
        finish(() => reject(new Error(`ASR rejected: ${text.slice(0, 300)}`)));
        return;
      }
      if (messageType === MSG_SERVER_RESPONSE) {
        const payloadSize = buf.readUInt32BE(offset);
        offset += 4;
        let parsed;
        try {
          parsed = decodePayload(serialization, compression, buf.subarray(offset, offset + payloadSize));
        } catch {
          return;
        }
        if (parsed !== null && typeof parsed === "object") {
          const result = parsed.result;
          if (result !== void 0 && typeof result.text === "string" && result.text !== "") {
            finalText = result.text;
          }
          if (flags & FLAG_LAST) {
            finish(() => resolve(finalText));
          }
        }
      }
    });
    ws.on("error", (err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))));
    ws.on("close", (code) => {
      if (!settled) finish(() => reject(new Error(`ASR connection closed (${code})`)));
    });
  });
}
function createAsrHandler(options) {
  const { appId, accessToken, resourceId, wsUrl, language, timeoutMs, maxBytes } = options;
  const transcribe = options.transcribe ?? ((audio) => transcribeWav(audio, { appId, accessToken, resourceId, wsUrl, language, timeoutMs }));
  return async (req, res) => {
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
      const configured = appId !== "" && accessToken !== "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, configured, resourceId }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "GET, POST" });
      res.end("method not allowed");
      return;
    }
    if (appId === "" || accessToken === "") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "voice input is not configured: set appId and accessToken in the profile patch (or VOLC_APP_ID / VOLC_ACCESS_TOKEN)" } }));
      return;
    }
    const declared = Number(req.headers?.["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.writeHead(413);
      res.end("payload too large");
      return;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
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
      console.error("[dsh-plugin-voice-input] transcription failed:", detail);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: detail } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text }));
  };
}
function resolveSecret(configValue, envName) {
  const fromConfig = configValue.trim();
  if (fromConfig !== "") return fromConfig;
  const fromEnv = process.env[envName];
  return (fromEnv ?? "").trim();
}
function apply(ctx, config) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error("voice-input: maxBytes must be a positive integer");
  }
  if (config.timeoutMs < 5e3) {
    throw new Error("voice-input: timeoutMs must be at least 5000");
  }
  const appId = resolveSecret(config.appId, "VOLC_APP_ID");
  const accessToken = resolveSecret(config.accessToken, "VOLC_ACCESS_TOKEN");
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: "prefix",
        path: "/api/asr",
        handler: createAsrHandler({
          appId,
          accessToken,
          resourceId: config.resourceId,
          wsUrl: config.wsUrl,
          language: config.language,
          maxBytes: config.maxBytes,
          timeoutMs: config.timeoutMs
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
  DEFAULT_RESOURCE_ID,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WS_URL,
  apply,
  buildFrame,
  createAsrHandler,
  inject,
  name,
  parseWavHeader,
  transcribeWav
};
