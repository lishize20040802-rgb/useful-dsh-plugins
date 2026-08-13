# `dsh-plugin-doc-reader`

一个 DeepSeek Harness 主机插件：提供模型可用的 **`read_document`** 工具，读取普通 `read` 工具无法处理的文档——PDF、DOCX、XLSX——以及 UTF-8 文本文件。文件访问全部经由 `ctx.fs`（Harness 文件系统后端），自动继承会话工作区解析、沙箱策略与 fs 观察策略，与内置工具行为一致。

## 工作原理

一个工具、四种格式，按扩展名分发（也可用 `format` 参数显式指定）：

| 格式 | 扩展名 | 提取器 |
|---|---|---|
| `text` | 其余全部（`.md` `.txt` `.csv` `.json` `.py` …） | UTF-8 解码，二进制拒绝（NUL 嗅探），剥离 BOM |
| `pdf` | `.pdf` | `pdf-parse`（**只读文字层**，见局限） |
| `docx` | `.docx` | `mammoth.extractRawText` |
| `xlsx` | `.xlsx` `.xlsm` | `xlsx` → 逐表 TSV 行 |

提取结果沿用内置 `read` 工具的行窗口语义：1 起始行号、`offset`/`limit` 分页、行长与字节上限、OpenCode 风格 `<path>/<type>/<content>` 信封。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `readLimit` | `2000` | 单次调用返回的默认与最大行数。 |
| `maxFileBytes` | `67108864` | 单次读取的字节上限。 |
| `sheetRowLimit` | `200` | 每个工作表保留的行数（超出部分追加 `... (N more rows)` 脚注）。 |

## 安装

```sh
dsh plugin --profile web add dsh-plugin-doc-reader
# 重启 dsh web
```

## 构建与测试

```sh
npm install --legacy-peer-deps   # pdf-parse / mammoth / xlsx
node --test                      # 纯解析 + mock ctx 契约测试
```

## 模型体验

### 系统提示

一段引导（`tool:read-document`）指引模型用 `read_document` 读取 PDF/DOCX/XLSX，并说明 `offset`/`limit` 分页。

### 工具 schema

`read_document(file_path, format?, offset?, limit?)`，结构化输出 schema `{ path, format, offset, lines, totalLines }`，行号信封渲染。

## 已知局限

- **不支持识图（OCR）**——本插件只提取**文字**，无法从图片中读出文字。扫描版/纯图片 PDF（无文字层的书页照片）提取结果为空；单独的图片文件（PNG/JPG 截图）会被当作二进制拒绝。OCR 识图**已明确暂缓**（2026-08 决定：当前不做；未来若加将作为可选提取器而非默认，考虑其成本与公式还原质量）。
- **文本模式仅 UTF-8**——其他编码解码为乱码；二进制内容直接拒绝而非回显。
- **不支持旧版 `.doc`**——仅解析 OOXML `.docx`。
- **长文档需分页**——模型每次读取一个窗口，超长文件需要多次分页调用。
- 公式型 PDF 丢失数学结构（仅纯文本，不做 LaTeX 重建）。
