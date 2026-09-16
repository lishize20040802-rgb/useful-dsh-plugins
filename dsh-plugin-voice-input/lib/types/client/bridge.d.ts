/** Live first-run state reported by the host. */
export interface ProvisionProgress {
    active: boolean;
    phase: string;
    label: string;
    received: number;
    total: number;
    error: string;
}
/** Host bridge state (GET /api/asr). */
export interface AsrStatus {
    ready: boolean;
    engine: string;
    runtimeDir: string;
    downloadBytes: number;
    provisioning: ProvisionProgress;
}
/** Outcome of one POST /api/asr call. */
export type TranscriptionResult = {
    ok: true;
    text: string;
} | {
    ok: false;
    message: string;
    provisioning: boolean;
};
/** Percentage of the first-run download, clamped to 0…100. */
export declare function percentOf(progress: ProvisionProgress | undefined, downloadBytes?: number): number;
/** Ask the host for its bridge state; null when the host cannot be reached. */
export declare function fetchStatus(signal?: AbortSignal): Promise<AsrStatus | null>;
/** POST one recorded clip and translate the answer for the UI. */
export declare function requestTranscription(blob: Blob, signal?: AbortSignal): Promise<TranscriptionResult>;
/**
 * Poll the host until the local runtime is ready.
 * @param onProgress - called with the download percentage and step label
 * @param timeoutMs - give up after this long
 * @returns true once the runtime is ready, false on failure or timeout
 */
export declare function waitUntilReady(onProgress: (percent: number, label: string) => void, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
