# Changelog

本文件记录 useful-dsh-plugins 仓库内各插件包的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [未发布]

### dsh-plugin-manager（新增）

- 首个公开版本：Web 设置 → 插件页的「管理」标签——任意插件行启用/停用（官方用户 patch 层，重启生效）、第三方包检测更新与一键更新、**所有行（含官方包）一键修复**（registry 原始 tarball 恢复，官方包按已装 dsh 套件版本保持一致）、一键恢复全部。

### dsh-upload-button 0.2.0

- **健壮性**：路由冲突不再导致宿主崩溃；input-trigger 源冲突自动降级为草稿文本附件模式；slot 冲突仅影响对应 UI 座位。
- **对话内文件卡片**：消息里的上传路径渲染为紧凑文件卡片（官方 `chatFileMentions` 机制，文件名 + 点击打开），agent 仍收到路径原文。

### dsh-plugin-doc-reader 0.1.2

- **健壮性**：`read_document` 工具名冲突不再导致宿主崩溃。

### useful-dsh-plugins 0.2.0

- 纳入 `dsh-plugin-manager`，一键安装全家桶。

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
