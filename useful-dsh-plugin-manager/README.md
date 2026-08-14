# `useful-dsh-plugin-manager`

[中文说明](./README.zh.md)

A DeepSeek Harness dual-face plugin: a visual plugin manager. It adds a **管理 (Manage)** tab to Web Settings → Plugins where every Loader entry is listed and can be checked, updated or fixed with buttons — no command line required.

## What it does

Per plugin row (every entry of the composed Loader tree, via the official `pluginInventory` remote):

| Action | Availability | What happens |
|---|---|---|
| **停用/启用** (disable/enable) | out-of-tree plugins | Writes a marked `disabled: true` entry into the active profile's `cordis.patch.yml` (the official user patch layer). Takes effect on the next `dsh web` restart. |
| **检测更新** (check) | **every** row — out-of-tree **and** `@deepseek-ai/*` | Compares the installed version against the newest version actually published to npm (the packument's latest publish time — not the `latest` dist-tag, which rc-style suites drift from). Official rows read their installed version from the harness installation itself, never from a hoisted peer copy inside a profile. Up-to-date rows show a green ✓. |
| **更新** (update) | out-of-tree packages | Runs `pnpm add <pkg>@latest` in the profile directory (the same path `dsh plugin` uses), passing the profile's recorded pnpm `storeDir` through so non-default stores never abort with `ERR_PNPM_UNEXPECTED_STORE`. Restart to apply. |
| **更新 Harness** (update harness) | official rows, when outdated | Runs `npm install -g @deepseek-ai/dsh@latest` — the official suite updates as a whole so its packages stay version-aligned. Restart to apply. |
| **修复** (repair) | **every** row | Downloads the pristine published tarball and replaces the installed package directory. Official packages restore at the installed dsh suite's version (coherence); third-party at their installed version. If files are locked by the running server, it reports "close dsh web, restart, then click again". |
| **恢复全部** (restore all) | — | Removes every manager-written entry at once. |

Enable/disable stays out-of-tree only — the manager never patches the official installation; official rows get check + repair + (when outdated) update-the-suite instead.

## Config

| Key | Default | Meaning |
|---|---|---|
| `profileDir` | auto-detected | The profile directory to manage (detected by scanning `$DSH_HOME/profiles` for the profile whose bundles include this plugin or `useful-dsh-plugins`). |
| `maxBodyBytes` | `65536` | Request body cap for the JSON API. |

## Security stance

Same fence as `dsh-upload-button`: loopback `Host` only, same-origin `Origin`/Fetch-Metadata checks, capped JSON bodies, ids and package names validated before use.

## Installation

```sh
dsh plugin --profile web add useful-dsh-plugin-manager
# or with the rest of the family:
dsh plugin --profile web add useful-dsh-plugins
# restart dsh web
```

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- The `web` profile composition; `tar` on PATH (used to extract repair tarballs)

## Known Limitations

- Enable/disable and updates require a `dsh web` restart (the Web composition ships with the HMR watcher disabled upstream).
- Repair while the server is running can hit Windows file locks; the button reports this and works after a restart.
- Updating out-of-tree packages requires `pnpm` on PATH (the same requirement as the official `dsh plugin` command); the manager passes `--config.minimumReleaseAge=0` so pnpm's release-age supply-chain gate cannot block fresh releases.
- Updating the harness requires `npm` on PATH (the official global install path).
- The tab lists raw Loader ids/modules; friendly names come from module specifiers.
- Installing the meta package right after a release may need the same age-gate bypass on the install command: `dsh plugin --profile web add useful-dsh-plugins@latest --config.minimumReleaseAge=0`.
