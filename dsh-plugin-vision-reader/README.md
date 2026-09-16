# dsh-plugin-vision-reader

English | [中文](README.zh.md)

A community [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that preserves pasted images locally and keeps the original image available to the main model. It also provides a `vision` tool for a separate image question using the configured multimodal route.

## Installation and removal

Use a release archive from the repository releases, or build this directory and run `npm pack --ignore-scripts`:

```sh
dsh plugin --profile web add ./dsh-plugin-vision-reader-0.2.2.tgz --ignore-scripts
# Restart DSH and refresh the browser.
dsh plugin --profile web remove dsh-plugin-vision-reader
```

Both commands use the official DSH/pnpm dependency and bundle lifecycle. Removing the package leaves saved images intact. Remove user-authored patch overrides for `vision-reader` separately when present.

## Configuration

The `vision-reader` row accepts `provider`, `model`, `instruction`, `inboxDir`. An empty `inboxDir` follows the official DSH home, under `vision-inbox`. An explicitly configured directory remains in place.

The default additional vision route is `deepseek-official / deepseek-v4-flash-vision-exp`. Configure a route that your host and account support. Calls use the existing host provider credentials and can incur that provider's charges; this repository contains no credentials. The primary conversation model must accept image input.

## Model experience and KV cache

Original image content stays in the user message. The plugin adds a saved-file reference for later reads and a vision tool schema. Images and tool results use context according to the host and provider; persistence does not reduce image tokens or guarantee cache reuse.

## Compatibility and limitations

Verified SDK version: **0.1.5-rc.2**. SDK peers remain external and allow compatible upgrades, while `testedDSHVersions` records the actual checked version. Run the build and tests before relying on another host version. Browser contributions use official locale and slot services; restart and refresh remain the supported complete unload boundary.

PNG, JPEG, WebP and GIF are supported, up to 10 images per call. Saving images is best effort: failure to save does not remove the image from the conversation. The default remote vision model may change availability; no future provider availability is implied.

## Development

Install the repository's shared development dependencies, then install this package's development dependencies, run `npm run build` and `npm test`. The build typechecks, emits the host/browser bundles and declarations, and excludes source maps. Tests use synthetic image bytes and fake model responses; they do not call a live model.

## License

[MIT](LICENSE).

## Data paths

An empty `inboxDir` resolves under the official DSH home as `vision-inbox`. Explicit relative paths (for example `data/vision-inbox`) also resolve against `DSH_HOME`; `~/` resolves against the OS user home. Existing absolute overrides are preserved without moving data. The plugin fixes its absolute data root at activation, independently of later working-directory changes. Packaged static assets resolve from their module location; user-provided document/attachment paths retain session workspace semantics.
