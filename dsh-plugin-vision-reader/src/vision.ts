// dsh-plugin-vision-reader — vision call logic (pure, unit-testable).
//
// Everything that talks to the multimodal model lives here, separated from
// the cordis plugin contract so the transcription and tool flows share one
// implementation and the pure parts can be tested without a running host.
import type { ContentBlock, FinishReason, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
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
