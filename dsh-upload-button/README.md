# `dsh-upload-button`

[中文说明](./README.zh.md)

A DeepSeek Harness dual-face plugin: a borderless file upload button in the web composer toolbar. Pick one or more files and each upload becomes a floating, Microsoft-classic colored card above the composer. **Uploading never touches the input box** — no hidden characters are inserted into the draft, so the cursor and the text stay exactly as the user left them. Press the ordinary Send button and the plugin transparently appends each file's saved path to the outgoing message at the official `session.prompt` facade; the cards clear after the send. ✕ on a card fully detaches the file (pending entry and server-side file).

In chat history the sent message shows **only the user's words**: each attached file appears as the same Microsoft-classic file card floating above the message bubble (click it to open the file). The file path itself is never displayed — but it stays in the message the model receives, so the agent can read the uploaded file.

## How it works

- **Browser half** (`exports["./client"]`, built bundle `lib/client.js`):
  - registers a borderless button in `conversation.input.left`; picking files POSTs them to `/api/upload` and adds each saved path to a **per-session pending list** — the composer draft is never written, so the input box is completely unaffected by uploads;
  - renders one floating card per pending file in `conversation.input.dock` (official QueueDock alignment formula, portrait page badge, two-line clamped name, corner ✕) plus a dismissible error banner;
  - wraps the official `session.prompt` facade once per session (WeakSet-guarded): when pending files exist, their paths are appended to the outgoing content as inline-code tokens before the original prompt call, and the list clears once the send is accepted — a failed send keeps the cards for a retry. The model receives the paths verbatim;
  - shadows the official user-message bubble on the keyed `conversation.chat.node` slot (priority −1 < official 0) with a look-alike renderer: the bubble displays the user's words only, the same Microsoft-classic file cards floating above it, plus the image gallery / `/@` ref chips / time + copy actions. The raw message text (paths included) is what the copy action and the model see — only the display hides it.
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

None directly: this plugin registers no model tool and no prompt section. Its only model-visible effect is user-authored: each uploaded file's path enters the conversation as part of the message the user sends. The path is invisible in the chat UI (the bubble shows the words and a floating file icon), but the model receives it verbatim.

## KV Cache effect

None: upload paths ride the user message text itself, so they are billed as ordinary prompt tokens only. The plugin keeps no hidden model-visible state — no extra context blocks, no prompt-section injection, no per-turn metadata that would grow the KV cache beyond the message the user sent.

## Known Limitations

- The pending list is browser-module state: a page reload clears cards uploaded but not yet sent (the server files stay in `uploadDir`, content-addressed).
- Server files have no garbage collection yet; only the card's ✕ removes them. Removing nothing else (there are no draft tokens anymore — uploads never touch the input box).
- The shadowed user bubble replicates the official bubble's visuals with its own CSS; a future official redesign of the user message layout will not automatically carry over to it.
- Scanned PDFs and other binary formats upload fine, but their content readability depends on a suitable reader plugin (e.g. `dsh-plugin-doc-reader`, which extracts text only — **no image recognition / OCR**).

## Development conventions

The package follows the official harness plugin standards: TypeScript sources with strict typechecking and shipped `lib/types/*.d.ts` declarations, a schemastery `Config` with schema-level defaults, a self-owned locale namespace (`dsh-upload-button`, zh/en complete pairs) registered through `ctx.locale`, the official slot `locale:` seat for component copy, and the esbuild factory envelope for the browser bundle. `npm run build` typechecks first, then bundles both halves and emits declarations.
