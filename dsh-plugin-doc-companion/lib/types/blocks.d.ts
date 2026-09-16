/** Document kinds the companion can open. */
export type DocKind = 'pdf' | 'text' | 'docx' | 'xlsx' | 'csv';
/** One block of a document: 1-based index, human locator, extracted text. */
export interface BlockText {
    /** 1-based block index (PDF page numbers live in the same space). */
    index: number;
    /** Human locator label, e.g. "第 12 页" or "工作表「真题」第 10–29 行". */
    locator: string;
    /** Extracted plain text of this block ('' for scanned PDF pages). */
    text: string;
}
/** A spreadsheet block: one sheet, a row range, and its cells. */
export interface TableBlock {
    /** 1-based block index. */
    index: number;
    /** Sheet name the rows come from. */
    sheet: string;
    /** 1-based first row of this block in the sheet ('' header row included). */
    firstRow: number;
    /** Header cells (first row of the block). */
    columns: string[];
    /** Data cells, one row per entry. */
    rows: string[][];
}
/**
 * Map a file name onto a supported document kind.
 * @param fileName - the original file name (any path separators tolerated).
 * @returns the kind, or `null` when the extension is unsupported.
 */
export declare function detectKind(fileName: string): DocKind | null;
/**
 * Sanitize an uploaded file name for display and storage: keep the basename,
 * strip path separators and control characters, trim trailing dots/spaces.
 * @param name - the raw name as supplied by the client.
 * @returns a display-safe file name, never empty.
 */
export declare function sanitizeFileName(name: string): string;
/** Create a short unique document id (timestamp base36 + random suffix). */
export declare function makeDocId(): string;
/** Clamp a 1-based index into [1, total], tolerating NaN and negatives. */
export declare function clampIndex(n: number, total: number): number;
/**
 * Split a long text into fixed-size blocks. Boundaries are pure character
 * slices so the browser and the host always agree on the block space.
 * @param text - the full document text.
 * @param blockChars - target characters per block (floored at 100).
 * @returns one string per block; a single empty string for empty input.
 */
export declare function chunkText(text: string, blockChars: number): string[];
/** Total characters covered by a chunkText result. */
export declare function chunkTotalChars(chunks: readonly string[], blockChars: number): number;
/**
 * Group an array into fixed-size slices (used for paragraphs and rows).
 * @param items - the flat item array (paragraphs or row arrays).
 * @param perBlock - items per block (floored at 1).
 * @returns one group per block; a single empty group for an empty input.
 */
export declare function groupBy<T>(items: readonly T[], perBlock: number): T[][];
/** Locator for one PDF page. */
export declare function pageLocator(n: number): string;
/** Locator for one fixed-size text block. */
export declare function textBlockLocator(index1: number, blockChars: number, totalChars: number): string;
/** Locator for one paragraph-group block. */
export declare function paragraphBlockLocator(first: number, last: number): string;
/** Locator for one row-group block. */
export declare function rowBlockLocator(sheet: string, first: number, last: number): string;
/**
 * Resolve a relative path inside a root, rejecting any traversal outside it.
 * @param root - the absolute serving root.
 * @param rel - the raw relative path from the request URL.
 * @returns the absolute safe target, or `null` when the path escapes the root.
 */
export declare function safeJoin(root: string, rel: string): string | null;
/** Normalize extracted text: collapse spaces, trim line whitespace. */
export declare function normalizeWhitespace(text: string): string;
/**
 * Whole-document health check: can the extracted text layer be trusted for
 * searching? Two shapes of "no" are caught here, and both must be, because
 * doc_search treats an unsearchable document differently from one that simply
 * has no match:
 *
 *   1. A pure image scan — every page extracts to '' (no text layer at all).
 *      Judged on the whole document, not a sample: a scan of any page count
 *      gets flagged, not just books long enough to sample.
 *   2. A text layer whose glyph mapping is broken. Per-page noise varies (some
 *      pages 5%, some 30%), so a per-page heuristic alone would miss pages —
 *      instead sample the whole book: a document that is essentially free of
 *      CJK while carrying a meaningful share of Latin-1/Latin-Extended noise
 *      almost certainly has a broken glyph mapping (a genuine English book is
 *      pure ASCII; genuine CJK text keeps its CJK ratio).
 *
 * Reading is vision-first anyway, so the flag exists to keep doc_search
 * honest (a text layer like the above cannot be searched).
 * @param blocks - the document's extracted block texts.
 * @returns whether the whole text layer is unusable for search.
 */
export declare function detectBrokenTextLayer(blocks: readonly BlockText[]): boolean;
