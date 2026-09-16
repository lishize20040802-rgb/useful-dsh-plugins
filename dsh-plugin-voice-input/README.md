# dsh-plugin-voice-input

[中文](README.zh.md) · [Repository](https://github.com/lishize20040802-rgb/useful-dsh-plugins)

Hold the microphone button, speak, then release. Local speech recognition appends text to the DeepSeek Harness composer draft; you review and send it yourself. The default keyboard chord is **Alt + Backquote + 1**. Audio and transcripts are never sent to an external recognition service.

## Requirements

- DeepSeek Harness WebUI **0.1.5-rc.2**, Node.js 24 or newer, Windows x64 for the bundled runtime setup.
- A browser with microphone access on `http://localhost` or `http://127.0.0.1`. The host ASR route intentionally accepts local, same-origin requests only.
- About 260 MB for a first download: sherpa-onnx 1.13.8 and the SenseVoice-Small int8 ONNX model. Model inference runs on the host CPU.

The official SDKs remain peer dependencies. This release is verified against the version above; a future DSH API change may need a compatibility update. Linux/macOS automatic runtime setup is not implemented.

## Install and remove

Use the [repository installation instructions](../README.md) or download the `dsh-plugin-voice-input-0.3.0.tgz` package from its GitHub Release:

```sh
dsh plugin --profile web add /path/to/dsh-plugin-voice-input-0.3.0.tgz
```

Add `"dsh-plugin-voice-input"` once to `dsh.profile.bundles` in the Web profile's `package.json`. The bundle supplies the `voice-input` Cordis row; no copy into official DSH source is needed. The profile lives under `$DSH_HOME/profiles/web`, default `~/.dsh/profiles/web`.

Disable/enable the plugin through the Cordis plugin manager when available. Disposal unregisters the route, slot, locale and stylesheet; unmounting stops recording and cancels pending browser requests. Installing a new package version or changing the host composition may still require restarting `dsh web` and reloading the browser.

To uninstall, remove the bundle name and any user patch targeting `voice-input`, then:

```sh
dsh plugin --profile web remove dsh-plugin-voice-input
```

Downloaded runtime files are retained so disabling/reinstalling does not trigger another large download. If you also want to remove them, delete only the runtime directory configured for this plugin after uninstalling. New installations use `$DSH_HOME/third-party/data/voice-input` (`~/.dsh/third-party/data/voice-input`). An existing legacy `$DSH_HOME/voice-input` directory is reused when no explicit path is configured; files are not moved automatically. Other DSH data is not part of this directory.

## Recording and recognition

The browser requests `noiseSuppression`, `echoCancellation`, `autoGainControl` and `voiceIsolation` off. AudioWorklet collects PCM away from the UI thread, flushes the final audio block on release and encodes mono 16-bit WAV. A ScriptProcessor fallback supports older Web Audio implementations. The actual audio context is resumed explicitly, and its sample rate is carried in the WAV header; the host normalizes to 16 kHz.

Browser constraints are requests; operating-system or microphone-driver audio enhancements may remain active. The browser cannot guarantee that it has disabled processing implemented by the hardware. Automated tests use synthetic PCM, not a person's recordings, and do not establish recognition accuracy for a particular microphone.

## Model and setup

The [voice model release](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/tag/voice-model-sensevoice-2024-07-17) contains **model.int8.onnx**, **tokens.txt**, the model license and attribution. It is separate from the npm package and downloaded on first use. Upstream model sources are fallback locations; model files are checked with pinned SHA-256 digests before installation.

```text
<runtimeDir>/
  bin/sherpa-onnx-offline.exe
  bin/onnxruntime.dll
  bin/onnxruntime_providers_shared.dll
  models/sense-voice/model.int8.onnx
  models/sense-voice/tokens.txt
```

From the plugin directory:

```sh
npm run setup:local
npm run setup:local -- --dir /path/to/runtime --verify-only
npm run setup:local -- --wav /path/to/local-audio.wav
npm run live -- /path/to/local-audio.wav
```

The default setup check loads the engine with generated silence; it is a runtime check, not an accuracy benchmark. No sample of a user's voice ships in this repository. Downloads follow HTTPS redirects, resume interrupted transfers and use an explicit proxy, proxy environment variables or the Windows system proxy. Proxy credentials are not printed by setup.

## Configuration

Set host options in your user patch targeting row `voice-input`:

| Option | Default | Meaning |
| --- | --- | --- |
| `runtimeDir` | empty | Use `$DSH_HOME/third-party/data/voice-input`, or reuse an existing legacy `$DSH_HOME/voice-input`. Relative host paths are anchored in `$DSH_HOME`; absolute paths remain unchanged. |
| `language` | `zh` | `auto`, `zh`, `en`, `ja`, `ko`, `yue`. |
| `itn` | `true` | Normalize spoken numbers. |
| `threads` | `0` | Auto-select CPU threads. |
| `autoProvision` | `true` | Download a missing runtime on first use. |
| `proxy` | empty | Explicit HTTP(S) proxy, otherwise environment/system proxy. |
| `modelBaseUrl` | empty | Override the HTTPS release asset directory; the pinned model digests still apply. |
| `maxBytes` | 64 MiB | Audio request limit. |
| `timeoutMs` | 120000 | Timeout for one engine invocation. |
| `exePath`, `modelPath`, `tokensPath` | empty | Advanced explicit runtime file paths. |

`DSH_VOICE_MODEL_BASE_URL` also overrides the default release asset directory. The setup CLI accepts `--model-base-url`. `VOICE_RUNTIME_DIR` selects a runtime for the standalone scripts. Browser options are `maxSeconds` (default 600; 0 means unlimited) and `hotkey` (default `AltLeft+Backquote+Digit1`; empty/`none` disables it).

Host configuration paths (`runtimeDir`, `exePath`, `modelPath`, `tokensPath`) resolve relative to `$DSH_HOME` and support `~`. By normal command-line convention, a relative setup `--dir`, `--wav`, live WAV argument or `VOICE_RUNTIME_DIR` resolves against the command's working directory. With no override, scripts use the same default/legacy runtime selection as the host.

## Troubleshooting

`session/cancel failed: Failed to fetch (gateway/internal)` is a DSH connection failure: verify that `dsh web` is running and reload the browser after restarting it. Voice recognition uses a separate local `/api/asr` route. If speech recognition fails, check `http://127.0.0.1:3080/api/asr` using your actual WebUI port; `ready: true` means the expected runtime files are present. A successful runtime check does not validate browser capture quality.

## Development and licenses

```sh
npm install
npm run build
npm test
```

Tests cover WAV conversion, raw microphone constraints, audio-context cleanup, worklet tail flush, time limits, ASR routing, runtime paths, redirects and model integrity. Generated bundles contain no source maps or user recordings.

Plugin code: MIT. sherpa-onnx: Apache-2.0. SenseVoice-Small weights: **FunASR Model License**, not MIT; see the model release's `MODEL_LICENSE` and `THIRD_PARTY_NOTICES`. Upstream: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [SenseVoice ONNX model](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17).
