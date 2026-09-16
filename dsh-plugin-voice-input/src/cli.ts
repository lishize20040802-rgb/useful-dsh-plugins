// dsh-plugin-voice-input — script-facing surface.
//
// A dependency-light bundle for the standalone scripts (setup-local / live):
// everything the local engine and its runtime preparation need, with no
// cordis and no host services. The plugin half itself still ships as
// lib/index.js.
export {
  TARGET_RATE,
  SerialQueue,
  buildArgs,
  encodePcm16,
  normalizeWav,
  parseResult,
  parseWavHeader,
  resolveThreads,
  runtimePaths,
  transcribeLocal
} from './local'
export type { EngineOptions, RuntimePaths, TranscribeOutcome, WavHeader } from './local'
export {
  ENGINE_ARCHIVE,
  ENGINE_ARCHIVE_ROOT,
  ENGINE_BYTES,
  ENGINE_URLS,
  ENGINE_VERSION,
  MODEL_FILES,
  MODEL_HOSTS,
  MODEL_REPO,
  TOTAL_BYTES,
  defaultRuntimeDir,
  downloadFile,
  ensureRuntime,
  extractArchive,
  inspectRuntime,
  modelDownloadUrls,
  fileSha256,
  resolveProxy,
  runtimeState,
  systemProxy
} from './provision'
export type { DownloadProgress, ProvisionState, RuntimeInspection } from './provision'
