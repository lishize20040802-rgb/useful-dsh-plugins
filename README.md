# useful-dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`). **This is an independent community project, not affiliated with DeepSeek.**

Two drop-in plugins that work together: upload a file in the chat composer, then let the agent read it.

[中文说明](./README.zh.md)

## Packages

| Package | Type | What it does |
|---|---|---|
| [`dsh-upload-button`](./dsh-upload-button) | dual-face (host + browser) | A borderless 📎 button in the composer toolbar. Uploaded files appear as floating, Microsoft-classic colored cards above the input; pressing the ordinary Send button attaches their saved paths to the outgoing message automatically (native input-machine occurrence pipeline — zero send interception). |
| [`dsh-plugin-doc-reader`](./dsh-plugin-doc-reader) | host | The model-facing `read_document` tool: reads text, PDF, DOCX and XLSX files through the harness filesystem backend (`ctx.fs`), with the built-in read tool's line-window semantics. |

## Installation

```sh
dsh plugin --profile web add dsh-upload-button
dsh plugin --profile web add dsh-plugin-doc-reader
# restart dsh web
```

Both packages declare their cordis bundle patch (`dsh.bundle`), so `dsh plugin` registers them into `dsh.profile.bundles` automatically.

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
