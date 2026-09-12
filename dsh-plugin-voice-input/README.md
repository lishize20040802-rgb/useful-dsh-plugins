# dsh-plugin-voice-input

Hold-to-talk voice input for the DeepSeek Harness composer, transcribed by
Volcengine **Doubao 流式语音识别** (大模型流式语音识别, `bigmodel_nostream`
mode) — the same recognition family behind the Doubao app.

Press and hold the mic button in the composer tool row — or hold **Alt**, then
**`` ` `` + `1`** anywhere in the app — speak a sentence, and release; the
transcript lands in the draft for you to review before sending. The draft is
never sent automatically, the mouse stays free to scroll while you talk, and
`` ` `` / `1` keep typing normally whenever Alt is not held.

## What it does

- **Browser half** — a push-to-talk mic button (`conversation.input.left`,
  after the upload button) plus a document-level hold-to-talk hotkey. Records
  mono 16 kHz PCM, encodes a WAV blob client-side, POSTs it to the host's
  `/api/asr` route, and appends the transcript to the draft via the official
  `inputActions.setDraft` facade.
- **Node half** — registers `/api/asr` on the host webserver (same
  loopback/same-origin trust fence as the official upload route), streams the
  clip through the openspeech binary WebSocket protocol (gzip-compressed full
  request → audio frames with sequence numbers → negative packet), and maps
  errors into friendly messages.

## Install

1. Make sure you have a Volcengine Speech console account with **流式语音识别**
   (大模型) activated — the resource id `volc.bigasr.sauc.duration` (1.0 小时版).
2. Add the plugin to the web profile. For a local checkout, edit
   `~/.dsh/profiles/web/package.json`:

   ```json
   "dependencies": {
     "dsh-plugin-voice-input": "link:D:/harness/dsh-plugin-voice-input"
   },
   "dsh": { "profile": { "bundles": [ ..., "dsh-plugin-voice-input" ] } }
   ```

   then run `pnpm install` inside the profile and restart the app.

## Configure

Put the credentials (API ID + Access Token from the Speech console service
page) in the profile patch layer — they stay in local config, never in code:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: voice-input
  config:
    appId: '<your API ID>'
    accessToken: '<your Access Token>'
```

Alternatively set `VOLC_APP_ID` / `VOLC_ACCESS_TOKEN` environment variables.
The patch layer also accepts `resourceId` (default
`volc.bigasr.sauc.duration`), `wsUrl`, `language` (default `zh`), `maxBytes`
(default 64 MB), `timeoutMs` (default 120 s), and `maxSeconds` — the client
recording safety-net in seconds, default 600 (10 min), `0` = unlimited. The
Doubao streaming ASR upstream has no documented duration limit; `maxSeconds`
only prevents a forgotten hold from recording forever.

`hotkey` sets the hold-to-talk gesture: an OS modifier arms the chord —
`Modifier+Key…` (`AltLeft+Backquote+Digit1`, the default: hold **Alt**, then
`` ` `` and `1`). The trigger keys type normally whenever the modifier is not
held, so no key is ever disabled. A plain key/chord (`F8`, `Backquote+Digit1`)
also works, treating the first key as a never-typing modifier.
`''`/`'none'`/`'off'` disable the hotkey (the mic button still works).
`Alt`/`Ctrl`/`Shift`/`Win` spellings map to their left-hand codes. Leak
defenses: keydown + beforeinput interception plus a temporary `readOnly`
hard-lock on the focused editor while armed — required because IMEs like
Microsoft Pinyin commit characters (`` ` `` → "·") through the OS text
framework, bypassing page-level key events.

## Security notes

- The credentials are read server-side only and never echoed to the browser.
- The route only accepts loopback, same-origin requests and enforces a byte
  cap; audio never touches the draft, and transcripts are sent nowhere else.
- Treat the credentials like passwords: if they ever appear in a chat log or
  a screenshot, rotate the Access Token in the console and update the patch
  file.

## Development

```bash
npm install
npm run build     # tsc typecheck + esbuild (node + browser bundles)
npm test          # node --test against the built node half
```

Live check against the real endpoint (needs env credentials + a WAV clip):

```bash
VOLC_APP_ID=... VOLC_ACCESS_TOKEN=... node scripts/live.mjs test/sample-zh.wav
```

## License

MIT
