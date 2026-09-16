/** Whether the user asked to show the reader panel in this session. */
export declare function isPanelRequested(sessionId?: string): boolean;
/** Remember the open intent for one session (toolbar toggle). */
export declare function requestPanel(sessionId?: string): void;
/** Clear the open intent for one session (panel close button). */
export declare function dismissPanel(sessionId?: string): void;
/** Subscribe to intent changes; returns an unsubscribe function. */
export declare function subscribePanelRequested(listener: () => void): () => void;
