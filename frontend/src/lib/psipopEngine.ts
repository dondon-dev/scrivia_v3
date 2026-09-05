import * as pdfjsLib from 'pdfjs-dist';
import { classifyPersonnelCategory, type PlantillaPosition } from './plantilla';
import { extractTextFromScannedPdf, normalizeOcrText, isImageFile, extractTextFromImage, OcrError, type OcrErrorCategory } from './ocrEngine';

// pdfjs-dist v4 relies on Promise.withResolvers (Chrome 119+, Safari 17.4+).
// Provide a minimal polyfill so PSIPOP PDF parsing keeps working on older
// government-office browsers.
if (typeof (Promise as unknown as Record<string, unknown>).withResolvers !== 'function') {
  // Minimal withResolvers polyfill for ES2020 runtimes (pre-Chrome 119).
  type WithResolvers<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
  (Promise as unknown as { withResolvers<T>(): WithResolvers<T> }).withResolvers =
    function withResolversPolyfill<T>(): WithResolvers<T> {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
}

// ── PDF.js Worker Setup ───────────────────────────────────────────────────
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── Types ─────────────────────────────────────────────────────────────────

export interface ExtractedPSIPOPResult {
  filename: string;
  totalExtracted: number;
  newPositions: PlantillaPosition[];
  updatedPositions: PlantillaPosition[];
  vacantPositions: PlantillaPosition[];
  filledPositions: PlantillaPosition[];
  duplicatesCount: number;
  invalidCount: number;
  rawTextPreview: string;
  positions: PlantillaPosition[];
  warnings: string[];
  errors: string[];
  expectedTotalRecords: number;
  importedRecords: number;
  mismatch: boolean;
  documentHeader?: PSIPOPDocumentHeader;
  /** Diagnostic info: how many text items were found, whether OCR was used, etc. */
  diagnostic?: {
    textItemCount: number;
    rawTextSample: string;
    strategiesTried: string[];
    ocrUsed: boolean;
    ocrSample?: string;
    ocrConfidence?: number;
    ocrErrorCategory?: OcrErrorCategory;
    ocrErrorDetail?: string;
  };
}

export interface PSIPOPDocumentHeader {
  fiscalYear: number;
  department: string;
  bureauAgency: string;
  divisionOffice: string;
  totalPositions: number;
  filledPositions: number;
  unfilledPositions: number;
  authorizedAmount: number;
  actualAmount: number;
  /** School/facility code from the header row (e.g., '1801' from '1801.0010 BUBUYAN INTEGRATED SCHOOL') */
  schoolCode?: string;
  /** School name from the header row */
  schoolName?: string;
}

// ── PSIPOP Layout Constants ───────────────────────────────────────────────
//
// PSIPOP PDFs use a COLUMN-PER-RECORD layout:
// Each employee record is a vertical column at a fixed X position.
// Fields are laid out in horizontal bands at fixed Y positions:
//
//   Y ≈  19  → Item Number (bottom of page)
//   Y ≈ 181  → Position Title + Salary Grade ("TEACHER I - 11")
//   Y ≈ 347  → Authorized Annual Salary
//   Y ≈ 402  → Actual Annual Salary
//   Y ≈ 440  → Step
//   Y ≈ 486  → Level
//   Y ≈ 497  → P/P/A Attribution
//   Y ≈ 567  → Name of Incumbent
//   Y ≈ 707  → Sex
//   Y ≈ 720  → Date of Birth
//   Y ≈ 755  → TIN
//   Y ≈ 821  → Date of Original Appointment
//   Y ≈ 876  → Date of Last Promotion
//   Y ≈ 946  → Civil Service Eligibility
//
// Column (6) AREA and (7) TYPE are at Y ≈ 456-471 (between STEP and LEVEL).

// Y-center for each field band (with tolerance)
const FIELD_BANDS = {
  itemNumber:        { y: 19,  tol: 8 },
  positionTitle:     { y: 181, tol: 6 },
  authorizedSalary:  { y: 347, tol: 8 },
  actualSalary:      { y: 402, tol: 6 },
  step:              { y: 440, tol: 5 },
  area:              { y: 447, tol: 5 },
  type:              { y: 471, tol: 5 },
  level:             { y: 486, tol: 5 },
  ppaAttribution:    { y: 497, tol: 6 },
  incumbentName:     { y: 567, tol: 8 },
  sex:               { y: 707, tol: 6 },
  birthDate:         { y: 720, tol: 6 },
  tin:               { y: 755, tol: 6 },
  origAppointment:   { y: 821, tol: 6 },
  lastPromotion:     { y: 876, tol: 6 },
  eligibility:       { y: 946, tol: 10 },
} as const;

// X positions for label columns (left side of page) — these are NOT data
const LABEL_X_MAX = 230; // Items with x < 230 are column labels/headers, not data

// ── Text item extraction ──────────────────────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Extract all text items with coordinates from a PDF page.
 */
async function extractPageItems(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<TextItem[]> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();

  return content.items
    .filter((it) => 'str' in it)
    .filter((it) => it.str && it.str.trim().length > 0)
    .map((it) => ({
      str: it.str.trim(),
      x: it.transform[4],
      y: it.transform[5],
      width: it.width || 0,
    }));
}

/**
 * Load a PDF document from an ArrayBuffer, with fallback to disableWorker mode.
 */
async function loadPdfDocument(arrayBuffer: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy | null> {
  const data = new Uint8Array(arrayBuffer.slice(0));

  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    return await loadingTask.promise;
  } catch (err) {
    console.warn('PDF.js standard loading failed, retrying without worker:', err);
    const data2 = new Uint8Array(arrayBuffer.slice(0));
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: data2,
        disableWorker: true,
        useSystemFonts: true,
      } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
      return await loadingTask.promise;
    } catch (err2) {
      console.warn('PDF.js disableWorker also failed:', err2);
      return null;
    }
  }
}

// ── Field extraction helpers ──────────────────────────────────────────────

/**
 * Reconstruct full item numbers from text fragments that may be split
 * across multiple PDF text items at the same Y position.
 * Handles cases where "OSEC-DECSB-" and "TCH1-270096-2023" are separate
 * text runs, and where spaces appear around hyphens.
 */
function reconstructItemNumbersInBand(bandItems: TextItem[]): { x: number; itemNumber: string }[] {
  // Group items by Y proximity (within 4px), then join left-to-right within each group
  const sorted = [...bandItems].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const grp = groups.find((g) => Math.abs(g.y - it.y) <= 4);
    if (grp) grp.items.push(it);
    else groups.push({ y: it.y, items: [it] });
  }

  const results: { x: number; itemNumber: string }[] = [];
  for (const grp of groups) {
    // Join all fragments in this row, then search for item numbers
    const joined = grp.items.map((it) => it.str).join('').replace(/\s+/g, '');
    // Match OSEC-DECSB-XXXXX-DDDD-DDDD or OSEC-DECSB-XXXXX-DDDD-DD-DDDD etc.
    const matches = [...joined.matchAll(/OSEC-DECSB-[A-Z0-9]+-\d{4,7}(?:-\d{2,4})?/gi)];
    for (const m of matches) {
      // Find the X position of the first fragment that contains "OSEC"
      const osecItem = grp.items.find((it) => /OSEC/i.test(it.str));
      results.push({ x: osecItem?.x ?? grp.items[0].x, itemNumber: m[0].toUpperCase() });
    }
    // Also try with spaces around hyphens (some PDFs render "OSEC - DECSB - TCH1 - 270096 - 2023")
    const spaced = grp.items.map((it) => it.str).join(' ');
    const spacedMatches = [...spaced.matchAll(/OSEC\s*-?\s*DECSB\s*-?\s*([A-Z0-9]+)\s*-?\s*(\d{4,7})\s*-?\s*(\d{2,4})?/gi)];
    for (const m of spacedMatches) {
      const full = `OSEC-DECSB-${m[1]}-${m[2]}${m[3] ? '-' + m[3] : ''}`;
      if (!results.some((r) => r.itemNumber === full.toUpperCase())) {
        const osecItem = grp.items.find((it) => /OSEC/i.test(it.str));
        results.push({ x: osecItem?.x ?? grp.items[0].x, itemNumber: full.toUpperCase() });
      }
    }
  }
  return results;
}

/**
 * Find all data-column X positions by locating OSEC-DECSB- item numbers.
 * Searches ALL text items on the page (not just at Y≈19) because some PSIPOP
 * PDFs place item numbers at different Y positions or split them across
 * text fragments.
 * Returns sorted unique X anchor positions.
 */
function findDataColumnXPositions(items: TextItem[]): number[] {
  // Strategy 1: Direct match of single fragments starting with OSEC-DECSB-
  const directXs = items
    .filter((it) => /OSEC-DECSB-/i.test(it.str))
    .map((it) => it.x);

  // Strategy 2: Reconstruct from fragments across the entire page
  // Group all items into rows and look for item numbers formed by joining fragments
  const reconstructed = reconstructItemNumbersInBand(items);
  const reconXs = reconstructed.map((r) => r.x);

  const allXs = [...directXs, ...reconXs].sort((a, b) => a - b);

  // Deduplicate with 10px tolerance
  const unique: number[] = [];
  for (const x of allXs) {
    if (unique.length === 0 || Math.abs(x - unique[unique.length - 1]) > 10) {
      unique.push(x);
    }
  }
  return unique;
}

/**
 * Collect all text items at a given Y band, grouped by X column position.
 * Only includes items to the right of the label area (x > LABEL_X_MAX).
 */
function getItemsInBand(items: TextItem[], band: { y: number; tol: number }): TextItem[] {
  return items.filter(
    (it) => Math.abs(it.y - band.y) <= band.tol && it.x > LABEL_X_MAX
  );
}

/**
 * Assign items to column anchors by nearest X position.
 * Each item is assigned to the closest column anchor.
 */
function assignItemsToColumns(
  bandItems: TextItem[],
  columnXs: number[]
): Map<number, string> {
  const result = new Map<number, string>();
  for (const x of columnXs) result.set(x, '');

  for (const item of bandItems) {
    // Find nearest column anchor
    let nearestX = columnXs[0];
    let minDist = Math.abs(item.x - columnXs[0]);
    for (const cx of columnXs) {
      const dist = Math.abs(item.x - cx);
      if (dist < minDist) {
        minDist = dist;
        nearestX = cx;
      }
    }
    // Only assign if within 20px of a column anchor
    if (minDist <= 20) {
      const existing = result.get(nearestX) || '';
      result.set(nearestX, existing ? existing + ' ' + item.str : item.str);
    }
  }

  // Clean up
  for (const [key, val] of result) {
    result.set(key, val.replace(/\s+/g, ' ').trim());
  }

  return result;
}

/**
 * Extract salary grade from position title text.
 * PSIPOP position titles end with "- NN" where NN is the salary grade.
 * Example: "TEACHER I - 11" → title="TEACHER I", grade=11
 */
function extractSalaryGradeFromTitle(titleRaw: string): { title: string; salaryGrade: number } {
  if (!titleRaw) return { title: 'Unknown', salaryGrade: 0 };

  let title = titleRaw.trim();
  let salaryGrade = 0;

  // Pattern 1: "TEACHER | - 11 ..." — pipe separates title from SG and data fields
  const pipeMatch = title.match(/^(.*?)\s*\|\s*-\s*(\d{1,2})\b/i);
  if (pipeMatch) {
    title = pipeMatch[1].trim();
    const num = parseInt(pipeMatch[2], 10);
    if (num >= 1 && num <= 33) salaryGrade = num;
  }

  // Pattern 2: "TEACHER III - 13 433,500 ..." — title followed by " - SG" then data fields
  if (salaryGrade === 0) {
    const midMatch = title.match(/^(.+?)\s+-\s+(\d{1,2})\s+[\d,]+/);
    if (midMatch) {
      const num = parseInt(midMatch[2], 10);
      if (num >= 1 && num <= 33) {
        salaryGrade = num;
        title = midMatch[1].trim();
      }
    }
  }

  // Pattern 3: "TEACHER I - 11" or "SCHOOL PRINCIPAL IV - 22" (title only, no trailing data)
  if (salaryGrade === 0) {
    const sgMatch = title.match(/-\s*(\d{1,2})\s*$/);
    if (sgMatch) {
      const num = parseInt(sgMatch[1], 10);
      if (num >= 1 && num <= 33) {
        salaryGrade = num;
        title = title.replace(/-\s*\d{1,2}\s*$/, '').trim();
      }
    }
  }

  // Fallback: infer from position title keywords
  if (salaryGrade === 0) {
    const upper = title.toUpperCase();
    if (upper.includes('TEACHER I') || upper.includes('TCH1') || upper.includes('TCHR1')) salaryGrade = 11;
    else if (upper.includes('TEACHER II') || upper.includes('TCH2') || upper.includes('TCHR2')) salaryGrade = 12;
    else if (upper.includes('TEACHER III') || upper.includes('TCH3') || upper.includes('TCHR3')) salaryGrade = 13;
    else if (upper.includes('MASTER TEACHER I') || upper.includes('MTCH1') || upper.includes('MTCHR1')) salaryGrade = 18;
    else if (upper.includes('MASTER TEACHER II') || upper.includes('MTCH2') || upper.includes('MTCHR2')) salaryGrade = 19;
    else if (upper.includes('MASTER TEACHER III') || upper.includes('MTCH3')) salaryGrade = 20;
    else if (upper.includes('SCHOOL PRINCIPAL I') || upper.includes('SP1') || upper.includes('PRN1')) salaryGrade = 19;
    else if (upper.includes('SCHOOL PRINCIPAL II') || upper.includes('SP2') || upper.includes('PRN2')) salaryGrade = 20;
    else if (upper.includes('SCHOOL PRINCIPAL III') || upper.includes('SP3') || upper.includes('PRN3')) salaryGrade = 21;
    else if (upper.includes('SCHOOL PRINCIPAL IV') || upper.includes('SP4') || upper.includes('PRN4')) salaryGrade = 22;
    else if (upper.includes('HEAD TEACHER I') || upper.includes('HTEACH1')) salaryGrade = 14;
    else if (upper.includes('HEAD TEACHER II') || upper.includes('HTEACH2')) salaryGrade = 15;
    else if (upper.includes('HEAD TEACHER III') || upper.includes('HTEACH3')) salaryGrade = 16;
    else if (upper.includes('HEAD TEACHER IV') || upper.includes('HTEACH4')) salaryGrade = 17;
    else if (upper.includes('HEAD TEACHER V') || upper.includes('HTEACH5')) salaryGrade = 17;
    else if (upper.includes('ADMINISTRATIVE OFFICER V') || upper.includes('ADOF5')) salaryGrade = 18;
    else if (upper.includes('ADMINISTRATIVE OFFICER II') || upper.includes('ADOF2')) salaryGrade = 11;
    else if (upper.includes('ADMINISTRATIVE ASSISTANT III') || upper.includes('ADAS3')) salaryGrade = 9;
    else if (upper.includes('EDUCATION PROGRAM SPECIALIST')) salaryGrade = 16;
    else if (upper.includes('GUIDANCE COUNSELOR I') || upper.includes('GC1')) salaryGrade = 11;
    else if (upper.includes('SPECIAL EDUCATION TEACHER I') || upper.includes('SPET1')) salaryGrade = 14;
  }

  title = title.replace(/^[-,\s|]+/, '').replace(/[-,\s|]+$/, '').trim();
  if (!title) title = 'Unknown';

  return { title, salaryGrade };
}

/**
 * Parse a structured PSIPOP text line using the pipe-separated format:
 *   TITLE | - SG  AuthSalary  ActualSalary  Step  AreaCode  AreaType  Level  PPA  Name  Sex  BirthDate  TIN  OrigApt  LastPromo  Status  Eligibility
 * Returns null if the line doesn't match this structured format.
 */
function parseStructuredPSIPOPLine(text: string): {
  positionTitle: string;
  salaryGrade: number;
  authorizedSalary: number;
  actualSalary: number;
  step: number;
  areaCode: string;
  areaType: string;
  level: string;
  ppaAttribution: string;
  incumbentName: string;
  sex: 'Male' | 'Female' | '';
  birthDate: string;
  tin: string;
  originalAppointmentDate: string;
  lastPromotionDate: string;
  status: string;
  eligibility: string;
} | null {
  // Data fields regex (shared by both formats):
  // SG  AuthSalary  ActualSalary  Step  AreaCode  AreaType  Level  PPA  Name  Sex  BirthDate  TIN  OrigApt  LastPromo  Status  Eligibility
  // Name is non-greedy — it ends at the sex char (M/F) followed by a date.
  const dataRegex = /^(\d{1,2})\s+([\d,]+)\s+([\d,]+)\s+(\d{1,2})\s+(\d{3})\s+([A-Za-z])\s+([A-Za-z])\s+(\d{15})\s+(.+?)\s+([MF])\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{9,12})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Za-z])\s+(.+)$/i;

  let titlePart = '';
  let dataPart = '';

  const pipeIdx = text.indexOf('|');
  if (pipeIdx >= 0) {
    // Format 1 (with pipe): "TITLE | - SG  data..."
    titlePart = text.slice(0, pipeIdx).trim();
    dataPart = text.slice(pipeIdx + 1).replace(/^[-\s]+/, '').trim();
  } else {
    // Format 2 (no pipe): "TITLE - SG  AuthSalary ..."
    // The title ends at " - " followed by a 1-2 digit SG and two salary numbers
    const titleMatch = text.match(/^(.+?)\s+-\s+(\d{1,2}\s+[\d,]+\s+[\d,]+\s+\d{1,2}\s+\d{3}\s+[A-Za-z]\s+[A-Za-z]\s+\d{15}\s+.+)$/);
    if (titleMatch) {
      titlePart = titleMatch[1].trim();
      dataPart = titleMatch[2].trim();
    } else {
      return null;
    }
  }

  const m = dataPart.match(dataRegex);
  if (!m) return null;

  return {
    positionTitle: titlePart.replace(/^[-,\s|]+/, '').replace(/[-,\s|]+$/, '').trim(),
    salaryGrade: parseInt(m[1], 10),
    authorizedSalary: parseSalaryValue(m[2]),
    actualSalary: parseSalaryValue(m[3]),
    step: parseInt(m[4], 10),
    areaCode: m[5],
    areaType: m[6].toUpperCase(),
    level: m[7].toUpperCase(),
    ppaAttribution: m[8],
    incumbentName: m[9].trim(),
    sex: m[10].toUpperCase() === 'M' ? 'Male' : 'Female',
    birthDate: normalizeDate(m[11]),
    tin: m[12],
    originalAppointmentDate: normalizeDate(m[13]),
    lastPromotionDate: normalizeDate(m[14]),
    status: m[15].toUpperCase(),
    eligibility: m[16].trim(),
  };
}

/**
 * Normalize date: convert 2-digit years to 4-digit, pad month/day.
 * Input: "10/19/92" → Output: "10/19/1992"
 */
function normalizeDate(rawDate: string): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();

  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, dy, yr] = m;
    if (yr.length === 2) {
      const n = parseInt(yr, 10);
      yr = n > 30 ? '19' + yr : '20' + yr;
    }
    mo = mo.padStart(2, '0');
    dy = dy.padStart(2, '0');
    return `${mo}/${dy}/${yr}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const m2 = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    let [, mo, dy, yr] = m2;
    if (yr.length === 2) {
      const n = parseInt(yr, 10);
      yr = n > 30 ? '19' + yr : '20' + yr;
    }
    mo = mo.padStart(2, '0');
    dy = dy.padStart(2, '0');
    return `${mo}/${dy}/${yr}`;
  }

  return trimmed;
}

/**
 * Parse a salary value string like "360,288" or "360288" into a number.
 */
function parseSalaryValue(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,\s]/g, '').replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── School code extraction ────────────────────────────────────────────────

const SCHOOL_NAME_TAILS =
  /\b(?:SCHOOL|CENTER|CENTRAL|OFFICE|HOSPITAL|CLINIC|ANNEX|CAMPUS|INSTITUTE|INSTITUTION|ACADEMY)\b/i;

/**
 * Extract the school/facility code and name from a PSIPOP header row like
 * "1801.0010 BUBUYAN INTEGRATED SCHOOL". Tolerates the sheet-number suffix
 * being separated by a period or whitespace (common in OCR output) and headers
 * that are wrapped across lines. Returns an empty code when nothing matches.
 */
function extractSchoolCodeFromText(text: string): { code: string; name: string } {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer a clean line that STARTS with the code (optionally after a label).
  for (const line of lines) {
    const m = line.match(
      /^(?:SCHOOL(?:\s*[/\\]\s*FACILITY)?\s*[:\-–—]\s*)?(\d{4})(?:[.\s](\d{4}))?\s+([A-Z][A-Z0-9\s.,'()\-/&+#]*)/i
    );
    if (!m) continue;
    const name = m[3].trim().replace(/\s+\d{4}\s*$/, '').trim();
    if (name.length < 5) continue;
    if (!SCHOOL_NAME_TAILS.test(name) && !/\b(?:INTEGRATED|ELEMENTARY|PRIMARY|NATIONAL|MARITIME|TECHNOLOGY)\b/i.test(name)) continue;
    return { code: m[2] ? `${m[1]}.${m[2]}` : m[1], name };
  }

  // Fall back to a loose full-text scan for OCR output that merges or wraps
  // the header, so a re-import still populates the school code.
  const loose = String(text ?? '').match(
    /\b(\d{4})(?:[.\s](\d{4}))?\s+([A-Z][A-Z\s.,'()\-/&+#]{5,}(?:SCHOOL|CENTER|CENTRAL|OFFICE|HOSPITAL|CLINIC|ANNEX|CAMPUS|INSTITUTE))/i
  );
  if (loose) return { code: loose[2] ? `${loose[1]}.${loose[2]}` : loose[1], name: loose[3].trim().replace(/\s+/g, ' ') };

  return { code: '', name: '' };
}

// ── Document header extraction ────────────────────────────────────────────

/**
 * Extract the PSIPOP document header from the first page:
 * Fiscal Year, Department, Bureau/Agency, Office/Division,
 * Total/Filled/Unfilled Positions, Authorized/Actual Amount.
 *
 * IMPORTANT: In multi-page PSIPOP PDFs, the "Total Positions:" label often
 * has NO number next to it — the value is a PDF form field, not text.
 * The authoritative total comes from "Record No. 1 - 12 of 1950" which
 * appears on every page. Grand total amounts come from the last page's
 * "Grand Total" row.
 */
function extractDocumentHeader(allItems: TextItem[]): PSIPOPDocumentHeader {
  const getText = (pred: (it: TextItem) => boolean) => {
    const found = allItems.filter(pred);
    return found.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
  };

  // Fiscal Year: "for the Fiscal Year : 2025"
  const fyText = getText((it) => /fiscal year/i.test(it.str));
  const fyMatch = fyText.match(/(\d{4})/);
  const fiscalYear = fyMatch ? parseInt(fyMatch[1], 10) : new Date().getFullYear();

  // Department: "Department of Education"
  const deptText = getText((it) => /Department of Education/i.test(it.str));
  const department = deptText || 'Department of Education';

  // Bureau/Agency: "Bureau/Agency: Office of the Secretary"
  const bureauText = getText((it) => /Bureau\/Agency/i.test(it.str));
  const bureauAgency = bureauText.replace(/Bureau\/Agency:\s*/i, '').trim() || 'Office of the Secretary';

  // Office/Division — text near y=90-95, x>200
  const officeItems = allItems
    .filter((it) => it.y >= 85 && it.y <= 100 && it.x > 200)
    .sort((a, b) => a.x - b.x);
  const divisionOffice = officeItems.map((it) => it.str).join(' ').trim() || 'N/A';

  // Total Positions — authoritative source is "Record No. 1 - 12 of 1950"
  // This text appears on every page and contains the true document total.
  let totalPositions = 0;
  const recordNoText = getText((it) => /Record No/i.test(it.str));
  const recordNoMatch = recordNoText.match(/of\s+(\d+)/i);
  if (recordNoMatch) {
    totalPositions = parseInt(recordNoMatch[1], 10);
  }

  // Fallback: look for a number near "Total Positions:" label (same Y, to the right)
  if (totalPositions === 0) {
    const totalLabelItem = allItems.find((it) => /Total Positions/i.test(it.str));
    if (totalLabelItem) {
      const nearbyNum = allItems
        .filter((it) => Math.abs(it.y - totalLabelItem.y) < 10 && it.x > totalLabelItem.x && /^\d+$/.test(it.str))
        .sort((a, b) => a.x - b.x)[0];
      if (nearbyNum) totalPositions = parseInt(nearbyNum.str, 10);
    }
  }

  // Filled / Unfilled — these are also PDF form fields with no text value
  // in many PSIPOP PDFs. We'll compute them from extracted data instead.
  let filledPositions = 0;
  let unfilledPositions = 0;
  const filledLabelItem = allItems.find((it) => /No\. of Filled Positions/i.test(it.str));
  if (filledLabelItem) {
    const nearbyNum = allItems
      .filter((it) => Math.abs(it.y - filledLabelItem.y) < 10 && it.x > filledLabelItem.x && /^\d+$/.test(it.str))
      .sort((a, b) => a.x - b.x)[0];
    if (nearbyNum) filledPositions = parseInt(nearbyNum.str, 10);
  }
  const unfilledLabelItem = allItems.find((it) => /No\. of Unfilled Positions/i.test(it.str));
  if (unfilledLabelItem) {
    const nearbyNum = allItems
      .filter((it) => Math.abs(it.y - unfilledLabelItem.y) < 10 && it.x > unfilledLabelItem.x && /^\d+$/.test(it.str))
      .sort((a, b) => a.x - b.x)[0];
    if (nearbyNum) unfilledPositions = parseInt(nearbyNum.str, 10);
  }

  // Authorized/Actual Amount: per-page subtotal appears near the "Subtotal" label.
  // The true grand total is on the last page near "Grand Total" — but we only
  // have first-page items here, so we use the subtotal as a per-page estimate.
  // The grand total is enriched later via enrichDocumentHeaderWithLastPage().
  const subtotalItem = allItems.find((it) => /^Subtotal$/i.test(it.str));
  let authorizedAmount = 0;
  let actualAmount = 0;
  if (subtotalItem) {
    const sameRowItems = allItems
      .filter((it) => Math.abs(it.y - subtotalItem.y) < 15 && it.x > subtotalItem.x)
      .sort((a, b) => a.x - b.x);
    const nums = sameRowItems.filter((it) => /^[\d,]+$/.test(it.str));
    if (nums.length >= 1) authorizedAmount = parseSalaryValue(nums[0].str);
    if (nums.length >= 2) actualAmount = parseSalaryValue(nums[1].str);
  }

  // School code — appears as a header row like '1801.0010 BUBUYAN INTEGRATED SCHOOL'
  // (e.g. near y=110-120, left-aligned). Try the standard band first, then scan
  // every row of the first page so PSIPOP variants that place the school header
  // elsewhere still populate the school code.
  let schoolCode = '';
  let schoolName = '';
  const schoolHeaderItems = allItems
    .filter((it) => it.y >= 105 && it.y <= 125 && it.x < 200)
    .sort((a, b) => a.x - b.x);
  const schoolHeaderText = schoolHeaderItems.map((it) => it.str).join(' ').trim();
  const bandMatch = extractSchoolCodeFromText(schoolHeaderText);
  if (bandMatch.code) {
    schoolCode = bandMatch.code;
    schoolName = bandMatch.name;
  }

  // Fallback 2: scan every row of the first page for school code patterns.
  // Some PSIPOP variants place the school code at the bottom of the page
  // next to the item numbers (Y ≈ 15-30), e.g. "1801.0011" without a school name.
  if (!schoolCode) {
    for (const row of groupItemsIntoRows(allItems, 6)) {
      const rowText = row.items
        .filter((it) => it.x < 600)
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!rowText) continue;
      // Try full school header first (code + name)
      const found = extractSchoolCodeFromText(rowText);
      if (found.code) { schoolCode = found.code; schoolName = found.name; break; }
      // Also try standalone school code pattern (e.g. "1801.0011" at item-number row)
      const codeOnly = rowText.match(/\b(\d{4})(?:[.](\d{4}))\b/);
      if (codeOnly) {
        schoolCode = codeOnly[2] ? `${codeOnly[1]}.${codeOnly[2]}` : codeOnly[1];
        break;
      }
    }
  }

  return {
    fiscalYear,
    department,
    bureauAgency,
    divisionOffice,
    totalPositions,
    filledPositions,
    unfilledPositions,
    authorizedAmount,
    actualAmount,
    schoolCode,
    schoolName,
  };
}

/**
 * Enrich the document header with grand total amounts from the last page.
 * The last page contains a "Grand Total" row with the document-wide totals.
 */
function enrichDocumentHeaderWithLastPage(
  header: PSIPOPDocumentHeader,
  lastPageItems: TextItem[],
  extractedCount: number,
  filledCount: number
): PSIPOPDocumentHeader {
  // If totalPositions is still 0, use the Record No. from the last page
  let totalPositions = header.totalPositions;
  if (totalPositions === 0) {
    const recordNoText = lastPageItems
      .filter((it) => /Record No/i.test(it.str))
      .map((it) => it.str)
      .join(' ');
    const match = recordNoText.match(/of\s+(\d+)/i);
    if (match) totalPositions = parseInt(match[1], 10);
  }
  // Final fallback: use actual extracted count
  if (totalPositions === 0) totalPositions = extractedCount;

  // Grand total amounts: look for "Grand Total" label on the last page
  let authorizedAmount = header.authorizedAmount;
  let actualAmount = header.actualAmount;
  const grandTotalItem = lastPageItems.find((it) => /Grand Total/i.test(it.str));
  if (grandTotalItem) {
    // Grand total amounts appear at specific Y positions:
    // Authorized grand total at Y ≈ 343-359, actual at Y ≈ 280-300.
    // Pick the LARGEST value in each band — grand totals are always the
    // largest amount; per-record salaries on the last page are much smaller.
    const authorizedNums = lastPageItems
      .filter((it) => Math.abs(it.y - 347) <= 15 && it.x > 230 && /^[\d,]+$/.test(it.str))
      .map((it) => parseSalaryValue(it.str));
    const actualNums = lastPageItems
      .filter((it) => (Math.abs(it.y - 287) <= 15 || Math.abs(it.y - 296) <= 15) && it.x > 230 && /^[\d,]+$/.test(it.str))
      .map((it) => parseSalaryValue(it.str));
    if (authorizedNums.length > 0) authorizedAmount = Math.max(...authorizedNums);
    if (actualNums.length > 0) actualAmount = Math.max(...actualNums);
  }

  // Compute filled/unfilled from actual data if not found in header
  const filledPositions = header.filledPositions || filledCount;
  const unfilledPositions = header.unfilledPositions || (totalPositions - filledCount);

  return {
    ...header,
    totalPositions,
    filledPositions,
    unfilledPositions,
    authorizedAmount,
    actualAmount,
  };
}

// ── Row-per-record parser ─────────────────────────────────────────────────

/**
 * Group text items into horizontal rows by Y proximity.
 * Each row is a sorted list of items left-to-right.
 */
function groupItemsIntoRows(items: TextItem[], yTolerance = 5): { y: number; items: TextItem[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= yTolerance);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows;
}

/**
 * Extract item number from a joined row string.
 * Handles fragments split by spaces: "OSEC - DECSB - TCH1 - 270096 - 2023"
 */
function extractItemNumberFromText(text: string): string | null {
  const collapsed = text.replace(/\s+/g, '');
  // Direct match
  const direct = collapsed.match(/OSEC-DECSB-[A-Z0-9]+-\d{4,7}(?:-\d{2,4})?/i);
  if (direct) return direct[0].toUpperCase();
  // Try with spaces around hyphens
  const spaced = text.match(/OSEC\s*-?\s*DECSB\s*-?\s*([A-Za-z0-9]+)\s*-?\s*(\d{4,7})\s*-?\s*(\d{2,4})?/i);
  if (spaced) {
    return `OSEC-DECSB-${spaced[1].toUpperCase()}-${spaced[2]}${spaced[3] ? '-' + spaced[3] : ''}`;
  }
  // Partial: OSEC-DECSB-XXXXX-DDDD (no year)
  const partial = collapsed.match(/OSEC-DECSB-[A-Z0-9]+-\d{4,7}/i);
  if (partial) return partial[0].toUpperCase();
  return null;
}

/**
 * Row-per-record parser: each employee is a horizontal row.
 * Many per-school PSIPOP PDFs use this layout instead of column-per-record.
 * Groups all items on a page into rows by Y, finds rows containing OSEC item
 * numbers, and extracts fields from the text of that row plus nearby rows.
 */
function extractPositionsByRowLayout(
  allPageItems: TextItem[][],
  filename: string,
  existingMap: Map<string, PlantillaPosition>,
  documentHeader?: PSIPOPDocumentHeader
): { positions: PlantillaPosition[]; duplicates: number; invalid: number; warnings: string[] } {
  const positions: PlantillaPosition[] = [];
  const seenItems = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  const warnings: string[] = [];
  const batchId = `BATCH-${Date.now()}`;
  const importDate = new Date().toISOString();

  for (const items of allPageItems) {
    const rows = groupItemsIntoRows(items, 6);

    for (let r = 0; r < rows.length; r++) {
      const rowText = rows[r].items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      const itemNum = extractItemNumberFromText(rowText);
      if (!itemNum || !isValidItemNumber(itemNum)) continue;

      if (seenItems.has(itemNum)) { duplicates++; continue; }
      seenItems.add(itemNum);

      // Collect text from this row and a few rows below for field data.
      // In row-per-record layout, fields may span multiple sub-rows.
      let textBlock = rowText;
      let lookAhead = r + 1;
      while (lookAhead < rows.length && lookAhead < r + 8) {
        const nextText = rows[lookAhead].items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
        if (extractItemNumberFromText(nextText)) break;
        if (/SUBTOTAL|GRAND TOTAL|NOTHING FOLLOWS/i.test(nextText)) break;
        textBlock += ' ' + nextText;
        lookAhead++;
      }

      // Try structured pipe-separated format first
      const structured = parseStructuredPSIPOPLine(textBlock.replace(itemNum, '').trim());
      if (structured) {
        const isVacant = structured.incumbentName.toUpperCase().includes('VACANT') ||
          structured.incumbentName.toUpperCase().includes('UNFILLED');
        const category = classifyPersonnelCategory(structured.positionTitle);
        const empStatusMap: Record<string, string> = { P: 'Permanent', T: 'Temporary', C: 'Contractual' };

        const posRecord: PlantillaPosition = {
          id: `pl-${batchId}-${positions.length + 1}`,
          item_number: itemNum,
          position_title: structured.positionTitle,
          salary_grade: structured.salaryGrade,
          salary_step: structured.step,
          step: structured.step,
          annual_salary: structured.authorizedSalary,
          authorized_salary: structured.authorizedSalary,
          actual_salary: isVacant ? 0 : structured.actualSalary,
          school_id: documentHeader?.schoolCode || '',
          school_name: documentHeader?.schoolName || documentHeader?.divisionOffice || '',
          school_type: undefined,
          office_assignment: documentHeader?.divisionOffice || '',
          employee_id: isVacant ? '' : `EMP-${batchId}-${positions.length + 1}`,
          employee_name: isVacant ? '' : structured.incumbentName,
          sex: isVacant ? '' : structured.sex,
          birth_date: isVacant ? '' : structured.birthDate,
          date_of_birth: isVacant ? '' : structured.birthDate,
          tin: isVacant ? '' : structured.tin,
          appointment_date: isVacant ? '' : structured.originalAppointmentDate,
          original_appointment_date: isVacant ? '' : structured.originalAppointmentDate,
          last_promotion_date: isVacant ? '' : structured.lastPromotionDate,
          eligibility: isVacant ? '' : structured.eligibility,
          civil_service_eligibility: isVacant ? '' : structured.eligibility,
          employment_status: isVacant ? '' : (empStatusMap[structured.status] || 'Permanent'),
          appointment_type: 'Regular',
          occupation_code: '',
          level: structured.level,
          ppa_attribution: structured.ppaAttribution,
          organizational_unit: documentHeader?.divisionOffice || '',
          department: documentHeader?.department || 'Department of Education',
          bureau: documentHeader?.bureauAgency || '',
          fiscal_year: documentHeader?.fiscalYear || new Date().getFullYear(),
          personnel_category: category,
          position_status: isVacant ? 'Vacant' : 'Filled',
          source_pdf: filename,
          import_batch_id: batchId,
          approval_status: 'Approved',
          created_at: importDate,
          updated_at: importDate,
        };
        posRecord.area = structured.areaCode;
        posRecord.type = structured.areaType;
        positions.push(posRecord);
        continue;
      }

      const { title: positionTitle, salaryGrade } = extractSalaryGradeFromTitle(
        textBlock.replace(itemNum, '').trim()
      );

      // Salaries: find 5-9 digit numbers with optional commas
      const salaryMatches = [...textBlock.matchAll(/([\d,]{5,9}(?:\.\d{2})?)/g)];
      const authorizedSalary = salaryMatches.length >= 1 ? parseSalaryValue(salaryMatches[0][1]) : 0;
      const actualSalaryRaw = salaryMatches.length >= 2 ? parseSalaryValue(salaryMatches[1][1]) : authorizedSalary;

      // Vacancy detection
      const upperBlock = textBlock.toUpperCase();
      const isVacant = upperBlock.includes('(VACANT)') || upperBlock.includes(' VACANT') || upperBlock.includes('UNFILLED');

      // Incumbent name: LASTNAME, FIRSTNAME pattern
      let incumbentName = '';
      if (!isVacant) {
        const nameMatches = textBlock.match(/\b([A-Z][A-Z\s.'-]{2,35},\s*[A-Z][A-Z\s.'-]{2,40})\b/g);
        if (nameMatches) {
          const EXCLUDED = ['DEPARTMENT', 'DIVISION', 'BUREAU', 'TEACHER', 'PRINCIPAL', 'OFFICER',
            'SCHOOL', 'PLANTILLA', 'TOTAL', 'OSEC', 'DECSB', 'ITEM', 'PAGE', 'SALARY',
            'AUTHORIZED', 'ACTUAL', 'ELIGIBILITY', 'APPOINTMENT', 'PROMOTION', 'ATTRIBUTION',
            'SUBTOTAL', 'GRAND'];
          for (const candidate of nameMatches) {
            const upper = candidate.toUpperCase();
            if (!EXCLUDED.some((kw) => upper.includes(kw)) && candidate.includes(',')) {
              incumbentName = candidate.trim();
              break;
            }
          }
        }
      }

      // Dates
      const dateMatches = [...textBlock.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/g)].map((m) => m[0]);
      const birthDate = dateMatches[0] ? normalizeDate(dateMatches[0]) : '';
      const originalAppointmentDate = dateMatches[1] ? normalizeDate(dateMatches[1]) : '';
      const lastPromotionDate = dateMatches[2] ? normalizeDate(dateMatches[2]) : '';

      // TIN
      const tinMatch = textBlock.match(/\b\d{9,12}\b|\b\d{3}-\d{3}-\d{3}(-\d{3,4})?\b/);
      const tin = tinMatch ? tinMatch[0].replace(/\s+/g, '') : '';

      // Sex
      const sexMatch = textBlock.match(/\b([MF])\b/);
      let sex: 'Male' | 'Female' | 'M' | 'F' | '' = '';
      if (sexMatch) sex = sexMatch[1] === 'M' ? 'Male' : 'Female';

      // PPA Attribution (15-digit number)
      const ppaMatch = textBlock.match(/\b\d{15}\b/);
      const ppaAttribution = ppaMatch ? ppaMatch[0] : '';

      // Eligibility
      let eligibility = '';
      const upperB = textBlock.toUpperCase();
      if (upperB.includes('PBET')) eligibility = 'PBET';
      else if (upperB.includes('RA 1080')) eligibility = 'RA 1080';
      else if (upperB.includes('CS PROF') || upperB.includes('PROFESSIONAL')) eligibility = 'CS PROFESSIONAL';
      else if (upperB.includes('LET')) eligibility = 'LET';
      else if (upperB.includes('CAREER SERVICE')) eligibility = 'CAREER SERVICE';
      else if (upperB.includes('CSC')) eligibility = 'CSC';

      // Step
      const stepMatch = textBlock.match(/Step\s*:?\s*(\d{1,2})/i);
      const salaryStep = stepMatch ? parseInt(stepMatch[1], 10) : 0;

      // Level
      const levelMatch = textBlock.match(/\b([RM])\b/);
      const level = levelMatch ? levelMatch[1] : '';

      const positionStatus: 'Filled' | 'Vacant' = isVacant ? 'Vacant' : 'Filled';
      const actualSalary = isVacant ? 0 : (actualSalaryRaw || authorizedSalary);
      const category = classifyPersonnelCategory(positionTitle);

      positions.push({
        id: `pl-${batchId}-${positions.length + 1}`,
        item_number: itemNum,
        position_title: positionTitle,
        salary_grade: salaryGrade,
        salary_step: salaryStep,
        step: salaryStep,
        annual_salary: authorizedSalary,
        authorized_salary: authorizedSalary,
        actual_salary: actualSalary,
        school_id: documentHeader?.schoolCode || '',
        school_name: documentHeader?.schoolName || documentHeader?.divisionOffice || '',
        school_type: undefined,
        office_assignment: documentHeader?.divisionOffice || '',
        employee_id: isVacant ? '' : `EMP-${batchId}-${positions.length + 1}`,
        employee_name: isVacant ? '' : incumbentName,
        sex,
        birth_date: birthDate,
        date_of_birth: birthDate,
        tin,
        appointment_date: originalAppointmentDate,
        original_appointment_date: originalAppointmentDate,
        last_promotion_date: lastPromotionDate,
        eligibility,
        civil_service_eligibility: eligibility,
        employment_status: isVacant ? '' : 'Permanent',
        appointment_type: 'Regular',
        occupation_code: '',
        level,
        ppa_attribution: ppaAttribution,
        organizational_unit: documentHeader?.divisionOffice || '',
        department: documentHeader?.department || 'Department of Education',
        bureau: documentHeader?.bureauAgency || '',
        fiscal_year: documentHeader?.fiscalYear || new Date().getFullYear(),
        personnel_category: category,
        position_status: positionStatus,
        source_pdf: filename,
        import_batch_id: batchId,
        approval_status: 'Approved',
        created_at: importDate,
        updated_at: importDate,
      });
    }
  }

  if (positions.length === 0) {
    warnings.push('No plantilla records were found. Verify the PDF is a valid DepEd PSIPOP report containing OSEC-DECSB item numbers.');
  }

  return { positions, duplicates, invalid, warnings };
}

// ── Main extraction: column-per-record parser ─────────────────────────────

/**
 * Check if an item number string is a valid plantilla item number
 * (not "Subtotal", "Grand Total", etc.)
 */
function isValidItemNumber(str: string): boolean {
  const upper = str.toUpperCase().replace(/\s+/g, '');
  if (!upper.startsWith('OSEC-DECSB-')) return false;
  if (/SUBTOTAL|GRANDTOTAL|NOTHINGFOLLOWS/i.test(upper)) return false;
  // Must have at least one numeric segment after the prefix
  return /OSEC-DECSB-[A-Z0-9]+-\d{4,7}/i.test(upper);
}

/**
 * Core PSIPOP extraction engine.
 *
 * PSIPOP PDFs use a COLUMN-PER-RECORD layout:
 * - Each employee record occupies a vertical column at a fixed X position.
 * - Fields are laid out in horizontal bands at fixed Y positions.
 * - Item numbers are at the BOTTOM of the page (Y ≈ 19).
 * - Names, salaries, dates, etc. are at higher Y positions.
 *
 * Strategy:
 * 1. Extract all text items with coordinates from each page.
 * 2. Find data-column X anchors by locating OSEC-DECSB- item numbers.
 * 3. For each field band (Y position), collect items and assign to columns.
 * 4. Merge field data per column to build complete employee records.
 */
async function extractPositionsByColumnLayout(
  file: File,
  filename: string,
  existingPositions: PlantillaPosition[]
): Promise<ExtractedPSIPOPResult> {
  const arrayBuffer = await file.arrayBuffer();
  const warnings: string[] = [];
  const errors: string[] = [];

  const pdf = await loadPdfDocument(arrayBuffer);

  if (!pdf) {
    errors.push('Failed to open PDF file. The file may be corrupted or password-protected.');
    return buildEmptyResult(filename, warnings, errors);
  }
  if (pdf.numPages === 0) {
    await pdf.destroy();
    errors.push('PDF file has no pages.');
    return buildEmptyResult(filename, warnings, errors);
  }

  const existingMap = new Map<string, PlantillaPosition>();
  existingPositions.forEach((p) => existingMap.set(p.item_number.toUpperCase(), p));

  const extractedPositions: PlantillaPosition[] = [];
  const seenItems = new Set<string>();
  let duplicatesCount = 0;
  let invalidCount = 0;
  const batchId = `BATCH-${Date.now()}`;
  const importDate = new Date().toISOString();

  let documentHeader: PSIPOPDocumentHeader | undefined;
  let rawTextPreview = '';
  let lastPageItems: TextItem[] = [];
  const allPageItems: TextItem[][] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const items = await extractPageItems(pdf, pageNum);
      allPageItems.push(items);

      // Track last page items for grand total extraction
      if (pageNum === pdf.numPages) {
        lastPageItems = items;
      }

      // Build raw text preview from first 2 pages
      if (pageNum <= 2) {
        const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
        const lines: string[] = [];
        let curY: number | null = null;
        let curLine: string[] = [];
        for (const it of sortedItems) {
          if (curY === null || Math.abs(it.y - curY) <= 4) {
            curLine.push(it.str);
            curY = it.y;
          } else {
            const lineText = curLine.join(' ').replace(/\s+/g, ' ').trim();
            if (lineText) lines.push(lineText);
            curLine = [it.str];
            curY = it.y;
          }
        }
        if (curLine.length) {
          const lineText = curLine.join(' ').replace(/\s+/g, ' ').trim();
          if (lineText) lines.push(lineText);
        }
        rawTextPreview += `--- PAGE ${pageNum} ---\n` + lines.join('\n') + '\n';
      }

      // Extract document header from first page
      if (pageNum === 1) {
        documentHeader = extractDocumentHeader(items);
      }

      // Step 1: Find data-column X anchors from OSEC item numbers
      const columnXs = findDataColumnXPositions(items);

      if (columnXs.length === 0) {
        // No data columns on this page — might be a cover/summary page
        continue;
      }

    // Step 2: For each field band, collect items and assign to columns

    // Item Number — search ALL items (not just Y≈19) because some PSIPOP PDFs
    // place item numbers at different Y positions or split them across fragments.
    // First try the original Y band, then fall back to full-page reconstruction.
    let itemNumBand = getItemsInBand(items, FIELD_BANDS.itemNumber);
    let itemNumByCol = assignItemsToColumns(itemNumBand, columnXs);

    // If no item numbers found at the standard Y position, reconstruct from full page
    const hasValidItems = [...itemNumByCol.values()].some((v) => isValidItemNumber(v));
    if (!hasValidItems) {
      // Search a wider Y range for item numbers (0 to 40, and also 800-1000 for rotated layouts)
      const widerBand = items.filter(
        (it) => (it.y <= 40 || it.y >= 800) && it.x > LABEL_X_MAX
      );
      itemNumByCol = assignItemsToColumns(widerBand, columnXs);

      // If still nothing, use the reconstruction approach across ALL items
      const stillEmpty = [...itemNumByCol.values()].every((v) => !v);
      if (stillEmpty) {
        const reconItems = reconstructItemNumbersInBand(items);
        for (const r of reconItems) {
          // Assign to nearest column
          let nearestX = columnXs[0];
          let minDist = Math.abs(r.x - columnXs[0]);
          for (const cx of columnXs) {
            const dist = Math.abs(r.x - cx);
            if (dist < minDist) { minDist = dist; nearestX = cx; }
          }
          if (minDist <= 30) {
            itemNumByCol.set(nearestX, r.itemNumber);
          }
        }
      }
    }

    // Position Title (Y ≈ 181)
    const posTitleBand = getItemsInBand(items, FIELD_BANDS.positionTitle);
    const posTitleByCol = assignItemsToColumns(posTitleBand, columnXs);

    // Authorized Salary (Y ≈ 347)
    const authSalaryBand = getItemsInBand(items, FIELD_BANDS.authorizedSalary);
    const authSalaryByCol = assignItemsToColumns(authSalaryBand, columnXs);

    // Actual Salary (Y ≈ 402)
    const actSalaryBand = getItemsInBand(items, FIELD_BANDS.actualSalary);
    const actSalaryByCol = assignItemsToColumns(actSalaryBand, columnXs);

    // Step (Y ≈ 440)
    const stepBand = getItemsInBand(items, FIELD_BANDS.step);
    const stepByCol = assignItemsToColumns(stepBand, columnXs);

    // Area (Y ≈ 456)
    const areaBand = getItemsInBand(items, FIELD_BANDS.area);
    const areaByCol = assignItemsToColumns(areaBand, columnXs);

    // Type (Y ≈ 471)
    const typeBand = getItemsInBand(items, FIELD_BANDS.type);
    const typeByCol = assignItemsToColumns(typeBand, columnXs);

    // Level (Y ≈ 486)
    const levelBand = getItemsInBand(items, FIELD_BANDS.level);
    const levelByCol = assignItemsToColumns(levelBand, columnXs);

    // PPA Attribution (Y ≈ 497)
    const ppaBand = getItemsInBand(items, FIELD_BANDS.ppaAttribution);
    const ppaByCol = assignItemsToColumns(ppaBand, columnXs);

    // Incumbent Name (Y ≈ 567)
    const nameBand = getItemsInBand(items, FIELD_BANDS.incumbentName);
    const nameByCol = assignItemsToColumns(nameBand, columnXs);

    // Sex (Y ≈ 707)
    const sexBand = getItemsInBand(items, FIELD_BANDS.sex);
    const sexByCol = assignItemsToColumns(sexBand, columnXs);

    // Birth Date (Y ≈ 720)
    const birthBand = getItemsInBand(items, FIELD_BANDS.birthDate);
    const birthByCol = assignItemsToColumns(birthBand, columnXs);

    // TIN (Y ≈ 755)
    const tinBand = getItemsInBand(items, FIELD_BANDS.tin);
    const tinByCol = assignItemsToColumns(tinBand, columnXs);

    // Original Appointment (Y ≈ 821)
    const origAptBand = getItemsInBand(items, FIELD_BANDS.origAppointment);
    const origAptByCol = assignItemsToColumns(origAptBand, columnXs);

    // Last Promotion (Y ≈ 876)
    const lastPromoBand = getItemsInBand(items, FIELD_BANDS.lastPromotion);
    const lastPromoByCol = assignItemsToColumns(lastPromoBand, columnXs);

    // Eligibility (Y ≈ 946)
    const eligBand = getItemsInBand(items, FIELD_BANDS.eligibility);
    const eligByCol = assignItemsToColumns(eligBand, columnXs);

    // Step 3: Build records per column
    for (const colX of columnXs) {
      const rawItemNum = (itemNumByCol.get(colX) || '').trim();

      // Skip if no valid item number
      if (!rawItemNum || !isValidItemNumber(rawItemNum)) {
        if (rawItemNum && rawItemNum.length > 5 && !isValidItemNumber(rawItemNum)) {
          invalidCount++;
        }
        continue;
      }

      const itemNum = rawItemNum.toUpperCase().replace(/\s+/g, '');

      // Dedup within this import
      if (seenItems.has(itemNum)) {
        duplicatesCount++;
        continue;
      }
      seenItems.add(itemNum);

      // Position Title + Salary Grade
      const { title: positionTitle, salaryGrade } = extractSalaryGradeFromTitle(
        posTitleByCol.get(colX) || ''
      );

      // Salaries
      const authorizedSalary = parseSalaryValue(authSalaryByCol.get(colX) || '');
      const actualSalaryRaw = parseSalaryValue(actSalaryByCol.get(colX) || '');

      // Step
      const stepRaw = (stepByCol.get(colX) || '').replace(/[^\d]/g, '');
      const salaryStep = stepRaw ? parseInt(stepRaw, 10) : 0;

      // Incumbent Name → determine vacancy
      const incumbentNameRaw = (nameByCol.get(colX) || '').trim();
      const isVacant =
        !incumbentNameRaw ||
        incumbentNameRaw.toUpperCase() === 'VACANT' ||
        incumbentNameRaw.toUpperCase() === '(VACANT)' ||
        incumbentNameRaw.toUpperCase() === 'UNFILLED';

      const incumbentName = isVacant ? '' : incumbentNameRaw;
      const positionStatus: 'Filled' | 'Vacant' = isVacant ? 'Vacant' : 'Filled';
      const actualSalary = isVacant ? 0 : (actualSalaryRaw || authorizedSalary);

      // Sex
      const sexRaw = (sexByCol.get(colX) || '').trim().toUpperCase();
      let sex: 'Male' | 'Female' | 'M' | 'F' | '' = '';
      if (sexRaw === 'M' || sexRaw === 'MALE') sex = 'Male';
      else if (sexRaw === 'F' || sexRaw === 'FEMALE') sex = 'Female';

      // Dates
      const birthDate = normalizeDate(birthByCol.get(colX) || '');
      const tin = (tinByCol.get(colX) || '').replace(/\s+/g, '');
      const originalAppointmentDate = normalizeDate(origAptByCol.get(colX) || '');
      const lastPromotionDate = normalizeDate(lastPromoByCol.get(colX) || '');

      // PPA, Level, Area, Type
      const ppaAttribution = (ppaByCol.get(colX) || '').replace(/\s+/g, ' ').trim();
      const level = (levelByCol.get(colX) || '').trim().toUpperCase();
      const area = (areaByCol.get(colX) || '').trim();
      const typeVal = (typeByCol.get(colX) || '').trim();

      // Eligibility
      const civilServiceEligibility = (eligByCol.get(colX) || '').trim();

      const category = classifyPersonnelCategory(positionTitle);

      const posRecord: PlantillaPosition = {
        id: `pl-${batchId}-${extractedPositions.length + 1}`,
        item_number: itemNum,
        position_title: positionTitle,
        salary_grade: salaryGrade,
        salary_step: salaryStep,
        step: salaryStep,
        annual_salary: authorizedSalary,
        authorized_salary: authorizedSalary,
        actual_salary: actualSalary,
        school_id: documentHeader?.schoolCode || '',
        school_name: documentHeader?.schoolName || documentHeader?.divisionOffice || '',
        school_type: undefined,
        office_assignment: documentHeader?.divisionOffice || '',
        employee_id: isVacant ? '' : `EMP-${batchId}-${extractedPositions.length + 1}`,
        employee_name: incumbentName,
        sex,
        birth_date: birthDate,
        date_of_birth: birthDate,
        tin,
        appointment_date: originalAppointmentDate,
        original_appointment_date: originalAppointmentDate,
        last_promotion_date: lastPromotionDate,
        eligibility: civilServiceEligibility,
        civil_service_eligibility: civilServiceEligibility,
        employment_status: isVacant ? '' : 'Permanent',
        appointment_type: 'Regular',
        occupation_code: '',
        level,
        ppa_attribution: ppaAttribution,
        organizational_unit: documentHeader?.divisionOffice || '',
        department: documentHeader?.department || 'Department of Education',
        bureau: documentHeader?.bureauAgency || '',
        fiscal_year: documentHeader?.fiscalYear || new Date().getFullYear(),
        personnel_category: category,
        position_status: positionStatus,
        source_pdf: filename,
        import_batch_id: batchId,
        approval_status: 'Approved',
        created_at: importDate,
        updated_at: importDate,
      };

      posRecord.area = area;
      posRecord.type = typeVal;

      extractedPositions.push(posRecord);
    }
  }
  } finally {
    try { await pdf.destroy(); } catch { /* cleanup */ }
  }

  rawTextPreview = rawTextPreview.slice(0, 2000);

  // Compute filled count for header enrichment
  const filledCount = extractedPositions.filter((p) => p.position_status === 'Filled').length;

  // Enrich header with grand total amounts from the last page
  if (documentHeader) {
    documentHeader = enrichDocumentHeaderWithLastPage(
      documentHeader,
      lastPageItems,
      extractedPositions.length,
      filledCount
    );
  }

  // Validation
  const expectedTotalRecords = documentHeader?.totalPositions || extractedPositions.length;
  const importedRecords = extractedPositions.length;

  if (extractedPositions.length === 0) {
    // Fallback 1: Try row-per-record layout parser
    const rowResult = extractPositionsByRowLayout(
      allPageItems, filename, existingMap, documentHeader
    );
    if (rowResult.positions.length > 0) {
      extractedPositions.push(...rowResult.positions);
      duplicatesCount += rowResult.duplicates;
      invalidCount += rowResult.invalid;
      // Replace the column-parser warning with any row-parser warnings
      warnings.length = 0;
      warnings.push(...rowResult.warnings);
    }
  }

  if (extractedPositions.length === 0) {
    warnings.push('No plantilla records were found. Verify the PDF is a valid DepEd PSIPOP report containing OSEC-DECSB item numbers.');
  }

  if (documentHeader && documentHeader.totalPositions > 0) {
    if (importedRecords !== documentHeader.totalPositions) {
      warnings.push(
        `Record count mismatch: document header declares ${documentHeader.totalPositions} total positions, but ${importedRecords} records were extracted.`
      );
    }
  }

  const newPositions: PlantillaPosition[] = [];
  const updatedPositions: PlantillaPosition[] = [];
  extractedPositions.forEach((p) => {
    if (existingMap.has(p.item_number.toUpperCase())) {
      updatedPositions.push(p);
    } else {
      newPositions.push(p);
    }
  });

  const vacantPositions = extractedPositions.filter((p) => p.position_status === 'Vacant');
  const filledPositions = extractedPositions.filter((p) => p.position_status === 'Filled');

  return {
    filename,
    totalExtracted: extractedPositions.length,
    newPositions,
    updatedPositions,
    vacantPositions,
    filledPositions,
    duplicatesCount,
    invalidCount,
    rawTextPreview,
    positions: extractedPositions,
    warnings,
    errors,
    expectedTotalRecords,
    importedRecords,
    mismatch: expectedTotalRecords !== importedRecords,
    documentHeader,
  };
}

function buildEmptyResult(filename: string, warnings: string[], errors: string[]): ExtractedPSIPOPResult {
  return {
    filename,
    totalExtracted: 0,
    newPositions: [],
    updatedPositions: [],
    vacantPositions: [],
    filledPositions: [],
    duplicatesCount: 0,
    invalidCount: 0,
    rawTextPreview: '',
    positions: [],
    warnings,
    errors,
    expectedTotalRecords: 0,
    importedRecords: 0,
    mismatch: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Main entry point: extract plantilla positions from a PSIPOP PDF.
 * Uses the column-per-record layout parser.
 */
export async function extractAndParsePdf(
  file: File,
  existingPositions: PlantillaPosition[],
  onOcrProgress?: (info: { page: number; totalPages: number; percent: number; stage: string }) => void,
): Promise<ExtractedPSIPOPResult> {
  const strategiesTried: string[] = ['column-per-record'];
  const result = await extractPositionsByColumnLayout(file, file.name, existingPositions);

  // Collect diagnostic info from the first attempt
  let textItemCount = 0;
  let rawTextSample = result.rawTextPreview || '';
  try {
    const ab = await file.arrayBuffer();
    const pdf = await loadPdfDocument(ab);
    if (pdf) {
      try {
        const items = await extractPageItems(pdf, 1);
        textItemCount = items.length;
        if (items.length > 0 && !rawTextSample) {
          rawTextSample = items.slice(0, 50).map((it) => it.str).join(' ').slice(0, 500);
        }
      } finally {
        await pdf.destroy();
      }
    }
  } catch { /* diagnostic only */ }

  // Fallback 2: text-based parsing
  if (result.totalExtracted === 0 && result.errors.length === 0) {
    strategiesTried.push('text-line');
    try {
      const rawText = await extractTextFromPdf(file);
      if (rawText.trim()) {
        if (!rawTextSample) rawTextSample = rawText.slice(0, 500);
        const textResult = parsePSIPOPText(rawText, file.name, existingPositions);
        if (textResult.totalExtracted > 0) {
          textResult.diagnostic = { textItemCount, rawTextSample, strategiesTried, ocrUsed: false };
          return textResult;
        }
      }
    } catch {
      // Text extraction failed
    }
  }

  // Fallback 3: OCR for scanned/image PDFs using the dedicated OCR engine
  if (result.totalExtracted === 0 && result.errors.length === 0) {
    strategiesTried.push('ocr');
    try {
      const ocrResultData = await extractTextFromScannedPdf(file, 15, onOcrProgress);
      const ocrText = ocrResultData.fullText;
      if (ocrText.trim()) {
        const normalizedText = normalizeOcrText(ocrText);
        const ocrResult = parsePSIPOPText(normalizedText, file.name, existingPositions);
        if (ocrResult.totalExtracted > 0) {
          ocrResult.warnings.unshift(
            `OCR was used to extract text from ${file.name} ` +
            `(avg confidence: ${ocrResultData.avgConfidence}% across ${ocrResultData.pages.length} page(s)). ` +
            `If positions look incorrect, try providing a text-based PDF instead of a scanned copy.`
          );
          ocrResult.diagnostic = {
            textItemCount,
            rawTextSample,
            strategiesTried,
            ocrUsed: true,
            ocrSample: ocrText.slice(0, 500),
            ocrConfidence: ocrResultData.avgConfidence,
          };
          return ocrResult;
        }
        result.warnings.push(
          `[${file.name}] OCR extracted ${ocrText.length} characters ` +
          `(avg confidence: ${ocrResultData.avgConfidence}%) but no OSEC-DECSB item numbers were found. ` +
          `The PDF may not be a PSIPOP report, or the scan quality may be too low.`
        );
        result.diagnostic = {
          textItemCount,
          rawTextSample,
          strategiesTried,
          ocrUsed: true,
          ocrSample: ocrText.slice(0, 500),
        };
      } else {
        result.warnings.push(
          `[${file.name}] No text layer found and OCR produced no output. This appears to be an image-only PDF with no recognizable text.`
        );
        result.diagnostic = {
          textItemCount,
          rawTextSample: rawTextSample || '(no text extracted)',
          strategiesTried,
          ocrUsed: true,
          ocrSample: '(empty)',
        };
      }
    } catch (ocrErr) {
      const category = ocrErr instanceof OcrError ? ocrErr.category : 'unknown';
      const detail = ocrErr instanceof OcrError ? ocrErr.detail : (ocrErr instanceof Error ? ocrErr.message : 'No error details available');
      result.warnings.push(
        `[${file.name}] OCR processing failed (${category}): ${detail}`
      );
      result.diagnostic = {
        textItemCount,
        rawTextSample: rawTextSample || '(no text extracted)',
        strategiesTried,
        ocrUsed: false,
        ocrErrorCategory: category,
        ocrErrorDetail: detail,
      };
    }
  } else if (result.totalExtracted === 0) {
    result.diagnostic = {
      textItemCount,
      rawTextSample: rawTextSample || '(no text extracted)',
      strategiesTried,
      ocrUsed: false,
    };
  }

  return result;
}

/**
 * Unified file handler — accepts PDFs, images (JPG/PNG/WebP/GIF/BMP),
 * and text/CSV files. Routes images directly to OCR, PDFs through the
 * normal extraction pipeline (with OCR fallback), and text/CSV through
 * the text parser.
 *
 * @param file              The uploaded file
 * @param existingPositions  Current positions for dedup detection
 * @param onOcrProgress      Optional callback for OCR progress updates
 */
export async function extractAndParseFile(
  file: File,
  existingPositions: PlantillaPosition[],
  onOcrProgress?: (info: { page: number; totalPages: number; percent: number; stage: string }) => void,
): Promise<ExtractedPSIPOPResult> {
  // Image files go straight to OCR — no text layer to try first.
  if (isImageFile(file)) {
    const strategiesTried = ['ocr-image'];
    try {
      const ocrResultData = await extractTextFromImage(file, onOcrProgress);
      const ocrText = ocrResultData.fullText;
      if (ocrText.trim()) {
        const normalizedText = normalizeOcrText(ocrText);
        const parsed = parsePSIPOPText(normalizedText, file.name, existingPositions);
        if (parsed.totalExtracted > 0) {
          parsed.warnings.unshift(
            `OCR was used to extract text from image ${file.name} ` +
            `(confidence: ${ocrResultData.avgConfidence}%). ` +
            `If positions look incorrect, try a higher-resolution scan or a text-based PDF.`
          );
          parsed.diagnostic = {
            textItemCount: 0,
            rawTextSample: '(image file — no text layer)',
            strategiesTried,
            ocrUsed: true,
            ocrSample: ocrText.slice(0, 500),
            ocrConfidence: ocrResultData.avgConfidence,
          };
          return parsed;
        }
        parsed.warnings.push(
          `[${file.name}] OCR extracted ${ocrText.length} characters ` +
          `(confidence: ${ocrResultData.avgConfidence}%) but no OSEC-DECSB item numbers were found. ` +
          `The image may not be a PSIPOP report, or the photo quality may be too low.`
        );
        parsed.diagnostic = {
          textItemCount: 0,
          rawTextSample: '(image file — no text layer)',
          strategiesTried,
          ocrUsed: true,
          ocrSample: ocrText.slice(0, 500),
          ocrConfidence: ocrResultData.avgConfidence,
        };
        return parsed;
      }
      return {
        ...parsePSIPOPText('', file.name, existingPositions),
        warnings: [`[${file.name}] OCR produced no output. The image may be blank or too low quality.`],
        diagnostic: {
          textItemCount: 0,
          rawTextSample: '(image file)',
          strategiesTried,
          ocrUsed: true,
          ocrSample: '(empty)',
        },
      };
    } catch (ocrErr) {
      const category = ocrErr instanceof OcrError ? ocrErr.category : 'unknown';
      const detail = ocrErr instanceof OcrError ? ocrErr.detail : (ocrErr instanceof Error ? ocrErr.message : 'No error details available');
      return {
        ...parsePSIPOPText('', file.name, existingPositions),
        warnings: [`[${file.name}] OCR processing failed (${category}): ${detail}`],
        diagnostic: {
          textItemCount: 0,
          rawTextSample: '(image file)',
          strategiesTried,
          ocrUsed: false,
          ocrErrorCategory: category,
          ocrErrorDetail: detail,
        },
      };
    }
  }

  // PDFs and text/CSV files go through the existing pipeline.
  return extractAndParsePdf(file, existingPositions, onOcrProgress);
}

/**
 * Extract raw text from a PDF file (all pages combined).
 * Preserves line breaks and reading order.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await loadPdfDocument(arrayBuffer);

  if (!pdf || pdf.numPages === 0) {
    if (pdf) await pdf.destroy();
    return '';
  }

  let fullText = '';
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const items = await extractPageItems(pdf, i);
      fullText += `\n--- PAGE ${i} ---\n`;

      // Sort top to bottom, then left to right
      const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

      // Group into lines by Y proximity
      const lines: string[] = [];
      let curY: number | null = null;
      let curLine: string[] = [];
      for (const it of sortedItems) {
        if (curY === null || Math.abs(it.y - curY) <= 4) {
          curLine.push(it.str);
          curY = it.y;
        } else {
          const lineText = curLine.join(' ').replace(/\s+/g, ' ').trim();
          if (lineText) lines.push(lineText);
          curLine = [it.str];
          curY = it.y;
        }
      }
      if (curLine.length) {
        const lineText = curLine.join(' ').replace(/\s+/g, ' ').trim();
        if (lineText) lines.push(lineText);
      }

      fullText += lines.join('\n') + '\n';
    }
  } finally {
    try { await pdf.destroy(); } catch { /* cleanup */ }
  }

  return fullText;
}

/**
 * Text-based fallback parser — splits raw text by OSEC-DECSB- item number
 * patterns and extracts fields with regex. Used when the PDF is not a
 * standard PSIPOP (e.g. plain text, CSV, or non-standard layout).
 */
export function parsePSIPOPText(
  rawText: string,
  filename: string,
  existingPositions: PlantillaPosition[]
): ExtractedPSIPOPResult {
  const existingMap = new Map<string, PlantillaPosition>();
  existingPositions.forEach((p) => existingMap.set(p.item_number.toUpperCase(), p));

  const extractedPositions: PlantillaPosition[] = [];
  const seenItems = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];
  let duplicatesCount = 0;
  let invalidCount = 0;

  const batchId = `BATCH-${Date.now()}`;
  const importDate = new Date().toISOString();

  // Normalize item numbers (collapse spaces around hyphens, and join fragments
  // that were split across lines by the PDF text extractor).
  // First, merge lines where OSEC-DECSB- appears at end of a line and the next
  // line continues the item number. Handle multi-line splits.
  const mergedText = rawText
    // Join "OSEC" at end of line with "DECSB" at start of next
    .replace(/\bOSEC\s*\n\s*DECSB\s*\n\s*([A-Z0-9]+)/gi, 'OSEC-DECSB-$1')
    // Join "OSEC-DECSB-" at end of line with continuation on next
    .replace(/\bOSEC-DECSB-\s*\n\s*([A-Z0-9]+-\d+-\d{2,4})/gi, 'OSEC-DECSB-$1')
    .replace(/\bOSEC-DECSB-\s*\n\s*([A-Z0-9]+-\d{4,7})/gi, 'OSEC-DECSB-$1')
    .replace(/\bOSEC-DECSB-\s*\n\s*([A-Z0-9]+)/gi, 'OSEC-DECSB-$1')
    // Join "OSEC-DECSB-XXXX-" at end of line with the number on next
    .replace(/\b(OSEC-DECSB-[A-Z0-9]+)-\s*\n\s*(\d{4,7}(?:-\d{2,4})?)/gi, '$1-$2')
    // Join any fragment ending with hyphen at line end + number at next line start
    .replace(/([A-Z]{3,}-[A-Z]{3,}-[A-Z0-9]+)\s*\n\s*(\d{4,7}-\d{2,4})/gi, '$1-$2')
    .replace(/([A-Z]{3,}-[A-Z]{3,}-[A-Z0-9]+-\d{4,7})\s*\n\s*(\d{2,4})/gi, '$1-$2');

  const normalizedRaw = mergedText
    .replace(/\b(OSEC|DECSB|DEPED)\s*-\s*([A-Z0-9]+)\s*-\s*([A-Z0-9]+)\s*-\s*(\d+)\s*-\s*(\d{2,4})\b/gi, '$1-$2-$3-$4-$5')
    .replace(/\b(OSEC|DECSB|DEPED)\s*-\s*([A-Z0-9]+)\s*-\s*(\d+)\s*-\s*(\d{2,4})\b/gi, '$1-$2-$3-$4')
    // Also handle item numbers where fragments are separated by spaces within a line
    .replace(/\bOSEC\s*[-]?\s*DECSB\s*[-]?\s*([A-Za-z0-9]+)\s*[-]?\s*(\d{4,7})\s*[-]?\s*(\d{2,4})\b/gi, 'OSEC-DECSB-$1-$2-$3')
    .replace(/\bOSEC\s*[-]?\s*DECSB\s*[-]?\s*([A-Za-z0-9]+)\s*[-]?\s*(\d{4,7})\b/gi, 'OSEC-DECSB-$1-$2');

  // Accept item numbers with or without the trailing year, and with 4-7 digit serials
  const ITEM_REGEX = /\b(OSEC-DECSB-[A-Z0-9]+-\d{4,7}(?:-\d{2,4})?)\b/i;
  const lines = normalizedRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Extract school code and name from text (e.g., "1801.0010 BUBUYAN INTEGRATED SCHOOL").
  // Tolerant of OCR spacing/line wraps so a re-import populates the school code.
  const schoolHeader = extractSchoolCodeFromText(normalizedRaw);
  const textSchoolCode = schoolHeader.code;
  const textSchoolName = schoolHeader.name;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const itemMatch = line.match(ITEM_REGEX);
    if (!itemMatch) continue;

    const itemNum = itemMatch[0].trim().toUpperCase();
    if (itemNum.length < 8) { invalidCount++; continue; }
    if (seenItems.has(itemNum)) { duplicatesCount++; continue; }
    seenItems.add(itemNum);

    // Build text block from current line + next few lines until next item
    let textBlock = line;
    let lookAhead = idx + 1;
    while (lookAhead < lines.length && lookAhead < idx + 20) {
      const nextLine = lines[lookAhead];
      if (nextLine.match(ITEM_REGEX)) break;
      if (/SUBTOTAL|GRAND TOTAL|NOTHING FOLLOWS/i.test(nextLine)) break;
      textBlock += ' ' + nextLine;
      lookAhead++;
    }

    // Try structured pipe-separated format first
    const structured = parseStructuredPSIPOPLine(textBlock.replace(itemNum, '').trim());
    if (structured) {
      const isVacant = structured.incumbentName.toUpperCase().includes('VACANT') ||
        structured.incumbentName.toUpperCase().includes('UNFILLED');
      const category = classifyPersonnelCategory(structured.positionTitle);
      const empStatusMap: Record<string, string> = { P: 'Permanent', T: 'Temporary', C: 'Contractual' };

      const posRecord: PlantillaPosition = {
        id: `pl-${batchId}-${extractedPositions.length + 1}`,
        item_number: itemNum,
        position_title: structured.positionTitle,
        salary_grade: structured.salaryGrade,
        salary_step: structured.step,
        step: structured.step,
        annual_salary: structured.authorizedSalary,
        authorized_salary: structured.authorizedSalary,
        actual_salary: isVacant ? 0 : structured.actualSalary,
        school_id: textSchoolCode || '',
        school_name: textSchoolName || '',
        school_type: undefined,
        office_assignment: '',
        employee_id: isVacant ? '' : `EMP-${batchId}-${extractedPositions.length + 1}`,
        employee_name: isVacant ? '' : structured.incumbentName,
        sex: isVacant ? '' : structured.sex,
        birth_date: isVacant ? '' : structured.birthDate,
        date_of_birth: isVacant ? '' : structured.birthDate,
        tin: isVacant ? '' : structured.tin,
        appointment_date: isVacant ? '' : structured.originalAppointmentDate,
        original_appointment_date: isVacant ? '' : structured.originalAppointmentDate,
        last_promotion_date: isVacant ? '' : structured.lastPromotionDate,
        eligibility: isVacant ? '' : structured.eligibility,
        civil_service_eligibility: isVacant ? '' : structured.eligibility,
        employment_status: isVacant ? '' : (empStatusMap[structured.status] || 'Permanent'),
        appointment_type: 'Regular',
        occupation_code: '',
        level: structured.level,
        ppa_attribution: structured.ppaAttribution,
        organizational_unit: '',
        department: 'Department of Education',
        bureau: '',
        fiscal_year: new Date().getFullYear(),
        personnel_category: category,
        position_status: isVacant ? 'Vacant' : 'Filled',
        source_pdf: filename,
        import_batch_id: batchId,
        approval_status: 'Approved',
        created_at: importDate,
        updated_at: importDate,
      };
      posRecord.area = structured.areaCode;
      posRecord.type = structured.areaType;
      extractedPositions.push(posRecord);
      continue;
    }

    const { title: positionTitle, salaryGrade } = extractSalaryGradeFromTitle(
      textBlock.replace(itemNum, '').trim()
    );

    const salaryMatches = [...textBlock.matchAll(/([\d,]{5,9}(?:\.\d{2})?)/g)];
    const authorizedSalary = salaryMatches.length >= 1 ? parseFloat(salaryMatches[0][1].replace(/,/g, '')) : 0;
    const actualSalary = salaryMatches.length >= 2 ? parseFloat(salaryMatches[1][1].replace(/,/g, '')) : authorizedSalary;

    const upperBlock = textBlock.toUpperCase();
    const isVacant = upperBlock.includes('(VACANT)') || upperBlock.includes(' VACANT ') || upperBlock.includes('UNFILLED');

    let incumbentName = '';
    if (!isVacant) {
      const nameMatches = textBlock.match(/\b([A-Z][A-Z\s.'-]{2,35},\s*[A-Z][A-Z\s.'-]{2,40})\b/g);
      if (nameMatches) {
        const EXCLUDED = ['DEPARTMENT', 'DIVISION', 'BUREAU', 'TEACHER', 'PRINCIPAL', 'OFFICER',
          'SCHOOL', 'PLANTILLA', 'TOTAL', 'OSEC', 'DECSB', 'ITEM', 'PAGE', 'SALARY',
          'AUTHORIZED', 'ACTUAL', 'ELIGIBILITY', 'APPOINTMENT', 'PROMOTION', 'ATTRIBUTION'];
        for (const candidate of nameMatches) {
          const upper = candidate.toUpperCase();
          if (!EXCLUDED.some((kw) => upper.includes(kw)) && candidate.includes(',')) {
            incumbentName = candidate.trim();
            break;
          }
        }
      }
    }

    const dateMatches = [...textBlock.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/g)].map((m) => m[0]);
    const birthDate = dateMatches[0] ? normalizeDate(dateMatches[0]) : '';
    const originalAppointmentDate = dateMatches[1] ? normalizeDate(dateMatches[1]) : '';
    const lastPromotionDate = dateMatches[2] ? normalizeDate(dateMatches[2]) : '';

    const tinMatch = textBlock.match(/\b\d{9,12}\b|\b\d{3}-\d{3}-\d{3}(-\d{3,4})?\b/);
    const tin = tinMatch ? tinMatch[0] : '';

    const sexMatch = textBlock.match(/\b([MF])\b/);
    let sex: 'Male' | 'Female' | 'M' | 'F' | '' = '';
    if (sexMatch) sex = sexMatch[1] === 'M' ? 'Male' : 'Female';

    const ppaMatch = textBlock.match(/\b\d{15}\b/);
    const ppaAttribution = ppaMatch ? ppaMatch[0] : '';

    let eligibility = '';
    const upperB = textBlock.toUpperCase();
    if (upperB.includes('PBET')) eligibility = 'PBET';
    else if (upperB.includes('RA 1080')) eligibility = 'RA 1080';
    else if (upperB.includes('CS PROF') || upperB.includes('PROFESSIONAL')) eligibility = 'CS PROFESSIONAL';
    else if (upperB.includes('LET')) eligibility = 'LET';
    else if (upperB.includes('CAREER SERVICE')) eligibility = 'CAREER SERVICE';
    else if (upperB.includes('CSC')) eligibility = 'CSC';

    const category = classifyPersonnelCategory(positionTitle);
    const positionStatus: 'Filled' | 'Vacant' = isVacant ? 'Vacant' : 'Filled';

    extractedPositions.push({
      id: `pl-${batchId}-${extractedPositions.length + 1}`,
      item_number: itemNum,
      position_title: positionTitle,
      salary_grade: salaryGrade,
      salary_step: 0,
      step: 0,
      annual_salary: authorizedSalary,
      authorized_salary: authorizedSalary,
      actual_salary: isVacant ? 0 : actualSalary,
      school_id: textSchoolCode || '',
      school_name: textSchoolName || '',
      school_type: undefined,
      office_assignment: '',
      employee_id: isVacant ? '' : `EMP-${batchId}-${extractedPositions.length + 1}`,
      employee_name: isVacant ? '' : incumbentName,
      sex,
      birth_date: birthDate,
      date_of_birth: birthDate,
      tin,
      appointment_date: originalAppointmentDate,
      original_appointment_date: originalAppointmentDate,
      last_promotion_date: lastPromotionDate,
      eligibility,
      civil_service_eligibility: eligibility,
      employment_status: isVacant ? '' : 'Permanent',
      appointment_type: 'Regular',
      occupation_code: '',
      level: '',
      ppa_attribution: ppaAttribution,
      organizational_unit: '',
      department: 'Department of Education',
      bureau: '',
      fiscal_year: new Date().getFullYear(),
      personnel_category: category,
      position_status: positionStatus,
      source_pdf: filename,
      import_batch_id: batchId,
      approval_status: 'Approved',
      created_at: importDate,
      updated_at: importDate,
    });
  }

  if (extractedPositions.length === 0) {
    warnings.push('No plantilla positions could be extracted from this text. Verify it contains OSEC-DECSB item numbers.');
  }

  const newPositions = extractedPositions.filter((p) => !existingMap.has(p.item_number.toUpperCase()));
  const updatedPositions = extractedPositions.filter((p) => existingMap.has(p.item_number.toUpperCase()));
  const vacantPositions = extractedPositions.filter((p) => p.position_status === 'Vacant');
  const filledPositions = extractedPositions.filter((p) => p.position_status === 'Filled');

  return {
    filename,
    totalExtracted: extractedPositions.length,
    newPositions,
    updatedPositions,
    vacantPositions,
    filledPositions,
    duplicatesCount,
    invalidCount,
    rawTextPreview: rawText.slice(0, 2000),
    positions: extractedPositions,
    warnings,
    errors,
    expectedTotalRecords: extractedPositions.length,
    importedRecords: extractedPositions.length,
    mismatch: false,
  };
}
