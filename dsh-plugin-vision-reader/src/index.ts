// dsh-plugin-vision-reader — node half (host side).
//
// Gives text-only main models (e.g. deepseek-v4-flash) image-reading ability
// by routing every image through DeepSeek's built-in multimodal model
// (`deepseek-official` / `deepseek-v4-flash-vision-exp`). No extra API key:
// the vision call uses the same DEEPSEEK_API_KEY the main model uses.
//
// Four features:
//   A. `vision` tool — the model calls it with image path(s); the plugin
//      reads the files, persists them as attachments, and asks the built-in
//      multimodal model to describe/answer, returning plain text.
//   B. Message transcription — every image reaching the main model is turned
//      into text first: `image` blocks (pasted images) AND image paths inside
//      text blocks (files uploaded via dsh-upload-button arrive as path text,
//      e.g. `C:\...\uploads\<12hex>-photo.png`) are transcribed. The image
//      never enters the main conversation context.
//   C. `read_image` redirection — when a text-only main model calls the
//      built-in `read_image` tool, its image result is transcribed to text
//      before the main model sees it, so the call never fails on modality.
//   D. Dynamic `read_image` hiding — in a text-only main-model session the
//      built-in `read_image` tool is hidden from the tool list and the model
//      is steered to `vision` instead; switching to a multimodal main model
//      restores `read_image` automatically.
//
// Everything uses host services only (tools/fs/systemPrompt/llm/attachments);
// zero external runtime dependencies.
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
// Type-only loads activating declaration merges on the cordis Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  transcribeBlocks,
  callVision,
  transcribeTextPaths,
  findImagePaths,
  readImageRef,
  type ImageRef as VisionImageRef,
  type VisionLlm,
  type VisionResult
} from './vision.js'

// Re-export the pure vision logic so tests and consumers can exercise it
// without a running host (same pattern as official plugins exposing helpers).
export type { ImageRef as VisionImageRef, VisionLlm, VisionResult } from './vision.js'
export { callVision, transcribeBlocks, transcribeTextPaths, findImagePaths, readImageRef } from './vision.js'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'vision-reader'

/** Services required by the node half. */
export const inject = ['tools', 'fs', 'systemPrompt', 'llm', 'attachments']

/** Default vision route: DeepSeek's built-in multimodal model. */
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-v4-flash-vision-exp'

/** Default instruction when the model does not say what to look at. */
const DEFAULT_INSTRUCTION = '请详细描述这张图片的内容，包括主体、构图、风格、色调和氛围。'

/** Validated configuration shape (schema output contract). */
export interface VisionReaderConfig {
  /** Registered provider route owning the vision model. */
  provider: string
  /** Multimodal model id on that provider. */
  model: string
  /** Auto-transcribe pasted images before they reach the main model. */
  transcribeImages: boolean
  /** Hide the built-in read_image tool while the main model is text-only. */
  autoHideReadImage: boolean
  /** Optional instruction override used when the model gives none. */
  instruction: string
}

export const Config = z.object({
  provider: z.string().default(DEFAULT_PROVIDER),
  model: z.string().default(DEFAULT_MODEL),
  transcribeImages: z.boolean().default(true),
  autoHideReadImage: z.boolean().default(true),
  instruction: z.string().default(DEFAULT_INSTRUCTION)
})

/** Normalize and validate the plugin configuration. */
export function normalizeConfig(raw: unknown): VisionReaderConfig {
  const config = (raw ?? {}) as Partial<VisionReaderConfig>
  const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : DEFAULT_PROVIDER
  const model = typeof config.model === 'string' && config.model.trim() ? config.model.trim() : DEFAULT_MODEL
  if (!provider || !model) {
    throw new Error('vision-reader: provider and model must both be set (defaults: deepseek-official / deepseek-v4-flash-vision-exp)')
  }
  return {
    provider,
    model,
    transcribeImages: config.transcribeImages !== false,
    autoHideReadImage: config.autoHideReadImage !== false,
    instruction: typeof config.instruction === 'string' && config.instruction.trim()
      ? config.instruction.trim()
      : DEFAULT_INSTRUCTION
  }
}

/** Whether a message content array carries at least one image block. */
function hasImageBlock(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => block && block.type === 'image')
}

/** The plugin's per-agent read_image-hiding bookkeeping. */
interface ReadImageHiding {
  /** Agents whose tool list currently hides read_image, and the disposer. */
  denied: Map<Agent, () => void>
}

/**
 * Hide `read_image` on an agent whose main model cannot take image input, or
 * restore it when the route becomes image-capable. Resolution is async, so
 * the actual flip happens after the route probe settles.
 */
function scheduleReadImageVisibility(
  llm: {
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{ inputModalities?: string[] } | undefined>
  },
  hiding: ReadImageHiding,
  agent: Agent,
  provider: string | undefined,
  model: string | undefined,
  enabled: boolean
): void {
  if (!enabled || !agent || !provider || !model) return
  const actx = agent.ctx
  if (!actx) return
  void llm.resolveModelInfo(provider, model)
    .then((info) => Boolean(info?.inputModalities && info.inputModalities.includes('image')))
    .catch(() => false) // fail-open: an unresolvable route hides nothing
    .then((imageCapable) => {
      const wantHide = !imageCapable
      if (wantHide && !hiding.denied.has(agent)) {
        try {
          hiding.denied.set(agent, actx.tools.restrict({ deny: ['read_image'] }))
        } catch {
          // keep unset — the agent's tool list simply keeps read_image
        }
      } else if (!wantHide && hiding.denied.has(agent)) {
        try {
          hiding.denied.get(agent)?.()
        } catch { /* noop */ }
        hiding.denied.delete(agent)
      }
    })
}

export function apply(ctx: Context, rawConfig: unknown): void {
  const cfg = normalizeConfig(rawConfig)
  const llm = ctx.get('llm') as {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{ inputModalities?: string[] } | undefined>
  }
  if (!llm) throw new Error('vision-reader: no llm service mounted')
  const attachments = ctx.get('attachments') as AttachmentStore | undefined
  if (!attachments) throw new Error('vision-reader: no attachment service is mounted')

  // ── Feature C: dynamic read_image hiding for text-only main models ──────
  // tools.restrict requires an agent-scoped context; hanging the restriction
  // on the agent ctx unwinds it automatically when the agent is disposed.
  // The default model is probed at agent/created; live switches are tracked
  // at agent/request.
  const hiding: ReadImageHiding = { denied: new Map() }
  ctx.on('agent/created', (payload: { agent: Agent }) => {
    const agent = payload.agent
    const options = agent.options ?? {}
    scheduleReadImageVisibility(llm, hiding, agent, options.provider, options.model, cfg.autoHideReadImage)
  })
  ctx.on('agent/request', async (payload: { agent: Agent }, next: () => Promise<{ provider: string; model: string }>) => {
    const resolved = await next()
    scheduleReadImageVisibility(llm, hiding, payload.agent, resolved.provider, resolved.model, cfg.autoHideReadImage)
    return resolved
  })

  // ── Feature B: pasted-image & path transcription (agent/pre-step) ───────
  // Two image carriers are transcribed before the main model sees them:
  //   1. `image` blocks (images pasted directly into a message);
  //   2. image paths inside text blocks (files uploaded via dsh-upload-button
  //      arrive as path text, e.g. `C:\...\uploads\<12hex>-photo.png`).
  // Both keep their visual identity in the UI (image blocks and file cards
  // survive) while the main model only ever sees text.
  const transcriptCache = new Map<string, string>()
  if (cfg.transcribeImages) {
    ctx.on('agent/pre-step', async (payload: { agent: Agent; messages: UserMessage[]; signal: AbortSignal }, next: () => Promise<PreStepDecision>) => {
      const messages = payload.messages ?? []
      const hasImage = messages.some((message) => hasImageBlock(message.content))
      const hasTextPath = messages.some((message) =>
        (message.content ?? []).some((block) => block.type === 'text' && findImagePaths(block.text).length > 0)
      )
      if (!hasImage && !hasTextPath) return next()
      if (payload.signal?.aborted) return next()
      try {
        const out: UserMessage[] = []
        for (const message of messages) {
          const content = message.content
          if (!hasImageBlock(content) && !(content ?? []).some((block) => block.type === 'text' && findImagePaths(block.text).length > 0)) {
            out.push(message)
            continue
          }
          const blocks: ContentBlock[] = []
          for (const block of content) {
            if (block.type === 'image') {
              const transcribed = await transcribeBlocks(llm, cfg, [block], payload.signal, transcriptCache)
              blocks.push(...transcribed)
            } else if (block.type === 'text') {
              const rewritten = await transcribeTextPaths(llm, cfg, ctx.fs, attachments, block.text, payload.signal, transcriptCache)
              blocks.push({ ...block, text: rewritten })
            } else {
              blocks.push(block)
            }
          }
          out.push({ ...message, content: blocks })
        }
        return { kind: 'enter', messages: out }
      } catch {
        return next() // transcription is best-effort; never drop the step
      }
    })
  }

  // ── Feature C: read_image redirection for text-only main models ─────────
  // The built-in read_image tool returns an `image` block; a text-only main
  // model cannot consume it. When the calling route is text-only, transcribe
  // the image block to text so the tool call succeeds for the model (the
  // result is text, not an image it cannot see).
  ctx.on('tools/post-execute', async (exec: any, result: any, next: () => any) => {
    if (exec?.name !== 'read_image' || result?.isError) return next()
    if (!exec.agent) return next()
    let imageCapable = false
    try {
      const info = await llm.resolveModelInfo(exec.agent.options?.provider, exec.agent.options?.model)
      imageCapable = Boolean(info?.inputModalities && info.inputModalities.includes('image'))
    } catch {
      imageCapable = false
    }
    if (imageCapable) return next()
    // The result carries the image in `content` (text + image blocks) and the
    // attachment metadata in `value.image`. Transcribe via the vision model.
    const imageBlock = (result.content ?? []).find((b: any) => b?.type === 'image')
    const imageValue = result.value?.image
    if (!imageBlock || !imageValue) return next()
    const ref: ImageAttachmentRef = {
      attachmentId: imageValue.attachmentId,
      mediaType: imageValue.mediaType,
      bytes: imageValue.bytes,
      width: imageValue.width,
      height: imageValue.height
    }
    const outcome = await callVision(llm, cfg, cfg.instruction, [ref], exec.signal)
    const transcribed = outcome.ok ? outcome.text : null
    return {
      kind: 'accept',
      content: [{
        type: 'text',
        text: transcribed !== null
          ? `【图片转述】${transcribed}`
          : '【图片转述失败：视觉模型调用出错。请稍后重试。】'
      }]
    }
  })

  // ── Feature A: the vision tool ──────────────────────────────────────────
  ctx.systemPrompt.section({
    name: 'tool:vision',
    order: 96,
    text:
      `本会话由 dsh-plugin-vision-reader 提供图片能力，视觉模型：${cfg.provider}/${cfg.model}。` +
      '遇到图片文件路径时，一律先用 vision 工具（file_path 指向单张图片，多张用 file_paths 传路径数组，instruction 说明要看什么）取得识别文本后再继续；' +
      '不要尝试用 read_image 或直接猜测图片内容。用户上传或粘贴进对话的图片会被自动转述成文字，' +
      '模型看到以【图片转述】开头的文本即为转述结果。'
  })

  ctx.tools.register(defineTool({
    name: 'vision',
    description:
      '使用内置多模态模型读取并识别本地图片，把识别结果作为纯文本返回。当当前主模型不支持图片输入（无法使用 read_image）时，用本工具代替：主模型只需要给图片路径和你想从图片里获取的信息。支持一次读取多张图片（file_paths 传路径数组）。',
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
            : `请按顺序分析以下 ${refs.length} 张图片，分别描述每张的内容（标注编号 1..${refs.length}），包括主体、构图、风格、色调和氛围。`

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
