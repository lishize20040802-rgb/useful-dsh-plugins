# `useful-dsh-plugins`

[中文说明](./README.zh.md)

**One-command installation** of the two community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

```sh
dsh plugin --profile web add useful-dsh-plugins
# restart dsh web
```

That single command installs and registers:

| Plugin | What it does |
|---|---|
| [`dsh-upload-button`](https://www.npmjs.com/package/dsh-upload-button) | A borderless 📎 button in the composer toolbar: upload files as floating colored cards, press Send and their paths attach to the outgoing message automatically. |
| [`dsh-plugin-doc-reader`](https://www.npmjs.com/package/dsh-plugin-doc-reader) | The model-facing `read_document` tool for text, PDF, DOCX and XLSX files (**text only — no OCR**). |

## What this package is

A meta package: it depends on both plugins and declares one bundle patch that registers both cordis rows. The plugins themselves ship their own `cordis.patch.yml` too, so installing them individually (`dsh plugin add dsh-upload-button`, `dsh plugin add dsh-plugin-doc-reader`) keeps working exactly as before.

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- The `web` profile composition (for the upload button's UI half)

## License

[MIT](../LICENSE)
