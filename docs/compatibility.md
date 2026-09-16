# Compatibility and lifecycle / 兼容性与生命周期

The tested baseline is DSH **0.1.5-rc.2**. Official references: [CLI](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/cli), [plugin development](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/user/develop). Current upstream documentation may describe a later API; check the installed package reference before changing an adapter.

已验证基线为 DSH **0.1.5-rc.2**。上游文档可能比安装版本更新，改动适配代码时以实际宿主公开接口为准。

| Change / 操作 | Expected lifecycle / 生效方式 |
| --- | --- |
| Enable/disable a third-party row / 启停第三方插件 | Official profile patch; live only when the host profile supports live patch reload and the plugin releases resources correctly. / 官方 profile patch；仅在宿主支持实时重载、插件正确释放资源时即时生效。 |
| Install/update/remove package / 安装更新卸载包 | Official `dsh plugin`; restart host after package changes. / 官方 CLI；修改包文件后重启宿主。 |
| Rebuild browser code / 重建前端 | Rebuild, then refresh browser; restart if the host does not watch rebuilt artifacts. / 构建并刷新网页；宿主未监听构建产物时需重启。 |
| Upgrade DSH / 升级本体 | Keep data/profile, verify SDK contracts in an isolated profile, then restart. / 保留数据与 profile，先在隔离 profile 核对 SDK，再重启。 |

Routes, timers, event subscriptions, DOM additions and workers must be owned by the Cordis effect/disposal lifecycle. A manager cannot safely turn a third-party plugin that leaks resources into a hot-loadable plugin. Official core plugins and the manager's own transport are not third-party toggle targets.

路由、定时器、事件订阅、DOM 与工作进程必须接入 Cordis 的释放生命周期。管理器不能让不释放资源的第三方插件自动具备可靠热加载能力。官方核心插件与管理器自身通信基础不属于第三方启停目标。

Do not infer that a green unit test proves a new DSH version works. Validate package resolution, bundle composition, a real host start, frontend load, one representative operation, and disable/re-enable behavior. Keep SDK imports external. Keep model/cache/user-data directories outside the installation. A failed install may have changed a manifest even if the launcher exits nonzero: inspect the manifest and bundle list before retrying.

单元测试通过不等于新版 DSH 已兼容；还应核对包解析、bundle 组合、真实启动、前端加载、代表性操作和停用/重启用。SDK 导入保持 external，模型/缓存/用户数据保存在安装目录之外。安装命令失败也可能已经改变清单，重试前须核对依赖和 bundle 注册。
