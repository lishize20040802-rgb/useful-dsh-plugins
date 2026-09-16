# useful-dsh-plugins

English | [中文](README.zh.md)

A dependency-free installer for five community [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins: local voice input, file uploads, vision reading, document companion and the plugin manager. Requires Node 24 or newer and an existing official DSH installation with pnpm available.

## Install

```sh
npx --yes useful-dsh-plugins@0.5.0 setup --preview
npx --yes useful-dsh-plugins@0.5.0 setup
```

The first command previews without downloading plugins or changing the profile. `npx` itself may download this small installer. The second command verifies all five release archives against their bundled SHA256 manifest before invoking the user's actual official DSH CLI. It ignores DSH peer copies under npx caches.

Files are organized under the official DSH home:

```text
<DSH_HOME>/third-party/
  archives/                 verified versioned npm archives
  packages/<name>/<version>/ extracted built packages for inspection
  data/                     reserved plugin data; existing locations are preserved
  sources/                  reserved for source checkouts
  backups/<timestamp>/      profile manifest, lock and patch snapshots
<DSH_HOME>/profiles/<profile>/node_modules/
                            native DSH/pnpm runtime installation
```

The source code remains available in the repository; this command extracts the built npm packages, not a full Git checkout. Archive references in the profile are relative to the DSH home layout. Package installation, bundle registration and lockfile generation remain native DSH/pnpm operations. This command does not edit user patch configuration or move personal data.

Restart DSH and refresh the browser after installation. Voice engine/model provisioning is documented in the voice plugin's README; this installer does not silently download the large voice model.

## Migration from the old aggregate package

Version 0.5.0 is a CLI with no runtime dependencies and no global `dsh.bundle`. Do not use `dsh plugin add useful-dsh-plugins` as the installation entry point for this release. Run `setup` instead.

After every new archive has been verified and staged, setup saves profile metadata backups. If the old aggregate package is installed, it removes that dependency through native DSH first, then installs the five plugins as direct profile dependencies to avoid duplicate bundle rows. Other dependencies and existing configuration are retained. A native failure can leave partial changes; the error identifies the backup location and does not claim automatic rollback.

## Uninstall

```sh
npx --yes useful-dsh-plugins@0.5.0 uninstall --preview
npx --yes useful-dsh-plugins@0.5.0 uninstall
```

Removal uses the native DSH plugin command. Archives, extracted code, source checkouts, backups and all personal data remain on disk. Restart DSH and refresh the page afterward. If your own patch contains overrides targeting removed plugin rows, remove those overrides separately.

## Options

| Option | Meaning |
|---|---|
| `--preview` | Read-only plan; no plugin downloads or native changes. |
| `--profile NAME` | Native profile, default `web`; `desktop` is reserved. |
| `--dsh-home PATH` | Explicit data home; otherwise `DSH_HOME` or `~/.dsh`. |
| `--dsh-package PATH` | Explicit installed official `@deepseek-ai/dsh` package directory. |
| `--store-dir PATH` | Explicit pnpm store root. |

Store selection uses the explicit flag, then `npm_config_store_dir`, then the existing profile's pnpm metadata. The version suffix from `.modules.yaml` is removed to obtain pnpm's store root. The selected store is forwarded as pnpm's explicit `--store-dir` option, quoted only at DSH's inner Windows shell boundary. Install-only flags are not passed to removal commands.

## Validation and limits

The release downloads only the five named assets from the fixed `v0.5.0` GitHub release. SHA256 and package name/version/bundle checks run before any native installation. Extraction accepts bounded standard npm tar entries and rejects links, traversal and ambiguous paths. A modified existing code copy is preserved by stopping setup rather than overwriting it.

`node --test` runs synthetic archives, fake HTTP responses and a mock native CLI. These tests verify planning, extraction, integrity failures, store selection, migration ordering and uninstall behavior without a live model or large dependency download. They do not prove every pnpm/environment combination. The recorded tested host version is DSH **0.1.5-rc.2**; inspect the preview before upgrading a different host version.

## License

[MIT](LICENSE).
