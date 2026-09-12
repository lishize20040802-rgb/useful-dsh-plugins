/** The subset of the pdf.js module surface the panel uses. */
export interface PdfJsModule {
    GlobalWorkerOptions: {
        workerSrc: string;
    };
    getDocument(src: unknown): {
        promise: Promise<PdfDocument>;
    };
}
/** pdf.js PDFDocumentProxy subset. */
export interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
    destroy(): Promise<void>;
}
/** pdf.js PDFPageProxy subset. */
export interface PdfPage {
    getViewport(options: {
        scale: number;
    }): {
        width: number;
        height: number;
    };
    render(options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: {
            width: number;
            height: number;
        };
        transform?: number[];
    }): {
        promise: Promise<void>;
        cancel(): void;
    };
}
/** Load pdf.js once and configure its worker; returns the module. */
export declare function pdfjs(): Promise<PdfJsModule>;
/** PDF document options: cmaps and standard fonts from the static origin. */
export declare function pdfDocumentOptions(data: Uint8Array): unknown;
/**
 * Render one page into a canvas at the given CSS width (device-pixel aware).
 * @returns the rendered page's CSS height in pixels (for layout accounting).
 */
export declare function renderPdfPageToCanvas(page: PdfPage, canvas: HTMLCanvasElement, cssWidth: number, zoom: number): Promise<number>;
