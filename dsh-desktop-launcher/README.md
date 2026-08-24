# dsh-desktop-config

管理 DeepSeek Harness **桌面端**（Electron 封装版）的启动配置：端口、绑定地址、自动打开浏览器。配置以 settings 命名空间（`desktop-launcher`）形式保存于 `$DSH_HOME/settings.yaml`，**Electron 桌面端启动时直接读取同一文件**，与 Web 设置页共享一份配置来源。

Owns the desktop app's launch configuration (port, bind host, auto-open) as a settings namespace saved in `$DSH_HOME/settings.yaml`. The Electron shell reads the same document at startup, sharing one source of truth with the web settings page.

## 功能 / Features

- 注册 `desktop-launcher` settings 命名空间（live applies：设置页修改即时生效）。
- 桌面端（Electron）启动时从 `settings.yaml` 的 `desktop-launcher` 节读取端口，无需任何额外通信。
- 桌面端未启动时，本插件依然是无害的配置持有者——不引入服务行为，保持最小维护面。

- Registers the `desktop-launcher` settings namespace with live applies.
- The Electron shell reads the `desktop-launcher` section from `settings.yaml` at startup — no extra wiring.
- When the desktop app is not running, the plugin stays a harmless configuration owner — no server behavior, minimal maintenance surface.

## 安装 / Install

```bash
dsh plugin --profile web add dsh-desktop-config
# 重启 dsh 生效 / restart dsh to apply
```

## 配置 / Configuration

```yaml
desktop-launcher:
  host: 127.0.0.1   # 绑定地址（仅回环）
  port: 3080        # 监听端口
  autoOpen: false   # 从命令行启动时是否自动打开浏览器
```

## 已知限制 / Known Limitations

- 桌面端读取的是 `settings.yaml` 的 **YAML 节**（正则提取），不是通过本插件运行时查询——因此桌面端可在 dsh 首次启动前工作。
- 端口冲突时桌面端会回退到默认 3080（或显示错误）。

- The desktop shell parses the `settings.yaml` section directly (not a runtime query), so it works even before dsh first boots.
- On port conflict the shell falls back to the default 3080 or surfaces the error.

## License

MIT
