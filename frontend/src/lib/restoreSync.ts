import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import type { PayrollGroup } from '@/types/payroll';

export interface SyncResult {
  tableName: string;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * The division context an upload happens in. When a DBF record does not carry
 * its own REGCODE/DIVCODE columns (or they are blank), the current division's
 * codes are stamped on the row so the uploaded employees appear in that
 * division's Employee Records instead of becoming invisible/global rows.
 */
export interface SyncScope {
  regcode: string;
  divcode: string;
}

/**
 * Whitelist of fields the PocketBase `employees` collection actually stores.
 * PocketBase rejects create/update calls that include fields not present in the
 * collection schema, so the masterfile payload is sanitized down to exactly
 * these keys before insert/update — otherwise the whole record fails and gets
 * silently skipped (MASTFILE never reaches Employee Records).
 */
const EMPLOYEE_SCHEMA_FIELDS = new Set([
  // Legacy fields
  'employee_number', 'last_name', 'first_name', 'middle_name', 'position',
  'department', 'bank_name', 'bank_account', 'basic_salary', 'hourly_rate',
  'tax_status', 'sss_number', 'philhealth_number', 'pagibig_number', 'hire_date',
  // Masterfile 80-column fields
  'regcode', 'divcode', 'stacode', 'empno', 'account', 'empname',
  'fname', 'lname', 'mi', 'appel', 'poscode', 'paymode',
  // Salary & Grade
  'grade', 'step', 'basic', 'trans', 'pera', 'aca', 'rata', 'ontop',
  'long', 'clothing', 'cashallow',
  // Deductions (employee share)
  'dedlnr', 'dedmed', 'dedtax', 'dedpag', 'netpay',
  // Government share
  'govtlnr', 'govtecc', 'govtmed', 'govtpag',
  // Codes & Status
  'pagcode', 'taxcode', 'civilstat', 'attend', 'status', 'sex', 'tin',
  // Government IDs
  'gsis_pn', 'gsis_id', 'hdmf_id', 'phic_id', 'pib', 'banker',
  // Dates
  'birthdate', 'update', 'paydate', 'hiredate',
  // Bonuses & Adjustments
  'mid_bonus', 'mid_cash', 'end_bonus', 'end_cash', 'add_bonus',
  'taxref', 'special', 'over_wheld',
  // Excess fields
  'exposcode', 'exgrade', 'exstep', 'exbasic', 'exlnr', 'exmed',
  'expag', 'extax', 'exglnr', 'exgmed', 'exgpag', 'exgecc',
  // Difference fields
  'saldiff', 'lnrdiff', 'meddiff', 'pagdiff', 'taxdiff',
  'glnrdiff', 'gmeddiff', 'gpagdiff', 'geccdiff',
  // Metadata
  'updcode', 'editor',
  // Dependents
  'depname1', 'depname2', 'depname3', 'depname4',
  'depdate1', 'depdate2', 'depdate3', 'depdate4',
  // Payroll Group & Division
  'payroll_group_id', 'distcode', 'division_id', 'region_id',
]);

export function sanitizeEmployeePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (EMPLOYEE_SCHEMA_FIELDS.has(key)) clean[key] = payload[key];
  }
  return clean;
}

/**
 * Normalize a code for matching: trim, uppercase, and strip leading zeros from
 * numeric codes ('01' vs '1') so legacy DBF values match the app directory.
 */
function normCode(v: string): string {
  return (v ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
}

/**
 * Division key: exact trimmed/uppercased REGCODE|DIVCODE. A second normalized
 * key (leading zeros stripped from both codes) is registered as a fallback so
 * '01|001' matches '1|1' style directories.
 */
function divisionKeys(regcode: string, divcode: string): string[] {
  const exact = `${regcode.trim().toUpperCase()}|${divcode.trim().toUpperCase()}`;
  const norm = `${normCode(regcode)}|${normCode(divcode)}`;
  return norm === exact ? [exact] : [exact, norm];
}

interface DivisionDirectory {
  /** "regcode|divcode" (exact + normalized variants) → division id (uuid). */
  byCodes: Map<string, string>;
  /** division id (uuid) → canonical (regcode, divcode) from the directory. */
  byId: Map<string, { regcode: string; divcode: string }>;
}

/**
 * Load the divisions + regions directory once, indexed both by REGCODE|DIVCODE
 * codes and by division id. Used so uploaded rows are stamped with division_id
 * (matching division_id-based scoping) and, when the file only carries codes,
 * the canonical codes from the directory.
 */
export async function loadDivisionDirectory(): Promise<DivisionDirectory> {
  const byCodes = new Map<string, string>();
  const byId = new Map<string, { regcode: string; divcode: string }>();
  // Query divisions and regions separately — PocketBase doesn't support
  // Supabase's expand/join syntax (e.g. 'regions(region_code)').
  const divisions = await fetchAll(() =>
    supabase.from('divisions').select('id,division_code,region_id'),
  );
  const regions = await fetchAll(() =>
    supabase.from('regions').select('id,region_code'),
  );
  const regionMap = new Map<string, string>();
  (regions as { id: string; region_code: string | null }[]).forEach((r) => {
    if (r.id && r.region_code) regionMap.set(r.id, r.region_code);
  });
  (divisions as { id: string; division_code: string | null; region_id: string | null }[]).forEach((d) => {
    const regionCode = d.region_id ? regionMap.get(d.region_id) ?? null : null;
    if (!d.id || !d.division_code || !regionCode) return;
    for (const key of divisionKeys(regionCode, d.division_code)) {
      byCodes.set(key, d.id);
    }
    byId.set(d.id, { regcode: regionCode, divcode: d.division_code });
  });
  return { byCodes, byId };
}

/**
 * Resolve a division id for a (REGCODE, DIVCODE) pair, trying the exact pair
 * first and then the normalized (zero-stripped) form.
 */
export function resolveDivisionId(
  directory: DivisionDirectory,
  regcode: string,
  divcode: string,
): string | null {
  if (!regcode || !divcode) return null;
  for (const key of divisionKeys(regcode, divcode)) {
    const id = directory.byCodes.get(key);
    if (id) return id;
  }
  return null;
}

/**
 * school_code → division id (uuid) map, used to derive an employee's division
 * from the School Directory when the masterfile row has no usable codes.
 */
export async function loadSchoolDivisionMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const schoolRows = await fetchAll(() =>
    supabase.from('schools').select('school_code, division_id'),
  );
  (schoolRows as { school_code: string | null; division_id: string | null }[]).forEach((s) => {
    if (s.school_code && s.division_id) map.set(s.school_code.trim(), s.division_id);
  });
  return map;
}

export interface EmployeeScopeResolution {
  regcode: string;
  divcode: string;
  divisionId: string | null;
}

/**
 * Resolve the division context for one masterfile row.
 *
 * Priority:
 *  1. The row's own REGCODE/DIVCODE — resolved against the divisions directory
 *     (zero-strip tolerant) and CANONICALIZED to the directory's codes so the
 *     stored values always match the code-based scoping the query RPCs use
 *     (`regcode = directory_region_code AND divcode = directory_division_code`).
 *  2. The uploader's scope (the division they are working in) — used when the
 *     row carries no usable codes.
 *  3. The row's STACODE → school → division, so an upload that only carries
 *     station codes still lands in the correct division.
 *
 * Never leaves a row unscoped when any of the above can resolve, and always
 * returns canonical codes when a division is resolved.
 */
export function resolveEmployeeScope(
  divisionDirectory: DivisionDirectory,
  schoolDivision: Map<string, string>,
  rowRegcode: string,
  rowDivcode: string,
  stacode: string,
  scope: SyncScope | null | undefined,
): EmployeeScopeResolution {
  const candidateReg = rowRegcode || scope?.regcode || '';
  const candidateDiv = rowDivcode || scope?.divcode || '';
  let divisionId = resolveDivisionId(divisionDirectory, candidateReg, candidateDiv);
  let regcode = candidateReg;
  let divcode = candidateDiv;

  // Canonicalize: whenever the codes resolve to a directory division, store the
  // directory's canonical codes. Legacy DBF exports often zero-pad ('01'/'001'
  // vs the directory's '1'/'1'), and scoping matches on exact equality.
  if (divisionId) {
    const canonical = divisionDirectory.byId.get(divisionId);
    if (canonical) {
      regcode = canonical.regcode;
      divcode = canonical.divcode;
    }
  }

  // STACODE fallback: derive the division from the employee's school when the
  // codes don't resolve (or the row carries none) — canonical codes come from
  // the directory so code-based scoping matches.
  if (!divisionId && stacode) {
    const sid = schoolDivision.get(stacode.trim());
    const codes = sid ? divisionDirectory.byId.get(sid) : undefined;
    if (sid && codes) {
      divisionId = sid;
      regcode = codes.regcode;
      divcode = codes.divcode;
    }
  }

  return { regcode, divcode, divisionId };
}

function str(rec: DbfRecord, key: string): string {
  const v = rec[key];
  return v != null ? String(v).trim() : '';
}

function num(rec: DbfRecord, key: string): number {
  const v = rec[key];
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function dateStr(rec: DbfRecord, key: string): string | null {
  const v = rec[key];
  if (!v || typeof v !== 'string') return null;
  return v.length >= 10 ? v.slice(0, 10) : null;
}

const STATUS_MAP: Record<string, string> = { A: 'Active', I: 'Inactive', R: 'Resigned', T: 'Terminated' };

function decodeStatus(val: string): string {
  const v = val.trim().toUpperCase();
  if (v === 'A' || v === 'ACTIVE') return 'Active';
  if (v === 'S' || v === 'SUSPENDED') return 'Suspended';
  if (v === 'T' || v === 'TERMINATED') return 'Terminated';
  return 'Active';
}

function decodeType(val: string): string {
  const v = val.trim().toUpperCase();
  if (v === 'L' || v === 'LOAN') return 'Loan';
  if (v === 'I' || v === 'INSURANCE') return 'Insurance';
  if (v === 'M' || v === 'MEMBERSHIP') return 'Membership';
  if (v === 'S' || v === 'SAVINGS') return 'Savings';
  return 'Other';
}

export async function syncMastfile(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null): Promise<SyncResult> {
  const errors: string[] = [];
  let skipped = 0;

  const { records } = decodeDbf(bytes);
  if (records.length === 0) {
    return { tableName: 'MASTFILE', imported: 0, skipped: 0, errors: ['No records found in DBF file.'] };
  }

  // Division lookup: stamp division_id on rows that carry REGCODE/DIVCODE so
  // division_id-based RLS/scoping also matches. When the file's codes are
  // missing or do not resolve, fall back to the STACODE's school → division.
  const divisionDirectory = await loadDivisionDirectory();
  const schoolDivision = await loadSchoolDivisionMap();

  const filtered = category
    ? records.filter((rec) => inCategory(str(rec, 'STACODE'), category))
    : records;

  const groups = await fetchAll(() =>
    supabase.from('payroll_groups').select('id,group_code,group_name,stacode_min,stacode_max,status').order('group_code'),
  );
  const groupList = groups as PayrollGroup[];

  const existing = await fetchAll<{ id: string; empno: string | null; employee_number: string }>(() =>
    supabase.from('employees').select('id,empno,employee_number'),
  );
  const existingMap = new Map<string, string>();
  existing.forEach((e) => {
    const key = (e.empno || e.employee_number || '').trim();
    if (key) existingMap.set(key, e.id);
  });

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  const now = new Date().toISOString();

  for (const rec of filtered) {
    const empno = str(rec, 'EMPNO');
    const lname = str(rec, 'LNAME');
    if (!empno || !lname) { skipped++; continue; }

    const stacode = str(rec, 'STACODE');
    // REGCODE/DIVCODE come from the DBF columns when present; fall back to the
    // division the uploader is working in so the row is visible in that
    // division's Employee Records (never left blank/global). Codes that resolve
    // against the divisions directory are canonicalized (zero-padded variants
    // like '01'/'001' become the directory's '1'/'1') so the code-based scoping
    // the query RPCs use always matches the stored values.
    const rowRegcode = str(rec, 'REGCODE');
    const rowDivcode = str(rec, 'DIVCODE');
    const { regcode, divcode, divisionId } = resolveEmployeeScope(
      divisionDirectory, schoolDivision, rowRegcode, rowDivcode, stacode, scope,
    );
    const payload: Record<string, unknown> = {
      empno,
      fname: str(rec, 'FNAME'),
      mi: str(rec, 'MI'),
      lname,
      appel: str(rec, 'APPEL'),
      empname: str(rec, 'EMPNAME'),
      regcode,
      divcode,
      division_id: divisionId,
      stacode,
      account: str(rec, 'ACCOUNT'),
      poscode: str(rec, 'POSCODE'),
      paymode: str(rec, 'PAYMODE') || 'ATM',
      grade: parseInt(str(rec, 'GRADE')) || 0,
      step: parseInt(str(rec, 'STEP')) || 0,
      basic: num(rec, 'BASIC'),
      trans: num(rec, 'TRANS'),
      pera: num(rec, 'PERA'),
      aca: num(rec, 'ACA'),
      rata: num(rec, 'RATA'),
      ontop: num(rec, 'ONTOP'),
      long: num(rec, 'LONG'),
      clothing: num(rec, 'CLOTHING'),
      cashallow: num(rec, 'CASHALLOW'),
      dedlnr: num(rec, 'DEDLNR'),
      dedmed: num(rec, 'DEDMED'),
      dedtax: num(rec, 'DEDTAX'),
      dedpag: num(rec, 'DEDPAG'),
      netpay: num(rec, 'NETPAY'),
      govtlnr: num(rec, 'GOVTLNR'),
      govtecc: num(rec, 'GOVTECC'),
      govtmed: num(rec, 'GOVTMED'),
      govtpag: num(rec, 'GOVTPAG'),
      pagcode: str(rec, 'PAGCODE'),
      taxcode: str(rec, 'TAXCODE') || 'ME1',
      civilstat: str(rec, 'CIVILSTAT'),
      attend: str(rec, 'ATTEND'),
      status: STATUS_MAP[str(rec, 'STATUS').toUpperCase()] || 'Active',
      sex: str(rec, 'SEX'),
      tin: str(rec, 'TIN'),
      gsis_pn: str(rec, 'GSIS_PN'),
      gsis_id: str(rec, 'GSIS_ID'),
      hdmf_id: str(rec, 'HDMF_ID'),
      phic_id: str(rec, 'PHIC_ID'),
      banker: str(rec, 'BANKER'),
      pib: str(rec, 'PIB'),
      birthdate: dateStr(rec, 'BIRTHDATE'),
      update: dateStr(rec, 'UPDATE'),
      paydate: dateStr(rec, 'PAYDATE'),
      hiredate: dateStr(rec, 'HIREDATE'),
      mid_bonus: num(rec, 'MID_BONUS'),
      mid_cash: num(rec, 'MID_CASH'),
      end_bonus: num(rec, 'END_BONUS'),
      end_cash: num(rec, 'END_CASH'),
      add_bonus: num(rec, 'ADD_BONUS'),
      taxref: num(rec, 'TAXREF'),
      special: num(rec, 'SPECIAL'),
      over_wheld: num(rec, 'OVER_WHELD'),
      exposcode: str(rec, 'EXPOSCODE'),
      exgrade: parseInt(str(rec, 'EXGRADE')) || 0,
      exstep: parseInt(str(rec, 'EXSTEP')) || 0,
      exbasic: num(rec, 'EXBASIC'),
      exlnr: num(rec, 'EXLNR'),
      exmed: num(rec, 'EXMED'),
      expag: num(rec, 'EXPAG'),
      extax: num(rec, 'EXTAX'),
      exglnr: num(rec, 'EXGLNR'),
      exgmed: num(rec, 'EXGMED'),
      exgpag: num(rec, 'EXGPAG'),
      exgecc: num(rec, 'EXGECC'),
      saldiff: num(rec, 'SALDIFF'),
      lnrdiff: num(rec, 'LNRDIFF'),
      meddiff: num(rec, 'MEDDIFF'),
      pagdiff: num(rec, 'PAGDIFF'),
      taxdiff: num(rec, 'TAXDIFF'),
      glnrdiff: num(rec, 'GLNRDIFF'),
      gmeddiff: num(rec, 'GMEDDIFF'),
      gpagdiff: num(rec, 'GPAGDIFF'),
      geccdiff: num(rec, 'GECCDIFF'),
      updcode: str(rec, 'UPDCODE'),
      editor: str(rec, 'EDITOR'),
      depname1: str(rec, 'DEPNAME1'),
      depname2: str(rec, 'DEPNAME2'),
      depname3: str(rec, 'DEPNAME3'),
      depname4: str(rec, 'DEPNAME4'),
      depdate1: dateStr(rec, 'DEPDATE1'),
      depdate2: dateStr(rec, 'DEPDATE2'),
      depdate3: dateStr(rec, 'DEPDATE3'),
      depdate4: dateStr(rec, 'DEPDATE4'),
      distcode: str(rec, 'DISTCODE') || '',
      payroll_group_id: classifyByStacode(stacode, groupList)?.id ?? null,
      employee_number: empno,
      first_name: str(rec, 'FNAME'),
      last_name: lname,
      middle_name: str(rec, 'MI'),
      position: str(rec, 'POSCODE'),
      basic_salary: num(rec, 'BASIC'),
      hire_date: dateStr(rec, 'HIREDATE'),
      updated_at: now,
    };

    const existingId = existingMap.get(empno);
    if (existingId) {
      toUpdate.push({ id: existingId, data: sanitizeEmployeePayload(payload) });
    } else {
      toInsert.push(sanitizeEmployeePayload(payload));
    }
  }

  let imported = 0;
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('employees').insert(batch);
      if (error) { errors.push(`Upsert batch error: ${error.message}`); skipped += batch.length; }
      else imported += batch.length;
    }
  }
  for (let i = 0; i < toUpdate.length; i++) {
    const { error } = await supabase.from('employees').update(toUpdate[i].data).eq('id', toUpdate[i].id);
    if (error) { skipped++; }
    else imported++;
  }

  return { tableName: 'MASTFILE', imported, skipped, errors: errors.slice(0, 10) };
}

export async function syncDedfile(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null): Promise<SyncResult> {
  const errors: string[] = [];
  let skipped = 0;

  const { records } = decodeDbf(bytes);
  if (records.length === 0) {
    return { tableName: 'DEDFILE', imported: 0, skipped: 0, errors: ['No records found in DBF file.'] };
  }

  // Division context for stub employees created from unknown EMPNOs — stamp
  // them with the uploader's division so they appear in that division's
  // Employee Records instead of becoming invisible global rows.
  const divisionDirectory = await loadDivisionDirectory();

  const existingEmps = await fetchAll(() => supabase.from('employees').select('id,empno,employee_number,stacode'));
  const empByNumber = new Map<string, string>();
  (existingEmps as { id: string; empno: string | null; employee_number: string | null; stacode: string | null }[]).forEach((e) => {
    if (e.empno) empByNumber.set(e.empno.trim(), e.id);
    if (e.employee_number) empByNumber.set(e.employee_number.trim(), e.id);
  });

  // DEDFILE is a per-employee masterfile: process every record, regardless of
  // the selected Elementary/High-School category. The category stacode filter
  // previously wiped out the whole import when it didn't match the employees'
  // stacode range, silently leaving `deductions` empty.
  const dedfileRecords = records;

  const unknownEmpnos = new Set<string>();
  for (const rec of dedfileRecords) {
    const empno = str(rec, 'EMPNO');
    if (empno && !empByNumber.has(empno)) unknownEmpnos.add(empno);
  }

  const unknownList = [...unknownEmpnos].filter((empno) => !empByNumber.has(empno));
  if (unknownList.length > 0) {
    const stubRegcode = scope?.regcode ?? '';
    const stubDivcode = scope?.divcode ?? '';
    // Canonicalize the stub's codes against the directory so the created stub
    // lands in (and stays visible to) the uploader's division scope.
    const stubScope = resolveEmployeeScope(divisionDirectory, new Map(), stubRegcode, stubDivcode, '', null);
    const stubs = unknownList.map((empno) => ({
      employee_number: empno, empno, last_name: '(Imported)', first_name: empno, status: 'Active',
      regcode: stubScope.regcode,
      divcode: stubScope.divcode,
    }));
    for (let i = 0; i < stubs.length; i += 500) {
      const batch = stubs.slice(i, i + 500);
      const { error } = await supabase.from('employees').insert(batch);
      if (error) { errors.push(`Stub employee insert error: ${error.message}`); skipped += batch.length; }
    }
    const newEmps = await chunkedIn('employee_number', unknownList, () =>
      supabase.from('employees').select('id,empno,employee_number'),
    );
    (newEmps as { id: string; empno: string | null; employee_number: string | null }[]).forEach((e) => {
      if (e.empno) empByNumber.set(e.empno.trim(), e.id);
      if (e.employee_number) empByNumber.set(e.employee_number.trim(), e.id);
    });
  }

  const FIELDS_MAP: Record<string, string[]> = {
    empno: ['EMPNO'], dedcode: ['DEDCODE'], dedid: ['DEDID'], policyno: ['POLICYNO'],
    effmm: ['EFFMM'], effyy: ['EFFYY'], termm: ['TERMM'], teryy: ['TERYY'],
    dedamt: ['DEDAMT'], principal: ['PRINCIPAL'], interest: ['INTEREST'],
    charges: ['CHARGES'], proceeds: ['PROCEEDS'], agency: ['AGENCY', 'AGENT'],
    status: ['STATUS'], type: ['TYPE'], stacode: ['STACODE'],
    regcode: ['REGCODE'], divcode: ['DIVCODE'],
    fname: ['FNAME'], mi: ['MI'], lname: ['LNAME'], appel: ['APPEL'],
    netpay: ['NETPAY'], policydate: ['POLICYDATE'], absno: ['ABSNO'],
    underhr: ['UNDERHR'], undermin: ['UNDERMIN'], bill: ['BILL'],
    abmm: ['ABMM'], abyy: ['ABYY'], oldcode: ['OLDCODE'],
    hiredate: ['HIREDATE'], birthdate: ['BIRTHDATE'], gsis_bpn: ['GSIS_BPN'],
    qs: ['QS'], upcode: ['UPDCODE'], paydate: ['PAYDATE'], editor: ['EDITOR'],
    dbf_id: ['ID'],
  };

  function normRow(rec: DbfRecord): Record<string, string> {
    const row: Record<string, string> = {};
    for (const [normKey, aliases] of Object.entries(FIELDS_MAP)) {
      for (const alias of aliases) {
        const v = str(rec, alias);
        if (v) { row[normKey] = v; break; }
      }
      if (row[normKey] === undefined) row[normKey] = '';
    }
    return row;
  }

  // Resolve deduction-code display info from deduction_codes (DEDCODE -> name/type).
  const codeInfo = new Map<string, { dedname: string; type: string }>();
  const dedCodes = await fetchAll(() => supabase.from('deduction_codes').select('dedcode,dedname,type'));
  (dedCodes ?? []).forEach((c: { dedcode: string; dedname?: string; type?: string }) => {
    codeInfo.set(c.dedcode, { dedname: c.dedname ?? c.dedcode, type: c.type ?? 'Other' });
  });

  // DEDFILE is a masterfile, not period-scoped. Stamp the current open/draft
  // period when one is resolvable; otherwise leave pay_period_id null.
  let periodId: string | null = null;
  try {
    const { data: openPeriod } = await supabase
      .from('pay_periods')
      .select('id')
      .in('status', ['open', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openPeriod) periodId = openPeriod.id as string;
  } catch {
    periodId = null;
  }

  const rows: Record<string, unknown>[] = [];
  const masterRows: Record<string, unknown>[] = [];
  const importedEmpIds = new Set<string>();
  for (const rec of dedfileRecords) {
    const r = normRow(rec);
    const empno = (r['empno'] ?? '').trim();
    const dedcode = (r['dedcode'] ?? '').trim().toUpperCase();
    if (!empno || !dedcode) { skipped++; continue; }
    const empId = empByNumber.get(empno);
    if (!empId) { skipped++; continue; }
    const dedamt = parseFloat(r['dedamt'] ?? '0') || 0;
    if (dedamt < 0) { skipped++; continue; }
    const info = codeInfo.get(dedcode);
    rows.push({
      employee_id: empId,
      pay_period_id: periodId,
      deduction_code: dedcode,
      deduction_name: info?.dedname || dedcode,
      category: info?.type || 'Other',
      amount: dedamt,
      source: 'DEDFILE',
      reference: r['policyno'] ?? '',
      // Full DEDFILE columns — enables the Deductions view to display
      // effectivity, termination, type, agency, loan details, etc.
      stacode: r['stacode'] ?? '',
      effmm: r['effmm'] ?? '',
      effyy: r['effyy'] ?? '',
      termm: r['termm'] ?? '',
      teryy: r['teryy'] ?? '',
      type: info?.type || r['type'] || '',
      agency: r['agency'] ?? '',
      policyno: r['policyno'] ?? '',
      policydate: r['policydate'] ?? '',
      status: r['status'] ?? 'Active',
      principal: parseFloat(r['principal'] ?? '0') || 0,
      interest: parseFloat(r['interest'] ?? '0') || 0,
      charges: parseFloat(r['charges'] ?? '0') || 0,
      proceeds: parseFloat(r['proceeds'] ?? '0') || 0,
      absno: parseFloat(r['absno'] ?? '0') || 0,
      underhr: parseFloat(r['underhr'] ?? '0') || 0,
      undermin: parseFloat(r['undermin'] ?? '0') || 0,
      oldcode: r['oldcode'] ?? '',
      hiredate: r['hiredate'] ?? '',
      birthdate: r['birthdate'] ?? '',
      gsis_bpn: r['gsis_bpn'] ?? '',
      qs: r['qs'] ?? '',
      paydate: r['paydate'] ?? '',
      editor: r['editor'] ?? '',
    });
    importedEmpIds.add(empId);
    // DEDFILE masterfile row (payroll_deductions) — consumed by Run Payroll's
    // deduction computation, the Deduction Masterfile view, GSIS/PLI matching,
    // Reports, and the employee payslip card.
    masterRows.push({
      employee_id: empId,
      empno,
      dedcode,
      dedid: info?.dedname || r['dedid'] || dedcode,
      type: info?.type || r['type'] || '',
      agency: r['agency'] ?? '',
      dedamt,
      policyno: r['policyno'] ?? '',
      policydate: r['policydate'] ?? '',
      effmm: r['effmm'] ?? '', effyy: r['effyy'] ?? '',
      termm: r['termm'] ?? '', teryy: r['teryy'] ?? '',
      principal: parseFloat(r['principal'] ?? '0') || 0,
      interest: parseFloat(r['interest'] ?? '0') || 0,
      charges: parseFloat(r['charges'] ?? '0') || 0,
      proceeds: parseFloat(r['proceeds'] ?? '0') || 0,
      status: r['status'] ?? 'Active',
      stacode: r['stacode'] ?? '',
      regcode: r['regcode'] ?? '', divcode: r['divcode'] ?? '',
      absno: parseFloat(r['absno'] ?? '0') || 0,
      underhr: parseFloat(r['underhr'] ?? '0') || 0,
      undermin: parseFloat(r['undermin'] ?? '0') || 0,
      oldcode: r['oldcode'] ?? '',
      hiredate: r['hiredate'] ?? '', birthdate: r['birthdate'] ?? '',
      gsis_bpn: r['gsis_bpn'] ?? '', qs: r['qs'] ?? '',
      paydate: r['paydate'] ?? '', editor: r['editor'] ?? '',
      created_by: 'system',
    });
  }
  const uniqueIds = [...importedEmpIds];

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('deductions').insert(batch);
    if (error) { errors.push(`Insert batch error: ${error.message}`); skipped += batch.length; }
    else imported += batch.length;
  }

  // Payroll_deductions is a full DEDFILE masterfile snapshot — clear this
  // import's employees first so re-runs don't accumulate duplicates.
  // Chunk sizes stay well under ~100 because the PocketBase filter parser
  // rejects longer `.in()` OR-expansions ("Something went wrong while
  // processing your request.").
  const CLEAR_CHUNK = 60;
  let cleared = 0;
  for (let i = 0; i < uniqueIds.length; i += CLEAR_CHUNK) {
    const chunk = uniqueIds.slice(i, i + CLEAR_CHUNK);
    const { data: existing, error } = await supabase.from('payroll_deductions').select('id').in('employee_id', chunk);
    if (error) { errors.push(`Masterfile clear error: ${error.message}`); continue; }
    for (let j = 0; j < (existing ?? []).length; j += CLEAR_CHUNK) {
      const idChunk = (existing ?? []).slice(j, j + CLEAR_CHUNK).map((x: any) => x.id);
      const { error: delErr } = await supabase.from('payroll_deductions').delete().in('id', idChunk);
      if (delErr) { errors.push(`Masterfile delete error: ${delErr.message}`); continue; }
      cleared += idChunk.length;
    }
  }
  for (let i = 0; i < masterRows.length; i += 500) {
    const batch = masterRows.slice(i, i + 500);
    const { error } = await supabase.from('payroll_deductions').insert(batch);
    if (error) { errors.push(`Masterfile insert batch error: ${error.message}`); }
  }

  return { tableName: 'DEDFILE', imported, skipped, errors: errors.slice(0, 10) };
}
