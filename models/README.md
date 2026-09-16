# SenseVoiceSmall model / 语音模型

The weights are release assets, not Git blobs or npm package contents. [Download](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/tag/voice-model-sensevoice-2024-07-17).

权重通过 GitHub Release 分发，不放入普通 Git 对象或 npm 包。

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| model.int8.onnx | 239233841 | c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51 |
| tokens.txt | 315894 | f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc |

Original model: **SenseVoiceSmall**, [FunAudioLLM / Alibaba](https://huggingface.co/FunAudioLLM/SenseVoiceSmall). ONNX conversion: **csukuangfj**, [sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tree/2365baeacb507f821a0c8120fcee3d484dba7a07). The unmodified INT8 weights match the upstream SHA256; they are not personal fine-tuned weights. The vocabulary is redistributed without modification.

原始模型作者为 FunAudioLLM / Alibaba，ONNX 转换作者为 csukuangfj；模型名保留 SenseVoiceSmall。权重与公开上游 SHA256 一致，未经个人微调；词表未修改。

The weights use the **FunASR Model Open Source License Agreement v1.1**, not this repository's MIT license. The release includes `MODEL_LICENSE`, the conversion repository's `UPSTREAM_LICENSE`, and `THIRD_PARTY_NOTICES.md`. Read those terms before use or redistribution. Upstream license file blob: `d5cc52aad23a88da10b8cffbd9b56d43ac7398fa` in [FunASR](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE).

权重遵守 FunASR 模型开源许可协议 v1.1，不适用本仓库代码的 MIT。使用或再分发前请阅读模型发布包附带的原许可与来源说明。

The inference engine is downloaded separately from [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) and retains its Apache-2.0 and bundled third-party notices. No local engine binaries or recordings are copied into this model release.
