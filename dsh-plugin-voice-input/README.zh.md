# dsh-plugin-voice-input

[English](README.md) · [仓库](https://github.com/lishize20040802-rgb/useful-dsh-plugins)

按住麦克风按钮说话，松开后在本地识别，结果追加到 DeepSeek Harness 输入框草稿。内容由你审阅和发送。默认快捷键是 **Alt + 反引号 + 1**。录音和识别文本不会发给外部语音识别服务。

## 运行要求

- 已验证的 DeepSeek Harness WebUI 版本：**0.1.5-rc.2**；Node.js 24 或更新版本；自动安装本地引擎目前支持 Windows x64。
- 使用允许麦克风访问的浏览器，从 `http://localhost` 或 `http://127.0.0.1` 打开 WebUI。语音接口只接受本机同源请求。
- 首次下载约 260 MB：sherpa-onnx 1.13.8 引擎和 SenseVoice-Small int8 ONNX 模型，在宿主机 CPU 上推理。

官方 SDK 保留为 peer dependency（由宿主提供的依赖），不打包一份到插件里。未来 DSH 修改 API 时可能需要更新兼容性；本说明不承诺兼容所有未来版本。暂未实现 Linux/macOS 自动安装引擎。

## 安装与卸载

参考[仓库安装说明](../README.zh.md)，或下载 GitHub Release 中的 `dsh-plugin-voice-input-0.3.0.tgz`：

```sh
dsh plugin --profile web add /path/to/dsh-plugin-voice-input-0.3.0.tgz
```

在 Web profile 的 `package.json` 中，将 `"dsh-plugin-voice-input"` 加入 `dsh.profile.bundles` 一次。插件自带 bundle 补丁创建 `voice-input` Cordis 行，无需修改 DSH 官方源码。profile 目录是 `$DSH_HOME/profiles/web`，默认 `~/.dsh/profiles/web`。

可在 Cordis 插件管理器中禁用或启用。插件卸载会释放路由、输入框插槽、翻译和样式；界面卸载会停止录音并取消浏览器请求。安装新包版本或修改宿主组合后，仍可能需要重启 `dsh web` 并刷新浏览器。

彻底卸载时，从 bundles 移除插件名，删除仅针对 `voice-input` 的个人配置覆盖，再运行：

```sh
dsh plugin --profile web remove dsh-plugin-voice-input
```

下载的引擎与模型默认保留，避免每次禁用或重装都重新下载。如需一并清理，卸载后只删除本插件配置的运行时目录。新安装默认使用 `$DSH_HOME/third-party/data/voice-input`（`~/.dsh/third-party/data/voice-input`）；未显式配置路径且旧的 `$DSH_HOME/voice-input` 目录已经存在时，继续使用旧目录，不自动搬动文件。其他 DSH 数据不属于这个目录。

## 录音修复

浏览器录音请求关闭 `noiseSuppression`（降噪）、`echoCancellation`（回声消除）、`autoGainControl`（自动增益）和 `voiceIsolation`（人声隔离）。优先用 AudioWorklet 在音频线程收集 PCM；松开时先取回最后一小块音频，再生成单声道 16-bit WAV。旧 Web Audio 实现使用 ScriptProcessor 兼容路径。

显式恢复被暂停的 AudioContext，WAV 中写入实际采样率，宿主再统一到 16 kHz。录音时长根据实际样本数计算；初始化失败、录音超时或插件卸载都会清理录音资源。

浏览器约束是请求，不能保证关掉 Windows、驱动或麦克风硬件内部的音效。自动化测试使用合成 PCM，不使用真人录音；测试通过不能代替特定麦克风的识别准确率验证。

## 模型与首次准备

[语音模型 Release](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/tag/voice-model-sensevoice-2024-07-17) 提供 **model.int8.onnx**、**tokens.txt**、模型许可证和来源说明。模型独立于 npm 插件包，首次使用自动下载；上游模型地址作为备用。下载完成后按固定 SHA-256 校验模型内容。

```text
<runtimeDir>/
  bin/sherpa-onnx-offline.exe
  bin/onnxruntime.dll
  bin/onnxruntime_providers_shared.dll
  models/sense-voice/model.int8.onnx
  models/sense-voice/tokens.txt
```

也可以在插件目录提前准备：

```sh
npm run setup:local
npm run setup:local -- --dir /path/to/runtime --verify-only
npm run setup:local -- --wav /path/to/local-audio.wav
npm run live -- /path/to/local-audio.wav
```

默认自检用程序生成的静音验证引擎能否加载模型，**不是识别准确率测试**。仓库不附带用户的录音。下载支持 HTTPS 重定向与断点续传；代理依次读取配置、环境变量、Windows 系统设置，setup 不打印代理地址或凭证。

## 配置

宿主参数可在个人补丁中覆盖 `voice-input` 行：

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `runtimeDir` | 空 | 使用 `$DSH_HOME/third-party/data/voice-input`，或复用已存在的旧 `$DSH_HOME/voice-input`。宿主相对路径基于 `$DSH_HOME`，显式绝对路径保持原位。 |
| `language` | `zh` | 支持 `auto`、`zh`、`en`、`ja`、`ko`、`yue`。 |
| `itn` | `true` | 口述数字规范化。 |
| `threads` | `0` | 自动选 CPU 线程数。 |
| `autoProvision` | `true` | 首次使用自动下载缺失的运行时。 |
| `proxy` | 空 | 显式 HTTP(S) 代理；否则读取环境变量和系统代理。 |
| `modelBaseUrl` | 空 | 自定义 HTTPS Release 资源目录，仍按固定模型摘要校验。 |
| `maxBytes` | 64 MiB | 单次录音上传上限。 |
| `timeoutMs` | 120000 | 单次引擎调用超时，毫秒。 |
| `exePath`、`modelPath`、`tokensPath` | 空 | 高级：显式指定引擎或模型文件。 |

也可用 `DSH_VOICE_MODEL_BASE_URL` 覆盖默认模型 Release 目录；setup 命令支持 `--model-base-url`。独立脚本支持 `VOICE_RUNTIME_DIR`。浏览器配置有 `maxSeconds`（默认 600，0 表示不限）和 `hotkey`（默认 `AltLeft+Backquote+Digit1`；空或 `none` 禁用快捷键）。

宿主配置中的 `runtimeDir`、`exePath`、`modelPath`、`tokensPath` 都以 `$DSH_HOME` 为相对路径基准，并支持 `~`。命令行遵循通常约定：setup 的 `--dir`、`--wav`、live 的 WAV 参数和 `VOICE_RUNTIME_DIR` 如果是相对路径，以执行命令时的工作目录为基准。不传参数时，脚本与宿主使用相同的默认目录/旧目录选择规则。

## 排查

`session/cancel failed: Failed to fetch (gateway/internal)` 表示 DSH 连接请求失败：先确认 `dsh web` 正在运行，重启后刷新浏览器。语音识别使用单独的 `/api/asr`。语音出错时，可用实际 WebUI 端口查看 `http://127.0.0.1:3080/api/asr`；`ready: true` 表示运行时所需文件存在，并不表示浏览器录音效果已经验证。

## 开发与许可

```sh
npm install
npm run build
npm test
```

测试覆盖 WAV 转换、关闭浏览器音频处理、音频上下文清理、尾部音频回收、时长上限、ASR 路由、运行时路径、重定向和模型完整性。构建产物不含 source map 或用户录音。

插件代码使用 MIT；sherpa-onnx 使用 Apache-2.0；SenseVoice-Small 权重使用 **FunASR Model License**，不属于 MIT。模型分发需保留 Release 中的 `MODEL_LICENSE` 和 `THIRD_PARTY_NOTICES`。上游：[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)、[SenseVoice ONNX 模型](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17)。
