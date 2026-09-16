// dsh-plugin-voice-input — browser-half bridge to the host's local ASR route.
//
// One module knows the /api/asr contract: the state probe, one transcription
// request, and the first-run wait loop that turns a "the model is downloading"
// answer into visible progress instead of an error.

/** Live first-run state reported by the host. */
export interface ProvisionProgress {
  active: boolean
  phase: string
  label: string
  received: number
  total: number
  error: string
}

/** Host bridge state (GET /api/asr). */
export interface AsrStatus {
  ready: boolean
  engine: string
  runtimeDir: string
  downloadBytes: number
  provisioning: ProvisionProgress
}

/** Outcome of one POST /api/asr call. */
export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; message: string; provisioning: boolean }

/** Percentage of the first-run download, clamped to 0…100. */
export function percentOf(progress: ProvisionProgress | undefined, downloadBytes = 0): number {
  if (progress === undefined) return 0
  const total = progress.total > 0 ? progress.total : downloadBytes
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress.received / total) * 100)))
}

/** Ask the host for its bridge state; null when the host cannot be reached. */
export async function fetchStatus(signal?: AbortSignal): Promise<AsrStatus | null> {
  try {
    const res = await fetch('/api/asr', { headers: { accept: 'application/json' }, signal })
    if (!res.ok) return null
    return (await res.json()) as AsrStatus
  } catch {
    return null
  }
}

/** POST one recorded clip and translate the answer for the UI. */
export async function requestTranscription(blob: Blob, signal?: AbortSignal): Promise<TranscriptionResult> {
  const res = await fetch('/api/asr', {
    method: 'POST',
    headers: { 'content-type': 'audio/wav', 'x-file-name': 'speech.wav' },
    body: blob,
    signal
  })
  const body = (await res.json().catch(() => null)) as
    | { text?: string; error?: { message?: string }; provisioning?: boolean }
    | null
  if (res.ok) return { ok: true, text: body?.text ?? '' }
  return {
    ok: false,
    message: body?.error?.message ?? '',
    provisioning: body?.provisioning === true
  }
}

/**
 * Poll the host until the local runtime is ready.
 * @param onProgress - called with the download percentage and step label
 * @param timeoutMs - give up after this long
 * @returns true once the runtime is ready, false on failure or timeout
 */
export async function waitUntilReady(
  onProgress: (percent: number, label: string) => void,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    signal?.throwIfAborted()
    const status = await fetchStatus(signal)
    if (status === null) continue
    if (status.ready) {
      onProgress(100, '')
      return true
    }
    const state = status.provisioning
    if (state !== undefined && state.error !== '') return false
    onProgress(percentOf(state, status.downloadBytes), state?.label ?? '')
  }
  return false
}
