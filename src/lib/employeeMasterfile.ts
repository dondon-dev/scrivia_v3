/**
 * Employee Masterfile — hardcoded PocketBase mapping for MASTFILE.DBF sync.
 *
 * Single source of truth so Employee Records can never be lost to a dynamic
 * table lookup or a schema mismatch:
 *
 *   - `EMPLOYEES_COLLECTION` is the ONLY PocketBase table employee rows sync to.
 *   - `MASTFILE_TEXT_FIELDS` / `MASTFILE_NUMBER_FIELDS` enumerate every column
 *     the `employees` collection accepts (mirrors migration
 *     1800000002_restore_employees_mastfile.js).
 *   - `buildMastfilePayload()` converts one decoded DBF record into a
 *     PocketBase-safe payload (trims strings, coerces numbers, drops unknown
 *     keys so PocketBase never 400s the whole batch).
 *   - `sanitizeEmployeePayload()` does the same for hand-built payloads
 *     (Employees view save / DBF upload).
 *
 * Both Smart Import (`syncMastfile` in restoreSync.ts) and the Employees view
 * DBF import MUST go through this module.
 */

import type { DbfRecord } from '@/lib/dbf';

// ── Hardcoded PocketBase target ─────────────────────────────────────────────
/** The ONLY PocketBase collection employee masterfile rows sync to. */
export const EMPLOYEES_COLLECTION = 'employees';

/** Match key inside MASTFILE.DBF (also mirrored to `employee_number`). */
export const EMPLOYEE_MATCH_KEY = 'EMPNO';

// ── Allowed field sets (must match the PB `employees` collection schema) ────

export const MASTFILE_TEXT_FIELDS = new Set([
  'empno', 'employee_number',
  'fname', 'first_name', 'mi', 'middle_name', 'lname', 'last_name',
  'appel', 'empname',
  'regcode', 'divcode', 'stacode', 'distcode', 'division_id', 'category',
  'account', 'bank_account', 'banker', 'bank_name',
  'poscode', 'position', 'department',
  'paymode', 'pagcode', 'taxcode', 'tax_status',
  'civilstat', 'attend', 'status', 'sex', 'tin',
  'gsis_pn', 'gsis_id', 'hdmf_id', 'phic_id', 'pib',
  'sss_number', 'philhealth_number', 'pagibig_number',
  'birthdate', 'update', 'paydate', 'hiredate', 'hire_date',
  'exposcode',
  'updcode', 'editor',
  'depname1', 'depname2', 'depname3', 'depname4',
  'depdate1', 'depdate2', 'depdate3', 'depdate4',
  'payroll_group_id',
  'updated_at',
]);

export const MASTFILE_NUMBER_FIELDS = new Set([
  'grade', 'step',
  'basic', 'basic_salary', 'hourly_rate',
  'trans', 'pera', 'aca', 'rata', 'ontop', 'long', 'clothing', 'cashallow',
  'dedlnr', 'dedmed', 'dedtax', 'dedpag', 'netpay',
  'govtlnr', 'govtecc', 'govtmed', 'govtpag',
  'mid_bonus', 'mid_cash', 'end_bonus', 'end_cash',
  'add_bonus', 'taxref', 'special', 'over_wheld',
  'exgrade', 'exstep',
  'exbasic', 'exlnr', 'exmed', 'expag', 'extax',
  'exglnr', 'exgmed', 'exgpag', 'exgecc',
  'saldiff', 'lnrdiff', 'meddiff', 'pagdiff', 'taxdiff',
  'glnrdiff', 'gmeddiff', 'gpagdiff', 'geccdiff',
  'hazard_pay', 'salary_differential', 'other_compensation', 'other_earnings',
]);

const STATUS_MAP: Record<string, string> = {
  A: 'Active', I: 'Inactive', R: 'Resigned', T: 'Terminated',
};

// ── Case-insensitive DBF access ─────────────────────────────────────────────
// FoxPro files usually store UPPERCASE field names, but some exports use
// mixed/lowercase. Every lookup below normalizes keys first so a differently
// cased MASTFILE.DBF never yields blank columns.

type NormRec = Map<string, unknown>;

function normRec(rec: DbfRecord): NormRec {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(rec)) map.set(k.trim().toUpperCase(), v);
  return map;
}

/** Case-insensitive raw value (undefined when the column is absent). */
export function dbfVal(rec: DbfRecord, key: string): unknown {
  const upper = key.trim().toUpperCase();
  if (rec[key] !== undefined) return rec[key];
  for (const k of Object.keys(rec)) {
    if (k.trim().toUpperCase() === upper) return rec[k];
  }
  return undefined;
}

/** Case-insensitive trimmed string ('" when absent). */
export function dbfStr(rec: DbfRecord, key: string): string {
  const v = dbfVal(rec, key);
  return v != null ? String(v).trim() : '';
}

function nstr(n: NormRec, key: string): string {
  const v = n.get(key);
  return v != null ? String(v).trim() : '';
}

function nnum(n: NormRec, key: string): number {
  const v = n.get(key);
  if (v == null || v === '') return 0;
  const num = Number(v);
  return Number.isNaN(num) ? 0 : num;
}

function ndate(n: NormRec, key: string): string | null {
  const v = n.get(key);
  if (!v || typeof v !== 'string') return null;
  return v.length >= 10 ? v.slice(0, 10) : null;
}

function nint(n: NormRec, key: string): number {
  return parseInt(nstr(n, key)) || 0;
}

/**
 * Build a PocketBase-safe `employees` payload from one MASTFILE.DBF record.
 *
 * - Row requirement is EMPNO only (a blank LNAME must not drop the row).
 * - `present` is the file's field-name set (uppercased). Columns the file
 *   does not carry are OMITTED from the payload: on insert PocketBase fills
 *   its defaults, on update the merge keeps the stored value — the file can
 *   never blank a column it does not have. Pass null to assume all present.
 * - Returns `null` when the row has no usable EMPNO — the caller must count
 *   it as skipped, never insert a blank row.
 */
export function buildMastfilePayload(
  rec: DbfRecord,
  scope: { regcode: string; divcode: string; divisionId: string | null },
  payrollGroupId: string | null,
  nowIso: string,
  present?: Set<string> | null,
): Record<string, unknown> | null {
  const n = normRec(rec);
  const has = (col: string): boolean => !present || present.has(col);
  const empno = nstr(n, 'EMPNO');
  if (!empno) return null;

  const fname = nstr(n, 'FNAME');
  const mi = nstr(n, 'MI');
  const lname = nstr(n, 'LNAME');
  const poscode = nstr(n, 'POSCODE');
  const banker = nstr(n, 'BANKER');
  const account = nstr(n, 'ACCOUNT');
  const basic = has('BASIC') ? nnum(n, 'BASIC') : undefined;
  const taxcode = nstr(n, 'TAXCODE') || 'ME1';
  const phicId = nstr(n, 'PHIC_ID');
  const hdmfId = nstr(n, 'HDMF_ID');
  const hiredate = has('HIREDATE') ? ndate(n, 'HIREDATE') : undefined;

  const t = (col: string): string | undefined =>
    has(col) ? nstr(n, col) : undefined;
  const f = (col: string): number | undefined =>
    has(col) ? nnum(n, col) : undefined;
  const d = (col: string): string | null | undefined =>
    has(col) ? ndate(n, col) : undefined;
  const i = (col: string): number | undefined =>
    has(col) ? nint(n, col) : undefined;

  const payload: Record<string, unknown> = {
    // Keys (both spellings kept in sync so legacy + masterfile reads match)
    empno, employee_number: empno,
    fname, first_name: fname,
    mi, middle_name: mi,
    lname, last_name: lname,
    appel: t('APPEL'),
    empname: t('EMPNAME'),
    regcode: scope.regcode,
    divcode: scope.divcode,
    division_id: scope.divisionId,
    stacode: nstr(n, 'STACODE'),
    distcode: t('DISTCODE') ?? '',
    category: t('CATEGORY') ?? '',
    account, bank_account: account,
    banker, bank_name: banker,
    poscode, position: poscode,
    paymode: nstr(n, 'PAYMODE') || 'ATM',
    grade: i('GRADE'),
    step: i('STEP'),
    basic, basic_salary: basic,
    trans: f('TRANS'),
    pera: f('PERA'),
    aca: f('ACA'),
    rata: f('RATA'),
    ontop: f('ONTOP'),
    long: f('LONG'),
    clothing: f('CLOTHING'),
    cashallow: f('CASHALLOW'),
    dedlnr: f('DEDLNR'),
    dedmed: f('DEDMED'),
    dedtax: f('DEDTAX'),
    dedpag: f('DEDPAG'),
    netpay: f('NETPAY'),
    govtlnr: f('GOVTLNR'),
    govtecc: f('GOVTECC'),
    govtmed: f('GOVTMED'),
    govtpag: f('GOVTPAG'),
    pagcode: t('PAGCODE'),
    taxcode, tax_status: taxcode,
    civilstat: t('CIVILSTAT'),
    attend: t('ATTEND'),
    status: STATUS_MAP[nstr(n, 'STATUS').toUpperCase()] || 'Active',
    sex: t('SEX'),
    tin: t('TIN'),
    gsis_pn: t('GSIS_PN'),
    gsis_id: t('GSIS_ID'),
    hdmf_id: hdmfId, pagibig_number: hdmfId,
    phic_id: phicId, philhealth_number: phicId,
    pib: t('PIB'),
    birthdate: d('BIRTHDATE'),
    update: d('UPDATE'),
    paydate: d('PAYDATE'),
    hiredate, hire_date: hiredate,
    mid_bonus: f('MID_BONUS'),
    mid_cash: f('MID_CASH'),
    end_bonus: f('END_BONUS'),
    end_cash: f('END_CASH'),
    add_bonus: f('ADD_BONUS'),
    taxref: f('TAXREF'),
    special: f('SPECIAL'),
    over_wheld: f('OVER_WHELD'),
    exposcode: t('EXPOSCODE'),
    exgrade: i('EXGRADE'),
    exstep: i('EXSTEP'),
    exbasic: f('EXBASIC'),
    exlnr: f('EXLNR'),
    exmed: f('EXMED'),
    expag: f('EXPAG'),
    extax: f('EXTAX'),
    exglnr: f('EXGLNR'),
    exgmed: f('EXGMED'),
    exgpag: f('EXGPAG'),
    exgecc: f('EXGECC'),
    saldiff: f('SALDIFF'),
    lnrdiff: f('LNRDIFF'),
    meddiff: f('MEDDIFF'),
    pagdiff: f('PAGDIFF'),
    taxdiff: f('TAXDIFF'),
    glnrdiff: f('GLNRDIFF'),
    gmeddiff: f('GMEDDIFF'),
    gpagdiff: f('GPAGDIFF'),
    geccdiff: f('GECCDIFF'),
    updcode: t('UPDCODE'),
    editor: t('EDITOR'),
    depname1: t('DEPNAME1'),
    depname2: t('DEPNAME2'),
    depname3: t('DEPNAME3'),
    depname4: t('DEPNAME4'),
    depdate1: d('DEPDATE1'),
    depdate2: d('DEPDATE2'),
    depdate3: d('DEPDATE3'),
    depdate4: d('DEPDATE4'),
    payroll_group_id: payrollGroupId,
    updated_at: nowIso,
  };

  return sanitizeEmployeePayload(payload);
}

/**
 * Strip unknown keys and coerce types so PocketBase never rejects a write.
 * This is the anti-data-loss guard: a single unknown/ mistyped field must not
 * fail an entire 500-row batch.
 */
export function sanitizeEmployeePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (MASTFILE_NUMBER_FIELDS.has(key)) {
      const n = typeof value === 'number' ? value : Number(value);
      out[key] = Number.isNaN(n) ? 0 : n;
    } else if (MASTFILE_TEXT_FIELDS.has(key)) {
      if (value === null) {
        out[key] = key === 'payroll_group_id' || key === 'division_id' ? null : '';
      } else {
        out[key] = String(value);
      }
    }
    // Unknown keys are dropped silently — never let them 400 the batch.
  }
  // PocketBase relation fields reject empty strings; normalize to null.
  if (out.payroll_group_id === '') out.payroll_group_id = null;
  if (out.division_id === '') out.division_id = null;
  return out;
}

/**
 * Merge a file payload over an existing row without blanking data the file
 * does not carry: absent columns are omitted from the payload upstream, and
 * any residual empty string / null keeps the stored value. Numeric zeros are
 * real file values (most allowances are legitimately 0) so they always win —
 * otherwise corrections back to 0 could never apply and stale values would
 * look like missing data.
 */
export function mergeWithoutDataLoss(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...incoming };
  for (const [key, value] of Object.entries(incoming)) {
    const isEmpty = value === '' || value === null || value === undefined;
    if (isEmpty && existing[key] !== undefined && existing[key] !== null && existing[key] !== '') {
      merged[key] = existing[key];
    }
  }
  return merged;
}
