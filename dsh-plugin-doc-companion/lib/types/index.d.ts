import Schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "doc-companion";
/** Services required by the host half. */
export declare const inject: string[];
/** Minimal llm service face (structural subset of the host service). */
export interface LlmFace {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Validated configuration shape (schema output contract). */
export interface DocCompanionConfig {
    /** Storage root; empty resolves to $DSH_HOME/ebooks. */
    storageDir: string;
    /** Upload body cap in bytes. */
    maxBytes: number;
    /** Scanned-page snapshot cap in bytes. */
    maxImageBytes: number;
    /** Target characters per text block (TXT/MD). */
    textBlockChars: number;
    /** Paragraphs per DOCX block. */
    maxParagraphsPerBlock: number;
    /** Rows per XLSX/CSV block. */
    maxRowsPerBlock: number;
    /** Transcribe scanned pages through the vision model automatically. */
    autoTranscribeScanned: boolean;
    /** Vision provider route (same key as the main model). */
    visionProvider: string;
    /** Vision model id on that provider. */
    visionModel: string;
    /** Default hit cap for doc_search. */
    searchMaxHits: number;
}
export declare const Config: Schema<DocCompanionConfig>;
/** Normalize and validate the plugin configuration. */
export declare function normalizeConfig(raw: unknown): DocCompanionConfig;
export declare function apply(ctx: Context, rawConfig: unknown): void;
export { detectKind, sanitizeFileName, makeDocId, safeJoin, clampIndex, chunkText, chunkTotalChars, groupBy, pageLocator, textBlockLocator, paragraphBlockLocator, rowBlockLocator, normalizeWhitespace, detectBrokenTextLayer, type DocKind, type BlockText, type TableBlock } from './blocks.js';
export { openPdf, joinTextItems, extractDocxParagraphs, extractXlsxSheets, parseCsv, type PdfHandle, type SheetTable } from './extract.js';
export { searchBlocks, queryTerms, countMatches, makeSnippet, type SearchHit } from './search.js';
export { transcribeImage, TRANSCRIBE_INSTRUCTION, type VisionLlm, type VisionAttachments } from './vision.js';
export { renderPdfPagePng } from './render.js';
export { DocumentStore, DocStoreError, type DocMeta, type CurrentState, type StoreOptions } from './store.js';
