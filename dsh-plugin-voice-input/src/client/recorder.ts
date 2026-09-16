// Capture PCM locally. AudioWorklet keeps collection off the UI thread.
export interface RecorderResult {
  blob: Blob
  /** Actual captured sample count / sample rate, not wall-clock time. */
  seconds: number
  silent: boolean
}

export interface RecorderHandle {
  stop(): Promise<RecorderResult>
  /** Also resolves on the recording time limit. */
  done: Promise<RecorderResult>
}

export interface RecorderOptions {
  maxSeconds: number
  onDuration?: (seconds: number) => void
}

/** Browser processing preferences; unsupported constraints are ignored by browsers. */
export const RAW_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  channelCount: { ideal: 1 }
}

/** Self-contained worklet code, with no remote scripts or audio uploads. */
export const CAPTURE_WORKLET = `
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.live = true;
    this.buffer = new Float32Array(1024);
    this.used = 0;
    this.port.onmessage = (event) => {
      if (event.data !== 'stop') return;
      this.live = false;
      this.flush();
      this.port.postMessage({ stopped: true });
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.used = 0;
  }
  process(inputs) {
    if (!this.live) return false;
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let frame = 0; frame < channels[0].length; frame++) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame] / channels.length;
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('dsh-voice-capture', VoiceCapture);
`

export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  tag(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); tag(8, 'WAVE')
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, length * 2, true)
  let offset = 44
  for (const chunk of chunks) for (const value of chunk) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function createRecorder(options: RecorderOptions): Promise<RecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone requires localhost or HTTPS.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO_CONSTRAINTS })
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let processor: AudioNode | undefined
  let sink: GainNode | undefined
  let ticker: ReturnType<typeof setInterval> | undefined
  let autoStop: ReturnType<typeof setTimeout> | undefined
  let live = true
  let stopping = false
  let frames = 0
  let peak = 0
  const chunks: Float32Array[] = []
  const cleanup = async () => {
    live = false
    clearInterval(ticker)
    clearTimeout(autoStop)
    for (const track of stream.getTracks()) track.stop()
    source?.disconnect(); processor?.disconnect(); sink?.disconnect()
    if (context && context.state !== 'closed') await context.close().catch(() => {})
  }
  try {
    try { context = new AudioContext({ sampleRate: 16000 }) }
    catch { context = new AudioContext() }
    // getUserMedia permission prompts may leave the audio context suspended.
    await context.resume()
    source = context.createMediaStreamSource(stream)
    sink = context.createGain()
    sink.gain.value = 0
    const rate = context.sampleRate
    const frameLimit = options.maxSeconds > 0 ? Math.floor(options.maxSeconds * rate) : Infinity
    const collect = (data: Float32Array) => {
      if (!live || frames >= frameLimit) return
      const count = Math.min(data.length, frameLimit - frames)
      const copy = data.slice(0, count)
      chunks.push(copy)
      frames += count
      for (const sample of copy) peak = Math.max(peak, Math.abs(sample))
    }
    let flush: () => Promise<void> = async () => {}
    if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }))
      try { await context.audioWorklet.addModule(url) }
      finally { URL.revokeObjectURL(url) }
      const node = new AudioWorkletNode(context, 'dsh-voice-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        channelCountMode: 'max', channelInterpretation: 'discrete'
      })
      processor = node
      let acknowledge: (() => void) | undefined
      node.port.onmessage = (event: MessageEvent<{ samples?: Float32Array; stopped?: boolean }>) => {
        if (event.data.samples) collect(event.data.samples)
        if (event.data.stopped) acknowledge?.()
      }
      flush = () => new Promise<void>((resolve) => {
        const timer = setTimeout(() => { node.port.close(); resolve() }, 1000)
        acknowledge = () => { clearTimeout(timer); node.port.close(); resolve() }
        node.port.postMessage('stop')
      })
    } else {
      // Compatibility fallback for older Web Audio implementations.
      const channels = Math.max(1, Math.min(2, stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1))
      const node = context.createScriptProcessor(1024, channels, 1)
      node.onaudioprocess = (event) => {
        const input = event.inputBuffer
        const mono = new Float32Array(input.length)
        for (let channel = 0; channel < input.numberOfChannels; channel++) {
          const data = input.getChannelData(channel)
          for (let frame = 0; frame < mono.length; frame++) mono[frame] += data[frame] / input.numberOfChannels
        }
        collect(mono)
      }
      processor = node
    }
    source.connect(processor); processor.connect(sink); sink.connect(context.destination)
    let resolveResult!: (value: RecorderResult) => void
    const done = new Promise<RecorderResult>((resolve) => { resolveResult = resolve })
    const stop = () => {
      if (stopping) return done
      stopping = true
      // Stop mic immediately; queued worklet messages still deliver the final samples.
      for (const track of stream.getTracks()) track.stop()
      void (async () => {
        try { await flush() } finally {
          await cleanup()
          resolveResult({ blob: encodeWav(chunks, rate), seconds: frames / rate, silent: peak < 0.0001 })
        }
      })()
      return done
    }
    ticker = setInterval(() => options.onDuration?.(frames / rate), 250)
    if (options.maxSeconds > 0) autoStop = setTimeout(() => { void stop() }, options.maxSeconds * 1000)
    return { stop, done }
  } catch (error) {
    await cleanup()
    throw error
  }
}
