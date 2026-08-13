# `dsh-upload-button`

[中文说明](./README.zh.md)

A DeepSeek Harness dual-face plugin: a borderless file upload button in the web composer toolbar. Pick one or more files and each upload becomes a floating, Microsoft-classic colored card above the composer. Press the ordinary Send button and the input machine's occurrence pipeline attaches each file's saved path to the outgoing message automatically; the cards disappear as the draft commits. ✕ on a card fully detaches the file (draft token, card, and server-side file).

## How it works

- **Browser half** (`exports["./client"]`, built bundle `lib/client.js`):
  - registers one **input-trigger source** (`dsh-upload-button`, codec: ref → path) so the official submit pipeline serializes each occurrence token to its upload path — zero send interception;
  - registers a borderless button in `conversation.input.left`; picking files POSTs them to `/api/upload` and inserts one occurrence token per file at the end of the draft via the official scoped `slash/input-insert-reference` event (draftRev CAS, applied-truth verified);
  - renders one floating card per token in `conversation.input.dock` (official QueueDock alignment formula, portrait page badge, two-line clamped name, corner ✕) plus a dismissible error banner.
- **Node half** (`exports["."]`): registers a `/api/upload` route on the host webserver — `POST` saves the body to `uploadDir` (content-addressed; identical re-uploads deduplicate) and answers `{ path, name, bytes }`; `DELETE ?path=<file>` removes an uploaded file (the path must resolve inside `uploadDir`).

## Config

| Key | Default | Meaning |
|---|---|---|
| `maxBytes` | `67108864` | Byte cap for one upload (Content-Length pre-check + streamed count). |
| `uploadDir` | `process.cwd()/uploads` | Directory files are saved to (content-addressed as `<sha256-prefix>-<name>`). Point it at a directory visible to the agent's workspace when the default is not. |
| `allowedExtensions` | unset (any) | Optional lowercase extension whitelist, e.g. `["pdf","docx","xlsx","md"]`. |

## Security stance

The webserver performs no auth of its own; this route implements its own fence: loopback `Host` only, same-origin `Origin` and Fetch-Metadata checks, `POST`/`DELETE` only, the byte cap above, filename sanitization (no separators, traversal, or control characters), the optional extension whitelist, and for `DELETE` the requirement that the resolved path stays inside `uploadDir`.

## Installation

```sh
dsh plugin --profile web add dsh-upload-button
# restart dsh web; the bundle enters window.__DSH_BOOT__ automatically
```

## Build

```sh
npm run build   # esbuild: lib/index.js (node half) + lib/client.js (browser half)
npm test
```

## Model Experience

None directly: this plugin registers no model tool and no prompt section. Its only model-visible effect is user-authored: each uploaded file's path enters the conversation as part of the message the user sends.

## Known Limitations

- UI labels are hardcoded Chinese; a proper `locale` namespace (the official `t()` kit) is the intended follow-up.
- The reference source registers under the `@` trigger with zero candidates; the `@` menu should never list it, but that relies on empty-group hiding upstream.
- Removing a token via Backspace leaves the file in `uploadDir` (content-addressed, no garbage collection yet); the card's ✕ cleans up all three.
- Scanned PDFs and other binary formats upload fine but their content readability depends on a suitable reader plugin (e.g. `dsh-plugin-doc-reader`; OCR is out of scope).
