# `dsh-upload-button`

English | [中文](#中文)

A DeepSeek Harness dual-face plugin: a borderless file upload button in the web composer toolbar. Pick one or more files and each upload becomes a native chip **inside the composer draft** (filename + type emoji). The chip behaves exactly like an attachment: press the ordinary Send button and the input machine's occurrence pipeline expands each chip into its saved path in the outgoing message; the draft commits and the chip disappears. Backspace removes a chip like any other text.

## How it works

- **Browser half** (`exports["./client"]`, built bundle `lib/client.js`):
  - registers one **input-trigger source** (`dsh-upload-button`, codec: ref → path) so the official submit pipeline serializes each occurrence chip to its upload path — zero send interception;
  - registers a borderless button in `conversation.input.left`; picking files POSTs them to `/api/upload` and inserts one occurrence chip at the end of the draft via the official scoped `slash/input-insert-reference` event (span-CAS against the live draft, applied-truth verified, failure surfaced through the composer notice).
- **Node half** (`exports["."]`): registers a `/api/upload` route on the host webserver — `POST` saves the body to `uploadDir` and answers `{ path, name, bytes }`; `DELETE ?path=<file>` removes an uploaded file (the path must resolve inside `uploadDir`).

## Config

| Key | Default | Meaning |
|---|---|---|
| `maxBytes` | `67108864` | Byte cap for one upload (Content-Length pre-check + streamed count). |
| `uploadDir` | `process.cwd()/uploads` | Directory files are saved to (content-addressed as `<sha256-prefix>-<name>`). Point it at a directory visible to the agent's workspace when the default is not. |
| `allowedExtensions` | unset (any) | Optional lowercase extension whitelist, e.g. `["pdf","docx","xlsx","md"]`. |

## Security stance

The webserver performs no auth of its own; this route implements its own fence: loopback `Host` only, same-origin `Origin` and Fetch-Metadata checks, `POST`/`DELETE` only, the byte cap above, filename sanitization (no separators, traversal, or control characters), the optional extension whitelist, and for `DELETE` the requirement that the resolved path stays inside `uploadDir`.

## Installation

```sh
dsh plugin --profile web add <path-to-this-package>
# restart dsh web; the bundle enters window.__DSH_BOOT__ automatically
```

## Build

```sh
npm run build   # esbuild: lib/index.js (node half) + lib/client.js (browser half)
npm test
```

## Model Experience

None directly: this plugin registers no model tool and no prompt section. Its only model-visible effect is user-authored: each uploaded file's path enters the conversation as part of the message the user sends.

## Known Limitations

- UI labels are hardcoded Chinese; a proper `locale` namespace (the official `t()` kit) is the intended follow-up.
- Upload failures only surface in the browser console (insert failures additionally raise a composer notice); a toast/notice for every failure is the intended follow-up.
- The reference source registers under the `@` trigger with zero candidates; the `@` menu should never list it, but that relies on empty-group hiding upstream.
- Removed chips leave their files in `uploadDir` (content-addressed, no garbage collection yet).
- The `DELETE` verb is currently unused by the UI and kept for programmatic cleanup.

---

## 中文

一个 DeepSeek Harness 双面插件：在 Web 聊天输入框工具栏添加无边框「上传文件」按钮。选择任意文件后，上传结果以**输入框内的原生芯片**呈现（文件名 + 类型 emoji），行为与主流 AI 的附件一致——直接按原有「发送」按钮，输入机 occurrence 管线会把每个芯片自动展开成落盘路径发消息，发送后芯片随草稿提交自动消失；退格键可像删除文字一样移除芯片。

- **浏览器半边**：注册一个 input-trigger 源（`dsh-upload-button`，codec 把 ref 序列化为路径），提交管线据此把芯片展开进消息——零发送拦截；按钮注册在官方 `conversation.input.left` slot，上传后通过官方 `slash/input-insert-reference` 作用域事件把芯片插入草稿末尾（带 draftRev CAS 校验与插入结果核验，失败通过 composer notice 提示）。
- **Node 半边**：在 host webserver 注册 `/api/upload` 路由——`POST` 保存请求体并返回 `{ path, name, bytes }`；`DELETE ?path=<file>` 删除已上传文件（路径必须位于 `uploadDir` 内）。

配置（`maxBytes` 默认 64MB、`uploadDir` 默认 `process.cwd()/uploads`、可选 `allowedExtensions` 扩展名白名单）、安全围栏（仅 loopback + 同源校验 + 字节上限 + 文件名净化）与构建方式同英文部分。
