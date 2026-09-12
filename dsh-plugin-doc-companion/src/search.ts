// dsh-plugin-doc-companion — in-document search (pure, unit-testable).
//
// The model's escape hatch when a question reaches beyond the current block:
// doc_search scans the extracted block texts for the query terms and returns
// ranked hits with human locators and context snippets. Matching is
// case-insensitive substring matching per whitespace-separated term; a block
// must contain every term to hit. Ordering prefers more terms found, then
// earlier blocks.
import type { BlockText } from './blocks.js'

/** One search hit: where it is, and what surrounds it. */
export interface SearchHit {
  /** 1-based block index of the hit. */
  block: number
  /** Human locator label of the block, e.g. "第 12 页". */
  locator: string
  /** Context window around the first matched term. */
  snippet: string
  /** Total occurrences of every query term inside the block. */
  matches: number
}

/** Count non-overlapping occurrences of `needle` inside `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    count += 1
    at = haystack.indexOf(needle, at + needle.length)
  }
  return count
}

/** Split a query into normalized terms (whitespace-separated, lowercased). */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/**
 * Search block texts for every query term.
 * @param blocks - the document's block texts (in index order).
 * @param query - raw user query; whitespace-separated terms are AND-ed.
 * @param maxHits - result cap (best hits first).
 * @param window - snippet half-width in characters around the first match.
 * @returns ranked hits: more total occurrences first, then earlier blocks.
 */
export function searchBlocks(
  blocks: readonly BlockText[],
  query: string,
  maxHits = 5,
  window = 140
): SearchHit[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []

  const hits: SearchHit[] = []
  for (const block of blocks) {
    const lower = block.text.toLowerCase()
    const present = terms.filter((term) => lower.includes(term))
    // AND semantics: every query term must appear in the block.
    if (present.length < terms.length) continue
    const matches = present.reduce((sum, term) => sum + countOccurrences(lower, term), 0)
    const firstTerm = present[0]!
    const at = lower.indexOf(firstTerm)
    hits.push({
      block: block.index,
      locator: block.locator,
      snippet: makeSnippet(block.text, at, firstTerm.length, window),
      matches
    })
  }

  hits.sort((a, b) => b.matches - a.matches || a.block - b.block)
  return hits.slice(0, maxHits)
}

/** One block's total query-term occurrences (used for result previews). */
export function countMatches(blockText: string, query: string): number {
  const terms = queryTerms(query)
  if (terms.length === 0) return 0
  const lower = blockText.toLowerCase()
  return terms.reduce((sum, term) => sum + countOccurrences(lower, term), 0)
}

/**
 * Build a readable snippet around a match: ±window characters, ellipses at
 * the cut edges, line breaks collapsed to spaces.
 */
export function makeSnippet(text: string, at: number, termLen: number, window: number): string {
  const start = Math.max(0, at - window)
  const end = Math.min(text.length, at + termLen + window)
  const lead = start > 0 ? '…' : ''
  const tail = end < text.length ? '…' : ''
  return `${lead}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${tail}`
}
