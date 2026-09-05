// ============================================================
// FOXPRO REPORT ENGINE — Payroll Register & Official Payslip
//
// This module reproduces the legacy DepEd FOXPRO report framework as a
// pure data/geometry engine, deliberately separate from the SaaS UI:
// it knows report coordinates, column widths (in characters), spacing
// rules, signatory templates, deduction rendering rules, and how to
// shape payroll computation outputs — nothing about styling, cards, or
// responsive layout. The views only render what this engine produces.
//
// Typography: fixed-width Courier throughout. Column alignment depends
// on character count (1ch), never on pixels or responsive reflow.
// ============================================================

import type {
  Employee, PayrollEntry, Deduction, PayrollDeduction, UndeductedObligation,
  DeductionCode, PayPeriod, PayentRecord,
} from '@/types/payroll';

// ── Typography (FOXPRO spec) ────────────────────────────────────────────────
export const FOXPRO_FONT = "'Courier New', 'Liberation Mono', 'Nimbus Mono PS', Courier, monospace";

/** Level 1 — department header / report title. */
export const FONT_H1 = 10; // pt, bold
/** Level 2 — payroll type. */
export const FONT_H2 = 9; // pt, bold
/** Level 3 — period information. */
export const FONT_H3 = 8; // pt
/** Levels 4–8 — columns, data, deductions, totals. */
export const FONT_BODY = 8; // pt
export const FONT_REGISTER_BODY = 6.6; // pt — condensed, so all 138 fixed columns fit the legal page

// ── Page (FOXPRO spec) ──────────────────────────────────────────────────────
export const PAGE_WIDTH_PX = 816;  // 8.5in @ 96dpi
export const PAGE_HEIGHT_PX = 1248; // 13in @ 96dpi
export const PAGE_MARGIN_MM = 10;

// ── Register column width map (characters) — fixed, no auto-resize ─────────
export const REGISTER_COLUMNS: { key: string; label: string; width: number }[] = [
  { key: 'empno', label: 'EMP NO', width: 12 },
  { key: 'name', label: 'NAME OF EMPLOYEE', width: 35 },
  { key: 'poscode', label: 'POS', width: 6 },
  { key: 'grade', label: 'GRD', width: 3 },
  { key: 'step', label: 'STEP', width: 3 },
  { key: 'salary', label: 'MONTHLY SALARY', width: 12 },
  { key: 'pera', label: 'P.E.R.A.', width: 10 },
  { key: 'deductions', label: 'TOTAL DEDUCTIONS', width: 12 },
  { key: 'net', label: 'NET AMOUNT', width: 12 },
  { key: 'account', label: 'ACCOUNT NUMBER', width: 15 },
  { key: 'signature', label: 'SIGNATURE', width: 18 },
];

export const REGISTER_COLUMNS_TOTAL_CHARS = REGISTER_COLUMNS.reduce((s, c) => s + c.width, 0);

// ── Signatory template (FOXPRO spec) ────────────────────────────────────────
export const SIGNATORIES: { role: string; position: string }[] = [
  { role: 'PREPARED BY', position: 'PAYROLL OFFICER' },
  { role: 'CHECKED BY', position: 'ACCOUNTANT' },
  { role: 'VERIFIED BY', position: 'BUDGET OFFICER' },
  { role: 'CERTIFIED CORRECT', position: 'HRMO' },
  { role: 'APPROVED BY', position: 'ASDS' },
  { role: 'NOTED BY', position: 'SDS' },
];

// ── Tax status labels (FOXPRO spec examples) ────────────────────────────────
export const TAX_STATUS_LABELS: Record<string, string> = {
  S: 'SINGLE', M: 'MARRIED', ME1: 'MARRIED - 1 DEPENDENT',
  ME2: 'MARRIED - 2 DEPENDENTS', ME3: 'MARRIED - 3 DEPENDENTS',
  ME4: 'MARRIED - 4 DEPENDENTS', HF: 'HEAD OF FAMILY', Z: 'ZERO',
};

// ── Formatting helpers (character-based) ────────────────────────────────────
const ph = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Right-aligned money string padded to `width` characters (e.g. " 12,345.67"). */
export function foxMoney(n: number | string | null | undefined, width = 12): string {
  return ph.format(Number(n) || 0).padStart(width);
}

/** Left-aligned text truncated/padded to `width` characters (uppercase). */
export function foxText(s: string | number | null | undefined, width: number): string {
  const t = String(s ?? '').toUpperCase();
  return t.length > width ? t.slice(0, width) : t.padEnd(width);
}

/** Center text within `width` characters. */
export function foxCenter(s: string, width: number): string {
  const t = String(s).toUpperCase();
  if (t.length >= width) return t.slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t + ' '.repeat(width - t.length - pad);
}

/** Text rule: `n` repetitions of `ch` (used for separators). */
export function foxRule(ch: string, n = REGISTER_COLUMNS_TOTAL_CHARS): string {
  return ch.repeat(n);
}

/** Format an ISO date as MM/DD/YYYY. */
export function foxDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${dt.getFullYear()}`;
}

/** Format an ISO date as "August 31, 2026" (period-ending line). */
export function foxLongDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export const TAKEHOME_MONTHS = 'S O N D J F M A M J J A';

export function civilStatusLabel(civilstat: string | null | undefined): string {
  const c = (civilstat ?? '').trim().toUpperCase();
  return TAX_STATUS_LABELS[c] ?? (c || '');
}

// ── Register builders ───────────────────────────────────────────────────────

export interface FoxDedLine {
  code: string;
  description: string;
  amount: number;
  effmm: string;
  effyy: string;
  termm: string;
  teryy: string;
}

export interface FoxRegisterBlock {
  employee: Employee;
  entry: PayrollEntry;
  empno: string;
  name: string;             // LASTNAME, FIRSTNAME MI
  poscode: string;
  grade: string;
  step: string;
  salary: number;
  pera: number;
  totalDeductions: number;
  net: number;
  account: string;
  bankName: string;
  stacode: string;
  taxCode: string;
  civilStatus: string;
  dependents: number;
  exemption: number;
  firstHalf: number;
  secondHalf: number;
  deductions: FoxDedLine[];
}

export interface FoxRegisterTotals {
  employees: number;
  salary: number;
  pera: number;
  gross: number;
  deductions: number;
  net: number;
}

export interface FoxBankTotal {
  bank: string;
  count: number;
  net: number;
}

export interface FoxDedTotal {
  code: string;
  name: string;
  count: number;
  total: number;
}

export interface FoxRegisterModel {
  blocks: FoxRegisterBlock[];
  totals: FoxRegisterTotals;
  bankTotals: FoxBankTotal[];
  dedTotals: FoxDedTotal[];
  /** True when the scope has no employees with entries in the period. */
  empty: boolean;
}

export interface FoxRegisterParams {
  period: PayPeriod | null | undefined;
  employees: Employee[];
  entries: PayrollEntry[];
  deductions: Deduction[];
  payrollDeds: PayrollDeduction[];
  dedCodes: DeductionCode[];
  payent: PayentRecord[];
  scopedCodes?: { regcode: string; divcode: string }[];
}

/**
 * Builds the full register model. Deduction lines are taken from the
 * period's computed deduction rows in stored order (first-in-first-serve —
 * never sorted), with effectivity/termination merged from the DEDFILE
 * masterfile for each code. Half-pay amounts come from the PYENT hashfile.
 */
export function buildRegisterModel(p: FoxRegisterParams): FoxRegisterModel {
  const { employees, entries, deductions, payrollDeds, payent } = p;
  const entryByEmp = new Map<string, PayrollEntry>();
  entries.forEach((e) => entryByEmp.set(e.employee_id, e));

  const dedByEmp = new Map<string, Deduction[]>();
  [...deductions]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
    .forEach((d) => {
      const arr = dedByEmp.get(d.employee_id) ?? [];
      arr.push(d);
      dedByEmp.set(d.employee_id, arr);
    });

  const pdByEmp = new Map<string, PayrollDeduction[]>();
  payrollDeds.forEach((pd) => {
    if (!pd.employee_id) return;
    const arr = pdByEmp.get(pd.employee_id) ?? [];
    arr.push(pd);
    pdByEmp.set(pd.employee_id, arr);
  });

  const payentByEmp = new Map<string, { first: number; second: number }>();
  payent.forEach((pe) => {
    const cur = payentByEmp.get(pe.empno) ?? { first: 0, second: 0 };
    if (pe.half === 'first') cur.first += Number(pe.amount) || 0;
    else if (pe.half === 'second') cur.second += Number(pe.amount) || 0;
    payentByEmp.set(pe.empno, cur);
  });

  const blocks: FoxRegisterBlock[] = [];
  for (const emp of employees) {
    const entry = entryByEmp.get(emp.id);
    if (!entry) continue; // register covers only employees in this payroll run
    const empDeds = dedByEmp.get(emp.id) ?? [];
    const empPD = pdByEmp.get(emp.id) ?? [];
    const half = payentByEmp.get(emp.empno || emp.employee_number || '') ?? { first: 0, second: 0 };

    const deductionsLines: FoxDedLine[] = empDeds.map((d) => {
      const pd = empPD.find((x) => x.dedcode === d.deduction_code);
      return {
        code: d.deduction_code,
        description: d.deduction_name || dedName(p, d.deduction_code),
        amount: Number(d.amount) || 0,
        effmm: pd?.effmm != null ? String(pd.effmm).padStart(2, '0') : '',
        effyy: pd?.effyy != null ? String(pd.effyy) : '',
        termm: pd?.termm != null ? String(pd.termm).padStart(2, '0') : '',
        teryy: pd?.teryy != null ? String(pd.teryy) : '',
      };
    });

    blocks.push({
      employee: emp,
      entry,
      empno: emp.empno || emp.employee_number || '',
      name: `${emp.lname || emp.last_name || ''}, ${emp.fname || emp.first_name || ''}${emp.mi ? ' ' + emp.mi : ''}`.toUpperCase(),
      poscode: emp.poscode || '',
      grade: emp.grade != null ? String(emp.grade) : '',
      step: emp.step != null ? String(emp.step) : '',
      salary: Number(emp.basic ?? emp.basic_salary) || 0,
      pera: Number(emp.pera) || 0,
      totalDeductions: Number(entry.total_deductions) || 0,
      net: Number(entry.net_pay) || 0,
      account: emp.account || emp.bank_account || '',
      bankName: emp.bank_name || '',
      stacode: emp.stacode || '',
      taxCode: emp.taxcode || '',
      civilStatus: civilStatusLabel(emp.civilstat),
      dependents: [emp.depname1, emp.depname2, emp.depname3, emp.depname4].filter((d) => d).length,
      exemption: Number(emp.taxref) || 0,
      firstHalf: half.first,
      secondHalf: half.second,
      deductions: deductionsLines,
    });
  }

  const totals: FoxRegisterTotals = blocks.reduce(
    (s, b) => ({
      employees: s.employees + 1,
      salary: s.salary + b.salary,
      pera: s.pera + b.pera,
      gross: s.gross + Number(b.entry.gross_pay) || 0,
      deductions: s.deductions + b.totalDeductions,
      net: s.net + b.net,
    }),
    { employees: 0, salary: 0, pera: 0, gross: 0, deductions: 0, net: 0 },
  );

  const bankTotals = new Map<string, FoxBankTotal>();
  blocks.forEach((b) => {
    const key = b.bankName || '(NO BANK)';
    const cur = bankTotals.get(key) ?? { bank: key, count: 0, net: 0 };
    cur.count += 1;
    cur.net += b.net;
    bankTotals.set(key, cur);
  });

  const dedTotals = new Map<string, FoxDedTotal>();
  deductions.forEach((d) => {
    const cur = dedTotals.get(d.deduction_code) ?? {
      code: d.deduction_code, name: d.deduction_name || dedName(p, d.deduction_code), count: 0, total: 0,
    };
    cur.count += 1;
    cur.total += Number(d.amount) || 0;
    dedTotals.set(d.deduction_code, cur);
  });

  return {
    blocks,
    totals,
    bankTotals: Array.from(bankTotals.values()).sort((a, b) => a.bank.localeCompare(b.bank)),
    dedTotals: Array.from(dedTotals.values()).sort((a, b) => a.code.localeCompare(b.code)),
    empty: blocks.length === 0,
  };
}

function dedName(p: FoxRegisterParams, code: string): string {
  return p.dedCodes.find((c) => c.dedcode === code)?.dedname ?? code;
}

// ── Payslip builders ────────────────────────────────────────────────────────

export interface FoxPayslipModel {
  employee: Employee;
  entry: PayrollEntry;
  name: string;
  empno: string;
  regcode: string;
  divcode: string;
  station: string;
  hiredate: string;
  position: string;
  grade: string;
  step: string;
  account: string;
  taxCode: string;
  tin: string;
  gsisNo: string;
  philhealthNo: string;
  pagibigNo: string;
  basic: number;
  pera: number;
  gross: number;
  totalDeductions: number;
  net: number;
  firstHalf: number;
  secondHalf: number;
  deductions: FoxDedLine[];
  undeducted: { code: string; description: string; amount: number }[];
}

export interface FoxPayslipParams {
  period: PayPeriod | null | undefined;
  employees: Employee[];
  entries: PayrollEntry[];
  deductions: Deduction[];
  payrollDeds: PayrollDeduction[];
  undeducted: UndeductedObligation[];
  dedCodes: DeductionCode[];
  payent: PayentRecord[];
  schools: { school_code: string; school_name: string }[];
}

/**
 * Builds one payslip per employee with a payroll entry in the period.
 * Deduction records go in stored order; undeducted obligations render in
 * the right-hand column; half-pay amounts come from the PYENT hashfile.
 */
export function buildPayslipModels(p: FoxPayslipParams): FoxPayslipModel[] {
  const { employees, entries, deductions, payrollDeds, undeducted, payent, schools } = p;
  const entryByEmp = new Map<string, PayrollEntry>();
  entries.forEach((e) => entryByEmp.set(e.employee_id, e));

  const dedByEmp = new Map<string, Deduction[]>();
  [...deductions]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
    .forEach((d) => {
      const arr = dedByEmp.get(d.employee_id) ?? [];
      arr.push(d);
      dedByEmp.set(d.employee_id, arr);
    });

  const pdByEmp = new Map<string, PayrollDeduction[]>();
  payrollDeds.forEach((pd) => {
    if (!pd.employee_id) return;
    const arr = pdByEmp.get(pd.employee_id) ?? [];
    arr.push(pd);
    pdByEmp.set(pd.employee_id, arr);
  });

  const undedByEmp = new Map<string, UndeductedObligation[]>();
  undeducted.forEach((u) => {
    const arr = undedByEmp.get(u.employee_id) ?? [];
    arr.push(u);
    undedByEmp.set(u.employee_id, arr);
  });

  const payentByEmp = new Map<string, { first: number; second: number }>();
  payent.forEach((pe) => {
    const cur = payentByEmp.get(pe.empno) ?? { first: 0, second: 0 };
    if (pe.half === 'first') cur.first += Number(pe.amount) || 0;
    else if (pe.half === 'second') cur.second += Number(pe.amount) || 0;
    payentByEmp.set(pe.empno, cur);
  });

  const schoolMap = new Map(schools.map((s) => [s.school_code, s.school_name]));
  const out: FoxPayslipModel[] = [];

  for (const emp of employees) {
    const entry = entryByEmp.get(emp.id);
    if (!entry) continue;
    const empDeds = dedByEmp.get(emp.id) ?? [];
    const empPD = pdByEmp.get(emp.id) ?? [];
    const half = payentByEmp.get(emp.empno || emp.employee_number || '') ?? { first: 0, second: 0 };

    out.push({
      employee: emp,
      entry,
      name: `${emp.lname || emp.last_name || ''}, ${emp.fname || emp.first_name || ''}${emp.mi ? ' ' + emp.mi : ''}`.toUpperCase(),
      empno: emp.empno || emp.employee_number || '',
      regcode: emp.regcode || '',
      divcode: emp.divcode || '',
      station: schoolMap.get(emp.stacode || '') ?? (emp.stacode || ''),
      hiredate: foxDate(emp.hiredate ?? emp.hire_date),
      position: (emp.position || emp.poscode || '').toUpperCase(),
      grade: emp.grade != null ? String(emp.grade) : '',
      step: emp.step != null ? String(emp.step) : '',
      account: emp.account || emp.bank_account || '',
      taxCode: emp.taxcode || '',
      tin: emp.tin || '',
      gsisNo: emp.gsis_pn || emp.gsis_id || '',
      philhealthNo: emp.phic_id || emp.philhealth_number || '',
      pagibigNo: emp.hdmf_id || emp.pagibig_number || '',
      basic: Number(emp.basic ?? emp.basic_salary) || 0,
      pera: Number(emp.pera) || 0,
      gross: Number(entry.gross_pay) || 0,
      totalDeductions: Number(entry.total_deductions) || 0,
      net: Number(entry.net_pay) || 0,
      firstHalf: half.first,
      secondHalf: half.second,
      deductions: empDeds.map((d) => {
        const pd = empPD.find((x) => x.dedcode === d.deduction_code);
        return {
          code: d.deduction_code,
          description: d.deduction_name || dedName(p, d.deduction_code),
          amount: Number(d.amount) || 0,
          effmm: pd?.effmm != null ? String(pd.effmm).padStart(2, '0') : '',
          effyy: pd?.effyy != null ? String(pd.effyy) : '',
          termm: pd?.termm != null ? String(pd.termm).padStart(2, '0') : '',
          teryy: pd?.teryy != null ? String(pd.teryy) : '',
        };
      }),
      undeducted: (undedByEmp.get(emp.id) ?? []).map((u) => ({
        code: u.deduction_code,
        description: u.deduction_description,
        amount: Number(u.undeducted_amount) || 0,
      })),
    });
  }

  return out;
}
