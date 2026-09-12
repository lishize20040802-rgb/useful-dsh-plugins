// dsh-plugin-voice-input — browser-half locale namespace.
//
// Official locale contract (dsh-client-locale): one namespace per package,
// zh is the dictionary key-set source of truth, en is checked complete
// against it, and the namespace is merged into the shared LocaleNamespaceMap
// so `ctx.locale.register(NS, dicts)` type-checks its key union. Generic
// words (copy / copied / close / loading…) resolve through the shared
// "common" namespace and are intentionally NOT redefined here.
import type { LocaleId } from '@deepseek-ai/dsh-client-locale'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This package's composer mic button / status strings. */
    'dsh-plugin-voice-input': VoiceInputLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // Composer toolbar button
  'voice.button': '按住说话',
  'voice.hotkey': '（或按住 {key}）',
  'voice.recording': '松开结束',
  'voice.processing': '识别中…',
  // Inline status
  'voice.listening': '聆听中 {seconds}s',
  'voice.silent': '没听到声音，请靠近麦克风再试',
  'voice.error.mic': '无法使用麦克风，请检查系统录音权限后重试',
  'voice.error.short': '说话时间太短，请按住说完一整句',
  'voice.error.bridge': '语音服务不可用（检查桥接配置后重启应用）',
  'voice.error.ark': '识别失败：{message}'
} as const

export type VoiceInputLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<VoiceInputLocaleKey, string> = {
  'voice.button': 'Hold to talk',
  'voice.hotkey': ' (or hold {key})',
  'voice.recording': 'Release to finish',
  'voice.processing': 'Transcribing…',
  'voice.listening': 'Listening {seconds}s',
  'voice.silent': 'No speech detected, try again closer to the mic',
  'voice.error.mic': 'Microphone unavailable — check the system recording permission',
  'voice.error.short': 'Too short — hold and speak a full sentence',
  'voice.error.bridge': 'Voice service unavailable (fix the bridge config, then restart)',
  'voice.error.ark': 'Transcription failed: {message}'
}

/** Complete per-locale dictionaries for `ctx.locale.register`. */
export const dicts = {
  zh,
  en
} satisfies Record<LocaleId, Record<VoiceInputLocaleKey, string>>

/** The namespace id every registration of this package binds to. */
export const NS = 'dsh-plugin-voice-input'
