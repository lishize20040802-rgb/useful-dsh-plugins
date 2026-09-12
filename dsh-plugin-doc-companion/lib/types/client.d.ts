import type { Context } from '@deepseek-ai/cordis';
import type { DocCompanionLocaleKey } from './client/locales';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This package's panel/toggle strings. */
        'dsh-plugin-doc-companion': DocCompanionLocaleKey;
    }
}
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and every UI contribution.
 * Every failure-prone registration degrades instead of crashing the
 * composition (official seat conflicts stay local to the missing seat).
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
