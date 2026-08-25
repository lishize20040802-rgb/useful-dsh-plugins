// src/index.ts
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/vision.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
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
async function transcribeBlocks(llm, cfg, blocks, signal, cache) {
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
    out.push({ type: "text", text: text !== null ? `\u3010\u56FE\u7247\u8F6C\u8FF0\u3011${text}` : TRANSCRIBE_FAILED_TEXT });
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

// src/index.ts
var name = "vision-reader";
var inject = ["tools", "fs", "systemPrompt", "llm", "attachments"];
var DEFAULT_PROVIDER = "deepseek-official";
var DEFAULT_MODEL = "deepseek-v4-flash-vision-exp";
var DEFAULT_INSTRUCTION = "\u8BF7\u8BE6\u7EC6\u63CF\u8FF0\u8FD9\u5F20\u56FE\u7247\u7684\u5185\u5BB9\uFF0C\u5305\u62EC\u4E3B\u4F53\u3001\u6784\u56FE\u3001\u98CE\u683C\u3001\u8272\u8C03\u548C\u6C1B\u56F4\u3002";
var Config = z.object({
  provider: z.string().default(DEFAULT_PROVIDER),
  model: z.string().default(DEFAULT_MODEL),
  transcribeImages: z.boolean().default(true),
  autoHideReadImage: z.boolean().default(true),
  instruction: z.string().default(DEFAULT_INSTRUCTION)
});
function normalizeConfig(raw) {
  const config = raw ?? {};
  const provider = typeof config.provider === "string" && config.provider.trim() ? config.provider.trim() : DEFAULT_PROVIDER;
  const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_MODEL;
  if (!provider || !model) {
    throw new Error("vision-reader: provider and model must both be set (defaults: deepseek-official / deepseek-v4-flash-vision-exp)");
  }
  return {
    provider,
    model,
    transcribeImages: config.transcribeImages !== false,
    autoHideReadImage: config.autoHideReadImage !== false,
    instruction: typeof config.instruction === "string" && config.instruction.trim() ? config.instruction.trim() : DEFAULT_INSTRUCTION
  };
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
function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  const llm = ctx.get("llm");
  if (!llm) throw new Error("vision-reader: no llm service mounted");
  const attachments = ctx.get("attachments");
  if (!attachments) throw new Error("vision-reader: no attachment service is mounted");
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
  if (cfg.transcribeImages) {
    ctx.on("agent/pre-step", async (payload, next) => {
      const messages = payload.messages ?? [];
      const hasImage = messages.some((message) => hasImageBlock(message.content));
      const hasTextPath = messages.some(
        (message) => (message.content ?? []).some((block) => block.type === "text" && findImagePaths(block.text).length > 0)
      );
      if (!hasImage && !hasTextPath) return next();
      if (payload.signal?.aborted) return next();
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
              const transcribed = await transcribeBlocks(llm, cfg, [block], payload.signal, transcriptCache);
              blocks.push(...transcribed);
            } else if (block.type === "text") {
              const rewritten = await transcribeTextPaths(llm, cfg, ctx.fs, attachments, block.text, payload.signal, transcriptCache);
              blocks.push({ ...block, text: rewritten });
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
    text: `\u672C\u4F1A\u8BDD\u7531 dsh-plugin-vision-reader \u63D0\u4F9B\u56FE\u7247\u80FD\u529B\uFF0C\u89C6\u89C9\u6A21\u578B\uFF1A${cfg.provider}/${cfg.model}\u3002\u9047\u5230\u56FE\u7247\u6587\u4EF6\u8DEF\u5F84\u65F6\uFF0C\u4E00\u5F8B\u5148\u7528 vision \u5DE5\u5177\uFF08file_path \u6307\u5411\u5355\u5F20\u56FE\u7247\uFF0C\u591A\u5F20\u7528 file_paths \u4F20\u8DEF\u5F84\u6570\u7EC4\uFF0Cinstruction \u8BF4\u660E\u8981\u770B\u4EC0\u4E48\uFF09\u53D6\u5F97\u8BC6\u522B\u6587\u672C\u540E\u518D\u7EE7\u7EED\uFF1B\u4E0D\u8981\u5C1D\u8BD5\u7528 read_image \u6216\u76F4\u63A5\u731C\u6D4B\u56FE\u7247\u5185\u5BB9\u3002\u7528\u6237\u4E0A\u4F20\u6216\u7C98\u8D34\u8FDB\u5BF9\u8BDD\u7684\u56FE\u7247\u4F1A\u88AB\u81EA\u52A8\u8F6C\u8FF0\u6210\u6587\u5B57\uFF0C\u6A21\u578B\u770B\u5230\u4EE5\u3010\u56FE\u7247\u8F6C\u8FF0\u3011\u5F00\u5934\u7684\u6587\u672C\u5373\u4E3A\u8F6C\u8FF0\u7ED3\u679C\u3002`
  });
  ctx.tools.register(defineTool({
    name: "vision",
    description: "\u4F7F\u7528\u5185\u7F6E\u591A\u6A21\u6001\u6A21\u578B\u8BFB\u53D6\u5E76\u8BC6\u522B\u672C\u5730\u56FE\u7247\uFF0C\u628A\u8BC6\u522B\u7ED3\u679C\u4F5C\u4E3A\u7EAF\u6587\u672C\u8FD4\u56DE\u3002\u5F53\u5F53\u524D\u4E3B\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF08\u65E0\u6CD5\u4F7F\u7528 read_image\uFF09\u65F6\uFF0C\u7528\u672C\u5DE5\u5177\u4EE3\u66FF\uFF1A\u4E3B\u6A21\u578B\u53EA\u9700\u8981\u7ED9\u56FE\u7247\u8DEF\u5F84\u548C\u4F60\u60F3\u4ECE\u56FE\u7247\u91CC\u83B7\u53D6\u7684\u4FE1\u606F\u3002\u652F\u6301\u4E00\u6B21\u8BFB\u53D6\u591A\u5F20\u56FE\u7247\uFF08file_paths \u4F20\u8DEF\u5F84\u6570\u7EC4\uFF09\u3002",
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
      const instruction = typeof args.instruction === "string" && args.instruction.trim() ? args.instruction.trim() : refs.length === 1 ? cfg.instruction : `\u8BF7\u6309\u987A\u5E8F\u5206\u6790\u4EE5\u4E0B ${refs.length} \u5F20\u56FE\u7247\uFF0C\u5206\u522B\u63CF\u8FF0\u6BCF\u5F20\u7684\u5185\u5BB9\uFF08\u6807\u6CE8\u7F16\u53F7 1..${refs.length}\uFF09\uFF0C\u5305\u62EC\u4E3B\u4F53\u3001\u6784\u56FE\u3001\u98CE\u683C\u3001\u8272\u8C03\u548C\u6C1B\u56F4\u3002`;
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
  name,
  normalizeConfig,
  readImageRef,
  transcribeBlocks,
  transcribeTextPaths
};
