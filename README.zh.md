# useful-dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的社区插件集合。**本项目是独立社区项目，与 DeepSeek 官方无隶属关系。**

开箱即用的插件互相配合：在聊天输入框上传文件 → 让 agent 直接读取文档 → 图片由 DeepSeek 内置多模态模型自动识别成文字。

## 插件列表

| 包 | 类型 | 功能 |
|---|---|---|
| [`dsh-upload-button`](./dsh-upload-button) | 双面（host + browser） | 输入框工具栏的无边框 📎 按钮。上传的文件以浮在输入框上方的微软经典配色竖版卡片呈现；按原有「发送」键即自动把文件路径附入消息（原生输入机 occurrence 管线，零发送拦截）；消息里的路径渲染为紧凑文件卡片（点击打开文件）。 |
| [`dsh-plugin-doc-reader`](./dsh-plugin-doc-reader) | host | 模型可用的 `read_document` 工具：经由 Harness 文件系统后端（`ctx.fs`）读取文本、PDF、DOCX 和 XLSX 文件，具备与内置 read 工具一致的行窗口分页语义。**仅限文字，不支持识图（OCR）——扫描版 PDF 提取不到文字。** |
| [`dsh-plugin-doc-companion`](./dsh-plugin-doc-companion) *(本地自用，未发布)* | 双面（host + browser） | **文档伴读**：右侧阅读面板渲染 PDF / DOCX / XLSX / CSV / TXT / MD，翻块自动把当前页码同步给 agent（`doc_current`）；配套 `doc_page` / `doc_goto` / `doc_open` / `doc_search` 等工具，支持就当前页提问、文档内全文检索（命中带位置与片段）、做题判分；扫描页自动经视觉模型转写。 |
| [`dsh-plugin-vision-reader`](./dsh-plugin-vision-reader) *(本地自用，未发布)* | 双面（host + browser） | 图片**原样直通主模型**，不做任何转述；粘贴的图片另存为本地文件、消息里给出路径，同一张图随时可再看。附 `vision` 工具，让 DeepSeek 内置多模态模型（`deepseek-v4-flash-vision-exp`）做独立复核——**无需任何额外 API Key**（与主模型共用 `DEEPSEEK_API_KEY`）。 |
| [`dsh-desktop-config`](./dsh-desktop-launcher) *(本地自用，未发布)* | 双面（host + browser） | 桌面端启动器配置：以 settings 命名空间（`desktop-launcher`）保存端口、绑定地址、自动打开浏览器，Electron 桌面端与 Web 设置页共享一份配置（`$DSH_HOME/settings.yaml`）。 |
| [`useful-dsh-plugin-manager`](./useful-dsh-plugin-manager) | 双面（host + browser） | 可视化插件管理器：Web 设置 → 插件页新增「管理」标签——任意插件行停用/启用、第三方包检测更新与一键更新、**所有行（含官方包）一键修复**（恢复 registry 官方原件）、一键恢复全部。 |

## 安装

一条命令安装全部：

```sh
dsh plugin --profile web add useful-dsh-plugins@latest --config.minimumReleaseAge=0
# 重启 dsh web
```

> `@latest --config.minimumReleaseAge=0` 保证装到最新发布版：pnpm ≥ 11.7 的供应链门禁会跳过"刚发布几分钟"的新版本，刚发布后直接 `add useful-dsh-plugins` 可能解析到旧版；已装旧范围时，不带 `@latest` 的 `add` 会保持旧范围。

也可以分别安装：

```sh
dsh plugin --profile web add dsh-upload-button@latest --config.minimumReleaseAge=0
dsh plugin --profile web add dsh-plugin-doc-reader@latest --config.minimumReleaseAge=0
dsh plugin --profile web add useful-dsh-plugin-manager@latest --config.minimumReleaseAge=0
# 重启 dsh web
```

`dsh-plugin-doc-companion`、`dsh-plugin-vision-reader`、`dsh-desktop-config` 是本地自用插件，**不发布到 npm**，从本仓库安装：

```sh
dsh plugin --profile web add link:<仓库>/dsh-plugin-doc-companion
dsh plugin --profile web add link:<仓库>/dsh-plugin-vision-reader
dsh plugin --profile web add link:<仓库>/dsh-desktop-launcher
```

所有包都声明了自己的 cordis bundle patch（`dsh.bundle`），`dsh plugin` 会自动把它们登记进 `dsh.profile.bundles`。

## 故障恢复手册（插件被改坏 / 启动报错怎么办）

插件本体安装在 `$DSH_HOME/profiles/<name>/node_modules`（Windows 默认 `C:\Users\<你>\.dsh\profiles\web`）。如果**自己修改插件文件导致崩溃**，或与其他插件冲突导致启动失败，按以下顺序处理：

1. **看诊断**：`dsh --profile web --dump-config` 打印组合树，报错行会标明是哪个插件行失败。
2. **卸载**：`dsh plugin --profile web remove useful-dsh-plugins`（或出问题的那个包名）——这会同时清掉 bundles 登记。
3. **重装官方版**：`dsh plugin --profile web add useful-dsh-plugins`，恢复 npm 上的公开版本。
4. **文件也被改坏时强制恢复**：`dsh plugin --profile web add useful-dsh-plugins --force`（从 pnpm 存储重新铺文件，无视本地改动）。
5. **锁历史版本**：`dsh plugin --profile web add useful-dsh-plugins@0.1.0`（换成你要的版本号）。
6. **终极重置**：删除整个 `$DSH_HOME/profiles/web` 目录，下次 `dsh web` 会用官方模板自动重建（会清掉该 profile 下所有插件与自定义配置）。
7. 每次改动后**重启 `dsh web`** 生效。

图形化替代方案：安装 `useful-dsh-plugin-manager` 后在 Settings → Plugins 里点按钮完成启用/停用、检测与公开版差异、一键更新。

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6（peer 依赖由 Harness 安装提供）
- `dsh-upload-button` 另需 `web` profile 组合（挂载 `ctx.webServer`、`ctx.slots` 与 `ctx.inputTriggers`）
- `dsh-plugin-vision-reader` 需要 DeepSeek 官方账号可用 `deepseek-v4-flash-vision-exp`（与主模型共用 `DEEPSEEK_API_KEY`，无额外计费渠道）

## 开发

```sh
# doc-reader：纯 ESM，无构建步骤
cd dsh-plugin-doc-reader && npm install --legacy-peer-deps && npm test

# upload-button / vision-reader / desktop-config：esbuild 构建两个半边
cd dsh-upload-button && npm install --legacy-peer-deps && npm run build && npm test
cd dsh-plugin-vision-reader && npm install --legacy-peer-deps && npm run build && npm test
cd dsh-desktop-launcher && npm install --legacy-peer-deps && npm run build && npm test
```

架构笔记与 UI 机制深挖见 [`docs/`](./docs)——尤其是输入机 occurrence 管线研究（`docs/dsh-web-ui-plugin-research.md`），是任何想在此平台构建"输入框附件类插件"的开发者的参考。

## 许可证

[MIT](./LICENSE)
