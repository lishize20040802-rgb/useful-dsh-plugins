import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { VisionReaderConfig } from './index.js';
/** The durable attachment reference a vision call carries. */
export type ImageRef = ImageAttachmentRef;
/** Minimal LLM service face the vision flow needs. */
export interface VisionLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Minimal attachment-store face the transcription flow needs. */
export interface VisionAttachments {
    imageLimits: {
        mediaTypes: readonly ImageMediaType[];
        maxImageBytes?: number;
        maxMessageImageBytes?: number;
    };
    saveImage(input: {
        data: Uint8Array;
        mediaType: ImageMediaType;
        name?: string;
    }): Promise<ImageRef>;
}
/** Minimal fs face the transcription flow needs. */
export interface VisionFs {
    resolve(path: string): Promise<{
        displayPath: string;
    }>;
    readBytes(target: {
        displayPath: string;
    }, signal: AbortSignal | undefined, byteCap: number): Promise<Uint8Array>;
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
/** One recognized image path inside a text block. */
export interface PathMatch {
    /** Full path as written in the text. */
    path: string;
    /** Index where the path starts in the text. */
    start: number;
    /** Index just past the path end. */
    end: number;
}
/**
 * Find every image path inside a text string. Matches Windows or POSIX
 * absolute paths ending in a supported image extension (optionally quoted).
 * Paths may be inline code (`` `path` ``) or plain text; the backticks are
 * part of the match so the rewrite keeps the file card rendering.
 * @param text - the raw text block content.
 * @returns matches sorted by start index.
 */
export declare function findImagePaths(text: string): PathMatch[];
/**
 * Read one image file through the attachments store (same admission rules as
 * the `vision` tool) and return the durable reference.
 * @param fs - the fs service face.
 * @param attachments - the attachment store face.
 * @param path - the image path.
 * @param signal - optional abort signal.
 * @returns the durable reference, or undefined when the path is not a readable image.
 */
export declare function readImageRef(fs: VisionFs, attachments: VisionAttachments, path: string, signal: AbortSignal | undefined): Promise<ImageRef | undefined>;
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
export declare function transcribeTextPaths(llm: VisionLlm, cfg: VisionReaderConfig, fs: VisionFs, attachments: VisionAttachments, text: string, signal: AbortSignal | undefined, cache: Map<string, string>): Promise<string>;
