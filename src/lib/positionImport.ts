import { supabase, fetchAll, chunkedIn } from '@/lib/supabase';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';

// ── Types ──────────────────────────────────────────────────────────────

export type PersonnelCategory = 'Teaching' | 'Teaching Related' | 'Non-Teaching';
export type ImportMode = 'add_new' | 'update_existing' | 'full_sync';

export interface PositionRecord {
  position_code: string;
  old_position_code: string;
  position_title: string;
  position_name: string;
  salary_grade: number;
  step1: number; step2: number; step3: number; step4: number;
  step5: number; step6: number; step7: number; step8: number;
  personnel_category: PersonnelCategory;
  position_category_code: string;
  remarks: string;
}

export interface ParsedPositionRow extends PositionRecord {
  _rowNum: number;
  _errors: string[];
  _action: 'new' | 'update' | 'skip' | 'duplicate' | 'invalid';
}

export interface ImportProgress {
  phase: 'fetching' | 'processing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  importLogId?: string;
}

// ── DBF Field Mapping ──────────────────────────────────────────────────

export const FIELD_MAPPING: Record<string, string> = {
  POSCODE: 'position_code',
  OLDCODE: 'old_position_code',
  POSTITLE: 'position_title',
  POSITION: 'position_name',
  GRADE: 'salary_grade',
  STEP1: 'step1',
  STEP2: 'step2',
  STEP3: 'step3',
  STEP4: 'step4',
  STEP5: 'step5',
  STEP6: 'step6',
  STEP7: 'step7',
  STEP8: 'step8',
  SC: 'position_category_code',
  POSTPLUS: 'remarks',
};

export const DBF_FIELDS = Object.keys(FIELD_MAPPING);

// ── Smart Position Classification ──────────────────────────────────────

const TEACHING_KEYWORDS = [
  'teacher i', 'teacher ii', 'teacher iii', 'teacher iv',
  'master teacher i', 'master teacher ii', 'master teacher iii', 'master teacher iv',
  'head teacher i', 'head teacher ii', 'head teacher iii',
  'head teacher iv', 'head teacher v', 'head teacher vi',
  'principal i', 'principal ii', 'principal iii', 'principal iv',
  'teacher-in-charge',
];

const TEACHING_RELATED_KEYWORDS = [
  'guidance counselor', 'education program specialist',
  'education supervisor', 'school librarian', 'librarian',
  'school head', 'shs teacher', 'special science teacher',
];

export function classifyPosition(title: string, poscode: string): PersonnelCategory {
  const lower = (title || '').toLowerCase().trim();
  const code = (poscode || '').trim();

  // Position codes starting with 1 or 2 are teaching positions (DepEd convention)
  if (code && /^[12]/.test(code)) return 'Teaching';

  for (const kw of TEACHING_KEYWORDS) {
    if (lower.includes(kw)) return 'Teaching';
  }
  for (const kw of TEACHING_RELATED_KEYWORDS) {
    if (lower.includes(kw)) return 'Teaching Related';
  }
  return 'Non-Teaching';
}

// ── File Parsing ───────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Parse a DBF, CSV, or XLSX file into raw field-name → value records.
 * For DBF files, uses the built-in dBASE decoder.
 * For CSV/XLSX, expects a simple text parse.
 */
export async function parseFile(file: File): Promise<{ fields: string[]; records: Record<string, unknown>[] }> {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

  if (ext === 'dbf') {
    const buf = new Uint8Array(await file.arrayBuffer());
    const { fields, records } = decodeDbf(buf);
    return {
      fields: fields.map(f => f.name),
      records: records as Record<string, unknown>[],
    };
  }

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    return parseCsv(text);
  }

  if (ext === 'xlsx') {
    // XLSX is a complex binary format (ZIP+XML). We use a lightweight CSV fallback:
    // the user can save as CSV from Excel. Show a helpful error if XLSX isn't supported.
    throw new Error('XLSX format requires conversion to CSV or DBF. Please save your Excel file as .csv or .dbf and try again.');
  }

  throw new Error(`Unsupported file format: .${ext}. Supported formats: .dbf, .csv, .xlsx`);
}

function parseCsv(text: string): { fields: string[]; records: Record<string, unknown>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { fields: [], records: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result.map(s => s.trim().replace(/^"|"$/g, ''));
  };

  const headers = parseLine(lines[0]).map(h => h.toUpperCase().trim());
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    records.push(row);
  }
  return { fields: headers, records };
}

// ── Field Mapping Resolution ───────────────────────────────────────────

/**
 * Auto-detect which source fields map to which DB columns.
 * Returns a mapping of source-field-name → db-column-name.
 */
export function autoDetectMapping(sourceFields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const sf of sourceFields) {
    const upper = sf.toUpperCase().trim();
    const dbCol = FIELD_MAPPING[upper];
    if (dbCol && !used.has(dbCol)) {
      mapping[sf] = dbCol;
      used.add(dbCol);
    }
  }
  return mapping;
}

// ── Validation ─────────────────────────────────────────────────────────

export function validateRow(row: Record<string, unknown>, mapping: Record<string, string>): { errors: string[]; record: PositionRecord } {
  const errors: string[] = [];

  const get = (dbCol: string): unknown => {
    const srcField = Object.keys(mapping).find(k => mapping[k] === dbCol);
    if (!srcField) return undefined;
    return row[srcField];
  };

  const position_code = str(get('position_code'));
  const position_name = str(get('position_name'));
  const position_title = str(get('position_title'));
  const salary_grade = num(get('salary_grade'));

  if (!position_code) errors.push('Position Code is required');
  if (!position_name && !position_title) errors.push('Position Name or Title is required');
  if (salary_grade < 0 || salary_grade > 33) errors.push(`Salary Grade must be 0–33 (got ${salary_grade})`);

  // Validate step values
  for (let s = 1; s <= 8; s++) {
    const stepVal = num(get(`step${s}`));
    if (stepVal < 0) errors.push(`Step ${s} must be >= 0`);
  }

  const record: PositionRecord = {
    position_code,
    old_position_code: str(get('old_position_code')),
    position_title,
    position_name,
    salary_grade,
    step1: num(get('step1')), step2: num(get('step2')),
    step3: num(get('step3')), step4: num(get('step4')),
    step5: num(get('step5')), step6: num(get('step6')),
    step7: num(get('step7')), step8: num(get('step8')),
    personnel_category: classifyPosition(position_title || position_name, position_code),
    position_category_code: str(get('position_category_code')),
    remarks: str(get('remarks')),
  };

  return { errors, record };
}

// ── Import Processing ──────────────────────────────────────────────────

const BATCH_SIZE = 500;

export async function fetchExistingPositions(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (codes.length === 0) return map;
  const rows = await chunkedIn('position_code', codes, (chunk) =>
    supabase.from('position_management').select('id,position_code').in('position_code', chunk)
  );
  for (const r of rows) map.set(r.position_code.toUpperCase(), r.id);
  return map;
}

export async function processPositionImport(
  rows: ParsedPositionRow[],
  mode: ImportMode,
  userEmail: string,
  fileName: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let added = 0, updated = 0, skipped = 0, failed = 0;

  const validRows = rows.filter(r => r._errors.length === 0);
  const invalidRows = rows.filter(r => r._errors.length > 0);
  failed = invalidRows.length;
  for (const r of invalidRows) {
    errors.push(`Row ${r._rowNum}: ${r._errors.join('; ')}`);
  }

  onProgress?.({ phase: 'fetching', current: 0, total: validRows.length, message: 'Fetching existing positions...' });
  const codes = validRows.map(r => r.position_code.toUpperCase());
  const existing = await fetchExistingPositions(codes);

  // Determine action per row
  const toInsert: ParsedPositionRow[] = [];
  const toUpdate: ParsedPositionRow[] = [];
  for (const row of validRows) {
    const exists = existing.has(row.position_code.toUpperCase());
    if (exists) {
      if (mode === 'add_new') {
        row._action = 'skip';
        skipped++;
      } else {
        row._action = 'update';
        toUpdate.push(row);
      }
    } else {
      row._action = 'new';
      toInsert.push(row);
    }
  }

  // Detect duplicates within the file
  const seen = new Set<string>();
  for (const row of validRows) {
    const key = row.position_code.toUpperCase();
    if (seen.has(key)) {
      row._action = 'duplicate';
      skipped++;
    }
    seen.add(key);
  }

  // Re-filter (duplicates removed from insert/update)
  const insertRows = toInsert.filter(r => r._action === 'new');
  const updateRows = toUpdate.filter(r => r._action === 'update');

  // Insert in batches
  onProgress?.({ phase: 'processing', current: 0, total: insertRows.length + updateRows.length, message: 'Inserting new positions...' });
  let processed = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    const payload = batch.map(r => ({
      position_code: r.position_code,
      old_position_code: r.old_position_code,
      position_title: r.position_title,
      position_name: r.position_name,
      salary_grade: r.salary_grade,
      step1: r.step1, step2: r.step2, step3: r.step3, step4: r.step4,
      step5: r.step5, step6: r.step6, step7: r.step7, step8: r.step8,
      personnel_category: r.personnel_category,
      position_category_code: r.position_category_code,
      remarks: r.remarks,
      status: 'Active',
      last_imported_at: nowIso,
    }));
    const { error } = await supabase.from('position_management').insert(payload);
    if (error) {
      errors.push(`Insert batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      failed += batch.length;
    } else {
      added += batch.length;
    }
    processed += batch.length;
    onProgress?.({ phase: 'processing', current: processed, total: insertRows.length + updateRows.length, message: `Inserted ${added} positions` });
  }

  // Update in batches
  for (let i = 0; i < updateRows.length; i += BATCH_SIZE) {
    const batch = updateRows.slice(i, i + BATCH_SIZE);
    for (const r of batch) {
      const id = existing.get(r.position_code.toUpperCase());
      if (!id) continue;
      const { error } = await supabase.from('position_management').update({
        old_position_code: r.old_position_code,
        position_title: r.position_title,
        position_name: r.position_name,
        salary_grade: r.salary_grade,
        step1: r.step1, step2: r.step2, step3: r.step3, step4: r.step4,
        step5: r.step5, step6: r.step6, step7: r.step7, step8: r.step8,
        personnel_category: r.personnel_category,
        position_category_code: r.position_category_code,
        remarks: r.remarks,
        last_imported_at: nowIso,
        last_updated_at: nowIso,
      }).eq('id', id);
      if (error) {
        errors.push(`Update ${r.position_code}: ${error.message}`);
        failed++;
      } else {
        updated++;
      }
      processed++;
      if (processed % 50 === 0) {
        onProgress?.({ phase: 'processing', current: processed, total: insertRows.length + updateRows.length, message: `Updated ${updated} positions` });
      }
    }
  }

  // Full sync: mark missing positions as inactive
  if (mode === 'full_sync') {
    onProgress?.({ phase: 'processing', current: processed, total: insertRows.length + updateRows.length, message: 'Marking missing positions inactive...' });
    const importedCodes = new Set(validRows.map(r => r.position_code.toUpperCase()));
    const allExisting = await fetchAll<{ id: string; position_code: string; status: string }>(
      () => supabase.from('position_management').select('id,position_code,status').eq('status', 'Active')
    );
    const toDeactivate = allExisting.filter(e => !importedCodes.has(e.position_code.toUpperCase()));
    for (let i = 0; i < toDeactivate.length; i += BATCH_SIZE) {
      const batch = toDeactivate.slice(i, i + BATCH_SIZE);
      const ids = batch.map(b => b.id);
      const { error } = await supabase.from('position_management').update({ status: 'Inactive', last_updated_at: nowIso }).in('id', ids);
      if (error) errors.push(`Deactivate batch: ${error.message}`);
    }
  }

  const processingTime = Date.now() - startTime;

  // Write import log
  const { data: logData } = await supabase.from('position_import_logs').insert({
    uploaded_by: userEmail,
    filename: fileName,
    import_mode: mode,
    total_records: rows.length,
    new_records: added,
    updated_records: updated,
    skipped_records: skipped,
    error_records: failed,
    processing_time_ms: processingTime,
    status: failed === 0 ? 'Completed' : failed === rows.length ? 'Failed' : 'Partial',
  }).select('id').single();

  onProgress?.({ phase: 'complete', current: processed, total: insertRows.length + updateRows.length, message: 'Import complete' });

  return {
    added, updated, skipped, failed, errors,
    importLogId: logData?.id,
  };
}

// ── Rollback ───────────────────────────────────────────────────────────

export async function rollbackImport(logId: string): Promise<{ restored: number; deleted: number }> {
  // Fetch the log entry
  const { data: log } = await supabase
    .from('position_import_logs')
    .select('*')
    .eq('id', logId)
    .maybeSingle();

  if (!log) throw new Error('Import log not found');

  // For 'add_new' mode: delete positions imported after this log's timestamp
  // For other modes: reactivate positions that were deactivated
  const importTime = log.created_at;

  // Delete positions created after the import time (new records)
  const { data: deleted } = await supabase
    .from('position_management')
    .delete()
    .gte('last_imported_at', importTime)
    .lt('last_imported_at', new Date(new Date(importTime).getTime() + 60000).toISOString())
    .select('id');

  // Reactivate any positions that were marked inactive during full_sync
  const { data: restored } = await supabase
    .from('position_management')
    .update({ status: 'Active' })
    .eq('status', 'Inactive')
    .gte('last_updated_at', importTime)
    .lt('last_updated_at', new Date(new Date(importTime).getTime() + 60000).toISOString())
    .select('id');

  // Delete the import log
  await supabase.from('position_import_logs').delete().eq('id', logId);

  return {
    deleted: deleted?.length ?? 0,
    restored: restored?.length ?? 0,
  };
}
