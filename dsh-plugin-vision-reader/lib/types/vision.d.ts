import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { VisionReaderConfig } from './index.js';
/** The durable attachment reference a vision call carries. */
export type ImageRef = ImageAttachmentRef;
/** Minimal LLM service face the vision flow needs. */
export interface VisionLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Result of one vision call. */
export type VisionResult = {
    ok: true;
    text: string;
} | {
    ok: false;
    error: string;
};
/**
 * Call the configured multimodal model with image attachment references and
 * return the assembled text.
 * @param llm - the LLM service face.
 * @param cfg - resolved plugin configuration (provider/model).
 * @param instruction - what to look at in the image(s).
 * @param refs - durable image attachment references.
 * @param signal - optional abort signal forwarded to the stream.
 */
export declare function callVision(llm: VisionLlm, cfg: VisionReaderConfig, instruction: string, refs: ImageRef[], signal?: AbortSignal): Promise<VisionResult>;
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
export declare function transcribeBlocks(llm: VisionLlm, cfg: VisionReaderConfig, blocks: ContentBlock[], signal: AbortSignal | undefined, cache: Map<string, string>): Promise<ContentBlock[]>;
