# `useful-dsh-plugins`

[中文说明](./README.zh.md)

**One-command installation** of five community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

```sh
dsh plugin --profile web add useful-dsh-plugins
# restart dsh web
```

That single command installs and registers:

| Plugin | What it does |
|---|---|
| [`dsh-upload-button`](https://www.npmjs.com/package/dsh-upload-button) | A borderless 📎 button in the composer toolbar: upload files as floating colored cards, press Send and their paths attach to the outgoing message automatically. |
| [`dsh-plugin-doc-reader`](https://www.npmjs.com/package/dsh-plugin-doc-reader) | The model-facing `read_document` tool for text, PDF, DOCX and XLSX files (**text only — no OCR**). |
| [`dsh-plugin-vision-reader`](https://www.npmjs.com/package/dsh-plugin-vision-reader) | Lets text-only main models read images: routes image content through DeepSeek's built-in multimodal model (`deepseek-v4-flash-vision-exp`) and returns plain text — **no extra API key required**. |
| [`dsh-desktop-config`](https://www.npmjs.com/package/dsh-desktop-config) | Desktop launcher configuration: port, bind host, auto-open — a settings namespace shared with the Electron desktop shell. |
| [`useful-dsh-plugin-manager`](https://www.npmjs.com/package/useful-dsh-plugin-manager) | Settings-page plugin manager: enable/disable, check updates, one-click repair. |

## What this package is

A meta package: it depends on the plugins above and declares one bundle patch that registers all cordis rows. Every plugin ships its own `cordis.patch.yml` too, so installing them individually (e.g. `dsh plugin add dsh-plugin-vision-reader`) keeps working exactly as before.

## Requirements

- DeepSeek Harness `@deepseek-ai/dsh` ≥ 0.1.0-rc.6
- The `web` profile composition (for the UI halves of upload-button and vision-reader)
- The vision plugin requires a DeepSeek account with `deepseek-v4-flash-vision-exp` available (shared `DEEPSEEK_API_KEY`)

## License

[MIT](../LICENSE)
