// First-run preparation for dsh-plugin-voice-input — without starting the app.
//
//   node scripts/setup-local.mjs [--dir <runtimeDir>] [--proxy <url>]
//                                [--wav <path>] [--verify-only] [--no-verify]
//
// Downloads the sherpa-onnx offline CLI (~19 MB) and the SenseVoice-Small int8
// model (~228 MB) into the runtime directory, resuming interrupted downloads,
// and then proves the setup by transcribing one clip locally — no network
// call, no credential.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TOTAL_BYTES,
  defaultRuntimeDir,
  encodePcm16,
  ensureRuntime,
  inspectRuntime,
  resolveProxy,
  resolveThreads,
  runtimePaths,
  runtimeState,
  transcribeLocal
} from '../lib/cli.js'

/** Read `--name value` from argv. */
function option(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  return process.argv[index + 1] ?? fallback
}

const dir = resolve(option('--dir', process.env.VOICE_RUNTIME_DIR ?? defaultRuntimeDir()))
const proxy = resolveProxy(option('--proxy', ''))
const wavArgument = option('--wav')
const wavPath = wavArgument ? resolve(wavArgument) : null
const modelBaseUrl = option('--model-base-url')
const paths = runtimePaths(dir)

console.log('dsh-plugin-voice-input — local runtime setup')
console.log(`  runtime : ${dir}`)
console.log(`  proxy   : ${proxy === '' ? '(direct)' : '(configured; address and credentials hidden)'}`)

const before = inspectRuntime(paths)
if (before.ready) {
  console.log('  state   : already complete')
} else {
  console.log(`  state   : ${before.missing.length} file(s) missing, ~${(TOTAL_BYTES / 1048576).toFixed(0)} MB to download`)
}

if (process.argv.includes('--verify-only') === false) {
  const started = Date.now()
  let lastLine = ''
  const ticker = setInterval(() => {
    const state = runtimeState(dir)
    if (state.active !== true) return
    const percent = state.total > 0 ? Math.round((state.received / state.total) * 100) : 0
    const line = `  ${percent}%  ${state.label}  (${(state.received / 1048576).toFixed(1)}/${(state.total / 1048576).toFixed(0)} MB)`
    if (line !== lastLine) {
      lastLine = line
      console.log(line)
    }
  }, 1000)
  try {
    await ensureRuntime({ dir, proxy, modelBaseUrl })
    console.log(`  done    : runtime ready in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } catch (err) {
    clearInterval(ticker)
    console.error(`  failed  : ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  clearInterval(ticker)
}

if (process.argv.includes('--no-verify')) process.exit(0)

if (!inspectRuntime(paths).ready) {
  console.error('  failed  : runtime files are missing; run setup without --verify-only')
  process.exit(1)
}
console.log(wavPath ? '  verify  : transcribing the explicitly supplied WAV' : '  verify  : loading the model with generated silence (not an accuracy test)')
const result = await transcribeLocal(wavPath ? readFileSync(wavPath) : encodePcm16(new Int16Array(16000), 16000), {
  ...paths,
  threads: resolveThreads(0),
  language: 'zh',
  itn: true,
  timeoutMs: 120000
})
if (wavPath) console.log(`  transcript: ${result.text}`)
else console.log('  runtime load check passed')
console.log(`  latency   : ${result.ms} ms`)
if (wavPath && result.text.trim() === '') {
  console.error('  failed  : the engine returned no text')
  process.exit(1)
}
