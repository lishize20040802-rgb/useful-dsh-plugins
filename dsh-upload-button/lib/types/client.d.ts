import type { Context } from '@deepseek-ai/cordis';
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and every UI contribution.
 * Every failure-prone registration degrades instead of crashing the
 * composition (official seat conflicts stay local to the missing seat).
 *
 * 0.1.5 removed this plugin's prose file-mention provider: `chatFileMentions`
 * is now owned outright by the official `dsh-client-ui-deliverables` plugin
 * ("all policy lives here"), whose vocabulary is the turn's write/edit
 * products. Providing it here became a duplicate-service boot failure, and
 * there is no third-party extension point. Assistant prose therefore renders
 * an upload path as inert inline code; the plugin's own bubble (below) still
 * hides the path and shows the file card.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
