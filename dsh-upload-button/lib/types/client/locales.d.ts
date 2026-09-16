declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This package's composer / dock / message-bubble strings. */
        'dsh-upload-button': UploadButtonLocaleKey;
    }
}
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly 'upload.button': "上传文件";
    readonly 'upload.buttonBusy': "上传中…";
    readonly 'upload.remove': "移除";
    readonly 'upload.dismissError': "关闭错误提示";
    readonly 'upload.insertFailed': "文件已上传但未能加入输入框: {path}";
    readonly 'upload.failed': "上传失败: {message}";
    readonly 'upload.openFile': "打开文件";
    readonly 'image.label': "图片";
    readonly 'image.openOriginal': "查看原图";
    readonly 'image.openOriginalLabel': "查看原图: {label}";
    readonly 'image.loading': "加载中…";
    readonly 'image.loadFailed': "加载失败，点击重试";
    readonly 'image.lightboxDialog': "图片预览";
    readonly 'image.lightboxClose': "关闭";
    readonly 'image.serviceUnavailable': "图片读取服务不可用";
    readonly 'message.extraBlock': "附加内容块";
    readonly 'json.truncated': "… 已截断，共 {total} 字符";
    readonly 'clock.md': "{m}月{d}日";
    readonly 'clock.ymd': "{y}年{m}月{d}日";
};
export type UploadButtonLocaleKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: Record<UploadButtonLocaleKey, string>;
/** Complete per-locale dictionaries for `ctx.locale.register`. */
export declare const dicts: {
    zh: {
        readonly 'upload.button': "上传文件";
        readonly 'upload.buttonBusy': "上传中…";
        readonly 'upload.remove': "移除";
        readonly 'upload.dismissError': "关闭错误提示";
        readonly 'upload.insertFailed': "文件已上传但未能加入输入框: {path}";
        readonly 'upload.failed': "上传失败: {message}";
        readonly 'upload.openFile': "打开文件";
        readonly 'image.label': "图片";
        readonly 'image.openOriginal': "查看原图";
        readonly 'image.openOriginalLabel': "查看原图: {label}";
        readonly 'image.loading': "加载中…";
        readonly 'image.loadFailed': "加载失败，点击重试";
        readonly 'image.lightboxDialog': "图片预览";
        readonly 'image.lightboxClose': "关闭";
        readonly 'image.serviceUnavailable': "图片读取服务不可用";
        readonly 'message.extraBlock': "附加内容块";
        readonly 'json.truncated': "… 已截断，共 {total} 字符";
        readonly 'clock.md': "{m}月{d}日";
        readonly 'clock.ymd': "{y}年{m}月{d}日";
    };
    en: Record<"upload.button" | "upload.buttonBusy" | "upload.remove" | "upload.dismissError" | "upload.insertFailed" | "upload.failed" | "upload.openFile" | "image.label" | "image.openOriginal" | "image.openOriginalLabel" | "image.loading" | "image.loadFailed" | "image.lightboxDialog" | "image.lightboxClose" | "image.serviceUnavailable" | "message.extraBlock" | "json.truncated" | "clock.md" | "clock.ymd", string>;
};
/** The namespace id every registration of this package binds to. */
export declare const NS = "dsh-upload-button";
