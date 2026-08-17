// dsh-upload-button — browser half (entry).
//
// Attachment flow with zero draft involvement, split across two official
// slots:
//
// - `conversation.input.left` (order 0): a borderless toolbar button that
//   uploads files and queues them in the plugin's per-session pending list.
//   The composer draft is NEVER touched — no occurrence tokens, no invisible
//   characters, no cursor impact; the input box stays exactly as the user
//   left it.
// - `conversation.input.dock` (order 5): the display surface — one
//   Microsoft-classic colored file card per pending file (red PDF, blue Word,
//   green Excel, ...) floating above the composer card, with ✕ removal.
//
// Pressing the ordinary Send button routes the message through the official
// `session.prompt` facade, where a transparent wrapper appends the pending
// paths (inline-code tokens) to the outgoing content and clears the list —
// the model receives the paths verbatim, exactly as before.
//
// Message display: the chat bubble never shows the paths. A shadow renderer
// registered on the `conversation.chat.node` keyed slot (priority -1, below
// the official 0) renders user messages with only the user's words: each
// attached file appears as the same Microsoft-classic file card the composer
// dock uses, floating above the bubble.
//
// Official plugin conventions: the package registers its own locale namespace
// (`dsh-upload-button`, zh/en complete pairs) through `ctx.locale`, binds
// every component to it via the slot `locale:` option, and keeps the browser
// half split into focused modules (locales / style / upload / composer /
// message-bubble) mirroring the official `src/client/` layout.
import { injectCss } from './client/style'
import { NS, dicts } from './client/locales'
import { UPLOAD_PATH_RE, attachFile, displayName } from './client/upload'
import { UploadButton, UploadDock } from './client/composer'
import { UserMessageWithUploads } from './client/message-bubble'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only loads that activate the service / slot-map declaration merges on
// the cordis Context (the browser-side service providers). Erased at build.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/**
 * The chat markdown renderer asks this provider (the official
 * `chatFileMentions` seat) to resolve inline-code tokens: a token matching an
 * upload path renders as a compact file mention (filename label, click opens
 * the file) instead of a long path string — the renderer never guesses paths
 * on its own; only tokens this provider accepts become file cards.
 */
function fileMentionsProvider(ctx: ClientContext) {
  const resolve = (value: string) => {
    if (!UPLOAD_PATH_RE.test(value)) return undefined
    return {
      label: displayName(value),
      title: value,
      open: () => {
        const workspaces = ctx.get('workspaces')
        if (workspaces === undefined) return
        void workspaces.openPath(value).catch(() => {})
      }
    }
  }
  return {
    forClosing: () => ({ resolve })
  }
}

/**
 * Client plugin body: register the dictionaries and every UI contribution.
 * Every failure-prone registration degrades instead of crashing the
 * composition (official seat conflicts stay local to the missing seat).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext) {
  injectCss()
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`)
  // Stable per-namespace translate (bind caches per namespace; same reference
  // every call), used by non-component code paths (upload errors).
  const t = ctx.locale.bind(NS)

  // File mentions in chat: the message renderer turns our inline-code path
  // tokens into compact file mentions (filename + click-to-open). Optional
  // service — a conflict never crashes the plugin.
  try {
    ctx.provide('chatFileMentions', fileMentionsProvider(ctx))
  } catch (err) {
    console.warn('[dsh-upload-button] chatFileMentions service registration failed; paths will render as plain text:', err)
  }

  // Slot conflicts (duplicate cell ids) degrade instead of crashing. The
  // thunk form keeps the register call fully typed (the literal options are
  // checked against the declared slot map before the guard runs); a failed
  // registration returns a no-op disposer so the inject chain stays
  // well-typed.
  const guarded = (label: string, register: () => () => void): (() => void) => {
    try {
      return register()
    } catch (err) {
      console.warn(`[dsh-upload-button] slot "${label}" registration failed; that UI seat stays absent:`, err)
      return () => {}
    }
  }

  ctx.slots.inject('conversation.input.left', () => guarded('conversation.input.left', () =>
    ctx.slots.register({
      name: 'conversation.input.left',
      id: 'upload-file-button',
      order: 0,
      locale: NS,
      inject: (sessionId) => ({
        attach: (file: File) => attachFile(ctx.sessions, sessionId, file, t)
      })
    }, UploadButton)
  ))

  ctx.slots.inject('conversation.input.dock', () => guarded('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'upload-file-dock',
      order: 5,
      locale: NS
    }, UploadDock)
  ))

  // Shadow the official user-message bubble (keyed `conversation.chat.node`,
  // official priority 0; lowest wins) so the sent message never displays the
  // upload path — the bubble renders the words only, with floating file cards
  // above, while the message the model receives keeps the paths verbatim.
  // On any registration conflict the official renderer stays in place.
  for (const key of ['user', 'steering'] as const) {
    ctx.slots.inject('conversation.chat.node', () => guarded(`conversation.chat.node:${key}`, () =>
      ctx.slots.register({
        name: 'conversation.chat.node',
        key,
        priority: -1,
        locale: NS
      }, UserMessageWithUploads)
    ))
  }
}
