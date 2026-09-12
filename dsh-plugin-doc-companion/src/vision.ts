// dsh-plugin-doc-companion — scanned-page transcription (host side).
//
// A scanned PDF page has no text layer, so doc_current / doc_page would return
// an empty block. When the reader panel has rendered such a page it saves a
// PNG snapshot (POST /api/doc/docs/:id/block-image); this module hands that
// snapshot to the built-in multimodal model (same key as the main model,
// mirroring dsh-plugin-vision-reader's callVision) and returns the extracted
// text. Transcription is cached by the store, so each scanned page costs at
// most one vision call.
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createUserMessage, type ContentBlock, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** Minimal llm service face (structural subset of the host service). */
export interface VisionLlm {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Minimal attachment-store face needed to persist the page snapshot. */
export interface VisionAttachments {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<ImageAttachmentRef>
}

/** System prompt for the transcription call: extract, do not editorialize. */
const VISION_SYSTEM =
  '你是一个多模态视觉识别代理。用户会给你一张书本/试卷页面的截图，你需要原样提取这一页的全部文字内容，' +
  '包括正文、公式、表格里的文字。保持原有分段和编号，只输出提取的文字，不要解释、不要总结、不要添加任何说明。'

/**
 * Transcribe one page snapshot through the configured vision model.
 * @param llm - the llm service face.
 * @param attachments - the attachment store face (persists the snapshot).
 * @param cfg - vision provider/model route.
 * @param imagePath - absolute path of the PNG snapshot.
 * @param instruction - what to look at (defaults to full text extraction).
 * @param signal - optional abort signal forwarded to the stream.
 * @returns the transcribed text, or an error description.
 */
export async function transcribeImage(
  llm: VisionLlm,
  attachments: VisionAttachments,
  cfg: { provider: string; model: string },
  imagePath: string,
  instruction: string,
  signal?: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const data = await readFile(imagePath)
    const ref = await attachments.saveImage({ data, mediaType: 'image/png', name: basename(imagePath) })
    const content: ContentBlock[] = [
      { type: 'text', text: instruction },
      { type: 'image', attachment: ref }
    ]
    const parts: string[] = []
    for await (const chunk of llm.stream({
      provider: cfg.provider,
      model: cfg.model,
      system: VISION_SYSTEM,
      messages: [createUserMessage({ content, source: { kind: 'user' } })],
      signal
    })) {
      if (chunk.type === 'text-delta') parts.push(chunk.text)
    }
    const text = parts.join('').trim()
    if (!text) return { ok: false, error: 'vision model returned empty content' }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Default transcription instruction (full-text extraction). */
export const TRANSCRIBE_INSTRUCTION =
  '请把这一页的全部文字内容原样提取出来，包括正文、公式、表格中的文字，保持分段与编号。'
