# useful-dsh-plugins

[中文](README.zh.md)

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Independent project; not affiliated with DeepSeek. Requires Node.js 24 or newer; locally tested with **DSH 0.1.5-rc.2 and Node.js 24.18 on Windows**. DSH is a developer preview: a new host version needs compatibility checks.

| Plugin | Purpose |
| --- | --- |
| [Voice input](dsh-plugin-voice-input/README.md) | Hold to record; local SenseVoiceSmall recognition. Browser audio processing is disabled when supported. |
| [Upload button](dsh-upload-button/README.md) | Composer attachments through DSH's input and file services. |
| [Vision reader](dsh-plugin-vision-reader/README.md) | Image input and a vision tool using the configured model provider. |
| [Document companion](dsh-plugin-doc-companion/README.md) | Document display, extraction, and search. |
| [Plugin manager](useful-dsh-plugin-manager/README.md) | Manage third-party profile plugins; official host plugins are outside its scope. |

[Rigor 4](https://github.com/lishize20040802-rgb/dsh-rigor-4) has its own repository and installation lifecycle.

## Install and remove

With DSH and pnpm already installed, one command installs the collection:

```sh
npx --yes useful-dsh-plugins@0.5.0 setup
```

The same installer is also available directly from the public GitHub release:

```sh
npx --yes --package=https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/download/v0.5.0/useful-dsh-plugins-0.5.0.tgz useful-dsh-plugins setup
```

Use `setup --preview` to inspect the plan first. The installer verifies release checksums, stores archives and extracted packages inside **`<DSH_HOME>/third-party/`**, backs up the profile manifest, and calls the official DSH CLI to register the five packages. DSH keeps its native runtime resolution under `profiles/<profile>/node_modules`; the installer does not patch the host installation. Re-run the versioned command to repair or update this collection. Existing custom data paths are preserved.

```text
<DSH_HOME>/
  third-party/
    archives/        downloaded and verified plugin packages
    packages/        extracted versioned packages
    sources/         optional development checkouts
    data/            voice runtime and plugin-manager recovery records
    backups/         local installation recovery records
  profiles/web/     native DSH plugin registrations and runtime dependencies
```

Remove the collection with `npx --yes useful-dsh-plugins@0.5.0 uninstall`. Personal data is retained. Optional `--profile`, `--dsh-home`, `--dsh-package`, and `--store-dir` support custom installations. The older aggregate package is removed during migration to avoid duplicate bundle rows; the new npm package is a zero-dependency installer.

For individual advanced installation, put the archive inside the same third-party archive directory and use the native CLI below.

Download the built `.tgz` for a plugin from [Releases](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases). Install it using the official CLI:

```sh
dsh plugin --profile web add ./dsh-plugin-voice-input-0.3.0.tgz
dsh web
```

To remove it:

```sh
dsh plugin --profile web remove dsh-plugin-voice-input
```

Repeat with the package name in the table. DSH registers and removes each package's `dsh.bundle` automatically. Restart after installing, updating, or removing package files. Disabling a loaded plugin is a separate operation; see the manager's documented live-reload conditions.

On Windows, this checkout also provides `./install.ps1 -Preview`, `./install.ps1`, and `./install.ps1 -Uninstall` for all five plugins. Optional `-Profile <name>` and `-StoreDir <existing-pnpm-store>` use the same native CLI. Uninstalling code preserves documents, attachments, settings, and downloaded models.

The npm installer and GitHub assets use the same internal directory layout. The Windows wrapper runs the same installer.

## Local speech model

The [model release](https://github.com/lishize20040802-rgb/useful-dsh-plugins/releases/tag/voice-model-sensevoice-2024-07-17) includes the **SenseVoiceSmall INT8 ONNX** weights (239,233,841 bytes), tokens, original model license, and SHA256 values. The voice plugin downloads them on first setup and recognizes audio locally thereafter. Its runtime is independent of the DSH installation, so updating DSH does not delete the model. See [model provenance](models/README.md).

Automatic engine provisioning currently targets Windows x64. Other platforms require compatible sherpa-onnx binaries and explicit paths; they are not claimed to be tested.

New installations use `<DSH_HOME>/third-party/data/voice-input`; an existing legacy runtime and explicitly configured absolute paths remain supported. Relative plugin configuration paths resolve against DSH's data home, not the terminal's current directory. Package assets resolve relative to their own package.

## Development and host upgrades

To update a standard npm-global DSH installation from the WebUI, open **Settings → Plugins → Manage → DSH host update**. The manager checks the official version, saves the previous host archive, and runs the update after the displayed confirmation. Restart DSH afterwards. Official modules remain excluded from ordinary third-party plugin operations. See the [manager guide](useful-dsh-plugin-manager/README.md) for supported installations and recovery limits.

Install root development dependencies, then each plugin's development dependencies with `npm install --legacy-peer-deps`. Run `npm run build`, `npm test`, `npm run check:release`, then `npm run pack:plugins`. Archives appear in `artifacts/` and include built JavaScript. The SDK is provided by DSH at runtime, not copied into plugin bundles. Synthetic document fixtures are generated from source; personal files and recordings are excluded.

For local development, `dsh plugin --profile web add link:./dsh-upload-button` links a built package. Rebuild after source changes. Package updates, browser bundles, and host upgrades may require restarting DSH and refreshing the page even when profile patch reload is live.

Before a host upgrade, keep a local copy of the profile manifests and plugin archives, verify the new host in a separate profile, and run the plugin checks against that version. Update the pinned development SDK and `testedDSHVersions` only with test evidence. Plugins use public package exports and profile bundles; there are no patches to DSH's installed source. See [compatibility and lifecycle](docs/compatibility.md).

## Privacy and licenses

Plugin code is [MIT](LICENSE). Model weights and downloaded inference binaries retain their upstream licenses. Speech recognition runs locally. Vision requests use the configured provider; document or image content sent to a model follows that provider's data handling. No personal settings, credentials, conversations, uploads, or recordings belong in this repository. The release checker reports suspicious paths and tokens without printing their contents; it complements code review and cannot prove that every possible secret is absent.
