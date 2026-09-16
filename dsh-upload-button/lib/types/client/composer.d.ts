import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client';
import type { NS } from './locales';
/** The framework-injected `t` seat carries this package's key union (+ common). */
export type UploadTranslate = TranslateNS<typeof NS>;
export interface UploadButtonProps {
    /** Upload + queue one picked file for the session's next send (injected). */
    attach?: (file: File) => Promise<void>;
    /** Framework-injected package-namespace translate. */
    t: UploadTranslate;
}
export declare function UploadButton({ attach, t }: UploadButtonProps): import("react").JSX.Element;
export interface UploadDockProps {
    /** The session this composer belongs to (framework standard kit). */
    sessionId: SessionId;
    /** Framework-injected package-namespace translate. */
    t: UploadTranslate;
}
/** Floating card row above the composer: pending file cards + error banner. */
export declare function UploadDock({ sessionId, t }: UploadDockProps): import("react").JSX.Element | null;
