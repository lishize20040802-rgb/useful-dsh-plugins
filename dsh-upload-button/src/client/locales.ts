// dsh-upload-button — browser-half locale namespace.
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
    /** This package's composer / dock / message-bubble strings. */
    'dsh-upload-button': UploadButtonLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // Composer toolbar button
  'upload.button': '上传文件',
  'upload.buttonBusy': '上传中…',
  // Dock file cards
  'upload.remove': '移除',
  // Error banner
  'upload.dismissError': '关闭错误提示',
  'upload.insertFailed': '文件已上传但未能加入输入框: {path}',
  'upload.failed': '上传失败: {message}',
  // Message-bubble file chips
  'upload.openFile': '打开文件',
  // Message-image gallery labels (bubble renderer)
  'image.label': '图片',
  'image.openOriginal': '查看原图',
  'image.openOriginalLabel': '查看原图: {label}',
  'image.loading': '加载中…',
  'image.loadFailed': '加载失败，点击重试',
  'image.lightboxDialog': '图片预览',
  'image.lightboxClose': '关闭',
  'image.serviceUnavailable': '图片读取服务不可用',
  // Conversation surface strings the bubble renderer reuses
  'message.extraBlock': '附加内容块',
  'json.truncated': '… 已截断，共 {total} 字符',
  'clock.md': '{m}月{d}日',
  'clock.ymd': '{y}年{m}月{d}日'
} as const

export type UploadButtonLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<UploadButtonLocaleKey, string> = {
  'upload.button': 'Upload file',
  'upload.buttonBusy': 'Uploading…',
  'upload.remove': 'Remove',
  'upload.dismissError': 'Dismiss error',
  'upload.insertFailed': 'File uploaded but could not be inserted into the input: {path}',
  'upload.failed': 'Upload failed: {message}',
  'upload.openFile': 'Open file',
  'image.label': 'Image',
  'image.openOriginal': 'View original',
  'image.openOriginalLabel': 'View original: {label}',
  'image.loading': 'Loading…',
  'image.loadFailed': 'Failed to load, click to retry',
  'image.lightboxDialog': 'Image preview',
  'image.lightboxClose': 'Close',
  'image.serviceUnavailable': 'Image loading service unavailable',
  'message.extraBlock': 'Extra content block',
  'json.truncated': '… truncated, {total} characters total',
  'clock.md': '{m}/{d}',
  'clock.ymd': '{y}-{m}-{d}'
}

/** Complete per-locale dictionaries for `ctx.locale.register`. */
export const dicts = {
  zh,
  en
} satisfies Record<LocaleId, Record<UploadButtonLocaleKey, string>>

/** The namespace id every registration of this package binds to. */
export const NS = 'dsh-upload-button'
