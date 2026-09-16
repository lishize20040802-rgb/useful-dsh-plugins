import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { NS } from './locales';
/** The framework-injected `t` seat carries this package's key union (+ common). */
export type UploadTranslate = TranslateNS<typeof NS>;
export interface FileChip {
    path: string;
    name: string;
}
/**
 * Strip inline-code upload-path tokens from the display text. Each stripped
 * token becomes a floating file chip; everything else — including tokens that
 * do not look like our upload paths — stays verbatim.
 * @param text - the full serialized user message text
 * @returns visible text without upload tokens, plus one chip entry per file
 */
export declare function stripUploadTokens(text: string): {
    visible: string;
    files: FileChip[];
};
/**
 * Framework props for the shadowed user / steering node: the routed node, the
 * owner face the Chat target threads down (`openFile`, `renderMessageImages`,
 * `loadImage`), and this package's own namespace translate in place of the
 * Chat namespace the shipped renderer uses.
 *
 * 0.1.5: the durable references are rendered by the framework's own
 * `renderMessageImages` — the attachment package deliberately stopped
 * exporting React components, so the plugin no longer composes a gallery (or
 * its labels) itself.
 */
export type UserMessageViewProps = Omit<ChatNodeViewProps<'user' | 'steering'>, 't'> & {
    t: UploadTranslate;
};
/**
 * Shadow renderer for user / steering chat nodes: the bubble shows only the
 * user's words; each attached file floats as the same Microsoft-classic card
 * the composer dock uses, above the bubble. The raw message text (upload
 * paths included) is preserved — copy and the model-visible message stay
 * identical to what was sent.
 */
export declare const UserMessageWithUploads: import("react").NamedExoticComponent<UserMessageViewProps>;
