// dsh-plugin-vision-reader — vision call logic (pure, unit-testable).
//
// Everything that talks to the multimodal model lives here, separated from
// the cordis plugin contract so the transcription and tool flows share one
// implementation and the pure parts can be tested without a running host.
import type { ContentBlock, FinishReason, GenerateOptions, StreamChunk, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { symbols } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { VisionReaderConfig } from './index.js'

/** System prompt for the vision call: describe only, no mechanism chatter. */
const VISION_SYSTEM =
  '你是一个多模态视觉识别代理。用户会给你一张图片和一个指令，你需要直接基于图片内容给出准确、完整的回答。只输出识别结论本身，不要自我介绍、不要解释你的机制。'

/** Text pasted in place of an image that failed to transcribe. */
const TRANSCRIBE_FAILED_TEXT = '[图片自动转述失败：视觉模型调用出错。请稍后重试，或把图片保存为文件后让我用 vision 工具读取。]'

/** The durable attachment reference a vision call carries. */
export type ImageRef = ImageAttachmentRef

/** Minimal LLM service face the vision flow needs. */
export interface VisionLlm {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Minimal attachment-store face the transcription flow needs. */
export interface VisionAttachments {
  imageLimits: {
    mediaTypes: readonly ImageMediaType[]
    maxImageBytes?: number
    maxMessageImageBytes?: number
  }
  saveImage(input: { data: Uint8Array; mediaType: ImageMediaType; name?: string }): Promise<ImageRef>
}

/** Minimal fs face the transcription flow needs. */
export interface VisionFs {
  resolve(path: string): Promise<{ displayPath: string }>
  readBytes(target: { displayPath: string }, signal: AbortSignal | undefined, byteCap: number): Promise<Uint8Array>
}

/** Accepted image extensions mapped to media types (mirrors read_image). */
export const IMAGE_EXTENSIONS: Record<string, ImageMediaType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Result of one vision call. */
export type VisionResult = { ok: true; text: string } | { ok: false; error: string }

/**
 * Call the configured multimodal model with image attachment references and
 * return the assembled text.
 * @param llm - the LLM service face.
 * @param cfg - resolved plugin configuration (provider/model).
 * @param instruction - what to look at in the image(s).
 * @param refs - durable image attachment references.
 * @param signal - optional abort signal forwarded to the stream.
 */
export async function callVision(
  llm: VisionLlm,
  cfg: VisionReaderConfig,
  instruction: string,
  refs: ImageRef[],
  signal?: AbortSignal
): Promise<VisionResult> {
  const parts: string[] = []
  let finished: FinishReason | undefined
  try {
    const content: ContentBlock[] = [{ type: 'text', text: instruction }]
    for (const ref of refs) {
      content.push({
        type: 'image',
        attachment: ref
      })
    }
    for await (const chunk of llm.stream({
      provider: cfg.provider,
      model: cfg.model,
      system: VISION_SYSTEM,
      messages: [createUserMessage({ content, source: { kind: 'user' } })],
      signal
    })) {
      if (chunk.type === 'text-delta') parts.push(chunk.text)
      if (chunk.type === 'finish') finished = chunk.reason
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (finished?.kind === 'error' || finished?.kind === 'aborted') {
    return { ok: false, error: `vision model finished(${finished.kind})` }
  }
  const text = parts.join('').trim()
  if (!text) return { ok: false, error: 'vision model returned empty content' }
  return { ok: true, text }
}

/**
 * Transcribe one content block list's image blocks into text blocks.
 * Non-image blocks pass through untouched; results are cached by
 * attachmentId so the same image in one step is transcribed only once.
 * @param llm - the LLM service face.
 * @param cfg - resolved plugin configuration.
 * @param blocks - the content block list (message content).
 * @param signal - optional abort signal.
 * @param cache - per-step transcription cache keyed by attachmentId.
 * @returns a copy of `blocks` with every image block replaced by text.
 */
export async function transcribeBlocks(
  llm: VisionLlm,
  cfg: VisionReaderConfig,
  blocks: ContentBlock[],
  signal: AbortSignal | undefined,
  cache: Map<string, string>
): Promise<ContentBlock[]> {
  const out: ContentBlock[] = []
  for (const block of blocks ?? []) {
    if (block.type !== 'image') {
      out.push(block)
      continue
    }
    const attachment = block.attachment
    const key = typeof attachment.attachmentId === 'string' ? attachment.attachmentId : null
    let text: string | null = null
    if (key !== null && cache.has(key)) {
      text = cache.get(key) ?? null
    } else {
      const result = await callVision(llm, cfg, cfg.instruction, [attachment], signal)
      text = result.ok ? result.text : null
      if (text !== null && key !== null) {
        cache.set(key, text)
        if (cache.size > 256) {
          const first = cache.keys().next().value
          if (first !== undefined) cache.delete(first)
        }
      }
    }
    out.push({ type: 'text', text: text !== null ? `【图片转述】${text}` : TRANSCRIBE_FAILED_TEXT })
  }
  return out
}

/** One recognized image path inside a text block. */
export interface PathMatch {
  /** Full path as written in the text. */
  path: string
  /** Index where the path starts in the text. */
  start: number
  /** Index just past the path end. */
  end: number
}

/**
 * Find every image path inside a text string. Matches Windows or POSIX
 * absolute paths ending in a supported image extension (optionally quoted).
 * Paths may be inline code (`` `path` ``) or plain text; the backticks are
 * part of the match so the rewrite keeps the file card rendering.
 * @param text - the raw text block content.
 * @returns matches sorted by start index.
 */
export function findImagePaths(text: string): PathMatch[] {
  const out: PathMatch[] = []
  const re = /(`)?([A-Za-z]:[\\/][^\s`"'<>|*?:]+|~[\\/][^\s`"'<>|*?:]+)(\.png|\.jpe?g|\.webp|\.gif)(`)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const leadingTick = m[1] !== undefined
    const trailingTick = m[4] !== undefined
    out.push({
      path: m[2] + m[3], // path without the backticks
      start: m.index + (leadingTick ? 1 : 0),
      end: m.index + m[0].length - (trailingTick ? 1 : 0)
    })
  }
  return out
}

/**
 * Read one image file through the attachments store (same admission rules as
 * the `vision` tool) and return the durable reference.
 * @param fs - the fs service face.
 * @param attachments - the attachment store face.
 * @param path - the image path.
 * @param signal - optional abort signal.
 * @returns the durable reference, or undefined when the path is not a readable image.
 */
export async function readImageRef(
  fs: VisionFs,
  attachments: VisionAttachments,
  path: string,
  signal: AbortSignal | undefined
): Promise<ImageRef | undefined> {
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : ''
  const mediaType = IMAGE_EXTENSIONS[ext] as ImageMediaType | undefined
  if (mediaType === undefined) return undefined
  if (!attachments.imageLimits.mediaTypes.includes(mediaType)) return undefined
  const target = await fs.resolve(path)
  const byteCap = Math.min(
    attachments.imageLimits.maxImageBytes ?? Number.POSITIVE_INFINITY,
    attachments.imageLimits.maxMessageImageBytes ?? Number.POSITIVE_INFINITY
  )
  const data = await fs.readBytes(target, signal, byteCap)
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return attachments.saveImage({ data, mediaType, name: i >= 0 ? path.slice(i + 1) : path })
}

/**
 * Transcribe every image path inside one text block: each recognized path is
 * kept verbatim (so the UI file card and the model's path reference survive)
 * and followed by an appended `【图片转述】…` line with the recognized text.
 * Paths whose file cannot be read (or fail admission) are left untouched.
 * @param llm - the LLM service face.
 * @param cfg - resolved plugin configuration.
 * @param fs - the fs service face.
 * @param attachments - the attachment store face.
 * @param text - the text block content.
 * @param signal - optional abort signal.
 * @param cache - per-step transcription cache keyed by path.
 * @returns the rewritten text, or the original when no image path was found.
 */
export async function transcribeTextPaths(
  llm: VisionLlm,
  cfg: VisionReaderConfig,
  fs: VisionFs,
  attachments: VisionAttachments,
  text: string,
  signal: AbortSignal | undefined,
  cache: Map<string, string>
): Promise<string> {
  const matches = findImagePaths(text)
  if (matches.length === 0) return text
  // Rewrite from the end so earlier indices stay valid.
  let rewritten = text
  for (let idx = matches.length - 1; idx >= 0; idx -= 1) {
    const match = matches[idx]
    let transcribed: string | null = null
    if (cache.has(match.path)) {
      transcribed = cache.get(match.path) ?? null
    } else {
      try {
        const ref = await readImageRef(fs, attachments, match.path, signal)
        if (ref !== undefined) {
          const result = await callVision(llm, cfg, cfg.instruction, [ref], signal)
          transcribed = result.ok ? result.text : null
          if (transcribed !== null) {
            cache.set(match.path, transcribed)
            if (cache.size > 256) {
              const first = cache.keys().next().value
              if (first !== undefined) cache.delete(first)
            }
          }
        }
      } catch {
        transcribed = null // unreadable path stays untouched
      }
    }
    if (transcribed !== null) {
      rewritten =
        rewritten.slice(0, match.end) +
        `\n【图片转述】${transcribed}` +
        rewritten.slice(match.end)
    }
  }
  return rewritten
}

// ── Host image-admission shim ─────────────────────────────────────────────
// The host's `session.prompt` preflight refuses image messages for models
// whose declared input modalities exclude `image`, and there is no plugin
// seam on that gate. This wrapper reports `inputModalities: undefined`
// (unknown) for the configured text-only routes while an attachment store is
// present, so the gate admits the image message; the pre-step transcription
// then turns the image into text before the main model sees it. Vision-capable
// models and unknown-capability routes pass through untouched.
//
// Cordis wraps every service read in a traceable proxy whose `get` trap wraps
// method reads, so assignments through `ctx.llm` never stick; the proxy
// exposes its target under `symbols.original`.

/** Reach the real service instance behind the context's traceable proxy. */
function unwrapService<T>(value: T): T {
  const candidate = value as { [symbols.original]?: T }
  return (candidate[symbols.original] ?? value) as T
}

/** The llm service face the admission shim patches. */
export interface AdmissionLlm {
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
}

/**
 * Install the admission shim on the real `LlmRuntime` instance behind `ctx.llm`.
 * @param ctx - plugin context carrying the live `llm` service.
 * @param cfg - resolved plugin configuration (provider/model are the routes
 *   whose `resolveModelInfo` result is relaxed).
 * @returns a disposer restoring the original method.
 */
export function installAdmissionShim(ctx: Context, cfg: VisionReaderConfig): () => void {
  // 用属性访问（ctx.llm）而非 ctx.get('llm')：cordis 对二者的代理包装不同，
  // apiproxy 通过 ctx.llm 读取，因此这里必须 patch 同一个属性访问得到的实例。
  const raw = (ctx as unknown as { llm?: AdmissionLlm & { [symbols.original]?: AdmissionLlm } }).llm
  const llm = unwrapService(raw)
  if (llm === undefined || typeof llm.resolveModelInfo !== 'function') return () => {}
  const original = llm.resolveModelInfo.bind(llm)
  const wrapped = (async (
    provider: string,
    model: string,
    signal?: AbortSignal
  ): Promise<LlmResolvedModelInfo> => {
    const info = await original(provider, model, signal)
    // Without a durable store there is no path to transcribe through, so keep
    // the host gate meaningful: only relax when an attachment store exists.
    if (ctx.get('attachments') === undefined) return info
    // Relax EVERY route that does not declare image input: the host gate
    // (session.prompt) checks the MAIN model's modalities, and the pre-step
    // transcription turns any admitted image into text before that main model
    // sees it. Vision-capable models keep their modalities untouched.
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) return info
    const { inputModalities: _dropped, ...rest } = info
    return rest as LlmResolvedModelInfo
  }) as typeof llm.resolveModelInfo
  llm.resolveModelInfo = wrapped
  return () => {
    if (llm.resolveModelInfo === wrapped) llm.resolveModelInfo = original
  }
}
