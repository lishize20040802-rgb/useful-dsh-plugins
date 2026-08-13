# DeepSeek Harness 插件开发指南（本工作区实测版）

> 版本：v1（2026-08）· 覆盖本机实际安装的 `@deepseek-ai/dsh@0.1.0-rc.6`。
> 所有结论均经实测验证；配套研究文档：`docs/dsh-web-ui-plugin-research.md`（UI 机制深挖，待并入）。
> 目标：后续所有插件（含开源发布版）按本文标准开发。

## 0. 核心概念速览

DSH 的一切功能都是 **cordis 插件**。三层组合机制：

```
dsh.profile.bundles（有序 bundle 列表）
  └─ 每个 bundle = npm 包，manifest 声明 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
       └─ cordis.patch.yml 是 patch 层：insert 插件行 / override 配置 / disable 行
          └─ 插件行 = { id, name（模块说明符）, config, inject?, disabled? }
```

- **bundle**：安装粒度。in-box bundle（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`）从 dsh 安装目录解析；out-of-tree 插件从 profile 自己的 `node_modules` 解析。
- **插件行（row）**：被 cordis Loader 挂载的单元，导出 `name / inject / Config / apply` 契约。
- **patch 语义**：按 id 整行替换 `config`（不合并）；同一 id 后写的赢。
- 同一行可以有多个 bundle 层 + 用户 profile 层；`$DSH_HOME/profiles/<name>/cordis.patch.yml` 是用户自己的覆盖层。

## 1. 本机运行环境事实（重要）

| 项目 | 值 |
|---|---|
| 运行命令 | `dsh web`（等价 `--profile web`） |
| 当前实例来源 | 全局 npm 安装：`C:\Users\13987\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`（其依赖嵌套在 `dsh\node_modules\` 下） |
| DSH_HOME | `C:\Users\13987\.dsh` |
| web profile | `C:\Users\13987\.dsh\profiles\web`（package.json + cordis.patch.yml + pnpm-workspace.yaml） |
| 扁平回退目录 | `$DSH_HOME/profiles/node_modules`（`healProfilesModuleFallback` 自动维护：安装内每个依赖一个 junction，让 profile 里插件能通过 Node 父目录查找解析 `@deepseek-ai/*`） |
| 插件工作区 | `D:\harness\`（全部在 D 盘，不写 C 盘） |
| 本地工具 | `D:\harness\tools\pnpm`（npm --prefix 安装，PATH 前置使用）；pnpm store → `D:\harness\tools\pnpm-store` |
| 本机 D 盘 | 曾被收紧 ACL（根目录 Authenticated Users 只有读）。修复：`icacls D:\ /grant "*S-1-5-11:(OI)(CI)M"`（管理员） |

## 2. Host 插件（模型可用工具）开发规范

### 2.1 插件契约

```js
// lib/index.js —— 完整范本见 D:\harness\dsh-plugin-doc-reader
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FsError } from '@deepseek-ai/dsh-fs'

export const name = 'tool-doc-reader'            // 必须与 cordis.patch.yml 行 id 一致
export const inject = ['tools', 'fs', 'systemPrompt']  // 依赖的 cordis 服务
export const Config = z.object({ readLimit: z.number().default(2000) /* ... */ })
export function apply(ctx, config) { /* 注册工具 */ }
```

### 2.2 工具注册要点（`ctx.tools.register(defineTool({...}))`）

- `parameters`：JSON-schema 风格（`type/required/description/enum`），snake_case 字段名（与官方一致）
- `output.schema`：成功返回值的 schema；`output.render(args, value)` 输出模型可见文本（官方用 OpenCode 风格 envelope：`<path>…</path>\n<type>…</type>\n<content>…</content>`）
- `execute(args, exec)`：异步执行器。文件工具必须走 `ctx.fs`（继承会话工作区/沙箱/观察策略）：
  - `ctx.fs.resolve(path, { cwd: exec.agent?.session.header.cwd, signal: exec.signal })`
  - `ctx.fs.stat(target, signal)` → undefined = 不存在 → `throw new FsError('cannot read "...": not found', 'FS_NOT_FOUND')`
  - `ctx.fs.readText / streamText / readBytes(target, signal, byteCap)`
  - 成功后 `ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)`
- `ctx.systemPrompt.section({ name, order, text })`：注册工具使用指南（模型 system prompt 段落）
- `isConcurrencySafe: () => true`（只读工具）
- `presentCall(args)`：UI 呈现卡片
- 参数校验：schema 层先行（`ToolArgsError: invalid arguments: ...`），execute 内做剩余校验（正整数、路径非空等）

### 2.3 错误语义

- 文件不存在 → `FsError` code `FS_NOT_FOUND`；目录 → `FS_NOT_REGULAR_FILE`
- 参数非法 → 抛普通 Error（`ToolRuntime` 会归一化为 `Error: <message>`）

## 3. Client 插件（Web UI）开发规范

（精要已并入 `docs/dsh-web-ui-plugin-research.md`（含 D 节：输入机 occurrence 管线）。骨架：）

- manifest：`"dsh": { "client": { "inject": [...], "platform": "web" } }` + `exports["./client"]` 指向构建产物 `lib/client.js`
- node 半边（`dsh-client-modules`）扫描树中 dsh.client 包，组合 `window.__DSH_BOOT__`，伺服 `/plugins/<id>/client.js`
- browser 半边是模块表（lazy CJS factory：`window.__ModuleLoader__.load({id, factory})`）
- 构建：官方用 tsdown（`scripts.bundle`/`watch`）；本机可用 esbuild 单包构建（实测可行：banner/footer 包工厂信封，10 个平台 seed 词 external）
- 热重载：SSE `/plugins/events`，需要 dev watcher 重写 bundle；生产环境 = 构建 + 刷新页面（bundle 内容变更只刷页面即可，host 行变更才需重启）
- **附件类 UI 首选 occurrence 管线**：芯片直接进草稿、按发送自动序列化、发送后自动消失（详见研究文档 D 节）

## 4. 安装流程（实测）

```powershell
# 前置：PATH 里要有 pnpm（本机用本地安装）
$env:PATH = "D:\harness\tools\pnpm\node_modules\.bin;$env:PATH"

# 官方流程：dsh plugin 转发给 pnpm（cwd = profile 目录），
# 成功后自动核对 dsh.profile.bundles（依赖声明了 dsh.bundle 就自动追加）
dsh plugin --profile web add "D:/harness/dsh-plugin-doc-reader"

# 验证
dsh --profile web --dump-config            # 组合树里应出现插件行
# 重启 dsh web 生效；会话持久化，重启后原 URL 继续对话
```

- 本机"不写 C 盘"妥协：依赖全部预装在插件自己的 `node_modules`（D 盘），manifest 里对 profile 可见部分用 peerDependencies 声明，profile 的 pnpm（`autoInstallPeers: false`）不复制依赖到 C 盘。**开源发布版不需要此妥协**，应正常使用 dependencies。
- D 盘插件依赖 `@deepseek-ai/*` 的解析：`D:\harness\node_modules\@deepseek-ai\{cordis,schemastery,dsh-tools,dsh-fs}` → junction 指向全局安装的嵌套 `dsh\node_modules\@deepseek-ai\`。

## 5. 测试规范

- 纯逻辑（解析/窗口/渲染）与插件契约分离：纯函数放独立模块（如 `lib/doc-read.js`），用 `node --test` 测试
- 插件契约测试：构造 fake ctx（`tools.register` 捕获、`fs` stub、`emit/inject/get` 空实现），断言注册的工具名/schema/执行结果
- 命令：`node --test`（**不要** `node --test test\`，末尾反斜杠会被当模块路径）
- 静态检查：`node --check lib\*.js`

## 6. 开源发布标准（目标态）

1. TypeScript 源码 + `lib/` 编译产物 + `.d.ts`（发布形态与官方包一致）
2. 依赖声明：`@deepseek-ai/*` 放 peerDependencies（精确版本范围）；第三方库放 dependencies
3. `Config` 全部走 schemastery schema；**禁止硬编码本机路径**（上传目录、大小上限、扩展名白名单全部可配置）
4. README 采用 DSH 家居结构：English | 中文 双语、Model Experience、KV Cache effect、Known Limitations
5. 错误码与文案风格对齐官方（FsError codes、envelope 格式）
6. 单元测试覆盖契约行为；smoke 用真实文件验证

## 7. 已知陷阱

- `pdf-parse` 根入口在 ESM 下会等 stdin → 必须 `import 'pdf-parse/lib/pdf-parse.js'`
- 手工构造 PDF 的 xref 表易被 pdf.js 拒绝 → 冒烟 fixture 用库自带的真实 PDF（`node_modules/pdf-parse/test/data/04-valid.pdf`）
- PowerShell 里 `icacls D:\ /grant *S-1-5-11:(OI)(CI)M` 的括号参数必须整体加引号
- pnpm 并发下载易被网络策略杀连接（UND_ERR_DESTROYED）→ npm 更稳；pnpm 可降 `--network-concurrency`
- 修改 D:\harness\node_modules junction：先 Remove-Item 再重建（junction 不可原地改目标）

## 8. 本工作区布局

```
D:\harness\
├── docs\                          开发指南与研究报告（本文档所在）
├── tools\{pnpm,npm-cache,pnpm-store,pnpm-home}\
├── node_modules\@deepseek-ai\     junction × 4（指向全局安装）
└── dsh-plugin-doc-reader\         第一个插件（host 工具插件，已上线）
    ├── package.json / cordis.patch.yml / .npmrc
    ├── lib\{index.js, doc-read.js}
    ├── scripts\make-fixtures.mjs
    └── test\{doc-read,mock-ctx}.test.mjs + fixtures\
```
