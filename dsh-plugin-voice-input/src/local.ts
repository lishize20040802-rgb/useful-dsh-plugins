// dsh-plugin-voice-input — local ASR engine (host half).
//
// One recorded clip in, one transcript out, entirely on this machine: the
// WAV is normalized to 16 kHz mono PCM, written to a private temp file, and
// handed to the sherpa-onnx offline CLI (SenseVoice-Small ONNX, CPU) which is
// spawned as a child process. Nothing is uploaded, no credential exists, and
// a stuck or crashed engine can only fail its own child process.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Sample rate the engine is fed with (SenseVoice's expected input). */
export const TARGET_RATE = 16000

/** Parsed RIFF/WAVE geometry (chunk-walking, so any fmt layout works). */
export interface WavHeader {
  channels: number
  sampleRate: number
  bits: number
  dataOffset: number
  dataLength: number
}

/** Parse a RIFF/WAVE header, walking chunks until the `data` chunk is found. */
export function parseWavHeader(buffer: Buffer): WavHeader {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('invalid audio: not a RIFF/WAVE file')
  }
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let format = 0
  let offset = 12
  let dataOffset = -1
  let dataLength = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (offset + 8 + size > buffer.length) throw new Error('invalid audio: truncated WAV chunk')
    if (id === 'fmt ') {
      if (size < 16) throw new Error('invalid audio: truncated format chunk')
      format = buffer.readUInt16LE(offset + 8)
      channels = buffer.readUInt16LE(offset + 10)
      sampleRate = buffer.readUInt32LE(offset + 12)
      bits = buffer.readUInt16LE(offset + 22)
    }
    if (id === 'data') {
      dataOffset = offset + 8
      dataLength = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataOffset < 0) throw new Error('invalid audio: missing data chunk')
  if (format !== 1) throw new Error('unsupported audio: PCM WAV expected')
  if (channels < 1 || channels > 32) throw new Error('unsupported audio: invalid channel count')
  if (sampleRate < 8000 || sampleRate > 192000) throw new Error('unsupported audio: sample rate must be 8000..192000 Hz')
  return { channels, sampleRate, bits, dataOffset, dataLength }
}

/** Wrap raw 16-bit mono samples in a RIFF/WAVE container. */
export function encodePcm16(samples: Int16Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  return buffer
}

/** Linear-interpolation resampler (only used when the recorder ignored 16 kHz). */
function resample(samples: Int16Array, from: number, to: number): Int16Array {
  const length = Math.max(1, Math.round((samples.length * to) / from))
  const out = new Int16Array(length)
  const ratio = (samples.length - 1) / Math.max(1, length - 1)
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(samples.length - 1, left + 1)
    const weight = position - left
    out[i] = Math.round((samples[left] ?? 0) * (1 - weight) + (samples[right] ?? 0) * weight)
  }
  return out
}

/**
 * Normalize a recorded clip to 16 kHz mono 16-bit PCM.
 *
 * The browser asks the AudioContext for 16 kHz, but not every shell honours
 * that, so the host never trusts it: multi-channel input is downmixed and any
 * other sample rate is resampled. A non-16-bit clip is rejected with a
 * readable message instead of being fed to the engine as garbage.
 */
export function normalizeWav(buffer: Buffer): Buffer {
  const header = parseWavHeader(buffer)
  if (header.bits !== 16) {
    throw new Error(`unsupported audio: ${header.bits}-bit samples (16-bit PCM expected)`)
  }
  if (header.channels < 1) throw new Error('unsupported audio: zero channels')
  const available = Math.max(0, Math.min(header.dataLength, buffer.length - header.dataOffset))
  const frames = Math.floor(available / 2 / header.channels)
  if (frames === 0) throw new Error('invalid audio: no PCM samples')
  const mono = new Int16Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (let channel = 0; channel < header.channels; channel++) {
      sum += buffer.readInt16LE(header.dataOffset + (frame * header.channels + channel) * 2)
    }
    mono[frame] = Math.max(-32768, Math.min(32767, Math.round(sum / header.channels)))
  }
  const samples = header.sampleRate === TARGET_RATE ? mono : resample(mono, header.sampleRate, TARGET_RATE)
  return encodePcm16(samples, TARGET_RATE)
}

/** Where the engine and its model live on disk. */
export interface RuntimePaths {
  /** Runtime root (default `<DSH_HOME>/third-party/data/voice-input`). */
  dir: string
  /** Directory holding the CLI and its DLLs. */
  engineDir: string
  /** The sherpa-onnx offline CLI. */
  exePath: string
  /** Directory holding the SenseVoice model. */
  modelDir: string
  /** The SenseVoice ONNX model. */
  modelPath: string
  /** The model's token table. */
  tokensPath: string
}

/** Derive every runtime path from the runtime root. */
export function runtimePaths(dir: string): RuntimePaths {
  const modelDir = join(dir, 'models', 'sense-voice')
  return {
    dir,
    engineDir: join(dir, 'bin'),
    exePath: join(dir, 'bin', 'sherpa-onnx-offline.exe'),
    modelDir,
    modelPath: join(modelDir, 'model.int8.onnx'),
    tokensPath: join(modelDir, 'tokens.txt')
  }
}

/** Engine invocation settings. */
export interface EngineOptions extends RuntimePaths {
  /** CPU threads for the ONNX session. */
  threads: number
  /** `auto`/`zh`/`en`/`ja`/`ko`/`yue`. */
  language: string
  /** Inverse text normalization (`十点` → `10点`). */
  itn: boolean
  /** Kill the child after this long. */
  timeoutMs: number
}

/** One transcription plus how long it took (engine startup included). */
export interface TranscribeOutcome {
  text: string
  ms: number
}

/**
 * Build the CLI argument list (exported for testing).
 *
 * `--print-args=false` keeps the kaldi banner off stderr, and the language
 * flag is omitted for `auto` so the model detects it itself.
 */
export function buildArgs(wavPath: string, options: EngineOptions): string[] {
  const args = [
    `--tokens=${options.tokensPath}`,
    `--sense-voice-model=${options.modelPath}`,
    `--sense-voice-use-itn=${options.itn ? 'true' : 'false'}`,
    `--num-threads=${options.threads}`,
    '--print-args=false'
  ]
  const language = options.language.trim().toLowerCase()
  if (language !== '' && language !== 'auto') args.push(`--sense-voice-language=${language}`)
  args.push(wavPath)
  return args
}

/**
 * Pull the transcript out of the engine's stdout (exported for testing).
 *
 * The CLI prints one JSON object per input file; the last one wins, so a
 * partial result can never override a complete one.
 */
export function parseResult(stdout: string): string {
  let text = ''
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed) as { text?: unknown }
      if (typeof parsed.text === 'string' && parsed.text !== '') text = parsed.text
    } catch {
      // not a result line — the CLI also prints progress lines
    }
  }
  return text.trim()
}

/** Readable "the engine is not installed" failure. */
function engineMissing(exePath: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause)
  if ((cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return new Error(`本地识别引擎不存在：${exePath}（首次使用请在插件目录运行 npm run setup:local，或在配置里指定 runtimeDir）`)
  }
  return new Error(`本地识别引擎无法启动：${detail}`)
}

/** Last readable line(s) of engine stderr, for the user-facing error. */
function engineFailure(stderr: string, code: number | null): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.includes('parse-options.cc') && !line.startsWith('At line:'))
  const detail = lines.slice(-3).join(' ').slice(0, 300)
  return detail === '' ? `本地识别引擎异常退出（exit ${code}）` : `本地识别失败：${detail}`
}

/** Resolve once the child has exited, or after `budgetMs`. */
function exited(child: ChildProcess, budgetMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, budgetMs)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Delete the clip's temp directory, retrying what Windows may still hold open.
 *
 * A failed delete is the one way a recording could outlive its transcription,
 * so it gets three attempts and, if it still fails, a warning naming the
 * directory instead of a silent `catch {}`.
 */
async function removeTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    } catch (err) {
      if (attempt === 2) {
        console.warn(`[dsh-plugin-voice-input] 临时音频目录删除失败，可手动删除：${dir}`, err instanceof Error ? err.message : err)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/** Spawn the CLI once and collect its streams. */
function runEngine(
  exePath: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(exePath, args, { windowsHide: true })
    } catch (err) {
      reject(engineMissing(exePath, err))
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      void (async () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.kill()
        // Give the engine a moment to let go of the clip file: on Windows an
        // open handle would make the caller's delete fail.
        await exited(child, 2000)
        reject(new Error(`本地识别超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`))
      })()
    }, timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(engineMissing(exePath, err))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    })
  })
}

/**
 * Transcribe one clip with the local engine.
 * @param wav - recorded WAV bytes (any channel count / sample rate)
 * @param options - engine paths and invocation settings
 * @returns the transcript and the wall-clock cost
 */
export async function transcribeLocal(wav: Buffer, options: EngineOptions): Promise<TranscribeOutcome> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-voice-input-'))
  const wavPath = join(dir, 'clip.wav')
  try {
    await writeFile(wavPath, normalizeWav(wav))
    const started = Date.now()
    const { stdout, stderr, code } = await runEngine(options.exePath, buildArgs(wavPath, options), options.timeoutMs)
    const ms = Date.now() - started
    if (code !== 0) throw new Error(engineFailure(stderr, code))
    return { text: parseResult(stdout), ms }
  } finally {
    await removeTempDir(dir)
  }
}

/** Default thread count: half the cores, clamped to something sane. */
export function resolveThreads(configured: number): number {
  if (Number.isFinite(configured) && configured > 0) return Math.min(64, Math.max(1, Math.floor(configured)))
  const cores = Number(process.env.NUMBER_OF_PROCESSORS ?? 0) || 4
  return Math.max(2, Math.min(8, Math.floor(cores / 2)))
}

/**
 * One-at-a-time task queue for engine spawns.
 *
 * Each spawn loads a 228 MB ONNX model, so overlapping requests would fight
 * for memory and CPU for no benefit; they queue instead, and a failed task
 * never blocks the ones behind it.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
