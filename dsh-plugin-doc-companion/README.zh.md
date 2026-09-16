# dsh-plugin-doc-companion

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的双面插件：把 Web GUI 变成**文档伴读**——内置阅读面板支持 PDF / DOCX / XLSX / CSV / TXT / MD，当前阅读位置与 agent 实时同步；配套 `doc_current` / `doc_page` / `doc_goto` / `doc_search` / `doc_open` / `doc_close` / `doc_list` 工具族，实现按页提问、文档内检索、做题判分。

| | |
|---|---|
| Host 半边 | 文档库（store）、`/api/doc` 与 `/doc-static` HTTP 路由、`doc_*` 工具、**host 端 PDF 页面渲染**（pdf.js + @napi-rs/canvas）、系统提示词段落 |
| Browser 半边 | 右侧阅读面板（与聊天区**双栏并列**，聊天列自动收缩）、`conversation.input.left` 的工具栏开关、双语 locale（zh/en） |
| 块模型 | 所有格式统一映射到同一个 1-based 块空间——PDF 页、文本切片、段落组、行组 |
| 阅读策略 | **视觉优先**：PDF 阅读一律由页面快照经视觉模型转写（页面不必被浏览过——host 后台自动渲染任意页）；文字层仅作转写失败兜底 |
| 定位策略 | `doc_search` 用文字检索快速定位（文本层损坏的书会如实告知不可用），命中后视觉阅读 |

## 安装

```sh
dsh plugin --profile web add dsh-plugin-doc-companion
# 重启 dsh web
```

或链接本地 checkout：

```sh
dsh plugin --profile web add ./dsh-plugin-doc-companion
```

## 使用方法

1. 在某个会话中，点 composer 工具栏的书本图标打开右侧阅读面板（或直接让 agent 用 `doc_open` 打开文件路径）。
2. 点「打开文档」上传文件（PDF / DOCX / XLSX / CSV / TXT / MD）。
3. 正常阅读即可：面板与聊天区是**两个平等的分栏**——打开面板后聊天列自动收缩，二者互不遮挡；面板宽度用分栏之间的拖拽手柄调整。默认**连续滚动**模式，整篇文档像普通阅读器一样平滑滚动，视口中心的页/块实时同步给 host（`doc_current` 看到的正是你眼前的内容）；也可在工具栏切回「单页」模式。
4. 随时就当前页提问、或做练习并说出你的做法——agent 会结合当前页内容判断对错。当答案在文档其他地方时，agent 会先 `doc_search` 检索，引用原文并注明位置，再解释。

### 工具

| 工具 | 用途 |
|---|---|
| `doc_current` | 当前文档、块号、位置标签、整块文字（扫描页自动转写） |
| `doc_page({ block })` | 读取第 N 块而不移动阅读面板 |
| `doc_goto({ block })` | 阅读面板跳转到第 N 块（面板通过状态轮询自动跟随） |
| `doc_search({ query, max_hits? })` | 文档内全文检索 → 按相关度排序的命中（位置 + 片段） |
| `doc_open({ path })` | 按路径打开文件（绝对路径或相对工作区路径） |
| `doc_close` / `doc_list` | 关闭当前文档 / 列出文档库 |

### 配置（`cordis.yml` 中 `doc-companion` 行的 patch）

| 键 | 默认值 | 含义 |
|---|---|---|
| `storageDir` | `$DSH_HOME/ebooks` | 存储根目录（文档、文本索引 sidecar、页面截图） |
| `maxBytes` | 256 MiB | 上传大小上限 |
| `maxImageBytes` | 20 MiB | 扫描页截图上限 |
| `textBlockChars` | 2600 | TXT/MD 每块字符数 |
| `maxParagraphsPerBlock` | 40 | DOCX 每块段数 |
| `maxRowsPerBlock` | 50 | XLSX/CSV 每块行数 |
| `autoTranscribeScanned` | `true` | 扫描页是否自动用视觉模型转写 |
| `visionProvider` / `visionModel` | `deepseek-official` / `deepseek-v4-flash-vision-exp` | 视觉路由（与主模型共用 API Key） |
| `searchMaxHits` | 5 | `doc_search` 默认命中上限 |

## 模型体验

### 请求上下文与条件

#### 模型看到什么

一条稳定的系统提示词段落（`ctx.systemPrompt.section` 注册为 `tool:doc-companion`，order 97），原文：

```markdown
本会话由 dsh-plugin-doc-companion 提供「文档伴读」能力。用户在右侧阅读面板中打开文档（PDF / Word / Excel / CSV / TXT / MD）并翻页时，当前块（页/块号）会自动同步：需要知道用户当前看到哪一页及内容 → doc_current；用户问「第 N 页/块」或要读特定位置 → doc_page({block})；用户说「翻到/跳到第 N 页」→ doc_goto({block})（阅读面板同步跳转）；用户给出文件路径想打开 → doc_open({path})；文档列表 → doc_list；关闭 → doc_close。当问题涉及文档内部但超出当前页（例如"这个知识点书里哪页讲了""帮我在文档里找找……"），先用 doc_search({query}) 在文档内检索，再针对命中位置用 doc_page 读取原文。
引用与作答规范：
1. 引用文档内容时必须贴出原文片段并注明位置（如「第 12 页」「工作表「真题」第 10–29 行」「第 45–60 段」），先原文后解释；
2. 用户做练习会先说出自己的做法/答案：先明确判断对错并指出对在哪、错在哪，再给出正确答案与完整步骤，然后给出针对性修改意见，尽量联系原文知识点解释原理；
3. 若当前块是扫描页（text 为空且 image_path 非空），先用 vision 工具读取 image_path 再回答；
4. 检索无结果时如实说明，不要编造原文。
```

每个 `doc_*` 工具另以其参数 schema 与描述参与工具组装。

#### Token 影响

固定 + 条件性：上述提示词段落恒定（长度固定，但未测量 token 数）。`doc_current` / `doc_page` / `doc_search` 的结果长度可变——整页提取文本可达数千 token；检索片段受 `searchMaxHits` × 约 300 字符上限约束。扫描页转写每页至多一次，并缓存在内存中。

#### KV Cache 影响

前缀稳定、独立：段落文本只增不改，不会使缓存的系统前缀失效；阅读位置从不嵌入提示词前缀（按需经工具获取），翻页不会破坏缓存复用。工具结果属于前缀之后的独立模型请求。

## 已知限制与延期工作

- **PDF 视觉转写有成本与延迟**——PDF 阅读一律走视觉模型转写（耗时随模型和文档变化，结果按页缓存于内存，重启后首次访问重新转写）；公式复杂的页面转写可能不完美，必要时可参考 `image_path` 快照。
- **PDF 索引构建耗时**——大 PDF 的 `doc_search` 需要一次性提取全部页面（后台执行，结果缓存于 `storageDir/text/<id>.json`），首次检索可能耗时数十秒；文本层损坏的书 `doc_search` 会如实提示不可用（阅读不受影响）。
- **纯文本保真度**——DOCX/TXT/MD 块以纯文本渲染：富格式（Word 标题、表格、图片）不展示；XLSX/CSV 以表格展示。
- **文本块是定长切片**——TXT/MD 的块边界是纯字符切片（`textBlockChars` 可配），可能从段落中间切开；PDF 页、DOCX 段落组、表格行组使用自然边界。
- **检索是子串匹配**——无词干化、模糊匹配或语义检索；中文检索词建议用精确术语。
- **阅读位置按会话隔离**——host 为每个会话保存独立的"当前文档/块"（文档库共享）；面板跟随当前会话，切换对话自动恢复该对话自己的阅读位置。
- **面板通过让位实现分栏**——面板是 `shell.overlay` 常驻表面：打开时给布局框架右缘留出空间（padding-right），聊天列自动收缩、面板与对话并排阅读，任何会话状态（包括尚未发过消息的新对话）都可直接打开；与官方「详情」列互不干扰（打开面板会自动收起官方详情列，官方详情面板保持原样）。
- **面板状态随 bundle 重置**——面板开/关标记在浏览器 bundle 中（刷新页面即重置）；当前文档/块由 host 按会话持久化，刷新后仍在。

## 开发

```sh
npm install --legacy-peer-deps   # peer 依赖经 harness 安装解析（仓库根目录的开发工具链）
npm run build                    # typecheck + lib/index.js + lib/client.js + lib/types/*.d.ts
npm test                         # node --test（纯逻辑 / 契约 / 真实文件 smoke）
node scripts/make-fixtures.mjs   # 重新生成 test/fixtures/demo.docx
```

## 许可证

[MIT](./LICENSE)

## 卸载与升级兼容性

经核对的宿主版本是 DSH **0.1.5-rc.2**。宿主 SDK 由 peerDependencies 声明并保持 external；其他版本需重新构建、测试。使用官方插件命令安装和卸载：

```sh
dsh plugin --profile web remove dsh-plugin-doc-companion
```

官方 CLI 会移除依赖及 bundle 注册。重启 DSH 并刷新网页后确认界面已卸载。插件自己的数据目录保留；删除软件不自动删除文档、图片或附件。若用户 patch 单独引用该插件行，请同时移除那一行覆盖。

## 数据路径

`storageDir` 留空时固定到官方 DSH home 下的 `ebooks`。显式相对路径（例如 `data/ebooks`）也相对 `DSH_HOME` 解析，`~/` 相对系统用户目录；已有绝对路径保留，不搬动数据。加载插件时确定绝对锚点，之后改变启动工作目录不会改写保存位置。包内静态资源仍通过模块位置解析；文档或附件的用户输入路径继续按会话工作区处理。
