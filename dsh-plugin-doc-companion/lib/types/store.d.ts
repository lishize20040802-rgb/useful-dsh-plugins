import { type BlockText, type DocKind, type TableBlock } from './blocks.js';
/** One registered document. */
export interface DocMeta {
    id: string;
    name: string;
    kind: DocKind;
    /** Stored file name under <root>/docs. */
    fileName: string;
    /** 1-based block count; null until the index is built. */
    totalBlocks: number | null;
    /** PDFs only: text layer glyphs map to broken code points (see detectBrokenTextLayer). */
    textLayerBroken?: boolean;
    addedAt: number;
}
/** The current reading position. */
export interface CurrentState {
    docId: string | null;
    block: number;
}
/** Tunables that shape the block model. */
export interface StoreOptions {
    textBlockChars: number;
    maxParagraphsPerBlock: number;
    maxRowsPerBlock: number;
}
/** Errors thrown for document-level problems (aligned with harness codes). */
export declare class DocStoreError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
export declare class DocumentStore {
    private readonly root;
    private readonly opts;
    private readonly docs;
    /** Per-session reading positions (the panel follows the current session). */
    private readonly currentBySession;
    /** Fallback position for session-less callers (tests, direct curl probes). */
    private fallbackCurrent;
    private readonly blocksByDoc;
    private readonly readySet;
    /** docId → (block → extracted text) for PDF pages touched so far. */
    private readonly pageTextCache;
    /** docId → (block → snapshot path) for scanned pages rendered by the panel. */
    private readonly images;
    /** docId → last table block (xlsx/csv table rendering cache). */
    private readonly tableCache;
    private saveTimer;
    constructor(root: string, opts: StoreOptions);
    get docsDir(): string;
    get textDir(): string;
    get imageDir(): string;
    /** Ensure the storage layout exists and load the persisted registry. */
    init(): Promise<void>;
    private loadMeta;
    private scheduleSave;
    private saveMeta;
    /** Dispose timers (used by tests). */
    dispose(): void;
    /** Flush pending metadata to disk immediately (used by tests). */
    flush(): Promise<void>;
    /** All registered documents, oldest first. */
    list(): DocMeta[];
    get(docId: string): DocMeta | undefined;
    /** Absolute path of the stored file for one document. */
    filePath(docId: string): string;
    /** Absolute path of the page snapshot for one block, if any. */
    imagePath(docId: string, block: number): string | undefined;
    /**
     * Register an uploaded file: persist the bytes and make it the current
     * document of the given session (or the fallback position) at block 1.
     * The index build starts in the background.
     */
    registerBytes(fileName: string, kind: DocKind, bytes: Uint8Array, sessionId?: string): Promise<DocMeta>;
    /**
     * Register an existing file by path (doc_open): copy it into the store so
     * the reader and the tools serve one canonical location.
     */
    registerFile(fileName: string, kind: DocKind, sourcePath: string, sessionId?: string): Promise<DocMeta>;
    private createMeta;
    /** Forget a document entirely (file, index, snapshots). */
    remove(docId: string): Promise<void>;
    /**
     * Set the current reading position for one session (block clamped into
     * range). Session-less callers (tests, direct probes) use the fallback
     * position instead.
     */
    setCurrent(docId: string, block: number, sessionId?: string): void;
    /** The reading position of one session (null state when unset). */
    currentState(sessionId?: string): CurrentState;
    /** Clear the reading position of one session (docs stay in the library). */
    close(sessionId?: string): void;
    /** Whether the full index (all block texts) is ready for one document. */
    isReady(docId: string): boolean;
    /**
     * Fast path: the text and locator of one block. For PDFs a single page is
     * extracted on demand (the full index keeps building in the background);
     * other kinds fall back to the (fast) full build.
     */
    blockText(docId: string, block: number, signal?: AbortSignal): Promise<BlockText>;
    /**
     * Full index: every block text of the document, in block order. Non-PDF
     * kinds build synchronously (fast); PDFs extract page by page and the
     * result is cached on disk. Callers should pass the exec signal so a
     * long PDF build can be aborted.
     */
    blocksFor(docId: string, signal?: AbortSignal): Promise<BlockText[]>;
    /** Start the full index build without awaiting it (PDF fast-path helper). */
    kickIndex(docId: string): void;
    private buildBlocks;
    /**
     * Whole-document glyph-mapping health check for PDFs: when the text layer
     * is broken (see detectBrokenTextLayer), the flag is persisted on the meta
     * so every page is served through the vision transcription path and search
     * is reported as unavailable instead of returning garbage hits.
     */
    private checkTextLayerHealth;
    private sheetBlocks;
    private rowOffsetOf;
    /**
     * The table-shaped view of one block (xlsx/csv rendering). Returns the
     * header cells plus the data rows of the requested block.
     */
    tableBlock(docId: string, block: number, signal?: AbortSignal): Promise<TableBlock>;
    /** Record a page snapshot saved by the reader panel. */
    setBlockImage(docId: string, block: number, path: string): void;
    /** Persist a page snapshot (PNG bytes) and register it for one block. */
    saveBlockImage(docId: string, block: number, bytes: Uint8Array): Promise<string>;
    /** Cache an extracted/transcribed block text (scanned-page results). */
    cacheBlockText(docId: string, block: number, text: string): void;
    /**
     * Transcription cache for PDF pages (vision-first reading): maps
     * `docId:block` to the vision-transcribed text. In-memory only — a restart
     * re-transcribes on first access, exactly like the page-text cache.
     */
    private readonly transcribedPages;
    /** The vision-transcribed text of a PDF page, or undefined when not yet done. */
    transcribedText(docId: string, block: number): string | undefined;
    /** Record a successful vision transcription (also feeds the page-text cache). */
    markTranscribed(docId: string, block: number, text: string): void;
    /**
     * Ensure a page snapshot exists for one block, rendering it HOST-SIDE when
     * the reader panel never showed the page (pdf.js + @napi-rs/canvas). This
     * is the background path: the agent can read any page through the vision
     * model without the user navigating there.
     * @returns the snapshot path, or undefined when unavailable/failed.
     */
    ensurePageImage(docId: string, block: number): Promise<string | undefined>;
    private pageTextFor;
    private tryReadSidecar;
    private writeSidecar;
}
