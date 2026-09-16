export interface RecorderResult {
    blob: Blob;
    /** Actual captured sample count / sample rate, not wall-clock time. */
    seconds: number;
    silent: boolean;
}
export interface RecorderHandle {
    stop(): Promise<RecorderResult>;
    /** Also resolves on the recording time limit. */
    done: Promise<RecorderResult>;
}
export interface RecorderOptions {
    maxSeconds: number;
    onDuration?: (seconds: number) => void;
}
/** Browser processing preferences; unsupported constraints are ignored by browsers. */
export declare const RAW_AUDIO_CONSTRAINTS: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    voiceIsolation: boolean;
    channelCount: {
        ideal: number;
    };
};
/** Self-contained worklet code, with no remote scripts or audio uploads. */
export declare const CAPTURE_WORKLET = "\nclass VoiceCapture extends AudioWorkletProcessor {\n  constructor() {\n    super();\n    this.live = true;\n    this.buffer = new Float32Array(1024);\n    this.used = 0;\n    this.port.onmessage = (event) => {\n      if (event.data !== 'stop') return;\n      this.live = false;\n      this.flush();\n      this.port.postMessage({ stopped: true });\n    };\n  }\n  flush() {\n    if (!this.used) return;\n    const samples = this.buffer.slice(0, this.used);\n    this.port.postMessage({ samples }, [samples.buffer]);\n    this.used = 0;\n  }\n  process(inputs) {\n    if (!this.live) return false;\n    const channels = inputs[0];\n    if (!channels || !channels.length) return true;\n    for (let frame = 0; frame < channels[0].length; frame++) {\n      let sample = 0;\n      for (const channel of channels) sample += channel[frame] / channels.length;\n      this.buffer[this.used++] = sample;\n      if (this.used === this.buffer.length) this.flush();\n    }\n    return true;\n  }\n}\nregisterProcessor('dsh-voice-capture', VoiceCapture);\n";
export declare function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob;
export declare function createRecorder(options: RecorderOptions): Promise<RecorderHandle>;
