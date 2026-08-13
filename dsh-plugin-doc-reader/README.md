# `dsh-plugin-doc-reader`

[中文说明](./README.zh.md)

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
dsh plugin --profile web add dsh-plugin-doc-reader
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
