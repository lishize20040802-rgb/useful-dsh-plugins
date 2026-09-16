/**
 * Render one PDF page to a PNG buffer.
 * @param docId - document id (cache key for the parsed PDF).
 * @param data - raw PDF bytes.
 * @param pageNumber - 1-based page number.
 * @returns PNG bytes, or null when rendering fails.
 */
export declare function renderPdfPagePng(docId: string, data: Uint8Array, pageNumber: number): Promise<Uint8Array | null>;
