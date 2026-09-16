import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment';
export type { ImageRef as VisionImageRef, PersistImage, VisionLlm, VisionResult } from './vision.js';
export { callVision, hasAnyImage, hasImageBlock, planPreStep, SAVED_IMAGE_PREFIX } from './vision.js';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "vision-reader";
/** Services required by the node half. */
export declare const inject: string[];
/** Validated configuration shape (schema output contract). */
export interface VisionReaderConfig {
    /** Registered provider route owning the vision model. */
    provider: string;
    /** Multimodal model id on that provider. */
    model: string;
    /** Optional instruction override used when the model gives none. */
    instruction: string;
    /** Directory pasted images are persisted to; empty uses <DSH_HOME>/vision-inbox. */
    inboxDir: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    provider: z<string, string>;
    model: z<string, string>;
    instruction: z<string, string>;
    inboxDir: z<string, string>;
}>, Schemastery.ObjectT<{
    provider: z<string, string>;
    model: z<string, string>;
    instruction: z<string, string>;
    inboxDir: z<string, string>;
}>>;
/**
 * Settings namespace this plugin owns. The browser half registers its info
 * card under the same key (`settings.plugin.item`), which is how the official
 * Plugins tab pairs the two: key → namespace, with the tab staying ignorant of
 * what the namespace means.
 */
export declare const SETTINGS_NS = "vision-reader";
/** Normalize and validate the plugin configuration. */
export declare function normalizeConfig(raw: unknown): VisionReaderConfig;
/**
 * Persist image bytes to `dir` with a content-addressed file name
 * (`<sha256-prefix>-<name><ext>`); identical content maps to the same file.
 * @param dir - target directory (created recursively).
 * @param data - image bytes.
 * @param mediaType - image media type (drives the extension).
 * @param name - display basename (sanitized; may be empty).
 * @returns the absolute saved path.
 */
export declare function persistImageFile(dir: string, data: Uint8Array, mediaType: ImageMediaType, name: string): Promise<string>;
export declare function apply(ctx: Context, rawConfig: unknown): void;
