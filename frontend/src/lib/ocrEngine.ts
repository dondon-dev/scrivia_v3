/**
 * OCR Engine — converts scanned/image-only PDFs and standalone image files
 * (JPG, PNG, WebP, GIF) into text using Tesseract.js.
 *
 * Flow:
 *   1. Detect file type (PDF vs image).
 *   2a. PDF: load with pdfjs-dist, render each page to canvas at high DPI.
 *   2b. Image: load into an HTMLImageElement, draw to canvas.
 *   3. Preprocess: grayscale + Otsu adaptive threshold (binarize).
 *      This is the equivalent of PIL's implicit normalization that makes
 *      pytesseract work well on scanned docs — Tesseract.js needs it too.
 *   4. Run Tesseract.js OCR on each preprocessed canvas.
 *   5. Normalize common OCR misreads (0→O, 8→B, dashed variants, etc.).
 *   6. Return the full extracted text, ready for any parser.
 *
 * The module is self-contained and reusable — any import file handler can call
 * `extractTextFromScannedPdf(file)` or `extractTextFromImage(file)` directly,
 * or use the unified `extractTextWithOcr(file)` entry point.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface OcrPageResult {
  page: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  fullText: string;
  pages: OcrPageResult[];
  avgConfidence: number;
  totalPages: number;
  ocrUsed: boolean;
  fileType: 'pdf' | 'image';
}

export interface OcrProgressInfo {
  page: number;
  totalPages: number;
  percent: number;
  stage: string;
}

/**
 * Structured OCR error with a category and human-readable details so the
 * UI can show actionable guidance instead of "unknown error".
 */
export class OcrError extends Error {
  readonly category: OcrErrorCategory;
  readonly detail: string;

  constructor(category: OcrErrorCategory, detail: string) {
    super(`${category}: ${detail}`);
    this.name = 'OcrError';
    this.category = category;
    this.detail = detail;
  }
}

export type OcrErrorCategory =
  | 'worker-init'        // Tesseract worker failed to start
  | 'language-data'      // eng.traineddata could not be downloaded/found
  | 'pdf-load'           // pdfjs could not open the PDF
  | 'pdf-render'         // pdfjs could not render a page to canvas
  | 'canvas'             // canvas creation or drawing failed
  | 'image-load'         // image file could not be decoded
  | 'memory'             // browser memory limit exceeded
  | 'recognize'          // worker.recognize() threw
  | 'unknown';           // anything else

// ── File type detection ────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

export function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    IMAGE_MIME_TYPES.includes(file.type) ||
    IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))
  );
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

export function isOcrSupportedFile(file: File): boolean {
  return isImageFile(file) || isPdfFile(file);
}

// ── Debug logging ──────────────────────────────────────────────────────────

const DEBUG = true;

function debug(...args: unknown[]) {
  if (DEBUG) console.log('[OCR]', ...args);
}

function debugError(...args: unknown[]) {
  if (DEBUG) console.error('[OCR ERROR]', ...args);
}

// ── Image preprocessing ────────────────────────────────────────────────────

/**
 * Preprocess a canvas for OCR: convert to grayscale, then apply Otsu's
 * adaptive threshold to binarize the image into pure black/white.
 *
 * This mirrors what PIL + pytesseract do implicitly — scanned PDFs often
 * have gray backgrounds, shadows, or uneven lighting that confuse
 * Tesseract.js. Binarization dramatically improves recognition accuracy
 * on government plantilla reports.
 *
 * Algorithm:
 *   1. Read all pixels from the canvas.
 *   2. Convert to grayscale (luminance formula: 0.299R + 0.587G + 0.114B).
 *   3. Compute Otsu's threshold (optimal separation between text/bg).
 *   4. Binarize: pixels above threshold → white (255), below → black (0).
 *   5. Write processed pixels back to the canvas.
 */
function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Step 1: Convert to grayscale and build histogram
  const gray = new Uint8ClampedArray(width * height);
  const histogram = new Array(256).fill(0);

  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    const lum = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    gray[j] = lum;
    histogram[lum]++;
  }

  // Step 2: Otsu's method — find the threshold that maximizes between-class variance
  const totalPixels = width * height;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];

  let sumBg = 0;
  let weightBg = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;
    const weightFg = totalPixels - weightBg;
    if (weightFg === 0) break;

    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // Step 3: Binarize — text is dark (below threshold), background is light (above)
  // Add a small bias to the threshold to favor keeping faint text visible.
  const effectiveThreshold = Math.min(255, threshold + 10);

  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    const val = gray[j] < effectiveThreshold ? 0 : 255;
    pixels[i] = val;
    pixels[i + 1] = val;
    pixels[i + 2] = val;
    // alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);
  debug(`Preprocessed ${width}x${height}: Otsu threshold=${threshold}, effective=${effectiveThreshold}`);
}

/**
 * Convert any thrown value into an OcrError with the right category.
 * This is the single place where we interpret raw Tesseract/pdfjs errors.
 */
function classifyOcrError(err: unknown, fallback: OcrErrorCategory = 'unknown'): OcrError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  debugError('Original error:', err);

  // Tesseract language data issues
  if (lower.includes('failed loading language') || lower.includes('traineddata') || lower.includes('language')) {
    return new OcrError('language-data', raw);
  }
  // Worker initialization failures
  if (lower.includes('worker') && (lower.includes('init') || lower.includes('spawn') || lower.includes('load'))) {
    return new OcrError('worker-init', raw);
  }
  // Network / CORS issues
  if (lower.includes('cors') || lower.includes('network') || lower.includes('fetch') || lower.includes('404') || lower.includes('failed to fetch')) {
    return new OcrError('language-data', `Could not download OCR language data: ${raw}. This may be a network or CORS issue.`);
  }
  // Memory issues
  if (lower.includes('memory') || lower.includes('maximum call stack') || lower.includes('allocation') || lower.includes('out of memory')) {
    return new OcrError('memory', raw);
  }
  // PDF loading
  if (lower.includes('pdf') && (lower.includes('load') || lower.includes('parse') || lower.includes('invalid'))) {
    return new OcrError('pdf-load', raw);
  }
  // PDF rendering
  if (lower.includes('render') || lower.includes('canvas') || lower.includes('viewport')) {
    if (lower.includes('canvas')) {
      return new OcrError('canvas', raw);
    }
    return new OcrError('pdf-render', raw);
  }
  // Image decode
  if (lower.includes('image') && (lower.includes('load') || lower.includes('decode'))) {
    return new OcrError('image-load', raw);
  }

  return new OcrError(fallback, raw || 'No error message available');
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Lazy-load pdfjs-dist only when OCR is actually needed.
 * This keeps the main bundle small for text-based PDFs.
 */
async function loadPdfJs(): Promise<typeof import('pdfjs-dist')['getDocument']> {
  debug('Loading pdfjs-dist...');
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined') {
    const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
    debug('pdfjs worker src:', workerSrc.default);
  }
  debug('pdfjs-dist loaded.');
  return pdfjs.getDocument;
}

/**
 * Load an image File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      debug('Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new OcrError('image-load', `Could not decode image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Draw an HTMLImageElement to a canvas at a target scale, capping memory.
 * Returns the canvas (or null if the context is unavailable).
 */
function imageToCanvas(img: HTMLImageElement, scale: number): HTMLCanvasElement | null {
  const targetWidth = Math.round(img.naturalWidth * scale);
  const targetHeight = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Fix common OCR misreads in Roman numeral suffixes of position titles.
 * OCR frequently misreads:
 *   l  → I  (lowercase L as capital I)
 *   Ill → III (lowercase L's as I's)
 *   lV → IV
 *   Vl → VI
 *   Xl → XI
 *   ll → II
 */
function fixRomanNumeral(raw: string): string {
  return raw
    .replace(/l/g, 'I')  // lowercase L → capital I (most common OCR error)
    .replace(/i/g, 'I')  // lowercase i → capital I
    .replace(/v/g, 'V')
    .replace(/x/g, 'X')
    .toUpperCase();
}

/**
 * Common OCR character-level misreads seen in government plantilla reports.
 * Applied AFTER raw OCR text is collected, BEFORE returning to the caller.
 *
 * We intentionally keep this conservative — only fixing patterns that are
 * unambiguous in the PSIPOP/DepEd context (e.g. "0SEC" → "OSEC", "DECS8" → "DECSB").
 */
export function normalizeOcrText(text: string): string {
  return text
    // OSEC misreads: zero-for-O, O-for-zero, S-for-5
    .replace(/\b0SEC\b/g, 'OSEC')
    .replace(/\bO5EC\b/g, 'OSEC')
    .replace(/\bOS[C<]\b/g, 'OSEC')
    // DECSB misreads: 8-for-B
    .replace(/DEC[S8][B8]/g, 'DECSB')
    .replace(/DECS8/g, 'DECSB')
    // TCH1 misreads
    .replace(/\bTCH[lI|]\b/g, 'TCH1')
    .replace(/\bTCH\s*1\b/g, 'TCH1')
    // Roman numeral OCR misreads in position titles: l→I, Ill→III, lV→IV, Vl→VI, etc.
    // Only apply to standalone tokens that look like Roman numerals (2-4 chars, mix of I/V/X/L wrong)
    .replace(/\bTEACHER\s+([IlvVX]{1,4})\b/gi, (m, rn) => `TEACHER ${fixRomanNumeral(rn)}`)
    .replace(/\bMASTER\s+TEACHER\s+([IlvVX]{1,4})\b/gi, (m, rn) => `MASTER TEACHER ${fixRomanNumeral(rn)}`)
    .replace(/\bHEAD\s+TEACHER\s+([IlvVX]{1,4})\b/gi, (m, rn) => `HEAD TEACHER ${fixRomanNumeral(rn)}`)
    .replace(/\bSCHOOL\s+PRINCIPAL\s+([IlvVX]{1,4})\b/gi, (m, rn) => `SCHOOL PRINCIPAL ${fixRomanNumeral(rn)}`)
    .replace(/\bADMINISTRATIVE\s+OFFICER\s+([IlvVX]{1,4})\b/gi, (m, rn) => `ADMINISTRATIVE OFFICER ${fixRomanNumeral(rn)}`)
    .replace(/\bADMINISTRATIVE\s+ASSISTANT\s+([IlvVX]{1,4})\b/gi, (m, rn) => `ADMINISTRATIVE ASSISTANT ${fixRomanNumeral(rn)}`)
    .replace(/\bEDUCATION\s+PROGRAM\s+SPECIALIST\s+([IlvVX]{1,4})\b/gi, (m, rn) => `EDUCATION PROGRAM SPECIALIST ${fixRomanNumeral(rn)}`)
    .replace(/\bGUIDANCE\s+COUNSELOR\s+([IlvVX]{1,4})\b/gi, (m, rn) => `GUIDANCE COUNSELOR ${fixRomanNumeral(rn)}`)
    .replace(/\bSPECIAL\s+EDUCATION\s+TEACHER\s+([IlvVX]{1,4})\b/gi, (m, rn) => `SPECIAL EDUCATION TEACHER ${fixRomanNumeral(rn)}`)
    // En-dash and em-dash → hyphen
    .replace(/[–—]/g, '-')
    // Collapse multiple spaces
    .replace(/ {3,}/g, '  ')
    // Fix broken hyphenated item numbers split across spaces
    .replace(/\bOSEC\s*[-]?\s*DECSB\s*[-]?\s*/gi, 'OSEC-DECSB-')
    // Remove trailing/leading whitespace per line
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
}

// ── Tesseract worker factory ───────────────────────────────────────────────

/**
 * Create a Tesseract.js worker with proper error handling and debug logging.
 *
 * Tesseract.js v7 downloads `eng.traineddata` from a CDN by default.
 * If the CDN is unreachable (network/CORS), createWorker throws
 * "Failed loading language 'eng'" — we classify this as a language-data error.
 */
/**
 * Build an absolute URL pointing to our locally bundled /tessdata/ directory.
 *
 * Tesseract.js v7 runs OCR inside a Web Worker. By default it wraps the worker
 * script in a blob: URL (workerBlobURL=true), which changes the worker's origin
 * to null — so any relative path like "/tessdata" fails to resolve. And by
 * default it fetches language data + core WASM from CDNs that are often blocked.
 *
 * The fix: use absolute URLs (origin + path) for all three resources, and set
 * workerBlobURL=false so the worker keeps our origin and can fetch them.
 */
function tessdataBaseUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/tessdata`;
}

async function createOcrWorker(): Promise< Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> > {
  debug('Creating Tesseract.js worker (lang=eng)...');

  let Tesseract: typeof import('tesseract.js');
  try {
    Tesseract = await import('tesseract.js');
    debug('tesseract.js module loaded.');
  } catch (err) {
    throw classifyOcrError(err, 'worker-init');
  }

  const base = tessdataBaseUrl();
  debug(`Using local tessdata base URL: ${base}`);

  let worker;
  try {
    // All three Tesseract resources are loaded from our local /public/tessdata/
    // directory using absolute URLs — no CDN dependency at all.
    //
    //   langPath       → Tesseract fetches `${langPath}/eng.traineddata.gz`
    //   workerPath     → the Web Worker script (worker.min.js)
    //   corePath       → the WASM bridge (tesseract-core-simd-lstm.wasm.js)
    //   workerBlobURL  → false: don't wrap worker in a blob, so it keeps our
    //                    origin and relative fetches inside it resolve correctly
    worker = await Tesseract.createWorker('eng', 1, {
      langPath: base,
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/tesseract-core-simd-lstm.wasm.js`,
      workerBlobURL: false,
      logger: (m: unknown) => {
        if (DEBUG && typeof m === 'object' && m !== null && 'status' in m) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status = (m as any).status;
          const progress = typeof (m as any).progress === 'number' ? Math.round((m as any).progress * 100) : '';
          debug(`Tesseract worker: ${status}${progress !== '' ? ` (${progress}%)` : ''}`);
        }
      },
    });
    debug('Tesseract worker created successfully (all resources local).');
  } catch (err) {
    throw classifyOcrError(err, 'language-data');
  }

  // PSM 6 = uniform block of text — works well for tabular reports.
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    debug('Worker parameters set (PSM=6, preserve_spaces=1).');
  } catch (err) {
    debugError('Failed to set worker parameters (non-fatal):', err);
    // Non-fatal — continue with default parameters.
  }

  return worker;
}

// ── Public API: PDF OCR ────────────────────────────────────────────────────

/**
 * Extract text from a scanned/image PDF by rendering pages to canvas and
 * running Tesseract.js OCR.
 *
 * @param file      The PDF File to process
 * @param maxPages  Maximum pages to OCR (default 15, safety cap)
 * @param onProgress Optional callback for progress updates
 * @returns         OcrResult with full text and per-page details
 */
export async function extractTextFromScannedPdf(
  file: File,
  maxPages = 15,
  onProgress?: (info: OcrProgressInfo) => void,
): Promise<OcrResult> {
  debug('Starting PDF OCR for:', file.name, `(${(file.size / 1024).toFixed(0)} KB)`);

  // Step 1: Load the PDF
  let pdf;
  try {
    const arrayBuffer = await file.arrayBuffer();
    debug('PDF arrayBuffer loaded:', arrayBuffer.byteLength, 'bytes');
    const getDocument = await loadPdfJs();
    pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    debug('PDF loaded. Pages:', pdf.numPages);
  } catch (err) {
    throw classifyOcrError(err, 'pdf-load');
  }

  const totalPages = Math.min(pdf.numPages, maxPages);
  if (totalPages === 0) {
    debug('PDF has 0 pages — nothing to OCR.');
    try { await pdf.destroy(); } catch { /* cleanup */ }
    return {
      fullText: '',
      pages: [],
      avgConfidence: 0,
      totalPages: 0,
      ocrUsed: true,
      fileType: 'pdf',
    };
  }
  debug(`Will OCR ${totalPages} page(s) (cap: ${maxPages}).`);

  // Step 2: Create OCR worker
  const worker = await createOcrWorker();

  // Step 3: Render + OCR each page
  const pages: OcrPageResult[] = [];
  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.({
        page: i,
        totalPages,
        percent: Math.round(((i - 1) / totalPages) * 100),
        stage: `Rendering page ${i} of ${totalPages}`,
      });

      // Render page to canvas
      let canvas: HTMLCanvasElement;
      try {
        const page = await pdf.getPage(i);
        // 2.0x scale for good OCR accuracy without excessive memory.
        // Previous 4.0x created ~31MB canvases per page (2448x3168) which
        // crashed browser tabs on multi-page PDFs.
        let scale = 2.0;
        let viewport = page.getViewport({ scale });
        // Cap canvas dimensions to prevent OOM — max 2000px on either side
        const MAX_DIM = 2000;
        if (viewport.width > MAX_DIM || viewport.height > MAX_DIM) {
          scale = scale * Math.min(MAX_DIM / viewport.width, MAX_DIM / viewport.height);
          viewport = page.getViewport({ scale });
        }

        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          debugError(`No 2d context for page ${i} — skipping.`);
          continue;
        }
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        debug(`Page ${i}: canvas ${canvas.width}x${canvas.height}px`);

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).promise;

        // Preprocess: grayscale + Otsu threshold for cleaner OCR
        preprocessCanvasForOcr(canvas);
      } catch (err) {
        throw classifyOcrError(err, 'pdf-render');
      }

      onProgress?.({
        page: i,
        totalPages,
        percent: Math.round(((i - 0.5) / totalPages) * 100),
        stage: `OCR reading page ${i} of ${totalPages}`,
      });

      // Run Tesseract OCR on the canvas
      try {
        debug(`Page ${i}: running Tesseract recognize()...`);
        const { data } = await worker.recognize(canvas);
        const text = data.text || '';
        const confidence = data.confidence ?? 0;
        debug(`Page ${i}: OCR done. ${text.length} chars, confidence: ${confidence.toFixed(1)}%`);

        const normalized = normalizeOcrText(text);
        pages.push({ page: i, text: normalized, confidence });
      } catch (err) {
        throw classifyOcrError(err, 'recognize');
      }

      onProgress?.({
        page: i,
        totalPages,
        percent: Math.round((i / totalPages) * 100),
        stage: `Completed page ${i}`,
      });
    }
  } finally {
    try {
      await worker.terminate();
      debug('Tesseract worker terminated.');
    } catch (err) {
      debugError('Failed to terminate worker (non-fatal):', err);
    }
    try {
      await pdf.destroy();
      debug('PDF document destroyed.');
    } catch (err) {
      debugError('Failed to destroy PDF (non-fatal):', err);
    }
  }

  const fullText = pages
    .map((p) => `\n--- PAGE ${p.page} ---\n${p.text}\n`)
    .join('');

  const avgConfidence =
    pages.length > 0
      ? Math.round(pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length)
      : 0;

  debug(`PDF OCR complete. ${pages.length} pages, avg confidence: ${avgConfidence}%`);

  return {
    fullText,
    pages,
    avgConfidence,
    totalPages: pdf.numPages,
    ocrUsed: true,
    fileType: 'pdf',
  };
}

// ── Public API: Image OCR ──────────────────────────────────────────────────

/**
 * Extract text from a standalone image file (JPG, PNG, WebP, GIF, BMP).
 * The image is drawn to a canvas at a scale that ensures readable OCR.
 *
 * @param file      The image File to process
 * @param onProgress Optional callback for progress updates
 * @returns         OcrResult with full text and confidence
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (info: OcrProgressInfo) => void,
): Promise<OcrResult> {
  debug('Starting image OCR for:', file.name, `(${(file.size / 1024).toFixed(0)} KB)`);
  onProgress?.({ page: 1, totalPages: 1, percent: 10, stage: 'Loading image...' });

  // Step 1: Load the image
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (err) {
    throw err instanceof OcrError ? err : classifyOcrError(err, 'image-load');
  }

  // Scale up small images so Tesseract can read them.
  // Target ~2000px wide for best accuracy/memory tradeoff.
  const targetWidth = 2000;
  const scale = img.naturalWidth < targetWidth ? targetWidth / img.naturalWidth : 1.5;
  debug(`Image scale: ${scale.toFixed(2)}x (natural: ${img.naturalWidth}x${img.naturalHeight})`);

  const canvas = imageToCanvas(img, scale);
  if (!canvas) throw new OcrError('canvas', 'Could not get 2d canvas context for OCR.');

  // Preprocess: grayscale + Otsu threshold for cleaner OCR
  preprocessCanvasForOcr(canvas);

  onProgress?.({ page: 1, totalPages: 1, percent: 40, stage: 'Running OCR on image...' });

  // Step 2: Create worker and run OCR
  const worker = await createOcrWorker();
  try {
    debug('Running Tesseract recognize() on image...');
    const { data } = await worker.recognize(canvas);
    const text = data.text || '';
    const confidence = data.confidence ?? 0;
    debug(`Image OCR done. ${text.length} chars, confidence: ${confidence.toFixed(1)}%`);

    const normalized = normalizeOcrText(text);

    onProgress?.({ page: 1, totalPages: 1, percent: 100, stage: 'OCR complete' });

    return {
      fullText: `\n--- IMAGE ${file.name} ---\n${normalized}\n`,
      pages: [{ page: 1, text: normalized, confidence }],
      avgConfidence: Math.round(confidence),
      totalPages: 1,
      ocrUsed: true,
      fileType: 'image',
    };
  } catch (err) {
    throw classifyOcrError(err, 'recognize');
  } finally {
    try {
      await worker.terminate();
      debug('Tesseract worker terminated.');
    } catch (err) {
      debugError('Failed to terminate worker (non-fatal):', err);
    }
  }
}

// ── Public API: Unified entry point ────────────────────────────────────────

/**
 * Unified OCR entry point — automatically detects file type and routes to
 * the appropriate OCR function (PDF or image).
 *
 * @param file       The file to OCR (PDF, JPG, PNG, WebP, GIF, BMP)
 * @param onProgress Optional progress callback
 * @returns          OcrResult with full text
 */
export async function extractTextWithOcr(
  file: File,
  onProgress?: (info: OcrProgressInfo) => void,
): Promise<OcrResult> {
  if (isImageFile(file)) {
    return extractTextFromImage(file, onProgress);
  }
  return extractTextFromScannedPdf(file, 15, onProgress);
}

// ── Public API: PDF text-layer detection ───────────────────────────────────

/**
 * Quick check: does a PDF have an extractable text layer?
 * Returns the count of text items on page 1. If 0, the PDF is likely
 * a scanned image and needs OCR.
 */
export async function getPdfTextLayerInfo(
  file: File,
): Promise<{ hasTextLayer: boolean; textItemCount: number; sample: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const getDocument = await loadPdfJs();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  if (pdf.numPages === 0) {
    return { hasTextLayer: false, textItemCount: 0, sample: '' };
  }

  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const textItems = content.items.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) => item.str && item.str.trim().length > 0,
  );

  const sample = textItems
    .slice(0, 30)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => item.str)
    .join(' ')
    .slice(0, 500);

  return {
    hasTextLayer: textItems.length > 0,
    textItemCount: textItems.length,
    sample,
  };
}
