import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/** Minimal llm service face (structural subset of the host service). */
export interface VisionLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Minimal attachment-store face needed to persist the page snapshot. */
export interface VisionAttachments {
    saveImage(input: {
        data: Uint8Array;
        mediaType: string;
        name?: string;
    }): Promise<ImageAttachmentRef>;
}
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
export declare function transcribeImage(llm: VisionLlm, attachments: VisionAttachments, cfg: {
    provider: string;
    model: string;
}, imagePath: string, instruction: string, signal?: AbortSignal): Promise<{
    ok: true;
    text: string;
} | {
    ok: false;
    error: string;
}>;
/** Default transcription instruction (full-text extraction). */
export declare const TRANSCRIBE_INSTRUCTION = "\u8BF7\u628A\u8FD9\u4E00\u9875\u7684\u5168\u90E8\u6587\u5B57\u5185\u5BB9\u539F\u6837\u63D0\u53D6\u51FA\u6765\uFF0C\u5305\u62EC\u6B63\u6587\u3001\u516C\u5F0F\u3001\u8868\u683C\u4E2D\u7684\u6587\u5B57\uFF0C\u4FDD\u6301\u5206\u6BB5\u4E0E\u7F16\u53F7\u3002";
