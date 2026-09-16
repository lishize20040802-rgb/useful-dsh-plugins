# Useful DSH Plugin Manager

[简体中文](README.zh.md)

Version 0.3.1 adds a **Manage** tab to DeepSeek Harness Web Settings. It manages third-party profile plugins and provides a separate whole-DSH update section. Tested against DSH `0.1.5-rc.2`; later versions require the same public Loader, profile patch, WebServer and settings-slot contracts.

## Install and remove

The shared installer keeps this suite under the DSH data home and registers each package with the native DSH CLI:

```sh
npx useful-dsh-plugins@0.5.1 setup
```

See the [suite README](../README.md) for installer options and release archives. For a standalone archive:

```sh
dsh plugin --profile web add ./useful-dsh-plugin-manager-0.3.1.tgz
# Restart DSH once to load the new package and browser tab.
dsh plugin --profile web remove useful-dsh-plugin-manager
```

Before removing the manager, use **Restore manager disables** if you want to re-enable the third-party rows it disabled. Removal does not erase unrelated configuration or plugin data. Existing marks for absent, renamed or protected rows require manual review; restore does not silently change them.

## What the manager changes

- It reads the current Loader rows and installed profile manifests on every operation. Official `@deepseek-ai/*` packages, aliases of those packages, ambiguous row IDs and the manager itself are protected. Direct HTTP requests have the same restrictions as the UI.
- Third-party packages must be direct profile dependencies or reachable through the installed dependency tree of a declared `dsh.bundle`. Traversal is bounded to 8 levels and 256 package visits. Unrelated hoisted dependencies are not a management source.
- Row toggles are limited to the manager's current profile configuration tree. Ordinary groups are supported; rows inside separate `Include` files are excluded because this profile's patch cannot address them. If the host cannot identify the current tree, plugin operations are unavailable.
- Enable/disable writes only marked entries into the profile's `cordis.patch.yml`, with both row ID and module-name assertions. Enable removes the manager's own disable, without forcing an enable over a user or parent-layer disable. Restore removes only exact managed entries that still belong to allowed third-party rows.
- YAML/JSON arrays, comments and official `!!js` scalar tags are preserved semantically. Formatting can be normalized. Invalid YAML, duplicate keys, edited marker blocks and patch-file links are not overwritten. No expressions are evaluated by the manager.
- Writes are serialized per profile, use an exclusive lock and a unique temporary file, and check for an external edit before atomic replacement. Other tools should honor `.plugin-manager.lock`; arbitrary editors do not participate in that lock. A stale lock after a crash must be reviewed before manual removal.

For Web profiles with `dsh.profile.patchReload: live` and the official HMR service, the host's existing watcher applies the file change. The manager reports immediate success only after it observes the expected enabled state and Fiber lifecycle state in the Loader. Otherwise it reports that a restart is required. Dependency failures, different launcher overlays and third-party plugins without correct disposal can prevent a live transition. Installing or replacing package code requires a restart and browser reload; arbitrary third-party hot loading is not guaranteed.

## Package updates and repair

Registry updates use the registry's `latest` tag and never downgrade a newer installed version. The operation calls the active official CLI as `dsh plugin --profile <name> add <package>@<exact-version>`; same-version repair adds `--force`. It does not manually delete package directories or overwrite individual official modules. pnpm's recorded store is parsed from YAML or JSON `.modules.yaml` and passed explicitly with `--store-dir`, including safe quoting for Windows paths containing spaces. Windows store paths containing quotes, percent or exclamation marks are rejected before starting the CLI. Upstream package-manager age policies remain enabled.

Local archives, file/link/workspace installs and Git sources retain their source. Update this suite with the same `setup` command. For a transitive plugin, update/reinstall its displayed bundle owner; the manager never promotes it into a direct dependency. A failed CLI operation may already have partly changed the profile, so inspect its package and bundle state before retrying. A successful CLI exit is followed by installed-version verification.

## Separate DSH host update

**Check DSH update** shows the current and latest versions and whether the installation is supported. Only a verified standard npm global DSH installation can be updated here. Source checkouts, npm links and other installation methods keep their original update mechanism.

The UI requires selecting the displayed exact version and checking the confirmation box. Before changing the fixed official `@deepseek-ai/dsh` package, it saves the previous release archive and a recovery record under `$DSH_HOME/third-party/data/plugin-manager/host-updates`. The updater verifies the installed version, attempts verified rollback on ordinary installation failures, and preserves recovery information when an installer is interrupted. It does not terminate the running DSH process or active conversation. Restart afterwards to use the new release. Ordinary plugin rows cannot invoke per-module official repairs.

## Paths and configuration

All shared locations are anchored to the official `DSH_HOME`, never to the current shell directory or DSH's installation `node_modules`:

```text
$DSH_HOME/
  profiles/<name>/cordis.patch.yml
  third-party/packages/
  third-party/archives/
  third-party/data/voice-input/
```

The local tab shows these relative locations. It does not relocate existing user data. By default the manager uses the active root Loader profile. If needed, configure `profileDir: profiles/web` relative to `DSH_HOME`; existing absolute overrides remain supported. `maxBodyBytes` defaults to 65536 (maximum accepted configuration: 1 MiB). Named profiles are required for native CLI package operations.

The API accepts only loopback socket connections with a loopback Host and same-origin Origin/Fetch-Metadata. Writes require JSON and are size-limited. It is intended for a local WebUI; remote/reverse-proxy administration is not supported.

## Development

```sh
npm install
npm run build
npm test
npm pack
```

The browser bundle uses the official `window.__ModuleLoader__` factory and keeps React external. Styles and locale registrations are disposed with the plugin. Runtime dependencies (`yaml`, `semver`) are declared normally; no private configuration, models, recordings, logs or machine paths belong in this package. Tests cover authorization, bundle ownership, concurrent writes, patch preservation, reload observation, CLI failure handling and host-update recovery. Live microphone quality and arbitrary third-party lifecycle behavior are outside these tests.

MIT license for this plugin's source; dependencies retain their own licenses.
