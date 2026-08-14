# `dsh-plugin-manager`

[中文说明](./README.zh.md)

A DeepSeek Harness dual-face plugin: a visual plugin manager. It adds a **管理 (Manage)** tab to Web Settings → Plugins where every Loader entry is listed and can be fixed or managed with buttons — no command line required.

## What it does

Per plugin row (every entry of the composed Loader tree, via the official `pluginInventory` remote):

| Action | Availability | What happens |
|---|---|---|
| **停用/启用** (disable/enable) | out-of-tree plugins | Writes a marked `disabled: true` entry into the active profile's `cordis.patch.yml` (the official user patch layer). Takes effect on the next `dsh web` restart. |
| **检测更新** (check) | out-of-tree packages | Compares the installed version against the npm registry `latest`. |
| **更新** (update) | out-of-tree packages | Runs `pnpm add <pkg>@latest` in the profile directory (the same path `dsh plugin` uses). Restart to apply. |
| **修复** (repair) | **every** row — including `@deepseek-ai/*` | Downloads the pristine published tarball and replaces the installed package directory. Official packages restore at the installed dsh suite's version (coherence); third-party at their installed version. If files are locked by the running server, it reports "close dsh web, restart, then click again". |
| **恢复全部** (restore all) | — | Removes every manager-written entry at once. |

Harness-provided rows are otherwise read-only — this plugin never modifies the official installation, it only restores files to their published state when you ask.

## Config

| Key | Default | Meaning |
|---|---|---|
| `profileDir` | auto-detected | The profile directory to manage (detected by scanning `$DSH_HOME/profiles` for the profile whose bundles include this plugin or `useful-dsh-plugins`). |
| `maxBodyBytes` | `65536` | Request body cap for the JSON API. |

## Security stance

Same fence as `dsh-upload-button`: loopback `Host` only, same-origin `Origin`/Fetch-Metadata checks, capped JSON bodies, ids and package names validated before use.

## Installation

```sh
dsh plugin --profile web add dsh-plugin-manager
# or with the rest of the family:
dsh plugin --profile web add useful-dsh-plugins
# restart dsh web
```

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- The `web` profile composition; `tar` on PATH (used to extract repair tarballs)

## Known Limitations

- Enable/disable changes require a `dsh web` restart (the Web composition ships with the HMR watcher disabled upstream).
- Repair while the server is running can hit Windows file locks; the button reports this and works after a restart.
- Updating requires `pnpm` on PATH (the same requirement as the official `dsh plugin` command).
- The tab lists raw Loader ids/modules; friendly names come from module specifiers.
