/**
 * Restore Engine — the V3 port of the FoxPro PRESTORE programs.
 *
 * Source lineage (G:\Project\scriviacloudV2\FOXPRO):
 *   PRESTORE.PRG  — the Restore menu
 *     1. Masterfile     → DO PRESTMAS   (PRESTMAS.PRG / legacy RESTMAST.PRG)
 *     2. Deduction file → DO PRESTDED   (PRESTDED.PRG / legacy RESTDEDF.PRG)
 *     3. Other Databases→ DO PRESTOTH   (PRESTOTH.PRG / legacy RESTDBFS.PRG)
 *
 * The FOXPRO flows cloned here, in order:
 *
 *   PRESTMAS  — "Ready to restore Masterfile ? <Y/N>" → drive → diskette count
 *               (ndisk, 1–9).  Disk #1 does COPY FILE dr:mastfile.dbf → replaces
 *               the whole MASTFILE; disks #2–9 do APPEND FROM (appended in order).
 *               Then reports the final reccount().
 *   PRESTDED  — identical flow against dedfile.dbf (DEDFILE).
 *   PRESTOTH  — one file per table, each a COPY FILE that replaces its own
 *               table. DIVTABLE is shared, so its restore replaces the whole
 *               table. Reports "Number of files copied: N".
 *
 * V3 adaptations (stated plainly, matching the SmartImport header comment):
 *   diskettes become staged .DBF files carrying a part number (1 = COPY FILE,
 *   2…9 = APPEND FROM); the per-category clear is kept, so an Elementary
 *   restore replaces only Elementary rows and never touches High School data
 *   (DIVTABLE is shared infrastructure and is replaced whole); PRESTOTH tables
 *   accept exactly one file each.
 */

import { supabase, fetchAll } from '@/lib/pb';
import {
  getSyncFunctions, getClearTableFn,
  type SyncScope, type SyncTableName,
} from '@/lib/syncEngine';
import { SYNC_ORDER, TABLE_TO_DB } from '@/lib/dbfTemplate';
import { inCategory, type PayrollCategory } from '@/lib/categories';

/** A FoxPro diskette, staged as a file: TABLE.DBF (part 1) or TABLE-02…09.DBF. */
export interface StagedRestoreFile {
  fileName: string;
  tableName: SyncTableName;
  part: number;
  bytes: Uint8Array;
  recordCount: number;
}

/** Per-table outcome of a restore program run. */
export interface RestoreTableSummary {
  tableName: SyncTableName;
  /** number of staged files (diskettes) restored for this table */
  files: number;
  /** rows removed by the part-1 COPY FILE replace (null when no clear made sense) */
  cleared: number | null;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  /** final record count after the restore, mirroring FoxPro reccount() */
  reccount: number;
}

/** Options/docs for one Restore menu item (same shape the SmartImport UI uses). */
export interface RestoreOptionDef {
  key: string;
  label: string;
  legacyProgram: string;
  tables: SyncTableName[];
  note: string;
}

/** The Restore menu (PRESTORE.PRG), ported to the tables V3 maintains. */
export const PRESTORE_PROGRAMS: RestoreOptionDef[] = [
  {
    key: 'masterfile', label: 'Masterfile', legacyProgram: 'PRESTMAS', tables: ['MASTFILE'],
    note: 'The first file replaces Employee Records; extra parts are appended in order.',
  },
  {
    key: 'deduction', label: 'Deduction file', legacyProgram: 'PRESTDED', tables: ['DEDFILE'],
    note: 'The first file replaces the deduction file; extra parts are appended in order.',
  },
  {
    key: 'other', label: 'Other Databases', legacyProgram: 'PRESTOTH',
    tables: ['DIVTABLE', 'STNTABLE', 'INCLUDED', 'EXCLUDED', 'PYENT', 'PYENT1', 'PYENT2'],
    note: 'One file per table — each replaces its own table. DIVTABLE is shared, so its restore replaces the whole table.',
  },
];

/** FoxPro reads at most 9 diskettes (ndisk 1–9). */
export const FOXPRO_MAX_PARTS = 9;

export interface RestoreProgramResult {
  ok: boolean;
  optionLabel: string;
  legacyProgram: string;
  tables: RestoreTableSummary[];
  fileCount: number;
  recordsCopied: number;
  message: string;
}

export interface RestoreContext {
  category: PayrollCategory;
  scope?: SyncScope | null;
  periodName?: string | null;
}

/** Group staged files by table, sorting each set by disk number (part 1 first). */
function groupByTable(staged: StagedRestoreFile[]): Map<SyncTableName, StagedRestoreFile[]> {
  const byTable = new Map<SyncTableName, StagedRestoreFile[]>();
  for (const s of staged) {
    const list = byTable.get(s.tableName) ?? [];
    list.push(s);
    byTable.set(s.tableName, list);
  }
  for (const parts of byTable.values()) parts.sort((a, b) => a.part - b.part);
  return byTable;
}

/**
 * Validate a table's staged parts against the FoxPro disk rules:
 *  - at most 9 diskettes;
 *  - each disk number appears once;
 *  - when multiple parts are staged, part 1 (the COPY FILE replace) is present.
 *  - PRESTOTH tables take exactly one file (COPY FILE replaces the whole table).
 */
function validateParts(optionKey: string, table: SyncTableName, parts: StagedRestoreFile[]): void {
  if (parts.length > FOXPRO_MAX_PARTS) {
    throw new Error(`${table}: ${parts.length} parts staged — a FoxPro restore reads at most 9 diskettes.`);
  }
  const seen = new Set<number>();
  for (const p of parts) {
    if (seen.has(p.part) || parts.filter((x) => x.part === p.part).length > 1) {
      throw new Error(`${table}: duplicate part numbers staged — each disk number may appear once.`);
    }
    seen.add(p.part);
  }
  if (parts.length > 1 && parts[0].part !== 1) {
    throw new Error(`${table}: part 1 is missing — the restore needs the first file (it replaces the table) before appending the rest.`);
  }
  if (optionKey === 'other' && parts.length > 1) {
    throw new Error(`${table}: this restore option takes one file per table — each replaces its whole table (no appended parts).`);
  }
}

/**
 * Part-1 COPY FILE semantics (replace): DIVTABLE is shared infrastructure, so
 * its restore replaces the whole table; every other table is cleared per
 * payroll category so an Elementary restore can never touch High School data.
 */
async function copyFileReplace(table: SyncTableName, category: PayrollCategory): Promise<number | null> {
  if (table === 'DIVTABLE') {
    const idRows = await fetchAll<{ id: string }>(() => supabase.from('dbf_divtable').select('id'));
    const ids = idRows.map((r) => r.id);
    for (let k = 0; k < ids.length; k += 60) {
      const { error: delErr } = await supabase.from('dbf_divtable').delete().in('id', ids.slice(k, k + 60));
      if (delErr) throw new Error(`${table}: cannot replace existing rows — ${delErr.message}`);
    }
    return ids.length;
  }
  const clearTable = getClearTableFn(category);
  const c = await clearTable(table);
  if (c.error) throw new Error(`${table}: cannot replace existing rows — ${c.error}`);
  return c.deleted ?? 0;
}

/**
 * Final record count for a table after the restore — mirrors FoxPro reccount().
 * DIVTABLE is counted whole; all other tables are counted within the restore's
 * payroll category (the same scope the per-category replace used).
 */
async function reccount(table: SyncTableName, category: PayrollCategory): Promise<number> {
  const dbTable = TABLE_TO_DB[table];
  if (!dbTable) return 0;
  try {
    if (table === 'DIVTABLE') {
      const rows = await fetchAll<{ id: string }>(() => supabase.from(dbTable).select('id'));
      return rows.length;
    }
    const rows = await fetchAll<{ stacode?: string | null }>(() => supabase.from(dbTable).select('stacode'));
    return rows.filter((r) => inCategory(r.stacode ?? '', category)).length;
  } catch {
    return 0;
  }
}

/**
 * Run one Restore menu item (PRESTMAS / PRESTDED / PRESTOTH) against its staged
 * files. Part 1 COPY FILEs (replaces the table), parts 2–9 APPEND FROM in disk
 * order via the table's sync routine, then per-table reccount() is reported.
 */
export async function runRestoreProgram(
  optionKey: string,
  staged: StagedRestoreFile[],
  ctx: RestoreContext,
): Promise<RestoreProgramResult> {
  const option = PRESTORE_PROGRAMS.find((o) => o.key === optionKey);
  if (!option) throw new Error(`Unknown restore option: ${optionKey}`);
  if (staged.length === 0) throw new Error('No files staged for restore.');

  const byTable = groupByTable(staged);
  for (const [table, parts] of byTable) {
    if (!option.tables.includes(table)) {
      throw new Error(`${parts[0].fileName}: ${table} is not restored by ${option.label} — use the matching restore option.`);
    }
    validateParts(optionKey, table, parts);
  }

  const syncFns = getSyncFunctions(ctx.category);
  const summaries: RestoreTableSummary[] = [];
  let fileCount = 0;
  let recordsCopied = 0;
  const ordered = [...byTable.keys()].sort((a, b) => SYNC_ORDER.indexOf(a) - SYNC_ORDER.indexOf(b));

  for (const table of ordered) {
    const parts = byTable.get(table)!;
    let cleared: number | null = null;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errorCount = 0;

    for (let i = 0; i < parts.length; i++) {
      // FOXPRO part 1 → COPY FILE (replace the table); parts 2–9 → APPEND FROM
      if (i === 0) cleared = await copyFileReplace(table, ctx.category);
      const r = await syncFns[table](parts[i].bytes, ctx.scope ?? null, ctx.periodName ?? null);
      const anyR = r as unknown as { inserted?: number; imported?: number; updated?: number; skipped?: number; errors?: string[] };
      inserted += anyR.inserted ?? anyR.imported ?? 0;
      updated += anyR.updated ?? 0;
      skipped += anyR.skipped ?? 0;
      errorCount += anyR.errors?.length ?? 0;
      fileCount += 1;
    }
    recordsCopied += inserted + updated;
    summaries.push({
      tableName: table,
      files: parts.length,
      cleared,
      inserted,
      updated,
      skipped,
      errors: errorCount,
      reccount: await reccount(table, ctx.category),
    });
  }

  const failed = summaries.some((s) => s.errors > 0);
  const message = optionKey === 'other'
    ? `Restore complete. Number of files copied: ${fileCount}.`
    : `Restore complete. Number of records copied: ${recordsCopied.toLocaleString()}.`;

  return {
    ok: !failed,
    optionLabel: option.label,
    legacyProgram: option.legacyProgram,
    tables: summaries,
    fileCount,
    recordsCopied,
    message,
  };
}

/** PRESTMAS — restore the Masterfile (first file replaces, extras append). */
export function runPrestmas(staged: StagedRestoreFile[], ctx: RestoreContext): Promise<RestoreProgramResult> {
  return runRestoreProgram('masterfile', staged, ctx);
}

/** PRESTDED — restore the Deduction file (first file replaces, extras append). */
export function runPrestded(staged: StagedRestoreFile[], ctx: RestoreContext): Promise<RestoreProgramResult> {
  return runRestoreProgram('deduction', staged, ctx);
}

/** PRESTOTH — restore the other databases (one file per table, whole replace). */
export function runPrestoth(staged: StagedRestoreFile[], ctx: RestoreContext): Promise<RestoreProgramResult> {
  return runRestoreProgram('other', staged, ctx);
}