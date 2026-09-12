// dsh-plugin-vision-reader — browser half (entry).
//
// Registers a compact info card under Settings → Plugins. The card is
// read-only: the plugin's configuration stays in the profile patch layer
// (like dsh-upload-button), so the browser half has zero remote/form wiring
// and nothing to break. It tells the user what the plugin does and which
// vision route is active.
//
// Official plugin conventions: own locale namespace (zh/en complete pairs)
// through ctx.locale, slot registration with a stable id, and every failure
// degrades instead of crashing the composition.
import type { LocaleId } from '@deepseek-ai/dsh-client-locale'
import type { Context } from '@deepseek-ai/cordis'
// Type-only loads activating the service / slot-map declaration merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// 0.1.5: `ctx.slots` / `ctx.uiRenderer` are declared by the UI renderer, which
// replaces the removed `@deepseek-ai/dsh-client-runtime` browser runtime.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Side-effect type import activating the LocaleNamespaceMap augmentation
// target before the `declare module` below merges into it.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace for this plugin's UI copy. */
export const NS = 'vision-reader'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This package's settings-card strings. */
    'vision-reader': VisionReaderLocaleKey
  }
}

/** Key union of every string this namespace owns. */
export type VisionReaderLocaleKey =
  | 'plugin.title'
  | 'plugin.description'
  | 'plugin.route'
  | 'plugin.routeValue'
  | 'plugin.features'
  | 'plugin.featureVision'
  | 'plugin.featurePassthrough'
  | 'plugin.featurePersist'
  | 'plugin.hint'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<VisionReaderLocaleKey, string> = {
  'plugin.title': '视觉读图插件',
  'plugin.description': '图片直接交给主模型自己看，不做任何中间转述；粘贴的图片另存为本地文件，便于之后反复回看。无需额外 API Key。',
  'plugin.route': '备用视觉路由',
  'plugin.routeValue': 'deepseek-official / deepseek-v4-flash-vision-exp',
  'plugin.features': '功能',
  'plugin.featurePassthrough': '图片原样直通主模型（全保真），不经过任何转述',
  'plugin.featurePersist': '粘贴图片自动落盘，消息里给出路径，可随时反复看同一张图',
  'plugin.featureVision': 'vision 工具：让备用视觉模型对同一张图做独立复核',
  'plugin.hint': '配置位于 profile 的 cordis.patch.yml（id: vision-reader）。修改后重启 dsh 生效。'
}

/** English dictionary (checked complete against zh). */
export const en: Record<VisionReaderLocaleKey, string> = {
  'plugin.title': 'Vision Reader',
  'plugin.description': 'Images go straight to the main model — no second-hand description in between. Pasted images are also saved to local files so the same picture can be re-read at any later point. No extra API key required.',
  'plugin.route': 'Fallback vision route',
  'plugin.routeValue': 'deepseek-official / deepseek-v4-flash-vision-exp',
  'plugin.features': 'Features',
  'plugin.featurePassthrough': 'Images reach the main model verbatim (full fidelity), never transcribed',
  'plugin.featurePersist': 'Pasted images are persisted and the message carries the path, so any picture can be re-read at will',
  'plugin.featureVision': 'vision tool: an independent second opinion from the fallback vision model',
  'plugin.hint': 'Configuration lives in the profile\'s cordis.patch.yml (id: vision-reader). Restart dsh after editing.'
}

/** Complete per-locale dictionaries for `ctx.locale.register`. */
export const dicts = {
  zh,
  en
} satisfies Record<LocaleId, Record<VisionReaderLocaleKey, string>>

/**
 * Card props. 0.1.5 shape (mirrors the official `WebSearchCardProps`): the
 * framework supplies the runtime seat and this package's own locale `t` — the
 * slot's owner share is intentionally empty, so nothing is self-injected.
 */
export type VisionReaderCardProps =
  PropsRuntime<'settings.plugin.item'> & PropsLocale<typeof NS>

/** The read-only settings card body. */
export function VisionReaderCard(props: VisionReaderCardProps): import('react').ReactElement {
  const { t } = props
  return (
    <div className="dsh_visionReader_card">
      <div className="dsh_visionReader_head">
        <span className="dsh_visionReader_title">{t('plugin.title')}</span>
        <span className="dsh_visionReader_badge">deepseek-v4-flash-vision-exp</span>
      </div>
      <p className="dsh_visionReader_desc">{t('plugin.description')}</p>
      <div className="dsh_visionReader_route">
        <span className="dsh_visionReader_routeLabel">{t('plugin.route')}</span>
        <code className="dsh_visionReader_routeValue">{t('plugin.routeValue')}</code>
      </div>
      <ul className="dsh_visionReader_features">
        <li>{t('plugin.featurePassthrough')}</li>
        <li>{t('plugin.featurePersist')}</li>
        <li>{t('plugin.featureVision')}</li>
      </ul>
      <p className="dsh_visionReader_hint">{t('plugin.hint')}</p>
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
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dicts), `${NS}: dictionaries`)

  const guarded = (label: string, register: () => () => void): (() => void) => {
    try {
      return register()
    } catch (err) {
      console.warn(`[dsh-plugin-vision-reader] slot "${label}" registration failed; that UI seat stays absent:`, err)
      return () => {}
    }
  }

  ctx.slots.inject('settings.plugin.item', () => guarded('settings.plugin.item', () =>
    // `settings.plugin.item` is a keyed slot: the dispatch key is the settings
    // namespace, and `order` is a list-slot option (0.1.5 keys it away).
    ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      locale: NS
    }, VisionReaderCard)
  ))
}
