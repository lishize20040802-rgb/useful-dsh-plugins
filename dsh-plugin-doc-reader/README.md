# `dsh-plugin-doc-reader`

English | [中文](#中文)

A DeepSeek Harness host plugin: the model-facing **`read_document`** tool. It reads document files that the plain `read` tool cannot handle — PDF, DOCX and XLSX — plus UTF-8 text files, all through the harness filesystem backend (`ctx.fs`), so it inherits the session workspace resolution, the sandbox policy and the fs-observation policy exactly like the built-in tools.

## How it works

One tool, four formats, dispatched by file extension (or an explicit `format` argument):

| Format | Extensions | Extractor |
|---|---|---|
| `text` | anything else (`.md` `.txt` `.csv` `.json` `.py` …) | UTF-8 decode, binary rejected (NUL sniff), BOM stripped |
| `pdf` | `.pdf` | `pdf-parse` (extracts the **text layer only**; see limitations) |
| `docx` | `.docx` | `mammoth.extractRawText` |
| `xlsx` | `.xlsx` `.xlsm` | `xlsx` → per-sheet TSV rows |

Extracted text is windowed with the same semantics as the built-in `read` tool: 1-based line numbers, `offset`/`limit` paging, line-length and byte caps, and the OpenCode-style `<path>/<type>/<content>` envelope.

## Config

| Key | Default | Meaning |
|---|---|---|
| `readLimit` | `2000` | Default and maximum lines returned by one call. |
| `maxFileBytes` | `67108864` | Byte cap for one document read. |
| `sheetRowLimit` | `200` | Rows kept per worksheet (longer sheets get a `... (N more rows)` footer). |

## Installation

```sh
dsh plugin --profile web add <path-to-this-package>
# restart dsh web
```

## Build & test

```sh
npm install --legacy-peer-deps   # pdf-parse / mammoth / xlsx
node --test                      # pure-parse + mock-ctx contract tests
```

## Model Experience

### System prompt

One guidance section (`tool:read-document`) points the model at `read_document` for PDF/DOCX/XLSX and notes `offset`/`limit` paging.

### Tool schema

`read_document(file_path, format?, offset?, limit?)` with a structured `{ path, format, offset, lines, totalLines }` output schema and the line-numbered envelope rendering.

## Known Limitations

- **Scanned PDFs yield no text** — `pdf-parse` reads the embedded text layer only; image-only (scanned) PDFs come back empty. OCR is **explicitly deferred** (decision 2026-08: an image-recognition path is out of scope for now; if added later it would be an opt-in extractor, not a default, given its cost and formula-rendering quality).
- **Text mode is UTF-8 only** — other encodings decode as garbage; binary content is refused rather than echoed.
- **Legacy `.doc` is not parsed** — only OOXML `.docx`.
- **Large documents are windowed** — the model reads one window per call; very long files need several paged calls.
- Formula-heavy PDFs lose mathematical structure (plain text only; no LaTeX reconstruction).

---

## 中文

一个 DeepSeek Harness 主机插件：提供模型可用的 **`read_document`** 工具，读取普通 `read` 工具无法处理的文档——PDF、DOCX、XLSX——以及 UTF-8 文本文件；文件访问全部经由 `ctx.fs`（Harness 文件系统后端），自动继承会话工作区解析、沙箱策略与 fs 观察策略，与内置工具行为一致。

四种格式按扩展名分发（也可用 `format` 参数显式指定）：PDF 走 `pdf-parse`（只读文字层）、DOCX 走 `mammoth`、XLSX 走 `xlsx` 逐表序列化、其余按 UTF-8 文本（二进制拒绝）。提取结果沿用内置 `read` 的行号窗口语义（`offset`/`limit` 分页、行长与字节上限、OpenCode 风格信封）。

配置：`readLimit`（默认 2000 行）、`maxFileBytes`（默认 64MB）、`sheetRowLimit`（默认每表 200 行）。安装与构建方式同英文部分。

已知局限：**扫描版 PDF 无文字层，提取为空**——OCR 识图已明确暂缓（2026-08 决定：当前不做，未来若加将作为可选提取器而非默认）；文本模式仅 UTF-8；不支持旧版 `.doc`；长文档需分页多次读取；公式型 PDF 只保留纯文本、不重建数学结构。
