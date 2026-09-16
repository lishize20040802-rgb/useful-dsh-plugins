# useful-dsh-plugins

[English](README.md) | 中文

零运行依赖的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件安装器，安装本地语音、附件上传、视觉读图、文档伴读和插件管理器。要求 Node 24 或更高版本，并已有官方 DSH 与可用的 pnpm。

## 安装

```sh
npx --yes useful-dsh-plugins@0.5.1 setup --preview
npx --yes useful-dsh-plugins@0.5.1 setup
```

第一条只预览，不下载插件或修改 profile；npx 本身可能下载这个小安装器。第二条会先按内置 SHA256 清单验证全部五个发布包，再调用用户实际安装的官方 DSH CLI。不会把 npx 缓存中的 DSH peer 副本当作全局安装。

目录位于官方 DSH home 内：

```text
<DSH_HOME>/third-party/
  archives/                  已验证的版本化 npm 发布包
  packages/<name>/<version>/  解压后的构建包，便于检查
  data/                      插件数据预留目录；已有位置保留
  sources/                   源码 checkout 预留目录
  backups/<时间戳>/          profile manifest、锁文件和 patch 快照
<DSH_HOME>/profiles/<profile>/node_modules/
                             官方 DSH/pnpm 管理的运行安装
```

完整源码在 Git 仓库；此命令解压已构建 npm 包，不自动克隆完整仓库。profile 中的发布包依赖保存为相对 DSH home 布局的路径。运行安装、bundle 注册和锁文件仍由官方 DSH/pnpm 管理。安装器不修改用户 patch 配置，也不搬动个人数据。

安装后重启 DSH 并刷新网页。语音引擎/模型的准备方式见语音插件 README；此安装器不会暗中下载较大的语音模型。

Windows 上替换或卸载包前先关闭 DSH，释放原生依赖文件。原生安装完成后，安装器逐字节核对实际 `lib/**` 与 `cordis.patch.yml` 是否等于已验证的发布包。同版本旧缓存或缺失文件会被报告为失败，即使包名和版本一致；错误中提供原生卸载重装提示及备份位置。

## 从旧聚合包迁移

0.5.1 改为没有运行依赖、没有全局 `dsh.bundle` 的 CLI。本版不要以 `dsh plugin add useful-dsh-plugins` 为安装入口，应运行 `setup`。

全部新发布包都验证并暂存后，安装器备份 profile 元数据。若原来的 useful 聚合包仍已安装，先通过官方 DSH 移除该依赖，再把五个插件直接安装到 profile，避免重复 bundle 行。其他依赖和已有配置保留。原生命令失败可能留下部分更改；错误会指出备份位置，不声称已自动回滚。

## 卸载

```sh
npx --yes useful-dsh-plugins@0.5.1 uninstall --preview
npx --yes useful-dsh-plugins@0.5.1 uninstall
```

卸载调用官方插件命令。发布包、解压代码、源码 checkout、备份和全部个人数据都保留。完成后重启 DSH、刷新网页。若用户自己在 patch 中覆盖了已移除插件的行，需要另行移除那些覆盖。

## 参数

| 参数 | 含义 |
|---|---|
| `--preview` | 只读预览，不下载插件、不运行安装命令。 |
| `--profile NAME` | 官方 profile，默认 `web`；`desktop` 为保留名称。 |
| `--dsh-home PATH` | 显式数据根，否则读取 `DSH_HOME` 或使用 `~/.dsh`。 |
| `--dsh-package PATH` | 实际安装的官方 `@deepseek-ai/dsh` 包目录。 |
| `--store-dir PATH` | 显式指定 pnpm store 根目录。 |

store 优先使用显式参数，其次 `npm_config_store_dir`，最后读取已有 profile 的 pnpm 元数据，并去掉 `.modules.yaml` 中 store 路径末尾的版本目录。选定目录通过 pnpm 的显式 `--store-dir` 选项传递，仅在 DSH 内层 Windows shell 边界添加正确引号。卸载命令不传递仅适用于安装的选项。

## 验证范围

只下载固定 GitHub `v0.5.1` Release 下的五个命名文件。在任何原生安装前，完成摘要、包名、版本和 bundle 文件核对。解压限制大小，仅接受标准 npm tar 的普通文件和目录；拒绝链接、路径穿越和含糊路径。若已有解压代码被修改，安装器停止并保留修改，不直接覆盖。

`node --test` 使用合成归档、模拟 HTTP 和原生 CLI 替身，验证预览、解压、摘要错误、store 选择、迁移顺序与卸载；不调用真实模型，也不下载大型依赖。这些测试不代表所有 pnpm/机器组合均已通过。实际核对的宿主版本是 DSH **0.1.5-rc.2**；升级不同版本前请查看预览。

## 许可

[MIT](LICENSE)。
