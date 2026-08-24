import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
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
/** Card props injected by the settings slot. */
export interface DesktopLauncherCardProps {
    t: (key: string) => string;
}
/** The read-only settings card body. */
export declare function DesktopLauncherCard(props: DesktopLauncherCardProps): import('react').ReactElement;
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
/**
 * Client plugin body: register dictionaries and the settings info card.
 * Every failure-prone registration degrades instead of crashing.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
