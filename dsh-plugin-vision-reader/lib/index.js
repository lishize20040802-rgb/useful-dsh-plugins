// src/index.ts
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// src/vision.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { symbols } from "@deepseek-ai/cordis";
var VISION_SYSTEM = "\u4F60\u662F\u4E00\u4E2A\u591A\u6A21\u6001\u89C6\u89C9\u8BC6\u522B\u4EE3\u7406\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u5F20\u56FE\u7247\u548C\u4E00\u4E2A\u6307\u4EE4\uFF0C\u4F60\u9700\u8981\u76F4\u63A5\u57FA\u4E8E\u56FE\u7247\u5185\u5BB9\u7ED9\u51FA\u51C6\u786E\u3001\u5B8C\u6574\u7684\u56DE\u7B54\u3002\u53EA\u8F93\u51FA\u8BC6\u522B\u7ED3\u8BBA\u672C\u8EAB\uFF0C\u4E0D\u8981\u81EA\u6211\u4ECB\u7ECD\u3001\u4E0D\u8981\u89E3\u91CA\u4F60\u7684\u673A\u5236\u3002";
var TRANSCRIBE_FAILED_TEXT = "[\u56FE\u7247\u81EA\u52A8\u8F6C\u8FF0\u5931\u8D25\uFF1A\u89C6\u89C9\u6A21\u578B\u8C03\u7528\u51FA\u9519\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u628A\u56FE\u7247\u4FDD\u5B58\u4E3A\u6587\u4EF6\u540E\u8BA9\u6211\u7528 vision \u5DE5\u5177\u8BFB\u53D6\u3002]";
var IMAGE_EXTENSIONS = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
async function callVision(llm, cfg, instruction, refs, signal) {
  const parts = [];
  let finished;
  try {
    const content = [{ type: "text", text: instruction }];
    for (const ref of refs) {
      content.push({
        type: "image",
        attachment: ref
      });
    }
    for await (const chunk of llm.stream({
      provider: cfg.provider,
      model: cfg.model,
      system: VISION_SYSTEM,
      messages: [createUserMessage({ content, source: { kind: "user" } })],
      signal
    })) {
      if (chunk.type === "text-delta") parts.push(chunk.text);
      if (chunk.type === "finish") finished = chunk.reason;
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (finished?.kind === "error" || finished?.kind === "aborted") {
    return { ok: false, error: `vision model finished(${finished.kind})` };
  }
  const text = parts.join("").trim();
  if (!text) return { ok: false, error: "vision model returned empty content" };
  return { ok: true, text };
}
async function transcribeBlocks(llm, cfg, blocks, signal, cache, persist) {
  const out = [];
  for (const block of blocks ?? []) {
    if (block.type !== "image") {
      out.push(block);
      continue;
    }
    const attachment = block.attachment;
    const key = typeof attachment.attachmentId === "string" ? attachment.attachmentId : null;
    let text = null;
    if (key !== null && cache.has(key)) {
      text = cache.get(key) ?? null;
    } else {
      const result = await callVision(llm, cfg, cfg.instruction, [attachment], signal);
      text = result.ok ? result.text : null;
      if (text !== null && key !== null) {
        cache.set(key, text);
        if (cache.size > 256) {
          const first = cache.keys().next().value;
          if (first !== void 0) cache.delete(first);
        }
      }
    }
    const parts = [];
    if (persist !== void 0) {
      try {
        const savedPath = await persist(attachment, signal);
        if (savedPath !== null) parts.push(`\u3010\u56FE\u7247\u5DF2\u4FDD\u5B58\u3011\`${savedPath}\``);
      } catch {
      }
    }
    parts.push(text !== null ? `\u3010\u56FE\u7247\u8F6C\u8FF0\u3011${text}` : TRANSCRIBE_FAILED_TEXT);
    out.push({ type: "text", text: parts.join("\n") });
  }
  return out;
}
function findImagePaths(text) {
  const out = [];
  const re = /(`)?([A-Za-z]:[\\/][^\s`"'<>|*?:]+|~[\\/][^\s`"'<>|*?:]+)(\.png|\.jpe?g|\.webp|\.gif)(`)?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const leadingTick = m[1] !== void 0;
    const trailingTick = m[4] !== void 0;
    out.push({
      path: m[2] + m[3],
      // path without the backticks
      start: m.index + (leadingTick ? 1 : 0),
      end: m.index + m[0].length - (trailingTick ? 1 : 0)
    });
  }
  return out;
}
async function readImageRef(fs, attachments, path, signal) {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  const mediaType = IMAGE_EXTENSIONS[ext];
  if (mediaType === void 0) return void 0;
  if (!attachments.imageLimits.mediaTypes.includes(mediaType)) return void 0;
  const target = await fs.resolve(path);
  const byteCap = Math.min(
    attachments.imageLimits.maxImageBytes ?? Number.POSITIVE_INFINITY,
    attachments.imageLimits.maxMessageImageBytes ?? Number.POSITIVE_INFINITY
  );
  const data = await fs.readBytes(target, signal, byteCap);
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return attachments.saveImage({ data, mediaType, name: i >= 0 ? path.slice(i + 1) : path });
}
async function transcribeTextPaths(llm, cfg, fs, attachments, text, signal, cache) {
  const matches = findImagePaths(text);
  if (matches.length === 0) return text;
  let rewritten = text;
  for (let idx = matches.length - 1; idx >= 0; idx -= 1) {
    const match = matches[idx];
    let transcribed = null;
    if (cache.has(match.path)) {
      transcribed = cache.get(match.path) ?? null;
    } else {
      try {
        const ref = await readImageRef(fs, attachments, match.path, signal);
        if (ref !== void 0) {
          const result = await callVision(llm, cfg, cfg.instruction, [ref], signal);
          transcribed = result.ok ? result.text : null;
          if (transcribed !== null) {
            cache.set(match.path, transcribed);
            if (cache.size > 256) {
              const first = cache.keys().next().value;
              if (first !== void 0) cache.delete(first);
            }
          }
        }
      } catch {
        transcribed = null;
      }
    }
    if (transcribed !== null) {
      rewritten = rewritten.slice(0, match.end) + `
\u3010\u56FE\u7247\u8F6C\u8FF0\u3011${transcribed}` + rewritten.slice(match.end);
    }
  }
  return rewritten;
}
function unwrapService(value) {
  const candidate = value;
  return candidate[symbols.original] ?? value;
}
function installAdmissionShim(ctx, cfg) {
  const raw = ctx.llm;
  const llm = unwrapService(raw);
  if (llm === void 0 || typeof llm.resolveModelInfo !== "function") return () => {
  };
  const original = llm.resolveModelInfo.bind(llm);
  const wrapped = async (provider, model, signal) => {
    const info = await original(provider, model, signal);
    if (ctx.get("attachments") === void 0) return info;
    if (info.inputModalities === void 0 || info.inputModalities.includes("image")) return info;
    const { inputModalities: _dropped, ...rest } = info;
    return rest;
  };
  llm.resolveModelInfo = wrapped;
  return () => {
    if (llm.resolveModelInfo === wrapped) llm.resolveModelInfo = original;
  };
}

// src/index.ts
var name = "vision-reader";
var inject = ["tools", "fs", "systemPrompt", "llm", "attachments"];
var DEFAULT_PROVIDER = "deepseek-official";
var DEFAULT_MODEL = "deepseek-v4-flash-vision-exp";
var DEFAULT_INSTRUCTION = "\u8BF7\u7B80\u8981\u63CF\u8FF0\u8FD9\u5F20\u56FE\u7247\uFF1A\u753B\u9762\u4E3B\u4F53\u3001\u5173\u952E\u5143\u7D20\uFF0C\u4EE5\u53CA\u56FE\u4E2D\u51FA\u73B0\u7684\u4EFB\u4F55\u6587\u5B57\u6216\u6570\u5B57\u3002\u4E00\u4E24\u53E5\u8BDD\u5373\u53EF\u3002";
var Config = z.object({
  provider: z.string().default(DEFAULT_PROVIDER),
  model: z.string().default(DEFAULT_MODEL),
  transcribeImages: z.boolean().default(true),
  autoHideReadImage: z.boolean().default(true),
  instruction: z.string().default(DEFAULT_INSTRUCTION),
  inboxDir: z.string().default("")
});
function normalizeConfig(raw) {
  const config = raw ?? {};
  const provider = typeof config.provider === "string" && config.provider.trim() ? config.provider.trim() : DEFAULT_PROVIDER;
  const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_MODEL;
  if (!provider || !model) {
    throw new Error("vision-reader: provider and model must both be set (defaults: deepseek-official / deepseek-v4-flash-vision-exp)");
  }
  const inboxDir = typeof config.inboxDir === "string" && config.inboxDir.trim() ? config.inboxDir.trim() : join(homedir(), ".dsh", "vision-inbox");
  return {
    provider,
    model,
    transcribeImages: config.transcribeImages !== false,
    autoHideReadImage: config.autoHideReadImage !== false,
    instruction: typeof config.instruction === "string" && config.instruction.trim() ? config.instruction.trim() : DEFAULT_INSTRUCTION,
    inboxDir
  };
}
var EXTENSION_BY_MEDIA = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif"
};
function sanitizeBaseName(raw) {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]/g, "_");
  const name2 = cleaned.replace(/^\.+/, "").trim().slice(0, 60);
  return name2 === "" ? "image" : name2;
}
async function persistImageFile(dir, data, mediaType, name2) {
  await mkdir(dir, { recursive: true });
  const digest = createHash("sha256").update(data).digest("hex").slice(0, 12);
  const ext = EXTENSION_BY_MEDIA[mediaType] ?? ".png";
  const dest = join(dir, `${digest}-${sanitizeBaseName(name2)}${ext}`);
  try {
    await writeFile(dest, data, { flag: "wx" });
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }
  return dest;
}
function hasImageBlock(content) {
  return Array.isArray(content) && content.some((block) => block && block.type === "image");
}
function scheduleReadImageVisibility(llm, hiding, agent, provider, model, enabled) {
  if (!enabled || !agent || !provider || !model) return;
  const actx = agent.ctx;
  if (!actx) return;
  void llm.resolveModelInfo(provider, model).then((info) => Boolean(info?.inputModalities && info.inputModalities.includes("image"))).catch(() => false).then((imageCapable) => {
    const wantHide = !imageCapable;
    if (wantHide && !hiding.denied.has(agent)) {
      try {
        hiding.denied.set(agent, actx.tools.restrict({ deny: ["read_image"] }));
      } catch {
      }
    } else if (!wantHide && hiding.denied.has(agent)) {
      try {
        hiding.denied.get(agent)?.();
      } catch {
      }
      hiding.denied.delete(agent);
    }
  });
}
async function isRouteImageCapable(llm, agent) {
  const provider = agent.options?.provider;
  const model = agent.options?.model;
  if (!provider || !model) return false;
  try {
    const info = await llm.resolveModelInfo(provider, model);
    return Boolean(info?.inputModalities && info.inputModalities.includes("image"));
  } catch {
    return false;
  }
}
function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  const llm = ctx.get("llm");
  if (!llm) throw new Error("vision-reader: no llm service mounted");
  const attachments = ctx.get("attachments");
  if (!attachments) throw new Error("vision-reader: no attachment service is mounted");
  const disposeAdmission = installAdmissionShim(ctx, cfg);
  ctx.effect(() => disposeAdmission, "vision-reader: admission shim");
  const hiding = { denied: /* @__PURE__ */ new Map() };
  ctx.on("agent/created", (payload) => {
    const agent = payload.agent;
    const options = agent.options ?? {};
    scheduleReadImageVisibility(llm, hiding, agent, options.provider, options.model, cfg.autoHideReadImage);
  });
  ctx.on("agent/request", async (payload, next) => {
    const resolved = await next();
    scheduleReadImageVisibility(llm, hiding, payload.agent, resolved.provider, resolved.model, cfg.autoHideReadImage);
    return resolved;
  });
  const transcriptCache = /* @__PURE__ */ new Map();
  const persistedPathCache = /* @__PURE__ */ new Map();
  if (cfg.transcribeImages) {
    const persistPastedImage = async (attachment, signal) => {
      const key = typeof attachment.attachmentId === "string" ? attachment.attachmentId : null;
      if (key !== null && persistedPathCache.has(key)) return persistedPathCache.get(key) ?? null;
      let saved = null;
      try {
        const stored = await attachments.readImage(attachment, signal);
        saved = await persistImageFile(cfg.inboxDir, stored.data, attachment.mediaType, "pasted-image");
      } catch {
        saved = null;
      }
      if (key !== null) {
        persistedPathCache.set(key, saved);
        if (persistedPathCache.size > 256) {
          const first = persistedPathCache.keys().next().value;
          if (first !== void 0) persistedPathCache.delete(first);
        }
      }
      return saved;
    };
    ctx.on("agent/pre-step", async (payload, next) => {
      const messages = payload.messages ?? [];
      const hasImage = messages.some((message) => hasImageBlock(message.content));
      const hasTextPath = messages.some(
        (message) => (message.content ?? []).some((block) => block.type === "text" && findImagePaths(block.text).length > 0)
      );
      if (!hasImage && !hasTextPath) return next();
      if (payload.signal?.aborted) return next();
      const imageCapable = await isRouteImageCapable(llm, payload.agent);
      try {
        const out = [];
        for (const message of messages) {
          const content = message.content;
          if (!hasImageBlock(content) && !(content ?? []).some((block) => block.type === "text" && findImagePaths(block.text).length > 0)) {
            out.push(message);
            continue;
          }
          const blocks = [];
          for (const block of content) {
            if (block.type === "image") {
              if (!imageCapable) {
                const transcribed = await transcribeBlocks(llm, cfg, [block], payload.signal, transcriptCache, persistPastedImage);
                blocks.push(...transcribed);
                continue;
              }
              blocks.push(block);
              const saved = await persistPastedImage(block.attachment, payload.signal);
              if (saved !== null) blocks.push({ type: "text", text: `\u3010\u56FE\u7247\u5DF2\u4FDD\u5B58\u3011\`${saved}\`` });
            } else if (block.type === "text") {
              if (imageCapable) {
                blocks.push(block);
              } else {
                const rewritten = await transcribeTextPaths(llm, cfg, ctx.fs, attachments, block.text, payload.signal, transcriptCache);
                blocks.push({ ...block, text: rewritten });
              }
            } else {
              blocks.push(block);
            }
          }
          out.push({ ...message, content: blocks });
        }
        return { kind: "enter", messages: out };
      } catch {
        return next();
      }
    });
  }
  ctx.on("tools/post-execute", async (exec, result, next) => {
    if (exec?.name !== "read_image" || result?.isError) return next();
    if (!exec.agent) return next();
    let imageCapable = false;
    try {
      const info = await llm.resolveModelInfo(exec.agent.options?.provider, exec.agent.options?.model);
      imageCapable = Boolean(info?.inputModalities && info.inputModalities.includes("image"));
    } catch {
      imageCapable = false;
    }
    if (imageCapable) return next();
    const imageBlock = (result.content ?? []).find((b) => b?.type === "image");
    const imageValue = result.value?.image;
    if (!imageBlock || !imageValue) return next();
    const ref = {
      attachmentId: imageValue.attachmentId,
      mediaType: imageValue.mediaType,
      bytes: imageValue.bytes,
      width: imageValue.width,
      height: imageValue.height
    };
    const outcome = await callVision(llm, cfg, cfg.instruction, [ref], exec.signal);
    const transcribed = outcome.ok ? outcome.text : null;
    return {
      kind: "accept",
      content: [{
        type: "text",
        text: transcribed !== null ? `\u3010\u56FE\u7247\u8F6C\u8FF0\u3011${transcribed}` : "\u3010\u56FE\u7247\u8F6C\u8FF0\u5931\u8D25\uFF1A\u89C6\u89C9\u6A21\u578B\u8C03\u7528\u51FA\u9519\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u3011"
      }]
    };
  });
  ctx.systemPrompt.section({
    name: "tool:vision",
    order: 96,
    text: `\u672C\u4F1A\u8BDD\u542F\u7528\u4E86 dsh-plugin-vision-reader\uFF08\u5907\u7528\u89C6\u89C9\u6A21\u578B\uFF1A${cfg.provider}/${cfg.model}\uFF09\u3002

\u56FE\u7247\u8FDB\u5165\u4F1A\u8BDD\u7684\u65B9\u5F0F\u53D6\u51B3\u4E8E\u4E3B\u6A21\u578B\u80FD\u529B\uFF1A
\u2022 \u4E3B\u6A21\u578B\u81EA\u5DF1\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF08\u5DE5\u5177\u5217\u8868\u91CC\u6709 read_image\uFF09\u2192 \u539F\u56FE\u76F4\u63A5\u8FDB\u4E0A\u4E0B\u6587\uFF0C\u81EA\u5DF1\u770B\uFF1B\u7C98\u8D34\u7684\u56FE\u7247\u540C\u65F6\u88AB\u53E6\u5B58\u4E3A\u672C\u5730\u6587\u4EF6\uFF0C\u6D88\u606F\u91CC\u4F1A\u7ED9\u51FA \`\u3010\u56FE\u7247\u5DF2\u4FDD\u5B58\u3011<\u7EDD\u5BF9\u8DEF\u5F84>\`\uFF0C\u4FBF\u4E8E\u4E4B\u540E\u53CD\u590D\u67E5\u770B\u3002
\u2022 \u4E3B\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\u8F93\u5165 \u2192 \u56FE\u7247\u5148\u88AB\u8F6C\u8FF0\u6210\u6587\u5B57\uFF1A\`\u3010\u56FE\u7247\u5DF2\u4FDD\u5B58\u3011<\u8DEF\u5F84>\` + \`\u3010\u56FE\u7247\u8F6C\u8FF0\u3011<\u6982\u62EC>\`\uFF1B\u8981\u7EC6\u8282\u5C31\u6309\u8DEF\u5F84\u7528 vision \u5DE5\u5177\u53CD\u590D\u8BFB\u3002

\u89C4\u5219\uFF1A
1. \u7EC6\u8282\uFF08\u6587\u5B57\u3001\u6570\u5B57\u3001\u4E0A\u4E0B\u6807\u3001\u5C40\u90E8\u516C\u5F0F\uFF09\u4EE5\u81EA\u5DF1\u770B\u56FE\u4E3A\u51C6\uFF1B\u8F6C\u8FF0\u6216\u4E00\u6B21\u8BC6\u522B\u90FD\u4E0D\u7B97\u6570\uFF0C\u5FC5\u8981\u65F6\u5BF9\u540C\u4E00\u5F20\u56FE\u591A\u6B21\u8BFB\u3001\u6362 instruction \u590D\u6838\uFF1B
2. \u9700\u8981\u53E6\u4E00\u4E2A\u6A21\u578B\u72EC\u7ACB\u590D\u6838\u65F6\u7528 vision \u5DE5\u5177\uFF08file_path \u5355\u5F20\uFF1Bfile_paths \u591A\u5F20\uFF0C\u6700\u591A 10 \u5F20\uFF09\uFF1B
3. \u7EDD\u5BF9\u4E0D\u8981\u8BFB\u53D6\u7CFB\u7EDF\u526A\u5207\u677F\u83B7\u53D6\u56FE\u7247\uFF08\u5185\u5BB9\u968F\u65F6\u4F1A\u88AB\u8986\u76D6\uFF09\uFF1B
4. \u56DE\u590D\u7528\u6237\u65F6\u76F4\u63A5\u57FA\u4E8E\u56FE\u7247\u5185\u5BB9\u56DE\u7B54\uFF0C\u4E0D\u8981\u590D\u8FF0\u8F6C\u8FF0\u5168\u6587\uFF0C\u4E0D\u8981\u7F57\u5217\u8DEF\u5F84\u3002`
  });
  ctx.tools.register(defineTool({
    name: "vision",
    description: "\u7528\u5185\u7F6E\u591A\u6A21\u6001\u6A21\u578B\uFF08DeepSeek \u89C6\u89C9\u6A21\u578B\uFF09\u8BFB\u53D6\u672C\u5730\u56FE\u7247\uFF0C\u5E76\u628A\u8BC6\u522B\u7ED3\u679C\u4F5C\u4E3A\u7EAF\u6587\u672C\u8FD4\u56DE\u3002\u4E3B\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\u8F93\u5165\u65F6\uFF0C\u7528\u5B83\u4EE3\u66FF read_image \u770B\u56FE\uFF1B\u4E3B\u6A21\u578B\u81EA\u5DF1\u652F\u6301\u56FE\u7247\u8F93\u5165\u65F6\uFF0C\u7528\u5B83\u505A\u7B2C\u4E8C\u6B21\u72EC\u7ACB\u590D\u6838\uFF08\u6362\u4E2A\u6A21\u578B\u518D\u770B\u4E00\u904D\uFF09\u3002file_path \u4F20\u5355\u5F20\uFF0Cfile_paths \u4F20\u591A\u5F20\uFF08\u6700\u591A 10 \u5F20\uFF09\uFF0Cinstruction \u8BF4\u660E\u8981\u770B\u4EC0\u4E48\u3002",
    parameters: {
      file_path: {
        type: "string",
        description: "\u56FE\u7247\u6587\u4EF6\u8DEF\u5F84\uFF08\u5355\u56FE\u573A\u666F\uFF1B\u4E0E file_paths \u4E8C\u9009\u4E00\u6216\u5E76\u7528\uFF09\u3002\u652F\u6301 PNG/JPEG/WebP/GIF"
      },
      file_paths: {
        type: "array",
        items: { type: "string" },
        description: "\u56FE\u7247\u6587\u4EF6\u8DEF\u5F84\u6570\u7EC4\uFF08\u591A\u56FE\u573A\u666F\uFF0C\u6700\u591A 10 \u5F20\uFF1B\u4E0E file_path \u4E8C\u9009\u4E00\u6216\u5E76\u7528\uFF09\u3002"
      },
      instruction: {
        type: "string",
        description: '\u8BC6\u522B\u8981\u6C42\uFF0C\u4F8B\u5982"\u63CF\u8FF0\u56FE\u91CC\u7684\u5185\u5BB9""\u63D0\u53D6\u56FE\u4E2D\u6587\u5B57""\u56FE\u4E2D\u6709\u4EC0\u4E48\u52A8\u7269/\u4EBA/\u7269\u4F53"\u3002\u7F3A\u7701\u4E3A\u8BE6\u7EC6\u63CF\u8FF0\u56FE\u7247\u3002'
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `<vision-result>
${String(value.text)}
</vision-result>`
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const paths = [];
      if (typeof args.file_path === "string" && args.file_path.trim()) paths.push(args.file_path.trim());
      if (Array.isArray(args.file_paths)) {
        for (const path of args.file_paths) {
          if (typeof path === "string" && path.trim()) paths.push(path.trim());
        }
      }
      if (paths.length === 0) throw new Error("vision: provide file_path (single) or file_paths (multiple, up to 10)");
      const MAX_IMAGES = 10;
      if (paths.length > MAX_IMAGES) throw new Error(`vision: too many images (${paths.length}), max ${MAX_IMAGES} per call`);
      if (!attachments.imageLimits || !Array.isArray(attachments.imageLimits.mediaTypes)) {
        throw new Error("vision: no imageLimits on the attachment service");
      }
      const refs = [];
      for (const path of paths) {
        const dot = path.lastIndexOf(".");
        const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
        const mediaType = IMAGE_EXTENSIONS2[ext];
        if (!mediaType) throw new Error(`vision: unsupported image format for "${path}" (PNG/JPEG/WebP/GIF only)`);
        if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
          throw new Error(`vision: ${mediaType} images are not accepted by this deployment`);
        }
        const target = await ctx.fs.resolve(path);
        const byteCap = Math.min(
          attachments.imageLimits.maxImageBytes ?? Number.POSITIVE_INFINITY,
          attachments.imageLimits.maxMessageImageBytes ?? Number.POSITIVE_INFINITY
        );
        const data = await ctx.fs.readBytes(target, exec.signal, byteCap);
        const ref = await attachments.saveImage({ data, mediaType, name: baseName(path) });
        refs.push(ref);
      }
      const instruction = typeof args.instruction === "string" && args.instruction.trim() ? args.instruction.trim() : refs.length === 1 ? cfg.instruction : `\u8BF7\u6309\u987A\u5E8F\u5206\u6790\u4EE5\u4E0B ${refs.length} \u5F20\u56FE\u7247\uFF0C\u6BCF\u5F20\u7528\u4E00\u4E24\u53E5\u8BDD\u6982\u62EC\u5185\u5BB9\uFF08\u6807\u6CE8\u7F16\u53F7 1..${refs.length}\uFF09\uFF0C\u5E76\u6307\u51FA\u56FE\u4E2D\u51FA\u73B0\u7684\u6587\u5B57\u6216\u6570\u5B57\u3002`;
      const result = await callVision(llm, cfg, instruction, refs, exec.signal);
      if (!result.ok) {
        throw new Error(`vision: the vision model call failed: ${result.error}\uFF08\u8BF7\u786E\u8BA4 DEEPSEEK_API_KEY \u5DF2\u914D\u7F6E\u4E14\u8BE5\u8D26\u53F7\u53EF\u7528 deepseek-v4-flash-vision-exp\uFF09`);
      }
      return { text: result.text };
    }
  }));
}
var IMAGE_EXTENSIONS2 = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
function baseName(path) {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}
export {
  Config,
  apply,
  callVision,
  findImagePaths,
  inject,
  installAdmissionShim,
  name,
  normalizeConfig,
  persistImageFile,
  readImageRef,
  transcribeBlocks,
  transcribeTextPaths
};
