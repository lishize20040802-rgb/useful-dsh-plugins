# useful-dsh-plugins

[English](README.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区插件集合，与 DeepSeek 官方无隶属关系。需要 Node.js 24 或更新版本；本地已验证环境为 **Windows、DSH 0.1.5-rc.2 和 Node.js 24.18**。DSH 仍在开发预览阶段，升级本体后需要重新核对兼容性。

| 插件 | 功能 |
| --- | --- |
| [语音输入](dsh-plugin-voice-input/README.zh.md) | 按住录音，使用本机 SenseVoiceSmall 识别；浏览器支持时关闭音频处理。 |
| [上传按钮](dsh-upload-button/README.zh.md) | 通过 DSH 输入与文件服务添加附件。 |
| [图像读取](dsh-plugin-vision-reader/README.zh.md) | 图片输入和调用已配置模型服务的 vision 工具。 |
| [文档伴侣](dsh-plugin-doc-companion/README.zh.md) | 文档展示、提取和搜索。 |
| [插件管理器](useful-dsh-plugin-manager/README.zh.md) | 管理当前 profile 中的第三方插件，不管理官方本体插件。 |

[Rigor 4](https://github.com/lishize20040802-rgb/dsh-rigor-4) 使用独立仓库和安装卸载流程。

## 安装与卸载

已安装 DSH 和 pnpm 后，执行一条命令：

```sh
npx --yes useful-dsh-plugins@0.5.0 setup
```

同一份安装器也可直接从公开的 GitHub Release 获取：

```sh
npx --yes --package=https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/v0.5.0/useful-dsh-plugins-0.5.0.tgz useful-dsh-plugins setup
```

可先使用 `setup --preview` 查看计划。安装器校验发布包摘要，将压缩包和解压后的插件统一收录到 **`<DSH_HOME>/third-party/`**，备份 profile 清单，再调用官方 DSH CLI 注册五个插件。DSH 仍在 `profiles/<profile>/node_modules` 内进行原生依赖解析，不修改本体安装。再次运行对应版本命令可修复或更新整套插件；已有自定义数据路径会保留。

```text
<DSH_HOME>/
  third-party/
    archives/        下载并校验的插件安装包
    packages/        按版本保存的解压插件
    sources/         可选的开发源码
    data/            语音引擎、模型和管理器恢复记录
    backups/         本地安装恢复记录
  profiles/web/     DSH 原生插件注册与运行依赖
```

整套卸载：`npx --yes useful-dsh-plugins@0.5.0 uninstall`，保留个人数据。支持 `--profile`、`--dsh-home`、`--dsh-package`、`--store-dir`。迁移时移除旧聚合包注册，避免重复加载；新的 npm 包是无依赖安装器。

单独安装时，将安装包放入相同第三方目录，再执行下面的原生命令。

从 [Releases](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases) 下载插件 `.tgz` 安装包，使用官方命令安装：

```sh
dsh plugin --profile web add ./dsh-plugin-voice-input-0.3.0.tgz
dsh web
```

卸载：

```sh
dsh plugin --profile web remove dsh-plugin-voice-input
```

其他插件替换对应包名即可。DSH 根据包中的 `dsh.bundle` 自动注册和移除插件。安装、更新、删除包文件后重启 DSH；临时启用/停用是另一种操作，其即时生效条件见管理器说明。

Windows 可在仓库目录执行 `./install.ps1 -Preview` 查看全部五个插件的操作，执行 `./install.ps1` 安装，或 `./install.ps1 -Uninstall` 卸载。支持 `-Profile <名称>`、`-StoreDir <现有pnpm缓存>`，内部调用同一套官方命令。卸载代码保留文档、附件、配置和已下载模型。

npm 安装器与 GitHub 安装包使用相同的内部目录布局，Windows 包装脚本也调用同一安装器。

## 本地语音模型

[模型发布页](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/tag/voice-model-sensevoice-2024-07-17) 包含 **SenseVoiceSmall INT8 ONNX** 权重（239,233,841 字节）、词表、上游模型许可和 SHA256 校验值。插件首次准备环境时下载，之后在本机识别。模型目录独立于 DSH 安装目录，升级本体不会删除模型。[来源和许可说明](models/README.md)。

自动安装推理引擎目前支持 Windows x64；其他平台需提供兼容的 sherpa-onnx 程序和路径，尚未验证。

新安装默认使用 `<DSH_HOME>/third-party/data/voice-input`；兼容已有旧模型目录及显式绝对路径。插件配置中的相对路径以 DSH 数据目录为基准，不随终端启动位置变化；插件自带资源相对于插件自身目录定位。

## 开发和升级 DSH

标准 npm 全局安装的 DSH 可以在 **设置 → 插件 → 管理 → DSH 本体更新** 中直接更新。管理器检查官方版本、保存旧版宿主安装包，在界面确认后执行更新；完成后重启 DSH。普通第三方插件操作仍排除所有官方模块。支持的安装方式及恢复范围见[管理器说明](useful-dsh-plugin-manager/README.zh.md)。

先安装仓库根目录开发依赖，再在各插件目录执行 `npm install --legacy-peer-deps` 安装开发依赖。根目录执行 `npm run build`、`npm test`、`npm run check:release`，最后执行 `npm run pack:plugins`。安装包输出到 `artifacts/`，包含构建后的 JavaScript。DSH SDK 由宿主运行时提供，不复制进插件。文档测试样本从固定内容生成，仓库不包含个人文件或录音。

本地开发可通过 `dsh plugin --profile web add link:./dsh-upload-button` 链接已构建的插件；修改源码后重新构建。即使 profile patch 支持实时重载，包代码、浏览器 bundle 和宿主升级仍可能需要重启 DSH 并刷新网页。

升级前在本地备份 profile 清单和插件安装包，在独立 profile 验证新宿主，运行插件检查。只有取得验证证据后才更新开发 SDK 版本与 `testedDSHVersions`。插件使用公开包导出和 profile bundle，不修改官方安装源码。详见[兼容性与生命周期](docs/compatibility.md)。

## 隐私与许可证

插件代码使用 [MIT](LICENSE)；模型权重和下载的推理引擎遵守各自上游许可。语音识别在本机完成；图片处理会使用用户配置的模型服务，发送的图片或文档内容受相应服务的数据处理规则约束。不要提交个人配置、凭证、会话、附件、录音。发布检查仅输出可疑文件位置，不打印秘密内容；它需要配合代码复核，不能证明不存在任何形式的秘密。
