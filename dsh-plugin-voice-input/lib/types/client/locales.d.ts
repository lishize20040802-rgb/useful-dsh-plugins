declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This package's composer mic button / status strings. */
        'dsh-plugin-voice-input': VoiceInputLocaleKey;
    }
}
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly 'voice.button': "按住说话";
    readonly 'voice.hotkey': "（或按住 {key}）";
    readonly 'voice.recording': "松开结束";
    readonly 'voice.processing': "识别中…";
    readonly 'voice.preparing': "准备本地模型 {percent}%";
    readonly 'voice.notReady': "本地识别未就绪：首次使用需下载模型（约 258 MB）";
    readonly 'voice.listening': "聆听中 {seconds}s";
    readonly 'voice.silent': "没听到声音，请靠近麦克风再试";
    readonly 'voice.error.mic': "无法使用麦克风，请检查系统录音权限后重试";
    readonly 'voice.error.short': "说话时间太短，请按住说完一整句";
    readonly 'voice.error.bridge': "本地识别服务不可用（重启应用后重试）";
    readonly 'voice.error.engine': "识别失败：{message}";
};
export type VoiceInputLocaleKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: Record<VoiceInputLocaleKey, string>;
/** Complete per-locale dictionaries for `ctx.locale.register`. */
export declare const dicts: {
    zh: {
        readonly 'voice.button': "按住说话";
        readonly 'voice.hotkey': "（或按住 {key}）";
        readonly 'voice.recording': "松开结束";
        readonly 'voice.processing': "识别中…";
        readonly 'voice.preparing': "准备本地模型 {percent}%";
        readonly 'voice.notReady': "本地识别未就绪：首次使用需下载模型（约 258 MB）";
        readonly 'voice.listening': "聆听中 {seconds}s";
        readonly 'voice.silent': "没听到声音，请靠近麦克风再试";
        readonly 'voice.error.mic': "无法使用麦克风，请检查系统录音权限后重试";
        readonly 'voice.error.short': "说话时间太短，请按住说完一整句";
        readonly 'voice.error.bridge': "本地识别服务不可用（重启应用后重试）";
        readonly 'voice.error.engine': "识别失败：{message}";
    };
    en: Record<"voice.button" | "voice.hotkey" | "voice.recording" | "voice.processing" | "voice.preparing" | "voice.notReady" | "voice.listening" | "voice.silent" | "voice.error.mic" | "voice.error.short" | "voice.error.bridge" | "voice.error.engine", string>;
};
/** The namespace id every registration of this package binds to. */
export declare const NS = "dsh-plugin-voice-input";
