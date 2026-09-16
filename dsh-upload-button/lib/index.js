// src/index.ts
import z from "@deepseek-ai/schemastery";
import { expandHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
var name = "upload-button";
var inject = ["webServer"];
var DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
var Config = z.object({
  maxBytes: z.number().default(DEFAULT_MAX_BYTES),
  uploadDir: z.string().default(""),
  allowedExtensions: z.array(z.string()).default([])
});
function resolveUploadDir(value = "") {
  return resolve(resolveDshHome(), expandHomePath(value.trim() || "uploads"));
}
var LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function sanitizeFileName(raw) {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  const segments = cleaned.split(/[\\/]/).filter((s) => s !== "" && s !== "." && s !== "..");
  const name2 = segments.join("_").replace(/^\.+/, "").trim().slice(0, 120);
  return name2 === "" ? "upload.bin" : name2;
}
function createUploadHandler(options) {
  const { dir, maxBytes, allowedExtensions } = options;
  return async (req, res) => {
    if (req.method !== "POST" && req.method !== "DELETE") {
      res.writeHead(405, { allow: "POST, DELETE" });
      res.end("method not allowed");
      return;
    }
    const host = String(req.headers?.host ?? "");
    if (!LOOPBACK_HOST.test(host)) {
      res.writeHead(403);
      res.end("forbidden: non-loopback host");
      return;
    }
    const origin = req.headers?.origin;
    if (origin !== void 0) {
      const scheme = req.socket?.encrypted ? "https" : "http";
      if (origin !== `${scheme}://${host}`) {
        res.writeHead(403);
        res.end("forbidden: cross-origin");
        return;
      }
    }
    const secFetchSite = req.headers?.["sec-fetch-site"];
    if (secFetchSite !== void 0 && secFetchSite !== "same-origin" && secFetchSite !== "none") {
      res.writeHead(403);
      res.end("forbidden: cross-site");
      return;
    }
    if (req.method === "DELETE") {
      const url = new URL(req.url ?? "", "http://localhost");
      const target = decodeURIComponent(url.searchParams.get("path") ?? "");
      if (target === "") {
        res.writeHead(400);
        res.end("missing path");
        return;
      }
      const root = resolve(dir);
      const resolved = resolve(target);
      if (resolved !== root && !resolved.startsWith(root + sep)) {
        res.writeHead(403);
        res.end("path outside uploadDir");
        return;
      }
      try {
        await unlink(resolved);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ removed: true }));
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
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
      res.end("empty upload");
      return;
    }
    const data = Buffer.concat(chunks);
    let rawName = "upload.bin";
    try {
      const header = String(req.headers?.["x-file-name"] ?? "");
      if (header !== "") rawName = decodeURIComponent(header);
    } catch {
    }
    const name2 = sanitizeFileName(rawName);
    const ext = extname(name2).slice(1).toLowerCase();
    if (allowedExtensions !== void 0 && allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
      res.writeHead(415);
      res.end(`extension ".${ext}" not allowed`);
      return;
    }
    try {
      await mkdir(dir, { recursive: true });
      const digest = createHash("sha256").update(data).digest("hex").slice(0, 12);
      const dest = join(dir, `${digest}-${name2}`);
      let deduplicated = false;
      try {
        await writeFile(dest, data, { flag: "wx" });
      } catch (err) {
        if (err?.code === "EEXIST") deduplicated = true;
        else throw err;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: dest, name: name2, bytes: data.length, ...deduplicated ? { deduplicated: true } : {} }));
    } catch (err) {
      console.error("[dsh-upload-button] upload persist failed:", err);
      res.writeHead(500);
      res.end("write failed");
    }
  };
}
function apply(ctx, config) {
  if (!Number.isInteger(config.maxBytes) || config.maxBytes < 1) {
    throw new Error("upload-button: maxBytes must be a positive integer");
  }
  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: "prefix",
        path: "/api/upload",
        handler: createUploadHandler({ dir: resolveUploadDir(config.uploadDir), maxBytes: config.maxBytes, allowedExtensions: config.allowedExtensions })
      });
    } catch (err) {
      console.error("[dsh-upload-button] /api/upload route registration failed (another plugin may own it); uploads will fail with a clear error:", err);
      return () => {
      };
    }
  });
}
export {
  Config,
  apply,
  createUploadHandler,
  inject,
  name,
  resolveUploadDir,
  sanitizeFileName
};
