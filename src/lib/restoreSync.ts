import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { recomputeEmployeeNetPay, bulkRecomputeNetPay } from '@/lib/recompute';
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
  const { data } = await supabase
    .from('divisions')
    .select('id, division_code, regions(region_code)');
  (data ?? []).forEach((r: { id: string; division_code: string | null; regions?: { region_code: string | null } | { region_code: string | null }[] | null }) => {
    const regionCode = Array.isArray(r.regions) ? r.regions[0]?.region_code ?? null : r.regions?.region_code ?? null;
    if (!r.id || !r.division_code || !regionCode) return;
    for (const key of divisionKeys(regionCode, r.division_code)) {
      byCodes.set(key, r.id);
    }
    byId.set(r.id, { regcode: regionCode, divcode: r.division_code });
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

  const { data: existing } = await supabase.from('employees').select('id,empno,employee_number');
  const existingMap = new Map<string, string>();
  (existing ?? []).forEach((e: { id: string; empno: string | null; employee_number: string }) => {
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
      bank_name: str(rec, 'BANKER'),
      bank_account: str(rec, 'ACCOUNT'),
      basic_salary: num(rec, 'BASIC'),
      tax_status: str(rec, 'TAXCODE') || 'ME1',
      philhealth_number: str(rec, 'PHIC_ID'),
      pagibig_number: str(rec, 'HDMF_ID'),
      hire_date: dateStr(rec, 'HIREDATE'),
      updated_at: now,
    };

    const existingId = existingMap.get(empno);
    if (existingId) {
      toUpdate.push({ id: existingId, data: payload });
    } else {
      toInsert.push(payload);
    }
  }

  let imported = 0;
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('employees').upsert(batch, { onConflict: 'employee_number' });
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

  // When a category is specified, only process records whose EMPNO matches
  // an employee in that category's stacode range. We resolve this after
  // loading employees below.

  const existingEmps = await fetchAll(() => supabase.from('employees').select('id,empno,employee_number,stacode'));
  const empByNumber = new Map<string, string>();
  (existingEmps as { id: string; empno: string | null; employee_number: string | null; stacode: string | null }[]).forEach((e) => {
    if (e.empno) empByNumber.set(e.empno.trim(), e.id);
    if (e.employee_number) empByNumber.set(e.employee_number.trim(), e.id);
  });

  // Filter DEDFILE records by category: only process records whose EMPNO
  // matches an employee in the target stacode range.
  let dedfileRecords = records;
  if (category) {
    const catEmpnos = new Set<string>();
    for (const rec of records) {
      const empno = str(rec, 'EMPNO');
      if (!empno) continue;
      const empId = empByNumber.get(empno);
      if (!empId) continue;
      const emp = existingEmps.find((e) => e.id === empId);
      if (emp && inCategory(emp.stacode, category)) catEmpnos.add(empno);
    }
    dedfileRecords = records.filter((rec) => catEmpnos.has(str(rec, 'EMPNO')));
  }

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
      division_id: stubScope.divisionId,
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

  const rowMap = new Map<string, Record<string, unknown>>();
  for (const rec of dedfileRecords) {
    const r = normRow(rec);
    const empno = (r['empno'] ?? '').trim();
    const dedcode = (r['dedcode'] ?? '').trim().toUpperCase();
    if (!empno || !dedcode) { skipped++; continue; }
    const empId = empByNumber.get(empno);
    if (!empId) { skipped++; continue; }
    const dedamt = parseFloat(r['dedamt'] ?? '0') || 0;
    if (dedamt < 0) { skipped++; continue; }
    const status = decodeStatus(r['status'] ?? '');
    rowMap.set(`${empno}|${dedcode}|${r['policyno'] ?? ''}|${status}`, {
      empno, dedcode, dedid: r['dedid'] ?? '', policyno: r['policyno'] ?? '',
      effmm: parseInt(r['effmm'] ?? '1') || 1, effyy: parseInt(r['effyy'] ?? '25') || 25,
      termm: r['termm'] ? parseInt(r['termm']) || null : null, teryy: r['teryy'] ? parseInt(r['teryy']) || null : null,
      dedamt, principal: parseFloat(r['principal'] ?? '0') || 0, interest: parseFloat(r['interest'] ?? '0') || 0,
      charges: parseFloat(r['charges'] ?? '0') || 0, proceeds: parseFloat(r['proceeds'] ?? '0') || 0,
      agency: r['agency'] ?? '', status, type: decodeType(r['type'] ?? ''),
      stacode: r['stacode'] ?? '', regcode: r['regcode'] ?? '', divcode: r['divcode'] ?? '',
      fname: r['fname'] ?? '', mi: r['mi'] ?? '', lname: r['lname'] ?? '', appel: r['appel'] ?? '',
      netpay: parseFloat(r['netpay'] ?? '0') || 0, policydate: r['policydate'] || null,
      absno: parseFloat(r['absno'] ?? '0') || 0, underhr: parseFloat(r['underhr'] ?? '0') || 0,
      undermin: parseFloat(r['undermin'] ?? '0') || 0, bill: r['bill'] ?? '',
      abmm: r['abmm'] ?? '', abyy: r['abyy'] ?? '', oldcode: r['oldcode'] ?? '',
      hiredate: r['hiredate'] || null, birthdate: r['birthdate'] || null,
      gsis_bpn: r['gsis_bpn'] ?? '', qs: r['qs'] ?? '', upcode: r['upcode'] ?? '',
      paydate: r['paydate'] || null, editor: r['editor'] ?? '', dbf_id: r['dbf_id'] ?? '',
      created_by: 'restore', updated_by: 'restore',
    });
  }

  const allRows = [...rowMap.values()];
  const activeRows = allRows.filter((r) => r.status === 'Active');
  const nonActiveRows = allRows.filter((r) => r.status !== 'Active');
  const activeEmpnos = [...new Set(activeRows.map((r) => r.empno as string))];

  let existingActive: { id: string; empno: string; dedcode: string; policyno: string }[] = [];
  if (activeEmpnos.length > 0) {
    existingActive = await chunkedIn('empno', activeEmpnos, () =>
      supabase.from('payroll_deductions').select('id,empno,dedcode,policyno').eq('status', 'Active'),
    ) as { id: string; empno: string; dedcode: string; policyno: string }[];
  }
  const existingMap = new Map<string, string>();
  existingActive.forEach((d) => existingMap.set(`${d.empno}|${d.dedcode}|${d.policyno}`, d.id));

  const toUpdate: (Record<string, unknown> & { id: string })[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const affectedEmpnos = new Set<string>();
  for (const row of activeRows) {
    const key = `${row.empno}|${row.dedcode}|${row.policyno}`;
    const existingId = existingMap.get(key);
    if (existingId) toUpdate.push({ ...row, id: existingId });
    else toInsert.push(row);
    if (row.empno) affectedEmpnos.add(row.empno as string);
  }
  nonActiveRows.forEach((r) => { toInsert.push(r); if (r.empno) affectedEmpnos.add(r.empno as string); });

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await supabase.from('payroll_deductions').insert(batch);
    if (error) { errors.push(`Insert batch error: ${error.message}`); skipped += batch.length; }
    else imported += batch.length;
  }
  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    const { error } = await supabase.from('payroll_deductions').upsert(batch, { onConflict: 'id' });
    if (error) { errors.push(`Update batch error: ${error.message}`); skipped += batch.length; }
    else imported += batch.length;
  }

  // Resolve empnos to employee IDs for recompute
  const affectedEmpIdsList = [...affectedEmpnos].map((empno) => empByNumber.get(empno)).filter((id): id is string => !!id);
  await bulkRecomputeNetPay(affectedEmpIdsList);

  return { tableName: 'DEDFILE', imported, skipped, errors: errors.slice(0, 10) };
}
