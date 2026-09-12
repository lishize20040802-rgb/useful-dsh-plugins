# dsh-plugin-vision-reader

**图片直接进上下文，由主模型自己看。** 这个插件不做任何"把图转述成文字"的中间层——对能看图的模型来说，二手描述永远不如原图。它在内置图片能力之上补的是**持久性**：粘贴的图片会被另存为本地文件，消息里给出路径，于是同一张图随时可以再看一遍（放大、复核细节、换角度重看）。

Images go straight into the context and the main model looks at them itself. This plugin adds no "describe the image as text" middle layer — for a model that can see, a second-hand description is strictly worse than the picture. What it adds on top of the built-in image support is **durability**: pasted images are saved to local files and the message carries the path, so the same picture can be re-read at any later point.

## 功能 / Features

- **原图直通**：`image` 块原样交给主模型，全保真，不经过任何转述。
- **粘贴图片落盘**：粘贴的图片同时写入本地文件（内容寻址，同图去重），消息里追加 `【图片已保存】<绝对路径>`，之后可反复回看。上传的文件本来就是路径，原样保留。
- **`vision` 工具（独立复核）**：让 DeepSeek 内置多模态模型（`deepseek-official` / `deepseek-v4-flash-vision-exp`）对同一张图再看一遍，返回纯文本——用于换一个模型交叉验证。**无需额外 API Key**（与主模型共用 `DEEPSEEK_API_KEY`）。支持单图（`file_path`）和多图（`file_paths`，最多 10 张）。

- **Verbatim pass-through**: `image` blocks reach the main model untouched, at full fidelity, with no transcription in between.
- **Pasted images persisted**: each pasted image is also written to a local file (content-addressed, identical bytes dedupe) and the message gains a `【图片已保存】<absolute path>` note for repeated viewing. Uploaded files are already paths and stay as they are.
- **`vision` tool (independent second opinion)**: asks DeepSeek's built-in multimodal model (`deepseek-official` / `deepseek-v4-flash-vision-exp`) to look at the same image again and returns plain text — for cross-checking with a different model. **No extra API key**: it shares the main model's `DEEPSEEK_API_KEY`. Single (`file_path`) and multiple (`file_paths`, up to 10) images supported.

> 适用于**能看图的模型**。如果你的主模型是纯文本的，Harness 会在发消息前拒绝图片（`MODEL_DOES_NOT_SUPPORT_IMAGES`）——请换用声明了 `image` 输入模态的模型。本插件不再改写图片为文字。
>
> Intended for **models that accept image input**. With a text-only main model, Harness rejects the message up front (`MODEL_DOES_NOT_SUPPORT_IMAGES`) — switch to a model that declares the `image` input modality. This plugin no longer converts images to text.

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
    provider: deepseek-official           # 备用视觉路由 provider
    model: deepseek-v4-flash-vision-exp   # 备用视觉模型（需声明 image 模态）
    instruction: '请详细描述这张图片的内容'  # 模型未指明时的默认识别要求
    inboxDir: 'D:\harness\uploads\vision'  # 粘贴图片落盘目录（默认 $DSH_HOME/vision-inbox）
```

配置修改后重启 dsh 生效。

Works with zero configuration. To tune, override in the profile's `cordis.patch.yml` (`id: vision-reader`) — fields listed above. Restart dsh after editing.

## 模型体验 / Model Experience

- 主模型保持用户选择的模型不变；图片按主模型自己的模态能力进上下文。
- 视觉调用与主对话共用同一个 `DEEPSEEK_API_KEY`，无额外计费渠道。
- 落盘是内容寻址的：同一张图反复粘贴只占一份文件。

- The main model stays exactly as the user selected; images enter the context on that model's own terms.
- Vision calls share the same `DEEPSEEK_API_KEY` as the conversation — no separate billing channel.
- Persistence is content-addressed: re-pasting the same image costs exactly one file.

## KV Cache 效应 / KV Cache Effect

**原图直通后，图片像素会占用主模型的上下文**（Harness 的图片像素预算，本部署为 16 万像素/图）。这是换取全保真的代价：模型看到的是原始画面，而不是一段可能漏掉细节的描述。落盘不改变上下文——它只保证之后每次回看都能拿到同一张图。

**With verbatim pass-through, image pixels DO occupy the main model's context** (Harness's image pixel budget; 160k pixels per image in this deployment). That is the price of full fidelity: the model sees the original picture instead of a description that may have dropped the detail it needed. Persistence does not change the context — it only guarantees the same picture is still available on every later look.

## 已知限制 / Known Limitations

- 需要主模型声明 `image` 输入模态；纯文本主模型会在发消息时被 Host 拒绝。
- 备用视觉路由固定为配置的 provider/model；该模型必须声明 `image` 输入模态。
- 图片格式仅支持 PNG / JPEG / WebP / GIF（与内置 `read_image` 一致）。
- 单次 `vision` 调用最多 10 张图片。
- 落盘是尽力而为：写盘失败时图片照常进上下文，只是不带 `【图片已保存】` 路径。

- Requires a main model that declares the `image` input modality; a text-only main model is rejected by the Host at send time.
- The fallback vision route is fixed to the configured provider/model, which must declare the `image` input modality.
- Only PNG / JPEG / WebP / GIF are accepted (same as the built-in `read_image`).
- At most 10 images per `vision` call.
- Persistence is best-effort: if the write fails the image still enters the context, just without a `【图片已保存】` path.

## License

MIT
