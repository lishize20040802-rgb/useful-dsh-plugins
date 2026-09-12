import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales';
/**
 * Default hold-to-talk hotkey, configurable via the profile patch. Formats:
 * - `Modifier+Key` / `Modifier+Key1+Key2` — an OS modifier (Alt/Ctrl/Shift/
 *   Win) arms the gesture; the chord keys only become "non-typing" and start
 *   recording while the modifier is held, so plain keys stay fully usable
 *   (e.g. `` ` `` and `1` type normally until Alt is down).
 * - `Key` / `Key1+Key2` — a plain key or chord without an OS modifier; the
 *   first key then acts as a modifier that never types.
 * Default: `AltLeft+Backquote+Digit1` (hold Alt, then `` ` `` and `1`).
 */
export declare const DEFAULT_HOTKEY = "AltLeft+Backquote+Digit1";
/**
 * Normalize a configured hotkey into a canonical spec (`A`, `A+B`,
 * `Mod+A+B`), or `null` to disable. `''` / `'none'` / `'off'` / `'false'`
 * disable the hotkey; `` '`' ``/`'~'` map to `Backquote`; `Alt`/`Ctrl`/
 * `Shift`/`Win` map to their left-hand codes; anything else is taken as a
 * `KeyboardEvent.code` verbatim (e.g. `F8`, `Digit1`).
 */
export declare function normalizeHotkey(raw: string | undefined): string | null;
/** Human-readable label for one hotkey spec (used in the tooltip). */
export declare function hotkeyLabel(spec: string): string;
/** Framework props: standard session kit (inputActions/useInput/sessionId) + locale seat. */
export type MicButtonProps = PropsRuntime<'conversation.input.left'> & PropsLocale<typeof NS> & {
    /** Recording safety-net duration in seconds (0 = unlimited). */
    maxSeconds?: number;
    /** Hold-to-talk `KeyboardEvent.code`; `null` disables the hotkey. */
    hotkey?: string | null;
};
export declare function MicButton({ inputActions, useInput, t, maxSeconds, hotkey }: MicButtonProps): import("react").JSX.Element;
