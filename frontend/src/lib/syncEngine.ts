import { supabase, fetchAll, chunkedIn, formatError } from '@/lib/pb';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { syncMastfile, syncDedfile, loadDivisionDirectory, resolveDivisionId, type SyncResult, type SyncScope } from '@/lib/restoreSync';
import { inCategory, categoryOfStacode, type PayrollCategory } from '@/lib/categories';
import { classifyStacode } from '@/lib/payrollComputation';

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
  DBF_TABLES,
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

  const existing: ExistingRow[] = await chunkedIn(conflictColumns[0], [...new Set(keys.map((k) => k.split('|')[0]))], (chunk) =>
    supabase.from(tableName).select(selectColumns).in(conflictColumns[0], chunk),
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
    const { error } = await supabase.from(tableName).upsert(
      batch.map((b) => ({ ...b.data, id: b.id })),
    );
    if (error) { errors.push(`Update batch: ${error.message}`); skipped += batch.length; }
    else updated += batch.length;
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

async function syncStntable(bytes: Uint8Array, category?: PayrollCategory | null, scope?: SyncScope | null): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'STNTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };
  // STNTABLE is the station/school masterfile shared by BOTH payroll
  // categories, so unlike MASTFILE/INCLUDED/EXCLUDED/PAYROLLS the whole
  // uploaded file is imported regardless of the active tab. Each station is
  // classified by its own STACODE and synced to the organization it belongs
  // to — Elementary stations (1-499) go to the Elementary organization, High
  // School stations (500-701) to the High School organization — and forwarded
  // into the School Directory. One STNTABLE.DBF import therefore populates
  // both organizations instead of dropping the stations outside the selected
  // tab's range. A station whose STACODE matches neither range keeps the
  // active tab's category as a fallback so it is never silently lost.
  const filtered = records;

  // Use dbfTemplate for field validation and mapping
  const template = DBF_TABLES.find(t => t.name === 'STNTABLE');
  if (!template) {
    return { tableName: 'STNTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['STNTABLE template not found'], durationMs: Date.now() - start };
  }

  // Build rows using the dbf_stntable collection schema. The template's
  // UPPERCASE names (REGCODE, SCHNAME, …) are DBF notation only — they don't
  // exist in the PocketBase collection, which is lowercase (stacode, staname,
  // divcode, regcode, address, cluster, category, munic, province, zipcode).
  // Writing the UPPERCASE names makes PocketBase reject every insert with an
  // unknown-field error, so everything is remapped to the collection below.
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = filtered.map((rec) => {
    const stacode = str(rec, 'STACODE') || str(rec, 'STATION');
    const row: Record<string, unknown> = {
      stacode,
      staname: str(rec, 'STANAME') || str(rec, 'SCHNAME') || str(rec, 'STATION_NA') || str(rec, 'NAME'),
      divcode: str(rec, 'DIVCODE'),
      regcode: str(rec, 'REGCODE'),
      address: str(rec, 'SCHADDR') || str(rec, 'ADDRESS') || str(rec, 'ADDR'),
      cluster: str(rec, 'DISTRICT') || str(rec, 'CLUSTER'),
      munic: str(rec, 'MUNIC'),
      province: str(rec, 'PROV') || str(rec, 'PROVINCE'),
      zipcode: str(rec, 'ZIPCODE') || str(rec, 'ZIP'),
      created_at: now,
      updated_at: now,
    };
    // Stamp each row with the category its own STACODE belongs to so a single
    // import populates both the Elementary and High School organizations.
    const rowCategory = categoryOfStacode(stacode) ?? category ?? null;
    if (rowCategory) row.category = rowCategory;
    return row;
  }).filter((r) => r.stacode);

  const result = await upsertTable('dbf_stntable', rows, ['stacode'], (r) => r.stacode as string, 'id,stacode');
  
  // STNTABLE.DBF → School Directory: upsert into the schools table so uploaded
  // stations appear in the Organization (Elementary / High School) views
  // immediately. The uploader's scope is passed so stations whose REGCODE/DIVCODE
  // don't resolve against the divisions directory are still stamped with the
  // division being imported into (same fallback as MASTFILE).
  const schoolErrors = await forwardStntableToSchools(filtered, scope);
  result.errors.push(...schoolErrors);

  return { tableName: 'STNTABLE', fileName: '', ...result, durationMs: Date.now() - start };
}

/**
 * Forward STNTABLE rows into the schools table (School Directory).
 * school_code is unique, so this is a plain upsert keyed on it.
 */
async function forwardStntableToSchools(records: DbfRecord[], scope?: SyncScope | null): Promise<string[]> {
  const errors: string[] = [];
  // Stamp each school with the division its REGCODE/DIVCODE resolves to so the
  // School Directory is scoped per division — and so a later MASTFILE import
  // whose rows only carry STACODE can derive the division from the school.
  // When the row's codes are missing or don't resolve against the divisions
  // directory, fall back to the uploader's scope (the division being imported
  // into) so no STNTABLE station is left unscoped — unscoped stations never
  // show up in the Organization → Schools views, which filter by division.
  const divisionDirectory = await loadDivisionDirectory();
  const rows = records
    .map((rec) => {
      const stacode = str(rec, 'STACODE');
      if (!stacode) return null;
      // Resolve school_type from SCHTYPE field (DBF template field), then fall
      // back to STACODE range classification.
      const schtype = (str(rec, 'SCHTYPE') || '').toUpperCase();
      let schoolType: string = 'Elementary';
      if (schtype.includes('IMPLEMENT') || schtype.includes('UNIT') || schtype === 'IU') {
        schoolType = 'Implementing Unit';
      } else if (schtype.includes('SENIOR') || schtype === 'SHS') {
        schoolType = 'Senior High School';
      } else if (schtype.includes('JUNIOR') || schtype.includes('HIGH') || schtype === 'JHS') {
        schoolType = 'Junior High School';
      } else {
        // No SCHTYPE match — fall back to STACODE range:
        // 001-499 = Elementary, 500-699 = Junior High School, 700-701 = Senior High School
        const group = classifyStacode(stacode);
        if (group === 'JHS') schoolType = 'Junior High School';
        else if (group === 'SHS') schoolType = 'Senior High School';
      }
      const regcode = str(rec, 'REGCODE');
      const divcode = str(rec, 'DIVCODE');
      let divisionId = resolveDivisionId(divisionDirectory, regcode, divcode);
      if (!divisionId && scope) {
        divisionId = resolveDivisionId(divisionDirectory, scope.regcode, scope.divcode);
      }
      const divisionMeta = divisionId ? divisionDirectory.byId.get(divisionId) : undefined;
      return {
        school_code: stacode,
        stacode,
        school_name: str(rec, 'SCHNAME') || str(rec, 'STANAME') || str(rec, 'STATION_NA') || str(rec, 'NAME') || `School ${stacode}`,
        school_type: schoolType,
        district: str(rec, 'DISTRICT') || str(rec, 'CLUSTER') || null,
        cluster: str(rec, 'DISTRICT') || str(rec, 'CLUSTER') || null,
        municipality: str(rec, 'MUNIC') || null,
        province: str(rec, 'PROV') || str(rec, 'PROVINCE') || null,
        region_id: divisionMeta?.region_id ?? null,
        division_id: divisionId,
        status: 'Active',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) return errors;
  // Find existing schools by school_code so we can update or insert
  const existingSchools = await fetchAll(() =>
    supabase.from('schools').select('id,school_code'),
  );
  const existingMap = new Map<string, string>();
  (existingSchools as { id: string; school_code: string | null }[]).forEach((s) => {
    if (s.school_code) existingMap.set(s.school_code.trim(), s.id);
  });
  for (const row of rows) {
    const existingId = existingMap.get((row.school_code as string).trim());
    if (existingId) {
      const rest = { ...row } as Record<string, unknown>;
      delete rest.school_code;
      // Never wipe a previously resolved division/region with an unresolved one
      // (e.g. a re-import of a file that carries no codes): leave the fields
      // untouched instead of writing null over a good value.
      if (!rest.division_id) {
        delete rest.division_id;
        delete rest.region_id;
      }
      const { error } = await supabase.from('schools').update(rest).eq('id', existingId);
      if (error) errors.push(`schools update: ${error.message}`);
    } else {
      const { error } = await supabase.from('schools').insert(row);
      if (error) errors.push(`schools insert: ${error.message}`);
    }
  }
  return errors.slice(0, 5);
}

async function syncDivtable(bytes: Uint8Array): Promise<PerFileResult> {
  const start = Date.now();
  const { records } = decodeDbf(bytes);
  if (records.length === 0) return { tableName: 'DIVTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['No records found'], durationMs: Date.now() - start };

  // Use dbfTemplate for field validation and mapping
  const template = DBF_TABLES.find(t => t.name === 'DIVTABLE');
  if (!template) {
    return { tableName: 'DIVTABLE', fileName: '', inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: ['DIVTABLE template not found'], durationMs: Date.now() - start };
  }

  const rows: Record<string, unknown>[] = records.map((rec) => {
    // Use the dbf_divtable collection schema (lowercase). The template's
    // UPPERCASE names only exist in the DBF, not in PocketBase — writing them
    // makes PocketBase reject every insert with an unknown-field error.
    const row: Record<string, unknown> = {
      divcode: str(rec, 'DIVCODE'),
      divname: str(rec, 'DIVNAME') || str(rec, 'DIVISION_N') || str(rec, 'NAME'),
      regcode: str(rec, 'REGCODE'),
      address: str(rec, 'ADDRESS') || str(rec, 'ADDR'),
      chief: str(rec, 'CHIEF') || str(rec, 'OFFICER') || str(rec, 'HEAD'),
      updated_at: new Date().toISOString(),
    };
    return row;
  }).filter((r) => r.divcode);

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

  // Set priority = 1 for INCLUDED deductions (highest priority, deducted FIRST)
  const includedEmpnos = [...new Set(rows.map((r) => r.empno).filter(Boolean))];
  if (includedEmpnos.length > 0) {
    for (let i = 0; i < includedEmpnos.length; i += 60) {
      const batch = includedEmpnos.slice(i, i + 60);
      await supabase.from('payroll_deductions').update({ priority: 1 }).in('empno', batch);
    }
  }

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
  let resolvedPeriod = periodName || '';
  // Fallback to current open period if none specified
  if (!resolvedPeriod) {
    const { data: openPeriod } = await supabase.from('pay_periods').select('period_name').in('status', ['open', 'draft']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (openPeriod) resolvedPeriod = openPeriod.period_name;
  }

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
  // Ensure all rows have payperiod set to resolvedPeriod if empty
  for (const r of rows) { if (!r.payperiod) r.payperiod = resolvedPeriod; }
  const periodIdMap = await resolvePeriodIds(rows, errors);
  const dedCodes = await fetchAll(() => supabase.from('deduction_codes').select('dedcode,dedname,type'));
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
  const rows = await chunkedIn('empno', unique, (chunk) =>
    supabase.from('employees').select('id,empno,employee_number').in('empno', chunk),
  );
  (rows as { id: string; empno: string | null; employee_number: string | null }[]).forEach((e) => {
    if (e.empno) map.set(e.empno.trim(), e.id);
    if (e.employee_number) map.set(e.employee_number.trim(), e.id);
  });
  return map;
}

/**
 * Resolve each employee id to the payroll category its own STACODE belongs to.
 * A null value means the STACODE is blank/unclassifiable — those employees are
 * treated as matching both categories so an import without station codes is
 * never silently dropped.
 */
async function loadEmployeeCategoryById(ids: string[]): Promise<Map<string, PayrollCategory | null>> {
  const map = new Map<string, PayrollCategory | null>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const rows = await chunkedIn('id', unique, (chunk) =>
    supabase.from('employees').select('id,stacode').in('id', chunk),
  );
  (rows as { id: string; stacode: string | null }[]).forEach((e) => {
    map.set(e.id, categoryOfStacode(e.stacode));
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

  // Set priority = 2 for EXCLUDED deductions (least priority, deducted LAST)
  const excludedEmpnos = [...new Set(rows.map((r) => r.empno).filter(Boolean))];
  if (excludedEmpnos.length > 0) {
    for (let i = 0; i < excludedEmpnos.length; i += 60) {
      const batch = excludedEmpnos.slice(i, i + 60);
      await supabase.from('payroll_deductions').update({ priority: 2 }).in('empno', batch);
    }
  }

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
  let resolvedPeriod = periodName || '';
  // Fallback to current open period if none specified
  if (!resolvedPeriod) {
    const { data: openPeriod } = await supabase.from('pay_periods').select('period_name').in('status', ['open', 'draft']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (openPeriod) resolvedPeriod = openPeriod.period_name;
  }

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
    .filter((r) => r.empno);
  if (rows.length === 0) return errors;

  const empIdMap = await resolveEmpIds(rows.map((r) => r.empno));
  // Ensure all rows have payperiod set to resolvedPeriod if empty
  for (const r of rows) { if (!r.payperiod) r.payperiod = resolvedPeriod; }
  const periodIdMap = await resolvePeriodIds(rows, errors);
  const dedCodes = await fetchAll(() => supabase.from('deduction_codes').select('dedcode,dedname'));
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
  const empRows = await chunkedIn('empno', allEmpnos, (chunk) =>
    supabase.from('employees').select('id,empno,employee_number').in('empno', chunk),
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
    const existingEntries = await fetchAll<{ id: string; employee_id: string }>(() =>
      supabase
        .from('payroll_entries')
        .select('id,employee_id')
        .eq('pay_period_id', periodId),
    );
    const entryByEmp = new Map<string, string>();
    existingEntries.forEach((e) => {
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
  // PYENT records reference employees by EMPNO and may or may not carry a
  // STACODE. When the file does carry station codes, keep only the active
  // category's range; rows with a blank/unclassifiable STACODE still pass and
  // are separated later by the employee's own category (forwardPyentToPayent).
  const filtered = category
    ? records.filter((rec) => {
        const recCat = categoryOfStacode(str(rec, 'STACODE'));
        return !recCat || recCat === category;
      })
    : records;

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
  const forwardErrors = await forwardPyentToPayent(filtered, tableName, category);
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
async function forwardPyentToPayent(records: DbfRecord[], tableName: SyncTableName, category?: PayrollCategory | null): Promise<string[]> {
  const errors: string[] = [];
  const half = tableName === 'PYENT1' ? 'first' : tableName === 'PYENT2' ? 'second' : 'full';

  let rows = records
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
  // Separate the Elementary and High School saves: drop rows whose employee is
  // explicitly classified in the other category's STACODE range so an
  // Elementary PYENT import never credits High School employees (employees with
  // a blank/unclassifiable STACODE still pass through).
  if (category) {
    const empCategories = await loadEmployeeCategoryById([...empIdMap.values()]);
    rows = rows.filter((r) => {
      const empCat = empCategories.get(empIdMap.get(r.empno) ?? '');
      return !empCat || empCat === category;
    });
    if (rows.length === 0) return errors;
  }
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

  // Find existing payent rows by empno+payperiod+half to do upsert manually
  const empnos = [...new Set(toInsert.map((r) => r.empno as string).filter(Boolean))];
  const existingPayent = empnos.length > 0
    ? await chunkedIn('empno', empnos, (chunk) =>
        supabase.from('payent').select('id,empno,payperiod,half').in('empno', chunk),
      ) as { id: string; empno: string; payperiod: string; half: string }[]
    : [];
  const payentExistingMap = new Map<string, string>();
  existingPayent.forEach((r) => {
    payentExistingMap.set(`${r.empno}|${r.payperiod}|${r.half}`, r.id);
  });
  for (const row of toInsert) {
    const key = `${row.empno}|${row.payperiod}|${row.half}`;
    const existingId = payentExistingMap.get(key);
    if (existingId) {
      const { id: _id, ...rest } = row;
      const { error } = await supabase.from('payent').update(rest).eq('id', existingId);
      if (error) errors.push(`payent update: ${error.message}`);
    } else {
      const { error } = await supabase.from('payent').insert(row);
      if (error) errors.push(`payent insert: ${error.message}`);
    }
  }
  return errors.slice(0, 10);
}

/**
 * One table's import + save routine with its Elementary/High School scope
 * already applied. The STACODE range a routine writes is fixed when the
 * routine is built (below), not passed in as a mutable flag.
 */
export type CategorySyncFn = (
  bytes: Uint8Array,
  scope?: SyncScope | null,
  periodName?: string | null,
) => Promise<PerFileResult | SyncResult>;

export type CategorySyncFunctions = Record<SyncTableName, CategorySyncFn>;

export type SyncProgressCallback = (
  current: number,
  total: number,
  tableName: SyncTableName,
  message: string,
) => void;

/**
 * Build the per-table import + save routines bound to one payroll category.
 *
 * Category-scoped tables (MASTFILE, INCLUDED, EXCLUDED, PAYROLLS, DEDFILE and
 * PYENT/PYENT1/PYENT2) always receive the bound category, so an Elementary
 * import can only ever save STACODE 1–499 and a High School import 500–701.
 * STNTABLE and DIVTABLE are shared infrastructure and are imported whole:
 * STNTABLE classifies each station by its own STACODE so one upload still
 * populates both organizations.
 */
export function buildCategorySyncFunctions(category: PayrollCategory): CategorySyncFunctions {
  return {
    STNTABLE: (bytes, scope) => syncStntable(bytes, category, scope),
    DIVTABLE: (bytes) => syncDivtable(bytes),
    MASTFILE: (bytes, scope) => syncMastfileWrapper(bytes, category, scope),
    INCLUDED: (bytes, scope, period) => syncIncluded(bytes, category, scope, period),
    EXCLUDED: (bytes, scope, period) => syncExcluded(bytes, category, scope, period),
    DEDFILE: (bytes, scope) => syncDedfileWrapper(bytes, category, scope),
    PAYROLLS: (bytes, scope, period) => syncPayrolls(bytes, category, scope, period),
    PYENT: (bytes) => syncPyent('PYENT', bytes, category),
    PYENT1: (bytes) => syncPyent('PYENT1', bytes, category),
    PYENT2: (bytes) => syncPyent('PYENT2', bytes, category),
  };
}

// Elementary and High School each own a distinct set of import + save routines.
export const ELEMENTARY_SYNC_FUNCTIONS = buildCategorySyncFunctions('elementary');
export const HIGHSCHOOL_SYNC_FUNCTIONS = buildCategorySyncFunctions('highschool');

/** Pick the import + save routine set for a payroll category. */
export function getSyncFunctions(category: PayrollCategory): CategorySyncFunctions {
  return category === 'elementary' ? ELEMENTARY_SYNC_FUNCTIONS : HIGHSCHOOL_SYNC_FUNCTIONS;
}

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

export function previewDbf(bytes: Uint8Array, fileName: string, options?: { limit?: number }): FilePreview {
  const tableName = extractTableName(fileName);
  if (!tableName) {
    return { fileName, tableName: 'MASTFILE', recordCount: 0, fieldCount: 0, fields: [], sampleRows: [], bytes, fileSize: bytes.byteLength, valid: false, error: `Could not match \"${fileName}\" to any of the 10 supported tables.` };
  }
  try {
    const { fields, records } = decodeDbf(bytes);
    // Use the provided limit or default to all records
    const limit = options?.limit ?? records.length;
    const sampleRows = records.slice(0, limit);
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
  onProgress: SyncProgressCallback | undefined,
  category: PayrollCategory,
  scope?: SyncScope | null,
  periodName?: string | null,
): Promise<SyncSessionResult> {
  const sessionStart = Date.now();

  const { data: sessionRow, error: sessionErr } = await supabase
    .from('dbf_sync_sessions')
    .insert({
      session_label: `Import ${new Date().toLocaleString('en-PH')} (${category === 'elementary' ? 'Elementary' : 'High School'})`,
      files_uploaded: JSON.stringify(previews.map((p) => p.fileName)),
      status: 'running',
      performed_by: userEmail,
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      category,
    })
    .select('id')
    .single();
  if (sessionErr) throw new Error(`Failed to create sync session: ${sessionErr.message}`);

  const sessionId = sessionRow.id;
  const syncFns = getSyncFunctions(category);
  const sorted = [...previews].sort((a, b) => SYNC_ORDER.indexOf(a.tableName) - SYNC_ORDER.indexOf(b.tableName));
  const results: PerFileResult[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    onProgress?.(i + 1, sorted.length, p.tableName, `Synchronizing ${TABLE_LABELS[p.tableName]}...`);
    try {
      const fn = syncFns[p.tableName];
      const result = await fn(p.bytes, scope, periodName);
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
    error_log: JSON.stringify(results.flatMap((r) => r.errors.map((e) => `[${r.tableName}] ${e}`))),
    per_file: JSON.stringify(perFileMap),
  }).eq('id', sessionId);

  return {
    sessionId,
    files: results,
    totalInserted, totalUpdated, totalSkipped, totalDuplicates, totalErrors,
    durationMs: Date.now() - sessionStart,
    rolledBack: false,
  };
}

/**
 * Import + save a batch of Elementary DBF files (STACODE 1–499).
 *
 * This is the Elementary counterpart of {@link importHighSchoolFiles}: it runs
 * the Elementary-bound routines from {@link ELEMENTARY_SYNC_FUNCTIONS}, so only
 * records in the Elementary STACODE range are written to the system.
 */
export async function importElementaryFiles(
  previews: FilePreview[],
  userEmail: string,
  onProgress?: SyncProgressCallback,
  scope?: SyncScope | null,
  periodName?: string | null,
): Promise<SyncSessionResult> {
  return executeSync(previews, userEmail, onProgress, 'elementary', scope, periodName);
}

/**
 * Import + save a batch of High School DBF files (STACODE 500–701).
 *
 * High School counterpart of {@link importElementaryFiles}; runs the
 * High-School-bound routines from {@link HIGHSCHOOL_SYNC_FUNCTIONS}.
 */
export async function importHighSchoolFiles(
  previews: FilePreview[],
  userEmail: string,
  onProgress?: SyncProgressCallback,
  scope?: SyncScope | null,
  periodName?: string | null,
): Promise<SyncSessionResult> {
  return executeSync(previews, userEmail, onProgress, 'highschool', scope, periodName);
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

export interface ClearTableResult {
  deleted: number | null;
  error: string | null;
}

/** Clear one table's records for a payroll category. */
export type ClearTableFn = (tableName: SyncTableName) => Promise<ClearTableResult>;

/**
 * Clear one table's records for a single payroll category — and the rows that
 * table's import forwarded into the rest of the system — so an Elementary clear
 * can never touch High School data (and vice versa).
 *
 * stacode is stored as text, so database-side range filters would compare
 * strings ('9' > '499'). Every row is fetched and matched numerically in JS,
 * then deleted by id in chunks.
 */
async function clearTableDataForCategory(
  tableName: SyncTableName,
  category: PayrollCategory,
): Promise<ClearTableResult> {
  const dbTable = TABLE_TO_DB[tableName];
  if (!dbTable) return { deleted: null, error: `Unknown table: ${tableName}` };

  // DIVTABLE has no stacode column — shared infrastructure that belongs to
  // neither category, so it cannot be cleared per-category.
  if (dbTable === 'dbf_divtable') {
    return { deleted: null, error: 'Division table is shared across both categories and cannot be cleared per-category.' };
  }

  let total = 0;

  // Employee ids that belong to this category by their own STACODE. Used to
  // scope tables keyed by employee_id rather than stacode.
  const empRows = await fetchAll(() => supabase.from('employees').select('id,stacode'));
  const empIds = (empRows as { id: string; stacode: string | null }[])
    .filter((r) => inCategory(r.stacode, category))
    .map((r) => r.id);

  // Delete this category's rows from a table that carries its own stacode,
  // optionally restricted to a column/value (e.g. a forwarded deductions
  // `source`). Matches on the row's own STACODE — the same column the status
  // grid counts — so what the UI reports is what actually gets deleted.
  const clearByStacode = async (
    table: string,
    filter?: { column: string; value: string },
  ): Promise<string | null> => {
    const rows = await fetchAll(() => {
      let q = supabase.from(table).select('id,stacode');
      if (filter) q = q.eq(filter.column, filter.value);
      return q;
    });
    const ids = (rows as { id: string; stacode: string | null }[])
      .filter((r) => inCategory(r.stacode, category))
      .map((r) => r.id);
    if (ids.length === 0) return null;
    const { deleted, error } = await deleteInChunks(table, 'id', ids);
    if (error) return error;
    total += deleted;
    return null;
  };

  // Delete this category's rows from a table keyed by employee_id, optionally
  // restricted to a column/value (e.g. a forwarded deductions `source`).
  const clearByEmployee = async (
    table: string,
    filter?: { column: string; value: string },
  ): Promise<string | null> => {
    if (empIds.length === 0) return null;
    let count = 0;
    for (let i = 0; i < empIds.length; i += 60) {
      const chunk = empIds.slice(i, i + 60);
      let q = supabase.from(table).delete().in('employee_id', chunk);
      if (filter) q = q.eq(filter.column, filter.value);
      const { count: n, error } = await q;
      if (error) return error.message;
      count += n ?? 0;
    }
    total += count;
    return null;
  };

  switch (tableName) {
    case 'MASTFILE':
      // MASTFILE is saved straight into `employees`; clearing it removes only
      // the category's employee rows.
      {
        const err = await clearByStacode('employees');
        if (err) return { deleted: null, error: err };
      }
      break;
    case 'DEDFILE':
      {
        // payroll_deductions (the DEDFILE masterfile) and the forwarded
        // deductions rows each carry the DEDFILE record's own STACODE. Clear by
        // that column — clearing by employee_id silently deleted nothing when
        // the linked employee had no STACODE while the grid still counted rows.
        let err = await clearByStacode('payroll_deductions');
        if (err) return { deleted: null, error: err };
        err = await clearByStacode('deductions', { column: 'source', value: 'DEDFILE' });
        if (err) return { deleted: null, error: err };
      }
      break;
    case 'INCLUDED':
      {
        let err = await clearByStacode('dbf_included');
        if (err) return { deleted: null, error: err };
        err = await clearByEmployee('deductions', { column: 'source', value: 'INCLUDED' });
        if (err) return { deleted: null, error: err };
      }
      break;
    case 'EXCLUDED':
      {
        let err = await clearByStacode('dbf_excluded');
        if (err) return { deleted: null, error: err };
        err = await clearByEmployee('undeducted_obligations');
        if (err) return { deleted: null, error: err };
      }
      break;
    case 'PAYROLLS':
      {
        let err = await clearByStacode('dbf_payrolls');
        if (err) return { deleted: null, error: err };
        err = await clearByEmployee('payroll_entries');
        if (err) return { deleted: null, error: err };
      }
      break;
    case 'PYENT':
    case 'PYENT1':
    case 'PYENT2':
      {
        const err = await clearByStacode(dbTable);
        if (err) return { deleted: null, error: err };
        const err2 = await clearByEmployee('payent', { column: 'source', value: tableName });
        if (err2) return { deleted: null, error: err2 };
      }
      break;
    case 'STNTABLE':
      // STNTABLE is saved into the station mirror and forwarded into the School
      // Directory (`schools`) — hard-delete both rows for this category.
      {
        let err = await clearByStacode('dbf_stntable');
        if (err) return { deleted: null, error: err };
        err = await clearByStacode('schools');
        if (err) return { deleted: null, error: err };
      }
      break;
    default:
      // Any other direct-stacode mirror table.
      {
        const err = await clearByStacode(dbTable);
        if (err) return { deleted: null, error: err };
      }
  }

  return { deleted: total, error: null };
}

/**
 * Clear an Elementary table (STACODE 1–499) and the Elementary rows its import
 * forwarded into the rest of the system.
 */
export const clearElementaryTableData: ClearTableFn = (tableName) =>
  clearTableDataForCategory(tableName, 'elementary');

/**
 * Clear a High School table (STACODE 500–701) and the High School rows its
 * import forwarded into the rest of the system.
 */
export const clearHighSchoolTableData: ClearTableFn = (tableName) =>
  clearTableDataForCategory(tableName, 'highschool');

/** Pick the clear routine for a payroll category. */
export function getClearTableFn(category: PayrollCategory): ClearTableFn {
  return category === 'elementary' ? clearElementaryTableData : clearHighSchoolTableData;
}

/**
 * Delete records by id/column in small chunks. PocketBase's filter parser
 * rejects `.in()` OR-expansions with ~100+ terms ("Something went wrong while
 * processing your request."), so any bulk delete must stay well under that.
 */
async function deleteInChunks(
  table: string,
  column: string,
  ids: string[],
): Promise<{ deleted: number; error: string | null }> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const { count, error: delError } = await supabase.from(table).delete().in(column, chunk);
    if (delError) return { deleted, error: delError.message };
    deleted += count ?? chunk.length;
  }
  return { deleted, error: null };
}

export async function loadSyncSessions(category?: PayrollCategory | null): Promise<SyncSessionRecord[]> {
  let query = supabase.from('dbf_sync_sessions')
    .select('id,session_label,started_at,completed_at,status,files_uploaded,total_inserted,total_updated,total_skipped,total_errors,error_log,per_file,performed_by,is_rolled_back,category')
    .order('started_at', { ascending: false })
    .limit(50);
  if (category) query = query.eq('category', category);
  const rows = await fetchAll(() => query);
  // PocketBase stores JSON fields as text strings — parse them back
  return (rows as any[]).map((r) => ({
    ...r,
    files_uploaded: typeof r.files_uploaded === 'string' ? JSON.parse(r.files_uploaded || '[]') : (r.files_uploaded ?? []),
    error_log: typeof r.error_log === 'string' ? JSON.parse(r.error_log || '[]') : (r.error_log ?? []),
    per_file: typeof r.per_file === 'string' ? JSON.parse(r.per_file || '{}') : (r.per_file ?? {}),
  })) as SyncSessionRecord[];
}
