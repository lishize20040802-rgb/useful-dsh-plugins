import type { Context } from '@deepseek-ai/cordis';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Locale namespace for this plugin's UI copy. */
export declare const NS = "desktop-launcher";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This package's settings-card strings. */
        'desktop-launcher': DesktopLauncherLocaleKey;
    }
}
/** Key union of every string this namespace owns. */
export type DesktopLauncherLocaleKey = 'plugin.title' | 'plugin.description' | 'plugin.port' | 'plugin.host' | 'plugin.autoOpen' | 'plugin.hint';
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: Record<DesktopLauncherLocaleKey, string>;
/** English dictionary (checked complete against zh). */
export declare const en: Record<DesktopLauncherLocaleKey, string>;
/** Complete per-locale dictionaries for `ctx.locale.register`. */
export declare const dicts: {
    zh: Record<DesktopLauncherLocaleKey, string>;
    en: Record<DesktopLauncherLocaleKey, string>;
};
/**
 * Card props. 0.1.5 shape (mirrors the official `WebSearchCardProps`): the
 * framework supplies the runtime seat and this package's own locale `t` — the
 * slot's owner share is intentionally empty, so nothing is self-injected.
 */
export type DesktopLauncherCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<typeof NS>;
/** The read-only settings card body. */
export declare function DesktopLauncherCard(props: DesktopLauncherCardProps): import('react').ReactElement;
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
/**
 * Client plugin body: register dictionaries and the settings info card.
 * Every failure-prone registration degrades instead of crashing.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
