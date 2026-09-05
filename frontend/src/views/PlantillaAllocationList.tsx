import { useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  Plus, Search, Trash2, Download, X, AlertTriangle, CheckCircle2, Loader2,
  ListTree, RefreshCw, Info, UserX, UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/pb';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { usePositions } from '@/lib/usePositions';
import { loadPlantillaPositions, type PlantillaPosition } from '@/lib/plantilla';
import type { Employee } from '@/types/payroll';
import { currency } from '@/lib/reports';
import { usePagination, Pagination } from '@/components/Pagination';

// ── School-level sub-menus (STACODE ranges) ────────────────────────────────

export type PalLevel = 'elementary' | 'junior' | 'senior';

export const PAL_LEVELS: Record<PalLevel, { label: string; short: string; range: [number, number] }> = {
  elementary: { label: 'Elementary', short: 'ELEM', range: [1, 95] },
  junior: { label: 'Junior High School', short: 'JHS', range: [500, 699] },
  senior: { label: 'Senior High School', short: 'SHS', range: [700, 701] },
};

export const PAL_LEVEL_ITEMS: { key: PalLevel; label: string; short: string }[] = [
  { key: 'elementary', label: 'Elementary', short: 'ELEM' },
  { key: 'junior', label: 'Junior High School', short: 'JHS' },
  { key: 'senior', label: 'Senior High School', short: 'SHS' },
];

function stacodeNumber(v: unknown): number | null {
  const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function inStacodeRange(v: unknown, range: [number, number] | null): boolean {
  if (!range) return true;
  const n = stacodeNumber(v);
  if (n == null) return false;
  return n >= range[0] && n <= range[1];
}

// ── Row model ─────────────────────────────────────────────────────────────

interface PalRow {
  uid: string;
  empno: string;
  empId?: string;
  itemNumber: string;
  itemYear?: number;
  incumbent: string;
  positionTitle: string;
  grade: number;
  step: number;
  monthly: number;
  poscode: string;
  /** Organizational code per PSIPOP (column B) */
  orgCode?: string;
  /** DepEd Approved Position (column G/7) — user fills manually */
  approvedPosition?: string;
  /** Approved Salary Grade (column K/11) — auto-filled from Position Management */
  approvedGrade?: string;
  /** Approved Monthly Rate (column L/12) — auto-filled from Position Management */
  approvedMonthly?: number;
  employeeFound: boolean;
  psipopMatched: boolean;
  note?: string;
}

const fmtGradeStep = (g: number, s: number) => (g > 0 ? `${g}${s > 0 ? ` S${s}` : ''}` : '');

// The DBM-DepEd PAL template fits 6 employees per printed page.
const PAGE_SIZE = 6;

// ── New Employee (worksheet-local) form ────────────────────────────────────

interface NewEmpForm {
  empno: string;
  itemNumber: string;
  lname: string;
  fname: string;
  mi: string;
  poscode: string;
  positionTitle: string;
  grade: number;
  step: number;
  monthly: number;
  orgCode: string;
  /** DepEd Approved Position (column G/7) — from Position Management */
  approvedPosition: string;
  /** Approved Salary Grade (column K/11) — from Position Management, e.g. "12 S1" */
  approvedGrade: string;
  /** Approved Step (sub-slot of K) */
  approvedStep: string;
  /** Approved Monthly Rate (column L/12) — from Position Management */
  approvedMonthly: number;
}

function emptyNewEmp(): NewEmpForm {
  return { empno: '', itemNumber: '', lname: '', fname: '', mi: '', poscode: '', positionTitle: '', grade: 0, step: 1, monthly: 0, orgCode: '', approvedPosition: '', approvedGrade: '', approvedStep: '', approvedMonthly: 0 };
}

// ── Name matching helpers ─────────────────────────────────────────────────

function normText(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9Ñ]/g, ' ').replace(/\s+/g, ' ').trim();
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
  for (const t of empGiven) { if (t.length === 1) continue; if (it.given.includes(t)) common++; }
  if (common === 0) return 1;
  const fullNorm = normText(itemName).replace(/,/g, '');
  const empNorm = [emp.last, ...empGiven].join(' ');
  if (fullNorm === empNorm) return 10_000 + common;
  return 100 + common;
}

// ── PSIPOP index ──────────────────────────────────────────────────────────

let cachedPsipop: { items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> } | null = null;

async function loadPsipopIndex() {
  if (cachedPsipop) return cachedPsipop;
  let all: PlantillaPosition[] = [];
  try { all = await loadPlantillaPositions(); } catch { all = []; }
  const filled = all.filter((p) => /filled/i.test(String(p.position_status ?? '')));
  const years = new Set<number>();
  for (const p of filled) { if (p.fiscal_year) years.add(Number(p.fiscal_year)); }
  if (years.size === 0) {
    for (const p of filled) { const m = String(p.item_number ?? '').match(/-(19|20)\d{2}$/); if (m) years.add(Number(m[1])); }
  }
  const latestYear = years.size > 0 ? Math.max(...years) : null;
  const latest = latestYear != null ? filled.filter((p) => Number(p.fiscal_year) === latestYear || (!p.fiscal_year && String(p.item_number ?? '').endsWith(String(latestYear)))) : filled;
  const byName = new Map<string, PlantillaPosition[]>();
  for (const p of latest) {
    const last = splitNameParts(p.employee_name || '').last;
    if (!last) continue;
    const arr = byName.get(last) ?? []; arr.push(p); byName.set(last, arr);
  }
  cachedPsipop = { items: latest, year: latestYear, byName };
  return cachedPsipop;
}

function pickPsipopItem(emp: Employee, index: { byName: Map<string, PlantillaPosition[]> }) {
  const tokens = employeeNameTokens(emp);
  const candidates = index.byName.get(tokens.last) ?? [];
  let best: PlantillaPosition | null = null; let bestScore = 0; let ties = 0;
  for (const c of candidates) {
    const score = scoreMatch(c.employee_name || '', tokens);
    if (score > bestScore) { bestScore = score; best = c; ties = 1; }
    else if (score === bestScore && score > 0) ties++;
  }
  if (!best || bestScore === 0) return { item: null, ambiguous: false };
  if (bestScore < 100 && ties > 1) return { item: null, ambiguous: true };
  return { item: best, ambiguous: false };
}

/**
 * Org. Code (2) = the school/facility code from the PSIPOP header
 * (e.g. '1801.0010' from '1801.0010 BUBUYAN INTEGRATED SCHOOL'). Deliberately
 * does NOT fall back to the item's AREA code — that is a different code system
 * and would put a wrong value into the PAL. School codes look like
 * 'NNNN.NNNN' (4 digits, dot, 4 digits); anything else is treated as an area
 * code and dropped, so a school-code-less row shows '—' instead of '1536'.
 */
function psipopOrgCode(item: PlantillaPosition): string {
  // school_id holds the PSIPOP header school code (e.g. '1801.0010'); an area
  // code like '1536' or a 'SCH-…' synthetic id is never a valid PAL org code.
  const raw = String(item.school_id || '').trim();
  if (/^\d{4}\.\d{4}/.test(raw)) return raw;
  return '';
}

// ── Employee lookup ───────────────────────────────────────────────────────

async function findEmployeeByEmpno(
  empno: string,
  scope: { scopedDivisionIds: string[] | null; scopedCodes: { regcode: string; divcode: string }[] | null },
  range?: [number, number] | null,
): Promise<{ emp: Employee | null; outOfLevel: boolean }> {
  const v = String(empno ?? '').trim();
  if (!v) return { emp: null, outOfLevel: false };
  let rows: Employee[] = [];
  try {
    const a = await supabase.from('employees').select('*').eq('empno', v).limit(10);
    rows = (a.data as Employee[]) ?? [];
    if (rows.length === 0) { const b = await supabase.from('employees').select('*').eq('employee_number', v).limit(10); rows = (b.data as Employee[]) ?? []; }
  } catch { return { emp: null, outOfLevel: false }; }
  const scoped = rows.filter((r) => matchesOrgScope(r, scope));
  const match = scoped[0] ?? null;
  if (!match) return { emp: null, outOfLevel: false };
  if (range && !inStacodeRange(match.stacode, range)) return { emp: match, outOfLevel: true };
  return { emp: match, outOfLevel: false };
}

function incumbentName(e: Employee): string {
  const l = String(e.lname || e.last_name || '').trim();
  const f = String(e.fname || e.first_name || '').trim();
  const m = String(e.mi || e.middle_name || '').trim();
  return [l, [f, m].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// ── View ──────────────────────────────────────────────────────────────────

export default function PlantillaAllocationList({ initialTab }: { initialTab?: PalLevel }) {
  const { scopedDivisionIds, scopedCodes, selectedDivision, selectedRegion, divisions } = useOrg();
  const { positions: allPositions, lookup: lookupPosition } = usePositions();

  const [rows, setRows] = useState<PalRow[]>([]);
  const [quickEmpno, setQuickEmpno] = useState('');
  const [resolving, setResolving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [months, setMonths] = useState(12);
  const [level, setLevel] = useState<PalLevel | null>(initialTab ?? null);
  const [psipop, setPsipop] = useState<{ items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> } | null>(null);
  const [psipopLoading, setPsipopLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<PalRow | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [approvedPosDropdown, setApprovedPosDropdown] = useState<string | null>(null);
  const [approvedPosSearch, setApprovedPosSearch] = useState('');
  const [showNewEmp, setShowNewEmp] = useState(false);
  const [newEmp, setNewEmp] = useState<NewEmpForm>(emptyNewEmp());
  const [newEmpErr, setNewEmpErr] = useState('');
  const [newPosOpen, setNewPosOpen] = useState(false);
  const [newPosSearch, setNewPosSearch] = useState('');
  const [newEmpBusy, setNewEmpBusy] = useState(false);
  const [newEmpHint, setNewEmpHint] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [apprPosOpen, setApprPosOpen] = useState(false);
  const [apprPosSearch, setApprPosSearch] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);

  // Pagination — 6 EMPNO per page (matches the printed PAL page size)
  const { page, setPage, totalPages, pagedItems } = usePagination(rows, PAGE_SIZE);

  const scope = useMemo(() => ({ scopedDivisionIds, scopedCodes }), [scopedDivisionIds, scopedCodes]);

  const lsKey = useMemo(() => {
    const code = scopedCodes?.[0] ? `${scopedCodes[0].regcode}_${scopedCodes[0].divcode}` : 'all';
    return `pal_rows_${code}_${level ?? 'all'}`;
  }, [scopedCodes, level]);

  useEffect(() => {
    setLevel(initialTab ?? null);
  }, [initialTab]);

  useEffect(() => {
    try { const saved = localStorage.getItem(lsKey); if (saved) { const p = JSON.parse(saved) as PalRow[]; if (Array.isArray(p)) setRows(p); } } catch { /* */ }
  }, [lsKey]);

  useEffect(() => {
    try { if (rows.length > 0) localStorage.setItem(lsKey, JSON.stringify(rows)); else localStorage.removeItem(lsKey); } catch { /* */ }
  }, [rows, lsKey]);

  useEffect(() => {
    setPsipopLoading(true); cachedPsipop = null;
    loadPsipopIndex().then((idx) => setPsipop(idx)).catch(() => setPsipop({ items: [], year: null, byName: new Map() })).finally(() => setPsipopLoading(false));
  }, []);

  // Backfill orgCode for existing rows that were encoded before the school_id fix
  useEffect(() => {
    if (!psipop || psipop.items.length === 0) return;
    // Also build a lookup from all PSIPOP positions (including non-filled) for orgCode backfill
    let allPositions: PlantillaPosition[] = [];
    try {
      const raw = localStorage.getItem('deped_plantilla_positions');
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) allPositions = parsed; }
    } catch { /* */ }
    const posByItem = new Map<string, PlantillaPosition>();
    for (const p of allPositions) { if (p.item_number) posByItem.set(p.item_number, p); }
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        let patched = { ...r };
        // Drop any stored orgCode that isn't a real school code (older rows got
        // the PSIPOP AREA code, e.g. '1536', which must never appear in the PAL).
        if (patched.orgCode && !/^\d{4}\.\d{4}/.test(patched.orgCode)) {
          patched = { ...patched, orgCode: '' };
          changed = true;
        }
        // Backfill orgCode from PSIPOP if empty
        if (!patched.orgCode && patched.itemNumber) {
          const item = psipop.items.find((p) => p.item_number === patched.itemNumber) || posByItem.get(patched.itemNumber);
          if (item) {
            const orgCode = psipopOrgCode(item);
            if (orgCode) { patched.orgCode = orgCode; changed = true; }
          }
        }
        // Clear approvedPosition if it matches positionTitle (was auto-filled from PSIPOP, not a user selection)
        if (patched.approvedPosition && patched.approvedPosition === patched.positionTitle) {
          patched = { ...patched, approvedPosition: '' };
          changed = true;
        }
        return patched;
      });
      return changed ? next : prev;
    });
  }, [psipop]);

  const divisionLabel = useMemo(() => {
    if (selectedDivision) return {
      division: `${selectedDivision.division_name ?? ''}${selectedDivision.division_code ? ` [${selectedDivision.division_code}]` : ''}`,
      region: selectedRegion?.region_name ? `${selectedRegion.region_name}${selectedRegion.region_code ? ` [${selectedRegion.region_code}]` : ''}` : '',
    };
    if (scopedCodes && scopedCodes.length === 1) { const d = divisions.find((x) => x.division_code === scopedCodes[0].divcode); return { division: d?.division_name ?? scopedCodes[0].divcode, region: '' }; }
    return { division: 'All Divisions', region: '' };
  }, [selectedDivision, selectedRegion, divisions, scopedCodes]);

  const addBlankRow = () => {
    setRows((r) => [...r, {
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      empno: '', incumbent: '', positionTitle: '', itemNumber: '',
      grade: 0, step: 0, monthly: 0, poscode: '', employeeFound: false, psipopMatched: false,
      note: 'Encode EMPNO to auto-fill from Employee Records & PSIPOP.',
    }]);
    setPage(9999);
    setMessage(null);
  };

  async function resolveEmpno(raw: string) {
    const v = String(raw ?? '').trim();
    if (!v) return;
    setResolving(true); setMessage(null);
    const base: PalRow = {
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      empno: v, incumbent: '', positionTitle: '', itemNumber: '',
      grade: 0, step: 0, monthly: 0, poscode: '', employeeFound: false, psipopMatched: false,
    };
    const emp = await findEmployeeByEmpno(v, scope, level ? PAL_LEVELS[level].range : null);
    if (emp.outOfLevel) {
      const lv = level ? PAL_LEVELS[level] : null;
      base.note = `${emp.emp?.stacode ? `STACODE ${emp.emp.stacode}` : 'No STACODE on record'} — outside the ${lv?.label ?? ''} list (STACODE ${lv ? `${String(lv.range[0]).padStart(3, '0')}–${String(lv.range[1]).padStart(3, '0')}` : ''}). Switch to the matching sub-menu to encode this employee.`;
      setRows((r) => [...r, base]); setResolving(false); setQuickEmpno(''); setPage(9999); quickRef.current?.focus(); return;
    }
    if (!emp.emp) {
      base.note = `EMPNO ${v} was not found in the current division's Employee Records.`;
      setRows((r) => [...r, base]); setResolving(false); setQuickEmpno(''); setPage(9999); quickRef.current?.focus(); return;
    }
    base.employeeFound = true; base.empId = emp.emp.id;
    base.incumbent = incumbentName(emp.emp);
    base.grade = Number(emp.emp.grade) || 0; base.step = Number(emp.emp.step) || 0;
    base.monthly = Number(emp.emp.basic) || 0;
    base.poscode = String(emp.emp.poscode || emp.emp.position || '');

    const pos = lookupPosition(base.poscode);
    base.positionTitle = pos?.position_title || pos?.position_name || '';

    if (psipop) {
      const { item, ambiguous } = pickPsipopItem(emp.emp, psipop);
      if (item) {
        base.itemNumber = item.item_number || '';
        base.itemYear = Number(item.fiscal_year) || psipop.year || undefined;
        base.psipopMatched = true;
        // Organizational Code (2) = school code from PSIPOP header (e.g. '1801.0010')
        base.orgCode = psipopOrgCode(item);
        // Column G (7) — DepEd Approved Position from PSIPOP item
        base.approvedPosition = item.position_title || base.positionTitle || '';
        if (!base.positionTitle) base.positionTitle = item.position_title || '';
      } else if (ambiguous) {
        base.note = `Multiple latest-PSIPOP items match "${base.incumbent}" — search & pick the item.`;
      } else {
        base.note = `No filled latest-PSIPOP item matched "${base.incumbent}" — search to assign, or leave Item No. blank.`;
        // No PSIPOP match — fall back to Position Management for approved position
        base.approvedPosition = base.positionTitle || '';
      }
    } else {
      base.note = 'PSIPOP not loaded yet — Employee fields filled, Item No. pending.';
      base.approvedPosition = base.positionTitle || '';
    }

    setRows((r) => [...r, base]); setResolving(false); setQuickEmpno(''); setPage(9999); quickRef.current?.focus();
  }

  function removeRow(uid: string) { setRows((r) => r.filter((x) => x.uid !== uid)); }
  function clearRows() { if (!confirm('Clear all encoded rows on this list?')) return; setRows([]); }

  // ── New Employee card (worksheet-local, no database write) ───────────────

  function openNewEmp() {
    setNewEmp(emptyNewEmp());
    setNewEmpErr('');
    setNewEmpBusy(false);
    setNewEmpHint(null);
    setNewPosOpen(false);
    setNewPosSearch('');
    setApprPosOpen(false);
    setApprPosSearch('');
    setShowNewEmp(true);
  }

  async function autoMapNewEmp() {
    const v = newEmp.empno.trim();
    if (!v) return;
    setNewEmpBusy(true); setNewEmpErr(''); setNewEmpHint(null);
    const emp = await findEmployeeByEmpno(v, scope, level ? PAL_LEVELS[level].range : null);
    if (emp.outOfLevel) {
      const lv = level ? PAL_LEVELS[level] : null;
      setNewEmpHint({ tone: 'warn', text: `${emp.emp?.stacode ? `STACODE ${emp.emp.stacode}` : 'No STACODE on record'} — outside the ${lv?.label ?? ''} list (STACODE ${lv ? `${String(lv.range[0]).padStart(3, '0')}–${String(lv.range[1]).padStart(3, '0')}` : ''}). Fill the fields manually or switch sub-menu.` });
      setNewEmpBusy(false);
      return;
    }
    if (!emp.emp) {
      setNewEmpHint({ tone: 'warn', text: `EMPNO ${v} was not found in the current division's Employee Records — fill the fields manually.` });
      setNewEmpBusy(false);
      return;
    }
    const matched = emp.emp;
    const pos = lookupPosition(String(matched.poscode || matched.position || ''));
    const matchedStep = Number(matched.step) || 1;
    const approvedMonthly = Number((pos as Record<string, number> | undefined)?.[`step${matchedStep}`]) || Number(matched.basic) || 0;
    setNewEmp((prev) => ({
      ...prev,
      lname: String(matched.lname || matched.last_name || prev.lname).trim().toUpperCase(),
      fname: String(matched.fname || matched.first_name || prev.fname).trim().toUpperCase(),
      mi: String(matched.mi || matched.middle_name || prev.mi || '').trim().toUpperCase(),
      grade: Number(matched.grade) || prev.grade,
      step: matchedStep,
      monthly: Number(matched.basic) || prev.monthly,
      poscode: String(matched.poscode || matched.position || ''),
      positionTitle: pos?.position_title || pos?.position_name || prev.positionTitle,
      approvedPosition: pos?.position_title || pos?.position_name || prev.approvedPosition,
      approvedGrade: pos?.salary_grade ? `${pos.salary_grade} S${matchedStep}` : prev.approvedGrade,
      approvedStep: String(matchedStep),
      approvedMonthly,
    }));
    setNewEmpHint({ tone: 'ok', text: `Mapped from Employee Records: ${incumbentName(matched)}` });
    setNewEmpBusy(false);
  }

  function saveNewEmployee() {
    const f = newEmp;
    if (!f.empno.trim()) { setNewEmpErr('EMPNO is required.'); return; }
    if (!f.lname.trim()) { setNewEmpErr('Last Name (LNAME) is required.'); return; }
    if (!f.fname.trim()) { setNewEmpErr('First Name (FNAME) is required.'); return; }
    const grade = Number(f.grade) || 0;
    const step = Number(f.step) || 0;
    const monthly = Number(f.monthly) || 0;
    const incumbent = [
      f.lname.trim().toUpperCase(),
      [f.fname.trim().toUpperCase(), f.mi.trim().toUpperCase()].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');
    const base: PalRow = {
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      empno: f.empno.trim(),
      incumbent,
      positionTitle: f.positionTitle.trim(),
      itemNumber: f.itemNumber.trim(),
      grade, step, monthly,
      poscode: f.poscode,
      orgCode: f.orgCode.trim(),
      approvedPosition: (f.approvedPosition || f.positionTitle).trim(),
      approvedGrade: f.approvedGrade.trim(),
      approvedMonthly: Number(f.approvedMonthly),
      employeeFound: true,
      psipopMatched: false,
    };
    if (psipop) {
      const pseudoEmp = { lname: f.lname, fname: f.fname, mi: f.mi } as Employee;
      const { item, ambiguous } = pickPsipopItem(pseudoEmp, psipop);
      if (item) {
        base.itemNumber = item.item_number || '';
        base.itemYear = Number(item.fiscal_year) || psipop.year || undefined;
        base.psipopMatched = true;
        base.orgCode = psipopOrgCode(item) || base.orgCode;
        base.approvedPosition = item.position_title || base.approvedPosition || '';
        if (!base.positionTitle) base.positionTitle = item.position_title || '';
        if (!base.poscode) base.poscode = String(item.occupation_code ?? item.office_assignment ?? '');
      } else if (ambiguous) {
        base.note = `Multiple latest-PSIPOP items match "${incumbent}" — search & pick the item.`;
      } else if (!base.positionTitle) {
        base.note = `No filled latest-PSIPOP item matched "${incumbent}" — Item No. can be assigned manually.`;
      }
    }
    setRows((r) => [...r, base]);
    setPage(9999);
    setShowNewEmp(false);
    setMessage({ tone: 'ok', text: `Added ${incumbent} (${base.empno}) to the allocation list — this worksheet row stays local and is not written to Employee Records.` });
  }

  const stats = useMemo(() => {
    const total = rows.length; const filled = rows.filter((r) => r.employeeFound);
    const withItem = rows.filter((r) => r.psipopMatched && r.itemNumber);
    return { total, filled: filled.length, withItem: withItem.length, missingPsipop: filled.length - withItem.length, notFound: total - filled.length };
  }, [rows]);

  async function handleQuickEncode() { if (!quickEmpno.trim() || resolving) return; await resolveEmpno(quickEmpno); }

  // ── PSIPOP manual picker ────────────────────────────────────────────────

  const pickerCandidates = useMemo(() => {
    if (!psipop || !pickerFor) return [];
    const q = pickerQuery.trim().toUpperCase();
    if (!q) return psipop.items.slice(0, 200);
    return psipop.items.filter((p) =>
      String(p.item_number ?? '').toUpperCase().includes(q) ||
      String(p.employee_name ?? '').toUpperCase().includes(q) ||
      String(p.position_title ?? '').toUpperCase().includes(q) ||
      String(p.organizational_unit ?? p.school_name ?? '').toUpperCase().includes(q),
    ).slice(0, 200);
  }, [psipop, pickerFor, pickerQuery]);

  function applyPickedItem(uid: string, item: PlantillaPosition) {
    setRows((rs) => rs.map((r) => {
      if (r.uid !== uid) return r;
      const next = { ...r, itemNumber: item.item_number || '', itemYear: Number(item.fiscal_year) || psipop?.year || undefined, psipopMatched: true, approvedPosition: item.position_title || r.approvedPosition || '' };
      if (!next.positionTitle) next.positionTitle = item.position_title || '';
      if (!next.incumbent) next.incumbent = item.employee_name || '';
      next.orgCode = psipopOrgCode(item) || next.orgCode;
      next.note = undefined; return next;
    }));
    setPickerFor(null); setPickerQuery('');
  }

  // ── Excel export — JSZip raw XML patch (bypasses ExcelJS to avoid XML corruption) ──

  async function exportExcel() {
    const exportable = rows.filter((r) => r.employeeFound || r.itemNumber || r.incumbent);
    if (exportable.length === 0) { setMessage({ tone: 'warn', text: 'Nothing to export yet — encode at least one EMPNO.' }); return; }
    if (exportable.length > 6) { setMessage({ tone: 'warn', text: 'Template fits 6 rows per page. Only the first 6 will be exported.' }); }

    setExporting(true); setMessage(null);
    try {
      const { default: JSZip } = await import('jszip');
      const resp = await fetch('/PAL.xlsx');
      if (!resp.ok) throw new Error('Could not load PAL.xlsx template');
      const zip = await JSZip.loadAsync(await resp.arrayBuffer());
      let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');

      // Data rows 14-19 (template has 6 rows)
      const FIRST_ROW = 14;
      const NUM_ROWS = 6;
      const data = exportable.slice(0, NUM_ROWS);

      // Helper: escape XML special chars
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // Helper: replace a cell in a row body by column letter
      const replaceCell = (body: string, col: string, rowNum: number, xml: string) => {
        const re1 = new RegExp(`<c r="${col}${rowNum}"[^>]*>[^<]*(?:<v>[^<]*<\/v>)?<\/c>`);
        const re2 = new RegExp(`<c r="${col}${rowNum}"[^>]*\/>`);
        let out = body.replace(re1, xml);
        out = out.replace(re2, xml);
        return out;
      };

      // Column totals — written into "Sub-total for this page" (row 25) and
      // "Total this page/Grand Total" (row 27) after the data rows are filled.
      const totals: Record<string, number> = { J: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0 };
      const r2 = (x: number) => Math.round(x * 100) / 100;

      // Process ALL 6 rows: first clear everything, then fill encoded employees
      for (let idx = 0; idx < NUM_ROWS; idx++) {
        const r = FIRST_ROW + idx;
        const emp = idx < data.length ? data[idx] : null;
        const rowRe = new RegExp(`(<row r="${r}"[^>]*>)(.*?)(<\/row>)`, 's');
        const rowMatch = sheet.match(rowRe);
        if (!rowMatch) continue;
        let rowBody = rowMatch[2];

        if (emp) {
          // ── Fill encoded employee data ──
          const itemNo = esc(emp.itemNumber || '');
          const orgCode = esc(emp.orgCode || '');
          const name = esc(emp.incumbent || '');
          const posTitle = esc(emp.positionTitle || '');
          const sgStep = esc(fmtGradeStep(emp.grade, emp.step));
          const rate = emp.monthly || 0;

          rowBody = replaceCell(rowBody, 'A', r, `<c r="A${r}" s="50" t="inlineStr"><is><t>${itemNo}</t></is></c>`);
          rowBody = replaceCell(rowBody, 'B', r, orgCode
            ? `<c r="B${r}" s="51" t="inlineStr"><is><t>${orgCode}</t></is></c>`
            : `<c r="B${r}" s="51"/>`);
          rowBody = replaceCell(rowBody, 'E', r, `<c r="E${r}" s="52" t="inlineStr"><is><t>${name}</t></is></c>`);
          rowBody = replaceCell(rowBody, 'F', r, `<c r="F${r}" s="53" t="inlineStr"><is><t>${posTitle}</t></is></c>`);
          rowBody = replaceCell(rowBody, 'I', r, `<c r="I${r}" s="56" t="inlineStr"><is><t>${sgStep}</t></is></c>`);
          rowBody = replaceCell(rowBody, 'J', r, `<c r="J${r}" s="57"><v>${rate}</v></c>`);

          // G — DepEd Approved Position (from UI input, column 7)
          const appPos = esc(emp.approvedPosition || '');
          rowBody = replaceCell(rowBody, 'G', r, appPos
            ? `<c r="G${r}" s="54" t="inlineStr"><is><t>${appPos}</t></is></c>`
            : `<c r="G${r}" s="54"/>`);
          // H — Date (leave empty for user)
          rowBody = replaceCell(rowBody, 'H', r, `<c r="H${r}" s="55"/>`);
          // K — Approved SG (auto-filled from Position Management Step 1)
          const appGrade = esc(emp.approvedGrade || '');
          rowBody = replaceCell(rowBody, 'K', r, appGrade
            ? `<c r="K${r}" s="56" t="inlineStr"><is><t>${appGrade}</t></is></c>`
            : `<c r="K${r}" s="56"/>`);
          // L — Approved Monthly Rate (auto-filled from Position Management Step 1)
          const appRate = emp.approvedMonthly || 0;
          rowBody = replaceCell(rowBody, 'L', r, appRate > 0
            ? `<c r="L${r}" s="57"><v>${appRate}</v></c>`
            : `<c r="L${r}" s="57"/>`);
          // M–S (13)-(19) follow the arithmetic baked into the PAL.xlsx sample:
          //   M (13) = (12) − (10)   Sal. Differential        L − J
          //   N (14) = (13) × 2.5%   PHIC                     M × 2.5%
          //   O (15) = (13) × 0.12   RLIP                     M × 0.12
          //   P (16) = (13)+(14)+(15) Total Monthly Req.      M + N + O
          //   Q (17) = (16) × months Current Year Req.        P × months
          //   R (18) = (13) × 12      MYB + YEB Differential  M × 12
          //   S (19) = (17)+(18)      Total Funding Req.      Q + R
          const mVal = r2(appRate - rate);
          const nVal = r2(mVal * 0.025);
          const oVal = r2(mVal * 0.12);
          const pVal = r2(mVal + nVal + oVal);
          const qVal = r2(pVal * months);
          const rrVal = r2(mVal * 12);
          const sVal = r2(qVal + rrVal);
          totals.J = r2(totals.J + rate);
          totals.L = r2(totals.L + appRate);
          totals.M = r2(totals.M + mVal);
          totals.N = r2(totals.N + nVal);
          totals.O = r2(totals.O + oVal);
          totals.P = r2(totals.P + pVal);
          totals.Q = r2(totals.Q + qVal);
          totals.R = r2(totals.R + rrVal);
          totals.S = r2(totals.S + sVal);
          rowBody = replaceCell(rowBody, 'M', r, `<c r="M${r}" s="58"><f>L${r}-J${r}</f><v>${r2(mVal)}</v></c>`);
          // N (14) = M × 2.5% (PHIC)
          rowBody = replaceCell(rowBody, 'N', r, `<c r="N${r}" s="58"><f>M${r}*0.025</f><v>${r2(nVal)}</v></c>`);
          // O (15) = M × 0.12 (RLIP)
          rowBody = replaceCell(rowBody, 'O', r, `<c r="O${r}" s="58"><f>M${r}*0.12</f><v>${r2(oVal)}</v></c>`);
          // P (16) = M + N + O (Total Monthly Requirements)
          rowBody = replaceCell(rowBody, 'P', r, `<c r="P${r}" s="58"><f>M${r}+N${r}+O${r}</f><v>${r2(pVal)}</v></c>`);
          // Q (17) = P × months (Current Year Requirements)
          rowBody = replaceCell(rowBody, 'Q', r, `<c r="Q${r}" s="57"><f>P${r}*${months}</f><v>${r2(qVal)}</v></c>`);
          // R (18) = (13) × 12 (MYB + YEB Differential = Sal. Differential × 12)
          rowBody = replaceCell(rowBody, 'R', r, `<c r="R${r}" s="57"><f>M${r}*12</f><v>${r2(rrVal)}</v></c>`);
          // S (19) = Q + R (Total Funding Requirements)
          rowBody = replaceCell(rowBody, 'S', r, `<c r="S${r}" s="57"><f>Q${r}+R${r}</f><v>${r2(sVal)}</v></c>`);
        } else {
          // ── Clear entire row (remove template sample data) ──
          for (const [col, style] of [['A','50'],['B','51'],['E','52'],['F','53'],['G','54'],['I','56'],['J','57'],['K','56'],['L','57'],['M','58'],['N','58'],['O','58'],['P','58'],['Q','57'],['R','57'],['S','57']] as [string,string][]) {
            rowBody = replaceCell(rowBody, col, r, `<c r="${col}${r}" s="${style}"/>`);
          }
          // Also clear T-U (remarks)
          for (const col of ['T', 'U', 'V']) {
            rowBody = replaceCell(rowBody, col, r, `<c r="${col}${r}" s="59"/>`);
          }
        }

        sheet = sheet.replace(rowMatch[0], rowMatch[1] + rowBody + rowMatch[3]);
      }

      // ── Sub-total for this page (row 25) & Total this page/Grand Total (row 27) ──
      // Write the sum of every numeric column into both rows. Row 26 (Total
      // previous page) stays blank — this template fits one page, so nothing
      // is carried forward; the template's sample figures are overwritten.
      const totalCols = ['J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'] as const;
      for (const trow of [25, 27]) {
        const tRowRe = new RegExp(`(<row r="${trow}"[^>]*>)(.*?)(<\/row>)`, 's');
        const tRowMatch = sheet.match(tRowRe);
        if (!tRowMatch) continue;
        let tBody = tRowMatch[2];
        for (const col of totalCols) {
          const cell = `<c r="${col}${trow}" s="97"><f>SUM(${col}14:${col}19)</f><v>${totals[col]}</v></c>`;
          const re1 = new RegExp(`<c r="${col}${trow}"[^>]*>[^<]*(?:<v>[^<]*<\/v>)?<\/c>`);
          const re2 = new RegExp(`<c r="${col}${trow}"[^>]*\/>`);
          let out = tBody.replace(re1, cell);
          out = out.replace(re2, cell);
          if (out === tBody) out = tBody.replace(`<c r="M${trow}"`, cell + `<c r="M${trow}"`);
          tBody = out;
        }
        sheet = sheet.replace(tRowMatch[0], tRowMatch[1] + tBody + tRowMatch[3]);
      }

      // Write back to zip — formulas need recalculation on open so M-S stay
      // correct after the user fills G/H/K/L in Excel.
      zip.file('xl/worksheets/sheet1.xml', sheet);
      const wbRaw = await zip.file('xl/workbook.xml')!.async('string');
      zip.file('xl/workbook.xml', wbRaw.replace(/<calcPr[^>]*\/?>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>'));
      const outBuf = await zip.generateAsync({ type: 'blob' });
      const fname = `PAL_${(divisionLabel.division.replace(/[^A-Z0-9]+/gi, '_') || 'Division')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      saveAs(outBuf, fname);
      setMessage({ tone: 'ok', text: `Exported ${Math.min(exportable.length, 6)} employee${exportable.length === 1 ? '' : 's'} to ${fname}. Fill columns G (DepEd Approved Position), H (Date), K-L (Approved SG/Rate) — columns M-S compute automatically.` });
    } catch (err) {
      setMessage({ tone: 'err', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setExporting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
            <ListTree className="w-5 h-5 text-emerald-600" />
            Plantilla Allocation List
            {level && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-bold tracking-wide">
                {PAL_LEVELS[level].short} · STACODE {String(PAL_LEVELS[level].range[0]).padStart(3, '0')}–{String(PAL_LEVELS[level].range[1]).padStart(3, '0')}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Department of Education — {divisionLabel.division}{divisionLabel.region ? ` · ${divisionLabel.region}` : ''}.{level ? <> <strong className="text-slate-700 dark:text-slate-200">{PAL_LEVELS[level].label}</strong> list — STACODE {String(PAL_LEVELS[level].range[0]).padStart(3, '0')}–{String(PAL_LEVELS[level].range[1]).padStart(3, '0')}.</> : ' All school levels.'} Type an EMPNO; columns (1), (5), (6), (9) &amp; (10) auto-fill from Employee Records and the latest PSIPOP.
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            Formulas: (13)=(12)-(10) Sal. Diff · (14)=(13)×2.5% PHIC · (15)=(13)×0.12 RLIP · (16)=(13)+(14)+(15) Total Monthly · (17)=(16)×months · (18)=(13)×12 MYB+YEB · (19)=(17)+(18) Total Funding
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearRows} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            Months:
            <input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(24, parseInt(e.target.value) || 12)))}
              className="w-14 px-2 py-1.5 rounded-md border border-slate-200 text-center text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </label>
          <button onClick={exportExcel} disabled={rows.length === 0 || exporting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Excel
          </button>
          <button onClick={openNewEmp} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <UserPlus className="w-3.5 h-3.5 text-emerald-600" /> New Employee
          </button>
          <button onClick={addBlankRow} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">School Level</span>
        <button type="button" onClick={() => setLevel(null)}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${level === null ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
          All Levels
        </button>
        {PAL_LEVEL_ITEMS.map((it) => {
          const active = level === it.key;
          return (
            <button key={it.key} type="button" onClick={() => setLevel(it.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
              {it.short} · STACODE {String(PAL_LEVELS[it.key].range[0]).padStart(3, '0')}–{String(PAL_LEVELS[it.key].range[1]).padStart(3, '0')}
            </button>
          );
        })}
      </div>

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

      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <Info className="w-4 h-4 shrink-0" />
        Position Title (6) resolves via Position Management masterfile (Position code → title), falling back to the matched PSIPOP item.
      </div>

      {typeof window !== 'undefined' && localStorage.getItem('psi_pop_needs_reimport') === '1' && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Org. Code (2)</strong> uses the school code from the PSIPOP header (e.g., "1801.0011"). Re-import your PSIPOP PDF to populate it automatically.</span>
        </div>
      )}

      {message && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${message.tone === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : message.tone === 'err' ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
          <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setMessage(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleQuickEncode(); }}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input ref={quickRef} value={quickEmpno} onChange={(e) => setQuickEmpno(e.target.value)} placeholder="Type EMPNO, press Enter to encode…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
        </div>
        <button type="submit" disabled={resolving || !quickEmpno.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Encode
        </button>
      </form>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span><strong className="text-slate-700 dark:text-white">{stats.total}</strong> row{stats.total === 1 ? '' : 's'}</span>
        <span><strong className="text-slate-700 dark:text-white">{stats.filled}</strong> employee{stats.filled === 1 ? '' : 's'} matched</span>
        <span className="text-emerald-600"><strong>{stats.withItem}</strong> with PSIPOP item</span>
        {stats.missingPsipop > 0 && <span className="text-amber-600"><strong>{stats.missingPsipop}</strong> missing item no.</span>}
        {stats.notFound > 0 && <span className="text-rose-600"><strong>{stats.notFound}</strong> EMPNO not found</span>}
      </div>

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
                  <th className="text-left px-3 py-2.5 font-medium">Org. Code <span className="text-slate-400 normal-case">(2)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium">Name of Incumbent <span className="text-slate-400 normal-case">(5)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium">Position Title <span className="text-slate-400 normal-case">(6)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium min-w-[10rem]">DepEd Approved Position <span className="text-slate-400 normal-case">(7)</span></th>
                  <th className="text-center px-3 py-2.5 font-medium">SG/Step <span className="text-slate-400 normal-case">(9)</span></th>
                  <th className="text-right px-3 py-2.5 font-medium">Monthly Rate <span className="text-slate-400 normal-case">(10)</span></th>
                  <th className="text-center px-3 py-2.5 font-medium">Approved SG <span className="text-slate-400 normal-case">(11)</span></th>
                  <th className="text-right px-3 py-2.5 font-medium">Approved Rate <span className="text-slate-400 normal-case">(12)</span></th>
                  <th className="text-right px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((r) => {
                  const lookupHint = r.employeeFound && !r.psipopMatched;
                  return (
                    <tr key={r.uid} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{r.empno || '—'}</span>
                        {r.employeeFound && <button className="ml-1.5 align-middle" onClick={() => removeRow(r.uid)}><X className="w-3.5 h-3.5 text-slate-300 hover:text-rose-500" /></button>}
                      </td>
                      <td className="px-3 py-2">
                        {r.itemNumber ? (
                          <button onClick={() => setPickerFor(r)} className="text-left font-mono text-[11px] leading-tight text-blue-700 dark:text-blue-300 hover:underline">
                            {r.itemNumber}{r.itemYear ? <span className="block text-[10px] text-slate-400">FY {r.itemYear}</span> : null}
                          </button>
                        ) : (
                          <button onClick={() => r.employeeFound ? setPickerFor(r) : undefined} disabled={!r.employeeFound}
                            className={`inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-1 border transition-colors ${lookupHint ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-slate-400 border-slate-200 hover:bg-slate-50 disabled:opacity-40'}`}>
                            <Search className="w-3 h-3" /> Assign item
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-slate-600 dark:text-slate-300">{r.orgCode || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                      <td className="px-3 py-2">
                        {r.incumbent ? <span className="font-medium text-slate-800 dark:text-slate-100 text-[13px]">{r.incumbent}</span>
                          : r.employeeFound ? <span className="text-slate-400 text-xs">—</span>
                          : <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><UserX className="w-3.5 h-3.5" /> not found</span>}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-slate-700 dark:text-slate-200">{r.positionTitle || <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}</td>
                      <td className="px-3 py-2 relative">
                        <div className="relative">
                          <input type="text" value={approvedPosDropdown === r.uid ? approvedPosSearch : (r.approvedPosition || '')} placeholder="—"
                            onFocus={() => { setApprovedPosDropdown(r.uid); setApprovedPosSearch(r.approvedPosition || ''); }}
                            onChange={(e) => {
                              setApprovedPosSearch(e.target.value);
                              // Keep dropdown open while typing
                              if (approvedPosDropdown !== r.uid) setApprovedPosDropdown(r.uid);
                            }}
                            onBlur={() => setTimeout(() => setApprovedPosDropdown(null), 250)}
                            className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-300" />
                          {approvedPosDropdown === r.uid && (
                            <div className="absolute z-50 top-full left-0 w-72 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg mt-0.5">
                              {allPositions.filter((p) => {
                                const q = approvedPosSearch.toUpperCase();
                                if (!q) return true;
                                return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q) || p.position_name.toUpperCase().includes(q);
                              }).slice(0, 50).map((p) => (
                                <button key={p.id} type="button"
                                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={() => {
                                    const sg = p.salary_grade || 0;
                                    const step1Salary = p.step1 || 0;
                                    setRows((rs) => rs.map((x) => x.uid === r.uid ? {
                                      ...x,
                                      approvedPosition: p.position_title,
                                      approvedGrade: sg > 0 ? `${sg} S1` : '',
                                      approvedMonthly: step1Salary,
                                    } : x));
                                    setApprovedPosSearch('');
                                    setApprovedPosDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0">
                                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300">{p.position_code}</span>
                                  <span className="text-[12px] text-slate-700 dark:text-slate-200 ml-2">{p.position_title}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">{p.personnel_category}</span>
                                </button>
                              ))}
                              {allPositions.filter((p) => {
                                const q = approvedPosSearch.toUpperCase();
                                if (!q) return true;
                                return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q);
                              }).length === 0 && (
                                <div className="px-3 py-2 text-[11px] text-slate-400">No positions match "{approvedPosSearch}"</div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-[13px]">{r.grade > 0 ? fmtGradeStep(r.grade, r.step) : '—'}</td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums">{r.monthly > 0 ? currency(r.monthly) : '—'}</td>
                      <td className="px-3 py-2 text-center text-[13px] text-emerald-700 dark:text-emerald-300 font-medium">{r.approvedGrade || '—'}</td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums text-emerald-700 dark:text-emerald-300">{r.approvedMonthly ? currency(r.approvedMonthly) : '—'}</td>
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

      <Pagination pagination={{ page, setPage, totalPages, total: rows.length, pageSize: PAGE_SIZE }} label="employees" />

      {pickerFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Assign PSIPOP Item</h3>
                <p className="text-[11px] text-slate-500">{pickerFor.incumbent ? `${pickerFor.incumbent} · EMPNO ${pickerFor.empno}` : `EMPNO ${pickerFor.empno}`}{psipop?.year ? ` · latest PSIPOP FY ${psipop.year}` : ''}</p>
              </div>
              <button onClick={() => setPickerFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input autoFocus value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search item no., incumbent name, or position title…"
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
              </div>
            </div>
            <div className="max-h-[46vh] overflow-y-auto">
              {pickerCandidates.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2"><RefreshCw className="w-5 h-5 text-slate-300" />No PSIPOP items match — try a different search.</div>
              ) : (
                <table className="w-full text-sm"><tbody>
                  {pickerCandidates.map((p) => (
                    <tr key={p.id} onClick={() => applyPickedItem(pickerFor.uid, p)} className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20 transition-colors">
                      <td className="px-4 py-2.5 align-top">
                        <p className="font-mono text-[11px] text-blue-700 dark:text-blue-300 leading-tight">{p.item_number}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.school_name || p.organizational_unit || ''}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{p.employee_name || '—'}</p>
                        <p className="text-[11px] text-slate-500">{p.position_title} · SG {p.salary_grade}{p.salary_step ? ` S${p.salary_step}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right align-top whitespace-nowrap text-[11px] text-slate-400">{p.fiscal_year ? `FY ${p.fiscal_year}` : ''}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-700">
              {psipop ? `${pickerCandidates.length === 200 && pickerQuery ? 'Showing first 200 of ' : ''}${psipop.items.length.toLocaleString()} filled items from the latest PSIPOP.` : 'PSIPOP not loaded.'}
            </div>
          </div>
        </div>
      )}

      {showNewEmp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" /> Create New Employee
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Adds a row to this Plantilla Allocation List worksheet — it stays local and is not saved to Employee Records. Type an EMPNO and the name auto-fills from Employee Records.</p>
              </div>
              <button onClick={() => setShowNewEmp(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {newEmpErr && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {newEmpErr}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <label className="block col-span-3">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Item No. <span className="text-slate-400 normal-case">(1)</span></span>
                  <input value={newEmp.itemNumber} onChange={(e) => setNewEmp({ ...newEmp, itemNumber: e.target.value })} placeholder="e.g. 1801-0010-2024 (leave blank to assign later)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block col-span-3">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">EMPNO *</span>
                  <div className="relative">
                    <input value={newEmp.empno}
                      onChange={(e) => { setNewEmp({ ...newEmp, empno: e.target.value }); setNewEmpHint(null); }}
                      onBlur={() => autoMapNewEmp()}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); autoMapNewEmp(); } }}
                      placeholder="e.g. 260001"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                    {newEmpBusy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />}
                  </div>
                  {newEmpHint && (
                    <span className={`mt-1 block text-[11px] ${newEmpHint.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{newEmpHint.text}</span>
                  )}
                </label>
                <label className="block col-span-2">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Last Name *</span>
                  <input value={newEmp.lname} onChange={(e) => setNewEmp({ ...newEmp, lname: e.target.value })} placeholder="LNAME"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">MI</span>
                  <input value={newEmp.mi} onChange={(e) => setNewEmp({ ...newEmp, mi: e.target.value.replace(/[^A-Za-zÑñ]/g, '').slice(0, 3) })} placeholder="MI"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block col-span-3">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">First Name *</span>
                  <input value={newEmp.fname} onChange={(e) => setNewEmp({ ...newEmp, fname: e.target.value })} placeholder="FNAME"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
              </div>

              <div className="relative">
                <span className="block text-[11px] font-medium text-slate-500 mb-1">Position (from Position Management)</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={newPosOpen ? newPosSearch : (newEmp.positionTitle || newEmp.poscode)}
                    onFocus={() => { setNewPosOpen(true); setNewPosSearch(newEmp.positionTitle || newEmp.poscode); }}
                    onChange={(e) => { setNewPosSearch(e.target.value); setNewEmp({ ...newEmp, poscode: '', positionTitle: e.target.value }); if (!newPosOpen) setNewPosOpen(true); }}
                    onBlur={() => setTimeout(() => setNewPosOpen(false), 200)}
                    placeholder="Search & select a position…"
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </div>
                {newPosOpen && (
                  <div className="absolute z-50 top-full left-0 w-full max-h-44 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg mt-0.5">
                    {allPositions.filter((p) => {
                      const q = newPosSearch.toUpperCase();
                      if (!q) return true;
                      return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q) || p.position_name.toUpperCase().includes(q);
                    }).slice(0, 50).map((p) => (
                      <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={() => {
                          setNewEmp((prev) => ({
                            ...prev,
                            poscode: p.position_code,
                            positionTitle: p.position_title,
                            grade: p.salary_grade || prev.grade,
                            step: 1,
                            monthly: p.step1 || prev.monthly,
                          }));
                          setNewPosSearch(''); setNewPosOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0">
                        <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300">{p.position_code}</span>
                        <span className="text-[12px] text-slate-700 dark:text-slate-200 ml-2">{p.position_title}</span>
                      </button>
                    ))}
                    {allPositions.filter((p) => {
                      const q = newPosSearch.toUpperCase();
                      if (!q) return true;
                      return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-[11px] text-slate-400">No positions match "{newPosSearch}"</div>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <span className="block text-[11px] font-medium text-slate-500 mb-1">DepEd Approved Position <span className="text-slate-400 normal-case">(7)</span></span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={apprPosOpen ? apprPosSearch : (newEmp.approvedPosition || newEmp.positionTitle)}
                    onFocus={() => { setApprPosOpen(true); setApprPosSearch(newEmp.approvedPosition || newEmp.positionTitle); }}
                    onChange={(e) => { setApprPosSearch(e.target.value); setNewEmp({ ...newEmp, approvedPosition: e.target.value }); if (!apprPosOpen) setApprPosOpen(true); }}
                    onBlur={() => setTimeout(() => setApprPosOpen(false), 200)}
                    placeholder="Search & select the approved position…"
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </div>
                {apprPosOpen && (
                  <div className="absolute z-50 top-full left-0 w-full max-h-44 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg mt-0.5">
                    {allPositions.filter((p) => {
                      const q = apprPosSearch.toUpperCase();
                      if (!q) return true;
                      return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q) || p.position_name.toUpperCase().includes(q);
                    }).slice(0, 50).map((p) => (
                      <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={() => {
                          const sg = p.salary_grade || 0;
                          const step1Salary = p.step1 || 0;
                          setNewEmp((prev) => ({
                            ...prev,
                            approvedPosition: p.position_title,
                            approvedGrade: sg > 0 ? `${sg} S1` : '',
                            approvedStep: '1',
                            approvedMonthly: step1Salary,
                          }));
                          setApprPosSearch(''); setApprPosOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0">
                        <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300">{p.position_code}</span>
                        <span className="text-[12px] text-slate-700 dark:text-slate-200 ml-2">{p.position_title}</span>
                        <span className="text-[10px] text-slate-400 ml-1">SG {p.salary_grade || '—'} · {p.personnel_category}</span>
                      </button>
                    ))}
                    {allPositions.filter((p) => {
                      const q = apprPosSearch.toUpperCase();
                      if (!q) return true;
                      return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-[11px] text-slate-400">No positions match "{apprPosSearch}"</div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">SG</span>
                  <input type="number" min={0} value={newEmp.grade || ''} onChange={(e) => setNewEmp({ ...newEmp, grade: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Step</span>
                  <input type="number" min={1} max={8} value={newEmp.step || ''} onChange={(e) => setNewEmp({ ...newEmp, step: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Monthly Rate</span>
                  <input type="number" min={0} value={newEmp.monthly || ''} onChange={(e) => setNewEmp({ ...newEmp, monthly: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Approved SG <span className="text-slate-400 normal-case">(11)</span></span>
                  <input value={newEmp.approvedGrade} onChange={(e) => setNewEmp((prev) => {
                    const stepMatch = e.target.value.toUpperCase().match(/S(\d+)/);
                    return { ...prev, approvedGrade: e.target.value, approvedStep: stepMatch ? stepMatch[1] : prev.approvedStep };
                  })} placeholder="auto from selected position, e.g. 12 S1"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Approved Step</span>
                  <input type="number" min={1} max={8} value={newEmp.approvedStep || ''} onChange={(e) => setNewEmp((prev) => {
                    const as = Math.max(1, Math.min(8, parseInt(e.target.value) || 1));
                    const sg = parseInt(prev.approvedGrade, 10) || 0;
                    return { ...prev, approvedStep: String(as), approvedGrade: sg > 0 ? `${sg} S${as}` : prev.approvedGrade };
                  })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Approved Rate <span className="text-slate-400 normal-case">(12)</span></span>
                  <input type="number" min={0} value={newEmp.approvedMonthly || ''} onChange={(e) => setNewEmp({ ...newEmp, approvedMonthly: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
                <label className="block col-span-3">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Org. Code (2)</span>
                  <input value={newEmp.orgCode} onChange={(e) => setNewEmp({ ...newEmp, orgCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })} placeholder="e.g. 1801"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                </label>
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button onClick={() => setShowNewEmp(false)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={saveNewEmployee} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Add to List
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-300 dark:text-slate-600">Rows are saved locally for this division and school level ({lsKey}) until you clear them. The list shows 6 employees per page to match the printed PAL layout; Export produces the DBM-DepEd Annex R-1 PAL form — fill columns G (DepEd Approved Position), H (Date), K-L (Approved SG/Rate) and columns M-S compute automatically.</p>
    </div>
  );
}
