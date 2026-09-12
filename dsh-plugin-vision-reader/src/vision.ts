// dsh-plugin-vision-reader — vision call logic (pure, unit-testable).
//
// Everything that talks to the multimodal model lives here, separated from the
// cordis plugin contract so the vision tool and the pre-step pass-through share
// one implementation and the pure parts can be tested without a running host.
//
// The plugin has exactly one image route: the original image reaches the main
// model untouched, and pasted images are additionally persisted to a local file
// so their path stays valid for repeated viewing. Nothing here converts an
// image into text on the main model's behalf.
import type { ContentBlock, FinishReason, GenerateOptions, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { VisionReaderConfig } from './index.js'

/** System prompt for the vision call: describe only, no mechanism chatter. */
const VISION_SYSTEM =
  '你是一个多模态视觉识别代理。用户会给你一张图片和一个指令，你需要直接基于图片内容给出准确、完整的回答。只输出识别结论本身，不要自我介绍、不要解释你的机制。'

/**
 * Persist one pasted image to a stable local file so the model can re-read it
 * later (the clipboard is not a durable store). Returns the saved absolute
 * path, or null when persistence is unavailable/failed — the image still
 * reaches the model either way.
 */
export type PersistImage = (attachment: ImageAttachmentRef, signal?: AbortSignal) => Promise<string | null>

/** The durable attachment reference a vision call carries. */
export type ImageRef = ImageAttachmentRef

/** Minimal LLM service face the vision flow needs. */
export interface VisionLlm {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
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

// ── Pre-step pass-through ─────────────────────────────────────────────────
// The one image route: hand every image block to the main model verbatim, and
// additionally persist the bytes so the message can carry a stable path the
// model may re-read at any later point (放大、复核细节、换 instruction 再看一遍).

/** Whether a message content array carries at least one image block. */
export function hasImageBlock(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => block && block.type === 'image')
}

/** Whether any message in the batch carries an image block. */
export function hasAnyImage(messages: readonly UserMessage[]): boolean {
  return messages.some((message) => hasImageBlock(message.content))
}

/** Marker introducing the saved-path note appended after a persisted image. */
export const SAVED_IMAGE_PREFIX = '【图片已保存】'

/**
 * Plan one pre-step batch: keep every image block in place and append a
 * saved-path note after each one whose bytes were persisted. Non-image blocks
 * — including text blocks that mention image paths — pass through untouched,
 * because the main model can open those paths itself.
 *
 * Pure over its inputs (the only side effect is the injected `persist`), so the
 * pass-through contract is unit-testable without a running host.
 * @param messages - the step's messages as authored.
 * @param persist - image-persistence callback (path, or null when unavailable).
 * @param signal - optional abort signal forwarded to `persist`.
 * @returns a new message list; the input is never mutated.
 */
export async function planPreStep(
  messages: readonly UserMessage[],
  persist: PersistImage,
  signal?: AbortSignal
): Promise<UserMessage[]> {
  const out: UserMessage[] = []
  for (const message of messages) {
    const content = message.content
    if (!hasImageBlock(content)) {
      out.push(message)
      continue
    }
    const blocks: ContentBlock[] = []
    for (const block of content) {
      if (block.type !== 'image') {
        blocks.push(block)
        continue
      }
      // 原图直接给主模型：全保真，不经过任何转述。
      blocks.push(block)
      let saved: string | null = null
      try {
        saved = await persist(block.attachment, signal)
      } catch {
        saved = null // persistence is best-effort; the image still goes through
      }
      if (saved !== null) blocks.push({ type: 'text', text: `${SAVED_IMAGE_PREFIX}\`${saved}\`` })
    }
    out.push({ ...message, content: blocks })
  }
  return out
}
