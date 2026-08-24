import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Locale namespace for this plugin's UI copy. */
export declare const NS = "vision-reader";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This package's settings-card strings. */
        'vision-reader': VisionReaderLocaleKey;
    }
}
/** Key union of every string this namespace owns. */
export type VisionReaderLocaleKey = 'plugin.title' | 'plugin.description' | 'plugin.route' | 'plugin.routeValue' | 'plugin.features' | 'plugin.featureVision' | 'plugin.featureTranscribe' | 'plugin.featureHide' | 'plugin.hint';
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: Record<VisionReaderLocaleKey, string>;
/** English dictionary (checked complete against zh). */
export declare const en: Record<VisionReaderLocaleKey, string>;
/** Complete per-locale dictionaries for `ctx.locale.register`. */
export declare const dicts: {
    zh: Record<VisionReaderLocaleKey, string>;
    en: Record<VisionReaderLocaleKey, string>;
};
/** Card props injected by the settings slot. */
export interface VisionReaderCardProps {
    t: (key: string) => string;
}
/** The read-only settings card body. */
export declare function VisionReaderCard(props: VisionReaderCardProps): import('react').ReactElement;
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
/**
 * Client plugin body: register dictionaries and the settings info card.
 * Every failure-prone registration degrades instead of crashing.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
