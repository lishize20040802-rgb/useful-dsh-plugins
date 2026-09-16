import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { SerialQueue, type EngineOptions, type RuntimePaths } from './local';
import { type ProvisionState, type RuntimeInspection } from './provision';
export { SerialQueue, buildArgs, normalizeWav, parseResult, parseWavHeader, resolveThreads, runtimePaths, transcribeLocal } from './local';
export type { EngineOptions, RuntimePaths, TranscribeOutcome, WavHeader } from './local';
export { ENGINE_BYTES, ENGINE_URLS, MODEL_FILES, MODEL_HOSTS, TOTAL_BYTES, defaultRuntimeDir, downloadFile, ensureRuntime, extractArchive, inspectRuntime, modelDownloadUrls, fileSha256, openResponse, resolveProxy, runtimeState, systemProxy } from './provision';
export type { DownloadProgress, ProvisionState, RuntimeInspection } from './provision';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "voice-input";
/** Services required by the node half. */
export declare const inject: string[];
/** Default sink for the engine CLI and model in DSH_HOME. */
export declare const FALLBACK_RUNTIME_DIR: string;
/** Default upstream timeout for one transcription (engine startup included). */
export declare const DEFAULT_TIMEOUT_MS = 120000;
/** Default byte cap for one recorded clip (64 MB ≈ 33 min of 16k/16bit mono). */
export declare const DEFAULT_MAX_BYTES: number;
/** Validated configuration shape (schema output contract). */
export interface VoiceInputConfig {
    runtimeDir: string;
    exePath: string;
    modelPath: string;
    tokensPath: string;
    language: string;
    itn: boolean;
    threads: number;
    autoProvision: boolean;
    proxy: string;
    modelBaseUrl?: string;
    maxBytes: number;
    timeoutMs: number;
}
export declare const Config: z<Schemastery.ObjectS<{
    /** Runtime root; empty selects the third-party data directory or existing legacy directory. */
    runtimeDir: z<string, string>;
    /** Advanced: use an engine CLI from somewhere else. */
    exePath: z<string, string>;
    /** Advanced: use a model file from somewhere else. */
    modelPath: z<string, string>;
    /** Advanced: use a token table from somewhere else. */
    tokensPath: z<string, string>;
    /** SenseVoice language: auto | zh | en | ja | ko | yue. */
    language: z<string, string>;
    /** Inverse text normalization (十点 → 10点). */
    itn: z<boolean, boolean>;
    /** CPU threads for the ONNX session; 0 = auto (half the cores, 2…8). */
    threads: z<number, number>;
    /** Fetch the engine and model on first use when they are missing. */
    autoProvision: z<boolean, boolean>;
    /** Proxy for the first-run download; empty = HTTPS_PROXY or the Windows system proxy. */
    proxy: z<string, string>;
    modelBaseUrl: z<string, string>;
    maxBytes: z<number, number>;
    timeoutMs: z<number, number>;
}>, Schemastery.ObjectT<{
    /** Runtime root; empty selects the third-party data directory or existing legacy directory. */
    runtimeDir: z<string, string>;
    /** Advanced: use an engine CLI from somewhere else. */
    exePath: z<string, string>;
    /** Advanced: use a model file from somewhere else. */
    modelPath: z<string, string>;
    /** Advanced: use a token table from somewhere else. */
    tokensPath: z<string, string>;
    /** SenseVoice language: auto | zh | en | ja | ko | yue. */
    language: z<string, string>;
    /** Inverse text normalization (十点 → 10点). */
    itn: z<boolean, boolean>;
    /** CPU threads for the ONNX session; 0 = auto (half the cores, 2…8). */
    threads: z<number, number>;
    /** Fetch the engine and model on first use when they are missing. */
    autoProvision: z<boolean, boolean>;
    /** Proxy for the first-run download; empty = HTTPS_PROXY or the Windows system proxy. */
    proxy: z<string, string>;
    modelBaseUrl: z<string, string>;
    maxBytes: z<number, number>;
    timeoutMs: z<number, number>;
}>>;
/** Options for the asr route handler (exported for unit testing). */
export interface AsrHandlerOptions {
    /** Engine paths + invocation settings. */
    engine: EngineOptions;
    /** Hard byte cap for one request body. */
    maxBytes: number;
    /** Fetch a missing runtime on demand. */
    autoProvision: boolean;
    /** Serializes engine spawns (one 228 MB model load at a time). */
    queue: SerialQueue;
    /** Runtime probe (injectable for tests). */
    inspect?: () => RuntimeInspection;
    /** Runtime preparation (injectable for tests). */
    ensure?: () => Promise<RuntimePaths>;
    /** Live preparation state for the health probe (injectable for tests). */
    state?: () => ProvisionState;
    /** Injectable transcriber (defaults to the local engine). */
    transcribe?: (audio: Buffer) => Promise<string>;
}
/** Build the asr route handler (exported for unit testing). */
export declare function createAsrHandler(options: AsrHandlerOptions): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
/**
 * Resolve the engine layout: explicit file overrides win, everything else
 * comes from `runtimeDir` (default loaded from ./provision).
 */
export declare function resolveEngine(config: VoiceInputConfig): EngineOptions;
export declare function apply(ctx: Context, config: VoiceInputConfig): void;
