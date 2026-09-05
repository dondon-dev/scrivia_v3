import { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Plus, Search, Trash2, Download, X, AlertTriangle, CheckCircle2, Loader2,
  ListTree, RefreshCw, Info, UserX,
} from 'lucide-react';
import { supabase } from '@/lib/pb';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { usePositions } from '@/lib/usePositions';
import { loadPlantillaPositions, type PlantillaPosition } from '@/lib/plantilla';
import type { Employee } from '@/types/payroll';
import { currency } from '@/lib/reports';

// ── Row model ─────────────────────────────────────────────────────────────

interface PalRow {
  uid: string;
  empno: string;
  empId?: string;
  /** (1) Item No. per latest PSIPOP */
  itemNumber: string;
  /** fiscal year / basis of the PSIPOP item that supplied itemNumber */
  itemYear?: number;
  /** (5) Name of Incumbent */
  incumbent: string;
  /** (6) Position Title */
  positionTitle: string;
  /** (9) Salary Grade, (step increment) */
  grade: number;
  step: number;
  /** (10) Monthly Rate */
  monthly: number;
  /** position code from the employee masterfile (used as lookup key) */
  poscode: string;
  employeeFound: boolean;
  psipopMatched: boolean;
  note?: string;
}

const fmtGradeStep = (g: number, s: number) => (g > 0 ? `${g}${s > 0 ? ` S${s}` : ''}` : '');

// ── Name matching helpers ─────────────────────────────────────────────────
// PSIPOP incumbents are stored as "SURNAME, GIVEN NAME[S] [MIDDLE]". Employee
// masterfile rows keep lname/fname/mi separately.  We normalise both sides and
// compare surnames exactly, then score the given-name token overlap so minor
// middle-name differences (initial vs full maiden name) still match.

function normText(v: unknown): string {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNameParts(full: string): { last: string; given: string[] } {
  const [lastRaw = '', ...givenRest] = String(full ?? '').split(',').map((s) => s.trim());
  return { last: normText(lastRaw), given: normText(givenRest.join(' ')).split(' ').filter(Boolean) };
}

function employeeNameTokens(e: Employee): { last: string; given: string[] } {
  const last = normText(e.lname || e.last_name);
  const given = normText(`${e.fname || e.first_name || ''} ${e.mi || e.middle_name || ''}`).split(' ').filter(Boolean);
  return { last, given };
}

function scoreMatch(itemName: string, emp: { last: string; given: string[] }): number {
  const it = splitNameParts(itemName);
  if (!it.last || it.last !== emp.last) return 0;
  if (it.given.length === 0) return 1;
  const empGiven = emp.given.filter(Boolean);
  if (empGiven.length === 0) return 1;
  let common = 0;
  for (const t of empGiven) {
    if (t.length === 1) continue; // single middle initial – weak evidence
    if (it.given.includes(t)) common++;
  }
  if (common === 0) return 1;
  const fullNorm = normText(itemName).replace(/,/g, '');
  const empNorm = [emp.last, ...empGiven].join(' ');
  if (fullNorm === empNorm) return 10_000 + common; // exact – always wins
  return 100 + common;
}

// ── PSIPOP index (module-level cache per mount) ───────────────────────────

let cachedPsipop: { items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> } | null = null;

async function loadPsipopIndex(): Promise<{ items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> }> {
  if (cachedPsipop) return cachedPsipop;
  // Same loader the Plantilla Intelligence Center uses: PocketBase first,
  // then the localStorage fallback (deped_plantilla_positions) that holds the
  // imported PSIPOP when the collection has not been synced yet.
  let all: PlantillaPosition[] = [];
  try {
    all = await loadPlantillaPositions();
  } catch {
    all = [];
  }
  const filled = all.filter((p) => /filled/i.test(String(p.position_status ?? '')));

  // Latest PSIPOP = the newest fiscal year present; if none is stamped,
  // fall back to the newest year parsed from the item number (-YYYY suffix).
  const years = new Set<number>();
  for (const p of filled) {
    if (p.fiscal_year) years.add(Number(p.fiscal_year));
  }
  if (years.size === 0) {
    for (const p of filled) {
      const m = String(p.item_number ?? '').match(/-(19|20)\d{2}$/);
      if (m) years.add(Number(m[1]));
    }
  }
  const latestYear = years.size > 0 ? Math.max(...years) : null;
  const latest = latestYear != null ? filled.filter((p) => Number(p.fiscal_year) === latestYear || (!p.fiscal_year && String(p.item_number ?? '').endsWith(String(latestYear)))) : filled;

  const byName = new Map<string, PlantillaPosition[]>();
  for (const p of latest) {
    const last = splitNameParts(p.employee_name || '').last;
    if (!last) continue;
    const arr = byName.get(last) ?? [];
    arr.push(p);
    byName.set(last, arr);
  }
  cachedPsipop = { items: latest, year: latestYear, byName };
  return cachedPsipop;
}

function pickPsipopItem(emp: Employee, index: { byName: Map<string, PlantillaPosition[]> }): { item: PlantillaPosition | null; ambiguous: boolean } {
  const tokens = employeeNameTokens(emp);
  const candidates = index.byName.get(tokens.last) ?? [];
  let best: PlantillaPosition | null = null;
  let bestScore = 0;
  let ties = 0;
  for (const c of candidates) {
    const score = scoreMatch(c.employee_name || '', tokens);
    if (score > bestScore) {
      bestScore = score;
      best = c;
      ties = 1;
    } else if (score === bestScore && score > 0) {
      ties++;
    }
  }
  if (!best || bestScore === 0) return { item: null, ambiguous: false };
  if (bestScore < 100 && ties > 1) return { item: null, ambiguous: true };
  return { item: best, ambiguous: false };
}

// ── Employee lookup by EMPNO (within the selected division scope) ─────────

async function findEmployeeByEmpno(empno: string, scope: { scopedDivisionIds: string[] | null; scopedCodes: { regcode: string; divcode: string }[] | null }): Promise<Employee | null> {
  const v = String(empno ?? '').trim();
  if (!v) return null;
  let rows: Employee[] = [];
  try {
    const a = await supabase.from('employees').select('*').eq('empno', v).limit(10);
    rows = (a.data as Employee[]) ?? [];
    if (rows.length === 0) {
      const b = await supabase.from('employees').select('*').eq('employee_number', v).limit(10);
      rows = (b.data as Employee[]) ?? [];
    }
  } catch {
    return null;
  }
  const scoped = rows.filter((r) => matchesOrgScope(r, scope));
  return scoped[0] ?? null;
}

function incumbentName(e: Employee): string {
  const l = String(e.lname || e.last_name || '').trim();
  const f = String(e.fname || e.first_name || '').trim();
  const m = String(e.mi || e.middle_name || '').trim();
  return [l, [f, m].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// ── View ──────────────────────────────────────────────────────────────────

export default function PlantillaAllocationList() {
  const { scopedDivisionIds, scopedCodes, selectedDivision, selectedRegion, divisions } = useOrg();
  const { lookup: lookupPosition } = usePositions();

  const [rows, setRows] = useState<PalRow[]>([]);
  const [quickEmpno, setQuickEmpno] = useState('');
  const [resolving, setResolving] = useState(false);
  const [psipop, setPsipop] = useState<{ items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> } | null>(null);
  const [psipopLoading, setPsipopLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<PalRow | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);

  const scope = useMemo(() => ({ scopedDivisionIds, scopedCodes }), [scopedDivisionIds, scopedCodes]);

  // Division-scoped persistence key (per PAL run)
  const lsKey = useMemo(() => {
    const code = scopedCodes?.[0] ? `${scopedCodes[0].regcode}_${scopedCodes[0].divcode}` : 'all';
    return `pal_rows_${code}`;
  }, [scopedCodes]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(lsKey);
      if (saved) {
        const parsed = JSON.parse(saved) as PalRow[];
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch { /* ignore corrupt storage */ }
  }, [lsKey]);

  useEffect(() => {
    try {
      if (rows.length > 0) localStorage.setItem(lsKey, JSON.stringify(rows));
      else localStorage.removeItem(lsKey);
    } catch { /* storage full / private mode */ }
  }, [rows, lsKey]);

  useEffect(() => {
    setPsipopLoading(true);
    cachedPsipop = null;
    loadPsipopIndex()
      .then((idx) => setPsipop(idx))
      .catch(() => setPsipop({ items: [], year: null, byName: new Map() }))
      .finally(() => setPsipopLoading(false));
  }, []);

  // Header agency info
  const divisionLabel = useMemo(() => {
    if (selectedDivision) {
      return {
        division: `${selectedDivision.division_name ?? ''}${selectedDivision.division_code ? ` [${selectedDivision.division_code}]` : ''}`,
        region: selectedRegion?.region_name ? `${selectedRegion.region_name}${selectedRegion.region_code ? ` [${selectedRegion.region_code}]` : ''}` : '',
      };
    }
    if (scopedCodes && scopedCodes.length === 1) {
      const d = divisions.find((x) => x.division_code === scopedCodes[0].divcode);
      return { division: d?.division_name ?? scopedCodes[0].divcode, region: '' };
    }
    return { division: 'All Divisions', region: '' };
  }, [selectedDivision, selectedRegion, divisions, scopedCodes]);

  const addBlankRow = () => {
    const row: PalRow = {
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      empno: '', incumbent: '', positionTitle: '', itemNumber: '',
      grade: 0, step: 0, monthly: 0, poscode: '', employeeFound: false, psipopMatched: false,
      note: 'Encode EMPNO to auto-fill from Employee Records & PSIPOP.',
    };
    setRows((r) => [...r, row]);
    setMessage(null);
  };

  async function resolveEmpno(raw: string): Promise<void> {
    const v = String(raw ?? '').trim();
    if (!v) return;
    setResolving(true);
    setMessage(null);
    const base: PalRow = {
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      empno: v, incumbent: '', positionTitle: '', itemNumber: '',
      grade: 0, step: 0, monthly: 0, poscode: '', employeeFound: false, psipopMatched: false,
    };
    const emp = await findEmployeeByEmpno(v, scope);
    if (!emp) {
      base.note = `EMPNO ${v} was not found in the current division's Employee Records.`;
      setRows((r) => [...r, base]);
      setResolving(false);
      setQuickEmpno('');
      quickRef.current?.focus();
      return;
    }
    base.employeeFound = true;
    base.empId = emp.id;
    base.incumbent = incumbentName(emp);
    base.grade = Number(emp.grade) || 0;
    base.step = Number(emp.step) || 0;
    base.monthly = Number(emp.basic) || 0;
    base.poscode = String(emp.poscode || emp.position || '');

    // Position Title (6): Position Management first (masterfile code → title),
    // then the matched PSIPOP item, then the raw code as a fallback.
    const pos = lookupPosition(base.poscode);
    base.positionTitle = pos?.position_title || pos?.position_name || '';

    // Item No. (1) from the latest PSIPOP by incumbent-name match.
    if (psipop) {
      const { item, ambiguous } = pickPsipopItem(emp, psipop);
      if (item) {
        base.itemNumber = item.item_number || '';
        base.itemYear = Number(item.fiscal_year) || psipop.year || undefined;
        base.psipopMatched = true;
        if (!base.positionTitle) base.positionTitle = item.position_title || '';
      } else if (ambiguous) {
        base.note = `Multiple latest-PSIPOP items match "${base.incumbent}" — search & pick the item.`;
      } else {
        base.note = `No filled latest-PSIPOP item matched "${base.incumbent}" — search to assign, or leave Item No. blank.`;
      }
    } else {
      base.note = 'PSIPOP not loaded yet — Employee fields filled, Item No. pending.';
    }
    setRows((r) => [...r, base]);
    setResolving(false);
    setQuickEmpno('');
    quickRef.current?.focus();
  }

  function removeRow(uid: string) {
    setRows((r) => r.filter((x) => x.uid !== uid));
  }

  function clearRows() {
    if (!confirm('Clear all encoded rows on this list?')) return;
    setRows([]);
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const filled = rows.filter((r) => r.employeeFound);
    const withItem = rows.filter((r) => r.psipopMatched && r.itemNumber);
    const missingPsipop = rows.filter((r) => r.employeeFound && !r.psipopMatched);
    const notFound = rows.filter((r) => !r.employeeFound);
    return { total, filled: filled.length, withItem: withItem.length, missingPsipop: missingPsipop.length, notFound: notFound.length };
  }, [rows]);

  async function handleQuickEncode() {
    if (!quickEmpno.trim() || resolving) return;
    await resolveEmpno(quickEmpno);
  }

  // ── PSIPOP manual picker (fallback when auto-match fails) ───────────────

  const pickerCandidates = useMemo(() => {
    if (!psipop || !pickerFor) return [];
    const q = pickerQuery.trim().toUpperCase();
    const list = psipop.items;
    if (!q) return list.slice(0, 200);
    return list
      .filter((p) =>
        String(p.item_number ?? '').toUpperCase().includes(q) ||
        String(p.employee_name ?? '').toUpperCase().includes(q) ||
        String(p.position_title ?? '').toUpperCase().includes(q) ||
        String(p.organizational_unit ?? p.school_name ?? '').toUpperCase().includes(q),
      )
      .slice(0, 200);
  }, [psipop, pickerFor, pickerQuery]);

  function applyPickedItem(uid: string, item: PlantillaPosition) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, itemNumber: item.item_number || '', itemYear: Number(item.fiscal_year) || psipop?.year || undefined, psipopMatched: true };
        if (!next.positionTitle) next.positionTitle = item.position_title || '';
        if (!next.incumbent) next.incumbent = item.employee_name || '';
        next.note = undefined;
        return next;
      }),
    );
    setPickerFor(null);
    setPickerQuery('');
  }

  // ── Excel export (subset that maps 1:1 onto the DBM-DepEd Annex R-1 PAL) ─

  async function exportExcel() {
    const exportable = rows.filter((r) => r.employeeFound || r.itemNumber || r.incumbent);
    if (exportable.length === 0) {
      setMessage({ tone: 'warn', text: 'Nothing to export yet — encode at least one EMPNO.' });
      return;
    }
    setMessage(null);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SCRIVIA CLOUD';
    wb.created = new Date();
    const sheet = wb.addWorksheet('Plantilla Allocation List', { views: [{ state: 'frozen', ySplit: 4 }] });

    const NAVY = 'FF1B3A5C';
    // Title block
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'PLANTILLA ALLOCATION LIST';
    sheet.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    const info = [
      `Agency: Department of Education${divisionLabel.region ? ` — ${divisionLabel.region}` : ''}`,
      `Division: ${divisionLabel.division}`,
      `Basis: Employee Records (masterfile) & ${psipop ? `latest PSIPOP (${psipop.year ? `FY ${psipop.year}` : 'loaded'}, ${psipop.items.length.toLocaleString()} filled items)` : 'PSIPOP (not loaded)'}`,
    ];
    info.forEach((txt, i) => {
      const row = i + 2;
      sheet.mergeCells(`A${row}:F${row}`);
      const cell = sheet.getCell(`A${row}`);
      cell.value = txt;
      cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    });

    // Headers mirroring the Annex columns (template numbering preserved)
    const headers: { label: string; width: number }[] = [
      { label: 'EMPNO', width: 11 },
      { label: 'Item No. (per latest PSIPOP)\n(1)', width: 30 },
      { label: 'Name of Incumbent\n(5)', width: 32 },
      { label: 'Position Title\n(6)', width: 28 },
      { label: 'Salary Grade with Step Increment\n(9)', width: 18 },
      { label: 'Monthly Rate\n(10)', width: 15 },
    ];
    const headerRow = sheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.label;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: NAVY } }, left: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } }, right: { style: 'thin', color: { argb: NAVY } } };
      sheet.getColumn(i + 1).width = h.width;
    });
    headerRow.height = 34;

    exportable.forEach((r, idx) => {
      const row = sheet.addRow({
        empno: r.empno,
        item: r.itemNumber,
        name: r.incumbent,
        title: r.positionTitle,
        sgstep: fmtGradeStep(r.grade, r.step),
        monthly: r.monthly,
      });
      row.font = { name: 'Calibri', size: 10 };
      row.alignment = { vertical: 'middle' };
      row.height = 18;
      if (idx % 2 === 1) {
        row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FA' } }; });
      }
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    });

    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

    const buffer = await wb.xlsx.writeBuffer();
    const fname = `Plantilla_Allocation_List_${(divisionLabel.division.replace(/[^A-Z0-9]+/gi, '_') || 'Division')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    setMessage({ tone: 'ok', text: `Exported ${exportable.length} row${exportable.length === 1 ? '' : 's'} to ${fname}` });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
            <ListTree className="w-5 h-5 text-emerald-600" />
            Plantilla Allocation List
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Department of Education — {divisionLabel.division}{divisionLabel.region ? ` · ${divisionLabel.region}` : ''}. Type an EMPNO; columns (1), (5), (6), (9) &amp; (10) auto-fill from Employee Records and the latest PSIPOP.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearRows} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <button onClick={exportExcel} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button onClick={addBlankRow} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>
      </div>

      {/* PSIPOP availability banner */}
      {psipopLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading latest PSIPOP items…
        </div>
      ) : !psipop || psipop.items.length === 0 ? (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            No filled PSIPOP positions are loaded in this PocketBase (<code className="font-mono">plantilla_positions</code> is empty). Employee name, SG/step &amp; monthly rate will still auto-fill from Employee Records; <strong>Item No. (1)</strong> appears once you import the latest PSIPOP (Plantilla Intelligence Center) and re-open this page.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Latest PSIPOP basis: {psipop.year ? `FY ${psipop.year} · ` : ''}{psipop.items.length.toLocaleString()} filled items — Item No. (1) auto-matches by incumbent name.
        </div>
      )}

      {/* Position Management availability note */}
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <Info className="w-4 h-4 shrink-0" />
        Position Title (6) resolves via Position Management masterfile (Position code → title), falling back to the matched PSIPOP item.
      </div>

      {message && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${message.tone === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : message.tone === 'err' ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
          <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setMessage(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Quick EMPNO encoder */}
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleQuickEncode(); }}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={quickRef}
            value={quickEmpno}
            onChange={(e) => setQuickEmpno(e.target.value)}
            placeholder="Type EMPNO, press Enter to encode…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
        </div>
        <button type="submit" disabled={resolving || !quickEmpno.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Encode
        </button>
      </form>

      {/* Stats */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span><strong className="text-slate-700 dark:text-white">{stats.total}</strong> row{stats.total === 1 ? '' : 's'}</span>
        <span><strong className="text-slate-700 dark:text-white">{stats.filled}</strong> employee{stats.filled === 1 ? '' : 's'} matched</span>
        <span className="text-emerald-600"><strong>{stats.withItem}</strong> with PSIPOP item</span>
        {stats.missingPsipop > 0 && <span className="text-amber-600"><strong>{stats.missingPsipop}</strong> missing item no.</span>}
        {stats.notFound > 0 && <span className="text-rose-600"><strong>{stats.notFound}</strong> EMPNO not found</span>}
      </div>

      {/* Rows table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <ListTree className="w-10 h-10 mx-auto mb-3 text-slate-200 dark:text-slate-700" />
            <p className="text-sm text-slate-400">No rows yet. Type an EMPNO above (or click Add Row) to start encoding.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2.5 font-medium w-32">EMPNO</th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[16rem]">Item No. (per latest PSIPOP) <span className="text-slate-400 normal-case">(1)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium">Name of Incumbent <span className="text-slate-400 normal-case">(5)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium">Position Title <span className="text-slate-400 normal-case">(6)</span></th>
                  <th className="text-center px-3 py-2.5 font-medium">SG/Step <span className="text-slate-400 normal-case">(9)</span></th>
                  <th className="text-right px-3 py-2.5 font-medium">Monthly Rate <span className="text-slate-400 normal-case">(10)</span></th>
                  <th className="text-right px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lookupHint = r.employeeFound && !r.psipopMatched;
                  return (
                    <tr key={r.uid} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{r.empno || '—'}</span>
                        {r.employeeFound && r.empId && (
                          <button className="ml-1.5 align-middle" title="Remove row" onClick={() => removeRow(r.uid)}>
                            <X className="w-3.5 h-3.5 text-slate-300 hover:text-rose-500" />
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.itemNumber ? (
                          <button onClick={() => setPickerFor(r)} className="text-left font-mono text-[11px] leading-tight text-blue-700 dark:text-blue-300 hover:underline" title="Click to change PSIPOP item">
                            {r.itemNumber}
                            {r.itemYear ? <span className="block text-[10px] text-slate-400">FY {r.itemYear}</span> : null}
                          </button>
                        ) : (
                          <button onClick={() => r.employeeFound ? setPickerFor(r) : undefined} disabled={!r.employeeFound}
                            className={`inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-1 border transition-colors ${lookupHint ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-slate-400 border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                            <Search className="w-3 h-3" /> Assign item
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.incumbent ? (
                          <span className="font-medium text-slate-800 dark:text-slate-100 text-[13px]">{r.incumbent}</span>
                        ) : r.employeeFound ? (
                          <span className="text-slate-400 text-xs">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><UserX className="w-3.5 h-3.5" /> not found</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-slate-700 dark:text-slate-200">{r.positionTitle || <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}</td>
                      <td className="px-3 py-2 text-center text-[13px]">{r.grade > 0 ? fmtGradeStep(r.grade, r.step) : '—'}</td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums">{r.monthly > 0 ? currency(r.monthly) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeRow(r.uid)} className="inline-flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md px-2 py-1 transition-colors" title="Remove">
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.some((r) => r.note) && (
              <div className="px-3 pb-3 pt-1 space-y-1">
                {rows.filter((r) => r.note).map((r) => (
                  <p key={r.uid} className="text-[11px] text-slate-400">
                    <span className="font-mono font-semibold text-slate-500">{r.empno}</span> — {r.note}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PSIPOP picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Assign PSIPOP Item</h3>
                <p className="text-[11px] text-slate-500">
                  {pickerFor.incumbent ? `${pickerFor.incumbent} · EMPNO ${pickerFor.empno}` : `EMPNO ${pickerFor.empno}`}
                  {psipop?.year ? ` · latest PSIPOP FY ${psipop.year}` : ''}
                </p>
              </div>
              <button onClick={() => setPickerFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input autoFocus value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search item no., incumbent name, or position title…" className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
              </div>
            </div>
            <div className="max-h-[46vh] overflow-y-auto">
              {pickerCandidates.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-slate-300" />
                  No PSIPOP items match — try a different search.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {pickerCandidates.map((p) => (
                      <tr key={p.id} onClick={() => applyPickedItem(pickerFor.uid, p)}
                        className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20 transition-colors">
                        <td className="px-4 py-2.5 align-top">
                          <p className="font-mono text-[11px] text-blue-700 dark:text-blue-300 leading-tight">{p.item_number}</p>
                          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.school_name || p.organizational_unit || ''}</p>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{p.employee_name || '—'}</p>
                          <p className="text-[11px] text-slate-500">{p.position_title} · SG {p.salary_grade}{p.salary_step ? ` S${p.salary_step}` : ''}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top whitespace-nowrap text-[11px] text-slate-400">
                          {p.fiscal_year ? `FY ${p.fiscal_year}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-700">
              {psipop ? `${pickerCandidates.length === 200 && pickerQuery ? 'Showing first 200 of ' : ''}${psipop.items.length.toLocaleString()} filled items from the latest PSIPOP.` : 'PSIPOP not loaded.'}
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-300 dark:text-slate-600">Rows are saved locally for this division ({lsKey}) until you clear them or export. Column numbers refer to the DBM-DepEd Annex R-1 PAL template.</p>
    </div>
  );
}
