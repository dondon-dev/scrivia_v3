// Parse a plain-text deduction upload file into rows.
// Supported formats:
//   1. Delimited (CSV / pipe / tab / semicolon) with a header row
//   2. Fixed-width positional (no delimiter) using a configurable column map
// The parser auto-detects the delimiter from the header line.

import type { DeductionUploadRow } from '@/types/payroll';

export interface ParseOptions {
  delimiter?: string;        // override auto-detect
  hasHeader: boolean;        // first line is a header
  // Column mapping (1-indexed positions). If null, parse tries header names.
  employeeNumberCol?: number;
  deductionCodeCol?: number;
  deductionNameCol?: number;
  amountCol?: number;
  referenceCol?: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  delimiter: string;
  headers: string[];
  rawLines: string[];
  errors: string[];
}

export interface ParsedRow {
  lineNumber: number;
  employee_number: string;
  deduction_code: string;
  deduction_name: string;
  amount: number;
  reference: string;
  raw: string;
}

function detectDelimiter(sample: string): string {
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

function cleanCell(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

function findColumn(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseDeductionFile(text: string, options: ParseOptions): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const headers: string[] = [];

  if (lines.length === 0) {
    return { rows, delimiter: ',', headers, rawLines: lines, errors: ['File is empty.'] };
  }

  const delimiter = options.delimiter || detectDelimiter(lines[0]);
  let startIdx = 0;
  let colMap = {
    emp: options.employeeNumberCol ? options.employeeNumberCol - 1 : -1,
    code: options.deductionCodeCol ? options.deductionCodeCol - 1 : -1,
    name: options.deductionNameCol ? options.deductionNameCol - 1 : -1,
    amount: options.amountCol ? options.amountCol - 1 : -1,
    ref: options.referenceCol ? options.referenceCol - 1 : -1,
  };

  if (options.hasHeader) {
    const headerLine = lines[0].split(delimiter).map(cleanCell);
    headers.push(...headerLine);
    startIdx = 1;
    if (colMap.emp < 0) colMap.emp = findColumn(headerLine, ['empno', 'employeenumber', 'employee_no', 'empno', 'id', 'employee']);
    if (colMap.code < 0) colMap.code = findColumn(headerLine, ['code', 'deductioncode', 'deduction_code', 'type']);
    if (colMap.name < 0) colMap.name = findColumn(headerLine, ['name', 'deductionname', 'deduction_name', 'description', 'desc']);
    if (colMap.amount < 0) colMap.amount = findColumn(headerLine, ['amount', 'amt', 'value', 'deduction']);
    if (colMap.ref < 0) colMap.ref = findColumn(headerLine, ['reference', 'ref', 'refno', 'reference_no']);
  }

  // Fallback: assume standard order emp, code, name, amount, ref
  if (colMap.emp < 0) colMap.emp = 0;
  if (colMap.code < 0) colMap.code = 1;
  if (colMap.name < 0) colMap.name = 2;
  if (colMap.amount < 0) colMap.amount = 3;
  if (colMap.ref < 0) colMap.ref = 4;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(delimiter).map(cleanCell);
    const lineNumber = i + 1;
    const emp = cells[colMap.emp] ?? '';
    const code = cells[colMap.code] ?? '';
    const name = cells[colMap.name] ?? '';
    const amountStr = cells[colMap.amount] ?? '0';
    const ref = cells[colMap.ref] ?? '';

    if (!emp) {
      errors.push(`Line ${lineNumber}: missing employee number.`);
      continue;
    }

    const amount = parseAmount(amountStr);
    if (amount === null) {
      errors.push(`Line ${lineNumber}: invalid amount "${amountStr}" for employee ${emp}.`);
      continue;
    }

    rows.push({
      lineNumber,
      employee_number: emp,
      deduction_code: code || 'MISC',
      deduction_name: name || code || 'Deduction',
      amount,
      reference: ref,
      raw: line,
    });
  }

  return { rows, delimiter, headers, rawLines: lines, errors };
}

function parseAmount(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[,$]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * Match parsed rows against known employee numbers.
 * Returns upload rows with matched flag + employee id when found.
 */
export function matchRowsToEmployees(
  rows: ParsedRow[],
  employeeNumbers: Set<string>,
): DeductionUploadRow[] {
  return rows.map((r) => {
    const matched = employeeNumbers.has(r.employee_number);
    return {
      employee_number: r.employee_number,
      deduction_code: r.deduction_code,
      deduction_name: r.deduction_name,
      amount: r.amount,
      reference: r.reference,
      matched,
      error: matched ? undefined : 'No employee found with this number.',
    };
  });
}
