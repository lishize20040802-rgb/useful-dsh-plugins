// dsh-plugin-vision-reader — node half (host side).
//
// Images go straight to the main model. This plugin does NOT describe images
// on the main model's behalf, and it does not transcribe them into text — a
// second-hand description is strictly worse than the picture itself for a
// model that can see. What it adds on top of the built-in image support is
// durability: every pasted image is persisted to a local file, and the message
// carries that path so the model can re-read the same picture at any later
// point (放大、复核细节、换个 instruction 再看一遍).
//
// What it does:
//   A. Pass-through — the `agent/pre-step` hook keeps every `image` block
//      verbatim and appends a `【图片已保存】<path>` note for the persisted
//      copy. Text blocks that merely mention image paths are left alone: the
//      main model opens those paths itself.
//   B. `vision` tool — the model calls it with image path(s); the plugin reads
//      the files, persists them as attachments, and asks DeepSeek's built-in
//      multimodal model (`deepseek-official` / `deepseek-v4-flash-vision-exp`)
//      for a description, returning plain text. Used for an independent second
//      opinion from a different model — no extra API key, it shares the main
//      model's DEEPSEEK_API_KEY.
//
// Everything uses host services only (tools/fs/systemPrompt/llm/attachments)
// plus node builtins; zero external runtime dependencies.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
// Type-only loads activating declaration merges on the cordis Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-system-prompt'
// 0.1.5: `ctx.settings`. The Plugins settings tab dispatches a plugin's card
// only for a settings namespace that plugin registered on the Host — it pairs
// key to namespace and never learns what the namespace means. Without this the
// browser card registers and is then silently never drawn.
import type {} from '@deepseek-ai/dsh-settings'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import {
  callVision,
  hasAnyImage,
  planPreStep,
  type ImageRef as VisionImageRef,
  type PersistImage,
  type VisionLlm,
  type VisionResult
} from './vision.js'

// Re-export the pure vision logic so tests and consumers can exercise it
// without a running host (same pattern as official plugins exposing helpers).
export type { ImageRef as VisionImageRef, PersistImage, VisionLlm, VisionResult } from './vision.js'
export { callVision, hasAnyImage, hasImageBlock, planPreStep, SAVED_IMAGE_PREFIX } from './vision.js'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'vision-reader'

/** Services required by the node half. */
export const inject = ['tools', 'fs', 'systemPrompt', 'llm', 'attachments']

/** Default vision route: DeepSeek's built-in multimodal model. */
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-v4-flash-vision-exp'

/** Default instruction when the model does not say what to look at. */
const DEFAULT_INSTRUCTION = '请简要描述这张图片：画面主体、关键元素，以及图中出现的任何文字或数字。一两句话即可。'

/** Validated configuration shape (schema output contract). */
export interface VisionReaderConfig {
  /** Registered provider route owning the vision model. */
  provider: string
  /** Multimodal model id on that provider. */
  model: string
  /** Optional instruction override used when the model gives none. */
  instruction: string
  /** Directory pasted images are persisted to (for repeated re-reading). */
  inboxDir: string
}

export const Config = z.object({
  provider: z.string().default(DEFAULT_PROVIDER),
  model: z.string().default(DEFAULT_MODEL),
  instruction: z.string().default(DEFAULT_INSTRUCTION),
  inboxDir: z.string().default('')
})

/**
 * Settings namespace this plugin owns. The browser half registers its info
 * card under the same key (`settings.plugin.item`), which is how the official
 * Plugins tab pairs the two: key → namespace, with the tab staying ignorant of
 * what the namespace means.
 */
export const SETTINGS_NS = 'vision-reader'

/** Normalize and validate the plugin configuration. */
export function normalizeConfig(raw: unknown): VisionReaderConfig {
  const config = (raw ?? {}) as Partial<VisionReaderConfig>
  const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : DEFAULT_PROVIDER
  const model = typeof config.model === 'string' && config.model.trim() ? config.model.trim() : DEFAULT_MODEL
  if (!provider || !model) {
    throw new Error('vision-reader: provider and model must both be set (defaults: deepseek-official / deepseek-v4-flash-vision-exp)')
  }
  const inboxDir = typeof config.inboxDir === 'string' && config.inboxDir.trim()
    ? config.inboxDir.trim()
    : join(homedir(), '.dsh', 'vision-inbox')
  return {
    provider,
    model,
    instruction: typeof config.instruction === 'string' && config.instruction.trim()
      ? config.instruction.trim()
      : DEFAULT_INSTRUCTION,
    inboxDir
  }
}

/** Media type → file extension for persisted pasted images. */
const EXTENSION_BY_MEDIA: Record<ImageMediaType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

/** Keep a file name safe for disk: no separators, control chars, or length. */
function sanitizeBaseName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]/g, '_')
  const name = cleaned.replace(/^\.+/, '').trim().slice(0, 60)
  return name === '' ? 'image' : name
}

/**
 * Persist image bytes to `dir` with a content-addressed file name
 * (`<sha256-prefix>-<name><ext>`); identical content maps to the same file.
 * @param dir - target directory (created recursively).
 * @param data - image bytes.
 * @param mediaType - image media type (drives the extension).
 * @param name - display basename (sanitized; may be empty).
 * @returns the absolute saved path.
 */
export async function persistImageFile(
  dir: string,
  data: Uint8Array,
  mediaType: ImageMediaType,
  name: string
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 12)
  const ext = EXTENSION_BY_MEDIA[mediaType] ?? '.png'
  const dest = join(dir, `${digest}-${sanitizeBaseName(name)}${ext}`)
  try {
    await writeFile(dest, data, { flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err // identical content already saved
  }
  return dest
}

export function apply(ctx: Context, rawConfig: unknown): void {
  const cfg = normalizeConfig(rawConfig)
  const llm = ctx.get('llm') as {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  }
  if (!llm) throw new Error('vision-reader: no llm service mounted')
  const attachments = ctx.get('attachments') as AttachmentStore | undefined
  if (!attachments) throw new Error('vision-reader: no attachment service is mounted')

  // ── Settings namespace (0.1.5) ──────────────────────────────────────────
  // The official Plugins tab draws the browser card only for a namespace the
  // Host serves, so the namespace must be registered here. `base` carries the
  // row's composition config, so the descriptor the tab reads describes the
  // effective route rather than bare schema defaults.
  //
  // Registered through a scoped injection rather than a plain `ctx.get`: the
  // settings provider can mount after this plugin, and gating the whole plugin
  // on it would make a settings-less deployment refuse to load vision-reader.
  ctx.inject(['settings'], (sctx) => {
    try {
      sctx.settings.register(SETTINGS_NS, Config, { base: cfg })
    } catch (err) {
      console.warn('[dsh-plugin-vision-reader] settings namespace registration failed; the settings card stays absent:', err)
    }
  })

  // ── Pass-through + durability (agent/pre-step) ──────────────────────────
  // The one image route: every `image` block reaches the main model verbatim.
  // What this hook adds is durability — the bytes are also written to a local
  // file (content-addressed, cached per attachment id) and the message gains a
  // `【图片已保存】<path>` note, so the model can re-open the same picture at any
  // later point instead of relying on the clipboard, which is not a store.
  const persistedPathCache = new Map<string, string | null>()
  const persistPastedImage: PersistImage = async (attachment, signal) => {
    const key = typeof attachment.attachmentId === 'string' ? attachment.attachmentId : null
    if (key !== null && persistedPathCache.has(key)) return persistedPathCache.get(key) ?? null
    let saved: string | null = null
    try {
      const stored = await attachments.readImage(attachment, signal)
      saved = await persistImageFile(cfg.inboxDir, stored.data, attachment.mediaType, 'pasted-image')
    } catch {
      saved = null // best-effort: the image still reaches the model without a path
    }
    if (key !== null) {
      persistedPathCache.set(key, saved)
      if (persistedPathCache.size > 256) {
        const first = persistedPathCache.keys().next().value
        if (first !== undefined) persistedPathCache.delete(first)
      }
    }
    return saved
  }
  ctx.on('agent/pre-step', async (payload: { agent: Agent; messages: UserMessage[]; signal: AbortSignal }, next: () => Promise<PreStepDecision>) => {
    const messages = payload.messages ?? []
    if (!hasAnyImage(messages)) return next()
    if (payload.signal?.aborted) return next()
    try {
      return { kind: 'enter', messages: await planPreStep(messages, persistPastedImage, payload.signal) }
    } catch {
      return next() // persisting is best-effort; never drop the step
    }
  })

  // ── The vision tool ─────────────────────────────────────────────────────
  ctx.systemPrompt.section({
    name: 'tool:vision',
    order: 96,
    text:
      `本会话启用了 dsh-plugin-vision-reader（备用视觉模型：${cfg.provider}/${cfg.model}）。\n\n` +
      '图片直接进入上下文，由你自己看——没有任何中间转述。\n' +
      '粘贴的图片会同时被另存为本地文件，消息里给出 `【图片已保存】<绝对路径>`；上传的图片本来就是路径。\n\n' +
      '规则：\n' +
      '1. 细节（文字、数字、上下标、局部公式）以自己看图为准；不确定时对同一张图多看几次、换角度复核；\n' +
      '2. 需要另一个模型独立复核时用 vision 工具（file_path 单张；file_paths 多张，最多 10 张）；\n' +
      '3. 绝对不要读取系统剪切板获取图片（内容随时会被覆盖），要重看就用 `【图片已保存】` 给的路径或上传时的原始路径；\n' +
      '4. 回复用户时直接基于图片内容回答，不要罗列路径。'
  })

  ctx.tools.register(defineTool({
    name: 'vision',
    description:
      '用内置多模态模型（DeepSeek 视觉模型）读取本地图片，并把识别结果作为纯文本返回。用于让另一个模型对同一张图做独立复核（换个模型再看一遍），或按 `【图片已保存】` 给出的路径回看之前的图片。file_path 传单张，file_paths 传多张（最多 10 张），instruction 说明要看什么。',
    parameters: {
      file_path: {
        type: 'string',
        description: '图片文件路径（单图场景；与 file_paths 二选一或并用）。支持 PNG/JPEG/WebP/GIF'
      },
      file_paths: {
        type: 'array',
        items: { type: 'string' },
        description: '图片文件路径数组（多图场景，最多 10 张；与 file_path 二选一或并用）。'
      },
      instruction: {
        type: 'string',
        description: '识别要求，例如"描述图里的内容""提取图中文字""图中有什么动物/人/物体"。缺省为详细描述图片。'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true }
        }
      },
      render: (_args, value: { text: string }) => [{
        type: 'text',
        text: `<vision-result>\n${String(value.text)}\n</vision-result>`
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args: { file_path?: string; file_paths?: string[]; instruction?: string }, exec: { signal?: AbortSignal }) {
      // Collect every image path: file_path (single) plus file_paths (multiple).
      const paths: string[] = []
      if (typeof args.file_path === 'string' && args.file_path.trim()) paths.push(args.file_path.trim())
      if (Array.isArray(args.file_paths)) {
        for (const path of args.file_paths) {
          if (typeof path === 'string' && path.trim()) paths.push(path.trim())
        }
      }
      if (paths.length === 0) throw new Error('vision: provide file_path (single) or file_paths (multiple, up to 10)')
      const MAX_IMAGES = 10
      if (paths.length > MAX_IMAGES) throw new Error(`vision: too many images (${paths.length}), max ${MAX_IMAGES} per call`)

      if (!attachments.imageLimits || !Array.isArray(attachments.imageLimits.mediaTypes)) {
        throw new Error('vision: no imageLimits on the attachment service')
      }

      // Persist each image as a durable attachment reference.
      const refs: ImageAttachmentRef[] = []
      for (const path of paths) {
        const dot = path.lastIndexOf('.')
        const ext = dot >= 0 ? path.slice(dot).toLowerCase() : ''
        const mediaType = IMAGE_EXTENSIONS[ext]
        if (!mediaType) throw new Error(`vision: unsupported image format for "${path}" (PNG/JPEG/WebP/GIF only)`)
        if (!(attachments.imageLimits.mediaTypes as readonly string[]).includes(mediaType)) {
          throw new Error(`vision: ${mediaType} images are not accepted by this deployment`)
        }
        const target = await ctx.fs.resolve(path)
        const byteCap = Math.min(
          attachments.imageLimits.maxImageBytes ?? Number.POSITIVE_INFINITY,
          attachments.imageLimits.maxMessageImageBytes ?? Number.POSITIVE_INFINITY
        )
        const data = await ctx.fs.readBytes(target, exec.signal, byteCap)
        const ref = await attachments.saveImage({ data, mediaType, name: baseName(path) })
        refs.push(ref)
      }

      const instruction =
        typeof args.instruction === 'string' && args.instruction.trim()
          ? args.instruction.trim()
          : refs.length === 1
            ? cfg.instruction
            : `请按顺序分析以下 ${refs.length} 张图片，每张用一两句话概括内容（标注编号 1..${refs.length}），并指出图中出现的文字或数字。`

      const result = await callVision(llm, cfg, instruction, refs, exec.signal)
      if (!result.ok) {
        throw new Error(`vision: the vision model call failed: ${result.error}（请确认 DEEPSEEK_API_KEY 已配置且该账号可用 deepseek-v4-flash-vision-exp）`)
      }
      return { text: result.text }
    }
  }))
}

/** Accepted image formats (mirrors the built-in read_image surface). */
const IMAGE_EXTENSIONS: Record<string, ImageMediaType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Basename of a path, tolerant of both separators. */
function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}
