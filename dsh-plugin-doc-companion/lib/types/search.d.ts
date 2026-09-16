import type { BlockText } from './blocks.js';
/** One search hit: where it is, and what surrounds it. */
export interface SearchHit {
    /** 1-based block index of the hit. */
    block: number;
    /** Human locator label of the block, e.g. "第 12 页". */
    locator: string;
    /** Context window around the first matched term. */
    snippet: string;
    /** Total occurrences of every query term inside the block. */
    matches: number;
}
/** Count non-overlapping occurrences of `needle` inside `haystack`. */
export declare function countOccurrences(haystack: string, needle: string): number;
/** Split a query into normalized terms (whitespace-separated, lowercased). */
export declare function queryTerms(query: string): string[];
/**
 * Search block texts for every query term.
 * @param blocks - the document's block texts (in index order).
 * @param query - raw user query; whitespace-separated terms are AND-ed.
 * @param maxHits - result cap (best hits first).
 * @param window - snippet half-width in characters around the first match.
 * @returns ranked hits: more total occurrences first, then earlier blocks.
 */
export declare function searchBlocks(blocks: readonly BlockText[], query: string, maxHits?: number, window?: number): SearchHit[];
/** One block's total query-term occurrences (used for result previews). */
export declare function countMatches(blockText: string, query: string): number;
/**
 * Build a readable snippet around a match: ±window characters, ellipses at
 * the cut edges, line breaks collapsed to spaces.
 */
export declare function makeSnippet(text: string, at: number, termLen: number, window: number): string;
