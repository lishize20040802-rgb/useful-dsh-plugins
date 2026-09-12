/** A live PDF document with per-page text access. */
export interface PdfHandle {
    /** Total page count (1-based page numbers = block indexes). */
    numPages: number;
    /** Extract the plain text of one page. */
    pageText(page: number, signal?: AbortSignal): Promise<string>;
    /** Release the underlying PDFDocumentProxy. */
    dispose(): void;
}
/**
 * Open a PDF from raw bytes and return a handle. The handle promise is cached
 * per document id so the reader panel, the tools and the index builder share
 * one parse; the oldest entry is evicted when the cache overflows.
 * @param docId - document id (cache key).
 * @param data - raw PDF bytes.
 * @returns a cached or fresh handle promise.
 */
export declare function openPdf(docId: string, data: Uint8Array): Promise<PdfHandle>;
/**
 * Join pdf.js text-content items into a readable paragraph-ish string.
 * Item order is visual order; `hasEOL` marks line ends.
 */
export declare function joinTextItems(items: readonly unknown[]): string;
/**
 * Extract the paragraph list of a DOCX file. Paragraph boundaries are the
 * document's real line breaks (mammoth raw text), so block locators stay
 * meaningful for the reader and for search.
 * @param bytes - raw DOCX bytes.
 * @returns one trimmed non-empty string per paragraph.
 */
export declare function extractDocxParagraphs(bytes: Uint8Array): Promise<string[]>;
/** One worksheet with its raw row matrix. */
export interface SheetTable {
    /** Sheet name ('' when unnamed). */
    sheetName: string;
    /** One entry per row; cells are always strings. */
    rows: string[][];
}
/**
 * Extract every worksheet of an XLSX workbook as string row matrices.
 * @param bytes - raw XLSX bytes.
 * @returns one SheetTable per sheet, in workbook order.
 */
export declare function extractXlsxSheets(bytes: Uint8Array): Promise<SheetTable[]>;
/**
 * Parse CSV text into a row matrix. Handles quoted fields containing commas,
 * newlines and doubled quotes; CRLF is normalized. Blank rows are dropped.
 * @param text - the raw CSV content.
 * @returns one entry per row; cells are trimmed strings.
 */
export declare function parseCsv(text: string): string[][];
