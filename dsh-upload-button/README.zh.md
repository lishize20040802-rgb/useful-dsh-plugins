# `dsh-upload-button`

一个 DeepSeek Harness 双面插件：在 Web 聊天输入框工具栏添加无边框「上传文件」按钮。选择任意文件后，上传结果以**浮在输入框上方的微软经典配色竖版卡片**呈现（PDF 红、Word 蓝、Excel 绿……）；直接按原有「发送」按钮，输入机 occurrence 管线会把每个文件自动展开成落盘路径附入消息，发送后卡片随草稿提交自动消失；点卡片右上角 ✕ 可完整撤销一次上传（草稿标记、卡片、服务器文件一并清理）。重复上传相同内容自动去重。任何错误以**可关闭的红色横幅**（带 ✕）提示。

## 工作原理

- **浏览器半边**（`exports["./client"]`，构建产物 `lib/client.js`）：
  - 注册一个 input-trigger 源（`dsh-upload-button`，codec 把 ref 序列化为路径），官方提交管线据此把每个 occurrence 标记展开进消息——零发送拦截；
  - 在官方 `conversation.input.left` slot 注册无边框按钮；选文件后 POST 到 `/api/upload`，并通过官方作用域事件 `slash/input-insert-reference` 在草稿末尾插入 occurrence 标记（带 draftRev CAS 与插入结果核验）；
  - 在 `conversation.input.dock` 渲染每个标记对应的浮动卡片（官方 QueueDock 对齐公式、竖版页面徽章、两行截断文件名、右上角 ✕）与可关闭的错误横幅。
- **Node 半边**（`exports["."]`）：在 host webserver 注册 `/api/upload` 路由——`POST` 保存请求体到 `uploadDir`（内容寻址命名，相同内容重复上传自动去重）并返回 `{ path, name, bytes }`；`DELETE ?path=<file>` 删除已上传文件（路径必须位于 `uploadDir` 内）。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `maxBytes` | `67108864` | 单次上传字节上限（Content-Length 预检 + 流式计数双重约束）。 |
| `uploadDir` | `process.cwd()/uploads` | 落盘目录（内容寻址命名 `<sha256前缀>-<文件名>`）。默认值不合适时可指向 agent 工作区可见的目录。 |
| `allowedExtensions` | 未设置（任意） | 可选的小写扩展名白名单，如 `["pdf","docx","xlsx","md"]`。 |

## 安全围栏

官方 webserver 本身不鉴权；本路由自实现围栏：仅 loopback `Host`、同源 `Origin` 与 Fetch-Metadata 校验、仅 `POST`/`DELETE`、上述字节上限、文件名净化（去分隔符/路径穿越/控制字符）、可选扩展名白名单；`DELETE` 还要求解析后的路径必须位于 `uploadDir` 内。

## 安装

```sh
dsh plugin --profile web add dsh-upload-button
# 重启 dsh web；bundle 会自动编入 window.__DSH_BOOT__
```

## 构建

```sh
npm run build   # esbuild：lib/index.js（node 半边）+ lib/client.js（browser 半边）
npm test
```

## 模型体验

无直接作用：本插件不注册模型工具、不注入提示词段落。对模型唯一可见的产物是用户主动发送的消息里携带的文件路径。

## 已知局限

- 界面文案为硬编码中文；后续将改用官方 `locale` 命名空间（`t()` kit）。
- 引用源注册在 `@` 触发器下且零候选：`@` 菜单不应列出它，但这依赖上游对空分组的隐藏行为。
- 通过退格删除的标记不会清理服务器文件（内容寻址存储暂无 GC）；用卡片 ✕ 移除则三者一并清理。
- 扫描版 PDF 等二进制文件可正常上传，但内容可读性取决于配套阅读插件（如 `dsh-plugin-doc-reader`；OCR 识图不在范围内）。
