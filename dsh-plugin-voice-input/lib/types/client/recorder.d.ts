export interface RecorderResult {
    /** WAV bytes (16-bit PCM mono at the context's sample rate). */
    blob: Blob;
    /** Recorded duration in seconds (fractional). */
    seconds: number;
    /** True when the captured audio is effectively silent (peak < 1%). */
    silent: boolean;
}
export interface RecorderHandle {
    /** Stop recording and resolve with the captured clip. Idempotent. */
    stop(): Promise<RecorderResult>;
}
export interface RecorderOptions {
    /** Safety-net stop after this many seconds (0 = unlimited). */
    maxSeconds: number;
    /** Live duration callback, throttled to ~4 calls per second. */
    onDuration?: (seconds: number) => void;
}
/** Encode 16-bit PCM mono samples as a RIFF/WAVE blob. */
export declare function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob;
/**
 * Acquire the microphone and start recording. Resolves once the stream is
 * live (so callers can await it before wiring up the "recording" UI); the
 * returned handle's `stop()` finishes the clip.
 */
export declare function createRecorder(options: RecorderOptions): Promise<RecorderHandle>;
