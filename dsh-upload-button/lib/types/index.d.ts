import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "upload-button";
/** Services required by the node half. */
export declare const inject: string[];
/** Validated configuration shape (schema output contract). */
export interface UploadButtonConfig {
    maxBytes: number;
    uploadDir: string;
    allowedExtensions: string[];
}
export declare const Config: z<Schemastery.ObjectS<{
    maxBytes: z<number, number>;
    uploadDir: z<string, string>;
    allowedExtensions: z<string[], string[]>;
}>, Schemastery.ObjectT<{
    maxBytes: z<number, number>;
    uploadDir: z<string, string>;
    allowedExtensions: z<string[], string[]>;
}>>;
/** Resolve once at plugin activation: relative data paths belong to DSH_HOME. */
export declare function resolveUploadDir(value?: string): string;
/**
 * Strip path separators, parent traversal, control characters and leading
 * dots from a client-supplied file name; never empty.
 * @param raw - decoded file name
 * @returns a safe basename
 */
export declare function sanitizeFileName(raw: string): string;
/** Options for the upload route handler (exported for unit testing). */
export interface UploadHandlerOptions {
    /** Directory uploads are persisted to. */
    dir: string;
    /** Hard byte cap for one upload body. */
    maxBytes: number;
    /** Optional lowercase extension whitelist (empty = any). */
    allowedExtensions?: string[];
}
/**
 * Build the upload route handler (exported for unit testing).
 * @param options - persistence and admission options
 * @returns an async `(req, res)` handler
 */
export declare function createUploadHandler(options: UploadHandlerOptions): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
export declare function apply(ctx: Context, config: UploadButtonConfig): void;
