import { supabase, fetchAll, chunkedIn, formatError } from '@/lib/supabase';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { syncMastfile, syncDedfile, loadDivisionDirectory, resolveDivisionId, type SyncResult, type SyncScope } from '@/lib/restoreSync';
import { inCategory, categoryOfStacode, type PayrollCategory } from '@/lib/categories';

export type { SyncScope };

export type { SyncResult };

// Re-export from the single source of truth
import {
  SYNC_ORDER as _SYNC_ORDER,
  TABLE_LABELS as _TABLE_LABELS,
  TABLE_DESCRIPTIONS as _TABLE_DESCRIPTIONS,
  TABLE_TO_DB as _TABLE_TO_DB,
  extractTableName as _extractTableName,
  VALID_DBF_VERSIONS,
  VALID_SIDECAR_EXTENSIONS,
} from '@/lib/dbfTemplate';
const extractTableName = _extractTableName;

export const SYNC_ORDER = _SYNC_ORDER;
export type SyncTableName = (typeof SYNC_ORDER)[number];
export const TABLE_LABELS: Record<SyncTableName, string> = _TABLE_LABELS as Record<SyncTableName, string>;
export const TABLE_DESCRIPTIONS: Record<SyncTableName, string> = _TABLE_DESCRIPTIONS as Record<SyncTableName, string>;
export const TABLE_TO_DB: Record<SyncTableName, string> = _TABLE_TO_DB as Record<SyncTableName, string>;
export { extractTableName } from '@/lib/dbfTemplate';

export interface FilePreview {
  fileName: string;
  tableName: SyncTableName;
  recordCount: number;
  fieldCount: number;
  fields: { name: string; type: string; length: number }[];
  sampleRows: Record<string, unknown>[];
  bytes: Uint8Array;
  fileSize: number;
  valid: boolean;
  error: string | null;
}

export interface PerFileResult {
  tableName: SyncTableName;
  fileName: string;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: string[];
  durationMs: number;
}

export interface SyncSessionResult {
  sessionId: string;
  files: PerFileResult[];
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalDuplicates: number;
  totalErrors: number;
  durationMs: number;
  rolledBack: boolean;
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

interface ExistingRow {
  id: string;
  [key: string]: unknown;
}

async function upsertTable(
  tableName: string,
  records: Record<string, unknown>[],
  conflictColumns: string[],
  keyBuilder: (r: Record<string, unknown>) => string,
  selectColumns: string,
): Promise<{ inserted: number; updated: number; duplicates: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  let skipped = 0;

  if (records.length === 0) return { inserted, updated, duplicates, skipped, errors };

  const keys = records.map(keyBuilder).filter(Boolean);
  if (keys.length === 0) {
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) { errors.push(`Insert error: ${error.message}`); skipped += batch.length; }
      else inserted += batch.length;
    }
    return { inserted, updated, duplicates, skipped, errors };
  }

  const existing: ExistingRow[] = await chunkedIn(conflictColumns[0], [...new Set(keys.map((k) => k.split('|')[0]))], () =>
    supabase.from(tableName).select(selectColumns),
  );
  const existingMap = new Map<string, string>();
  existing.forEach((row) => {
    const key = keyBuilder(row);
    if (key) existingMap.set(key, row.id as string);
  });

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  const seenKeys = new Set<string>();

  for (const rec of records) {
    const key = keyBuilder(rec);
    if (!key) { skipped++; continue; }
    if (seenKeys.has(key)) { duplicates++; continue; }
    seenKeys.add(key);
    const existingId = existingMap.get(key);
    if (existingId) {
      const { id: _id, ...rest } = rec;
      toUpdate.push({ id: existingId, data: rest });
    } else {
      toInsert.push(rec);
    }
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) { errors.push(`Insert batch: ${error.message}`); skipped += batch.length; }
    else inserted += batch.length;
  }

  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    const ids = batch.map((b) => b.id);
    const { error } = await supabase.from(tableName).upsert(
      batch.map((b) => ({ ...b.data, id: b.id })),
      { onConflict: 'id' },
    );
    if (error) { errors.push(`Update batch: ${error.message}`); skipped += batch.length; }
    else updated += batch.length;
    void ids;
  }

  return { inserted, updated, duplicates, skipped, errors: errors.slice(0, 10) };
}

function filterRecordsByCategory(records: DbfRecord[], category: PayrollCategory | null | undefined): DbfRecord[] {
  if (!category) return records;
  return records.filter((rec) => {
    const stacode = (rec['STACODE'] ?? rec['stacode']) as string | undefined;
    return inCategory(stacode, category);
  });
}

async function syncStntable(bytes: Uint8Array, category?: PayrollCategory | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'STNTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  const filtered = filterRecordsByCategory(records, category);

  const rows: Record<string, unknown>[] = filtered.map((rec) => ({
    stacode: str(rec, 'STACODE'),
    staname: str(rec, 'STANAME') || str(rec, 'STATION_NA') || str(rec, 'NAME'),
    divcode: str(rec, 'DIVCODE'),
    regcode: str(rec, 'REGCODE'),
    address: str(rec, 'ADDRESS') || str(rec, 'ADDR'),
    cluster: str(rec, 'DISTRICT') || str(rec, 'DIST'),
    category: str(rec, 'CATEGORY') || str(rec, 'CAT'),
    munic: str(rec, 'MUNIC') || str(rec, 'MUNICIPAL'),
    province: str(rec, 'PROVINCE') || str(rec, 'PROV'),
    zipcode: str(rec, 'ZIPCODE') || str(rec, 'ZIP'),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.stacode);

  const result = await upsertTable('dbf_stntable', rows, ['stacode'], (r) => r.stacode as string, 'id,stacode');

  // STNTABLE.DBF → School Directory: upsert into the schools table so uploaded
  // stations appear in the School Directory view immediately.
  const schoolErrors = await forwardStntableToSchools(filtered);
  result.errors.push(...schoolErrors);

  return { tableName: 'STNTABLE', fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward STNTABLE rows into the schools table (School Directory).
 * school_code is unique, so this is a plain upsert keyed on it.
 */
async function forwardStntableToSchools(records: DbfRecord[]): Promise<string[]> {
  const errors: string[] = [];
  // Stamp each school with the division its REGCODE/DIVCODE resolves to so the
  // School Directory is scoped per division — and so a later MASTFILE import
  // whose rows only carry STACODE can derive the division from the school.
  const divisionDirectory = await loadDivisionDirectory();
  const rows = records
    .map((rec) => {
      const stacode = str(rec, 'STACODE');
      if (!stacode) return null;
      const rawCat = (str(rec, 'CATEGORY') || str(rec, 'CAT') || '').toUpperCase();
      let schoolType: string = 'Elementary';
      if (rawCat.includes('SENIOR')) schoolType = 'Senior High School';
      else if (rawCat.includes('JUNIOR') || rawCat.includes('HIGH')) schoolType = 'Junior High School';
      else if (categoryOfStacode(stacode) === 'highschool') schoolType = 'Junior High School';
      const regcode = str(rec, 'REGCODE');
      const divcode = str(rec, 'DIVCODE');
      return {
        school_code: stacode,
        school_name: str(rec, 'STANAME') || str(rec, 'STATION_NA') || str(rec, 'NAME') || `School ${stacode}`,
        school_type: schoolType,
        cluster: str(rec, 'DISTRICT') || str(rec, 'DIST'),
        address: str(rec, 'ADDRESS') || str(rec, 'ADDR'),
        division_id: resolveDivisionId(divisionDirectory, regcode, divcode),
        status: 'Active',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) return errors;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('schools').upsert(batch, { onConflict: 'school_code' });
    if (error) errors.push(`schools upsert: ${error.message}`);
  }
  return errors.slice(0, 5);
}

async function syncDivtable(bytes: Uint8Array): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'DIVTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };

  const rows: Record<string, unknown>[] = records.map((rec) => ({
    divcode: str(rec, 'DIVCODE'),
    divname: str(rec, 'DIVNAME') || str(rec, 'DIVISION_N') || str(rec, 'NAME'),
    regcode: str(rec, 'REGCODE'),
    address: str(rec, 'ADDRESS') || str(rec, 'ADDR'),
    chief: str(rec, 'CHIEF') || str(rec, 'OFFICER') || str(rec, 'HEAD'),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.divcode);

  const result = await upsertTable('dbf_divtable', rows, ['divcode'], (r) => r.divcode as string, 'id,divcode');
  return { tableName: 'DIVTABLE', fileName: '', ...result, durationMs: Date.now() - start };
}

async function syncIncluded(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null, periodName?: string | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'INCLUDED', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  const filtered = filterRecordsByCategory(records, category);

  const resolvedPeriod = periodName || '';

  const rows: Record<string, unknown>[] = filtered.map((rec) => ({
    empno: str(rec, 'EMPNO'),
    stacode: str(rec, 'STACODE'),
    divcode: str(rec, 'DIVCODE'),
    regcode: str(rec, 'REGCODE'),
    payperiod: resolvedPeriod,
    paytype: str(rec, 'PAYTYPE') || str(rec, 'TYPE'),
    remarks: str(rec, 'REMARKS') || str(rec, 'REMARK'),
    type: str(rec, 'TYPE'),
    fname: str(rec, 'FNAME'),
    mi: str(rec, 'MI'),
    lname: str(rec, 'LNAME'),
    appel: str(rec, 'APPEL'),
    netpay: num(rec, 'NETPAY'),
    dedcode: str(rec, 'DEDCODE'),
    dedid: str(rec, 'DEDID'),
    dedamt: num(rec, 'DEDAMT'),
    effmm: str(rec, 'EFFMM'),
    effyy: str(rec, 'EFFYY'),
    termm: str(rec, 'TERMM'),
    teryy: str(rec, 'TERYY'),
    policyno: str(rec, 'POLICYNO'),
    policydate: str(rec, 'POLICYDATE') || null,
    agent: str(rec, 'AGENT'),
    absno: num(rec, 'ABSNO'),
    underhr: num(rec, 'UNDERHR'),
    undermin: num(rec, 'UNDERMIN'),
    status: str(rec, 'STATUS'),
    update_date: str(rec, 'UPDATE') || null,
    paydate: str(rec, 'PAYDATE') || null,
    editor: str(rec, 'EDITOR'),
    tm: str(rec, 'TM'),
    ty: str(rec, 'TY'),
    agency: str(rec, 'AGENCY'),
    principal: num(rec, 'PRINCIPAL'),
    interest: num(rec, 'INTEREST'),
    charges: num(rec, 'CHARGES'),
    proceeds: num(rec, 'PROCEEDS'),
    qs: str(rec, 'QS'),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.empno);

  const result = await upsertTable('dbf_included', rows, ['empno'], (r) => `${r.empno}`, 'id,empno');

  // INCLUDED.DBF → deductions for deducted: for each included employee/period,
  // copy their ACTIVE deductions into the per-period deductions table.
  const forwardErrors = await forwardIncludedToDeductions(filtered, periodName);
  result.errors.push(...forwardErrors);

  return { tableName: 'INCLUDED', fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward INCLUDED.DBF rows into the per-period `deductions` table (deducted).
 * For each included (empno, payperiod), the employee's ACTIVE payroll_deductions
 * become deductions rows for that period.
 */
async function forwardIncludedToDeductions(records: DbfRecord[], periodName?: string | null): Promise<string[]> {
  const errors: string[] = [];
  const resolvedPeriod = periodName || '';

  // Use INCLUDED.DBF's own deduction-level data (dedcode, dedamt per row)
  const rows = records
    .map((rec) => ({
      empno: str(rec, 'EMPNO'),
      stacode: str(rec, 'STACODE'),
      divcode: str(rec, 'DIVCODE'),
      regcode: str(rec, 'REGCODE'),
      payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD') || resolvedPeriod,
      dedcode: str(rec, 'DEDCODE') || str(rec, 'CODE'),
      dedamt: num(rec, 'DEDAMT') || num(rec, 'AMOUNT') || 0,
      dedid: str(rec, 'DEDID'),
      fname: str(rec, 'FNAME'),
      mi: str(rec, 'MI'),
      lname: str(rec, 'LNAME'),
      appel: str(rec, 'APPEL'),
      netpay: num(rec, 'NETPAY'),
      effyy: Math.floor(num(rec, 'EFFYY') || 0),
      effmm: Math.floor(num(rec, 'EFFMM') || 0),
      termm: str(rec, 'TERMM'),
      teryy: str(rec, 'TERYY'),
      policyno: str(rec, 'POLICYNO'),
      policydate: str(rec, 'POLICYDATE') || null,
      agency: str(rec, 'AGENCY'),
      principal: num(rec, 'PRINCIPAL'),
      interest: num(rec, 'INTEREST'),
      charges: num(rec, 'CHARGES'),
      proceeds: num(rec, 'PROCEEDS'),
    }))
    .filter((r) => r.empno && r.dedcode);
  if (rows.length === 0) return errors;

  const empIdMap = await resolveEmpIds(rows.map((r) => r.empno));
  const periodIdMap = await resolvePeriodIds(rows, errors);
  const { data: dedCodes } = await supabase.from('deduction_codes').select('dedcode,dedname,type');
  const codeName = new Map<string, { dedname: string; type: string }>(
    (dedCodes ?? []).map((c) => [c.dedcode, { dedname: c.dedname, type: c.type }]),
  );

  // Delete this period's previously imported INCLUDED rows (re-import refresh)
  const periodIds = [...new Set(rows.map((r) => periodIdMap.get(r.payperiod)).filter((x): x is string => !!x))];
  for (const pid of periodIds) {
    const { error } = await supabase.from('deductions').delete().eq('pay_period_id', pid).eq('source', 'INCLUDED');
    if (error) errors.push(`deductions clear (${pid}): ${error.message}`);
  }

  // Use INCLUDED.DBF deduction data directly (dedcode + dedamt from the file)
  const toInsert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const empId = empIdMap.get(r.empno);
    const periodId = periodIdMap.get(r.payperiod);
    if (!empId || !periodId) continue;
    const info = codeName.get(r.dedcode);
    toInsert.push({
      employee_id: empId,
      pay_period_id: periodId,
      deduction_code: r.dedcode,
      deduction_name: info?.dedname || r.dedcode,
      category: info?.type || 'Other',
      amount: r.dedamt,
      source: 'INCLUDED',
      reference: r.payperiod,
    });
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await supabase.from('deductions').insert(batch);
    if (error) errors.push(`deductions insert: ${error.message}`);
  }
  return errors.slice(0, 10);
}

/**
 * Resolve employee ids by empno (or employee_number) in chunks.
 */
async function resolveEmpIds(empnos: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(empnos.filter(Boolean))];
  if (unique.length === 0) return map;
  const rows = await chunkedIn('empno', unique, () =>
    supabase.from('employees').select('id,empno,employee_number'),
  );
  (rows as { id: string; empno: string | null; employee_number: string | null }[]).forEach((e) => {
    if (e.empno) map.set(e.empno.trim(), e.id);
    if (e.employee_number) map.set(e.employee_number.trim(), e.id);
  });
  return map;
}

/**
 * Get-or-create pay_periods for the given rows (keyed by period_name within the
 * row's own REGCODE/DIVCODE so divisions never share a period). Returns
 * payperiod-string → period id.
 */
async function resolvePeriodIds(rows: { payperiod: string; regcode?: string; divcode?: string; stacode?: string }[], errors: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // Canonicalize each period's REGCODE/DIVCODE against the divisions directory
  // so the Payroll page (which scopes by the division's exact codes via
  // get_current_user_division_codes()) finds the period — legacy DBF exports
  // zero-pad codes ('01'/'001' vs the directory's '1'/'1').
  const divisionDirectory = await loadDivisionDirectory();
  const byName = new Map<string, { regcode: string | null; divcode: string | null }>();
  for (const r of rows) {
    if (!r.payperiod) continue;
    if (!byName.has(r.payperiod)) {
      let regcode = r.regcode ?? null;
      let divcode = r.divcode ?? null;
      if (regcode && divcode) {
        const id = resolveDivisionId(divisionDirectory, regcode, divcode);
        const codes = id ? divisionDirectory.byId.get(id) : undefined;
        if (id && codes) { regcode = codes.regcode; divcode = codes.divcode; }
      }
      byName.set(r.payperiod, { regcode, divcode });
    }
  }
  for (const [name, codes] of byName) {
    const { data: existing } = await supabase
      .from('pay_periods')
      .select('id')
      .eq('period_name', name)
      .eq('regcode', codes.regcode)
      .eq('divcode', codes.divcode)
      .maybeSingle();
    if (existing) { map.set(name, existing.id); continue; }
    const { data: created, error } = await supabase
      .from('pay_periods')
      .insert({
        period_name: name,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        frequency: 'Semi-Monthly',
        status: 'open',
        regcode: codes.regcode,
        divcode: codes.divcode,
      })
      .select('id')
      .single();
    if (error) { errors.push(`Failed to create pay period "${name}": ${error.message}`); continue; }
    map.set(name, created.id);
  }
  return map;
}

async function syncExcluded(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null, periodName?: string | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'EXCLUDED', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  const filtered = filterRecordsByCategory(records, category);

  const resolvedPeriod = periodName || '';

  // Group by empno to collect deduction-level data
  const byEmp = new Map<string, { stacode: string; divcode: string; regcode: string; payperiod: string; reason: string; deductions: { dedcode: string; dedamt: number; effyy: number; effmm: number }[]; type: string; fname: string; mi: string; lname: string; appel: string; netpay: number; dedid: string; termm: string; teryy: string; policyno: string; policydate: string | null; agent: string; absno: number; underhr: number; undermin: number; status: string; update_date: string | null; paydate: string | null; editor: string; tm: string; ty: string; agency: string; principal: number; interest: number; charges: number; proceeds: number; qs: string }>();
  for (const rec of filtered) {
    const empno = str(rec, 'EMPNO');
    if (!empno) continue;
    const dedcode = str(rec, 'DEDCODE') || str(rec, 'CODE');
    const dedamt = num(rec, 'DEDAMT') || num(rec, 'AMOUNT') || 0;
    const effyy = Math.floor(num(rec, 'EFFYY') || 0);
    const effmm = Math.floor(num(rec, 'EFFMM') || 0);
    if (!byEmp.has(empno)) {
      byEmp.set(empno, {
        stacode: str(rec, 'STACODE'),
        divcode: str(rec, 'DIVCODE'),
        regcode: str(rec, 'REGCODE'),
        payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD') || resolvedPeriod,
        reason: str(rec, 'REASON') || str(rec, 'REMARKS') || str(rec, 'REMARK') || 'EXCLUDED FROM PAYROLL',
        deductions: [],
        type: str(rec, 'TYPE'),
        fname: str(rec, 'FNAME'),
        mi: str(rec, 'MI'),
        lname: str(rec, 'LNAME'),
        appel: str(rec, 'APPEL'),
        netpay: num(rec, 'NETPAY'),
        dedid: str(rec, 'DEDID'),
        termm: str(rec, 'TERMM'),
        teryy: str(rec, 'TERYY'),
        policyno: str(rec, 'POLICYNO'),
        policydate: str(rec, 'POLICYDATE') || null,
        agent: str(rec, 'AGENT'),
        absno: num(rec, 'ABSNO'),
        underhr: num(rec, 'UNDERHR'),
        undermin: num(rec, 'UNDERMIN'),
        status: str(rec, 'STATUS'),
        update_date: str(rec, 'UPDATE') || null,
        paydate: str(rec, 'PAYDATE') || null,
        editor: str(rec, 'EDITOR'),
        tm: str(rec, 'TM'),
        ty: str(rec, 'TY'),
        agency: str(rec, 'AGENCY'),
        principal: num(rec, 'PRINCIPAL'),
        interest: num(rec, 'INTEREST'),
        charges: num(rec, 'CHARGES'),
        proceeds: num(rec, 'PROCEEDS'),
        qs: str(rec, 'QS'),
      });
    }
    if (dedcode && dedamt > 0) {
      byEmp.get(empno)!.deductions.push({ dedcode, dedamt, effyy, effmm });
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const [empno, data] of byEmp) {
    // Store deduction-level data as JSON in reason field
    const reasonJson = data.deductions.length > 0
      ? JSON.stringify({ base: data.reason, deds: data.deductions })
      : data.reason;
    rows.push({
      empno,
      stacode: data.stacode,
      divcode: data.divcode,
      regcode: data.regcode,
      payperiod: data.payperiod,
      reason: reasonJson,
      remarks: '',
      type: data.type || '',
      fname: data.fname || '',
      mi: data.mi || '',
      lname: data.lname || '',
      appel: data.appel || '',
      netpay: data.netpay || 0,
      dedid: data.dedid || '',
      termm: data.termm || '',
      teryy: data.teryy || '',
      policyno: data.policyno || '',
      policydate: data.policydate || null,
      agent: data.agent || '',
      absno: data.absno || 0,
      underhr: data.underhr || 0,
      undermin: data.undermin || 0,
      status: data.status || '',
      update_date: data.update_date || null,
      paydate: data.paydate || null,
      editor: data.editor || '',
      tm: data.tm || '',
      ty: data.ty || '',
      agency: data.agency || '',
      principal: data.principal || 0,
      interest: data.interest || 0,
      charges: data.charges || 0,
      proceeds: data.proceeds || 0,
      qs: data.qs || '',
      updated_at: new Date().toISOString(),
    });
  }

  const result = await upsertTable('dbf_excluded', rows, ['empno'], (r) => `${r.empno}`, 'id,empno');

  // EXCLUDED.DBF → those deductions are classified as UNDEDUCTED in the payroll.
  // For each excluded employee/period, their ACTIVE deductions become
  // undeducted_obligations (they appear LAST in the deduction line, and are
  // re-deducted first in later periods — first in, first served).
  const forwardErrors = await forwardExcludedToUndeducted(filtered, periodName);
  result.errors.push(...forwardErrors);

  return { tableName: 'EXCLUDED', fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward EXCLUDED.DBF rows into undeducted_obligations. Each excluded
 * employee's ACTIVE deductions are recorded as undeducted for the period,
 * with the exclusion reason carried over.
 */
async function forwardExcludedToUndeducted(records: DbfRecord[], periodName?: string | null): Promise<string[]> {
  const errors: string[] = [];
  const resolvedPeriod = periodName || '';

  // Use EXCLUDED.DBF's own deduction-level data directly (dedcode, dedamt per row)
  const rows = records
    .map((rec) => ({
      empno: str(rec, 'EMPNO'),
      stacode: str(rec, 'STACODE'),
      divcode: str(rec, 'DIVCODE'),
      regcode: str(rec, 'REGCODE'),
      payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD') || resolvedPeriod,
      reason: str(rec, 'REASON') || str(rec, 'REMARKS') || str(rec, 'REMARK') || 'EXCLUDED FROM PAYROLL',
      dedcode: str(rec, 'DEDCODE') || str(rec, 'CODE'),
      dedamt: num(rec, 'DEDAMT') || num(rec, 'AMOUNT') || 0,
      dedid: str(rec, 'DEDID'),
      netpay: num(rec, 'NETPAY'),
      effyy: Math.floor(num(rec, 'EFFYY') || 0),
      effmm: Math.floor(num(rec, 'EFFMM') || 0),
      termm: str(rec, 'TERMM'),
      teryy: str(rec, 'TERYY'),
      policyno: str(rec, 'POLICYNO'),
      agency: str(rec, 'AGENCY'),
      principal: num(rec, 'PRINCIPAL'),
      interest: num(rec, 'INTEREST'),
      charges: num(rec, 'CHARGES'),
      proceeds: num(rec, 'PROCEEDS'),
    }))
    .filter((r) => r.empno && r.dedcode);
  if (rows.length === 0) return errors;

  const empIdMap = await resolveEmpIds(rows.map((r) => r.empno));
  const periodIdMap = await resolvePeriodIds(rows, errors);
  const { data: dedCodes } = await supabase.from('deduction_codes').select('dedcode,dedname');
  const codeName = new Map<string, string>((dedCodes ?? []).map((c) => [c.dedcode, c.dedname]));

  // Clear previously imported EXCLUDED obligations for these periods (re-import refresh)
  const periodIds = [...new Set(rows.map((r) => periodIdMap.get(r.payperiod)).filter((x): x is string => !!x))];
  for (const pid of periodIds) {
    const { error } = await supabase.from('undeducted_obligations').delete().eq('pay_period_id', pid).eq('reason', 'EXCLUDED FROM PAYROLL');
    if (error) errors.push(`undeducted clear (${pid}): ${error.message}`);
  }

  // Use EXCLUDED.DBF deduction data directly (dedcode + dedamt from the file)
  const toInsert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const empId = empIdMap.get(r.empno);
    const periodId = periodIdMap.get(r.payperiod);
    if (!empId || !periodId) continue;
    if (!r.dedcode || r.dedamt <= 0) continue;
    toInsert.push({
      employee_id: empId,
      pay_period_id: periodId,
      deduction_code: r.dedcode,
      deduction_description: codeName.get(r.dedcode) || r.dedcode,
      undeducted_amount: r.dedamt,
      scheduled_amount: r.dedamt,
      station_code: r.stacode || '',
      reason: r.reason || 'EXCLUDED FROM PAYROLL',
    });
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await supabase.from('undeducted_obligations').insert(batch);
    if (error) errors.push(`undeducted insert: ${error.message}`);
  }
  return errors.slice(0, 10);
}

async function syncPayrolls(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null, periodName?: string | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'PAYROLLS', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  const filtered = filterRecordsByCategory(records, category);

  // FoxPro PAYROLLS.DBF may not have PAYPERIOD/PAYDATE columns.
  // Fall back to ISSUE (paydate field), PAYCODE (paytype), and the
  // user-supplied periodName so records always land in a period.
  const resolvedPeriod = periodName || '';

  const rows: Record<string, unknown>[] = filtered.map((rec) => ({
    empno: str(rec, 'EMPNO'),
    stacode: str(rec, 'STACODE'),
    divcode: str(rec, 'DIVCODE'),
    regcode: str(rec, 'REGCODE'),
    payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD') || resolvedPeriod,
    paytype: str(rec, 'PAYTYPE') || str(rec, 'TYPE') || String(num(rec, 'PAYCODE') || ''),
    basic: num(rec, 'BASIC'),
    trans: num(rec, 'TRANS'),
    pera: num(rec, 'PERA'),
    aca: num(rec, 'ACA'),
    rata: num(rec, 'RATA'),
    ontop: num(rec, 'ONTOP'),
    clothing: num(rec, 'CLOTHING'),
    cashallow: num(rec, 'CASHALLOW'),
    gross: num(rec, 'GROSS') || num(rec, 'TAKEHOME'),
    dedlnr: num(rec, 'DEDLNR'),
    dedmed: num(rec, 'DEDMED'),
    dedtax: num(rec, 'DEDTAX'),
    dedpag: num(rec, 'DEDPAG'),
    totded: num(rec, 'TOTDED') || num(rec, 'TOT_DED') || num(rec, 'OTHERDED'),
    netpay: num(rec, 'NETPAY') || num(rec, 'TAKEHOME'),
    paydate: dateStr(rec, 'PAYDATE') || dateStr(rec, 'ISSUE'),
    remarks: str(rec, 'REMARKS') || str(rec, 'REMARK'),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.empno);

  const result = await upsertTable('dbf_payrolls', rows, ['empno'], (r) => `${r.empno}|${r.payperiod}`, 'id,empno,payperiod');

  // Forward into pay_periods + payroll_entries so the Payroll and Payrolls DBF
  // views see the imported data immediately.
  const forwardErrors = await forwardPayrollsToPayrollEntries(rows);
  result.errors.push(...forwardErrors);

  return { tableName: 'PAYROLLS', fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward PAYROLLS.DBF rows into the pay_periods + payroll_entries tables that
 * the Payroll and Payrolls DBF Manager views read from.
 *
 * - Creates/updates one pay_periods row per unique payperiod string.
 * - Creates/updates one payroll_entries row per employee per period, linking
 *   to the employee via empno → employees.id and to the period via period_name.
 */
async function forwardPayrollsToPayrollEntries(rows: Record<string, unknown>[]): Promise<string[]> {
  const errors: string[] = [];
  if (rows.length === 0) return errors;

  // Division directory for canonicalizing period codes (see resolvePeriodIds).
  const divisionDirectory = await loadDivisionDirectory();

  // Group rows by payperiod
  const byPeriod = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const period = (row.payperiod as string) || '';
    if (!period) continue;
    if (!byPeriod.has(period)) byPeriod.set(period, []);
    byPeriod.get(period)!.push(row);
  }

  // Collect all empnos to resolve employee IDs
  const allEmpnos = [...new Set(rows.map((r) => r.empno as string).filter(Boolean))];
  const empRows = await chunkedIn('empno', allEmpnos, () =>
    supabase.from('employees').select('id,empno,employee_number'),
  );
  const empIdMap = new Map<string, string>();
  (empRows as { id: string; empno: string | null; employee_number: string | null }[]).forEach((e) => {
    const empnoKey = (e.empno || '').trim();
    const empNumKey = (e.employee_number || '').trim();
    if (empnoKey) empIdMap.set(empnoKey, e.id);
    if (empNumKey) empIdMap.set(empNumKey, e.id);
  });

  // Fetch or create pay_periods for each unique period
  const periodIds = new Map<string, string>();
  for (const periodName of byPeriod.keys()) {
    const firstRow = byPeriod.get(periodName)![0];
    const payDate = firstRow.paydate as string | null;
    // Carry the division codes from the DBF row so each division's import
    // creates/uses its OWN period instead of colliding on a shared month.
    // Codes are canonicalized so the division-scoped Payroll page finds them.
    let regcode = ((firstRow.regcode as string | undefined) ?? (firstRow.REGCODE as string | undefined) ?? null);
    let divcode = ((firstRow.divcode as string | undefined) ?? (firstRow.DIVCODE as string | undefined) ?? null);
    if (regcode && divcode) {
      const id = resolveDivisionId(divisionDirectory, regcode, divcode);
      const codes = id ? divisionDirectory.byId.get(id) : undefined;
      if (id && codes) { regcode = codes.regcode; divcode = codes.divcode; }
    }
    const { data: existing } = await supabase
      .from('pay_periods')
      .select('id')
      .eq('period_name', periodName)
      .eq('regcode', regcode)
      .eq('divcode', divcode)
      .maybeSingle();

    if (existing) {
      periodIds.set(periodName, existing.id);
    } else {
      const { data: newPeriod, error } = await supabase
        .from('pay_periods')
        .insert({
          period_name: periodName,
          start_date: payDate ?? new Date().toISOString().slice(0, 10),
          end_date: payDate ?? new Date().toISOString().slice(0, 10),
          pay_date: payDate,
          frequency: 'Semi-Monthly',
          status: 'open',
          regcode,
          divcode,
        })
        .select('id')
        .single();
      if (error) { errors.push(`Failed to create pay period "${periodName}": ${error.message}`); continue; }
      periodIds.set(periodName, newPeriod.id);
    }
  }

  // Build payroll_entries for each period
  for (const [periodName, periodRows] of byPeriod) {
    const periodId = periodIds.get(periodName);
    if (!periodId) continue;

    // Fetch existing entries for this period to decide insert vs update
    const { data: existingEntries } = await supabase
      .from('payroll_entries')
      .select('id,employee_id')
      .eq('pay_period_id', periodId);
    const entryByEmp = new Map<string, string>();
    (existingEntries ?? []).forEach((e: { id: string; employee_id: string }) => {
      entryByEmp.set(e.employee_id, e.id);
    });

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
    const seenEmps = new Set<string>();

    for (const row of periodRows) {
      const empno = row.empno as string;
      const empId = empIdMap.get(empno);
      if (!empId) continue;
      if (seenEmps.has(empId)) continue;
      seenEmps.add(empId);

      const gross = numVal(row.gross);
      const dedlnr = numVal(row.dedlnr);
      const dedmed = numVal(row.dedmed);
      const dedpag = numVal(row.dedpag);
      const dedtax = numVal(row.dedtax);
      const totded = numVal(row.totded) || (dedlnr + dedmed + dedpag + dedtax);
      const netpay = numVal(row.netpay);

      const entryData: Record<string, unknown> = {
        employee_id: empId,
        pay_period_id: periodId,
        gross_pay: gross,
        total_deductions: totded,
        net_pay: netpay,
        status: 'Posted',
        processed_at: new Date().toISOString(),
        dedlnr, dedmed, dedpag, dedtax,
        mandatory_deductions: totded,
      };

      const existingId = entryByEmp.get(empId);
      if (existingId) {
        toUpdate.push({ id: existingId, data: entryData });
      } else {
        toInsert.push(entryData);
      }
    }

    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('payroll_entries').insert(batch);
      if (error) errors.push(`payroll_entries insert (${periodName}): ${error.message}`);
    }
    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      const { error } = await supabase.from('payroll_entries').upsert(
        batch.map((b) => ({ ...b.data, id: b.id })),
        { onConflict: 'id' },
      );
      if (error) errors.push(`payroll_entries update (${periodName}): ${error.message}`);
    }
  }

  return errors.slice(0, 10);
}

function numVal(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

async function syncPyent(tableName: SyncTableName, bytes: Uint8Array, category?: PayrollCategory | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName, fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  // PYENT records don't carry STACODE — they reference employees by EMPNO.
  // Category filtering already happened at the MASTFILE level, so we pass
  // all PYENT records through. The forwardPyentToPayent function resolves
  // employee IDs from the employees table which is already category-scoped.
  const filtered = records;

  const dbTable = tableName === 'PYENT' ? 'dbf_pyent' : tableName === 'PYENT1' ? 'dbf_pyent1' : 'dbf_pyent2';
  const rows: Record<string, unknown>[] = filtered.map((rec) => ({
    empno: str(rec, 'EMPNO'),
    stacode: str(rec, 'STACODE'),
    payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD'),
    paytype: str(rec, 'PAYTYPE') || str(rec, 'TYPE'),
    itemcode: str(rec, 'ITEMCODE') || str(rec, 'ITEM_CODE') || str(rec, 'CODE'),
    amount: num(rec, 'AMOUNT') || num(rec, 'AMT'),
    remarks: str(rec, 'REMARKS') || str(rec, 'REMARK'),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.empno && r.itemcode);

  const result = await upsertTable(dbTable, rows, ['empno'], (r) => `${r.empno}|${r.payperiod}|${r.itemcode}`, 'id,empno,payperiod,itemcode');

  // PYENT/PYENT1/PYENT2 → Payent: the bank-crediting hashfile used by the
  // Regular Payroll. PYENT.DBF feeds the full-month payent, PYENT1.DBF the
  // first half, PYENT2.DBF the second half — one row per employee/period/half
  // with the net amount to credit to the employee's bank account.
  const forwardErrors = await forwardPyentToPayent(filtered, tableName);
  result.errors.push(...forwardErrors);

  return { tableName, fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward PYENT/PYENT1/PYENT2 rows into the `payent` bank-crediting table.
 *
 * - half mapping: PYENT → 'full' (1 month), PYENT1 → 'first', PYENT2 → 'second'.
 * - Rows are aggregated per employee per period: amount = total to credit.
 * - employee_id / pay_period_id are resolved when the empno and payperiod match
 *   an existing employee masterfile / pay period; the raw keys are always kept.
 */
async function forwardPyentToPayent(records: DbfRecord[], tableName: SyncTableName): Promise<string[]> {
  const errors: string[] = [];
  const half = tableName === 'PYENT1' ? 'first' : tableName === 'PYENT2' ? 'second' : 'full';

  const rows = records
    .map((rec) => ({
      empno: str(rec, 'EMPNO'),
      stacode: str(rec, 'STACODE'),
      divcode: str(rec, 'DIVCODE'),
      regcode: str(rec, 'REGCODE'),
      payperiod: str(rec, 'PAYPERIOD') || str(rec, 'PERIOD'),
      paytype: str(rec, 'PAYTYPE') || str(rec, 'TYPE'),
      itemcode: str(rec, 'ITEMCODE') || str(rec, 'ITEM_CODE') || str(rec, 'CODE'),
      acctNo: str(rec, 'ACCT_NO') || str(rec, 'ACCOUNT') || str(rec, 'ACCT') || str(rec, 'BANKAC'),
      acctName: str(rec, 'ACCT_NAME') || str(rec, 'ACCTNAME') || str(rec, 'NAME'),
      branchCd: str(rec, 'BRANCH_CD') || str(rec, 'BRANCH'),
      batchNo: str(rec, 'BATCH_NO') || str(rec, 'BATCH'),
      amount: num(rec, 'AMOUNT') || num(rec, 'AMT') || num(rec, 'NETPAY') || num(rec, 'NET'),
      remarks: str(rec, 'REMARKS') || str(rec, 'REMARK'),
    }))
    .filter((r) => r.empno);
  if (rows.length === 0) return errors;

  const empIdMap = await resolveEmpIds(rows.map((r) => r.empno));
  const periodIdMap = await resolvePeriodIds(rows, errors);

  // Aggregate per employee + payperiod: one payent row per employee/period/half.
  const agg = new Map<string, {
    empno: string; employee_id: string | null; pay_period_id: string | null;
    payperiod: string; stacode: string; divcode: string; regcode: string;
    acctNo: string; acctName: string; branchCd: string; batchNo: string;
    itemcode: string; paytype: string; remarks: string; amount: number;
  }>();
  for (const r of rows) {
    const key = `${r.empno}|${r.payperiod}`;
    let cur = agg.get(key);
    if (!cur) {
      cur = {
        empno: r.empno,
        employee_id: empIdMap.get(r.empno) ?? null,
        pay_period_id: periodIdMap.get(r.payperiod) ?? null,
        payperiod: r.payperiod,
        stacode: r.stacode, divcode: r.divcode, regcode: r.regcode,
        acctNo: r.acctNo, acctName: r.acctName, branchCd: r.branchCd, batchNo: r.batchNo,
        itemcode: r.itemcode, paytype: r.paytype, remarks: r.remarks, amount: 0,
      };
      agg.set(key, cur);
    }
    cur.amount += r.amount;
    if (!cur.acctNo && r.acctNo) cur.acctNo = r.acctNo;
    if (!cur.acctName && r.acctName) cur.acctName = r.acctName;
    if (!cur.stacode && r.stacode) cur.stacode = r.stacode;
    if (!cur.divcode && r.divcode) cur.divcode = r.divcode;
    if (!cur.regcode && r.regcode) cur.regcode = r.regcode;
    if (!cur.itemcode && r.itemcode) cur.itemcode = r.itemcode;
    if (!cur.paytype && r.paytype) cur.paytype = r.paytype;
  }

  // Re-import refresh: clear this period/half's previously imported payent rows
  // before re-inserting, so re-uploading a corrected file replaces old amounts.
  const periodIds = [...new Set(rows.map((r) => periodIdMap.get(r.payperiod)).filter((x): x is string => !!x))];
  if (periodIds.length > 0) {
    const { error } = await supabase.from('payent').delete().in('pay_period_id', periodIds).eq('half', half);
    if (error) errors.push(`payent clear (${half}): ${error.message}`);
  }

  const toInsert: Record<string, unknown>[] = Array.from(agg.values()).map((a) => ({
    employee_id: a.employee_id,
    empno: a.empno,
    pay_period_id: a.pay_period_id,
    payperiod: a.payperiod,
    half,
    stacode: a.stacode,
    divcode: a.divcode,
    regcode: a.regcode,
    acct_no: a.acctNo,
    acct_name: a.acctName,
    amount: Math.round(a.amount * 100) / 100,
    branch_cd: a.branchCd,
    batch_no: a.batchNo,
    itemcode: a.itemcode,
    paytype: a.paytype,
    remarks: a.remarks,
    source: tableName,
    updated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await supabase.from('payent').upsert(batch, { onConflict: 'empno,payperiod,half' });
    if (error) errors.push(`payent upsert: ${error.message}`);
  }
  return errors.slice(0, 10);
}

const SYNC_FUNCTIONS: Record<SyncTableName, (bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null, periodName?: string | null) => Promise<PerFileResult | SyncResult>> = {
  STNTABLE: syncStntable,
  DIVTABLE: syncDivtable,
  MASTFILE: syncMastfileWrapper,
  INCLUDED: syncIncluded,
  EXCLUDED: syncExcluded,
  DEDFILE: syncDedfileWrapper,
  PAYROLLS: syncPayrolls,
  PYENT: (b, cat) => syncPyent('PYENT', b, cat),
  PYENT1: (b, cat) => syncPyent('PYENT1', b, cat),
  PYENT2: (b, cat) => syncPyent('PYENT2', b, cat),
};

async function syncMastfileWrapper(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null): Promise<PerFileResult> {
  const start = Date.now();
  const r = await syncMastfile(bytes, category, scope);
  return { tableName: 'MASTFILE', fileName: '', inserted: r.imported, updated: 0, skipped: r.skipped, duplicates: 0, errors: r.errors, durationMs: Date.now() - start };
}

async function syncDedfileWrapper(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null): Promise<PerFileResult> {
  const start = Date.now();
  const r = await syncDedfile(bytes, category, scope);
  return { tableName: 'DEDFILE', fileName: '', inserted: r.imported, updated: 0, skipped: r.skipped, duplicates: 0, errors: r.errors, durationMs: Date.now() - start };
}

export function previewDbf(bytes: Uint8Array, fileName: string): FilePreview {
  const tableName = extractTableName(fileName);
  if (!tableName) {
    return { fileName, tableName: 'MASTFILE', recordCount: 0, fieldCount: 0, fields: [], sampleRows: [], bytes, fileSize: bytes.byteLength, valid: false, error: `Could not match "${fileName}" to any of the 10 supported tables.` };
  }
  try {
    const { fields, records } = decodeDbf(bytes);
    const sampleRows = records.slice(0, 5);
    return {
      fileName,
      tableName,
      recordCount: records.length,
      fieldCount: fields.length,
      fields: fields.map((f) => ({ name: f.name, type: f.type, length: f.length })),
      sampleRows,
      bytes,
      fileSize: bytes.byteLength,
      valid: true,
      error: null,
    };
  } catch (err) {
    return { fileName, tableName, recordCount: 0, fieldCount: 0, fields: [], sampleRows: [], bytes, fileSize: bytes.byteLength, valid: false, error: formatError(err) };
  }
}

export interface SyncSessionRecord {
  id: string;
  session_label: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  files_uploaded: string[];
  total_inserted: number;
  total_updated: number;
  total_skipped: number;
  total_errors: number;
  error_log: string[];
  per_file: Record<string, PerFileResult>;
  performed_by: string | null;
  is_rolled_back: boolean;
  category: PayrollCategory | null;
}

export async function executeSync(
  previews: FilePreview[],
  userEmail: string,
  onProgress?: (current: number, total: number, tableName: SyncTableName, message: string) => void,
  category?: PayrollCategory | null,
  scope?: SyncScope | null,
  periodName?: string | null,
): Promise<SyncSessionResult> {
  const sessionStart = Date.now();

  const { data: sessionRow, error: sessionErr } = await supabase
    .from('dbf_sync_sessions')
    .insert({
      session_label: `Import ${new Date().toLocaleString('en-PH')}${category ? ` (${category === 'elementary' ? 'Elementary' : 'High School'})` : ''}`,
      files_uploaded: previews.map((p) => p.fileName),
      status: 'running',
      performed_by: userEmail,
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      category: category ?? null,
    })
    .select('id')
    .single();
  if (sessionErr) throw new Error(`Failed to create sync session: ${sessionErr.message}`);

  const sessionId = sessionRow.id;
  const sorted = [...previews].sort((a, b) => SYNC_ORDER.indexOf(a.tableName) - SYNC_ORDER.indexOf(b.tableName));
  const results: PerFileResult[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    onProgress?.(i + 1, sorted.length, p.tableName, `Synchronizing ${TABLE_LABELS[p.tableName]}...`);
    try {
      const fn = SYNC_FUNCTIONS[p.tableName];
      const result = await fn(p.bytes, category, scope, periodName);
      const perFile: PerFileResult = { ...(result as unknown as PerFileResult), tableName: p.tableName, fileName: p.fileName };
      results.push(perFile);
    } catch (err) {
      results.push({
        tableName: p.tableName, fileName: p.fileName, inserted: 0, updated: 0, skipped: 0, duplicates: 0,
        errors: [formatError(err)], durationMs: 0,
      });
    }
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalDuplicates = results.reduce((s, r) => s + r.duplicates, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const hasErrors = results.some((r) => r.errors.length > 0);

  const perFileMap: Record<string, PerFileResult> = {};
  results.forEach((r) => { perFileMap[r.tableName] = r; });

  await supabase.from('dbf_sync_sessions').update({
    completed_at: new Date().toISOString(),
    status: hasErrors ? 'failed' : 'completed',
    total_inserted: totalInserted,
    total_updated: totalUpdated,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    error_log: results.flatMap((r) => r.errors.map((e) => `[${r.tableName}] ${e}`)),
    per_file: perFileMap,
  }).eq('id', sessionId);

  return {
    sessionId,
    files: results,
    totalInserted, totalUpdated, totalSkipped, totalDuplicates, totalErrors,
    durationMs: Date.now() - sessionStart,
    rolledBack: false,
  };
}

export async function rollbackSession(sessionId: string): Promise<boolean> {
  const { data: session, error } = await supabase
    .from('dbf_sync_sessions')
    .select('id,per_file,is_rolled_back,status')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !session) return false;
  if (session.is_rolled_back) return false;

  const perFile = session.per_file as Record<string, PerFileResult>;
  for (const [tableName, info] of Object.entries(perFile)) {
    if (info.inserted === 0 && info.updated === 0) continue;
    const dbTable = TABLE_TO_DB[tableName as SyncTableName];
    if (!dbTable) continue;
    await supabase.from(dbTable).delete().gte('updated_at', new Date(Date.now() - 3600000).toISOString());
  }

  // Also roll back payent rows forwarded by PYENT/PYENT1/PYENT2 syncs.
  if (perFile.PYENT || perFile.PYENT1 || perFile.PYENT2) {
    await supabase.from('payent').delete().gte('updated_at', new Date(Date.now() - 3600000).toISOString());
  }

  await supabase.from('dbf_sync_sessions').update({
    status: 'rolled_back',
    is_rolled_back: true,
  }).eq('id', sessionId);

  return true;
}

export async function deleteSyncSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('dbf_sync_sessions')
    .delete()
    .eq('id', sessionId);
  return !error;
}

export async function deleteTableData(
  tableName: SyncTableName,
  category?: PayrollCategory | null,
): Promise<{ deleted: number | null; error: string | null }> {
  const dbTable = TABLE_TO_DB[tableName];
  if (!dbTable) return { deleted: null, error: `Unknown table: ${tableName}` };

  // DIVTABLE has no stacode column — it is shared infrastructure and cannot
  // be scoped by category. Only delete when no category filter is active.
  if (dbTable === 'dbf_divtable' && category) {
    return { deleted: null, error: 'Division table is shared across both categories and cannot be deleted per-category.' };
  }

  // stacode is stored as text, so database-side gte/lte filters do string
  // comparison ('9' > '499'). Fetch all rows, filter numerically in JS, then
  // delete by ID to get correct numeric-range scoping.
  if (category) {
    if (dbTable === 'employees') {
      const rows = await fetchAll(() =>
        supabase.from('employees').select('id,stacode'),
      );
      const ids = (rows as { id: string; stacode: string | null }[])
        .filter((r) => inCategory(r.stacode, category))
        .map((r) => r.id);
      if (ids.length === 0) return { deleted: 0, error: null };
      const { count, error: delError } = await supabase.from('employees').delete().in('id', ids);
      if (delError) return { deleted: null, error: delError.message };
      return { deleted: count ?? 0, error: null };
    }

    if (dbTable === 'payroll_deductions') {
      const empRows = await fetchAll(() =>
        supabase.from('employees').select('id,stacode'),
      );
      const empIds = (empRows as { id: string; stacode: string | null }[])
        .filter((r) => inCategory(r.stacode, category))
        .map((r) => r.id);
      if (empIds.length === 0) return { deleted: 0, error: null };
      const { count, error: delError } = await supabase
        .from('payroll_deductions')
        .delete()
        .in('employee_id', empIds);
      if (delError) return { deleted: null, error: delError.message };
      return { deleted: count ?? 0, error: null };
    }

    // DBF mirror tables with a direct stacode column
    const rows = await fetchAll(() =>
      supabase.from(dbTable).select('id,stacode'),
    );
    const ids = (rows as { id: string; stacode: string | null }[])
      .filter((r) => inCategory(r.stacode, category))
      .map((r) => r.id);
    if (ids.length === 0) return { deleted: 0, error: null };
    const { count, error: delError } = await supabase.from(dbTable).delete().in('id', ids);
    if (delError) return { deleted: null, error: delError.message };
    return { deleted: count ?? 0, error: null };
  }

  const { count, error: delError } = await supabase
    .from(dbTable)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) return { deleted: null, error: delError.message };

  // PYENT/PYENT1/PYENT2 uploads are also forwarded into the `payent` bank-
  // crediting table — clear those forwarded rows together with the mirror.
  if (tableName === 'PYENT' || tableName === 'PYENT1' || tableName === 'PYENT2') {
    let q = supabase.from('payent').delete().eq('source', tableName);
    if (category) {
      const rows = await fetchAll(() => supabase.from('payent').select('id,stacode').eq('source', tableName));
      const ids = (rows as { id: string; stacode: string | null }[])
        .filter((r) => inCategory(r.stacode, category))
        .map((r) => r.id);
      if (ids.length > 0) q = supabase.from('payent').delete().in('id', ids);
      else return { deleted: count ?? 0, error: null };
    }
    await q;
  }

  return { deleted: count ?? 0, error: null };
}

export async function loadSyncSessions(category?: PayrollCategory | null): Promise<SyncSessionRecord[]> {
  let query = supabase.from('dbf_sync_sessions')
    .select('id,session_label,started_at,completed_at,status,files_uploaded,total_inserted,total_updated,total_skipped,total_errors,error_log,per_file,performed_by,is_rolled_back,category')
    .order('started_at', { ascending: false })
    .limit(50);
  if (category) query = query.eq('category', category);
  const rows = await fetchAll(() => query);
  return rows as SyncSessionRecord[];
}
