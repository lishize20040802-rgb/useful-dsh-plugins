// dsh-desktop-config — browser half (entry).
//
// Registers a compact info card under Settings → Plugins. The card is
// read-only: the desktop launcher's configuration lives in the settings
// namespace (editable from the Models/settings surface or the profile patch
// layer), so the browser half has zero remote/form wiring and nothing to
// break. It tells the user what the plugin owns and how to change it.
//
// Official plugin conventions: own locale namespace (zh/en complete pairs)
// through ctx.locale, slot registration with a stable id, and every failure
// degrades instead of crashing the composition.
import type { LocaleId } from '@deepseek-ai/dsh-client-locale'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only loads activating the service / slot-map declaration merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Side-effect type import activating the LocaleNamespaceMap augmentation
// target before the `declare module` below merges into it.
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace for this plugin's UI copy. */
export const NS = 'desktop-launcher'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This package's settings-card strings. */
    'desktop-launcher': DesktopLauncherLocaleKey
  }
}

/** Key union of every string this namespace owns. */
export type DesktopLauncherLocaleKey =
  | 'plugin.title'
  | 'plugin.description'
  | 'plugin.port'
  | 'plugin.host'
  | 'plugin.autoOpen'
  | 'plugin.hint'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<DesktopLauncherLocaleKey, string> = {
  'plugin.title': '桌面端启动器',
  'plugin.description': '管理桌面应用的启动配置（端口、绑定地址、自动打开）。桌面端（Electron）启动时从这里读取配置，与 Web 设置页共享同一份配置。',
  'plugin.port': '端口',
  'plugin.host': '绑定地址',
  'plugin.autoOpen': '自动打开浏览器',
  'plugin.hint': '配置位于设置页的 desktop-launcher 命名空间，或 profile 的 cordis.patch.yml（id: desktop-launcher）。修改后重启桌面端生效。'
}

/** English dictionary (checked complete against zh). */
export const en: Record<DesktopLauncherLocaleKey, string> = {
  'plugin.title': 'Desktop Launcher',
  'plugin.description': 'Owns the desktop app\'s launch configuration (port, bind host, auto-open). The Electron shell reads this at startup, sharing one source of truth with the web settings page.',
  'plugin.port': 'Port',
  'plugin.host': 'Bind host',
  'plugin.autoOpen': 'Open browser automatically',
  'plugin.hint': 'Configuration lives in the desktop-launcher settings namespace or the profile\'s cordis.patch.yml (id: desktop-launcher). Restart the desktop app after editing.'
}

/** Complete per-locale dictionaries for `ctx.locale.register`. */
export const dicts = {
  zh,
  en
} satisfies Record<LocaleId, Record<DesktopLauncherLocaleKey, string>>

/** Card props injected by the settings slot. */
export interface DesktopLauncherCardProps {
  t: (key: string) => string
}

/** The read-only settings card body. */
export function DesktopLauncherCard(props: DesktopLauncherCardProps): import('react').ReactElement {
  const { t } = props
  return (
    <div className="dsh_desktopLauncher_card">
      <div className="dsh_desktopLauncher_head">
        <span className="dsh_desktopLauncher_title">{t('plugin.title')}</span>
        <span className="dsh_desktopLauncher_badge">Electron</span>
      </div>
      <p className="dsh_desktopLauncher_desc">{t('plugin.description')}</p>
      <p className="dsh_desktopLauncher_hint">{t('plugin.hint')}</p>
    </div>
  )
}

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register dictionaries and the settings info card.
 * Every failure-prone registration degrades instead of crashing.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`)

  const guarded = (label: string, register: () => () => void): (() => void) => {
    try {
      return register()
    } catch (err) {
      console.warn(`[dsh-desktop-config] slot "${label}" registration failed; that UI seat stays absent:`, err)
      return () => {}
    }
  }

  ctx.slots.inject('settings.plugin.item', () => guarded('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      id: NS,
      order: 31,
      locale: NS,
      inject: (): DesktopLauncherCardProps => ({
        t: (key: string) => ctx.locale.bind(NS)(key)
      })
    }, DesktopLauncherCard)
  ))
}
