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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only loads activating the service / slot-map declaration merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Side-effect type import activating the LocaleNamespaceMap augmentation
// target before the `declare module` below merges into it.
import type {} from '@deepseek-ai/dsh-client-ui-slots'

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
  | 'plugin.featureTranscribe'
  | 'plugin.featureHide'
  | 'plugin.hint'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<VisionReaderLocaleKey, string> = {
  'plugin.title': '视觉读图插件',
  'plugin.description': '让纯文本主模型也能看图：遇到图片时自动调用 DeepSeek 内置多模态模型识别，识别结果以纯文本返回。无需额外 API Key。',
  'plugin.route': '视觉路由',
  'plugin.routeValue': 'deepseek-official / deepseek-v4-flash-vision-exp',
  'plugin.features': '功能',
  'plugin.featureVision': 'vision 工具：模型可读取图片路径并返回识别文本',
  'plugin.featureTranscribe': '粘贴图片自动转述为文字，不进入主模型上下文',
  'plugin.featureHide': '纯文本主模型会话自动隐藏 read_image，避免必失败的调用',
  'plugin.hint': '配置位于 profile 的 cordis.patch.yml（id: vision-reader）。修改后重启 dsh 生效。'
}

/** English dictionary (checked complete against zh). */
export const en: Record<VisionReaderLocaleKey, string> = {
  'plugin.title': 'Vision Reader',
  'plugin.description': 'Lets text-only main models read images: image content is routed through DeepSeek\'s built-in multimodal model and returned as plain text. No extra API key required.',
  'plugin.route': 'Vision route',
  'plugin.routeValue': 'deepseek-official / deepseek-v4-flash-vision-exp',
  'plugin.features': 'Features',
  'plugin.featureVision': 'vision tool: the model reads image paths and returns recognized text',
  'plugin.featureTranscribe': 'Pasted images are auto-transcribed to text and never enter the main model context',
  'plugin.featureHide': 'read_image is hidden in text-only main-model sessions to avoid guaranteed failures',
  'plugin.hint': 'Configuration lives in the profile\'s cordis.patch.yml (id: vision-reader). Restart dsh after editing.'
}

/** Complete per-locale dictionaries for `ctx.locale.register`. */
export const dicts = {
  zh,
  en
} satisfies Record<LocaleId, Record<VisionReaderLocaleKey, string>>

/** Card props injected by the settings slot. */
export interface VisionReaderCardProps {
  t: (key: string) => string
}

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
        <li>{t('plugin.featureVision')}</li>
        <li>{t('plugin.featureTranscribe')}</li>
        <li>{t('plugin.featureHide')}</li>
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
export function apply(ctx: ClientContext): void {
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
    ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      id: NS,
      order: 30,
      locale: NS,
      inject: (): VisionReaderCardProps => ({
        t: (key: string) => ctx.locale.bind(NS)(key)
      })
    }, VisionReaderCard)
  ))
}
