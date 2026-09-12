// dsh-plugin-voice-input — browser-half recorder.
//
// Records mono PCM through a ScriptProcessor node, encodes a 16-bit WAV blob
// on the fly, and reports the live duration. Zero dependencies; runs in any
// Chromium shell. The pipeline is feedback-proof: the mic signal only ever
// reaches a zero-gain sink, never the speakers.

export interface RecorderResult {
  /** WAV bytes (16-bit PCM mono at the context's sample rate). */
  blob: Blob
  /** Recorded duration in seconds (fractional). */
  seconds: number
  /** True when the captured audio is effectively silent (peak < 1%). */
  silent: boolean
}

export interface RecorderHandle {
  /** Stop recording and resolve with the captured clip. Idempotent. */
  stop(): Promise<RecorderResult>
}

export interface RecorderOptions {
  /** Safety-net stop after this many seconds (0 = unlimited). */
  maxSeconds: number
  /** Live duration callback, throttled to ~4 calls per second. */
  onDuration?: (seconds: number) => void
}

/** Peak threshold below which a clip counts as silence. */
const SILENCE_PEAK = 0.01

/** Encode 16-bit PCM mono samples as a RIFF/WAVE blob. */
export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  let length = 0
  for (const chunk of chunks) length += chunk.length
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, length * 2, true)
  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]!))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Acquire the microphone and start recording. Resolves once the stream is
 * live (so callers can await it before wiring up the "recording" UI); the
 * returned handle's `stop()` finishes the clip.
 */
export async function createRecorder(options: RecorderOptions): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })

  let context: AudioContext
  try {
    context = new AudioContext({ sampleRate: 16000 })
  } catch {
    context = new AudioContext()
  }
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const sink = context.createGain()
  sink.gain.value = 0

  const chunks: Float32Array[] = []
  let peak = 0
  let live = true

  processor.onaudioprocess = (event) => {
    if (!live) return
    const data = event.inputBuffer.getChannelData(0)
    const copy = new Float32Array(data)
    chunks.push(copy)
    for (let i = 0; i < copy.length; i++) {
      const value = Math.abs(copy[i]!)
      if (value > peak) peak = value
    }
  }
  source.connect(processor)
  processor.connect(sink)
  sink.connect(context.destination)

  const started = Date.now()
  let finished = false
  let resolveResult: (result: RecorderResult) => void = () => {}
  const done = new Promise<RecorderResult>((resolve) => {
    resolveResult = resolve
  })

  const finish = () => {
    if (finished) return
    finished = true
    live = false
    if (autoStop !== undefined) clearTimeout(autoStop)
    clearInterval(ticker)
    for (const track of stream.getTracks()) track.stop()
    source.disconnect()
    processor.disconnect()
    sink.disconnect()
    void context.close()
    const elapsed = (Date.now() - started) / 1000
    const seconds = options.maxSeconds > 0 ? Math.min(elapsed, options.maxSeconds) : elapsed
    resolveResult({
      blob: encodeWav(chunks, context.sampleRate),
      seconds,
      silent: peak < SILENCE_PEAK
    })
  }

  // maxSeconds is a safety net only: 0 disables it (the upstream has no
  // duration limit) — the recording ends when the caller calls stop().
  const autoStop = options.maxSeconds > 0 ? setTimeout(finish, options.maxSeconds * 1000) : undefined
  const ticker = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000
    options.onDuration?.(options.maxSeconds > 0 ? Math.min(elapsed, options.maxSeconds) : elapsed)
  }, 250)

  return {
    stop: () => {
      finish()
      return done
    }
  }
}
