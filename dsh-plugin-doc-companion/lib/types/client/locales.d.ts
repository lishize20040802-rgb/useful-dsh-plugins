export declare const zh: {
    readonly 'toggle.title': "文档伴读";
    readonly 'panel.title': "文档伴读";
    readonly 'panel.close': "关闭面板";
    readonly 'panel.openDoc': "打开文档";
    readonly 'panel.empty': "还没有打开文档 — 点「打开文档」上传，或直接让 AI 帮你打开";
    readonly 'panel.uploading': "上传中…";
    readonly 'panel.loading': "加载中…";
    readonly 'panel.indexing': "全文索引构建中（搜索可用前）…";
    readonly 'panel.loadFailed': "加载失败：{message}";
    readonly 'panel.uploadFailed': "上传失败：{message}";
    readonly 'panel.prev': "上一块";
    readonly 'panel.next': "下一块";
    readonly 'panel.jumpPlaceholder': "页码";
    readonly 'panel.blockOf': "第 {block} / {total} 块";
    readonly 'panel.scanned': "· 扫描页";
    readonly 'panel.zoomOut': "缩小";
    readonly 'panel.zoomIn': "放大";
    readonly 'panel.fitWidth': "适应宽度";
    readonly 'panel.scrollMode': "连续滚动";
    readonly 'panel.singleMode': "单页";
    readonly 'panel.synced': "已同步";
    readonly 'panel.syncing': "同步中…";
    readonly 'panel.tableTitle': "{sheet} 第 {first}–{last} 行";
    readonly 'panel.tableEmpty': "（空表格）";
};
export type DocCompanionLocaleKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: Record<DocCompanionLocaleKey, string>;
/** The namespace id every registration of this package binds to. */
export declare const NS = "dsh-plugin-doc-companion";
