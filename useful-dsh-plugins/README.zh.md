# `useful-dsh-plugins`

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供**一键安装**两个社区插件的总包：

```sh
dsh plugin --profile web add useful-dsh-plugins
# 重启 dsh web
```

一条命令即可完成安装与登记：

| 插件 | 功能 |
|---|---|
| [`dsh-upload-button`](https://www.npmjs.com/package/dsh-upload-button) | 输入框工具栏的无边框 📎 按钮：文件以上方浮动彩色卡片呈现，按「发送」自动把路径附入消息。 |
| [`dsh-plugin-doc-reader`](https://www.npmjs.com/package/dsh-plugin-doc-reader) | 模型可用的 `read_document` 工具，读取文本、PDF、DOCX、XLSX（**仅文字，不支持识图**）。 |

## 这个包是什么

一个元包（meta package）：依赖上述两个插件，并声明一个 bundle patch 统一登记两行 cordis 配置。两个插件自身也各自携带 `cordis.patch.yml`，单独安装（`dsh plugin add dsh-upload-button` / `dsh plugin add dsh-plugin-doc-reader`）依旧照常工作。

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- `web` profile 组合（上传按钮的 UI 半边需要）

## 许可证

[MIT](../LICENSE)
