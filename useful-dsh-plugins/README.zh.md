# `useful-dsh-plugins`

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供**一键安装**三个社区插件的总包：

```sh
dsh plugin --profile web add useful-dsh-plugins
# 重启 dsh web
```

一条命令即可完成安装与登记：

| 插件 | 功能 |
|---|---|
| [`dsh-upload-button`](https://www.npmjs.com/package/dsh-upload-button) | 输入框工具栏的无边框 📎 按钮：文件以上方浮动彩色卡片呈现，按「发送」自动把路径附入消息。 |
| [`dsh-plugin-doc-reader`](https://www.npmjs.com/package/dsh-plugin-doc-reader) | 模型可用的 `read_document` 工具，读取文本、PDF、DOCX、XLSX（**仅文字，不支持识图**）。 |
| [`useful-dsh-plugin-manager`](https://www.npmjs.com/package/useful-dsh-plugin-manager) | 设置页插件管理器：启用/停用、检查更新、一键修复。 |

## 这个包是什么

一个元包（meta package）：依赖上述插件，并声明一个 bundle patch 统一登记各行 cordis 配置。每个插件自身也各自携带 `cordis.patch.yml`，单独安装（如 `dsh plugin add dsh-plugin-doc-reader`）依旧照常工作。

`dsh-plugin-vision-reader` 与 `dsh-desktop-config` 在同一个仓库里，但**不发布、也不属于本总包** —— 它们是本地自用插件，用 `dsh plugin --profile web add link:<仓库>/<目录>` 安装。

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.5-rc.2
- `web` profile 组合（UI 半边需要）

## 许可证

[MIT](../LICENSE)
