# useful-dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`). **This is an independent community project, not affiliated with DeepSeek.**

Two drop-in plugins that work together: upload a file in the chat composer, then let the agent read it.

[中文说明](./README.zh.md)

## Packages

| Package | Type | What it does |
|---|---|---|
| [`dsh-upload-button`](./dsh-upload-button) | dual-face (host + browser) | A borderless 📎 button in the composer toolbar. Uploaded files appear as floating, Microsoft-classic colored cards above the input; pressing the ordinary Send button attaches their saved paths to the outgoing message automatically (native input-machine occurrence pipeline — zero send interception); message paths render as compact file cards (click to open). |
| [`dsh-plugin-doc-reader`](./dsh-plugin-doc-reader) | host | The model-facing `read_document` tool: reads text, PDF, DOCX and XLSX files through the harness filesystem backend (`ctx.fs`), with the built-in read tool's line-window semantics. **Text only — no image recognition (OCR); scanned PDFs yield no text.** |
| [`useful-dsh-plugin-manager`](./useful-dsh-plugin-manager) | dual-face (host + browser) | A visual plugin manager: a Manage tab in Web Settings → Plugins — disable/enable any plugin row, check and update out-of-tree packages, **one-click repair of every row (official packages included, restored from the registry tarball)**, and restore-all. |

## Installation

One command installs everything:

```sh
dsh plugin --profile web add useful-dsh-plugins@latest --config.minimumReleaseAge=0
# restart dsh web
```

> `@latest --config.minimumReleaseAge=0` guarantees the newest published release: pnpm ≥ 11.7's supply-chain gate otherwise skips releases that are only minutes old, so a plain `add useful-dsh-plugins` right after a release can resolve an older version. If you already have an older range installed, `add` without `@latest` keeps it.

Or install the plugins individually:

```sh
dsh plugin --profile web add dsh-upload-button@latest --config.minimumReleaseAge=0
dsh plugin --profile web add dsh-plugin-doc-reader@latest --config.minimumReleaseAge=0
dsh plugin --profile web add useful-dsh-plugin-manager@latest --config.minimumReleaseAge=0
# restart dsh web
```

All packages declare their cordis bundle patch (`dsh.bundle`), so `dsh plugin` registers them into `dsh.profile.bundles` automatically.

## Troubleshooting (broken plugins / startup failures)

The plugins live in `$DSH_HOME/profiles/<name>/node_modules` (default `~/.dsh/profiles/web`). If a **locally modified plugin crashes** or a conflict prevents startup, work through these steps:

1. **Diagnose**: `dsh --profile web --dump-config` prints the composed tree; failing rows are marked.
2. **Uninstall**: `dsh plugin --profile web remove useful-dsh-plugins` (or the offending package name) — this also clears its bundle registration.
3. **Reinstall the published version**: `dsh plugin --profile web add useful-dsh-plugins` restores the npm release.
4. **Force-restore corrupted files**: `dsh plugin --profile web add useful-dsh-plugins --force` (re-links files from the pnpm store, ignoring local edits).
5. **Pin an older version**: `dsh plugin --profile web add useful-dsh-plugins@0.1.0`.
6. **Nuclear reset**: delete `$DSH_HOME/profiles/web` entirely; the next `dsh web` rebuilds the default template (clears all plugins and custom config for that profile).
7. **Restart `dsh web`** after every change.

A graphical alternative (enable/disable, version check, one-click update in Settings → Plugins) is planned as `useful-dsh-plugin-manager`.

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6 (peer dependencies are provided by the harness installation)
- `dsh-upload-button` additionally needs the `web` profile composition (it mounts `ctx.webServer`, `ctx.slots` and `ctx.inputTriggers`)

## Development

```sh
# doc-reader: plain ESM, no build step
cd dsh-plugin-doc-reader && npm install --legacy-peer-deps && npm test

# upload-button: esbuild bundles both halves
cd dsh-upload-button && npm install --legacy-peer-deps && npm run build && npm test
```

Architecture notes and the UI-mechanism deep dive live in [`docs/`](./docs) (currently in Chinese) — notably the input-machine occurrence pipeline research (`docs/dsh-web-ui-plugin-research.md`), which is the reference for anyone building composer-attachment plugins on this platform.

## License

[MIT](./LICENSE)
