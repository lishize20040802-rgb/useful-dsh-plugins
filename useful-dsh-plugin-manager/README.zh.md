# Useful DSH 插件管理器

[English](README.md)

0.3.0 在 DeepSeek Harness Web 设置中增加“管理”页，管理第三方 profile 插件，并提供独立的 DSH 整体更新入口。测试版本为 DSH `0.1.5-rc.2`；后续版本需要继续提供相同的公开 Loader、profile patch、WebServer 与设置槽位接口。

## 安装和卸载

统一安装器将本套插件放入 DSH 数据目录，再通过原生 DSH CLI 注册：

```sh
npx useful-dsh-plugins@0.5.0 setup
```

安装选项和发布包见[仓库说明](../README.zh.md)。也可单独安装管理器压缩包：

```sh
dsh plugin --profile web add ./useful-dsh-plugin-manager-0.3.0.tgz
# 首次安装后重启 DSH，加载插件和浏览器页签。
dsh plugin --profile web remove useful-dsh-plugin-manager
```

如果希望卸载管理器时重新启用它曾停用的第三方插件，先点击“恢复管理器停用项”。卸载不会删除无关配置或插件数据。已经消失、改名或属于受保护插件的旧标记需人工检查，“恢复”不会擅自修改这些条目。

## 管理范围与启停

- 每次操作重新读取当前 Loader 行和已安装的 profile 包信息。官方 `@deepseek-ai/*` 包、伪装成别名的官方包、歧义行 ID 和管理器自身均受保护。直接调用 HTTP 也无法绕过限制。
- 允许管理 profile 的直接第三方依赖，以及已安装、声明 `dsh.bundle` 的聚合包依赖树中的第三方插件。最多遍历 8 层、256 个包；不会把任意提升到 node_modules 的依赖都当作可管理插件。
- 行启停限于管理器所在的当前 profile 配置树。普通分组受支持；独立 `Include` 文件中的条目不显示为可操作，因为当前 profile 的 patch 无法定位那些条目。如果宿主无法确认当前配置树，插件操作将不可用。
- 启停只在 profile 的 `cordis.patch.yml` 写入带管理器标记的条目，同时断言行 ID 和模块名称。启用意味着移除管理器自己的停用条目，不覆盖用户或父层配置中的停用。“恢复”仅移除仍属于允许范围的完整管理条目。
- 正确解析 YAML/JSON 数组，保留注释和官方 `!!js` 标量表达式的语义；格式可能规范化。无效 YAML、重复键、被用户扩展的标记块及符号链接 patch 不会被覆盖。管理器不执行配置表达式。
- 同一 profile 的写入串行执行，使用独占锁、唯一临时文件和原子替换；写回前检查是否被外部修改。其他工具应尊重 `.plugin-manager.lock`，普通文本编辑器不参与该锁。崩溃残留的锁需要核对后再手动删除。

当 Web profile 设置 `dsh.profile.patchReload: live`，且官方 HMR 服务存在时，由 DSH 已有监听器应用改动。管理器只有观察到 Loader 的启用状态和 Fiber 生命周期状态都符合预期，才显示已经立即生效；否则提示需要重启。插件依赖缺失、启动时额外覆盖层、第三方插件清理不完整都可能阻止热启停。安装或替换包代码后需要重启 DSH 并刷新浏览器，不保证任意第三方插件都能热加载。

## 插件更新与修复

registry 更新采用 npm 的 `latest` 标签，不把已安装的新版本降级。更新调用当前官方 CLI：`dsh plugin --profile <名称> add <包名>@<精确版本>`；同版本重装追加 `--force`。管理器不手工删除包目录，不逐个覆盖官方模块。pnpm store 从 YAML 或 JSON 格式的 `.modules.yaml` 正确解析，通过显式 `--store-dir` 参数传递，并正确引用 Windows 空格路径；Windows store 路径中有双引号、百分号或感叹号时，在启动 CLI 前拒绝操作。不关闭原包管理器的新版本等待策略。

本地压缩包、file/link/workspace、Git 来源会保留原来源。本套插件继续使用相同的 `setup` 命令更新。传递依赖插件需更新或重装页面显示的聚合包所有者，不会被提升为直接依赖。CLI 失败可能已经部分改动 profile，需检查 package 与 bundle 状态再重试；CLI 成功后还会核对实际安装版本。

## 独立的 DSH 本体更新

点击“检查 DSH 更新”查看当前版本、最新版本及安装方式是否受支持。该入口只更新经核实的普通 npm global 安装；源码目录、npm link 或其他方式的安装继续使用原更新方法。

页面展示精确目标版本，并要求勾选确认。修改固定官方包 `@deepseek-ai/dsh` 前，会将旧版本发布包与恢复记录保存到 `$DSH_HOME/third-party/data/plugin-manager/host-updates`。完成后核对安装版本；普通安装失败会尝试回退并验证，安装进程中断时保留恢复信息。不会自动终止正在运行的 DSH 或当前对话；由用户随后重启生效。普通插件行没有逐个修复官方包的入口。

## 路径与配置

统一路径以官方 `DSH_HOME` 为基准，不依赖当前终端目录，也不把第三方数据放进 DSH 本体的 node_modules：

```text
$DSH_HOME/
  profiles/<名称>/cordis.patch.yml
  third-party/packages/
  third-party/archives/
  third-party/data/voice-input/
```

管理页显示这些相对位置，不会迁移已有用户数据。默认跟随当前根 Loader 的 profile；确有需要可设置相对 `DSH_HOME` 的 `profileDir: profiles/web`，原来的绝对路径覆盖仍兼容。`maxBodyBytes` 默认 65536，上限为 1 MiB。原生 CLI 包操作要求使用具名 profile。

HTTP 仅接受 loopback 回环连接、回环 Host 以及同源 Origin/Fetch-Metadata。写请求要求 JSON，并限制大小。此功能面向本机 WebUI，不支持通过远程反向代理管理。

## 开发验证

```sh
npm install
npm run build
npm test
npm pack
```

浏览器包遵守官方 `window.__ModuleLoader__` 工厂格式，并将 React 保持为外部依赖。样式和语言注册随插件释放。正常声明 `yaml`、`semver` 运行依赖，不打包私人配置、模型、录音、日志或机器路径。测试覆盖管理权限、聚合包归属、并发写入、patch 保留、重载状态观测、CLI 失败与本体更新恢复；这些测试不代表验证了真实麦克风质量或所有第三方插件的生命周期行为。

插件源码采用 MIT；依赖保留各自许可证。
