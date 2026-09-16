import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client';
import type { NS } from './locales';
/** The package-namespace translate used outside components (upload errors). */
export type UploadTranslate = TranslateNS<typeof NS>;
/** Our content-addressed upload path signature: `<dir>...<12-hex>-<name>`. */
export declare const UPLOAD_PATH_RE: RegExp;
/** One pending upload: the saved path plus display metadata. */
export interface PendingFile {
    path: string;
    name: string;
    bytes: number;
}
export declare function subscribePending(listener: () => void): () => void;
export declare function pendingOf(sessionId: string): PendingFile[];
export declare function addPendingFile(sessionId: string, file: PendingFile): void;
export declare function removePendingFile(sessionId: string, path: string): void;
/**
 * Display metadata cache keyed by upload path (server-reported names/bytes;
 * the picker File object is not retained after upload).
 */
export interface UploadMeta {
    name: string;
    bytes: number;
}
export declare const uploadMeta: Map<string, UploadMeta>;
/**
 * Dismissible error banner state (module-local, observable via React's
 * useSyncExternalStore). Upload errors land here instead of the official
 * notice surface, which offers no dismissal affordance.
 */
export interface UploadError {
    seq: number;
    text: string;
}
export declare function subscribeErrors(listener: () => void): () => void;
export declare function getUploadError(): UploadError | null;
export declare function setUploadError(text: string): void;
export declare function clearUploadError(): void;
/** Classic Microsoft palette: badge background + uppercase extension label. */
export declare function badgeStyle(name: string): {
    bg: string;
    ext: string;
};
export declare function formatBytes(n: number): string;
/** Display name of an uploaded file: the hash prefix stays internal. */
export declare function nameFromPath(path: string): string;
/** Presentation name of an uploaded file: the hash prefix stays internal. */
export declare function displayName(path: string): string;
/** Restore only our own hook and let wrappers installed later remain intact. */
export declare function disposeSendAttachments(): void;
/**
 * Transparently append the session's pending file paths to the next outgoing
 * message. Installed once per session face (WeakSet-guarded, so a re-created
 * face re-wraps). The paths are appended as inline-code tokens — the same
 * serialized shape the chat bubble renderer strips — so the model receives
 * them verbatim while the chat UI never shows them. Pending files clear only
 * after the prompt is accepted, so a failed send keeps the dock cards for a
 * retry.
 * @param sessions - the `ctx.sessions` service (binding resolution)
 * @param sessionId - target session
 */
export declare function installSendAttachment(sessions: any, sessionId: SessionId): void;
/**
 * Upload one browser File and queue it for the session's next send.
 * The composer draft is never touched.
 * @param sessions - the `ctx.sessions` service
 * @param sessionId - target session (pending files attach to its next send)
 * @param file - the picked browser file
 * @param t - the package-namespace translate (error copy)
 */
export declare function attachFile(sessions: any, sessionId: SessionId, file: File, t: UploadTranslate): Promise<void>;
