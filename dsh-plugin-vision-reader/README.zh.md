# dsh-plugin-vision-reader

让 DeepSeek Harness 的**纯文本主模型也能看图**。遇到图片时，插件自动调用 DeepSeek 内置多模态模型（`deepseek-official` / `deepseek-v4-flash-vision-exp`）识别，识别结果以**纯文本**返回给主模型——**无需任何额外 API Key**（与主模型共用同一个 `DEEPSEEK_API_KEY`）。

Lets text-only main models read images. Image content is routed through DeepSeek's built-in multimodal model (`deepseek-official` / `deepseek-v4-flash-vision-exp`) and returned as plain text — **no extra API key required** (the same `DEEPSEEK_API_KEY` the main model uses).

## 功能 / Features

- **`vision` 工具**：模型把图片路径交给插件，插件读取文件、持久化为附件、调用多模态模型识别，返回纯文本。支持单图（`file_path`）和多图（`file_paths`，最多 10 张）。
- **粘贴图片自动转述**：用户直接粘贴进对话的图片，在进入主模型前被自动转述成文字（`【图片转述】…`）；图片永不进入主会话上下文，主模型只看到文字。
- **动态隐藏 `read_image`**：当主模型不支持图片输入时，自动隐藏必失败的 `read_image`，把模型引导到 `vision` 工具；切换到多模态主模型时自动恢复。

- **`vision` tool**: the model hands image paths to the plugin, which reads the files, persists them as attachments, asks the multimodal model to describe/answer, and returns plain text. Single (`file_path`) and multiple (`file_paths`, up to 10) images supported.
- **Pasted-image transcription**: images the user pastes directly into a message are transcribed to text (`【图片转述】…`) before reaching the main model; the image never enters the main conversation context.
- **Dynamic `read_image` hiding**: while the main model is text-only, the built-in `read_image` tool (which would always fail) is hidden and the model is steered to `vision`; switching to a multimodal main model restores it.

## 安装 / Install

```bash
dsh plugin --profile web add dsh-plugin-vision-reader
# 重启 dsh 生效 / restart dsh to apply
```

## 配置 / Configuration

默认零配置即可用。如需调整，在 profile 的 `cordis.patch.yml` 覆盖（`id: vision-reader`）：

```yaml
- id: vision-reader
  config:
    provider: deepseek-official      # 视觉路由 provider
    model: deepseek-v4-flash-vision-exp  # 视觉模型（需声明 image 模态）
    transcribeImages: true           # 粘贴图片自动转述
    autoHideReadImage: true          # 纯文本主模型时隐藏 read_image
    instruction: '请详细描述这张图片的内容'  # 模型未指明时的默认识别要求
```

配置修改后重启 dsh 生效。

Works with zero configuration. To tune, override in the profile's `cordis.patch.yml` (`id: vision-reader`) — fields listed above. Restart dsh after editing.

## 模型体验 / Model Experience

- 主模型保持用户选择的模型不变（如 `deepseek-v4-flash`）；只有图片内容走多模态模型。
- 视觉调用与主对话共用同一个 `DEEPSEEK_API_KEY`，无额外计费渠道。
- 视觉识别结果有逐步骤缓存（同一图片在同一轮只识别一次）。

- The main model stays exactly as the user selected (e.g. `deepseek-v4-flash`); only image content uses the multimodal model.
- Vision calls share the same `DEEPSEEK_API_KEY` as the conversation — no separate billing channel.
- Recognition results are cached per step, so the same image is recognized once per turn.

## KV Cache 效应 / KV Cache Effect

粘贴图片转述后，主模型的上下文里只有文字；图片像素永不占用主模型的 KV 缓存。长对话中重复引用同一图片（通过 `vision` 工具）也只会把识别文本放入上下文。

After transcription, only text enters the main model's context; image pixels never occupy its KV cache. Re-reading the same image via `vision` in a long conversation only adds its recognized text.

## 已知限制 / Known Limitations

- 视觉路由固定为配置的 provider/model；配置的模型必须声明 `image` 输入模态，否则启动时报错并给出指引。
- 图片格式仅支持 PNG / JPEG / WebP / GIF（与内置 `read_image` 一致）。
- 单次 `vision` 调用最多 10 张图片。
- 无网络或 DeepSeek 服务不可用时，自动转述会保留原图并提示失败（不会丢弃用户消息）。

- The vision route is fixed to the configured provider/model; the configured model must declare `image` input modality or startup fails with guidance.
- Only PNG / JPEG / WebP / GIF are accepted (same as the built-in `read_image`).
- At most 10 images per `vision` call.
- When offline or the DeepSeek service is unavailable, transcription keeps the original image and reports failure — user messages are never dropped.

## License

MIT
