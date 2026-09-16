/** Sample rate the engine is fed with (SenseVoice's expected input). */
export declare const TARGET_RATE = 16000;
/** Parsed RIFF/WAVE geometry (chunk-walking, so any fmt layout works). */
export interface WavHeader {
    channels: number;
    sampleRate: number;
    bits: number;
    dataOffset: number;
    dataLength: number;
}
/** Parse a RIFF/WAVE header, walking chunks until the `data` chunk is found. */
export declare function parseWavHeader(buffer: Buffer): WavHeader;
/** Wrap raw 16-bit mono samples in a RIFF/WAVE container. */
export declare function encodePcm16(samples: Int16Array, sampleRate: number): Buffer;
/**
 * Normalize a recorded clip to 16 kHz mono 16-bit PCM.
 *
 * The browser asks the AudioContext for 16 kHz, but not every shell honours
 * that, so the host never trusts it: multi-channel input is downmixed and any
 * other sample rate is resampled. A non-16-bit clip is rejected with a
 * readable message instead of being fed to the engine as garbage.
 */
export declare function normalizeWav(buffer: Buffer): Buffer;
/** Where the engine and its model live on disk. */
export interface RuntimePaths {
    /** Runtime root (default `<DSH_HOME>/third-party/data/voice-input`). */
    dir: string;
    /** Directory holding the CLI and its DLLs. */
    engineDir: string;
    /** The sherpa-onnx offline CLI. */
    exePath: string;
    /** Directory holding the SenseVoice model. */
    modelDir: string;
    /** The SenseVoice ONNX model. */
    modelPath: string;
    /** The model's token table. */
    tokensPath: string;
}
/** Derive every runtime path from the runtime root. */
export declare function runtimePaths(dir: string): RuntimePaths;
/** Engine invocation settings. */
export interface EngineOptions extends RuntimePaths {
    /** CPU threads for the ONNX session. */
    threads: number;
    /** `auto`/`zh`/`en`/`ja`/`ko`/`yue`. */
    language: string;
    /** Inverse text normalization (`十点` → `10点`). */
    itn: boolean;
    /** Kill the child after this long. */
    timeoutMs: number;
}
/** One transcription plus how long it took (engine startup included). */
export interface TranscribeOutcome {
    text: string;
    ms: number;
}
/**
 * Build the CLI argument list (exported for testing).
 *
 * `--print-args=false` keeps the kaldi banner off stderr, and the language
 * flag is omitted for `auto` so the model detects it itself.
 */
export declare function buildArgs(wavPath: string, options: EngineOptions): string[];
/**
 * Pull the transcript out of the engine's stdout (exported for testing).
 *
 * The CLI prints one JSON object per input file; the last one wins, so a
 * partial result can never override a complete one.
 */
export declare function parseResult(stdout: string): string;
/**
 * Transcribe one clip with the local engine.
 * @param wav - recorded WAV bytes (any channel count / sample rate)
 * @param options - engine paths and invocation settings
 * @returns the transcript and the wall-clock cost
 */
export declare function transcribeLocal(wav: Buffer, options: EngineOptions): Promise<TranscribeOutcome>;
/** Default thread count: half the cores, clamped to something sane. */
export declare function resolveThreads(configured: number): number;
/**
 * One-at-a-time task queue for engine spawns.
 *
 * Each spawn loads a 228 MB ONNX model, so overlapping requests would fight
 * for memory and CPU for no benefit; they queue instead, and a failed task
 * never blocks the ones behind it.
 */
export declare class SerialQueue {
    private tail;
    run<T>(task: () => Promise<T>): Promise<T>;
}
