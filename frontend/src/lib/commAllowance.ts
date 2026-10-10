// ── Communication Allowance Payroll — engine ─────────────────────────────────
// Department of Education, Division of Calamba City · "Other Payroll" module.

import ExcelJS from 'exceljs';
import { supabase, fetchAll, chunkedIn } from './pb';
import { generateCsv, downloadFile, currency } from './reports';
import { normalizeRole } from '@/lib/authz';
import { caSchoolForEmployee } from '@/lib/assignedSchool';
import type { UserRole } from '@/types/auth';
import type { CaPayrollHeader, CaPayrollDetail, CaEmployee, CaStatus } from '@/types/commAllowance';

/** Register rows on a normal printed page (Calibri 16px on 14.87" × 11" fanfold). */
export const ROWS_PER_PRINT_PAGE = 20;
/**
 * The last printed page also carries the carried page-totals summary, the
 * GRAND TOTAL and the 3-column certification box, so it holds fewer register
 * rows. At the official 16px print size that leaves room for ~13 rows before
 * the block would spill onto a second sheet.
 */
export const LAST_PAGE_ROWS = 13;
export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── Money helpers ────────────────────────────────────────────────────────────
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[₱,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// ── Payroll breakdown ────────────────────────────────────────────────────────
// New payrolls are categorized by exactly one of these groups:
//   Division Office     = STACODE 095 (and other non-school STACODEs)
//   Elementary          = STACODE 001–094
//   Secondary           = STACODE 508–701
//   LSB & LSA Teachers  = STACODE 702
//   Utility Workers     = position contains Utility
//   Without ATM         = no bank account / non-ATM paymode
//   Separated Employees = status Resigned / Terminated
//   Non-Plantilla       = non-plantilla items fallback (same rules apply)
export const CA_BREAKDOWN_CATEGORIES = [
  'Division Office', 'Elementary', 'Secondary', 'LSB & LSA Teachers',
  'Utility Workers', 'Without ATM', 'Separated Employees', 'Non-Plantilla',
] as const;
export type CaBreakdownCategory = (typeof CA_BREAKDOWN_CATEGORIES)[number];

export interface CaBreakdownDef {
  category: CaBreakdownCategory;
  source: string;
}

export const CA_BREAKDOWN_DEFS: CaBreakdownDef[] = [
  { category: 'Division Office', source: 'STACODE 095 (and other non-school codes)' },
  { category: 'Elementary', source: 'STACODE 001–094' },
  { category: 'Secondary', source: 'STACODE 508–701' },
  { category: 'LSB & LSA Teachers', source: 'STACODE 702' },
  { category: 'Utility Workers', source: 'STACODE 703' },
  { category: 'Without ATM', source: 'STACODE 704' },
  { category: 'Separated Employees', source: 'STACODE 705' },
  { category: 'Non-Plantilla', source: 'Non Plantilla Items (fallback)' },
];

export interface CaClassifyInput {
  stacode: string;
  position: string;
  status: string;
  paymode: string;
  hasBankAccount: boolean;
  source: 'plantilla' | 'non_plantilla';
}

/**
 * Classify a source record into exactly one payroll-breakdown category.
 * Purely STACODE-based: 001–094 Elementary, 095 Division Office,
 * 508–701 Secondary, 702 LSB & LSA, 703 Utility, 704 Without ATM,
 * 705 Separated; any other (or empty) school STACODE → Division Office,
 * non-plantilla → Non-Plantilla.
 */
export function caClassifyEmployee(input: CaClassifyInput): CaBreakdownCategory | '' {
  // Purely STACODE-based classification.
  const digits = String(input.stacode ?? '').replace(/\D/g, '');
  if (digits) {
    const n = parseInt(digits, 10);
    if (n >= 1 && n <= 94) return 'Elementary';
    if (n === 95) return 'Division Office';
    if (n >= 508 && n <= 701) return 'Secondary';
    if (n === 702) return 'LSB & LSA Teachers';
    if (n === 703) return 'Utility Workers';
    if (n === 704) return 'Without ATM';
    if (n === 705) return 'Separated Employees';
  }
  // Non-school STACODE (incl. empty and the numeric gaps) → Division Office
  if (input.source === 'plantilla') return 'Division Office';
  return 'Non-Plantilla';
}

/**
 * Convert a full middle name to a single uppercase initial, e.g. "Dela Cruz" → "D".
 * Applied when records are migrated into ca_employees.middle_initial.
 */
export function caMiddleInitial(middle: string): string {
  const m = String(middle ?? '').trim();
  return m ? m.charAt(0).toUpperCase() : '';
}

/** Normalize a source status to Active/Inactive (anything but "inactive" → Active). */
export function caNormalizeStatus(status: string): 'Active' | 'Inactive' {
  return String(status ?? '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

/** Parse a legacy full name ("SURNAME, GIVEN M.") into parts for the CA masterfile. */
export function parseEmpFullName(empname: string): { last: string; first: string; middle: string } {
  const raw = String(empname ?? '').trim();
  if (!raw) return { last: '', first: '', middle: '' };
  const comma = raw.indexOf(',');
  const last = (comma >= 0 ? raw.slice(0, comma) : raw).trim();
  const rest = (comma >= 0 ? raw.slice(comma + 1) : '').trim();
  const words = rest.split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  const middle = words.slice(1).join(' ').replace(/\./g, '').trim();
  return { last, first, middle };
}

// ── Dry-run sync plan ────────────────────────────────────────────────────────
// buildCaSyncPlan() fetches the sources, maps every field the same way the sync
// would, and diffs the result against the current ca_employees masterfile so the
// UI can preview exactly what will be created / updated before applying.

export interface CaSyncRow {
  account_no: string; last_name: string; first_name: string; middle_initial: string;
  position_title: string; school_name: string; stacode: string; category: string; status: string; updated_at: string;
}

export interface CaSyncChange {
  account_no: string;
  last_name: string;
  first_name: string;
  middle_initial: string;
  position_title: string;
  school_name: string;
  stacode: string;
  category: string;
  status: string;
  isNew: boolean;
  /** Human labels of fields that differ from the current masterfile copy. */
  changedFields: string[];
}

export interface CaSyncPlan {
  rows: CaSyncRow[];
  changes: CaSyncChange[];
  total: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  /** Category → count of records that will carry that payroll-breakdown category. */
  byCategory: Record<string, number>;
  unclassified: number;
  schools: number;
}

const CA_SYNC_FIELD_LABELS: [keyof CaSyncRow, string][] = [
  ['last_name', 'Last Name'], ['first_name', 'First Name'], ['middle_initial', 'Middle Initial'],
  ['position_title', 'Position'], ['school_name', 'School'], ['stacode', 'STACODE'],
  ['category', 'Category'], ['status', 'Status'],
];

/** Build the dry-run plan: fetch sources, map fields, diff against ca_employees. */
/** Human-readable message from any thrown value — Supabase errors are plain
 *  objects (PostgrestError), not Error instances, so String(err) would render
 *  as "[object Object]" instead of the actual SQL message. */
export function caErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const m = o.message ?? o.error_description ?? o.details ?? o.hint;
    if (typeof m === 'string' && m.trim()) return m;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}

/** True when a Supabase/PostgREST error means one of the CA tables is missing
 *  (migration not applied) — covers relation-not-found (42P01), PostgREST
 *  schema-cache misses (PGRST205: "Could not find the table … in the schema
 *  cache") and generic "does not exist" variants. */
export function caIsMissingTable(msg: string): boolean {
  return /could not find the table|in the schema cache|PGRST205|relation .* does not exist|42P01|does not exist/i.test(msg);
}

/** Classify a school STACODE into its payroll category: 001–094 → Elementary,
 *  095 → Division Office, 508–701 → Secondary; anything else (or empty) → ''. */
export function caClassifyStacode(stacode: string): CaBreakdownCategory | '' {
  const digits = String(stacode ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const n = parseInt(digits, 10);
  if (n >= 1 && n <= 94) return 'Elementary';
  if (n === 95) return 'Division Office';
  if (n >= 508 && n <= 701) return 'Secondary';
  if (n === 702) return 'LSB & LSA Teachers';
  if (n === 703) return 'Utility Workers';
  if (n === 704) return 'Without ATM';
  if (n === 705) return 'Separated Employees';
  return '';
}

/** The breakdown group an employee shows under in the CA payroll School/Group
 *  dropdown, the masterfile and the breakdown strips. Prioritizes the
 *  STACODE-based classification (001–094 Elementary, 095 Division Office,
 *  508–701 Secondary, 702–705 the special groups) so a 095 record always reads
 *  as Division Office — separate from Elementary and Secondary — even when the
 *  stored category was stamped under the older rules; anything a STACODE cannot
 *  decide falls back to the stored category. */
export function caDisplayGroup(e: { stacode?: string | null; category?: string | null }): string {
  return caClassifyStacode(String(e.stacode ?? '')) || String(e.category ?? '');
}

/** Extract the leading STACODE from a school name that carries it as a prefix,
 *  e.g. "001 - Banlic Elementary School" → "001". Returns '' when absent. */
export function caStacodeFromSchoolName(schoolName: string): string {
  const m = /^\s*(\d{1,4})\s*[-–—]/.exec(String(schoolName ?? ''));
  return m ? m[1] : '';
}

/** Strip a leading STACODE prefix from a school name, e.g.
 *  "001 - Banlic Elementary School" → "Banlic Elementary School". */
export function caStripSchoolPrefix(schoolName: string): string {
  return String(schoolName ?? '').replace(/^\s*\d{1,4}\s*[-–—]\s*/, '').trim();
}

/** Collapse rows that share the same account_no (case-insensitive, trimmed),
 *  keeping the first occurrence. Postgres rejects a single upsert whose input
 *  contains duplicate conflict-target values ("ON CONFLICT DO UPDATE command
 *  cannot affect row a second time") — which happens when two source records
 *  (e.g. an Employee Record and a Non-Plantilla item) map to the same account. */
export function caDedupeByAccount<T extends { account_no: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = String(r.account_no ?? '').trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Normalize a school name for matching against the Organization directory
 *  (trim, uppercase, collapse internal whitespace). */
function normalizeSchoolName(s: string): string {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Optional ca_employees columns that only exist after their migration runs.
 *  PostgREST reports a missing one as PGRST205: "Could not find the 'X' column
 *  of 'ca_employees' in the schema cache". */
const CA_OPTIONAL_COLUMNS = ['category', 'stacode'] as const;

/** Returns the name of a column that a PostgREST error says is missing on
 *  ca_employees, or null when the error is about something else. */
export function caMissingOptionalColumn(msg: string): string | null {
  const m = /could not find the '([a-z_]+)' column of 'ca_employees'|column "([a-z_]+)" of relation "ca_employees" does not exist|column (category|stacode) does not exist/i.exec(msg);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

/** Upsert into ca_employees, retrying without optional columns (category,
 *  stacode) that only exist after their migration is applied — so the sync,
 *  CSV import and bulk import keep working even before those migrations run. */
export async function caUpsertEmployees<T extends { account_no: string }>(
  rows: T[],
): Promise<{ error: { message: string } | null }> {
  const deduped = caDedupeByAccount(rows);
  const stripped = new Set<string>();
  let payload = deduped as Record<string, unknown>[];
  for (;;) {
    const { error } = await supabase.from('ca_employees').upsert(payload as T[], { onConflict: 'account_no' });
    if (!error) return { error: null };
    const col = caMissingOptionalColumn(caErrMsg(error));
    if (!col || stripped.has(col) || !(CA_OPTIONAL_COLUMNS as readonly string[]).includes(col)) return { error };
    stripped.add(col);
    payload = payload.map((r) => {
      const o = { ...r };
      delete o[col];
      return o;
    });
  }
}

/** Resolve a position code (or title-like value) to its official Position
 *  Title using the Position Management masterfile. Falls back to the original
 *  value when the code is unknown or the value is already a title. */
export function caPositionTitle(value: string, byCode: Map<string, string>): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return byCode.get(v.toUpperCase()) ?? v;
}

export async function buildCaSyncPlan(scope?: { regcode: string | null; divcodes: string[] | null }): Promise<CaSyncPlan> {
  // Organization directory — lookup only: maps stacode → School Name AND
  // School Name → stacode. The directory covers the Elementary Schools, High
  // Schools and Implementing Units, so an employee's STACODE is resolved from
  // their school when the source record has no code of its own.
  let schoolByCode = new Map<string, string>();
  let schoolByName = new Map<string, string>();
  try {
    const schools = await fetchAll<{ school_code: string; school_name: string }>(() =>
      supabase.from('schools').select('school_code, school_name'),
    );
    if (schools.length > 0) {
      const list = schools;
      schoolByCode = new Map(list.map((s) => [s.school_code, s.school_name]));
      schoolByName = new Map(list.map((s) => [normalizeSchoolName(s.school_name), s.school_code]));
    }
  } catch { /* lookup only — sync continues without it */ }

  // Position Management masterfile — resolves the employee position codes stored
  // on Employee Records / Non-Plantilla Items into official Position Titles
  // (position_management.position_code → position_title). Lookup only.
  let posByCode = new Map<string, string>();
  try {
    const positions = await fetchAll<{ position_code: string; position_title: string; position_name: string }>(() =>
      supabase.from('position_management').select('position_code, position_title, position_name'),
    );
    if (positions.length > 0) {
      for (const p of positions) {
        posByCode.set(
          String(p.position_code ?? '').trim().toUpperCase(),
          String(p.position_title || p.position_name || '').trim() || String(p.position_code ?? '').trim(),
        );
      }
    }
  } catch { /* lookup only — sync continues with raw codes */ }

  // select('*') keeps the sync resilient: the source tables' expanded columns
  // (stacode/paymode/etc.) and the ca_employees.category column only exist after
  // later migrations are applied. Field access below is defensive (String(x ?? ''))
  // so a missing column degrades gracefully instead of throwing.
  let empQuery = supabase.from('employees').select('*');
  let npQuery = supabase.from('non_plantilla_employees').select('*').eq('is_deleted', false);
  if (scope?.regcode) {
    empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    // Non-plantilla items are division-owned (REGCODE/DIVCODE stamped on
    // create/upload) — never sync another division's records in.
    npQuery = npQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
  }
  const [npRows, empRows, existingRows, detailedRows, newlyHiredRows] = await Promise.all([
    fetchAll(() => npQuery),
    fetchAll(() => empQuery),
    fetchAll(() => supabase.from('ca_employees').select('*')),
    // Employee Movement → Detailed requests the Super Admin has APPROVED. A
    // detailed employee's request school is where they actually report, so it
    // overrides the station carried on their Employee Record when the CA
    // masterfile is synced. Pending/Rejected requests are ignored.
    fetchAll(() => {
      let q = supabase
        .from('employee_lists')
        .select('empno,stacode,status,list_type,regcode,divcode')
        .eq('list_type', 'detailed')
        .eq('status', 'Approved');
      if (scope?.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      return q;
    }),
    // Newly Hired Employees the Super Admin has APPROVED. These are recorded on
    // their own list (they are deliberately not linked to Employee Records), so
    // a brand-new hire lands in the CA masterfile without waiting for the
    // Division to add them to Employee Records. Pending/Rejected are ignored.
    fetchAll(() => {
      let q = supabase
        .from('newly_hired_employees')
        .select('*')
        .eq('status', 'Approved');
      if (scope?.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      return q;
    }),
  ]);

  // Approved detailed STACODE per EMPNO — EMPNO is the natural key the Employee
  // Movement lists and Employee Records join on.
  const detailedStacodeByEmpno = new Map<string, string>();
  for (const d of (detailedRows ?? []) as Record<string, unknown>[]) {
    const empno = String(d.empno ?? '').trim();
    const stacode = String(d.stacode ?? '').trim();
    if (empno && stacode) detailedStacodeByEmpno.set(empno, stacode);
  }

  const rows: CaSyncRow[] = [];

  // Employee Records (plantilla) — full field mapping, with legacy lname/fname/mi/
  // empname fallbacks; school from the Organization lookup via stacode; category
  // from the payroll-breakdown rules; status carried from the record. STACODE is
  // searched in the Organization directory when the record has none (the
  // employees.department column holds the school name). The school name is stored
  // with its STACODE prefix ("001 - Banlic Elementary School").
  const mapEmployeeRow = (r: Record<string, unknown>): CaSyncRow => {
    const full = parseEmpFullName(String(r.empname ?? ''));
    const last = String(r.last_name || r.lname || full.last || '').trim();
    const first = String(r.first_name || r.fname || full.first || '').trim();
    const middle = String(r.middle_name || r.mi || full.middle || '').trim();
    const dept = String(r.department ?? '').trim();
    const rawStacode = String(r.stacode ?? '').trim();
    const stacode = rawStacode || caStacodeFromSchoolName(dept) || (schoolByName.get(normalizeSchoolName(caStripSchoolPrefix(dept))) ?? '');
    const schoolName = schoolByCode.get(stacode) ?? caStripSchoolPrefix(dept) ?? dept;
    // SHS employees (STACODE 700/701) with an "Assigned School" (set under
    // Organization → Senior High Schools) report to that school on the special
    // / "Other Payroll" modules. Their company (school_name + stacode) becomes
    // the assigned school so CA pay registers and CA reports group/print under
    // it, while the classification category still follows the 700/701 station
    // rules (Secondary). The regular monthly payroll is unaffected — it keeps
    // resolving the STACODE station.
    const assigned = caSchoolForEmployee(
      { stacode, assigned_school_code: String(r.assigned_school_code ?? '') },
      schoolByCode,
    );
    // An approved Detailed request wins over both the home station and the SHS
    // assigned school — that is the school the employee reports to, and the one
    // the CA payroll groups them under.
    const detailStacode = detailedStacodeByEmpno.get(String(r.empno ?? '').trim())
      ?? detailedStacodeByEmpno.get(String(r.employee_number ?? '').trim())
      ?? '';
    const effStacode = detailStacode || assigned?.stacode || stacode;
    const effSchoolName = detailStacode
      ? (schoolByCode.get(detailStacode) ?? assigned?.schoolName ?? schoolName)
      : (assigned?.schoolName ?? schoolName);
    const category = caClassifyEmployee({
      stacode: detailStacode || stacode,
      position: String(r.position || ''),
      status: String(r.status ?? ''),
      paymode: String(r.paymode ?? ''),
      hasBankAccount: !!String(r.bank_account || r.account || '').trim(),
      source: 'plantilla',
    });
    return {
      account_no: String(r.bank_account || r.account || r.employee_number || '').trim(),
      last_name: last,
      first_name: first,
      middle_initial: caMiddleInitial(middle),
      position_title: caPositionTitle(String(r.position || r.poscode || ''), posByCode),
      school_name: effStacode && effSchoolName ? `${effStacode} - ${effSchoolName}` : (dept || effSchoolName),
      stacode: effStacode,
      category,
      status: caNormalizeStatus(String(r.status ?? '')),
      updated_at: new Date().toISOString(),
    };
  };

  const knownEmpnos = new Set<string>();
  for (const r of (empRows ?? []) as Record<string, unknown>[]) {
    const empno = String(r.empno ?? '').trim();
    const empNum = String(r.employee_number ?? '').trim();
    if (empno) knownEmpnos.add(empno);
    if (empNum) knownEmpnos.add(empNum);
    rows.push(mapEmployeeRow(r));
  }

  // Detailed employees whose Employee Record sits outside the queried set (e.g.
  // a different division scope): fetch them by EMPNO so their approved detailed
  // school still lands in the masterfile.
  const missingEmpnos = [...detailedStacodeByEmpno.keys()].filter((e) => !knownEmpnos.has(e));
  if (missingEmpnos.length > 0) {
    const extra = await chunkedIn<Record<string, unknown>>(
      'empno',
      missingEmpnos,
      (chunk) => supabase.from('employees').select('*').in('empno', chunk),
    );
    for (const r of extra) rows.push(mapEmployeeRow(r));
  }

  // Newly Hired Employees (approved) — add any hire that is not already covered
  // by an Employee Record row above. The list carries its own EMPNO, Account,
  // name and position; the school comes from its STACODE via the Organization
  // directory. They classify as plantilla (Regular/teaching hires).
  const newlyHiredAdded = new Set<string>();
  for (const r of (newlyHiredRows ?? []) as Record<string, unknown>[]) {
    const empno = String(r.empno ?? '').trim();
    if (empno && (knownEmpnos.has(empno) || newlyHiredAdded.has(empno))) continue;
    if (empno) newlyHiredAdded.add(empno);
    const account = String(r.account ?? '').trim();
    const stacode = String(r.stacode ?? '').trim();
    const schoolName = schoolByCode.get(stacode) ?? '';
    const position = String(r.position ?? '');
    const category = caClassifyEmployee({
      stacode,
      position,
      status: 'Active',
      paymode: '',
      hasBankAccount: !!account,
      source: 'plantilla',
    });
    rows.push({
      account_no: account || empno,
      last_name: String(r.last_name ?? '').trim(),
      first_name: String(r.first_name ?? '').trim(),
      middle_initial: caMiddleInitial(String(r.mi ?? '')),
      position_title: caPositionTitle(position, posByCode),
      school_name: stacode && schoolName ? `${stacode} - ${schoolName}` : schoolName,
      stacode,
      category,
      status: 'Active',
      updated_at: new Date().toISOString(),
    });
  }

  // Non Plantilla Items — the same classification rules apply (position/status/ATM),
  // with Non-Plantilla as the fallback for items that match nothing else.
  // (account = landbank → pagibig → philhealth → fallback NP-<id>)
  // STACODE is searched in the Organization directory via the item's school; the
  // school name is stored with its STACODE prefix when one is found.
  for (const r of (npRows ?? []) as Record<string, unknown>[]) {
    const school = String(r.school || r.school_name || '').trim();
    // The item's own STACODE wins when the item carries one (auto-assigned when
    // a school-scoped account filed it); otherwise it is derived from the school
    // name exactly as before.
    const storedStacode = String(r.stacode ?? '').trim();
    const stacode = storedStacode || caStacodeFromSchoolName(school) || (schoolByName.get(normalizeSchoolName(caStripSchoolPrefix(school))) ?? '');
    const plain = caStripSchoolPrefix(school);
    const category = caClassifyEmployee({
      stacode,
      position: String(r.designation || ''),
      status: 'Active',
      paymode: '',
      hasBankAccount: !!String(r.landbank ?? '').trim(),
      source: 'non_plantilla',
    });
    rows.push({
      account_no: String(r.landbank || r.pagibig_number || r.philhealth || `NP-${String(r.id ?? '').slice(0, 8)}`).trim(),
      last_name: String(r.surname || '').trim(),
      first_name: String(r.first_name || '').trim(),
      middle_initial: caMiddleInitial(String(r.middle_name ?? '')),
      position_title: caPositionTitle(String(r.designation || ''), posByCode),
      school_name: stacode && plain ? `${stacode} - ${plain}` : school,
      stacode,
      category,
      status: 'Active',
      updated_at: new Date().toISOString(),
    });
  }

  const valid = caDedupeByAccount(rows.filter((r) => r.account_no && r.last_name && r.first_name));

  // Breakdown counts must reflect the deduped rows that will actually be applied.
  const byCategory: Record<string, number> = {};
  for (const r of valid) {
    if (r.category) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }

  // Diff against the current masterfile (matched by Account No., case-insensitive)
  const existing = new Map<string, Record<string, unknown>>(
    ((existingRows ?? []) as Record<string, unknown>[]).map((e) => [String(e.account_no ?? '').trim().toUpperCase(), e]),
  );
  const changes: CaSyncChange[] = [];
  let newCount = 0, updateCount = 0, unchangedCount = 0;
  for (const row of valid) {
    const cur = existing.get(row.account_no.trim().toUpperCase());
    let isNew = false;
    let changedFields: string[] = [];
    if (!cur) {
      isNew = true;
      newCount++;
    } else {
      changedFields = CA_SYNC_FIELD_LABELS
        .filter(([k]) => String(cur[k] ?? '') !== String(row[k] ?? ''))
        .map(([, label]) => label);
      if (changedFields.length > 0) updateCount++;
      else unchangedCount++;
    }
    changes.push({
      account_no: row.account_no, last_name: row.last_name, first_name: row.first_name,
      middle_initial: row.middle_initial, position_title: row.position_title,
      school_name: row.school_name, stacode: row.stacode, category: row.category, status: row.status,
      isNew, changedFields,
    });
  }

  const unclassified = valid.filter((r) => !r.category).length;
  const schools = new Set(valid.map((r) => r.school_name).filter(Boolean)).size;
  return {
    rows: valid,
    changes,
    total: valid.length,
    newCount,
    updateCount,
    unchangedCount,
    byCategory,
    unclassified,
    schools,
  };
}

// ── Dry-run sync report export (CSV / Excel) ────────────────────────────────

const SYNC_REPORT_HEADERS = ['Account No.', 'Last Name', 'First Name', 'M.I.', 'Position', 'School', 'STACODE', 'Category', 'Status', 'Action', 'Changed Fields'];

export function caSyncChangeAction(c: CaSyncChange): string {
  return c.isNew ? 'NEW' : c.changedFields.length > 0 ? 'UPDATE' : 'UNCHANGED';
}

export function caSyncReportRows(plan: CaSyncPlan): (string | number)[][] {
  return plan.changes.map((c) => [
    c.account_no, c.last_name, c.first_name, c.middle_initial, c.position_title, c.school_name,
    c.stacode, c.category, c.status, caSyncChangeAction(c),
    c.isNew ? '' : c.changedFields.join('; '),
  ]);
}

export function caSyncReportSummary(plan: CaSyncPlan): (string | number)[][] {
  const byCat = CA_BREAKDOWN_DEFS
    .filter((d) => (plan.byCategory[d.category] ?? 0) > 0)
    .map((d) => [`${d.category} (${d.source})`, plan.byCategory[d.category]] as (string | number)[]);
  return [
    ['SUMMARY'],
    ['Total records', plan.total],
    ['New employees', plan.newCount],
    ['Records to update', plan.updateCount],
    ['Unchanged', plan.unchangedCount],
    ...byCat,
    ['Unclassified', plan.unclassified],
    ['Schools covered', plan.schools],
  ];
}

export function caSyncReportFilename(ext: 'csv' | 'xlsx'): string {
  return `CA_SYNC_REPORT_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** CSV export of the dry-run sync report (changes table + summary block). */
export function exportCaSyncReportCsv(plan: CaSyncPlan): void {
  const csv = generateCsv(SYNC_REPORT_HEADERS, [...caSyncReportRows(plan), ...caSyncReportSummary(plan)]);
  downloadFile({ filename: caSyncReportFilename('csv'), content: csv, mimeType: 'text/csv' });
}

/** Excel export of the dry-run sync report (title, summary block, changes table). */
export async function exportCaSyncReportExcel(plan: CaSyncPlan): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sync Report');
  ws.columns = [
    { width: 16 }, { width: 20 }, { width: 18 }, { width: 8 }, { width: 28 },
    { width: 32 }, { width: 10 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 32 },
  ];
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  ws.mergeCells(1, 1, 1, 11);
  const t = ws.getCell(1, 1);
  t.value = 'CA Auto Employee Sync — Dry Run Report';
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, 11);
  const sub = ws.getCell(2, 1);
  sub.value = `Generated: ${new Date().toLocaleString('en-PH')}`;
  sub.font = { size: 9 };
  sub.alignment = { horizontal: 'center' };

  let row = 4;
  for (const [k, v] of caSyncReportSummary(plan)) {
    ws.mergeCells(row, 1, row, 2);
    const kc = ws.getCell(row, 1);
    kc.value = k;
    kc.font = { bold: k === 'SUMMARY', size: 9 };
    kc.border = border;
    const vc = ws.getCell(row, 3);
    vc.value = v;
    vc.font = { size: 9 };
    vc.border = border;
    row++;
  }
  row += 1;

  SYNC_REPORT_HEADERS.forEach((c, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = c;
    cell.font = { bold: true, size: 9 };
    cell.border = border;
    cell.alignment = { horizontal: 'center' };
  });
  row++;

  for (const vals of caSyncReportRows(plan)) {
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.border = border;
    });
    row++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadFile({
    filename: caSyncReportFilename('xlsx'),
    content: new Uint8Array(buffer as ArrayBuffer),
    mimeType: EXCEL_MIME,
  });
}

// ── Computation engine ───────────────────────────────────────────────────────
// Gross Amount       = SUM(Amount)
// Total Deductions   = SUM(Deduction)
// Net Payroll        = Gross Amount − Total Deductions
// Employee Net Due   = Amount − Deduction
export interface CaTotals {
  totalEmployees: number;
  grossAmount: number;
  totalDeductions: number;
  netAmount: number;
}

export function computeCaTotals(rows: { amount: number; deduction: number }[]): CaTotals {
  const grossAmount = money(rows.reduce((s, r) => s + num(r.amount), 0));
  const totalDeductions = money(rows.reduce((s, r) => s + num(r.deduction), 0));
  return {
    totalEmployees: rows.length,
    grossAmount,
    totalDeductions,
    netAmount: money(grossAmount - totalDeductions),
  };
}

// ── Workflow: Draft → Generated → Reviewed → Approved → Posted → Paid → Archived ──
export function nextCaStatus(s: string): string | null {
  const idx = CA_FLOW.indexOf(s);
  if (idx < 0 || idx >= CA_FLOW.length - 1) return null;
  return CA_FLOW[idx + 1];
}

// ── Role-based access (maps app roles → CA module capabilities) ─────────────
// Administrator   → admin          (super_admin, payroll_admin)
// Payroll Officer → officer        (payroll_processor)
// Accountant      → accountant     (accounting_officer)
// Cashier         → cashier        (division_finance)
// Authorized Official / Head of Agency → admin (super_admin)
// Viewer          → viewer         (auditor, read_only)
export type CaCapLevel = 'viewer' | 'officer' | 'accountant' | 'cashier' | 'admin';

export interface CaCapability {
  level: CaCapLevel;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;          // edit header/detail while Draft–Reviewed
  canImport: boolean;        // bulk import details / employees
  canManageEmployees: boolean;
  canGenerate: boolean;      // Draft → Generated
  canSubmit: boolean;        // Generated → Reviewed
  canApprove: boolean;       // Reviewed → Approved
  canPost: boolean;          // Approved → Posted
  canPay: boolean;           // Posted → Paid
  canArchive: boolean;       // Paid → Archived
  canRevert: boolean;        // any (non-terminal) → Draft
  canDelete: boolean;
}

export function caCapability(role: UserRole): CaCapability {
  const base: CaCapability = {
    level: 'viewer', canView: true, canCreate: false, canEdit: false, canImport: false,
    canManageEmployees: false, canGenerate: false, canSubmit: false, canApprove: false,
    canPost: false, canPay: false, canArchive: false, canRevert: false, canDelete: false,
  };
  switch (normalizeRole(role)) {
    case 'super_admin':
    case 'payroll_admin':
      return {
        ...base, level: 'admin', canCreate: true, canEdit: true, canImport: true,
        canManageEmployees: true, canGenerate: true, canSubmit: true, canApprove: true,
        canPost: true, canPay: true, canArchive: true, canRevert: true, canDelete: true,
      };
    case 'payroll_processor':
      return {
        ...base, level: 'officer', canCreate: true, canEdit: true, canImport: true,
        canManageEmployees: true, canGenerate: true, canSubmit: true,
      };
    case 'accounting_officer':
      return { ...base, level: 'accountant', canApprove: true, canSubmit: true };
    case 'division_finance':
      return { ...base, level: 'cashier', canPay: true };
    case 'auditor':
    case 'read_only':
      return { ...base, level: 'viewer' };
    default:
      return { ...base, level: 'viewer' };
  }
}

export const CA_FLOW: string[] = [
  'Draft', 'Generated', 'Reviewed', 'Approved', 'Posted', 'Paid', 'Archived',
];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Generated'],
  Generated: ['Reviewed'],
  Reviewed: ['Approved'],
  Approved: ['Posted'],
  Posted: ['Paid'],
  Paid: ['Archived'],
  Archived: [],
};

/** Validate a workflow transition for the acting role's capability. */
export function caCanTransition(from: string, to: string, cap: CaCapability): boolean {
  if (!cap.canView) return false;
  if (to === 'Draft' && from !== 'Draft' && from !== 'Archived' && cap.canRevert) return true;
  if (from === 'Draft' && to === 'Generated') return cap.canGenerate;
  if (from === 'Generated' && to === 'Reviewed') return cap.canSubmit;
  if (from === 'Reviewed' && to === 'Approved') return cap.canApprove;
  if (from === 'Approved' && to === 'Posted') return cap.canPost;
  if (from === 'Posted' && to === 'Paid') return cap.canPay;
  if (from === 'Paid' && to === 'Archived') return cap.canArchive;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function caAllowedNext(from: string, cap: CaCapability): CaStatus[] {
  const candidates = new Set<CaStatus>((ALLOWED_TRANSITIONS[from] ?? []) as CaStatus[]);
  if (cap.canRevert && from !== 'Draft' && from !== 'Archived') candidates.add('Draft');
  return [...candidates].filter((to) => caCanTransition(from, to, cap));
}

/** Whether the payroll header fields / detail rows may still be edited. */
export function caIsEditable(status: string): boolean {
  return ['Draft', 'Generated', 'Reviewed'].includes(status);
}

// ── Payroll number generation: CA-YYYYMMDD-#### ──────────────────────────────
export async function nextCaPayrollNo(): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const { count } = await supabase
    .from('ca_payroll_headers')
    .select('id', { count: 'exact', head: true });
  const seq = ((count ?? 0) + 1).toString().padStart(4, '0');
  return `CA-${ymd}-${seq}`;
}

// ── Print pagination (fanfold 14-7/8" × 11") ─────────────────────────────────
export interface CaPrintRow {
  lineNo: number;
  accountNo: string;
  lastName: string;
  firstName: string;
  middleInitial: string;
  position: string;
  /** Employee's school (e.g. "BANLIC ELEM SCHOOL") — used to group the register per school. */
  schoolName: string;
  /** School STACODE (e.g. "001") — used to order school groups and shown as "School (STACODE)". */
  stacode: string;
  amount: number;
  deduction: number;
  net: number;
}

export interface CaPrintPage {
  rows: CaPrintRow[];
  pageNo: number;
  totalPages: number;
  pageGross: number;
  pageDeduction: number;
  pageNet: number;
}

export interface CaPrintPages {
  pages: CaPrintPage[];
  gross: number;
  deduction: number;
  net: number;
}

export function buildCaPrintPages(rows: CaPrintRow[], rowsPerPage = ROWS_PER_PRINT_PAGE): CaPrintPages {
  // Split the print per school: each school starts on a fresh page and schools
  // are never combined on the same page. A school larger than rowsPerPage
  // continues onto further pages of its own.
  const groups: CaPrintRow[][] = [];
  let curKey = '';
  for (const r of rows) {
    const key = `${r.schoolName}|${r.stacode}`;
    if (key !== curKey) {
      groups.push([]);
      curKey = key;
    }
    groups[groups.length - 1].push(r);
  }

  const pages: CaPrintPage[] = [];
  for (const g of groups) {
    const totalInGroup = Math.max(1, Math.ceil(g.length / rowsPerPage));
    for (let s = 0; s < totalInGroup; s++) {
      const slice = g.slice(s * rowsPerPage, (s + 1) * rowsPerPage);
      const t = computeCaTotals(slice);
      pages.push({
        rows: slice,
        pageNo: pages.length + 1,
        totalPages: 0, // patched below once the full page count is known
        pageGross: t.grossAmount,
        pageDeduction: t.totalDeductions,
        pageNet: t.netAmount,
      });
    }
  }
  if (pages.length === 0) {
    pages.push({ rows: [], pageNo: 1, totalPages: 1, pageGross: 0, pageDeduction: 0, pageNet: 0 });
  }
  // The final page reserves room for the page-totals summary + certification
  // block, so any surplus rows spill onto a new trailing page of the same
  // school rather than pushing the certification box onto its own sheet.
  const tail = pages[pages.length - 1];
  if (tail.rows.length > LAST_PAGE_ROWS) {
    const overflow = tail.rows.splice(LAST_PAGE_ROWS);
    const t = computeCaTotals(overflow);
    pages.push({
      rows: overflow,
      pageNo: 0, // renumbered below
      totalPages: 0,
      pageGross: t.grossAmount,
      pageDeduction: t.totalDeductions,
      pageNet: t.netAmount,
    });
  }
  pages.forEach((p, i) => {
    p.pageNo = i + 1;
    p.totalPages = pages.length;
  });
  const grand = computeCaTotals(rows);
  return { pages, gross: grand.grossAmount, deduction: grand.totalDeductions, net: grand.netAmount };
}

/** Numeric STACODE key used to order school groups (001 first). Unknown codes go last. */
function caSchoolSortKey(e?: CaEmployee): string {
  const raw = (e?.stacode ?? '').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? String(n).padStart(6, '0') : `z${raw || (e?.school_name ?? '').toUpperCase()}`;
}

export function detailsToPrintRows(
  details: CaPayrollDetail[],
  empMap: Map<string, CaEmployee>,
  positionMap?: Map<string, string>,
): CaPrintRow[] {
  return [...details]
    // Arrange the register per school: order by STACODE (001 → 701 …), with
    // School Principals first, then Head Teachers, then name order — so the
    // printed PDF/Excel register reads like the masterfile sheet.
    .sort((a, b) => {
      const ka = caSchoolSortKey(empMap.get(a.employee_id));
      const kb = caSchoolSortKey(empMap.get(b.employee_id));
      if (ka !== kb) return ka < kb ? -1 : 1;
      const pos = (id: string): string => {
        const e = empMap.get(id);
        return positionMap?.get((e?.position_title ?? '').trim().toUpperCase()) ?? e?.position_title ?? '';
      };
      const ra = caPositionRank(pos(a.employee_id));
      const rb = caPositionRank(pos(b.employee_id));
      if (ra !== rb) return ra - rb;
      const ea = empMap.get(a.employee_id);
      const eb = empMap.get(b.employee_id);
      const na = `${ea?.last_name ?? ''} ${ea?.first_name ?? ''}`;
      const nb = `${eb?.last_name ?? ''} ${eb?.first_name ?? ''}`;
      if (na !== nb) return na.localeCompare(nb);
      return a.line_no - b.line_no;
    })
    .map((d) => {
      const e = empMap.get(d.employee_id);
      return {
        lineNo: d.line_no,
        accountNo: e?.account_no ?? '',
        lastName: e?.last_name ?? '',
        firstName: e?.first_name ?? '',
        middleInitial: e?.middle_initial ?? '',
        position: positionMap?.get((e?.position_title ?? '').trim().toUpperCase()) ?? e?.position_title ?? '',
        schoolName: e?.school_name ?? '',
        stacode: e?.stacode ?? '',
        amount: num(d.amount),
        deduction: num(d.deduction),
        net: num(d.net_amount_due),
      };
    });
}

// ── CSV parsing (quoted-field aware, RFC-4180-ish) ───────────────────────────
export function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  const pushField = () => { row.push(cur); cur = ''; };
  const pushRow = () => { pushField(); if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) pushRow();
  return rows;
}

export interface CaEmployeeCsvRow {
  account_no: string; last_name: string; first_name: string;
  middle_initial: string; position_title: string; school_name: string;
  stacode: string; category: string; status: string;
}

/** Parse CA employee masterfile CSV (first row = headers, tolerant of ordering). */
export function parseCaEmployeeCsv(text: string): { rows: CaEmployeeCsvRow[]; errors: string[] } {
  const lines = parseCsvLines(text);
  const errors: string[] = [];
  const rows: CaEmployeeCsvRow[] = [];
  if (lines.length === 0) return { rows, errors: ['File is empty.'] };
  const get = lines[0].map((h) => h.trim().toLowerCase());
  const iAcct = get.indexOf('account_no') >= 0 ? get.indexOf('account_no') : get.indexOf('account no');
  const iLn = get.indexOf('last_name') >= 0 ? get.indexOf('last_name') : get.indexOf('lastname');
  const iFn = get.indexOf('first_name') >= 0 ? get.indexOf('first_name') : get.indexOf('firstname');
  const iMi = get.indexOf('middle_initial') >= 0 ? get.indexOf('middle_initial') : get.indexOf('mi');
  const iPos = get.indexOf('position_title') >= 0 ? get.indexOf('position_title') : get.indexOf('position');
  const iSch = get.indexOf('school_name') >= 0 ? get.indexOf('school_name') : get.indexOf('school');
  const iCat = get.indexOf('category') >= 0 ? get.indexOf('category') : get.indexOf('breakdown');
  const iStac = get.indexOf('stacode') >= 0 ? get.indexOf('stacode') : -1;
  const iSt = get.indexOf('status');
  for (let r = 1; r < lines.length; r++) {
    const c = lines[r];
    const v = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
    if (!v(iAcct) && !v(iLn)) continue;
    if (!v(iAcct)) { errors.push(`Row ${r + 1}: Account No. is required.`); continue; }
    const school = v(iSch);
    const stacode = v(iStac) || caStacodeFromSchoolName(school);
    rows.push({
      account_no: v(iAcct),
      last_name: v(iLn),
      first_name: v(iFn),
      middle_initial: v(iMi),
      position_title: v(iPos),
      school_name: school,
      stacode,
      category: v(iCat) || caClassifyStacode(stacode),
      status: v(iSt) || 'Active',
    });
  }
  return { rows, errors };
}

export interface CaDetailCsvRow extends CaEmployeeCsvRow {
  amount: number; deduction: number;
}

/** Parse payroll detail import CSV (employee fields + amount + deduction). */
export function parseCaDetailCsv(text: string): { rows: CaDetailCsvRow[]; errors: string[] } {
  const lines = parseCsvLines(text);
  const errors: string[] = [];
  const rows: CaDetailCsvRow[] = [];
  if (lines.length === 0) return { rows, errors: ['File is empty.'] };
  const h = lines[0].map((x) => x.trim().toLowerCase());
  const iAcct = h.findIndex((x) => x === 'account_no' || x === 'account no');
  const iLn = h.findIndex((x) => x === 'last_name' || x === 'lastname');
  const iFn = h.findIndex((x) => x === 'first_name' || x === 'firstname');
  const iMi = h.findIndex((x) => x === 'middle_initial' || x === 'mi');
  const iPos = h.findIndex((x) => x === 'position_title' || x === 'position');
  const iSch = h.findIndex((x) => x === 'school_name' || x === 'school');
  const iCat = h.findIndex((x) => x === 'category' || x === 'breakdown');
  const iStac = h.findIndex((x) => x === 'stacode');
  const iAmt = h.findIndex((x) => x === 'amount' || x === 'gross' || x === 'gross_amount');
  const iDed = h.findIndex((x) => x === 'deduction' || x === 'total_deductions');
  for (let r = 1; r < lines.length; r++) {
    const c = lines[r];
    const v = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
    if (!v(iAcct) && !v(iLn) && !v(iAmt)) continue;
    if (!v(iAmt)) { errors.push(`Row ${r + 1}: Amount is required.`); continue; }
    const school = v(iSch);
    const stacode = v(iStac) || caStacodeFromSchoolName(school);
    rows.push({
      account_no: v(iAcct),
      last_name: v(iLn),
      first_name: v(iFn),
      middle_initial: v(iMi),
      position_title: v(iPos),
      school_name: school,
      stacode,
      category: v(iCat) || caClassifyStacode(stacode),
      status: 'Active',
      amount: num(v(iAmt)),
      deduction: num(v(iDed)),
    });
  }
  return { rows, errors };
}

// ── Excel export (payroll register) ──────────────────────────────────────────
export async function exportCaPayrollExcel(
  header: CaPayrollHeader,
  details: CaPayrollDetail[],
  empMap: Map<string, CaEmployee>,
  positionMap?: Map<string, string>,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payroll Register', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 6 },
    { width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 },
  ];
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const head = (r: number, c: number, v: string | number) => {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border;
    return cell;
  };
  // Letterhead
  ws.mergeCells(1, 1, 1, 10);
  const t1 = ws.getCell(1, 1); t1.value = 'GENERAL PAYROLL'; t1.font = { bold: true, size: 14 };
  t1.alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, 10);
  const t2 = ws.getCell(2, 1); t2.value = header.agency; t2.font = { bold: true, size: 12 };
  t2.alignment = { horizontal: 'center' };
  ws.mergeCells(3, 1, 3, 10);
  const t3 = ws.getCell(3, 1); t3.value = header.division; t3.font = { bold: true, size: 11 };
  t3.alignment = { horizontal: 'center' };
  ws.mergeCells(4, 1, 4, 10);
  const t4 = ws.getCell(4, 1); t4.value = header.payroll_type; t4.font = { bold: true, size: 11 };
  t4.alignment = { horizontal: 'center' };

  const meta: [string, string][] = [
    ['Payroll No.', header.payroll_no],
    ['School Name', header.school_name],
    ['Covered Period', header.covered_period],
    ['Status', header.status],
    ['Date Generated', header.created_date ? new Date(header.created_date).toLocaleDateString('en-PH') : ''],
    ['Total Employees', String(header.total_employees)],
    ['ALOBS No.', header.alobs_no],
    ['JEV No.', header.jev_no],
    ['Payroll Reference No.', header.payroll_ref_no],
  ];
  let row = 6;
  for (const [k, v] of meta) {
    ws.mergeCells(row, 1, row, 4);
    const kc = ws.getCell(row, 1); kc.value = k; kc.font = { bold: true, size: 9 }; kc.border = border;
    ws.mergeCells(row, 5, row, 10);
    const vc = ws.getCell(row, 5); vc.value = v; vc.font = { size: 9 }; vc.border = border;
    row++;
  }
  row += 1;

  const cols = ['No.', 'Account No.', 'Last Name', 'First Name', 'M.I.', 'Position', 'Amount', 'Deduction', 'Net Amount Due', 'Signature of Recipient'];
  cols.forEach((c, i) => head(row, i + 1, c));
  row++;

  const rows = detailsToPrintRows(details, empMap);
  for (const r of rows) {
    const vals: (string | number)[] = [
      r.lineNo, r.accountNo, r.lastName, r.firstName, r.middleInitial,
      r.position, money(r.amount), money(r.deduction), money(r.net), '',
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.border = border;
      if (i >= 6) cell.alignment = { horizontal: 'right' };
    });
    row++;
  }

  const t = computeCaTotals(rows);
  const tot: (string | number)[] = ['TOTAL', '', '', '', '', '', money(t.grossAmount), money(t.totalDeductions), money(t.netAmount), ''];
  tot.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    cell.font = { bold: true, size: 9 };
    cell.border = border;
    if (i >= 6) cell.alignment = { horizontal: 'right' };
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadFile({
    filename: `CA_PAYROLL_${header.payroll_no.replace(/[^A-Za-z0-9-]/g, '_')}.xlsx`,
    content: new Uint8Array(buffer as ArrayBuffer),
    mimeType: EXCEL_MIME,
  });
}

// ── CA Masterfile Excel — a workbook per STACODE group, a sheet per school ────
// Elementary = STACODE 001–094, Division Office = 095, High School = 500–701.
export interface CaMasterfileGroup {
  key: 'elementary' | 'division_office' | 'highschool';
  label: string;
  min: number;
  max: number;
}

export const CA_MASTERFILE_GROUPS: CaMasterfileGroup[] = [
  { key: 'elementary', label: 'Elementary', min: 1, max: 94 },
  { key: 'division_office', label: 'Division Office', min: 95, max: 95 },
  { key: 'highschool', label: 'High School', min: 500, max: 701 },
];

/** Numeric STACODE of a row (leading zeros dropped), or null when unparseable. */
export function caMasterfileStacodeNum(stacode: string | null | undefined): number | null {
  const digits = String(stacode ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Excel tab name: remove characters Excel forbids, cap at 31 chars, keep unique. */
function caSafeSheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${i++})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Position rank used to order each school's CA masterfile sheet: for the
 *  Division Office the Schools Division Superintendent (SDS) comes first, then
 *  the Assistant Schools Division Superintendent (ASDS); school sheets keep
 *  School Principals first, then Head Teachers, then everyone else — name order
 *  within each rank. Recognizes the DepEd titles by their title words, so
 *  resolved/resolved-title values work too — and tolerates the abbreviated forms
 *  the employee masterfile actually stores ("SCH DIV SUPERINTENDENT",
 *  "ASST SCH DIV SUPERINTENDENT", "SDO SUCT"), which otherwise fell through to
 *  the catch-all rank and pushed the Superintendent out of the first row. */
export function caPositionRank(position: string): number {
  const p = String(position ?? '').trim().toUpperCase();
  if (!p) return 4;
  const suct = /\bSUPERINTENDENT\b|\bSUCT\b/.test(p);
  // Assistant Schools Division Superintendent — tested before the SDS rule so
  // "ASST SCH DIV SUPERINTENDENT" is never read as the Superintendent himself.
  if (/\bASDS\b/.test(p) || (/\bASSISTANT\b|\bASST\b/.test(p) && suct)) return 1;
  if (suct || /\bSDS\b/.test(p)) return 0;
  if (/\bSCHOOL PRINCIPAL\b/.test(p) || /^PRINCIPAL(\s|$)/.test(p)) return 2;
  if (/\bHEAD TEACHER\b/.test(p)) return 3;
  return 4;
}

/**
 * Export the CA masterfile as three workbooks — Elementary (STACODE 001–094),
 * Division Office (095) and High School (500–701) — each holding one worksheet
 * per school so every school's records can be printed/distributed separately.
 */
export async function exportCaMasterfileExcelBySchool(
  employees: CaEmployee[],
  opts?: { activeOnly?: boolean; resolvePosition?: (stored: string) => string },
): Promise<void> {
  const pool = opts?.activeOnly ? employees.filter((e) => e.status === 'Active') : employees;
  const resolvePosition = opts?.resolvePosition ?? ((v: string) => v);

  for (const group of CA_MASTERFILE_GROUPS) {
    const inGroup = pool.filter((e) => {
      const n = caMasterfileStacodeNum(e.stacode);
      return n !== null && n >= group.min && n <= group.max;
    });
    if (inGroup.length === 0) continue;

    // One sheet per school, keyed by normalized STACODE.
    const bySchool = new Map<number, { name: string; rows: CaEmployee[] }>();
    for (const e of inGroup) {
      const n = caMasterfileStacodeNum(e.stacode) as number;
      const entry = bySchool.get(n) ?? { name: '', rows: [] };
      entry.rows.push(e);
      const stripped = caStripSchoolPrefix(e.school_name);
      if (!entry.name && stripped) entry.name = stripped;
      bySchool.set(n, entry);
    }

    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    const thin = { style: 'thin' as const };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const headers = ['No.', 'Account No.', 'Last Name', 'First Name', 'M.I.', 'Position', 'STACODE', 'Category', 'Status'];
    const widths = [5, 16, 20, 20, 5, 26, 10, 16, 10];
    const nCols = headers.length;

    for (const code of [...bySchool.keys()].sort((a, b) => a - b)) {
      const { name, rows } = bySchool.get(code)!;
      const schoolLabel = name || `School ${code}`;
      const stacodeLabel = String(code).padStart(3, '0');
      const ws = wb.addWorksheet(caSafeSheetName(`${stacodeLabel} ${schoolLabel}`, used), {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      ws.columns = widths.map((width) => ({ width }));

      const title = (r: number, text: string, size: number, bold = true) => {
        ws.mergeCells(r, 1, r, nCols);
        const c = ws.getCell(r, 1);
        c.value = text;
        c.font = { bold, size };
        c.alignment = { horizontal: 'center' };
      };
      title(1, 'COMMUNICATION ALLOWANCE — MASTERFILE', 13);
      title(2, group.label, 11);
      title(3, `${schoolLabel} (STACODE ${stacodeLabel})`, 11);
      title(4, `Generated ${new Date().toLocaleDateString('en-PH')} · ${rows.length} record(s)`, 9, false);

      const headRow = 6;
      headers.forEach((h, i) => {
        const cell = ws.getCell(headRow, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = border;
      });

      const sorted = [...rows].sort((a, b) => {
        const pa = caPositionRank(resolvePosition(a.position_title));
        const pb = caPositionRank(resolvePosition(b.position_title));
        if (pa !== pb) return pa - pb;
        return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      });
      let r = headRow + 1;
      for (const e of sorted) {
        const vals: (string | number)[] = [
          r - headRow, e.account_no, e.last_name, e.first_name, e.middle_initial,
          resolvePosition(e.position_title), e.stacode, caDisplayGroup(e), e.status,
        ];
        vals.forEach((v, i) => {
          const cell = ws.getCell(r, i + 1);
          cell.value = v;
          cell.font = { size: 9 };
          cell.border = border;
          if (i === 0 || i === 6 || i === 8) cell.alignment = { horizontal: 'center' };
        });
        r++;
      }
      ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: nCols } };
      ws.views = [{ state: 'frozen', ySplit: headRow }];
    }

    const buffer = await wb.xlsx.writeBuffer();
    downloadFile({
      filename: `CA_MASTERFILE_${group.label.replace(/\s/g, '_').toUpperCase()}.xlsx`,
      content: new Uint8Array(buffer as ArrayBuffer),
      mimeType: EXCEL_MIME,
    });
  }
}

// ── Excel export (payroll register) — one worksheet per STACODE/school ───────
// Mirrors the masterfile "per STACODE per sheet" workbook: each school gets its
// own worksheet (tab labeled "STACODE School"), with the full letterhead, payroll
// meta block, register rows and a SUBTOTAL line per sheet.
export async function exportCaPayrollExcelByStacode(
  header: CaPayrollHeader,
  details: CaPayrollDetail[],
  empMap: Map<string, CaEmployee>,
  positionMap?: Map<string, string>,
): Promise<void> {
  const rows = detailsToPrintRows(details, empMap, positionMap);

  // Group per STACODE / school, preserving the sorted row order.
  const groups: { stacode: string; schoolName: string; rows: CaPrintRow[] }[] = [];
  const byKey = new Map<string, { stacode: string; schoolName: string; rows: CaPrintRow[] }>();
  for (const r of rows) {
    const key = `${r.schoolName}|${r.stacode}`;
    let g = byKey.get(key);
    if (!g) {
      g = { stacode: r.stacode, schoolName: r.schoolName, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  if (groups.length === 0) {
    groups.push({ stacode: '', schoolName: header.school_name ?? '', rows: [] });
  }

  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const cols = ['No.', 'Account No.', 'Last Name', 'First Name', 'M.I.', 'Position', 'Amount', 'Deduction', 'Net Amount Due', 'Signature of Recipient'];
  const widths = [5, 15, 19, 19, 5, 27, 13, 13, 14, 22];
  const nCols = cols.length;

  for (const g of groups) {
    const digits = String(g.stacode ?? '').replace(/\D/g, '');
    const stacodeLabel = digits ? digits.padStart(3, '0') : '';
    const school = caStripSchoolPrefix(g.schoolName) || header.school_name || (stacodeLabel ? `School ${stacodeLabel}` : '');
    const ws = wb.addWorksheet(caSafeSheetName(stacodeLabel ? `${stacodeLabel} ${school}` : school, used), {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = widths.map((width) => ({ width }));

    const printFont = 'Times New Roman';
    // ── Header — mirrors the PDF print letterhead ─────────────────────────────
    const center = (r: number, text: string, size: number, bold: boolean, underline = false) => {
      ws.mergeCells(r, 1, r, nCols);
      const c = ws.getCell(r, 1);
      c.value = text;
      c.font = { name: printFont, bold, size, underline };
      c.alignment = { horizontal: 'center' };
    };
    const leftLine = (r: number, text: string, size: number, bold: boolean) => {
      ws.mergeCells(r, 1, r, nCols);
      const c = ws.getCell(r, 1);
      c.value = text;
      c.font = { name: printFont, bold, size };
      c.alignment = { horizontal: 'left' };
    };
    center(1, 'GENERAL PAYROLL', 15, true);
    center(2, header.agency, 12, true);
    center(3, header.division, 11, true);
    center(4, header.payroll_type, 11, true, true);
    center(5, header.covered_period, 10, true);
    leftLine(6, `Payroll No.: ${header.payroll_no}`, 9, false);
    leftLine(7, school, 11, true);
    leftLine(8, 'We acknowledge receipt of cash shown our name as full compensation for services rendered for the period covered.', 8, false);

    let row = 10;

    cols.forEach((c, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = c;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    const headRow = row;
    row++;

    let no = 0;
    for (const r of g.rows) {
      no += 1;
      const vals: (string | number)[] = [
        no, r.accountNo, r.lastName, r.firstName, r.middleInitial,
        r.position, money(r.amount), money(r.deduction), money(r.net), '',
      ];
      vals.forEach((v, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = v;
        cell.font = { size: 9 };
        cell.border = border;
        if (i >= 6 && i <= 8) {
          if (typeof v === 'number') cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
      row++;
    }

    // SUBTOTAL per school — mirrors the print's subtotal row
    const t = computeCaTotals(g.rows);
    ws.mergeCells(row, 1, row, 6);
    const sl = ws.getCell(row, 1);
    sl.value = `SUBTOTAL — ${school}`;
    sl.font = { name: printFont, bold: true, size: 9 };
    sl.alignment = { horizontal: 'left' };
    sl.border = border;
    const subAmts = [money(t.grossAmount), money(t.totalDeductions), money(t.netAmount)];
    subAmts.forEach((v, i) => {
      const cell = ws.getCell(row, 7 + i);
      cell.value = v;
      cell.font = { name: printFont, bold: true, size: 9 };
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right' };
      cell.border = border;
    });
    ws.getCell(row, 10).border = border;
    row++;

    // ── Footer — mirrors the PDF print page footer ────────────────────────────
    row++;
    ws.mergeCells(row, 1, row, 6);
    const fl = ws.getCell(row, 1);
    fl.value = 'TOTAL FOR PAGE 1';
    fl.font = { name: printFont, bold: true, size: 9 };
    fl.alignment = { horizontal: 'right' };
    ws.mergeCells(row, 7, row, 9);
    const fn = ws.getCell(row, 7);
    fn.value = money(t.netAmount);
    fn.font = { name: printFont, bold: true, size: 9 };
    fn.numFmt = '#,##0.00';
    fn.alignment = { horizontal: 'right' };
    row++;
    ws.mergeCells(row, 1, row, nCols);
    const pg = ws.getCell(row, 1);
    pg.value = 'Page 1 of 1';
    pg.font = { name: printFont, size: 8 };
    pg.alignment = { horizontal: 'center' };
    row++;

    ws.views = [{ state: 'frozen', ySplit: headRow }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadFile({
    filename: `CA_PAYROLL_${header.payroll_no.replace(/[^A-Za-z0-9-]/g, '_')}_PER_STACODE.xlsx`,
    content: new Uint8Array(buffer as ArrayBuffer),
    mimeType: EXCEL_MIME,
  });
}

// ── CSV export ───────────────────────────────────────────────────────────────
// Bank/upload format: no header row, no grand total. Columns:
//   1. Account No.
//   2. Name as "Last Name, First Name MI." (e.g. "Dela Cruz, John A.")
//   3. Amount in centavos (peso amount with "00" appended, e.g. 7500 → 750000)
export function exportCaPayrollCsv(
  header: CaPayrollHeader,
  details: CaPayrollDetail[],
  empMap: Map<string, CaEmployee>,
  positionMap?: Map<string, string>,
): void {
  const rows = detailsToPrintRows(details, empMap, positionMap);
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const name = `${r.lastName}, ${r.firstName}${r.middleInitial ? ` ${r.middleInitial}.` : ''}`;
    return [r.accountNo, name, Math.round(money(r.amount) * 100)].map(escape).join(',');
  });
  downloadFile({
    filename: `CA_PAYROLL_${header.payroll_no.replace(/[^A-Za-z0-9-]/g, '_')}.csv`,
    content: new TextEncoder().encode(lines.join('\n')),
    mimeType: 'text/csv',
  });
}

export { currency };
