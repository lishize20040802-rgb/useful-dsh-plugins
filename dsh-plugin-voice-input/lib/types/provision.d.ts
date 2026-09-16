import http from 'node:http';
import { type RuntimePaths } from './local';
/** sherpa-onnx release holding the Windows CLI build. */
export declare const ENGINE_VERSION = "1.13.8";
/** The Windows x64 shared build (CLI + onnxruntime DLLs, no TTS). */
export declare const ENGINE_ARCHIVE = "sherpa-onnx-v1.13.8-win-x64-shared-MD-Release-no-tts.tar.bz2";
/** Archive root directory created by the tarball. */
export declare const ENGINE_ARCHIVE_ROOT = "sherpa-onnx-v1.13.8-win-x64-shared-MD-Release-no-tts";
/** Exact byte size of the release asset (verified after download). */
export declare const ENGINE_BYTES = 19164933;
/** Where the engine tarball is fetched from, in order. */
export declare const ENGINE_URLS: string[];
/** The open-source model repository (FunASR SenseVoice-Small, ONNX export). */
export declare const MODEL_REPO = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
/** Model hosts, in order: the origin and its mirror. */
export declare const MODEL_HOSTS: string[];
export declare const MODEL_RELEASE_BASE_URL = "https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/voice-model-sensevoice-2024-07-17";
/** Model files with their exact sizes. */
export declare const MODEL_FILES: readonly {
    name: string;
    bytes: number;
    sha256: string;
}[];
/** Optional release asset directory; pinned model digests apply to every source. */
export declare function modelDownloadUrls(name: string, configured?: string): string[];
export declare function fileSha256(path: string): Promise<string>;
/** Total bytes a complete first-run preparation downloads. */
export declare const TOTAL_BYTES: number;
/** Progress of one download callback. */
export interface DownloadProgress {
    /** Bytes of this file already on disk. */
    received: number;
    /** Expected size of this file (0 when unknown). */
    total: number;
}
/** Live state of the runtime preparation, as reported to the browser half. */
export interface ProvisionState {
    active: boolean;
    phase: 'idle' | 'engine' | 'model' | 'verify' | 'done' | 'failed';
    /** Human-readable step, shown while the user waits. */
    label: string;
    received: number;
    total: number;
    error: string;
    startedAt: number;
    finishedAt: number;
}
/** What is present and what still has to be fetched. */
export interface RuntimeInspection {
    ready: boolean;
    missing: string[];
    bytes: number;
}
/** Check the runtime without touching the network. */
export declare function inspectRuntime(paths: RuntimePaths): RuntimeInspection;
/**
 * Runtime root used when the profile does not configure one.
 *
 * Follow the host's DSH_HOME resolution; an explicit runtimeDir still wins.
 */
export declare function defaultRuntimeDir(): string;
/** The Windows system proxy, or `` when none is configured. */
export declare function systemProxy(): string;
/**
 * Resolve the proxy to use: explicit config, then environment, then the
 * Windows system proxy. An empty string means "connect directly".
 */
export declare function resolveProxy(configured?: string): string;
/** A finished HTTP response plus the stream to read it from. */
interface OpenResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    stream: http.IncomingMessage;
}
/** GET `url`, tunnelling through `proxy` when one is configured. */
export declare function openResponse(url: string, proxy: string, headers: Record<string, string>, redirects?: number): Promise<OpenResponse>;
/** Try every mirror in order, then give up with the last error. */
export declare function downloadFile(urls: readonly string[], dest: string, options: {
    proxy?: string;
    expected?: number;
    sha256?: string;
    onProgress?: (progress: DownloadProgress) => void;
}): Promise<void>;
/** Extract a .tar.bz2 archive with the tar that ships with Windows. */
export declare function extractArchive(archive: string, destDir: string): Promise<void>;
/** Current preparation state for one runtime directory. */
export declare function runtimeState(dir: string): ProvisionState;
/**
 * Download everything the local engine needs, at most once per directory.
 *
 * Two callers racing for the same directory share one promise, so a plugin
 * start and a browser request can never download the same 230 MB twice.
 */
export declare function ensureRuntime(options: {
    dir: string;
    proxy?: string;
    modelBaseUrl?: string;
    force?: boolean;
}): Promise<RuntimePaths>;
export {};
