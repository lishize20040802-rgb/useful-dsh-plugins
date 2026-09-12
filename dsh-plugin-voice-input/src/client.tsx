// dsh-plugin-voice-input — browser half (entry).
//
// One UI contribution: a push-to-talk mic button in the composer tool row
// (`conversation.input.left`), placed after the resident chrome and other
// tool entries. Holding it records, releasing transcribes through the host's
// /api/asr route (Doubao Seed-ASR), and the transcript lands in the draft —
// the composer's own input machine stays the single source of truth.
//
// Official plugin conventions: the package registers its own locale namespace
// (`dsh-plugin-voice-input`, zh/en complete pairs) through `ctx.locale`,
// binds the component to it via the slot `locale:` option, injects one
// idempotent stylesheet, and keeps the browser half split into focused
// modules (locales / style / recorder / mic) mirroring the official
// `src/client/` layout.
import { injectCss } from './client/style'
import { NS, dicts } from './client/locales'
import { MicButton, normalizeHotkey } from './client/mic'
import type { Context } from '@deepseek-ai/cordis'
// Type-only loads that activate the service / slot-map declaration merges on
// the cordis Context (the browser-side service providers). Erased at build.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// 0.1.5: `ctx.slots` / `ctx.uiRenderer` are declared by the UI renderer, which
// replaces the removed `@deepseek-ai/dsh-client-runtime` browser runtime.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the composer mic seat.
 * Every failure-prone registration degrades instead of crashing the
 * composition (official seat conflicts stay local to the missing seat).
 * The row config (profile patch) may carry:
 * - `maxSeconds` — recording safety-net in seconds (0 = unlimited);
 * - `hotkey` — hold-to-talk spec: a `KeyboardEvent.code` (`F8`) or a chord
 *   (`Backquote+Digit1`); `''`/`'none'` disables it.
 * @param ctx - client root context.
 * @param rawConfig - loader row config for this plugin.
 */
export function apply(ctx: Context, rawConfig?: unknown) {
  injectCss()
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`)

  const config = (rawConfig ?? {}) as { maxSeconds?: unknown; hotkey?: unknown }
  const maxSeconds = typeof config.maxSeconds === 'number' && Number.isFinite(config.maxSeconds)
    ? Math.max(0, Math.floor(config.maxSeconds))
    : undefined
  const hotkey = normalizeHotkey(typeof config.hotkey === 'string' ? config.hotkey : undefined)

  // Slot conflicts (duplicate cell ids) degrade instead of crashing. The
  // thunk form keeps the register call fully typed (the literal options are
  // checked against the declared slot map before the guard runs); a failed
  // registration returns a no-op disposer so the inject chain stays
  // well-typed.
  const guarded = (label: string, register: () => () => void): (() => void) => {
    try {
      return register()
    } catch (err) {
      console.warn(`[dsh-plugin-voice-input] slot "${label}" registration failed; that UI seat stays absent:`, err)
      return () => {}
    }
  }

  ctx.slots.inject('conversation.input.left', () => guarded('conversation.input.left', () =>
    ctx.slots.register({
      name: 'conversation.input.left',
      id: 'voice-input-button',
      order: 10,
      locale: NS,
      inject: () => ({
        ...(maxSeconds !== undefined ? { maxSeconds } : {}),
        ...(hotkey !== null ? { hotkey } : { hotkey: null })
      })
    }, MicButton)
  ))
}
