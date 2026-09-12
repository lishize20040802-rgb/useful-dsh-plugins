/** File picker accept list (mirrors the host's supported kinds). */
export declare const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.markdown";
/** Upload a document file to the host and return its registry id. */
export declare function uploadDocument(file: File, sessionId?: string): Promise<{
    doc_id: string;
}>;
/** Poll the host for the current document state of one session. */
export interface DocState {
    doc: {
        id: string;
        name: string;
        kind: string;
        total_blocks: number | null;
        ready: boolean;
        text_layer_broken?: boolean;
    } | null;
    block: number | null;
}
export declare function fetchDocState(sessionId?: string): Promise<DocState>;
