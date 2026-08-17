# `dsh-upload-button`

一个 DeepSeek Harness 双面插件：在 Web 聊天输入框工具栏添加无边框「上传文件」按钮。选择任意文件后，上传结果以**浮在输入框上方的微软经典配色竖版卡片**呈现（PDF 红、Word 蓝、Excel 绿……）。**上传完全不影响输入框**——草稿里不会插入任何隐藏字符，光标与文字保持原样。直接按原有「发送」按钮，插件会在官方 `session.prompt` 门面上透明地把每个文件的落盘路径附加进即将发出的消息，发送成功后卡片自动消失；点卡片右上角 ✕ 可完整撤销一次上传（待发列表与服务器文件一并清理）。重复上传相同内容自动去重。任何错误以**可关闭的红色横幅**（带 ✕）提示。

聊天历史里的已发消息**只显示用户说的话**：每个附件以**与输入框上方完全相同的微软经典竖版卡片**悬浮在气泡上沿呈现（点击可打开文件），文件路径**绝不显示**——但路径仍然留在发给模型的消息里，agent 依然能读取上传的文件。

## 工作原理

- **浏览器半边**（`exports["./client"]`，构建产物 `lib/client.js`）：
  - 在官方 `conversation.input.left` slot 注册无边框按钮；选文件后 POST 到 `/api/upload`，并把保存路径加入**按会话隔离的待发附件列表**——**从不写草稿**，输入框因此完全不受上传影响；
  - 在 `conversation.input.dock` 渲染每个待发文件对应的浮动卡片（官方 QueueDock 对齐公式、竖版页面徽章、两行截断文件名、右上角 ✕）与可关闭的错误横幅；
  - 对每个会话的官方 `session.prompt` 门面做一次透明包装（WeakSet 幂等）：存在待发文件时，先把路径以 inline-code 标记追加进发出的内容，再调用原始 prompt；发送被接受后才清空待发列表——发送失败则卡片保留可重试。模型收到的路径逐字保留；
  - 在 keyed slot `conversation.chat.node` 上以 **priority −1（官方为 0，数值小者胜出）** 影子替换官方用户气泡渲染器：气泡只显示用户文字，每个附件以与输入框同款的竖版文件卡片悬浮在气泡上方，并保留图片画廊、`/@` 引用 chip、时间 + 复制操作行。复制与模型看到的是完整原文（含路径）——只是显示层面隐藏了路径。
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
npm run build   # 类型检查 + esbuild（lib/index.js / lib/client.js）+ 输出 lib/types/*.d.ts
npm test
```

## 模型体验

无直接作用：本插件不注册模型工具、不注入提示词段落。对模型唯一可见的产物是用户主动发送的消息里携带的文件路径——路径在聊天界面不可见（气泡只显示文字 + 悬浮文件卡片），但模型收到的消息原文中路径逐字保留。

## KV Cache 影响

无：上传路径直接搭载在用户消息文本里，只按普通 prompt token 计费。插件不保留任何隐藏的模型可见状态——没有额外上下文块、没有提示词段落注入、没有会增加 KV cache 的每轮元数据。

## 已知局限

- 待发列表是浏览器模块级状态：刷新页面会清掉「已上传但未发送」的卡片（服务器文件仍在 `uploadDir`，内容寻址存储）。
- 服务器文件暂无 GC：只有卡片 ✕ 会删除文件（插件已不再有草稿标记，上传不写输入框，因此也没有"退格删标记"这条路径）。
- 影子气泡渲染器用自有 CSS 复刻官方气泡视觉；若官方未来改版用户消息布局，本渲染器不会自动跟进。
- 扫描版 PDF 等二进制文件可正常上传，但内容可读性取决于配套阅读插件（如 `dsh-plugin-doc-reader`，仅提取文字——**不支持识图/OCR**）。

## 开发规范

本包遵循官方 Harness 插件标准：TypeScript 源码 + 严格类型检查 + 随包发布 `lib/types/*.d.ts` 类型声明；schemastery `Config` 带 schema 级默认值；自持 locale 命名空间（`dsh-upload-button`，zh/en 完整成对）经 `ctx.locale` 注册，组件文案统一走官方 slot `locale:` 座位；browser 半边使用 esbuild 工厂信封。`npm run build` 先类型检查，再打包两个半边并输出声明。
