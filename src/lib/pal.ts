/**
 * Plantilla Allocation List (PAL) persistence.
 *
 * One `pal_lists` PocketBase record per division + school level. The whole
 * working sheet (all 19+1 Annex R-I columns) is kept in the `rows` JSON field
 * so every encoded employee round-trips exactly, including the columns a plain
 * UI grid would lose (transfer org code / school, date of approval, remarks).
 *
 * localStorage is kept as an offline fallback + cache mirroring the DB copy;
 * when a list is loaded it is re-synced into localStorage so any later DB
 * outage still shows the last-saved sheet.
 */
import { supabase } from '@/lib/pb';

// ── Row model — one employee row across ALL Annex R-I columns ─────────────

export interface PalRow {
  uid: string;
  empno: string;
  empId?: string;
  /** (1) Item No. (per latest PSIPOP) */
  itemNumber: string;
  itemYear?: number;
  /** (2) Organizational Code per PSIPOP */
  orgCode?: string;
  /** (3) Organizational Code per PSIPOP to which the item will be transferred (blank if N/A) */
  transferOrgCode?: string;
  /** (4) Name of School / SDO to which the item will be transferred (blank if N/A) */
  transferSchool?: string;
  /** (5) Name of Incumbent (Surname, Name, Middle Name) */
  incumbent: string;
  /** (6) Position Title — Present */
  positionTitle: string;
  /** (7) DepEd Approved Position */
  approvedPosition?: string;
  /** (8) Date of Approval */
  dateApproval?: string;
  /** (9) Salary Grade — Present */
  grade: number;
  /** (9b) Step increment tied to the present salary grade */
  step: number;
  /** (10) Monthly Rate — Present */
  monthly: number;
  /** Position code (masterfile lookup key) */
  poscode: string;
  /** (11) Approved Salary Grade, e.g. "12 S1" */
  approvedGrade?: string;
  /** (12) Approved Monthly Rate */
  approvedMonthly?: number;
  /** (20) Remarks */
  remarks?: string;
  employeeFound: boolean;
  psipopMatched: boolean;
  note?: string;
}

// ── Per-list metadata ─────────────────────────────────────────────────────

export interface PalListMeta {
  id?: string;
  regcode: string;
  divcode: string;
  region_name: string;
  division_name: string;
  agency: string;
  education: string;
  level: string;
  months: number;
  status: string;
  created_by: string;
  updated_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface PalListRecord extends PalListMeta {
  rows: PalRow[];
}

export const DEFAULT_AGENCY = 'DEPARTMENT OF EDUCATION';
export const DEFAULT_EDUCATION = 'Elementary';

/** localStorage key mirroring one division+level sheet (offline fallback). */
export function palLocalKey(regcode: string, divcode: string, level: string): string {
  const code = regcode && divcode ? `${regcode}_${divcode}` : 'all';
  return `pal_rows_${code}_${level ?? 'all'}`;
}

function emptyMeta(scope: {
  regcode: string; divcode: string; region_name: string; division_name: string;
}, level: string | null): PalListMeta {
  return {
    regcode: scope.regcode,
    divcode: scope.divcode,
    region_name: scope.region_name ?? '',
    division_name: scope.division_name ?? '',
    agency: DEFAULT_AGENCY,
    education: level ? (level === 'senior' ? 'Senior High School' : level === 'junior' ? 'Junior High School' : 'Elementary') : DEFAULT_EDUCATION,
    level: level ?? 'all',
    months: 12,
    status: 'draft',
    created_by: '',
    updated_by: '',
  };
}

// ── Save ──────────────────────────────────────────────────────────────────

export async function savePalList(list: PalListRecord): Promise<PalListRecord> {
  const { rows, ...meta } = list;
  let record: PalListRecord = { ...list };

  const existing = await loadPalListByScope(meta.regcode, meta.divcode, meta.level, true);
  if (existing?.id) {
    const { id, rows: _oldRows, created_by, ...patch } = list as unknown as PalListRecord & { created_by?: string };
    const upd = await supabase.from('pal_lists').update({
      ...patch,
      rows,
      updated_by: meta.updated_by || patch.updated_by,
    }).eq('id', existing.id);
    if (upd.data && upd.data.length > 0) record = { ...(upd.data[0] as PalListRecord), rows };
    if (upd.error) throw new Error(`Could not save PAL list: ${upd.error.message}`);
  } else {
    const created = await supabase.from('pal_lists').create({
      ...meta,
      rows,
    });
    if (created.error) throw new Error(`Could not create PAL list: ${created.error.message}`);
    record = created.data as PalListRecord;
  }

  // Mirror to localStorage (offline fallback)
  try {
    localStorage.setItem(palLocalKey(meta.regcode, meta.divcode, meta.level), JSON.stringify(record));
  } catch { /* ignore quota errors */ }
  return record;
}

/** One-time migration: keep reading the old localStorage sheet format after DB sync. */
export function readLocalRows(meta: PalListMeta): PalRow[] | null {
  try {
    const raw = localStorage.getItem(palLocalKey(meta.regcode, meta.divcode, meta.level));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as PalRow[];
    if (parsed && Array.isArray(parsed.rows)) return (parsed as PalListRecord).rows;
  } catch { /* ignore */ }
  return null;
}

// ── Load ──────────────────────────────────────────────────────────────────

async function loadPalListByScope(
  regcode: string,
  divcode: string,
  level: string,
  silent = false,
): Promise<PalListRecord | null> {
  try {
    const q = supabase.from('pal_lists').select('*')
      .eq('regcode', regcode)
      .eq('divcode', divcode)
      .eq('level', level)
      .limit(5);
    const { data } = await q;
    const rec = data && data.length > 0 ? data[0] : null;
    if (!rec) return null;
    let rows: PalRow[] = [];
    const raw = (rec as Record<string, unknown>).rows;
    if (typeof raw === 'string') { try { rows = JSON.parse(raw); } catch { rows = []; } }
    else if (Array.isArray(raw)) rows = raw as PalRow[];
    else rows = [];
    return { ...(rec as PalListRecord), rows };
  } catch (err) {
    if (!silent) console.warn('loadPalListByScope:', err);
    return null;
  }
}

/**
 * Load the sheet for the current division + level. Falls back to the
 * localStorage copy when the DB is unreachable, and seeds from the old
 * localStorage rows format for migrated sessions.
 */
export async function loadPalList(
  scope: { regcode: string; divcode: string; region_name: string; division_name: string },
  level: string | null,
  fallbackRows?: PalRow[],
): Promise<PalListRecord> {
  const meta = emptyMeta(scope, level);
  const dbRec = await loadPalListByScope(meta.regcode, meta.divcode, meta.level);
  if (dbRec) {
    const rows = dbRec.rows.length > 0 ? dbRec.rows : (fallbackRows ?? []);
    const merged: PalListRecord = { ...dbRec, rows, agency: dbRec.agency || DEFAULT_AGENCY };
    if (dbRec.rows.length === 0 && fallbackRows?.length) {
      // First-run upgrade: DB record exists but is empty → persist the legacy rows.
      try { await savePalList({ ...merged, rows: fallbackRows }); } catch { /* ignore */ }
    }
    return merged;
  }
  const localRows = readLocalRows(meta) ?? fallbackRows ?? [];
  const rec: PalListRecord = { ...meta, rows: localRows };
  if (localRows.length > 0) {
    try { await savePalList(rec); } catch { /* ignore */ }
  }
  return rec;
}

export async function deletePalList(regcode: string, divcode: string, level: string): Promise<void> {
  const existing = await loadPalListByScope(regcode, divcode, level, true);
  if (existing?.id) {
    const { error } = await supabase.from('pal_lists').delete().eq('id', existing.id);
    if (error) throw new Error(`Could not delete PAL list: ${error.message}`);
  }
  try { localStorage.removeItem(palLocalKey(regcode, divcode, level)); } catch { /* ignore */ }
}

/** All saved sheets for the current org scope (for a saved-lists browser). */
export async function listSavedPalLists(
  scope: { regcode: string | null; divcode: string | null },
): Promise<PalListRecord[]> {
  try {
    let q = supabase.from('pal_lists').select('*').order('-updated');
    if (scope.regcode && scope.divcode) {
      q = q.eq('regcode', scope.regcode).eq('divcode', scope.divcode);
    }
    const { data, error } = await q;
    if (error) return [];
    return (data as unknown as PalListRecord[]).map((rec) => {
      let rows: PalRow[] = [];
      const raw = (rec as Record<string, unknown>).rows;
      if (typeof raw === 'string') { try { rows = JSON.parse(raw); } catch { rows = []; } }
      else if (Array.isArray(raw)) rows = raw as PalRow[];
      return { ...rec, rows };
    });
  } catch {
    return [];
  }
}

// ── Row arithmetic — mirrors the formulas baked into PAL.xlsx ─────────────

export interface PalComputed {
  /** (13) Sal. Differential = (12) − (10) */
  salDifferential: number;
  /** (14) PHIC = (13) × 2.5% */
  phic: number;
  /** (15) RLIP = (13) × 0.12 */
  rlip: number;
  /** (16) Total Monthly Requirements = (13)+(14)+(15) */
  totalMonthly: number;
  /** (17) Current Year Requirements = (16) × months */
  currentYearReq: number;
  /** (18) MYB + YEB Differential = (10) × months */
  yebDifferential: number;
  /** (19) Total Funding = (17)+(18) */
  totalFunding: number;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

export function computePalRow(row: Pick<PalRow, 'monthly' | 'approvedMonthly'>, months: number): PalComputed {
  const rate = Number(row.monthly) || 0;
  const approved = Number(row.approvedMonthly) || 0;
  const m = r2(approved - rate);
  const n = r2(m * 0.025);
  const o = r2(m * 0.12);
  const p = r2(m + n + o);
  const q = r2(p * months);
  const r = r2(rate * months);
  const s = r2(q + r);
  return { salDifferential: m, phic: n, rlip: o, totalMonthly: p, currentYearReq: q, yebDifferential: r, totalFunding: s };
}