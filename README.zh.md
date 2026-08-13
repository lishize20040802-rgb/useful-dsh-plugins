# useful-dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的社区插件集合。**本项目是独立社区项目，与 DeepSeek 官方无隶属关系。**

两个开箱即用的插件互相配合：在聊天输入框上传文件，然后让 agent 直接读取。

## 插件列表

| 包 | 类型 | 功能 |
|---|---|---|
| [`dsh-upload-button`](./dsh-upload-button) | 双面（host + browser） | 输入框工具栏的无边框 📎 按钮。上传的文件以浮在输入框上方的微软经典配色竖版卡片呈现；按原有「发送」键即自动把文件路径附入消息（原生输入机 occurrence 管线，零发送拦截）。 |
| [`dsh-plugin-doc-reader`](./dsh-plugin-doc-reader) | host | 模型可用的 `read_document` 工具：经由 Harness 文件系统后端（`ctx.fs`）读取文本、PDF、DOCX 和 XLSX 文件，具备与内置 read 工具一致的行窗口分页语义。 |

## 安装

```sh
dsh plugin --profile web add dsh-upload-button
dsh plugin --profile web add dsh-plugin-doc-reader
# 重启 dsh web
```

两个包都声明了自己的 cordis bundle patch（`dsh.bundle`），`dsh plugin` 会自动把它们登记进 `dsh.profile.bundles`。

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6（peer 依赖由 Harness 安装提供）
- `dsh-upload-button` 另需 `web` profile 组合（挂载 `ctx.webServer`、`ctx.slots` 与 `ctx.inputTriggers`）

## 开发

```sh
# doc-reader：纯 ESM，无构建步骤
cd dsh-plugin-doc-reader && npm install --legacy-peer-deps && npm test

# upload-button：esbuild 构建两个半边
cd dsh-upload-button && npm install --legacy-peer-deps && npm run build && npm test
```

架构笔记与 UI 机制深挖见 [`docs/`](./docs)——尤其是输入机 occurrence 管线研究（`docs/dsh-web-ui-plugin-research.md`），是任何想在此平台构建"输入框附件类插件"的开发者的参考。

## 许可证

[MIT](./LICENSE)
