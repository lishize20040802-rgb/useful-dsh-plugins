import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/client/recorder.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'esm' })
const { createRecorder, CAPTURE_WORKLET, encodeWav } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

function browser(t, { resumeError = false, worklet = true, moduleError = false } = {}) {
  const state = { stopped: 0, closed: 0, resumed: 0, revoked: 0 }
  const track = { stop: () => state.stopped++, getSettings: () => ({ channelCount: 2 }) }
  const node = () => ({ connect() {}, disconnect() {} })
  class Context {
    sampleRate = 16000
    state = 'suspended'
    destination = node()
    audioWorklet = worklet ? { addModule: async () => { if (moduleError) throw new Error('CSP blocked worklet') } } : undefined
    async resume() { state.resumed++; if (resumeError) throw new Error('resume failed'); this.state = 'running' }
    async close() { this.state = 'closed'; state.closed++ }
    createMediaStreamSource() { return node() }
    createGain() { return { ...node(), gain: { value: 1 } } }
    createScriptProcessor(size, channels) { state.bufferSize = size; state.channels = channels; state.script = node(); return state.script }
  }
  class WorkletNode {
    constructor() {
      state.worklet = this
      this.port = {
        onmessage: null, close() {},
        postMessage: () => queueMicrotask(() => {
          if (state.tail) this.port.onmessage({ data: { samples: state.tail } })
          this.port.onmessage({ data: { stopped: true } })
        })
      }
    }
    connect() {}
    disconnect() {}
  }
  for (const [key, value] of Object.entries({
    navigator: { mediaDevices: { getUserMedia: async (constraints) => {
      state.constraints = constraints
      return { getTracks: () => [track], getAudioTracks: () => [track] }
    } } }, AudioContext: Context, AudioWorkletNode: WorkletNode
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key])
  }
  t.mock.method(URL, 'createObjectURL', () => 'blob:local-test')
  t.mock.method(URL, 'revokeObjectURL', () => state.revoked++)
  return state
}

test('raw capture resumes audio, preserves the worklet tail and stops idempotently', async (t) => {
  const state = browser(t)
  const recorder = await createRecorder({ maxSeconds: 0 })
  for (const key of ['noiseSuppression', 'echoCancellation', 'autoGainControl', 'voiceIsolation']) assert.equal(state.constraints.audio[key], false)
  state.worklet.port.onmessage({ data: { samples: new Float32Array([0.2, 0.3, 0.4]) } })
  state.tail = new Float32Array([0.5])
  const resultPromise = recorder.stop()
  assert.equal(recorder.stop(), resultPromise)
  assert.equal(recorder.done, resultPromise)
  const result = await resultPromise
  const wav = new DataView(await result.blob.arrayBuffer())
  assert.equal(wav.getUint32(40, true), 8)
  assert.equal(wav.getInt16(50, true), 16383)
  assert.equal(result.seconds, 4 / 16000)
  assert.equal(state.resumed, 1)
  assert.equal(state.closed, 1)
  assert.ok(state.stopped > 0)
  assert.equal(state.revoked, 1)
})

test('resume failure releases the mic and closes the audio context', async (t) => {
  const state = browser(t, { resumeError: true })
  await assert.rejects(createRecorder({ maxSeconds: 0 }), /resume failed/)
  assert.ok(state.stopped > 0)
  assert.equal(state.closed, 1)
})

test('worklet load failure releases mic, context and blob URL', async (t) => {
  const state = browser(t, { moduleError: true })
  await assert.rejects(createRecorder({ maxSeconds: 0 }), /CSP blocked/)
  assert.ok(state.stopped > 0)
  assert.equal(state.closed, 1)
  assert.equal(state.revoked, 1)
})

test('fallback keeps both microphone channels and caps actual samples', async (t) => {
  const state = browser(t, { worklet: false })
  const recorder = await createRecorder({ maxSeconds: 2 / 16000 })
  const channels = [new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1])]
  state.script.onaudioprocess({ inputBuffer: { length: 3, numberOfChannels: 2, getChannelData: (index) => channels[index] } })
  const result = await recorder.done
  assert.equal(state.channels, 2)
  assert.equal(state.bufferSize, 1024)
  assert.equal(result.seconds, 2 / 16000)
  const wav = new DataView(await result.blob.arrayBuffer())
  assert.equal(wav.getUint32(40, true), 4)
  assert.equal(wav.getInt16(44, true), 16383)
})

test('worklet mixes stereo and flushes the short final block before acknowledging stop', () => {
  let Processor
  const messages = []
  vm.runInNewContext(CAPTURE_WORKLET, {
    AudioWorkletProcessor: class { port = { postMessage: (value) => messages.push(value) } },
    registerProcessor: (_, implementation) => { Processor = implementation }, Float32Array
  })
  const processor = new Processor()
  processor.process([[new Float32Array(1030).fill(0.2), new Float32Array(1030).fill(0.6)]])
  processor.port.onmessage({ data: 'stop' })
  assert.equal(messages[0].samples.length, 1024)
  assert.equal(messages[1].samples.length, 6)
  assert.ok(Math.abs(messages[1].samples[0] - 0.4) < 1e-6)
  assert.equal(messages[2].stopped, true)
  assert.equal(processor.process([]), false)
})

test('WAV encoding clamps samples and writes the actual sample rate', async () => {
  const view = new DataView(await encodeWav([new Float32Array([-2, 2, NaN])], 48000).arrayBuffer())
  assert.equal(view.getUint32(24, true), 48000)
  assert.equal(view.getInt16(44, true), -32768)
  assert.equal(view.getInt16(46, true), 32767)
  assert.equal(view.getInt16(48, true), 0)
})
