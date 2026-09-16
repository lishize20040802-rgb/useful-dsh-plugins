// Transcribe one WAV with the local engine — the same code path the /api/asr
// route uses, without starting the app. No credential and no network access:
// everything runs on this machine.
//
//   node scripts/live.mjs [path-to.wav]
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultRuntimeDir, inspectRuntime, resolveThreads, runtimePaths, transcribeLocal } from '../lib/cli.js'

if (!process.argv[2]) {
  console.error('Usage: node scripts/live.mjs <local-audio.wav>')
  process.exit(2)
}
const wavPath = resolve(process.argv[2])
const dir = process.env.VOICE_RUNTIME_DIR ?? defaultRuntimeDir()
const paths = runtimePaths(dir)

const inspection = inspectRuntime(paths)
if (!inspection.ready) {
  console.error(`local runtime is not ready in ${dir}`)
  for (const path of inspection.missing) console.error(`  missing: ${path}`)
  console.error('run: node scripts/setup-local.mjs')
  process.exit(2)
}

const started = Date.now()
const result = await transcribeLocal(readFileSync(wavPath), {
  ...paths,
  threads: resolveThreads(0),
  language: process.env.VOICE_LANGUAGE ?? 'zh',
  itn: true,
  timeoutMs: 120000
})
console.log(`wav        : ${wavPath}`)
console.log(`transcript : ${result.text}`)
console.log(`engine ms  : ${result.ms}`)
console.log(`total ms   : ${Date.now() - started}`)
