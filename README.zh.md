# useful-dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的社区插件集合。**本项目是独立社区项目，与 DeepSeek 官方无隶属关系。**

两个开箱即用的插件互相配合：在聊天输入框上传文件，然后让 agent 直接读取。

## 插件列表

| 包 | 类型 | 功能 |
|---|---|---|
| [`dsh-upload-button`](./dsh-upload-button) | 双面（host + browser） | 输入框工具栏的无边框 📎 按钮。上传的文件以浮在输入框上方的微软经典配色竖版卡片呈现；按原有「发送」键即自动把文件路径附入消息（原生输入机 occurrence 管线，零发送拦截）；消息里的路径渲染为紧凑文件卡片（点击打开文件）。 |
| [`dsh-plugin-doc-reader`](./dsh-plugin-doc-reader) | host | 模型可用的 `read_document` 工具：经由 Harness 文件系统后端（`ctx.fs`）读取文本、PDF、DOCX 和 XLSX 文件，具备与内置 read 工具一致的行窗口分页语义。**仅限文字，不支持识图（OCR）——扫描版 PDF 提取不到文字。** |
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

图形化替代方案：安装 `useful-dsh-plugin-manager`（计划中）后在 Settings → Plugins 里点按钮完成启用/停用、检测与公开版差异、一键更新。

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6（peer 依赖由 Harness 安装提供）
- `dsh-upload-button` 另需 `web` profile 组合（挂载 `ctx.webServer`、`ctx.slots` 与 `ctx.inputTriggers`）

## 开发

```sh
# doc-reader：纯 ESM，无构建步骤
cd dsh-plugin-doc-reader && npm install --legacy-peer-deps && npm test

# upload-button：esbuild 构建两个半边
cd dsh-upload-button && npm install --legacy-peer-deps && npm run build && npm test
```

架构笔记与 UI 机制深挖见 [`docs/`](./docs)——尤其是输入机 occurrence 管线研究（`docs/dsh-web-ui-plugin-research.md`），是任何想在此平台构建"输入框附件类插件"的开发者的参考。

## 许可证

[MIT](./LICENSE)
