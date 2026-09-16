// dsh-plugin-doc-companion — browser-half locale namespace.
//
// Official locale contract (dsh-client-locale): one namespace per package,
// zh is the dictionary key-set source of truth, en is checked complete
// against it. The dictionaries are registered through the untyped per-locale
// overload (`register(ns, locale, dict)`); the typed merge-table form
// (`LocaleNamespaceMap`, declared in client.tsx) is what types the slot
// `locale:` option. Under 0.1.1 the merge table was unreachable because
// dsh-client-ui-slots shipped only inside the assembled frontend; from 0.1.5
// it is a resolvable package, so the merge is declared there.
export const zh = {
  // Toolbar toggle
  'toggle.title': '文档伴读',
  // Panel shell
  'panel.title': '文档伴读',
  'panel.close': '关闭面板',
  'panel.openDoc': '打开文档',
  'panel.empty': '还没有打开文档 — 点「打开文档」上传，或直接让 AI 帮你打开',
  'panel.uploading': '上传中…',
  'panel.loading': '加载中…',
  'panel.indexing': '全文索引构建中（搜索可用前）…',
  'panel.loadFailed': '加载失败：{message}',
  'panel.uploadFailed': '上传失败：{message}',
  // Navigation
  'panel.prev': '上一块',
  'panel.next': '下一块',
  'panel.jumpPlaceholder': '页码',
  'panel.blockOf': '第 {block} / {total} 块',
  'panel.scanned': '· 扫描页',
  // Zoom (PDF)
  'panel.zoomOut': '缩小',
  'panel.zoomIn': '放大',
  'panel.fitWidth': '适应宽度',
  // View mode
  'panel.scrollMode': '连续滚动',
  'panel.singleMode': '单页',
  // Sync status
  'panel.synced': '已同步',
  'panel.syncing': '同步中…',
  // Table view
  'panel.tableTitle': '{sheet} 第 {first}–{last} 行',
  'panel.tableEmpty': '（空表格）'
} as const

export type DocCompanionLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<DocCompanionLocaleKey, string> = {
  'toggle.title': 'Doc companion',
  'panel.title': 'Doc companion',
  'panel.close': 'Close panel',
  'panel.openDoc': 'Open document',
  'panel.empty': 'No document open — upload one here, or ask the AI to open it',
  'panel.uploading': 'Uploading…',
  'panel.loading': 'Loading…',
  'panel.indexing': 'Building full-text index (before search is ready)…',
  'panel.loadFailed': 'Failed to load: {message}',
  'panel.uploadFailed': 'Upload failed: {message}',
  'panel.prev': 'Previous block',
  'panel.next': 'Next block',
  'panel.jumpPlaceholder': 'Page',
  'panel.blockOf': 'Block {block} / {total}',
  'panel.scanned': '· scanned page',
  'panel.zoomOut': 'Zoom out',
  'panel.zoomIn': 'Zoom in',
  'panel.fitWidth': 'Fit width',
  'panel.scrollMode': 'Continuous scroll',
  'panel.singleMode': 'Single page',
  'panel.synced': 'synced',
  'panel.syncing': 'syncing…',
  'panel.tableTitle': '{sheet} rows {first}–{last}',
  'panel.tableEmpty': '(empty table)'
}

/** The namespace id every registration of this package binds to. */
export const NS = 'dsh-plugin-doc-companion'
