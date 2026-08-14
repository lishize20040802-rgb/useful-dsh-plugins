# Changelog

本文件记录 useful-dsh-plugins 仓库内各插件包的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.2] - 2026-08-14

### useful-dsh-plugin-manager 0.2.0

- **官方自带插件同样参与检测**：`check-all` 现在覆盖全部 `@deepseek-ai/*` 官方行——已装版本从 harness 自身安装读取（不误用 profile 里的提升副本），最新版按 packument 的最晚发布时间判定（rc 系列的 `latest` dist-tag 会漂移，按 dist-tag 会把已装新版误判为过期）。与最新一致显示绿色对勾 ✓。
- **官方行过期可一键更新**：新增「更新 Harness」按钮 → `npm install -g @deepseek-ai/dsh@latest`（套件整体更新，保持版本对齐），重启生效。
- **修复**：`check-all`/`restore` 客户端此前用 GET 调用 POST-only 路由，导致「全部检测」404、逐行「更新」按钮永不出现；`pluginInventory.list()` 新返回形状（`{entries:[{entryId,moduleName,…}]}`）未适配导致「管理」标签页空白；均已修复，并同时兼容新旧形状。
- **健壮性**：更新透传 profile 的 pnpm `storeDir`（非默认 store 不再报 `ERR_PNPM_UNEXPECTED_STORE`）；官方行模块名去重。

### useful-dsh-plugins 0.2.1

- 修复依赖：0.2.0 误引用了 npm 上**他人同名包** `dsh-plugin-manager`（该名字早已被社区占用）；我们的管理器正式更名为 **`useful-dsh-plugin-manager`**。0.2.0 已弃用（deprecated）。

### useful-dsh-plugin-manager 0.1.1

- 更新失败时返回 pnpm 的 stderr，便于诊断。
- 「更新」强制 `--config.minimumReleaseAge=0`：绕过 pnpm ≥ 11.7 的"最小发布年龄"供应链门禁，保证真正更新到最新发布版。

## [0.2.0] - 2026-08-14

### useful-dsh-plugin-manager 0.1.0（新增）

- 首个公开版本：Web 设置 → 插件页的「管理」标签——任意插件行启用/停用（官方用户 patch 层，重启生效）、第三方包检测更新与一键更新、**所有行（含官方包）一键修复**（registry 原始 tarball 恢复，官方包按已装 dsh 套件版本保持一致）、一键恢复全部。

### dsh-upload-button 0.2.0

- **健壮性**：路由冲突不再导致宿主崩溃；input-trigger 源冲突自动降级为草稿文本附件模式；slot 冲突仅影响对应 UI 座位。
- **对话内文件卡片**：消息里的上传路径渲染为紧凑文件卡片（官方 `chatFileMentions` 机制，文件名 + 点击打开），agent 仍收到路径原文。

### dsh-plugin-doc-reader 0.1.2

- **健壮性**：`read_document` 工具名冲突不再导致宿主崩溃。

### useful-dsh-plugins 0.2.0

- 纳入 `useful-dsh-plugin-manager`，一键安装全家桶。

## [0.1.1] - 2026-08-13

### 两个插件

- peer 依赖版本范围从 `*` 规范化为与官方一致的精确范围（`^0.1.0-rc.6` / `^3.18.1`）。
- 包内携带 LICENSE、README.md、README.zh.md。

### useful-dsh-plugins（新增）

- 元包发布：`dsh plugin --profile web add useful-dsh-plugins` 一键安装两个插件。

## [0.1.0] - 2026-08-13

### dsh-upload-button

- 首个公开版本：无边框上传按钮、上方浮动彩色文件卡片（微软经典配色）、occurrence 原生管线自动附带、错误横幅（可关闭）、内容寻址去重、DELETE 清理、信任围栏与字节上限。

### dsh-plugin-doc-reader

- 首个公开版本：`read_document` 工具（文本 / PDF / DOCX / XLSX），行窗口分页语义，字节与行数上限。
