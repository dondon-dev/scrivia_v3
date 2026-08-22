// GSIS deduction file parser.
// Parses a single GSIS TXT file into normalized records ready for matching
// against payroll_deductions on the 4-key composite:
//   STACODE + EMPNO + DEDCODE + POLICYNO
//
// Unlike the PLI module (ADD.txt + DEL.txt + DEDFILE.DBF), the GSIS module
// processes a single TXT file containing all deduction records. Records are
// classified as ADD or UPDATE only — there is no termination flow.

import {
  type PliRecord, type PliParseResult, type ValidationError, type ValidationContext,
  type MatchedRecord, type ExistingDeduction, type RecordAction,
  parseMonthYear, cleanCell, findColumn, detectDelimiter, parseAmount,
} from '@/lib/pliParser';

export type { PliRecord, PliParseResult, ValidationError, ValidationContext, MatchedRecord, ExistingDeduction, RecordAction };

// GSIS policy numbers are typically numeric or alphanumeric with a minimum
// length of 5. This catches obviously invalid entries like blank, single-char,
// or non-alphanumeric policy numbers while accepting real GSIS formats like
// "0123456789", "GSIS-2024-0001", "PL000123456".
const POLICYNO_MIN_LENGTH = 5;
const POLICYNO_PATTERN = /^[A-Z0-9][A-Z0-9\-]{3,}$/i;

export function validatePolicyNumber(policyno: string): boolean {
  const cleaned = policyno.trim();
  if (cleaned.length < POLICYNO_MIN_LENGTH) return false;
  return POLICYNO_PATTERN.test(cleaned);
}

// Parse the GSIS TXT file — auto-detects delimiter and header.
export function parseGsisTxt(text: string): PliParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const records: PliRecord[] = [];

  if (lines.length === 0) {
    return { records, errors: ['GSIS file is empty.'], totalLines: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);

  // Detect header by looking for recognizable column names in the first line
  const headerCells = lines[0].split(delimiter).map(cleanCell);
  const lowerHeaders = headerCells.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasHeader = lowerHeaders.some(
    (h) => h.includes('stacode') || h.includes('empno') || h.includes('dedcode') || h.includes('policyno') || h.includes('amount'),
  );

  let startIdx = 0;
  let colMap = {
    stacode: -1, empno: -1, dedcode: -1, policyno: -1, name: -1,
    amt: -1, eff: -1, ter: -1, status: -1, principal: -1, interest: -1,
  };

  if (hasHeader) {
    startIdx = 1;
    colMap.stacode = findColumn(headerCells, ['stacode', 'stationcode', 'station', 'stacod']);
    colMap.empno = findColumn(headerCells, ['empno', 'employeenumber', 'employee_no', 'emp']);
    colMap.dedcode = findColumn(headerCells, ['dedcode', 'deductioncode', 'deduction_code', 'code']);
    colMap.policyno = findColumn(headerCells, ['policyno', 'policy_no', 'policynumber', 'policy', 'refno', 'reference']);
    colMap.name = findColumn(headerCells, ['employeename', 'employee_name', 'name', 'fullname']);
    colMap.amt = findColumn(headerCells, ['deductionamount', 'deduction_amount', 'amount', 'amt', 'monthly', 'amortization', 'dedamt']);
    colMap.eff = findColumn(headerCells, ['effectivedate', 'effective_date', 'effdate', 'eff', 'startdate', 'start_date']);
    colMap.ter = findColumn(headerCells, ['terminationdate', 'termination_date', 'terdate', 'termdate', 'enddate', 'end_date', 'ter']);
    colMap.status = findColumn(headerCells, ['status', 'stat']);
    colMap.principal = findColumn(headerCells, ['principal', 'loanamount', 'loan_amount', 'loan']);
    colMap.interest = findColumn(headerCells, ['interest', 'int']);
  }

  // Fallback positional order: stacode, empno, dedcode, policyno, name, amt, eff, ter, status
  if (colMap.stacode < 0) colMap.stacode = 0;
  if (colMap.empno < 0) colMap.empno = 1;
  if (colMap.dedcode < 0) colMap.dedcode = 2;
  if (colMap.policyno < 0) colMap.policyno = 3;
  if (colMap.name < 0) colMap.name = 4;
  if (colMap.amt < 0) colMap.amt = 5;
  if (colMap.eff < 0) colMap.eff = 6;
  if (colMap.ter < 0) colMap.ter = 7;
  if (colMap.status < 0) colMap.status = 8;

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
    const terRaw = cells[colMap.ter] ?? '';
    const status = (cells[colMap.status] ?? '').toUpperCase() || 'ACTIVE';
    const principal = parseAmount(cells[colMap.principal] ?? '0');
    const interest = parseAmount(cells[colMap.interest] ?? '0');

    const eff = parseMonthYear(effRaw);
    const ter = parseMonthYear(terRaw);

    records.push({
      stacode,
      empno,
      dedcode,
      policyno,
      employeeName,
      dedAmt,
      principal,
      interest,
      charges: 0,
      proceeds: 0,
      effMm: eff?.mm ?? 1,
      effYy: eff?.yy ?? 0,
      terMm: ter?.mm ?? null,
      terYy: ter?.yy ?? null,
      status,
      agency: 'GSIS',
      type: 'GSIS',
      lineNumber,
      source: 'GSIS',
      raw: line,
    });
  }

  return { records, errors, totalLines: lines.length };
}

// Validate GSIS records — extends the shared validation with policy number
// format checking.
export function validateGsisRecords(records: PliRecord[], ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    const key = `${rec.stacode}|${rec.empno}|${rec.dedcode}|${rec.policyno}`;
    const recErrors: string[] = [];

    // Required field checks
    if (!rec.stacode.trim()) recErrors.push('Missing STACODE');
    if (!rec.empno.trim()) recErrors.push('Missing EMPNO');
    if (!rec.dedcode.trim()) recErrors.push('Missing DEDCODE');
    if (!rec.policyno.trim()) {
      recErrors.push('Missing POLICYNO');
    } else if (!validatePolicyNumber(rec.policyno)) {
      recErrors.push('Invalid Policy Number');
    }

    // Employee validation
    if (rec.stacode.trim() && rec.empno.trim()) {
      const empKey = `${rec.stacode}|${rec.empno}`;
      if (!ctx.employees.has(empKey)) {
        recErrors.push('Employee Not Found');
      }
    }

    // Deduction code validation
    if (rec.dedcode.trim() && !ctx.deductionCodes.has(rec.dedcode.trim().toUpperCase())) {
      recErrors.push('Invalid Deduction Code');
    }

    // Duplicate detection
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

// Classify GSIS records — ADD or UPDATE only (no termination).
export function classifyGsisRecords(
  records: PliRecord[],
  existing: Map<string, ExistingDeduction>,
  validationErrors: ValidationError[],
): MatchedRecord[] {
  const errorKeys = new Set(
    validationErrors.map((e) => `${e.stacode}|${e.empno}|${e.dedcode}|${e.policyno}`),
  );
  const results: MatchedRecord[] = [];

  for (const rec of records) {
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

  return results;
}
