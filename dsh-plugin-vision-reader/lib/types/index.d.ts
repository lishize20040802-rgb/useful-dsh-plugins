import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export type { ImageRef as VisionImageRef, VisionLlm, VisionResult } from './vision.js';
export { callVision, transcribeBlocks, transcribeTextPaths, findImagePaths, readImageRef } from './vision.js';
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
    /** Auto-transcribe pasted images before they reach the main model. */
    transcribeImages: boolean;
    /** Hide the built-in read_image tool while the main model is text-only. */
    autoHideReadImage: boolean;
    /** Optional instruction override used when the model gives none. */
    instruction: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    provider: z<string, string>;
    model: z<string, string>;
    transcribeImages: z<boolean, boolean>;
    autoHideReadImage: z<boolean, boolean>;
    instruction: z<string, string>;
}>, Schemastery.ObjectT<{
    provider: z<string, string>;
    model: z<string, string>;
    transcribeImages: z<boolean, boolean>;
    autoHideReadImage: z<boolean, boolean>;
    instruction: z<string, string>;
}>>;
/** Normalize and validate the plugin configuration. */
export declare function normalizeConfig(raw: unknown): VisionReaderConfig;
export declare function apply(ctx: Context, rawConfig: unknown): void;
