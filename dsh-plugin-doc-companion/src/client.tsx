// dsh-plugin-doc-companion — browser half (entry).
//
// Two UI contributions, both registered with `ctx.slots.inject` so the
// declaration order never matters:
//   - `shell.overlay` (order 50): the reader panel (DocPanel). The panel is a
//     root-scope surface that makes room for itself in the layout frame (the
//     chat column narrows automatically), so it works in every session state
//     and never fights the shipped UI or the official details column.
//   - `conversation.input.left` (order 100): the toolbar toggle (DocToggle)
//     that opens the panel (and closes the official details column so both
//     never claim the right edge).
// The locale namespace is registered through the official `ctx.locale`
// contract; every slot registration binds to it via the `locale:` option.
import { injectCss } from './client/style'
import { NS, zh, en } from './client/locales'
import { requestPanel } from './client/store'
import { DocPanel } from './client/panel'
import { DocToggle } from './client/toggle'
import type { Context } from '@deepseek-ai/cordis'
// Type-only loads activating the service / slot-map declaration merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// 0.1.5: `ctx.slots` / `ctx.uiRenderer` are declared by the UI renderer, which
// replaces the removed `@deepseek-ai/dsh-client-runtime` browser runtime.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// `shell.overlay` (this panel's seat) is declared by the layout frame, and the
// locale merge table below targets ui-slots — both must be in the program.
// `ILayout` is the official right-column service face (0.1.1's `openDetails` /
// `closeDetails` pair became `openRightbar` / `closeRightbar` in 0.1.5).
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { DocCompanionLocaleKey } from './client/locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This package's panel/toggle strings. */
    'dsh-plugin-doc-companion': DocCompanionLocaleKey
  }
}

// 0.1.5 note: no local `ctx.layout` shim. The layout package is a resolvable
// dependency again and declares the real `ILayout` service (see the type-only
// import above), so the hand-written face this package used to carry under
// 0.1.1 — when the layout types shipped only inside the assembled frontend —
// now collides with the official declaration and must not be repeated here.

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and every UI contribution.
 * Every failure-prone registration degrades instead of crashing the
 * composition (official seat conflicts stay local to the missing seat).
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  injectCss()
  ctx.effect(() => {
    const disposeZh = ctx.locale.register(NS, 'zh', zh)
    const disposeEn = ctx.locale.register(NS, 'en', en)
    return () => {
      disposeZh()
      disposeEn()
    }
  }, `${NS}: dictionaries`)

  const guarded = (label: string, register: () => () => void): (() => void) => {
    try {
      return register()
    } catch (err) {
      console.warn(`[dsh-plugin-doc-companion] slot "${label}" registration failed; that UI seat stays absent:`, err)
      return () => {}
    }
  }

  const layout = (): ILayout | undefined => ctx.get('layout') as ILayout | undefined

  // The reader panel is a root-scope `shell.overlay` surface. It does NOT
  // occupy the official right column (whose occupant must shadow the shipped
  // panel and which only renders for engaged sessions) — instead it reserves
  // room in the layout frame itself, so it works in every session state and
  // never fights the shipped UI. Opening it closes the official right column
  // so both never claim the right edge.
  ctx.slots.inject('shell.overlay', () => guarded('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'doc-companion-panel',
      order: 50,
      locale: NS
    }, DocPanel)
  ))

  ctx.slots.inject('conversation.input.left', () => guarded('conversation.input.left', () =>
    ctx.slots.register({
      name: 'conversation.input.left',
      id: 'doc-companion-toggle',
      order: 100,
      locale: NS,
      // Session-scope inject: the framework passes the session id first, so
      // the open intent is recorded for THIS conversation only.
      inject: (sessionId?: string) => ({ openPanel: () => {
        requestPanel(sessionId)
        layout()?.closeRightbar()
      } })
    }, DocToggle)
  ))
}
