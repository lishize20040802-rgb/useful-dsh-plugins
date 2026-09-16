# dsh-plugin-doc-companion

English | [中文](README.zh.md)

A dual-face [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that turns the web GUI into a **document companion**: an in-GUI reader panel for PDF / DOCX / XLSX / CSV / TXT / MD files whose current position stays synchronized with the agent, plus a tool family (`doc_current` / `doc_page` / `doc_goto` / `doc_search` / `doc_open` / `doc_close` / `doc_list`) for page-aware Q&A, in-document lookup, and exercise grading.

| | |
|---|---|
| Host half | document store, `/api/doc` + `/doc-static` HTTP routes, the `doc_*` tools, a system-prompt section |
| Browser half | reader panel on the `shell.overlay` slot, toolbar toggle on `conversation.input.left`, bilingual locale (zh/en) |
| Block model | every format maps onto one 1-based block space — PDF pages, text slices, paragraph groups, row groups |
| Search | full-text scan over extracted block texts; hits carry human locators and context snippets |
| Scanned pages | the panel snapshots textless pages as PNG; the tools transcribe them through the built-in vision model |

## Installation

```sh
dsh plugin --profile web add dsh-plugin-doc-companion
# restart dsh web
```

Or link a local checkout:

```sh
dsh plugin --profile web add ./dsh-plugin-doc-companion
```

## Usage

1. Open the reader panel with the book icon in the composer toolbar (or tell the agent to open a file path with `doc_open`).
2. Upload a document with **打开文档** (PDF / DOCX / XLSX / CSV / TXT / MD).
3. Read normally: the default **continuous-scroll** mode stacks the whole document like a normal reader — smooth scrolling with the block under the viewport centre synced to the host in real time (`doc_current` reflects exactly what you see); the toolbar can switch back to single-page mode. The panel width is adjustable by dragging its left edge and is remembered.
4. Ask anything about the current page, or do exercises — state your approach and the agent judges it against the page content. When the answer lies elsewhere in the document, the agent runs `doc_search` and quotes the original text with its location before explaining.

### Tools

| Tool | Purpose |
|---|---|
| `doc_current` | current document, block number, locator, full block text (transcribes scanned pages) |
| `doc_page({ block })` | read block N without moving the reader |
| `doc_goto({ block })` | jump the reader panel to block N (panel follows via state polling) |
| `doc_search({ query, max_hits? })` | in-document full-text search → ranked hits with locators + snippets |
| `doc_open({ path })` | open a file by path (absolute or relative to the workspace) |
| `doc_close` / `doc_list` | close the current document / list the library |

### Configuration (`cordis.yml` patch on the `doc-companion` row)

| Key | Default | Meaning |
|---|---|---|
| `storageDir` | `$DSH_HOME/ebooks` | storage root (docs, text index sidecars, page snapshots) |
| `maxBytes` | 256 MiB | upload cap |
| `maxImageBytes` | 20 MiB | scanned-page snapshot cap |
| `textBlockChars` | 2600 | characters per TXT/MD block |
| `maxParagraphsPerBlock` | 40 | paragraphs per DOCX block |
| `maxRowsPerBlock` | 50 | rows per XLSX/CSV block |
| `autoTranscribeScanned` | `true` | transcribe scanned pages via the vision model |
| `visionProvider` / `visionModel` | `deepseek-official` / `deepseek-v4-flash-vision-exp` | vision route (same key as the main model) |
| `searchMaxHits` | 5 | default `doc_search` hit cap |

## Model Experience

### Request context and condition

#### What the model sees

One stable system-prompt section (registered with `ctx.systemPrompt.section` as `tool:doc-companion`, order 97), verbatim:

```markdown
本会话由 dsh-plugin-doc-companion 提供「文档伴读」能力。用户在右侧阅读面板中打开文档（PDF / Word / Excel / CSV / TXT / MD）并翻页时，当前块（页/块号）会自动同步：需要知道用户当前看到哪一页及内容 → doc_current；用户问「第 N 页/块」或要读特定位置 → doc_page({block})；用户说「翻到/跳到第 N 页」→ doc_goto({block})（阅读面板同步跳转）；用户给出文件路径想打开 → doc_open({path})；文档列表 → doc_list；关闭 → doc_close。当问题涉及文档内部但超出当前页（例如"这个知识点书里哪页讲了""帮我在文档里找找……"），先用 doc_search({query}) 在文档内检索，再针对命中位置用 doc_page 读取原文。
引用与作答规范：
1. 引用文档内容时必须贴出原文片段并注明位置（如「第 12 页」「工作表「真题」第 10–29 行」「第 45–60 段」），先原文后解释；
2. 用户做练习会先说出自己的做法/答案：先明确判断对错并指出对在哪、错在哪，再给出正确答案与完整步骤，然后给出针对性修改意见，尽量联系原文知识点解释原理；
3. 若当前块是扫描页（text 为空且 image_path 非空），先用 vision 工具读取 image_path 再回答；
4. 检索无结果时如实说明，不要编造原文。
```

Each `doc_*` tool additionally contributes its parameter schema and description to the tool assembly.

#### Token effect

Fixed, conditional: the system-prompt section above is constant (token count has not been measured). `doc_current` / `doc_page` / `doc_search` results are variable — a full page of extracted text can be several K tokens; hit snippets are capped by `searchMaxHits` × ~300 chars. Scanned-page transcription happens once per page and is cached in memory.

#### KV Cache effect

Prefix-stable, independent: the section text is append-only and stable, so it does not invalidate a cached system-prefix; document position is never embedded in the prompt prefix (it is fetched through tools on demand), so page turns do not invalidate cache reuse. Tool results are their own independent model requests after the prefix.

## Known Limitations and Deferred Work

- **Scanned PDFs** — pages without a text layer depend on the vision model (`deepseek-v4-flash-vision-exp`); the host can render a snapshot even when that page was never opened in the panel. Set `autoTranscribeScanned: false` to use local text extraction without automatic model calls.
- **PDF index build time** — `doc_search` on a large PDF extracts every page once (background, cached on disk under `storageDir/text/<id>.json`); the first search may take tens of seconds. Reading individual pages stays fast (single-page extraction on demand).
- **Reading position is isolated per session** — sessions share a document library but keep separate current document/block positions.
- **Plain-text fidelity** — DOCX/TXT/MD blocks render as plain text: rich formatting (headings, tables in Word, images) is not shown; XLSX/CSV render as tables.
- **Text blocks are fixed-size slices** — TXT/MD block boundaries are pure character slices (configurable `textBlockChars`), so a block can split mid-paragraph; PDF pages, DOCX paragraph groups and spreadsheet row groups use natural boundaries.
- **Search is substring matching** — no stemming, fuzzy matching or semantic search; Chinese queries work best as exact terms.
- **Panel layout** — uses the official shell.overlay slot and leaves room beside the conversation. Opening the reader closes the official details column; the official details renderer remains available.
- **Panel visibility is layout state** — open/closed lives in the official layout store (resets on page reload); the current document/block is persisted by the host and survives reloads.

## Development

```sh
npm install --legacy-peer-deps   # peers resolve through the harness install (repository root node_modules)
npm run build                    # typecheck + lib/index.js + lib/client.js + lib/types/*.d.ts
npm test                         # node --test (pure logic, contract, real-file smoke)
node scripts/make-fixtures.mjs   # regenerate synthetic PDF / DOCX / XLSX / Markdown fixtures
```

## License

[MIT](./LICENSE)

## Uninstall and host compatibility

The verified host version is DSH **0.1.5-rc.2**. Host SDKs are declared as peers and remain external; rebuild and test against other versions before upgrading. Use the native plugin command:

```sh
dsh plugin --profile web remove dsh-plugin-doc-companion
```

The official CLI removes the dependency and bundle registration. Restart DSH and refresh the page to finish unloading the browser UI. Plugin data directories remain intact, including documents, images and uploads. Remove any user-authored patch row that separately refers to this plugin.

## Data paths

An empty `storageDir` resolves under the official DSH home as `ebooks`. Explicit relative paths (for example `data/ebooks`) also resolve against `DSH_HOME`; `~/` resolves against the OS user home. Existing absolute overrides are preserved without moving data. The plugin fixes its absolute data root at activation, independently of later working-directory changes. Packaged static assets resolve from their module location; user-provided document/attachment paths retain session workspace semantics.
