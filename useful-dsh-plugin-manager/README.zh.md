# `useful-dsh-plugin-manager`

一个 DeepSeek Harness 双面插件：**可视化插件管理器**。它在 Web 设置 → 插件页新增一个「管理」标签页，把组合树里的**每个插件条目**列出来，用按钮完成停用、启用、检测、更新、修复——全程不用命令行，小白也能自救。

## 功能

针对每个插件行（来自官方 `pluginInventory` 远程接口的完整 Loader 树）：

| 操作 | 适用 | 行为 |
|---|---|---|
| **停用/启用** | 第三方插件 | 向活动 profile 的 `cordis.patch.yml`（官方用户覆盖层）写入带标记的 `disabled: true` 条目；**下次重启 dsh web 生效**。 |
| **检测更新** | 第三方包 | 对比本地已装版本与 npm registry `latest`。 |
| **更新** | 第三方包 | 在 profile 目录执行 `pnpm add <包>@latest`（与官方 `dsh plugin` 同一条路径），重启生效。 |
| **修复** | **所有行**（含 `@deepseek-ai/*` 官方包） | 从 registry 下载官方发布的原始 tarball，解包替换被改坏的插件目录。官方包恢复为「与已装 dsh 套件同版本」的原件（保持套件一致），第三方包恢复为「已装版本」的原件。若文件被运行中的服务锁定，会明确提示「关闭 dsh web 重启后再点一次修复」。 |
| **恢复全部** | — | 一键删除本管理器写入的所有条目。 |

Harness 自带的行除此之外只读展示——本插件**不修改官方安装**，只在你要求时把官方文件恢复成发布原样。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `profileDir` | 自动探测 | 要管理的 profile 目录（扫描 `$DSH_HOME/profiles`，找 bundles 里含本插件或 `useful-dsh-plugins` 的那个）。 |
| `maxBodyBytes` | `65536` | JSON API 请求体上限。 |

## 安全围栏

与 `dsh-upload-button` 同一标准：仅 loopback `Host`、同源 `Origin`/Fetch-Metadata 校验、请求体限长、id 与包名使用前校验。

## 安装

```sh
dsh plugin --profile web add useful-dsh-plugin-manager
# 或随全家桶一键安装：
dsh plugin --profile web add useful-dsh-plugins
# 重启 dsh web
```

## 环境要求

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- `web` profile 组合；PATH 上有 `tar`（解包修复用）

## 已知局限

- 启用/停用需重启 `dsh web` 生效（Web 组合上游关闭了 HMR 热更新）。
- 服务运行期间修复可能撞上 Windows 文件锁；按钮会提示，重启后再点一次即可。
- 更新依赖 PATH 上有 `pnpm`（与官方 `dsh plugin` 的要求一致）；管理器会附带 `--config.minimumReleaseAge=0`，让 pnpm 的"最小发布年龄"供应链门禁无法拦下刚发布的新版本。
- 列表显示的是 Loader 原始 id/模块名，友好名称直接取自模块说明符。
- 刚发布后立即安装元包可能同样遇到该门禁，安装命令建议带参数：`dsh plugin --profile web add useful-dsh-plugins@latest --config.minimumReleaseAge=0`。
