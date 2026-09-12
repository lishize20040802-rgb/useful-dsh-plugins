import type { GenerateOptions, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { VisionReaderConfig } from './index.js';
/**
 * Persist one pasted image to a stable local file so the model can re-read it
 * later (the clipboard is not a durable store). Returns the saved absolute
 * path, or null when persistence is unavailable/failed — the image still
 * reaches the model either way.
 */
export type PersistImage = (attachment: ImageAttachmentRef, signal?: AbortSignal) => Promise<string | null>;
/** The durable attachment reference a vision call carries. */
export type ImageRef = ImageAttachmentRef;
/** Minimal LLM service face the vision flow needs. */
export interface VisionLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Accepted image extensions mapped to media types (mirrors read_image). */
export declare const IMAGE_EXTENSIONS: Record<string, ImageMediaType>;
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
/** Whether a message content array carries at least one image block. */
export declare function hasImageBlock(content: unknown): boolean;
/** Whether any message in the batch carries an image block. */
export declare function hasAnyImage(messages: readonly UserMessage[]): boolean;
/** Marker introducing the saved-path note appended after a persisted image. */
export declare const SAVED_IMAGE_PREFIX = "\u3010\u56FE\u7247\u5DF2\u4FDD\u5B58\u3011";
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
export declare function planPreStep(messages: readonly UserMessage[], persist: PersistImage, signal?: AbortSignal): Promise<UserMessage[]>;
