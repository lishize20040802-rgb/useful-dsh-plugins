import type { Context } from '@deepseek-ai/cordis';
/** Browser cordis services this client plugin needs. */
export declare const inject: string[];
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
export declare function apply(ctx: Context, rawConfig?: unknown): void;
