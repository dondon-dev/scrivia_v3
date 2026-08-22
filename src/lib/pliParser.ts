// PLI (Private Lending Institution) deduction file parser.
// Parses ADD.txt, DEL.txt, and DEDFILE.DBF into normalized records ready for
// matching against payroll_deductions on the 4-key composite:
//   STACODE + EMPNO + DEDCODE + POLICYNO

import { decodeDbf, type DbfRecord } from '@/lib/dbf';

export type RecordAction = 'ADD' | 'UPDATE' | 'TERMINATE' | 'ERROR';

export interface PliRecord {
  stacode: string;
  empno: string;
  dedcode: string;
  policyno: string;
  employeeName: string;
  dedAmt: number;
  principal: number;
  interest: number;
  charges: number;
  proceeds: number;
  effMm: number;
  effYy: number;
  terMm: number | null;
  terYy: number | null;
  status: string;
  agency: string;
  type: string;
  lineNumber: number;
  source: 'ADD' | 'DEL' | 'DBF' | 'GSIS';
  raw: string;
}

export interface PliParseResult {
  records: PliRecord[];
  errors: string[];
  totalLines: number;
}

// --- helpers --------------------------------------------------------------

export function cleanCell(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

export function parseAmount(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[,$]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

export function findColumn(headers: string[], names: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const name of names) {
    const idx = headers.findIndex((h) => norm(h) === norm(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function detectDelimiter(sample: string): string {
  const candidates = ['|', '\t', ';', ',', ':'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

// Extract a 2-digit month and 2-digit year from a date-ish string.
// Accepts YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY (ambiguous → assume MM first if <=12),
// YYYYMMDD, MMYY, and plain 4-digit MMYY.
export function parseMonthYear(input: string): { mm: number; yy: number } | null {
  if (!input) return null;
  const s = input.trim();
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const yy = parseInt(s.slice(0, 4), 10);
    const mm = parseInt(s.slice(4, 6), 10);
    if (mm >= 1 && mm <= 12) return { mm, yy: yy % 100 };
  }
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const mm = parseInt(iso[2], 10);
    return { mm, yy: parseInt(iso[1], 10) % 100 };
  }
  // MM/DD/YYYY or DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const a = parseInt(slash[1], 10);
    const b = parseInt(slash[2], 10);
    const year = parseInt(slash[3], 10);
    const fullYear = year < 100 ? year : year % 100;
    // assume MM/DD unless first part > 12
    if (a > 12 && b <= 12) return { mm: b, yy: fullYear };
    return { mm: a, yy: fullYear };
  }
  // MMYY (4 digits, month first)
  if (/^\d{4}$/.test(s)) {
    const mm = parseInt(s.slice(0, 2), 10);
    const yy = parseInt(s.slice(2, 4), 10);
    if (mm >= 1 && mm <= 12) return { mm, yy };
  }
  return null;
}

function strField(rec: DbfRecord, names: string[]): string {
  for (const n of names) {
    for (const key of Object.keys(rec)) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === n.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        const v = rec[key];
        if (v !== null && v !== undefined) return String(v).trim();
      }
    }
  }
  return '';
}

function numField(rec: DbfRecord, names: string[]): number {
  const s = strField(rec, names);
  return parseAmount(s);
}

function dateField(rec: DbfRecord, names: string[]): { mm: number; yy: number } | null {
  return parseMonthYear(strField(rec, names));
}

// --- ADD.txt / DEL.txt parser --------------------------------------------

export interface TxtParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
}

// Fixed-width PLI TXT layout (1-based positions):
//   7-9     (3)  STACODE
//   10-16   (7)  EMPNO
//   17-65   (49) Employee name (First + MI + Last, display only)
//   66-70   (5)  DEDCODE
//   71-84   (14) POLICYNO / Reference No.
//   85-90   (6)  Payroll Period — effective (MMYYYY)
//   91-96   (6)  Payroll Period — termination (MMYYYY)
//   97-104  (8)  Deduction Amount (implied 2-decimal, e.g. 00012345 = ₱123.45)
//   105-113 (9)  Principal (implied 2-decimal, e.g. 000012345 = ₱123.45)
//   114-120 (7)  Interest (implied 2-decimal, e.g. 0012345 = ₱123.45)
//   121-127 (7)  Charges (implied 2-decimal, e.g. 0012345 = ₱123.45)
//   137     (1)  Status Flag N = New Deduction (Add)
//   142     (1)  Status Flag D = Delete
function impliedDecimal(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n / 100;
}

function parsePeriodMmYyyy(raw: string): { mm: number; yy: number } | null {
  if (!/^\d{6}$/.test(raw)) return null;
  const mm = parseInt(raw.slice(0, 2), 10);
  const yyyy = parseInt(raw.slice(2, 6), 10);
  if (mm >= 1 && mm <= 12) return { mm, yy: yyyy % 100 };
  const yyyy2 = parseInt(raw.slice(0, 4), 10);
  const mm2 = parseInt(raw.slice(4, 6), 10);
  if (mm2 >= 1 && mm2 <= 12) return { mm: mm2, yy: yyyy2 % 100 };
  return null;
}

export function parseFixedWidthPliTxt(text: string): PliParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  const errors: string[] = [];
  const records: PliRecord[] = [];

  if (lines.length === 0) {
    return { records, errors: ['File is empty.'], totalLines: 0 };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Pad to 142 chars so all slices (including position 142) are safe
    const L = line.padEnd(142, ' ');

    const stacode      = L.slice(6, 9).trim();       // pos  7-9
    const empno        = L.slice(9, 16).trim();      // pos 10-16
    const nameRaw      = L.slice(16, 65).trim();     // pos 17-65
    const dedcode      = L.slice(65, 70).trim();     // pos 66-70
    const policyno     = L.slice(70, 84).trim();     // pos 71-84
    const effRaw       = L.slice(84, 90).trim();     // pos 85-90  effective MMYYYY
    const terRaw       = L.slice(90, 96).trim();     // pos 91-96  termination MMYYYY
    const amtRaw       = L.slice(96, 104).trim();    // pos 97-104 deduction amount
    const principalRaw = L.slice(104, 113).trim();   // pos 105-113
    const interestRaw  = L.slice(113, 120).trim();   // pos 114-120
    const chargesRaw   = L.slice(120, 127).trim();   // pos 121-127
    const flagN        = L.slice(136, 137).trim();   // pos 137  N = New/Add
    const flagD        = L.slice(141, 142).trim();   // pos 142  D = Delete

    const employeeName = nameRaw;

    const dedAmt    = impliedDecimal(amtRaw);
    const principal = impliedDecimal(principalRaw);
    const interest  = impliedDecimal(interestRaw);
    const charges   = impliedDecimal(chargesRaw);

    const eff = parsePeriodMmYyyy(effRaw);
    const ter = parsePeriodMmYyyy(terRaw);

    const isDelete = flagD.toUpperCase() === 'D';
    const isNew    = flagN.toUpperCase() === 'N';

    if (!stacode || !empno || !dedcode || !policyno) {
      errors.push(`Line ${lineNumber}: missing key field(s) — STACODE="${stacode}" EMPNO="${empno}" DEDCODE="${dedcode}" POLICYNO="${policyno}"`);
      continue;
    }

    records.push({
      stacode,
      empno,
      dedcode,
      policyno,
      employeeName,
      dedAmt,
      principal,
      interest,
      charges,
      proceeds: 0,
      effMm: eff?.mm ?? 1,
      effYy: eff?.yy ?? 0,
      terMm: ter ? ter.mm : null,
      terYy: ter ? ter.yy : null,
      status: isDelete ? 'FOR DELETION' : 'ACTIVE',
      agency: 'PLI',
      type: 'PLI',
      lineNumber,
      source: isDelete ? 'DEL' : 'ADD',
      raw: line,
    });
  }

  return { records, errors, totalLines: lines.length };
}

// Detect if a TXT file uses the fixed-width PLI layout.
// Heuristic: majority of non-empty lines are >= 100 chars AND splitting by
// common delimiters produces only 1 cell (no delimiter present).
function isFixedWidthPli(lines: string[]): boolean {
  const sample = lines.slice(0, Math.min(5, lines.length));
  const longEnough = sample.filter((l) => l.length >= 100).length;
  if (longEnough < Math.ceil(sample.length * 0.6)) return false;
  // Check that no common delimiter splits the first line into 3+ cells
  const first = sample[0];
  for (const d of ['|', '\t', ';', ',']) {
    if (first.split(d).length >= 3) return false;
  }
  return true;
}

// Parse ADD.txt — auto-detects fixed-width vs delimited format.
export function parseAddTxt(text: string, opts: TxtParseOptions = {}): PliParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const records: PliRecord[] = [];

  if (lines.length === 0) {
    return { records, errors: ['ADD.txt is empty.'], totalLines: 0 };
  }

  // Delegate to fixed-width parser when the file matches the DepEd PLI layout
  if (isFixedWidthPli(lines)) {
    return parseFixedWidthPliTxt(text);
  }

  const delimiter = opts.delimiter || detectDelimiter(lines[0]);
  const hasHeader = opts.hasHeader ?? true;

  let startIdx = 0;
  let colMap = { stacode: -1, empno: -1, dedcode: -1, policyno: -1, name: -1, amt: -1, eff: -1, status: -1, principal: -1, interest: -1, nd: -1 };

  if (hasHeader) {
    const headers = lines[0].split(delimiter).map(cleanCell);
    startIdx = 1;
    colMap.stacode = findColumn(headers, ['stacode', 'stationcode', 'station', 'stacod']);
    colMap.empno = findColumn(headers, ['empno', 'employeenumber', 'employee_no', 'emp']);
    colMap.dedcode = findColumn(headers, ['dedcode', 'deductioncode', 'deduction_code', 'code']);
    colMap.policyno = findColumn(headers, ['policyno', 'policy_no', 'policynumber', 'policy', 'refno', 'reference']);
    colMap.name = findColumn(headers, ['employeename', 'employee_name', 'name', 'fullname']);
    colMap.amt = findColumn(headers, ['deductionamount', 'deduction_amount', 'amount', 'amt', 'monthly', 'amortization', 'dedamt']);
    colMap.eff = findColumn(headers, ['effectivedate', 'effective_date', 'effdate', 'eff', 'startdate', 'start_date']);
    colMap.status = findColumn(headers, ['status', 'stat']);
    colMap.principal = findColumn(headers, ['principal', 'loanamount', 'loan_amount', 'loan']);
    colMap.interest = findColumn(headers, ['interest', 'int']);
    colMap.nd = findColumn(headers, ['nd', 'n/d', 'action', 'flag', 'indicator', 'type', 'txn', 'transaction']);
  }

  // Fallback positional order if no header match: stacode, empno, dedcode, policyno, name, amt
  if (colMap.stacode < 0) colMap.stacode = 0;
  if (colMap.empno < 0) colMap.empno = 1;
  if (colMap.dedcode < 0) colMap.dedcode = 2;
  if (colMap.policyno < 0) colMap.policyno = 3;
  if (colMap.name < 0) colMap.name = 4;
  if (colMap.amt < 0) colMap.amt = 5;
  if (colMap.eff < 0) colMap.eff = 6;
  if (colMap.status < 0) colMap.status = 7;
  if (colMap.nd < 0) colMap.nd = -1;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(delimiter).map(cleanCell);
    const lineNumber = i + 1;

    const stacode = cells[colMap.stacode] ?? '';
    const empno = cells[colMap.empno] ?? '';
    const dedcode = cells[colMap.dedcode] ?? '';
    const policyno = cells[colMap.policyno] ?? '';
    const employeeName = cells[colMap.name] ?? '';
    const dedAmt = parseAmount(cells[colMap.amt] ?? '0');
    const effRaw = cells[colMap.eff] ?? '';
    const status = (cells[colMap.status] ?? '').toUpperCase() || 'ACTIVE';
    const principal = parseAmount(cells[colMap.principal] ?? '0');
    const interest = parseAmount(cells[colMap.interest] ?? '0');
    const ndCode = (cells[colMap.nd] ?? '').trim().toUpperCase();

    const eff = parseMonthYear(effRaw);

    // N/D mapping: N = New Loan (ADD), D = Delete (TERMINATE)
    const isDelete = ndCode === 'D' || ndCode === 'DELETE';

    records.push({
      stacode,
      empno,
      dedcode,
      policyno,
      employeeName,
      dedAmt: isDelete ? 0 : dedAmt,
      principal: isDelete ? 0 : principal,
      interest: isDelete ? 0 : interest,
      charges: 0,
      proceeds: 0,
      effMm: isDelete ? 1 : (eff?.mm ?? 1),
      effYy: isDelete ? 0 : (eff?.yy ?? 0),
      terMm: null,
      terYy: null,
      status: isDelete ? 'FOR DELETION' : status,
      agency: 'PLI',
      type: 'PLI',
      lineNumber,
      source: isDelete ? 'DEL' : 'ADD',
      raw: line,
    });
  }

  return { records, errors, totalLines: lines.length };
}

// Parse DEL.txt — a separate deletion file using the same fixed-width PLI layout.
// All records are treated as FOR DELETION regardless of the status flag at pos 142.
// Records are matched against existing deductions in the database on the 4-key
// composite (STACODE + EMPNO + DEDCODE + POLICYNO) and deleted when found.
export function parseDelTxt(text: string): PliParseResult {
  const result = parseFixedWidthPliTxt(text);

  // Override: every record in a DEL file is for deletion, regardless of flag
  for (const rec of result.records) {
    rec.source = 'DEL';
    rec.status = 'FOR DELETION';
  }

  if (result.records.length === 0 && result.errors.length === 0) {
    result.errors.push('DEL file contains no valid records.');
  }

  return result;
}

// --- DEDFILE.DBF parser ---------------------------------------------------

export function parseDedfileDbf(data: Uint8Array): PliParseResult {
  const errors: string[] = [];
  const records: PliRecord[] = [];

  let decoded: { fields: { name: string }[]; records: DbfRecord[] };
  try {
    decoded = decodeDbf(data);
  } catch (e) {
    return { records, errors: [`Could not read DEDFILE.DBF: ${(e as Error).message}`], totalLines: 0 };
  }

  for (let i = 0; i < decoded.records.length; i++) {
    const rec = decoded.records[i];
    const stacode = strField(rec, ['stacode', 'stationcode', 'station']);
    const empno = strField(rec, ['empno', 'employeenumber', 'employee_no', 'emp']);
    const dedcode = strField(rec, ['dedcode', 'deductioncode', 'deduction_code', 'code']);
    const policyno = strField(rec, ['policyno', 'policy_no', 'policynumber', 'policy', 'refno']);
    const employeeName = strField(rec, ['employeename', 'employee_name', 'name', 'fullname']);
    const dedAmt = numField(rec, ['deductionamount', 'deduction_amount', 'dedamt', 'amount', 'amt', 'monthly', 'amortization']);
    const principal = numField(rec, ['principal', 'loanamount', 'loan_amount', 'loan']);
    const interest = numField(rec, ['interest', 'int']);
    const charges = numField(rec, ['charges', 'charge', 'fees', 'fee']);
    const proceeds = numField(rec, ['proceeds', 'proceed']);
    const eff = dateField(rec, ['effectivedate', 'effective_date', 'effdate', 'eff', 'startdate', 'start_date']);
    const ter = dateField(rec, ['terminationdate', 'termination_date', 'terdate', 'termdate', 'enddate', 'end_date', 'ter']);
    let status = strField(rec, ['status', 'stat']).toUpperCase();
    if (!status) status = 'ACTIVE';

    records.push({
      stacode,
      empno,
      dedcode,
      policyno,
      employeeName,
      dedAmt,
      principal,
      interest,
      charges,
      proceeds,
      effMm: eff?.mm ?? 1,
      effYy: eff?.yy ?? 0,
      terMm: ter?.mm ?? null,
      terYy: ter?.yy ?? null,
      status,
      agency: 'PLI',
      type: 'PLI',
      lineNumber: i + 1,
      source: 'DBF',
      raw: '',
    });
  }

  return { records, errors, totalLines: decoded.records.length };
}

// --- Validation -----------------------------------------------------------

export interface ValidationError {
  stacode: string;
  empno: string;
  dedcode: string;
  policyno: string;
  employeeName: string;
  error: string;
  source: 'ADD' | 'DEL' | 'DBF' | 'GSIS';
  lineNumber: number;
}

export interface ValidationContext {
  employees: Map<string, { id: string; stacode: string; empno: string }>;
  deductionCodes: Set<string>;
}

export function validatePliRecords(records: PliRecord[], ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    const key = `${rec.stacode}|${rec.empno}|${rec.dedcode}|${rec.policyno}`;
    const recErrors: string[] = [];

    if (!rec.stacode.trim()) recErrors.push('Missing STACODE');
    if (!rec.empno.trim()) recErrors.push('Missing EMPNO');
    if (!rec.dedcode.trim()) recErrors.push('Missing DEDCODE');
    if (!rec.policyno.trim()) recErrors.push('Missing POLICYNO');

    if (rec.stacode.trim() && rec.empno.trim()) {
      const empKey = `${rec.stacode}|${rec.empno}`;
      if (!ctx.employees.has(empKey)) {
        recErrors.push('Employee Not Found');
        rec.status = 'INACTIVE';
      }
    }

    if (rec.dedcode.trim() && !ctx.deductionCodes.has(rec.dedcode.trim().toUpperCase())) {
      recErrors.push('Invalid Deduction Code');
    }

    if (seen.has(key)) {
      recErrors.push('Duplicate Record');
    }
    seen.add(key);

    if (recErrors.length > 0) {
      errors.push({
        stacode: rec.stacode,
        empno: rec.empno,
        dedcode: rec.dedcode,
        policyno: rec.policyno,
        employeeName: rec.employeeName,
        error: recErrors.join('; '),
        source: rec.source,
        lineNumber: rec.lineNumber,
      });
    }
  }

  return errors;
}

// --- Matching -------------------------------------------------------------

export interface MatchedRecord {
  record: PliRecord;
  action: RecordAction;
  existingId?: string;
  error?: string;
}

export interface ExistingDeduction {
  id: string;
  stacode: string;
  empno: string;
  dedcode: string;
  policyno: string;
}

export function classifyRecords(
  addRecords: PliRecord[],
  delRecords: PliRecord[],
  existing: Map<string, ExistingDeduction>,
  validationErrors: ValidationError[],
): MatchedRecord[] {
  const errorKeys = new Set(
    validationErrors.map((e) => `${e.stacode}|${e.empno}|${e.dedcode}|${e.policyno}`),
  );
  const results: MatchedRecord[] = [];

  for (const rec of addRecords) {
    const key = `${rec.stacode}|${rec.empno}|${rec.dedcode}|${rec.policyno}`;
    if (errorKeys.has(key)) {
      results.push({ record: rec, action: 'ERROR', error: 'Validation failed' });
      continue;
    }
    if (existing.has(key)) {
      results.push({ record: rec, action: 'UPDATE', existingId: existing.get(key)!.id });
    } else {
      results.push({ record: rec, action: 'ADD' });
    }
  }

  for (const rec of delRecords) {
    // Match on EMPNO + POLICYNO + AMOUNT (stacode in DB is often "0", so unreliable)
    const delKey = `${rec.empno}|${rec.policyno}|${rec.dedAmt}`;
    const fullKey = `${rec.stacode}|${rec.empno}|${rec.dedcode}|${rec.policyno}`;
    if (errorKeys.has(fullKey)) {
      results.push({ record: rec, action: 'ERROR', error: 'Validation failed' });
      continue;
    }
    const found = existing.get(delKey) ?? existing.get(fullKey);
    if (found) {
      results.push({ record: rec, action: 'TERMINATE', existingId: found.id });
    } else {
      results.push({ record: rec, action: 'ERROR', error: 'Record not found for termination' });
    }
  }

  return results;
}
