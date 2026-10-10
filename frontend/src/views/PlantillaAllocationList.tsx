import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  Plus, Search, Trash2, Download, X, AlertTriangle, CheckCircle2, Loader2,
  ListTree, RefreshCw, UserX, UserPlus, ChevronDown, Menu, Maximize2, Minimize2,
} from 'lucide-react';
import { supabase, fetchAll, chunkedIn, formatError } from '@/lib/pb';
import { loadDivisionDirectory, resolveEmployeeScope } from '@/lib/restoreSync';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { usePositions } from '@/lib/usePositions';
import { assignedSchoolCodeOf } from '@/lib/assignedSchool';
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

// ── Reclassification category (PAL content) ──────────────────────────────
// Each category has its own DBM-DepEd template + Annex R-1 sheet names.

export type PalCategory = 'teaching' | 'master' | 'principal';

export const PAL_CATEGORIES: { key: PalCategory; label: string; short: string; template: string; title: string; fileTag: string }[] = [
  { key: 'teaching', label: 'Teaching Positions', short: 'TI-VII', template: '/PAL.xlsx', title: 'Reclassification of Teaching Positions', fileTag: '' },
  { key: 'master', label: 'Master Teacher Positions', short: 'MT', template: '/PAL_MT.xlsx', title: 'Reclassification of Master Teacher Positions', fileTag: 'MT_' },
  { key: 'principal', label: 'School Principal Positions', short: 'SH', template: '/PAL_SH.xlsx', title: 'Reclassification of School Principal Positions', fileTag: 'SH_' },
];

/** Annex R-1 sheet base name for a category + school level. */
export function palSheetBase(category: PalCategory, level: PalLevel | null): string {
  const lvl = level === 'junior' ? 'JHS' : level === 'senior' ? 'SHS' : 'ELEM';
  const cat = PAL_CATEGORIES.find((c) => c.key === category) ?? PAL_CATEGORIES[0];
  return `Annex R-1 PAL for ${cat.short} ${lvl}`;
}

/** Unique sheet name within one workbook (Excel caps names at 31 chars). */
export function palSheetName(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = ` p${n}`;
  return base.length + suffix.length <= 31 ? base + suffix : base.slice(0, 31 - suffix.length) + suffix;
}

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

/** Resolve the PAL school level from an employee's own STACODE so the
    1st Indorsement is filtered and separated per ELEM / JHS / SHS by station,
    not by which encoding list the row happened to be entered under. Returns
    null when the STACODE is missing or outside every level's range. */
function levelForStacode(v: unknown): PalLevel | null {
  for (const lvl of ['elementary', 'junior', 'senior'] as PalLevel[]) {
    if (inStacodeRange(v, PAL_LEVELS[lvl].range)) return lvl;
  }
  return null;
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
  /** UI-only ranking score — basis of the PAL sort inside each approved
      position; never written to the Excel export. */
  rankingPoints?: number;
  employeeFound: boolean;
  psipopMatched: boolean;
  note?: string;
}

const fmtGradeStep = (g: number, s: number) => (g > 0 ? `${g}${s > 0 ? ` S${s}` : ''}` : '');

/** "April 14, 2026" style long date for the Indorsement letterhead. */
function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "junior high school" / "senior high school" phrase for the Indorsement body. */
function indorsementLevelPhrase(level: PalLevel | null): string {
  return level === 'junior' ? 'junior high school'
    : level === 'senior' ? 'senior high school'
    : 'elementary';
}

/** Remove trailing blank paragraphs from a letter's body so it never spills an
    extra (mostly blank) page. The PAL template pads the bottom of each page
    with ~20 empty lines; with a full 6-row table that padding pushes content
    onto a second page, so it is stripped and each endorsement fits one page. */
function trimTrailingBlankParagraphs(xml: string): string {
  let out = xml;
  const lastPara = /(?:<w:p\b[^>]*>(?:(?!<\/w:p>).)*?<\/w:p>)\s*$/s;
  for (;;) {
    const m = out.match(lastPara);
    if (!m) break;
    const body = m[0];
    if (/<w:t[^>]*>([\s\S]*?)<\/w:t>/.test(body)) {
      const visible = [...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .some((t) => /\S/.test(t[1]));
      if (visible) break;
    }
    out = out.slice(0, out.length - body.length);
  }
  return out;
}

// The DBM-DepEd PAL template fits 6 employees per printed page.
const PAGE_SIZE = 6;

/**
 * Parse a custom page spec like "1, 3, 5-7" (1-based) into sorted unique
 * 0-based page indices clamped to [0, total-1]. Returns [] when nothing valid.
 */
function parsePageSpec(spec: string, total: number): number[] {
  const out = new Set<number>();
  for (const tok of String(spec ?? '').split(',')) {
    const t = tok.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    let a = Math.max(1, Math.min(total, parseInt(m[1], 10)));
    let b = m[2] ? Math.max(1, Math.min(total, parseInt(m[2], 10))) : a;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    if (a > b) [a, b] = [b, a];
    for (let n = a; n <= b; n++) out.add(n - 1);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * Chunk exported rows into PAL pages of `pageSize`, but never mix two
 * different DepEd Approved positions on the same printed page — a new
 * approved position always starts on a fresh page.
 */
function chunkPalPages<T extends PalRow>(rows: T[], pageSize: number, separateBlankPosition = false): T[][] {
  const pages: T[][] = [];
  let cur: T[] = [];
  let curPos = '';
  for (const r of rows) {
    const pos = (r.approvedPosition || '').trim().toUpperCase();
    if (cur.length > 0 && ((separateBlankPosition ? pos !== curPos : (pos !== '' && pos !== curPos)) || cur.length >= pageSize)) {
      pages.push(cur);
      cur = [];
    }
    cur.push(r);
    curPos = pos;
  }
  if (cur.length > 0) pages.push(cur);
  return pages;
}

/**
 * Build endorsement pages in approved-position order. A page never mixes two
 * positions, and a position with more than six rows continues on later pages.
 */
function chunkEndorsementPages<T extends PalRow>(rows: T[], pageSize: number): T[][] {
  const ordered = [...rows].sort((a, b) => {
    const ap = (a.approvedPosition || '').trim().toUpperCase();
    const bp = (b.approvedPosition || '').trim().toUpperCase();
    if (ap !== bp) {
      if (!ap) return 1;
      if (!bp) return -1;
      return ap.localeCompare(bp);
    }
    const ar = a.rankingPoints ?? -1;
    const br = b.rankingPoints ?? -1;
    if (ar !== br) return br - ar;
    return String(a.incumbent || '').localeCompare(String(b.incumbent || ''), undefined, { numeric: true });
  });
  return chunkPalPages(ordered, pageSize, true);
}

// ── New Employee (worksheet-local) form ────────────────────────────────────

interface NewEmpForm {
  empno: string;
  /** Station code — required, and must sit inside the active sub-menu's range. */
  stacode: string;
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
  return { empno: '', stacode: '', itemNumber: '', lname: '', fname: '', mi: '', poscode: '', positionTitle: '', grade: 0, step: 1, monthly: 0, orgCode: '', approvedPosition: '', approvedGrade: '', approvedStep: '', approvedMonthly: 0 };
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

/**
 * Any Employee Records row carrying this EMPNO, regardless of org scope.
 * Used as a duplicate guard before the New Employee card writes a new record.
 */
async function findExistingEmployeeByEmpno(empno: string): Promise<Employee | null> {
  const v = String(empno ?? '').trim();
  if (!v) return null;
  try {
    const a = await supabase.from('employees').select('*').eq('empno', v).limit(1);
    const rows = (a.data as Employee[]) ?? [];
    if (rows.length > 0) return rows[0];
    const b = await supabase.from('employees').select('*').eq('employee_number', v).limit(1);
    return ((b.data as Employee[]) ?? [])[0] ?? null;
  } catch { return null; }
}

function incumbentName(e: Employee): string {
  const l = String(e.lname || e.last_name || '').trim();
  const f = String(e.fname || e.first_name || '').trim();
  const m = String(e.mi || e.middle_name || '').trim();
  return [l, [f, m].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/** Canonical employee number: EMPNO masterfield first, legacy number second. */
function employeeNo(e: Employee): string {
  return String(e.empno || e.employee_number || '');
}

/** Pad a STACODE range edge to the 3-digit form used in DB filters. */
function padStacode(n: number): string {
  return String(n).padStart(3, '0');
}

// ── View ──────────────────────────────────────────────────────────────────

export default function PlantillaAllocationList({ initialTab, maximize = false, onMaximizeChange }: {
  initialTab?: PalLevel;
  /** Full-window mode — hides the app sidebar/header/footer for max space. */
  maximize?: boolean;
  onMaximizeChange?: (v: boolean) => void;
}) {
  const { scopedDivisionIds, scopedCodes, selectedDivision, selectedRegion, divisions } = useOrg();
  const { positions: allPositions, lookup: lookupPosition } = usePositions();

  const [rows, setRows] = useState<PalRow[]>([]);
  const [quickEmpno, setQuickEmpno] = useState('');
  // Name search — scoped employee index for the type-ahead, suggestion box
  // visibility, and an index of employees already on this list (hidden from
  // suggestions so the same person isn't added twice by accident).
  const [empIndex, setEmpIndex] = useState<Employee[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Find an already-encoded row by name / EMPNO / item no. (the grid pages at
  // 6 rows per printed PAL page, so a filter is the only sane way to locate a
  // specific encoded employee once the list grows).
  const [rowFilter, setRowFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [months, setMonths] = useState(12);
const [level, setLevel] = useState<PalLevel | null>(initialTab ?? 'elementary');
  // Open/close state for the School Level dropdown in the top ribbon strip.
  // Closes after an option is selected.
  const [levelOpen, setLevelOpen] = useState(false);
  // Mobile nav dropdown inside the unified ribbon — the tab strip collapses into
  // this on viewports narrower than `md` so the action buttons keep their space.
  // Closes after a tab is selected.
  const [navOpen, setNavOpen] = useState(false);
  // Reclassification category — each category keeps its own encoded list
  // (Teaching / Master Teacher / School Principal) and its own template.
  const [palCategory, setPalCategory] = useState<PalCategory>('teaching');
  // Endorsement tab — generate the 1st Indorsement .docx (same layout as the
  // "Indorsement PAL elem" template) from the encoded PAL rows of the active
  // school level (Elementary / JHS / SHS).
  const [endorsementMode, setEndorsementMode] = useState(false);
  const [indorsementDate, setIndorsementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endorserName, setEndorserName] = useState('');
  const [forwardedTo, setForwardedTo] = useState('');
  const [includeMap, setIncludeMap] = useState<Record<string, boolean>>({});
  const [psipop, setPsipop] = useState<{ items: PlantillaPosition[]; year: number | null; byName: Map<string, PlantillaPosition[]> } | null>(null);
  const [psipopLoading, setPsipopLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<PalRow | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [approvedPosDropdown, setApprovedPosDropdown] = useState<string | null>(null);
  const [approvedPosSearch, setApprovedPosSearch] = useState('');
  // Viewport-anchored position for the approved-position dropdown. The menu
  // renders in a `fixed` overlay (outside the table's scroll container) so it
  // is never clipped by the scroll box or the pagination footer.
  const [apprAnchor, setApprAnchor] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  // Mobile compact mode — true when the viewport drops below 768px. The grid
  // then shows only the essential columns (EMPNO, NAME, POSITION, SALARY) and
  // re-keys the table body so its layout change fades in smoothly.
  const [isCompact, setIsCompact] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767.98px)');
    const onMq = () => setIsCompact(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  function openApprovedPos(uid: string, fallback: string, el: HTMLInputElement | null) {
    setApprovedPosDropdown(uid);
    setApprovedPosSearch(fallback);
    if (el) {
      const rc = el.getBoundingClientRect();
      // Position fly-out panel to the right of the input
      const left = rc.right + 4;
      const top = rc.top;
      setApprAnchor({ left, top });
    }
  }

  function closeApprovedPos() { setApprovedPosDropdown(null); setApprAnchor(null); }

  // Dismiss the overlay when the page scrolls/resizes (but not when scrolling
  // the menu's own option list).
  useEffect(() => {
    if (!approvedPosDropdown) return;
    const onScroll = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-appr-dropdown]')) return;
      closeApprovedPos();
    };
    const onResize = () => closeApprovedPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); };
  }, [approvedPosDropdown]);
  const [showNewEmp, setShowNewEmp] = useState(false);
  const [newEmp, setNewEmp] = useState<NewEmpForm>(emptyNewEmp());
  const [newEmpErr, setNewEmpErr] = useState('');
  const [newPosOpen, setNewPosOpen] = useState(false);
  const [newPosSearch, setNewPosSearch] = useState('');
  const [newEmpBusy, setNewEmpBusy] = useState(false);
  const [newEmpHint, setNewEmpHint] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  // Schools directory for the STACODE picker — only schools whose station code
  // falls inside the active sub-menu's range can be added to this tab.
  const [schoolOptions, setSchoolOptions] = useState<{ stacode: string; name: string; code: string; divisionId: string }[]>([]);
  // Bumped after a successful Employee Records insert so the cached name-search
  // index reloads and offers the new hire immediately.
  const [empIndexNonce, setEmpIndexNonce] = useState(0);
  const [apprPosOpen, setApprPosOpen] = useState(false);
  const [apprPosSearch, setApprPosSearch] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);
  // ── Export dialog: current page / all pages / custom pages ─────────────
  const [showExportDlg, setShowExportDlg] = useState(false);
  const [exportScope, setExportScope] = useState<'current' | 'all' | 'custom'>('all');
  const [customSpec, setCustomSpec] = useState('');

  // The PAL prints grouped per DepEd Approved position — all rows sharing the
  // same approved position print together, with blank spots trailing at the
  // end. Both the on-screen grid and the Excel export use this same order so
  // the preview mirrors the printed pages.
  const groupedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ap = (a.approvedPosition || '').trim().toUpperCase();
      const bp = (b.approvedPosition || '').trim().toUpperCase();
      if (ap !== bp) {
        if (!ap) return 1;
        if (!bp) return -1;
        return ap.localeCompare(bp);
      }
      // Within a position, higher Ranking Points sort first; rows without
      // points trail at the end of their position group.
      const ar = a.rankingPoints ?? -1;
      const br = b.rankingPoints ?? -1;
      if (ar !== br) return br - ar;
      return String(a.incumbent || '').localeCompare(String(b.incumbent || ''), undefined, { numeric: true });
    });
  }, [rows]);

  // Row filter — subset of encoded rows matching the find box. Export always
  // uses the full grouped list; this only affects what the grid displays.
  const filteredRows = useMemo(() => {
    const q = rowFilter.trim().toLowerCase();
    if (!q) return groupedRows;
    return groupedRows.filter((r) =>
      [r.incumbent, r.empno, r.positionTitle, r.itemNumber, r.orgCode]
        .some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [groupedRows, rowFilter]);

  // Pagination — 6 EMPNO per page (matches the printed PAL page size)
  const { page, setPage, totalPages, pagedItems } = usePagination(filteredRows, PAGE_SIZE);

  const scope = useMemo(() => ({ scopedDivisionIds, scopedCodes }), [scopedDivisionIds, scopedCodes]);

  // ── Name search: employee index for the current level + org scope ──────
  // Built once per (scope, level) and cached, so typing a name is instant and
  // never repeats the fetch. Only STACODE-in-range employees are loaded, so a
  // picked suggestion is always encodable on this tab.
  const empScopeKey = useMemo(() => {
    const c = scopedCodes?.[0];
    const s = c ? `${c.regcode}|${c.divcode}` : 'all';
    return `${level ?? 'none'}|${s}`;
  }, [level, scopedCodes]);

  const empIndexCacheRef = useRef(new Map<string, Employee[]>());
  useEffect(() => {
    if (!level) { setEmpIndex([]); return; }
    const cached = empIndexCacheRef.current.get(empScopeKey);
    if (cached) { setEmpIndex(cached); return; }
    let cancelled = false;
    (async () => {
      try {
        const c = scopedCodes?.[0];
        const [lo, hi] = PAL_LEVELS[level].range;
        const range = `(stacode>='${padStacode(lo)}' && stacode<='${padStacode(hi)}')`;
        const org = c ? `regcode='${c.regcode}' && divcode='${c.divcode}' && ` : '';
        const index = await fetchAll<Employee>('employees', `${org}${range} && status='Active'`, 'last_name');
        if (cancelled) return;
        empIndexCacheRef.current.set(empScopeKey, index);
        setEmpIndex(index);
      } catch { if (!cancelled) setEmpIndex([]); }
    })();
    return () => { cancelled = true; };
  }, [empScopeKey, level, scopedCodes, empIndexNonce]);

  // ── Schools directory for the STACODE picker (active sub-menu range) ─────
  // This is what makes a PAL-created employee a valid Employee Records row: the
  // record needs a STACODE, and its school carries the division it belongs to.
  useEffect(() => {
    if (!level) { setSchoolOptions([]); return; }
    let cancelled = false;
    const [lo, hi] = PAL_LEVELS[level].range;
    (async () => {
      try {
        const rows = await fetchAll<{ stacode: string; school_name: string; school_code: string; division_id: string }>(
          'schools',
          `(stacode>='${padStacode(lo)}' && stacode<='${padStacode(hi)}') && status='Active'`,
          'stacode',
        );
        if (cancelled) return;
        setSchoolOptions(
          rows
            .map((s) => ({
              stacode: String(s.stacode ?? '').trim(),
              name: String(s.school_name ?? '').trim(),
              code: String(s.school_code ?? '').trim(),
              divisionId: String(s.division_id ?? '').trim(),
            }))
            .filter((s) => s.stacode),
        );
      } catch { if (!cancelled) setSchoolOptions([]); }
    })();
    return () => { cancelled = true; };
  }, [level]);

  // Suggestions for the search box: rank by EMPNO-exact, surname prefix, then
  // any given-name / full-name token; hide employees already on this list.
  const quickQuery = quickEmpno.trim();
  const suggestions = useMemo(() => {
    const q = quickQuery.toUpperCase();
    if (!q) return [];
    const onList = new Set(rows.map((r) => String(r.empno ?? '').toUpperCase()).filter(Boolean));
    const qIsEmpno = /^\d+$/.test(q);
    const score = (e: Employee): number => {
      const no = employeeNo(e).toUpperCase();
      const name = (incumbentName(e) || '').toUpperCase();
      if (qIsEmpno) {
        if (no === q) return 1_000_000;
        if (no.startsWith(q)) return 20_000 - no.length;
        return name.includes(q) ? 15_000 : 0;
      }
      const last = String(e.lname || e.last_name || '').toUpperCase();
      const given = String(`${e.fname || e.first_name || ''} ${e.mi || e.middle_name || ''}`).trim().toUpperCase();
      if (last.startsWith(q)) return 30_000 - last.length;
      if (given.startsWith(q)) return 25_000 - given.length;
      if (name.includes(q)) return 12_000 + last.length;
      if (no.startsWith(q)) return 6_000;
      return 0;
    };
    return empIndex
      .filter((e) => !onList.has(employeeNo(e).toUpperCase()))
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || String(a.e.lname || a.e.last_name || '').localeCompare(String(b.e.lname || b.e.last_name || '')))
      .slice(0, 8)
      .map((x) => x.e);
  }, [quickQuery, empIndex, rows]);

  const catMeta = PAL_CATEGORIES.find((c) => c.key === palCategory) ?? PAL_CATEGORIES[0];

  // The school behind the STACODE typed in the New Employee card.
  const newEmpSchool = schoolOptions.find((s) => s.stacode === newEmp.stacode.trim()) ?? null;

  const lsKey = useMemo(() => {
    const code = scopedCodes?.[0] ? `${scopedCodes[0].regcode}_${scopedCodes[0].divcode}` : 'all';
    return `pal_rows_${code}_${level ?? 'all'}_${palCategory}`;
  }, [scopedCodes, level, palCategory]);

  useEffect(() => {
    setLevel(initialTab ?? 'elementary');
  }, [initialTab]);

  // ── PocketBase persistence (pal_lists collection) ──────────────────────
  // One record per regcode+divcode+level scope; the `rows` JSON column holds
  // one encoded list per reclassification category
  // ({ teaching: [], master: [], principal: [] }) so the lists survive
  // across devices/sessions. Legacy records that stored a bare array are
  // read as the teaching list.
  type PalRowsByCat = Record<PalCategory, PalRow[]>;
  const emptyRowsByCat = useCallback((): PalRowsByCat => ({ teaching: [], master: [], principal: [] }), []);
  const parseStoredRows = useCallback((raw: unknown): PalRowsByCat => {
    const empty = emptyRowsByCat();
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(v)) return { ...empty, teaching: v as PalRow[] };
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return {
          teaching: Array.isArray(o.teaching) ? o.teaching as PalRow[] : [],
          master: Array.isArray(o.master) ? o.master as PalRow[] : [],
          principal: Array.isArray(o.principal) ? o.principal as PalRow[] : [],
        };
      }
    } catch { /* fall through to empty */ }
    return empty;
  }, [emptyRowsByCat]);
  // Cache of every category's rows for the loaded record, so saving one
  // category never wipes the other two.
  const rowsCacheRef = useRef<PalRowsByCat>(emptyRowsByCat());
  const [palRecordId, setPalRecordId] = useState<string | null>(null);
  const [palLoaded, setPalLoaded] = useState(false);
  // The scope (regcode|divcode|level|category) that the currently displayed
  // rows belong to. Guards the debounced save so a tab switch can never write
  // one tab's rows into another tab's record (which previously mixed data
  // across tabs).
  const loadedScopeRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setPalLoaded(false);
    setPalRecordId(null);
    loadedScopeRef.current = '';
    const code = scopedCodes?.[0];
    const cat = palCategory;
    (async () => {
      try {
        if (!code || !level) { rowsCacheRef.current = emptyRowsByCat(); setRows([]); return; }
        const scopeKey = `${code.regcode}|${code.divcode}|${level}|${cat}`;
        // Most-recently-updated record wins, so a stale duplicate can never
        // shadow the real one.
        const items = await supabase.from('pal_lists').select('*')
          .eq('regcode', code.regcode).eq('divcode', code.divcode).eq('level', level)
          .order('updated', { ascending: false });
        const rec = (items.data as { id: string; rows: string; months?: number }[] | null)?.[0] ?? null;
        if (cancelled) return;
        loadedScopeRef.current = scopeKey;
        if (rec) {
          setPalRecordId(rec.id);
          const parsed = parseStoredRows(rec.rows);
          rowsCacheRef.current = parsed;
          setRows(parsed[cat]);
          if (typeof rec.months === 'number' && rec.months >= 1 && rec.months <= 24) setMonths(rec.months);
        } else {
          rowsCacheRef.current = emptyRowsByCat();
          setRows([]);
        }
      } catch {
        if (!cancelled) { rowsCacheRef.current = emptyRowsByCat(); setRows([]); }
      } finally {
        if (!cancelled) setPalLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [lsKey, level, palCategory, scopedCodes, emptyRowsByCat, parseStoredRows]);

  // Save rows + months back to PocketBase (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!palLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const code = scopedCodes?.[0];
      if (!code || !level) return;
      // Guard: only persist when the displayed rows belong to this tab's scope.
      // Prevents a stale closure (previous tab's rows + old record id + new
      // level/category) from relabeling/corrupting the wrong pal_lists record.
      if (loadedScopeRef.current !== `${code.regcode}|${code.divcode}|${level}|${palCategory}`) return;
      // Merge the current category's rows into the cache; the other two
      // categories ride along untouched.
      const merged: Record<PalCategory, PalRow[]> = { ...rowsCacheRef.current, [palCategory]: rows };
      rowsCacheRef.current = merged;
      const totalRows = merged.teaching.length + merged.master.length + merged.principal.length;
      // Never create an empty record on first paint — wait for real content.
      if (!palRecordId && totalRows === 0) return;
      const scope = { regcode: code.regcode, divcode: code.divcode, level };
      (async () => {
        try {
          const payload = {
            ...scope,
            region_name: selectedRegion?.region_name ?? '',
            division_name: selectedDivision?.division_name ?? '',
            months,
            rows: JSON.stringify(merged),
            status: totalRows > 0 ? 'active' : 'empty',
          };
          if (palRecordId) {
            await supabase.from('pal_lists').update(payload).eq('id', palRecordId);
          } else {
            const created = await supabase.from('pal_lists').insert(payload);
            // insert() resolves to { data: <single record> } (not an array).
            const newRec = created.data as { id?: string } | null | undefined;
            if (newRec?.id) setPalRecordId(newRec.id);
          }
        } catch { /* non-blocking — UI keeps working; next save retries */ }
      })();
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [rows, months, palLoaded, palRecordId, level, palCategory, scopedCodes, selectedRegion, selectedDivision]);

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
      note: 'Add EMPNO to auto-fill from Employee Records & PSIPOP.',
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
      // Never add an out-of-range employee to this tab — each tab holds only
      // its own STACODE range (ELEM 001–095, JHS 500–699, SHS 700–701).
      const lv = level ? PAL_LEVELS[level] : null;
      setMessage({ tone: 'err', text: `${emp.emp?.stacode ? `STACODE ${emp.emp.stacode}` : 'No STACODE on record'} — outside the ${lv?.short ?? ''} tab (STACODE ${lv ? `${String(lv.range[0]).padStart(3, '0')}–${String(lv.range[1]).padStart(3, '0')}` : ''}). Switch to the matching STACODE tab to encode this employee.` });
      setResolving(false); setQuickEmpno(''); quickRef.current?.focus(); return;
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

  // ── Refresh the Monthly Rate column from Employee Records ──────────────
  // A PAL row's Monthly Rate is the employee's Basic Salary, captured when the
  // row was encoded. When Employee Records change afterwards (salary schedule
  // sync, promotion, step increment) the encoded rows keep the stale rate, so
  // this re-reads `basic` for every EMPNO on the list and rewrites only the
  // Monthly Rate. Grade/Step and the PSIPOP/Position Management columns are
  // left untouched.
  async function refreshMonthlyFromEmployees() {
    if (rows.length === 0) return;
    const empnos = [...new Set(
      rows.map((r) => String(r.empno ?? '').trim().toUpperCase()).filter(Boolean),
    )];
    if (empnos.length === 0) {
      setMessage({ tone: 'warn', text: 'No encoded row carries an EMPNO to look up in Employee Records.' });
      return;
    }
    setRefreshingRates(true); setMessage(null);
    try {
      // EMPNO lives in the masterfield `empno` and in the legacy
      // `employee_number`; look in both so older records still resolve.
      const [byMaster, byLegacy] = await Promise.all([
        chunkedIn<Employee>('empno', empnos, (chunk) => supabase.from('employees').select('*').in('empno', chunk)),
        chunkedIn<Employee>('employee_number', empnos, (chunk) => supabase.from('employees').select('*').in('employee_number', chunk)),
      ]);

      // Prefer the record inside the active division scope, but fall back to an
      // out-of-scope match so a legacy row can still be refreshed.
      const scopedNo = new Map<string, Employee>();
      const anyNo = new Map<string, Employee>();
      for (const e of [...byMaster, ...byLegacy]) {
        const no = employeeNo(e).trim().toUpperCase();
        if (!no) continue;
        if (!anyNo.has(no)) anyNo.set(no, e);
        if (matchesOrgScope(e, scope) && !scopedNo.has(no)) scopedNo.set(no, e);
      }

      let updated = 0, unchanged = 0, missing = 0, noRate = 0;
      const next = rows.map((r) => {
        const no = String(r.empno ?? '').trim().toUpperCase();
        if (!no) return r;
        const emp = scopedNo.get(no) ?? anyNo.get(no);
        if (!emp) { missing++; return r; }
        const rate = Number(emp.basic) || Number(emp.basic_salary) || 0;
        if (rate <= 0) { noRate++; return r; }
        if (r.employeeFound && (Number(r.monthly) || 0) === rate) { unchanged++; return r; }
        updated++;
        return { ...r, monthly: rate, empId: emp.id || r.empId, employeeFound: true };
      });

      if (updated > 0) setRows(next);

      const parts = [`${updated} monthly rate${updated === 1 ? '' : 's'} updated from Employee Records`];
      if (unchanged > 0) parts.push(`${unchanged} already current`);
      if (missing > 0) parts.push(`${missing} EMPNO not found`);
      if (noRate > 0) parts.push(`${noRate} with no Basic Salary on record`);
      setMessage({ tone: updated > 0 ? 'ok' : 'warn', text: `${parts.join(' · ')}.` });
    } catch (err) {
      setMessage({ tone: 'err', text: `Could not read Employee Records: ${formatError(err)}` });
    } finally {
      setRefreshingRates(false);
    }
  }

  // ── New Employee card ─────────────────────────────────────────────────────
  // Saving this card writes a real Employee Records row (same field
  // conventions and division-scope stamping as the Employee Records form) and
  // then adds the worksheet row, so the new hire is encodable right away.

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
      stacode: String(matched.stacode || prev.stacode).trim(),
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

  async function saveNewEmployee() {
    const f = newEmp;
    if (newEmpBusy) return;
    if (!f.empno.trim()) { setNewEmpErr('EMPNO is required.'); return; }
    if (!f.lname.trim()) { setNewEmpErr('Last Name (LNAME) is required.'); return; }
    if (!f.fname.trim()) { setNewEmpErr('First Name (FNAME) is required.'); return; }
    const stacode = f.stacode.trim();
    if (!stacode) { setNewEmpErr('STACODE is required — pick the school this employee is stationed at.'); return; }
    if (level && !inStacodeRange(stacode, PAL_LEVELS[level].range)) {
      const lv = PAL_LEVELS[level];
      setNewEmpErr(`STACODE ${stacode} is outside the ${lv.label} list (${padStacode(lv.range[0])}–${padStacode(lv.range[1])}). Switch to the matching sub-menu, or correct the STACODE.`);
      return;
    }
    const lname = f.lname.trim().toUpperCase();
    const fname = f.fname.trim().toUpperCase();
    const mi = f.mi.trim().toUpperCase();
    const grade = Number(f.grade) || 0;
    const step = Number(f.step) || 0;
    const monthly = Number(f.monthly) || 0;
    const incumbent = [lname, [fname, mi].filter(Boolean).join(' ')].filter(Boolean).join(', ');
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
    // ── Persist the new hire to Employee Records ──────────────────────────
    // A worksheet row alone is unreachable from payroll, reports and the other
    // PAL sub-menus, so the card writes the masterfile record first and only
    // then adds the row (linked by empId).
    setNewEmpBusy(true);
    setNewEmpErr('');
    const empno = f.empno.trim();
    const existing = await findExistingEmployeeByEmpno(empno);
    if (existing) {
      setNewEmpErr(`EMPNO ${empno} already exists in Employee Records (${incumbentName(existing)}). Search for that employee above instead of creating a duplicate.`);
      setNewEmpBusy(false);
      return;
    }

    // Division context — canonical REGCODE/DIVCODE + division_id, resolved from
    // the chosen school's division (falling back to the uploader's own scope),
    // exactly as the Employee Records save path does.
    const school = schoolOptions.find((s) => s.stacode === stacode) ?? null;
    let regcode = scopedCodes?.[0]?.regcode ?? '';
    let divcode = scopedCodes?.[0]?.divcode ?? '';
    let divisionId: string | null = null;
    try {
      const directory = await loadDivisionDirectory();
      const schoolDivision = new Map<string, string>();
      if (school?.divisionId) schoolDivision.set(stacode, school.divisionId);
      const resolved = resolveEmployeeScope(directory, schoolDivision, '', '', stacode, scopedCodes?.[0] ?? null);
      regcode = resolved.regcode || regcode;
      divcode = resolved.divcode || divcode;
      divisionId = resolved.divisionId;
    } catch { /* fall back to the uploader's own codes */ }

    const today = new Date().toISOString().slice(0, 10);
    const { data: created, error: insErr } = await supabase.from('employees').insert({
      empno, employee_number: empno,
      lname, fname, mi,
      last_name: lname, first_name: fname, middle_name: mi,
      empname: incumbent,
      stacode,
      assigned_school_code: school?.code ?? '',
      poscode: f.poscode, position: f.poscode || f.positionTitle.trim(),
      grade, step, basic: monthly, basic_salary: monthly,
      status: 'Active', hire_date: today, hiredate: today,
      regcode, divcode, division_id: divisionId,
      updated_at: new Date().toISOString(),
    });
    if (insErr) {
      setNewEmpErr(`Could not save to Employee Records: ${formatError(insErr)}`);
      setNewEmpBusy(false);
      return;
    }
    setNewEmpBusy(false);
    const newId = (created as { id?: string } | null)?.id;
    if (newId) base.empId = newId;

    setRows((r) => [...r, base]);
    setPage(9999);
    setShowNewEmp(false);
    // The name-search index is cached per scope+level — drop it so the new hire
    // is offered by the search box immediately instead of after a reload.
    empIndexCacheRef.current.delete(empScopeKey);
    setEmpIndexNonce((n) => n + 1);
    setMessage({
      tone: 'ok',
      text: `Added ${incumbent} (${base.empno}) to the allocation list and saved a new record to Employee Records${school ? ` — ${school.name}` : ''}.`,
    });
  }

  // ── Endorsement tab — link the generated Indorsement to the encoded rows ──
  // Every employee encoded on this division's PAL — across ALL THREE school
  // levels (Elementary / JHS / SHS) and all three reclassification categories
  // (Teaching / Master Teacher / School Principal) — is a candidate for the
  // 1st Indorsement letter. Each level's list is fetched so the letter is not
  // limited to whichever Encoding tab is active.
  type EndorseRow = PalRow & { level: PalLevel };
  const [endorseAll, setEndorseAll] = useState<Record<PalLevel, Record<PalCategory, PalRow[]>> | null>(null);

  // Fetch ELEM + JHS + SHS records whenever the Endorsement tab is shown or
  // the division scope changes. The active level's live rows are overlaid
  // in `endorseRows` below, so unsaved encodings appear without a refetch.
  // School name per school code from the Organization directory, and the
  // employee's own STACODE + SHS assigned-school code from Employee Records.
  // The latter is used by the Senior High School endorsement rows.
  const [schoolByStacode, setSchoolByStacode] = useState<Record<string, string> | null>(null);
  const [empStacodeByEmpno, setEmpStacodeByEmpno] = useState<Record<string, string> | null>(null);
  const [empAssignedSchoolByEmpno, setEmpAssignedSchoolByEmpno] = useState<Record<string, string> | null>(null);
  // Per-row "Assigned School" override for the endorsement — typed manually
  // as a fallback when an Organization assignment is not available, used in
  // the preview and written into the letter's School column.
  const [assignedSchoolByUid, setAssignedSchoolByUid] = useState<Record<string, string>>({});
  const endorseLookupCacheRef = useRef<{ key: string; school: Record<string, string>; empno: Record<string, string>; assigned: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!endorsementMode) return;
    const code = scopedCodes?.[0];
    if (!code) {
      setEndorseAll(null);
      setSchoolByStacode(null);
      setEmpStacodeByEmpno(null);
      setEmpAssignedSchoolByEmpno(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const items = await supabase.from('pal_lists').select('id,level,rows')
          .eq('regcode', code.regcode).eq('divcode', code.divcode)
          .in('level', (['elementary', 'junior', 'senior'] as PalLevel[]))
          .order('updated', { ascending: false });
        if (cancelled) return;
        const out: Record<PalLevel, Record<PalCategory, PalRow[]>> = {
          elementary: emptyRowsByCat(), junior: emptyRowsByCat(), senior: emptyRowsByCat(),
        };
        const seen: Partial<Record<PalLevel, true>> = {};
        for (const it of (items.data ?? []) as { level: PalLevel; rows: string }[]) {
          if (!(it.level in PAL_LEVELS) || seen[it.level]) continue;
          seen[it.level] = true;
          out[it.level] = parseStoredRows(it.rows);
        }
        setEndorseAll(out);

        // School directory (STACODE → school name). Cached per division so
        // reopening the tab does not refetch.
        const lookupKey = `${code.regcode}|${code.divcode}`;
        if (!endorseLookupCacheRef.current || endorseLookupCacheRef.current.key !== lookupKey) {
          const [schoolsRes, employees] = await Promise.all([
            supabase.from('schools').select('school_code, school_name').eq('status', 'Active'),
            fetchAll<Employee>('employees', `regcode='${code.regcode}' && divcode='${code.divcode}' && status='Active'`, 'last_name').catch(() => [] as Employee[]),
          ]);
          if (cancelled) return;
          const school: Record<string, string> = {};
          for (const s of (schoolsRes.data ?? []) as { school_code: string; school_name: string }[]) {
            if (s.school_code) school[String(s.school_code).trim()] = String(s.school_name ?? '');
          }
          const empno: Record<string, string> = {};
          const assigned: Record<string, string> = {};
          for (const e of employees) {
            const no = employeeNo(e).trim().toUpperCase();
            if (!no) continue;
            const stacode = String(e.stacode || e.department || '').trim();
            if (stacode) empno[no] = stacode;
            // "Assigned School" set under Organization → Senior High Schools
            // (SHS station 700/701 employees point at an actual school).
            const schoolCode = String(e.assigned_school_code ?? '').trim();
            if (schoolCode) assigned[no] = schoolCode;
          }
          endorseLookupCacheRef.current = { key: lookupKey, school, empno, assigned };
        }
        setSchoolByStacode(endorseLookupCacheRef.current.school);
        setEmpStacodeByEmpno(endorseLookupCacheRef.current.empno);
        setEmpAssignedSchoolByEmpno(endorseLookupCacheRef.current.assigned);
      } catch { /* fall through — the live overlay still shows the active level */ }
    })();
    return () => { cancelled = true; };
  }, [endorsementMode, scopedCodes, emptyRowsByCat, parseStoredRows]);

  const endorseRows = useMemo<EndorseRow[]>(() => {
    const seed = (): Record<PalLevel, Record<PalCategory, PalRow[]>> => ({
      elementary: emptyRowsByCat(), junior: emptyRowsByCat(), senior: emptyRowsByCat(),
    });
    // Always overlay the active level's live cache (plus the current
    // category's in-progress edits) so nothing unsaved is ever missing.
    const live = { ...rowsCacheRef.current, [palCategory]: rows };
    const src = endorseAll ? { ...endorseAll } : seed();
    if (level) src[level] = live;
    const out: EndorseRow[] = [];
    for (const lvl of ['elementary', 'junior', 'senior'] as PalLevel[]) {
      for (const c of PAL_CATEGORIES) {
        for (const r of src[lvl]?.[c.key] ?? []) {
          if (!String(r.incumbent ?? '').trim()) continue;
          // Each row's level comes from the employee's own STACODE (ELEM /
          // JHS / SHS range), so the endorsement is filtered and separated by
          // station — not by which list the row was encoded under. Rows whose
          // STACODE is missing or outside every range are excluded.
          const no = String(r.empno ?? '').trim().toUpperCase();
          const resolved = empStacodeByEmpno ? levelForStacode(empStacodeByEmpno[no]) : null;
          if (!resolved) continue;
          out.push({ ...r, level: resolved });
        }
      }
    }
    return out;
  }, [endorseAll, rows, level, palCategory, empStacodeByEmpno, emptyRowsByCat]);

  const includedCount = endorseRows.filter((r) => includeMap[r.uid] !== false).length;

  // Endorsement rows shown on screen, filtered by the top-panel STACODE
  // (School Level) control. The download still covers every included row.
  const shownEndorseRows = useMemo(
    () => (level ? endorseRows.filter((r) => r.level === level) : endorseRows),
    [endorseRows, level],
  );

  // Letters are split per school level into pages of PAGE_SIZE (6) rows each,
  // matching the printed PAL page size. This is how many letters (all chained
  // into one continuous .docx) the Download button will produce.
  const endorseLetterCount = useMemo(() => {
    const byLevel: Record<PalLevel, EndorseRow[]> = { elementary: [], junior: [], senior: [] };
    for (const r of endorseRows) {
      if (includeMap[r.uid] !== false) byLevel[r.level].push(r);
    }
    return PAL_LEVEL_ITEMS.reduce(
      (sum, it) => sum + chunkEndorsementPages(byLevel[it.key], PAGE_SIZE).length,
      0,
    );
  }, [endorseRows, includeMap]);

  /** School name for an endorsable row — a manually typed "Assigned School"
      override wins. Otherwise a Senior High School employee reports to the
      school assigned to them under Organization → Senior High Schools
      (employees.assigned_school_code), because the 700/701 station codes carry
      no school of their own. Everything else resolves from the employee's own
      STACODE via the Organization school directory. No PSIPOP org-code lookup;
      unknown codes come back blank. */
  const endorserSchoolOf = useCallback((r: EndorseRow): string => {
    const override = (assignedSchoolByUid?.[r.uid] ?? '').trim();
    if (override) return override;
    const no = String(r.empno ?? '').trim().toUpperCase();
    const stacode = empStacodeByEmpno?.[no] ?? '';
    if (r.level === 'senior') {
      const assigned = assignedSchoolCodeOf({ stacode, assigned_school_code: empAssignedSchoolByEmpno?.[no] ?? '' });
      const assignedName = assigned ? (schoolByStacode?.[assigned] ?? '') : '';
      if (assignedName) return assignedName;
    }
    return stacode ? (schoolByStacode?.[stacode] ?? '') : '';
  }, [assignedSchoolByUid, empAssignedSchoolByEmpno, empStacodeByEmpno, schoolByStacode]);

  // ── Export paging preview (6 employees per sheet; mirrors exportExcel chunking)
  const exportInfo = useMemo(() => {
    const exportable = groupedRows.filter((r) => r.employeeFound || r.itemNumber || r.incumbent);
    const pages = chunkPalPages(exportable, PAGE_SIZE);
    const totalPages = Math.max(1, pages.length);
    const cur = Math.max(1, Math.min(page + 1, totalPages));
    const custom = parsePageSpec(customSpec, totalPages);
    return { count: exportable.length, totalPages, cur, custom };
  }, [groupedRows, page, customSpec]);

  // Quick-add from the search box: a numeric query behaves exactly as before
  // (exact EMPNO lookup, adds an unmatched row with a note so nothing typed is
  // silently dropped); any other text must match an employee suggestion — a
  // typo'd name shows a message instead of polluting the list with a bogus row.
  async function handleQuickEncode() {
    const q = quickEmpno.trim();
    if (!q || resolving) return;
    const pick = suggestions.find((s) => employeeNo(s).toUpperCase() === q.toUpperCase()) ?? suggestions[0];
    setQuickOpen(false);
    if (/^\d+$/.test(q)) {
      await resolveEmpno(q);
    } else if (pick) {
      await resolveEmpno(employeeNo(pick));
    } else {
      setMessage({ tone: 'err', text: `No ${level ? PAL_LEVELS[level].label : 'school-level'} employee matches "${q}". Check the spelling or try an EMPNO.` });
    }
  }

  // Add the employee behind a suggestion (same encode path as typing its EMPNO).
  async function addSuggestion(e: Employee) {
    if (resolving) return;
    setQuickEmpno('');
    setQuickOpen(false);
    quickRef.current?.focus();
    await resolveEmpno(employeeNo(e));
  }

  function applyRowFilter(v: string) {
    setRowFilter(v);
    setPage(1);
  }

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
    const exportable = groupedRows.filter((r) => r.employeeFound || r.itemNumber || r.incumbent);
    if (exportable.length === 0) { setMessage({ tone: 'warn', text: 'Nothing to export yet — encode at least one EMPNO.' }); return; }
    const PAGE = 6;
    const pages = chunkPalPages(exportable, PAGE);

    // Resolve which pages go into the workbook: current UI page / all / custom.
    // `page` is 0-based over `rows`; clamp it into the exportable page range.
    let sel: number[];
    if (exportScope === 'current') sel = [Math.max(0, Math.min(page, pages.length - 1))];
    else if (exportScope === 'custom') sel = parsePageSpec(customSpec, pages.length);
    else sel = pages.map((_, i) => i);
    if (sel.length === 0) { setMessage({ tone: 'warn', text: 'No valid pages selected — use e.g. "1, 3, 5-7".' }); return; }

    // A10 Education label follows the STACODE range of the active level tab:
    // 001–095 Elementary, 500–699 Secondary, 700–701 Senior High School.
    // (No level tab selected → keep the template's text.)
    const eduLabel = level === 'elementary' ? 'Education: Elementary'
      : level === 'junior' ? 'Education: Secondary'
      : level === 'senior' ? 'Education: Senior High School'
      : null;

    setExporting(true); setMessage(null); setShowExportDlg(false);
    try {
      const { default: JSZip } = await import('jszip');
      const resp = await fetch(catMeta.template);
      if (!resp.ok) throw new Error(`Could not load ${catMeta.template} template`);
      const templateBuf = await resp.arrayBuffer();
      // Single workbook: load the template once, fill one sheet XML per
      // selected page from the same buffer, then assemble all sheets into
      // this zip (one sheet per page — no more one-workbook-per-page).
      const zip = await JSZip.loadAsync(templateBuf);
      const templateSheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
      let sheetRelsTpl: string | undefined;
      try { const f = zip.file('xl/worksheets/_rels/sheet1.xml.rels'); if (f) sheetRelsTpl = await f.async('string'); } catch { sheetRelsTpl = undefined; }

      // Helper: escape XML special chars
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // Helper: replace a cell in a row body by column letter.
      // NOTE: replacers are functions — replacement strings containing `$`
      // (e.g. `$A$1` print areas, `$` in employee names) would otherwise be
      // reinterpreted as `$1`/`$&` backreferences and corrupt the XML.
      const replaceCell = (body: string, col: string, rowNum: number, xml: string) => {
        const re1 = new RegExp(`<c r="${col}${rowNum}"[^>]*>[^<]*(?:<v>[^<]*</v>)?</c>`);
        const re2 = new RegExp(`<c r="${col}${rowNum}"[^>]*/>`);
        let out = body.replace(re1, () => xml);
        out = out.replace(re2, () => xml);
        return out;
      };
      const r2 = (x: number) => Math.round(x * 100) / 100;

      const built: { pageIdx: number; xml: string; count: number }[] = [];

      for (const pageIdx of sel) {
        const data = pages[pageIdx];
        let sheet = templateSheet;

        // Data rows 14-19 — only the first `data.length` rows carry employees;
        // the rest stay blank (cleared temp sample text) so the printed layout
        // line-up is preserved.
        const FIRST_ROW = 14;
        const NUM_ROWS = PAGE;

        // Column totals — written into "Sub-total for this page" (row 25) and
        // "Total this page/Grand Total" (row 27) after the data rows are filled.
        const totals: Record<string, number> = { J: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0 };

        // Process ALL 6 rows: first clear everything, then fill encoded employees
        for (let idx = 0; idx < NUM_ROWS; idx++) {
          const r = FIRST_ROW + idx;
          const emp = idx < data.length ? data[idx] : null;
          const rowRe = new RegExp(`(<row r="${r}"[^>]*>)(.*?)(</row>)`, 's');
          const rowMatch = sheet.match(rowRe);

          if (!rowMatch) continue;
          let rowBody = rowMatch[2];

          if (emp) {
            // Fill encoded employee data
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
          //   R (18) = (13) × 2       MYB and/or YEB Differential  M × 2
          //   S (19) = (17)+(18)      Total Funding Req.      Q + R
          const mVal = r2(appRate - rate);
          const nVal = r2(mVal * 0.025);
          const oVal = r2(mVal * 0.12);
          const pVal = r2(mVal + nVal + oVal);
          const qVal = r2(pVal * months);
          // R (18) MYB and/or YEB Differential = (13) Sal. Differential × 2
          const rrVal = r2(mVal * 2);
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
          // R (18) = (13) × 2 (MYB and/or YEB Differential)
          rowBody = replaceCell(rowBody, 'R', r, `<c r="R${r}" s="57"><f>M${r}*2</f><v>${r2(rrVal)}</v></c>`);
          // S (19) = Q + R (Total Funding Requirements)
          rowBody = replaceCell(rowBody, 'S', r, `<c r="S${r}" s="57"><f>Q${r}+R${r}</f><v>${r2(sVal)}</v></c>`);
        } else {
          // ── Clear entire row (remove template sample data) ──
          for (const [col, style] of [['A','50'],['B','51'],['E','52'],['F','53'],['G','54'],['I','56'],['J','57'],['K','56'],['L','57'],['M','58'],['N','58'],['O','58'],['P','58'],['Q','57'],['R','57'],['S','57']] as [string,string][]) {
            rowBody = replaceCell(rowBody, col, r, `<c r="${col}${r}" s="${style}"/>`);
          }
          // Clear remarks (T-V merged cell) — keep the template's per-cell
          // styles so the box borders stay intact: T=s59 (left), U=s60 (middle),
          // V=s61 (right). Forcing all three to s59 earlier dropped the right
          // vertical border, leaving the Remarks column open on that side.
          for (const [col, style] of [['T', '59'], ['U', '60'], ['V', '61']] as [string, string][]) {
            rowBody = replaceCell(rowBody, col, r, `<c r="${col}${r}" s="${style}"/>`);
          }
        }

        sheet = sheet.replace(rowMatch[0], () => rowMatch[1] + rowBody + rowMatch[3]);
      }

      // ── Sub-total for this page (row 25) & Total this page/Grand Total (row 27) ──
      // Each sheet is one page, so the SUMs cover that sheet's own rows
      // 14-19. Row 26 (Total previous page) stays blank — nothing is carried
      // forward between sheets.
      const totalCols = ['J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'] as const;
      for (const trow of [25, 27]) {
        const tRowRe = new RegExp(`(<row r="${trow}"[^>]*>)(.*?)(</row>)`, 's');
        const tRowMatch = sheet.match(tRowRe);
        if (!tRowMatch) continue;
        let tBody = tRowMatch[2];
        for (const col of totalCols) {
          const cell = `<c r="${col}${trow}" s="97"><f>SUM(${col}14:${col}19)</f><v>${totals[col]}</v></c>`;
          const re1 = new RegExp(`<c r="${col}${trow}"[^>]*>[^<]*(?:<v>[^<]*</v>)?</c>`);
          const re2 = new RegExp(`<c r="${col}${trow}"[^>]*/>`);
          let out = tBody.replace(re1, () => cell);
          out = out.replace(re2, () => cell);
          if (out === tBody) out = tBody.replace(`<c r="M${trow}"`, () => cell + `<c r="M${trow}"`);
          tBody = out;
        }
        sheet = sheet.replace(tRowMatch[0], () => tRowMatch[1] + tBody + tRowMatch[3]);
      }

      // ── "Page X of Y" stamp (S1) — global page numbers across the whole list ──
      {
        const stamp = esc(`Page ${pageIdx + 1} of ${pages.length}`);
        const row1Re = /(<row r="1"[^>]*>)(.*?)(<\/row>)/s;
        const row1Match = sheet.match(row1Re);
        if (row1Match) {
          const row1Body = replaceCell(row1Match[2], 'S', 1, `<c r="S1" s="6" t="inlineStr"><is><t>${stamp}</t></is></c>`);
          sheet = sheet.replace(row1Match[0], () => row1Match[1] + row1Body + row1Match[3]);
        }
      }

      // ── A4 reclassification title for the active category (style s="16"
      // kept from the template; shared-string ref replaced with inline text)
      {
        const row4Re = /(<row r="4"[^>]*>)(.*?)(<\/row>)/s;
        const row4Match = sheet.match(row4Re);
        if (row4Match) {
          const row4Body = replaceCell(row4Match[2], 'A', 4, `<c r="A4" s="16" t="inlineStr"><is><t>${esc(catMeta.title)}</t></is></c>`);
          sheet = sheet.replace(row4Match[0], () => row4Match[1] + row4Body + row4Match[3]);
        }
      }

      // ── A10 Education label for the active STACODE range (style s="25"
      // kept from the template; shared-string ref replaced with inline text)
      if (eduLabel) {
        const row10Re = /(<row r="10"[^>]*>)(.*?)(<\/row>)/s;
        const row10Match = sheet.match(row10Re);
        if (row10Match) {
          const row10Body = replaceCell(row10Match[2], 'A', 10, `<c r="A10" s="25" t="inlineStr"><is><t>${esc(eduLabel)}</t></is></c>`);
          sheet = sheet.replace(row10Match[0], () => row10Match[1] + row10Body + row10Match[3]);
        }
      }

      built.push({ pageIdx, xml: sheet, count: data.length });
      } // end per-page fill loop

      // ── Assemble: one sheet per selected page in a single workbook ──
      // Sheets carry the Annex R-1 name for the active category + level
      // (e.g. "Annex R-1 PAL for MT ELEM"); extra pages get a " pN" suffix
      // (Excel caps names at 31 chars). Without a level tab the template's
      // own sheet name is kept and clones fall back to "Page N".
      // The first selected page reuses sheet1 (keeps the print area and
      // printer settings); the rest become sheet2, sheet3, …
      const sheetBase = level ? palSheetBase(palCategory, level) : null;
      zip.file('xl/worksheets/sheet1.xml', built[0].xml);
      const cloneNames: string[] = [];
      for (let k = 1; k < built.length; k++) {
        const n = k + 1;
        const nm = sheetBase ? palSheetName(sheetBase, n) : `Page ${built[k].pageIdx + 1}`;
        cloneNames.push(nm);
        zip.file(`xl/worksheets/sheet${n}.xml`, built[k].xml);
        // Point the clone at the template's printer settings so pageSetup
        // keeps working (same paper/scale/orientation as sheet1).
        if (sheetRelsTpl) zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, sheetRelsTpl);
      }

      // [Content_Types].xml — register each cloned sheet part.
      {
        const ctRaw = await zip.file('[Content_Types].xml')!.async('string');
        let extra = '';
        for (let k = 1; k < built.length; k++) {
          const n = k + 1;
          extra += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
        }
        zip.file('[Content_Types].xml', ctRaw.replace(
          /(<Override PartName="\/xl\/worksheets\/sheet1\.xml"[^>]*>)/,
          (_m, g1) => `${g1}${extra}`,
        ));
      }

      // xl/_rels/workbook.xml.rels — one worksheet relationship per clone.
      // xl/workbook.xml — <sheets> entries + per-sheet Print_Area.
      const ridFor: number[] = [];
      {
        const relsRaw = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
        const used = [...relsRaw.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
        let nextRId = used.length > 0 ? Math.max(...used) + 1 : 1;
        let extraRels = '';
        for (let k = 1; k < built.length; k++) {
          const n = k + 1;
          ridFor.push(nextRId);
          extraRels += `<Relationship Id="rId${nextRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`;
          nextRId++;
        }
        zip.file('xl/_rels/workbook.xml.rels', relsRaw.replace(/(<\/Relationships\s*>)/, (_m, g1) => `${extraRels}${g1}`));
      }
      {
        const wbSheetsRaw = await zip.file('xl/workbook.xml')!.async('string');
        const usedIds = [...wbSheetsRaw.matchAll(/<sheet[^>]*sheetId="(\d+)"/g)].map((m) => parseInt(m[1], 10));
        let nextSheetId = usedIds.length > 0 ? Math.max(...usedIds) + 1 : 2;
        let extraSheets = '';
        let extraNames = '';
        for (let k = 1; k < built.length; k++) {
          const nm = cloneNames[k - 1];
          extraSheets += `<sheet name="${nm}" sheetId="${nextSheetId}" r:id="rId${ridFor[k - 1]}"/>`;
          // localSheetId is the 0-based sheet index → k for the k-th clone.
          extraNames += `<definedName name="_xlnm.Print_Area" localSheetId="${k}">'${nm}'!$A$1:$V$38</definedName>`;
          nextSheetId++;
        }
        let patchedWb2 = wbSheetsRaw.replace(/(<\/sheets\s*>)/, (_m, g1) => `${extraSheets}${g1}`);
        // Rename sheet1 to the Annex R-1 name for this category + level, and
        // point its Print_Area at the new name (clones already use theirs).
        if (sheetBase) {
          patchedWb2 = patchedWb2.replace(/(<sheet name=")[^"]*(" sheetId="1"[^>]*\/>)/, (_m, g1, g2) => `${g1}${sheetBase}${g2}`);
          patchedWb2 = patchedWb2.replace(/(<definedName name="_xlnm\.Print_Area" localSheetId="0">')[^']*(')/, (_m, g1, g2) => `${g1}${sheetBase}${g2}`);
        }
        if (extraNames) {
          if (/<\/definedNames\s*>/.test(patchedWb2)) {
            patchedWb2 = patchedWb2.replace(/(<\/definedNames\s*>)/, (_m, g1) => `${extraNames}${g1}`);
          } else {
            patchedWb2 = patchedWb2.replace(/(<\/workbook\s*>)/, (_m, g1) => `<definedNames>${extraNames}</definedNames>${g1}`);
          }
        }
        // ── "Set precision as displayed" (Excel Options > Advanced > When
        // calculating this workbook) ──
        // In OOXML this checkbox is <calcPr fullPrecision="0"/> (false = use
        // displayed values instead of stored values). fullCalcOnLoad forces a
        // full recalculation on open. Leave <workbookPr/> untouched.
        if (/<calcPr[^>]*\/?>/.test(patchedWb2)) {
          patchedWb2 = patchedWb2.replace(/<calcPr[^>]*\/?>/, '<calcPr calcId="191029" fullCalcOnLoad="1" fullPrecision="0"/>');
        } else {
          patchedWb2 = patchedWb2.replace(/(<\/workbook\s*>)/, '<calcPr calcId="191029" fullCalcOnLoad="1" fullPrecision="0"/>$1');
        }
        zip.file('xl/workbook.xml', patchedWb2);
      }

      // Write back to zip — formulas need recalculation on open so M-S stay
      // correct after the user fills G/H/K/L in Excel.
      // NOTE: styles are intentionally left exactly as the template's. Do NOT
      // append custom xf/numFmt entries here — an xf without a matching
      // numFmt (or a cellXfs whose count doesn't match its children) makes
      // Excel report "a problem with some content" and offer repair.
      // Precision-as-displayed already comes from <calcPr fullPrecision="0"/>.

      const outBuf = await zip.generateAsync({ type: 'blob' });
      const scopeTag = sel.length === pages.length ? '' : sel.length === 1 ? `_p${sel[0] + 1}` : '_custom';
      const fname = `PAL_${catMeta.fileTag}${(divisionLabel.division.replace(/[^A-Z0-9]+/gi, '_') || 'Division')}_${new Date().toISOString().slice(0, 10)}${scopeTag}.xlsx`;
      saveAs(outBuf, fname);
      const totalEmps = built.reduce((a, b) => a + b.count, 0);
      const sheetList = built.map((b) => b.pageIdx + 1).join(', ');
      setMessage({ tone: 'ok', text: `Exported ${built.length} page${built.length === 1 ? '' : 's'} (${catMeta.title}; page ${sheetList}; ${totalEmps} employee${totalEmps === 1 ? '' : 's'}) to ${fname} — one sheet per page. Fill columns G (DepEd Approved Position), H (Date), K-L (Approved SG/Rate) — columns M-S compute automatically.` });
    } catch (err) {
      setMessage({ tone: 'err', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setExporting(false);
    }
  }

  // ── Endorsement export — 1st Indorsement .docx from the PAL template ─────
  // Reuses the exact "Indorsement PAL elem.docx" layout (same letterhead,
  // formatting and signatures) and only patches word/document.xml in-memory:
  //   • date paragraph → the picked date (e.g. "April 14, 2026")
  //   • body phrase    → "elementary / junior high school / senior high
  //                       school teachers" matching that letter's level
  //   • employee list  → a two-column table (Name | School), up to PAGE_SIZE
  //                       (6) rows per letter; the school comes from the
  //                       employee's own STACODE in Employee Records.
  // Rows are filtered and separated by each employee's own STACODE range, so
  // an ELEM / JHS / SHS letter never mixes levels. Each level gets its own
  // .docx (letters for that level split into PAGE_SIZE(6)-row pages), and all
  // three are packed into one downloadable ZIP.
  async function exportIndorsement() {
    const cand = endorseRows.filter((r) => includeMap[r.uid] !== false);
    if (cand.length === 0) {
      setMessage({ tone: 'warn', text: 'Nothing to endorse — check at least one encoded employee across the ELEM / JHS / SHS lists.' });
      return;
    }
    const dateStr = formatLongDate(new Date(`${indorsementDate}T00:00:00`));
    // Partition endorsable employees by the STACODE-derived school level.
    const byLevel: Partial<Record<PalLevel, EndorseRow[]>> = {};
    for (const r of cand) (byLevel[r.level] ??= []).push(r);
    const presentLevels = (['elementary', 'junior', 'senior'] as PalLevel[]).filter((l) => (byLevel[l]?.length ?? 0) > 0);

    setExporting(true); setMessage(null);
    try {
      const { default: JSZip } = await import('jszip');
      const resp = await fetch('/Indorsement_PAL.docx');
      if (!resp.ok) throw new Error(`Could not load the Indorsement template (${resp.status}).`);
      const templateBuf = await resp.arrayBuffer();
      const zip = await JSZip.loadAsync(templateBuf);
      const xml = await zip.file('word/document.xml')!.async('string');

      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      // Bookman Old Style 12pt (sz 24 half-points) — same as the template body.
      const rPr = '<w:rPr><w:rFonts w:ascii="Bookman Old Style" w:hAnsi="Bookman Old Style" w:cs="Times New Roman" /><w:sz w:val="24" /><w:szCs w:val="24" /></w:rPr>';
      const rPrB = '<w:rPr><w:rFonts w:ascii="Bookman Old Style" w:hAnsi="Bookman Old Style" w:cs="Times New Roman" /><w:b/><w:bCs/><w:sz w:val="24" /><w:szCs w:val="24" /></w:rPr>';

      // Split the template's single-letter document into a reusable letter core
      // plus the fixed prefix/suffix, so the letters chain into one file.
      const bodyOpen = '<w:body>';
      const bodyIdx = xml.indexOf(bodyOpen);
      const sectIdx = xml.lastIndexOf('<w:sectPr');
      if (bodyIdx === -1 || sectIdx === -1) throw new Error('The Indorsement template layout is not recognized.');
      const prefix = xml.slice(0, bodyIdx + bodyOpen.length);
      const core = trimTrailingBlankParagraphs(xml.slice(bodyIdx + bodyOpen.length, sectIdx));
      const suffix = xml.slice(sectIdx);

      // Date run — replace the whole "April 14, 2026" paragraph (keeps the
      // paragraph properties: tab at 6255 + centered) and the run font.
      const dateRe = /<w:p[^>]*>(?:(?!<\/w:p>).)*?April 14(?:(?!<\/w:p>).)*?<\/w:p>/s;
      // The two sample list entries — replaced by the Name | School table.
      const listRe = /<w:p[^>]*>(?:(?!<\/w:p>).)*?Barairo(?:(?!<\/w:p>).)*?<\/w:p>\s*<w:p[^>]*>(?:(?!<\/w:p>).)*?Villarao(?:(?!<\/w:p>).)*?<\/w:p>/s;
      // Page break between consecutive letters.
      const pageBreak = `<w:p><w:pPr><w:rPr>${rPr}</w:rPr></w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:br w:type="page"/></w:r></w:p>`;

      const cell = (w: number, vAlign: 'top', runs: string) =>
        `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="${vAlign}"/></w:tcPr><w:p>${runs}</w:p></w:tc>`;
      const row = (n: string, s: string) => `<w:tr>${cell(5300, 'top', `<w:r>${rPr}<w:t xml:space="preserve">${n}</w:t></w:r>`)}${cell(3700, 'top', `<w:r>${rPr}<w:t xml:space="preserve">${s}</w:t></w:r>`)}</w:tr>`;
      // Borderless two-column table = the "Name | School" columns of the letter.
      const buildTable = (rows: EndorseRow[]) => {
        const trs = rows.map((r, i) => {
          const name = esc(String(r.incumbent || '').trim());
          // School strictly from the employee's STACODE in Employee Records.
          const school = endorserSchoolOf(r);
          return row(`${i + 1}.  ${name}`, school ? esc(school) : '—');
        }).join('');
        return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr><w:tblGrid><w:gridCol w:w="5300"/><w:gridCol w:w="3700"/></w:tblGrid>${trs}</w:tbl>`;
      };

      // One letter per page for a given level.
      const letterXml = (letter: { rows: EndorseRow[]; level: PalLevel }): string => {
        let out = core;
        // 1) Date
        const dm = out.match(dateRe);
        if (dm) {
          const pPr = dm[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '<w:pPr/>';
          out = out.replace(dm[0], `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(dateStr)}</w:t></w:r></w:p>`);
        }
        // 2) Level phrase — elementary is already the template's default text.
        const lvlLabel = indorsementLevelPhrase(letter.level);
        if (lvlLabel !== 'elementary') {
          out = out.replace('of the following elementary ', `of the following ${lvlLabel} `);
        }
        // 2b) Forwarded-to — replace the template's addressee run group with the
        //     typed "Forwarded To" line (left untouched when blank).
        if (forwardedTo.trim()) {
          const tok1 = '>CARLITO D. ROCAFORT</w:t></w:r>';
          const idx1 = out.indexOf(tok1);
          if (idx1 !== -1) {
            // The addressee run's opening tag — "<w:r" prefix alone would also
            // match "<w:rFonts"/"<w:rPr", so anchor on the full tag.
            const start = Math.max(out.lastIndexOf('<w:r ', idx1), out.lastIndexOf('<w:r>', idx1));
            const tok2 = '> DepEd Region IV-A CALABARZON, </w:t></w:r>';
            const idx2 = out.indexOf(tok2);
            if (start !== -1 && idx2 !== -1) {
              const end = idx2 + tok2.length;
              // Trailing space keeps a gap before "the attached Plantilla
              // Allocation List (PAL)" that follows the addressee in the body.
              out = out.slice(0, start)
                + `<w:r>${rPrB}<w:t xml:space="preserve">${esc(forwardedTo.trim() + ' ')}</w:t></w:r>`
                + out.slice(end);
            }
          }
        }
        // 2c) Signatory — swap the template signature name for the typed one.
        if (endorserName.trim()) {
          out = out.replace('MERTHEL M. EVARDOME, CESO V', esc(endorserName.trim()));
        }
        // 3) Employee list → Name | School columns (max 6 rows for this letter).
        const lm = out.match(listRe);
        if (lm) {
          out = out.replace(lm[0], buildTable(letter.rows));
        }
        return out;
      };
      // One letter per six-row, single-position page for a given level.
      const levelDocXml = (lvl: PalLevel, rows: EndorseRow[]): string => {
        const pages = chunkEndorsementPages(rows, PAGE_SIZE)
          .map((pageRows) => letterXml({ rows: pageRows, level: lvl }));
        return prefix + pages.join(pageBreak) + suffix;
      };

      // One ZIP containing a .docx per level (ELEM / JHS / SHS).
      const idZip = new JSZip();
      const fdate = dateStr.replace(/[^A-Z0-9]+/gi, '_');
      for (const lvl of presentLevels) {
        const docZip = new JSZip();
        for (const name of Object.keys(zip.files)) {
          if (name.endsWith('/')) continue;
          docZip.file(name, await zip.files[name].async('uint8array'));
        }
        docZip.file('word/document.xml', levelDocXml(lvl, byLevel[lvl]!));
        const docBlob = await docZip.generateAsync({ type: 'blob' });
        idZip.file(`1st_Indorsement_PAL_${PAL_LEVELS[lvl].short}_${fdate}.docx`, docBlob);
      }
      const outBuf = await idZip.generateAsync({ type: 'blob' });
      const fname = `1st_Indorsement_PAL_${fdate}.zip`;
      saveAs(outBuf, fname);

      const perLevel = presentLevels.map((l) => `${PAL_LEVELS[l].short} × ${byLevel[l]!.length}`).join(' · ');
      const totalLetters = presentLevels.reduce((s, l) => s + Math.ceil(byLevel[l]!.length / PAGE_SIZE), 0);
      setMessage({ tone: 'ok', text: `Saved ${fname} — 1 ZIP with ${presentLevels.length} Indorsement file${presentLevels.length === 1 ? '' : 's'} (one .docx per level; ${cand.length} employee${cand.length === 1 ? '' : 's'}: ${perLevel}; ${totalLetters} letter${totalLetters === 1 ? '' : 's'}, max ${PAGE_SIZE} per letter). Letters are filtered and separated by each employee's STACODE (ELEM / JHS / SHS), schools from Employee Records. The attached PAL is exported separately from the Export Excel button.` });
    } catch (err) {
      setMessage({ tone: 'err', text: `Indorsement failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setExporting(false);
    }
  }

  // Unified ribbon tabs — navigation left, actions right. The three category
  // tabs switch the reclassification category; the school-level and category
  // control groups both stay pinned in the top panel.
  const RIBBON_TABS = [
    ...PAL_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      active: !endorsementMode && palCategory === c.key,
      onClick: () => { setEndorsementMode(false); setPalCategory(c.key); },
    })),
    {
      key: 'endorsement',
      label: 'Endorsement',
      active: endorsementMode,
      onClick: () => setEndorsementMode(true),
    },
  ];
  const activeTabLabel = RIBBON_TABS.find((t) => t.active)?.label ?? PAL_CATEGORIES[0].label;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full flex flex-col gap-4">
      {/* ── Ribbon panel ────────────────────────────────────────────────────
       * One wrapper replaces the old header card + filter card.
       * Top strip: brand + title + badges.
       * Ribbon tabs: Reclassification + School Level as segmented tabs (rolls up
       *   into a compact tab strip on smaller viewports).
       * Ribbon groups: big segmented control buttons under each tab.
       * Trailing: the action buttons.
       * ─────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col">
        {/* ── Unified ribbon strip: nav tabs left · action buttons right ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-gray-100 dark:bg-slate-800/70 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          {/* Navigation tabs — desktop */}
          <div className="hidden md:flex items-center space-x-2 pr-3 mr-1 border-r border-gray-300 dark:border-slate-600">
            {RIBBON_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.onClick}
                className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors whitespace-nowrap ${
                  t.active
                    ? 'bg-white text-slate-900 border-gray-300 shadow-sm'
                    : 'border-transparent text-slate-600 hover:bg-gray-200 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Navigation tabs — mobile dropdown */}
          <div className="relative block md:hidden pr-2 mr-1 border-r border-gray-300 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setNavOpen(!navOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 bg-white border border-gray-300 dark:border-slate-600 shadow-sm hover:bg-gray-200 transition-colors"
            >
              <Menu className="w-4 h-4" /> {activeTabLabel}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${navOpen ? 'rotate-180' : ''}`} />
            </button>
            {navOpen && (
              <div className="absolute left-0 top-full mt-1 z-40 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1">
                {RIBBON_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { t.onClick(); setNavOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                      t.active ? 'bg-gray-100 text-slate-900' : 'text-slate-600 hover:bg-gray-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* School Level dropdown — top panel control */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLevelOpen(!levelOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  levelOpen
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {level ? PAL_LEVELS[level].label : 'School Level'}
                <ChevronDown className={`h-3 w-3 transition-transform ${levelOpen ? 'rotate-180' : ''}`} />
              </button>

              {levelOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1">
                  {PAL_LEVEL_ITEMS.map((it) => {
                    const active = level === it.key;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => { setLevel(it.key); setLevelOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {it.short} · STACODE {String(PAL_LEVELS[it.key].range[0]).padStart(3, '0')}–{String(PAL_LEVELS[it.key].range[1]).padStart(3, '0')}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Spacer pushes the actions to the right */}
          <div className="flex-1" />

          {/* Actions — right aligned */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search → Add (quick-encode) */}
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleQuickEncode(); }}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input ref={quickRef} value={quickEmpno} onChange={(e) => { setQuickEmpno(e.target.value); setQuickOpen(true); }} onFocus={() => setQuickOpen(true)} onBlur={() => setTimeout(() => setQuickOpen(false), 150)}
                  placeholder="Search name or EMPNO — Enter to add…"
                  className="w-64 min-w-[9rem] border border-gray-300 dark:border-slate-600 rounded-md px-2 py-1 pl-8 text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring focus:ring-blue-400/40 placeholder:text-slate-400" />
                {quickOpen && quickQuery && !resolving && suggestions.length > 0 && (
                  <div className="absolute z-30 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1">
                    {suggestions.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => addSuggestion(s)}
                        onMouseDown={(ev) => ev.preventDefault()}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{incumbentName(s)}</span>
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{employeeNo(s)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {quickOpen && quickQuery && !resolving && !/^\d+$/.test(quickQuery) && suggestions.length === 0 && (
                  <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl px-3 py-2.5">
                    <p className="text-xs text-slate-400">No matching employee{quickQuery.length < 2 ? ' — keep typing…' : ` — try a different name or an EMPNO`}</p>
                  </div>
                )}
              </div>
              <button type="submit" disabled={resolving || !quickEmpno.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
              </button>
            </form>

            <span className="hidden lg:inline-block h-5 w-px bg-gray-300 dark:bg-slate-600" />

            <button onClick={clearRows} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button onClick={refreshMonthlyFromEmployees} disabled={rows.length === 0 || refreshingRates} title="Rewrite every encoded row's Monthly Rate from the employee's current Basic Salary in Employee Records" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingRates ? 'animate-spin' : ''}`} /> {refreshingRates ? 'Updating…' : 'Update Monthly Rate'}
            </button>
            <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
              <span className="hidden xl:inline">Months:</span>
              <input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(24, parseInt(e.target.value) || 12)))}
                className="w-14 px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-center text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring focus:ring-blue-400/40" />
            </label>
            <button onClick={() => { setExportScope('all'); setShowExportDlg(true); }} disabled={rows.length === 0 || exporting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Excel
            </button>
            <button onClick={openNewEmp} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 transition-colors">
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" /> New Employee
            </button>
            <button onClick={addBlankRow} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 shadow-sm transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>

            {/* Full-window toggle — hides the app chrome so the PAL fills the
                viewport; the same button (and Esc) restores the app frame. */}
            {onMaximizeChange && (
              <button onClick={() => onMaximizeChange(!maximize)} title={maximize ? 'Restore window (Esc)' : 'Maximize window'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 transition-colors">
                {maximize ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{maximize ? 'Restore' : 'Maximize'}</span>
              </button>
            )}
          </div>
        </div>

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
      ) : null}

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

      {/* Endorsement panel — replaces the grid while the Endorsement tab is
          active. A flat toolbar (Date / Signatory / Forwarded To) above a
          Name | School list of the encoded employees, filtered by the
          top-panel STACODE (School Level) control and shown under that
          STACODE range's header. */}
      {endorsementMode ? (
<div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white items-center gap-2">
              1st Indorsement
            </h3>

            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              Date
              <input type="date" value={indorsementDate} onChange={(e) => setIndorsementDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400" />
            </label>

            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              Signatory
              <input type="text" value={endorserName} onChange={(e) => setEndorserName(e.target.value)} placeholder="Signed by…"
                className="w-48 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400" />
            </label>

            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              Forwarded To
              <input type="text" value={forwardedTo} onChange={(e) => setForwardedTo(e.target.value)} placeholder="Addressee…"
                className="w-48 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400" />
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setIncludeMap(Object.fromEntries(endorseRows.map((r) => [r.uid, true])))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Select all
              </button>
              <button type="button" onClick={() => setIncludeMap(Object.fromEntries(endorseRows.map((r) => [r.uid, false])))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Select none
              </button>
              <button type="button" onClick={exportIndorsement} disabled={exporting || includedCount === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exporting ? 'Generating…' : `Download Indorsements${endorseLetterCount ? ` (${endorseLetterCount})` : ''}`}
              </button>
            </div>
          </div>

          {/* Name | School list — grouped per STACODE (ELEM / JHS / SHS) */}
          <div className="flex-1 min-h-0 overflow-auto">
            {shownEndorseRows.length === 0 ? (
              <div className="flex-1 h-full flex items-center justify-center text-center px-6">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <ListTree className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nothing to endorse</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Go to the Encoding tabs (ELEM / JHS / SHS) and add employees to the lists.</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                    <th className="px-4 py-2 w-12">#</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-4 py-2">School</th>
                    <th className="px-4 py-2 w-64">Assigned School</th>
                  </tr>
                </thead>
                <tbody>
                  {(['elementary', 'junior', 'senior'] as PalLevel[])
                    .filter((lvl) => shownEndorseRows.some((r) => r.level === lvl))
                    .map((lvl) => {
                      const lvlRows = shownEndorseRows.filter((r) => r.level === lvl);
                      return (
                        <Fragment key={lvl}>
                          <tr className="bg-slate-100 dark:bg-slate-800/60">
                            <td colSpan={4} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {PAL_LEVELS[lvl].short} · STACODE {String(PAL_LEVELS[lvl].range[0]).padStart(3, '0')}–{String(PAL_LEVELS[lvl].range[1]).padStart(3, '0')}
                            </td>
                          </tr>
                          {lvlRows.map((r, i) => {
                            const school = endorserSchoolOf(r);
                            return (
                              <tr key={r.uid} className="border-b border-slate-50 dark:border-slate-800">
                                <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                                <td className="px-2 py-2.5">
                                  <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{r.incumbent}</p>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-[13px] text-slate-500 dark:text-slate-300">{school || '—'}</p>
                                </td>
                                <td className="px-4 py-2.5">
                                  <input
                                    value={assignedSchoolByUid[r.uid] ?? ''}
                                    onChange={(e) => setAssignedSchoolByUid((m) => ({ ...m, [r.uid]: e.target.value }))}
                                    placeholder={school || 'Add assigned school…'}
                                    title="Typed school overrides the auto-resolved one and is written into the letter"
                                    className="w-full px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[12px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring focus:ring-blue-400/40"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex-1 min-h-0 flex flex-col shadow-sm">
        {rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <ListTree className="w-6 h-6 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No rows yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Search a name or type an EMPNO above (or click Add Row) to start encoding. Rows autosave to this division's list in PocketBase.</p>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No rows match &ldquo;{rowFilter}&rdquo;</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Clear the filter to see all {rows.length} encoded row{rows.length === 1 ? '' : 's'}.</p>
              <button type="button" onClick={() => applyRowFilter('')} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Clear filter
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Find box + save status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {rowFilter ? (
                <>{filteredRows.length} of {rows.length} row{rows.length === 1 ? '' : 's'} match &ldquo;{rowFilter}&rdquo;</>
              ) : (
                <><strong className="text-slate-700 dark:text-slate-200">{rows.length}</strong> encoded row{rows.length === 1 ? '' : 's'} · autosaved to PocketBase ({palCategory} · {level ? PAL_LEVELS[level].label : ''})</>
              )}
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={rowFilter} onChange={(e) => applyRowFilter(e.target.value)} placeholder="Find by name, EMPNO or item no…"
                className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400" />
              {rowFilter && (
                <button type="button" onClick={() => applyRowFilter('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Table area — sized to its content so all PAGE_SIZE (6) rows of the
              current page are visible at once; only horizontal scrolling is
              kept for wide columns. The page scrolls vertically instead. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] md:min-w-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur text-slate-500 dark:text-slate-400 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2.5 w-32">EMPNO</th>
                  <th className="hidden md:table-cell text-left px-4 py-2.5 min-w-[17rem]">Item No. (per latest PSIPOP) <span className="text-slate-400 normal-case font-medium">(1)</span></th>
                  <th className="hidden md:table-cell text-left px-4 py-2.5">Org. Code <span className="text-slate-400 normal-case font-medium">(2)</span></th>
                  <th className="text-left px-4 py-2.5 min-w-[16rem]">Name of Incumbent <span className="text-slate-400 normal-case font-medium">(5)</span></th>
                  <th className="text-left px-4 py-2.5 min-w-[14rem]">Position Title <span className="text-slate-400 normal-case font-medium">(6)</span></th>
                  <th className="hidden md:table-cell text-left px-4 py-2.5 min-w-[12rem]">DepEd Approved Position <span className="text-slate-400 normal-case font-medium">(7)</span></th>
                  <th className="hidden md:table-cell text-center px-3 py-2.5">Ranking Points</th>
                  <th className="hidden md:table-cell text-center px-4 py-2.5">SG/Step <span className="text-slate-400 normal-case font-medium">(9)</span></th>
                  <th className="text-right px-4 py-2.5">Monthly Rate <span className="text-slate-400 normal-case font-medium">(10)</span></th>
                  <th className="hidden md:table-cell text-center px-3 py-2.5">Approved SG <span className="text-slate-400 normal-case font-medium">(11)</span></th>
                  <th className="hidden md:table-cell text-right px-3 py-2.5">Approved Rate <span className="text-slate-400 normal-case font-medium">(12)</span></th>
                  <th className="hidden md:table-cell text-right px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody key={isCompact ? 'compact' : 'full'} className="animate-fade-in">
                {pagedItems.map((r) => {
                  const lookupHint = r.employeeFound && !r.psipopMatched;
                  return (
                    <tr key={r.uid} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{r.empno || '—'}</span>
                        {r.employeeFound && <button className="ml-1.5 align-middle" onClick={() => removeRow(r.uid)}><X className="w-3.5 h-3.5 text-slate-300 hover:text-rose-500" /></button>}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
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
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-[13px] text-slate-600 dark:text-slate-300">{r.orgCode || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.incumbent ? <span className="font-medium text-slate-800 dark:text-slate-100 text-[13px]">{r.incumbent}</span>
                          : r.employeeFound ? <span className="text-slate-400 text-xs">—</span>
                          : <span className="inline-flex items-center gap-1 text-rose-600 text-xs"><UserX className="w-3.5 h-3.5" /> not found</span>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700 dark:text-slate-200">{r.positionTitle || <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}</td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div>
                          <input type="text" value={approvedPosDropdown === r.uid ? approvedPosSearch : (r.approvedPosition || '')} placeholder="—"
                            onFocus={(e) => openApprovedPos(r.uid, r.approvedPosition || '', e.currentTarget)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (approvedPosDropdown !== r.uid) openApprovedPos(r.uid, v, e.currentTarget);
                              else setApprovedPosSearch(v);
                            }}
                            onBlur={() => setTimeout(() => closeApprovedPos(), 250)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { closeApprovedPos(); e.currentTarget.blur(); } }}
                            className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-300" />
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">
                        <input type="number" min={0} step="0.01" inputMode="decimal" value={r.rankingPoints ?? ''} placeholder="—"
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((rs) => rs.map((x) => x.uid === r.uid ? { ...x, rankingPoints: v === '' ? undefined : Number(v) } : x));
                          }}
                          className="w-24 px-2 py-1 rounded-md border border-slate-200 text-[12px] text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-300" />
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-center text-[13px]">{r.grade > 0 ? fmtGradeStep(r.grade, r.step) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[13px] tabular-nums">{r.monthly > 0 ? currency(r.monthly) : '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-center text-[13px] text-emerald-700 dark:text-emerald-300 font-medium">{r.approvedGrade || '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-right text-[13px] tabular-nums text-emerald-700 dark:text-emerald-300">{r.approvedMonthly ? currency(r.approvedMonthly) : '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-right">
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
          <Pagination pagination={{ page, setPage, totalPages, total: rows.length, pageSize: PAGE_SIZE }} label="employees" />
          </>
        )}
      </div>
      )}

      {/* Approved-position menu — fixed overlay so the table's scroll box and
          pagination footer can never clip it. Anchored to the focused input. */}
      {approvedPosDropdown && apprAnchor && (() => {
        const row = rows.find((x) => x.uid === approvedPosDropdown);
        if (!row) return null;
        const matches = allPositions.filter((p) => {
          const q = approvedPosSearch.toUpperCase();
          if (!q) return true;
          return p.position_title.toUpperCase().includes(q) || p.position_code.toUpperCase().includes(q) || p.position_name.toUpperCase().includes(q);
        }).slice(0, 50);
        return (
          <div data-appr-dropdown
            className="fixed z-[60] w-auto min-w-[400px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-visible"
            style={{ left: apprAnchor.left, ...(apprAnchor.top != null ? { top: apprAnchor.top } : { bottom: apprAnchor.bottom }) }}>
            {matches.map((p) => (
              <button key={p.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => {
                  const sg = p.salary_grade || 0;
                  const step1Salary = p.step1 || 0;
                  setRows((rs) => rs.map((x) => x.uid === row.uid ? {
                    ...x,
                    approvedPosition: p.position_title,
                    approvedGrade: sg > 0 ? `${sg} S1` : '',
                    approvedMonthly: step1Salary,
                  } : x));
                  closeApprovedPos();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0">
                <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300">{p.position_code}</span>
                <span className="text-[12px] text-slate-700 dark:text-slate-200 ml-2">{p.position_title}</span>
                <span className="text-[10px] text-slate-400 ml-1">{p.personnel_category}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-slate-400">No positions match "{approvedPosSearch}"</div>
            )}
          </div>
        );
      })()}

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

      {showExportDlg && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-600" /> Export PAL to Excel
                </h3>
                <p className="text-[11px] text-slate-500">{catMeta.title} · {exportInfo.count} employee{exportInfo.count === 1 ? '' : 's'} · {exportInfo.totalPages} page{exportInfo.totalPages === 1 ? '' : 's'} · one sheet per page, single file</p>
              </div>
              <button onClick={() => setShowExportDlg(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${exportScope === 'current' ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                <input type="radio" name="pal-export-scope" checked={exportScope === 'current'} onChange={() => setExportScope('current')} className="accent-emerald-600" />
                <span className="text-[13px] text-slate-700 dark:text-slate-200">Current page only <span className="text-slate-400">— page {exportInfo.cur} of {exportInfo.totalPages}</span></span>
              </label>
              <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${exportScope === 'all' ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                <input type="radio" name="pal-export-scope" checked={exportScope === 'all'} onChange={() => setExportScope('all')} className="accent-emerald-600" />
                <span className="text-[13px] text-slate-700 dark:text-slate-200">All pages <span className="text-slate-400">— {exportInfo.totalPages} sheet{exportInfo.totalPages === 1 ? '' : 's'}</span></span>
              </label>
              <label className={`block px-3 py-2 rounded-lg border transition-colors ${exportScope === 'custom' ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                <span className="flex items-center gap-2.5 cursor-pointer" onClick={() => setExportScope('custom')}>
                  <input type="radio" name="pal-export-scope" checked={exportScope === 'custom'} onChange={() => setExportScope('custom')} className="accent-emerald-600" />
                  <span className="text-[13px] text-slate-700 dark:text-slate-200">Custom pages</span>
                </span>
                <input value={customSpec} onChange={(e) => { setCustomSpec(e.target.value); setExportScope('custom'); }} onFocus={() => setExportScope('custom')}
                  placeholder="e.g. 1, 3, 5-7"
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white dark:bg-slate-800" />
                <span className="mt-1 block text-[11px] text-slate-400">
                  {customSpec.trim()
                    ? exportInfo.custom.length > 0
                      ? `Sheets for page${exportInfo.custom.length === 1 ? '' : 's'} ${exportInfo.custom.map((i) => i + 1).join(', ')}`
                      : 'No valid pages — use numbers/ranges like "1, 3, 5-7".'
                    : `1–${exportInfo.totalPages}, comma-separated; ranges allowed.`}
                </span>
              </label>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button onClick={() => setShowExportDlg(false)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={exportExcel} disabled={exporting || (exportScope === 'custom' && exportInfo.custom.length === 0)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export {exportScope === 'current' ? 'current page' : exportScope === 'all' ? (exportInfo.totalPages === 1 ? '1 sheet' : `all ${exportInfo.totalPages} sheets`) : `${exportInfo.custom.length} sheet${exportInfo.custom.length === 1 ? '' : 's'}`}
              </button>
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

              <label className="block">
                <span className="block text-[11px] font-medium text-slate-500 mb-1">
                  STACODE — School * <span className="text-slate-400 normal-case">({level ? `${PAL_LEVELS[level].short} ${padStacode(PAL_LEVELS[level].range[0])}–${padStacode(PAL_LEVELS[level].range[1])}` : 'any'})</span>
                </span>
                <input list="pal-newemp-schools" value={newEmp.stacode}
                  onChange={(e) => { setNewEmp({ ...newEmp, stacode: e.target.value }); setNewEmpErr(''); }}
                  placeholder="e.g. 019"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                <datalist id="pal-newemp-schools">
                  {schoolOptions.map((s) => <option key={s.stacode} value={s.stacode}>{s.name}</option>)}
                </datalist>
                <span className={`mt-1 block text-[11px] ${newEmpSchool ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                  {newEmpSchool
                    ? `${newEmpSchool.name} — the record is saved to Employee Records in this school's division.`
                    : schoolOptions.length > 0
                      ? `${schoolOptions.length} school${schoolOptions.length === 1 ? '' : 's'} in this list — type or pick a STACODE.`
                      : 'Type the school STACODE — Employee Records needs it.'}
                </span>
              </label>

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
                  <div className="absolute z-50 left-full top-0 w-auto min-w-[350px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg ml-1 overflow-visible">
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
                  <div className="absolute z-50 left-full top-0 w-auto min-w-[400px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg ml-1 overflow-visible">
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
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button onClick={() => setShowNewEmp(false)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={saveNewEmployee} disabled={newEmpBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {newEmpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} {newEmpBusy ? 'Saving…' : 'Save & Add'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
