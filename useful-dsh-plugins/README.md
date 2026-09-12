# `useful-dsh-plugins`

[中文说明](./README.zh.md)

**One-command installation** of three community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

```sh
dsh plugin --profile web add useful-dsh-plugins
# restart dsh web
```

That single command installs and registers:

| Plugin | What it does |
|---|---|
| [`dsh-upload-button`](https://www.npmjs.com/package/dsh-upload-button) | A borderless 📎 button in the composer toolbar: upload files as floating colored cards, press Send and their paths attach to the outgoing message automatically. |
| [`dsh-plugin-doc-reader`](https://www.npmjs.com/package/dsh-plugin-doc-reader) | The model-facing `read_document` tool for text, PDF, DOCX and XLSX files (**text only — no OCR**). |
| [`useful-dsh-plugin-manager`](https://www.npmjs.com/package/useful-dsh-plugin-manager) | Settings-page plugin manager: enable/disable, check updates, one-click repair. |

## What this package is

A meta package: it depends on the plugins above and declares one bundle patch that registers all cordis rows. Every plugin ships its own `cordis.patch.yml` too, so installing them individually (e.g. `dsh plugin add dsh-plugin-doc-reader`) keeps working exactly as before.

`dsh-plugin-vision-reader` and `dsh-desktop-config` live in the same repository but are **not published and not part of this bundle** — they are local-use plugins, installed with `dsh plugin --profile web add link:<repo>/<dir>`.

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.5-rc.2
- The `web` profile composition (for the UI halves)

## License

[MIT](../LICENSE)
