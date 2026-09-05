import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Pencil, Trash2, X, Upload, Download, FileText,
  Copy, AlertTriangle, AlertCircle, CheckCircle2,
  FileSpreadsheet, Table2, Info, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/pb';
import { downloadFile, currency, generateCsv, generateExcel, generateDedfileDbf } from '@/lib/reports';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { validateUpload } from '@/lib/uploadSecurity';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { recomputeEmployeeNetPay, bulkRecomputeNetPay } from '@/lib/recompute';
import type { Employee, PayrollDeduction, DeductionCode, PayrollGroup } from '@/types/payroll';
import { useServerPagination } from '@/lib/useServerPagination';
import { Pagination } from '@/components/Pagination';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';

// ── 49-column spec ─────────────────────────────────────────────
interface DedfileRow {
  P: string; YY: string; MM: string; DD: string; HR: string; MIN: string; SEC: string;
  REGCODE: string; DIVCODE: string; STACODE: string; EMPNO: string; FNAME: string;
  MI: string; LNAME: string; APPEL: string; NETPAY: number; DEDCODE: string;
  POLICYNO: string; DEDID: string; EFFMM: string; EFFYY: string; TERMM: string;
  TERYY: string; DEDAMT: number; POLICYDATE: string | null; AGENT: string;
  ABSNO: number; UNDERHR: number; UNDERMIN: number; STATUS: string; UPDCODE: string;
  UPDATE: string | null; PAYDATE: string | null; EDITOR: string; PRINCIPAL: number;
  INTEREST: number; CHARGES: number; PROCEEDS: number; TYPE: string; AGENCY: string;
  BILL: string; ABMM: string; ABYY: string; OLDCODE: string; HIREDATE: string | null;
  BIRTHDATE: string | null; GSIS_BPN: string; QS: string; ID: string;
  _dbId?: string;
  _employeeId?: string | null;
  _dedType?: string;
}

const COLUMN_LIST: { key: keyof DedfileRow; label: string; group: string; numeric?: boolean; date?: boolean; sortable?: boolean }[] = [
  { key: 'P',          label: 'P',          group: 'System' },
  { key: 'YY',         label: 'YY',         group: 'System' },
  { key: 'MM',         label: 'MM',         group: 'System' },
  { key: 'DD',         label: 'DD',         group: 'System' },
  { key: 'HR',         label: 'HR',         group: 'System' },
  { key: 'MIN',        label: 'MIN',        group: 'System' },
  { key: 'SEC',        label: 'SEC',        group: 'System' },
  { key: 'REGCODE',    label: 'REGCODE',    group: 'Employee' },
  { key: 'DIVCODE',    label: 'DIVCODE',    group: 'Employee' },
  { key: 'STACODE',    label: 'STACODE',    group: 'Employee',   sortable: true },
  { key: 'EMPNO',      label: 'EMPNO',      group: 'Employee',   sortable: true },
  { key: 'FNAME',      label: 'FNAME',      group: 'Employee' },
  { key: 'MI',         label: 'MI',         group: 'Employee' },
  { key: 'LNAME',      label: 'LNAME',       group: 'Employee',   sortable: true },
  { key: 'APPEL',      label: 'APPEL',      group: 'Employee' },
  { key: 'NETPAY',     label: 'NETPAY',     group: 'Payroll',    numeric: true, sortable: true },
  { key: 'DEDCODE',    label: 'DEDCODE',    group: 'Deduction',  sortable: true },
  { key: 'POLICYNO',   label: 'POLICYNO',   group: 'Deduction',  sortable: true },
  { key: 'DEDID',      label: 'DEDID',      group: 'Deduction' },
  { key: 'EFFMM',      label: 'EFFMM',      group: 'Payroll',    sortable: true },
  { key: 'EFFYY',      label: 'EFFYY',      group: 'Payroll',    sortable: true },
  { key: 'TERMM',      label: 'TERMM',      group: 'Payroll' },
  { key: 'TERYY',      label: 'TERYY',      group: 'Payroll' },
  { key: 'DEDAMT',     label: 'DEDAMT',     group: 'Deduction',  numeric: true, sortable: true },
  { key: 'POLICYDATE', label: 'POLICYDATE', group: 'Deduction',  date: true },
  { key: 'AGENT',      label: 'AGENT',      group: 'Deduction' },
  { key: 'ABSNO',      label: 'ABSNO',      group: 'Payroll',    numeric: true },
  { key: 'UNDERHR',    label: 'UNDERHR',    group: 'Payroll',    numeric: true },
  { key: 'UNDERMIN',   label: 'UNDERMIN',   group: 'Payroll',    numeric: true },
  { key: 'STATUS',     label: 'STATUS',     group: 'System',     sortable: true },
  { key: 'UPDCODE',    label: 'UPDCODE',    group: 'System' },
  { key: 'UPDATE',     label: 'UPDATE',     group: 'System',     date: true },
  { key: 'PAYDATE',    label: 'PAYDATE',    group: 'System',     date: true },
  { key: 'EDITOR',     label: 'EDITOR',     group: 'System' },
  { key: 'PRINCIPAL',  label: 'PRINCIPAL',  group: 'Deduction',  numeric: true, sortable: true },
  { key: 'INTEREST',   label: 'INTEREST',   group: 'Deduction',  numeric: true },
  { key: 'CHARGES',    label: 'CHARGES',    group: 'Deduction',  numeric: true },
  { key: 'PROCEEDS',   label: 'PROCEEDS',   group: 'Deduction',  numeric: true },
  { key: 'TYPE',       label: 'TYPE',       group: 'Deduction',  sortable: true },
  { key: 'AGENCY',     label: 'AGENCY',     group: 'Deduction',  sortable: true },
  { key: 'BILL',       label: 'BILL',       group: 'System' },
  { key: 'ABMM',       label: 'ABMM',       group: 'Payroll' },
  { key: 'ABYY',       label: 'ABYY',       group: 'Payroll' },
  { key: 'OLDCODE',    label: 'OLDCODE',    group: 'System' },
  { key: 'HIREDATE',   label: 'HIREDATE',   group: 'Employee',   date: true },
  { key: 'BIRTHDATE',  label: 'BIRTHDATE',  group: 'Employee',   date: true },
  { key: 'GSIS_BPN',   label: 'GSIS_BPN',   group: 'Employee' },
  { key: 'QS',         label: 'QS',         group: 'System' },
  { key: 'ID',         label: 'ID',         group: 'System' },
];

const STATUS_OPTIONS = ['Active', 'Suspended', 'Terminated'] as const;
const TYPE_OPTIONS = ['Loan', 'Insurance', 'Membership', 'Savings', 'Other'] as const;

function statusFlag(s: string): string {
  if (s === 'Active') return 'A';
  if (s === 'Suspended') return 'S';
  if (s === 'Terminated') return 'T';
  return 'A';
}
function typeFlag(t: string): string {
  if (t === 'Loan') return 'L';
  if (t === 'Insurance') return 'I';
  if (t === 'Membership') return 'M';
  if (t === 'Savings') return 'S';
  return 'O';
}
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

// Shape returned by the query_dedfile RPC (deduction + joined employee fields)
interface ServerDedRow extends PayrollDeduction {
  lname: string | null;
  last_name: string | null;
  fname: string | null;
  first_name: string | null;
  mi: string | null;
  appel: string | null;
  stacode: string | null;
  regcode: string | null;
  divcode: string | null;
  netpay: number | null;
  updcode: string | null;
  update: string | null;
  paydate: string | null;
  editor: string | null;
  hiredate: string | null;
  hire_date: string | null;
  birthdate: string | null;
  gsis_pn: string | null;
}

function serverRowToDedfileRow(d: ServerDedRow, idx: number, pageOffset: number): DedfileRow {
  const now = new Date();
  return {
    P: d.status === 'Active' ? 'A' : 'I',
    YY: String(now.getFullYear()),
    MM: pad2(now.getMonth() + 1),
    DD: pad2(now.getDate()),
    HR: pad2(now.getHours()),
    MIN: pad2(now.getMinutes()),
    SEC: String(pageOffset + idx + 1).padStart(8, '0'),
    REGCODE: d.regcode ?? '',
    DIVCODE: d.divcode ?? '',
    STACODE: d.stacode ?? '',
    EMPNO: d.empno,
    FNAME: d.fname ?? d.first_name ?? '',
    MI: d.mi ?? '',
    LNAME: d.lname ?? d.last_name ?? '',
    APPEL: d.appel ?? '',
    NETPAY: d.netpay ?? 0,
    DEDCODE: d.dedcode,
    POLICYNO: d.policyno,
    DEDID: d.dedid,
    EFFMM: pad2(d.effmm),
    EFFYY: String(d.effyy).padStart(4, '0'),
    TERMM: d.termm ? pad2(d.termm) : '',
    TERYY: d.teryy ? String(d.teryy).padStart(4, '0') : '',
    DEDAMT: Number(d.dedamt),
    POLICYDATE: null,
    AGENT: d.agency,
    ABSNO: 0, UNDERHR: 0, UNDERMIN: 0,
    STATUS: statusFlag(d.status),
    UPDCODE: d.updcode ?? '',
    UPDATE: d.update ?? null,
    PAYDATE: d.paydate ?? null,
    EDITOR: (d.editor ?? '').slice(0, 8),
    PRINCIPAL: Number(d.principal),
    INTEREST: Number(d.interest),
    CHARGES: Number(d.charges),
    PROCEEDS: Number(d.proceeds),
    TYPE: typeFlag(d.type),
    AGENCY: d.agency.slice(0, 5),
    BILL: '', ABMM: '', ABYY: '', OLDCODE: '',
    HIREDATE: d.hiredate ?? d.hire_date ?? null,
    BIRTHDATE: d.birthdate ?? null,
    GSIS_BPN: d.gsis_pn ?? '',
    QS: '',
    ID: String(pageOffset + idx + 1).padStart(3, '0'),
    _dbId: d.id,
    _employeeId: d.employee_id,
    _dedType: d.type,
  };
}

interface DedForm {
  empno: string; employee_id: string; dedcode: string; dedid: string; policyno: string;
  effmm: number; effyy: number; termm: number | ''; teryy: number | '';
  dedamt: number; principal: number; interest: number; charges: number; proceeds: number;
  agency: string; status: typeof STATUS_OPTIONS[number]; type: typeof TYPE_OPTIONS[number];
}

function emptyForm(): DedForm {
  return { empno: '', employee_id: '', dedcode: '', dedid: '', policyno: '',
    effmm: 1, effyy: 25, termm: '', teryy: '',
    dedamt: 0, principal: 0, interest: 0, charges: 0, proceeds: 0,
    agency: '', status: 'Active', type: 'Other' };
}
function formFromDed(d: PayrollDeduction): DedForm {
  return { empno: d.empno, employee_id: d.employee_id ?? '', dedcode: d.dedcode,
    dedid: d.dedid, policyno: d.policyno, effmm: d.effmm, effyy: d.effyy,
    termm: d.termm ?? '', teryy: d.teryy ?? '',
    dedamt: Number(d.dedamt), principal: Number(d.principal), interest: Number(d.interest),
    charges: Number(d.charges), proceeds: Number(d.proceeds), agency: d.agency,
    status: d.status, type: d.type };
}

type SortDir = 'asc' | 'desc';

// Map our column keys to the RPC sort_key parameter
const SORT_KEY_MAP: Partial<Record<keyof DedfileRow, string>> = {
  EMPNO: 'empno',
  DEDCODE: 'dedcode',
  DEDAMT: 'dedamt',
  POLICYNO: 'policyno',
  AGENCY: 'agency',
  STATUS: 'status',
  TYPE: 'type',
  LNAME: 'lname',
  STACODE: 'stacode',
  EFFYY: 'effyy',
  EFFMM: 'effmm',
  PRINCIPAL: 'principal',
  NETPAY: 'netpay',
};

export default function DedfileDbf() {
  const { logAudit } = useAuth();
  const { scopedDivisionIds, scopedCodes } = useOrg();
  // REGCODE + DIVCODE codes are the unique reference for one division's payroll
  // (deduction rows join the employee masterfile, which carries these columns).
  const scopeRegcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null;
  const scopeDivcodes = scopedCodes && scopedCodes.length > 0 ? [...new Set(scopedCodes.map((c) => c.divcode))] : null;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [stacodeFilter, setStacodeFilter] = useState('All');
  const [dedcodeFilter, setDedcodeFilter] = useState('All');
  const [empnoFilter, setEmpnoFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [sortKey, setSortKey] = useState<keyof DedfileRow>('EMPNO');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PayrollDeduction | null>(null);
  const [form, setForm] = useState<DedForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [history, setHistory] = useState<PayrollDeduction | null>(null);
  const [stats, setStats] = useState<{ totalRecords: number; activeCount: number; totalDedAmt: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroup[]>([]);

  const gf = useMemo(() => resolveGroupFilter(groupFilter, payrollGroups), [groupFilter, payrollGroups]);

  const serverPag = useServerPagination<ServerDedRow>('query_dedfile', {
    p_search: search || null,
    p_stacode: stacodeFilter !== 'All' ? stacodeFilter : null,
    p_dedcode: dedcodeFilter !== 'All' ? dedcodeFilter : null,
    p_empno: empnoFilter || null,
    p_period: periodFilter || null,
    p_stacode_min: gf.stacodeMin,
    p_stacode_max: gf.stacodeMax,
    p_sort_key: SORT_KEY_MAP[sortKey] ?? 'empno',
    p_sort_dir: sortDir,
    p_division_ids: scopedDivisionIds,
    p_regcode: scopeRegcode,
    p_divcodes: scopeDivcodes,
  }, { pageSize: 50 });

  const loading = serverPag.loading;
  const refreshFn = useRef<() => void>(() => {});
  refreshFn.current = serverPag.refresh;

  // Load employees + deduction codes once (small-ish, needed for dropdowns and filters)
  const loadAux = useCallback(async () => {
    const [emp, codes, grp] = await Promise.all([
      fetchAll(() => supabase.from('employees').select('id, empno, employee_number, lname, last_name, fname, first_name, mi, stacode').order('lname')),
      fetchAll(() => supabase.from('deduction_codes').select('*').order('dedcode')),
      fetchAll(() => supabase.from('payroll_groups').select('*').eq('status', 'Active').order('group_code')),
    ]);
    setEmployees(emp as Employee[]);
    setDedCodes(codes);
    setPayrollGroups(grp as PayrollGroup[]);
  }, []);

  useEffect(() => { loadAux(); }, [loadAux]);

  // Fetch aggregate stats for the current filter set (count + sum, no rows)
  const loadStats = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc('query_dedfile', {
      p_search: search || null,
      p_stacode: stacodeFilter !== 'All' ? stacodeFilter : null,
      p_dedcode: dedcodeFilter !== 'All' ? dedcodeFilter : null,
      p_empno: empnoFilter || null,
      p_period: periodFilter || null,
      p_stacode_min: gf.stacodeMin,
      p_stacode_max: gf.stacodeMax,
      p_sort_key: SORT_KEY_MAP[sortKey] ?? 'empno',
      p_sort_dir: sortDir,
      p_page: 0,
      p_page_size: 1,
      p_count_only: false,
      p_division_ids: scopedDivisionIds,
      p_regcode: scopeRegcode,
      p_divcodes: scopeDivcodes,
    });
    if (rpcErr || !data) { setStats(null); return; }
    const result = data as { rows: ServerDedRow[]; total: number };
    // For the active count + sum we need all matching rows' amounts; fetch in pages
    const total = result.total ?? 0;
    if (total === 0) { setStats({ totalRecords: 0, activeCount: 0, totalDedAmt: 0 }); return; }
    // Fetch all matching rows (just the fields we need for stats) in pages of 1000
    let allRows: ServerDedRow[] = [];
    const pages = Math.ceil(total / 1000);
    for (let p = 0; p < pages; p++) {
      const { data: pageData } = await supabase.rpc('query_dedfile', {
        p_search: search || null,
        p_stacode: stacodeFilter !== 'All' ? stacodeFilter : null,
        p_dedcode: dedcodeFilter !== 'All' ? dedcodeFilter : null,
        p_empno: empnoFilter || null,
        p_period: periodFilter || null,
        p_stacode_min: gf.stacodeMin,
        p_stacode_max: gf.stacodeMax,
        p_sort_key: 'empno',
        p_sort_dir: 'asc',
        p_page: p,
        p_page_size: 1000,
        p_count_only: false,
        p_division_ids: scopedDivisionIds,
        p_regcode: scopeRegcode,
        p_divcodes: scopeDivcodes,
      });
      const pr = pageData as { rows: ServerDedRow[]; total: number } | null;
      if (pr?.rows) allRows = allRows.concat(pr.rows);
    }      setStats({
      totalRecords: total,
      activeCount: allRows.filter((r) => r.status === 'Active').length,
      totalDedAmt: allRows.reduce((s, r) => s + Number(r.dedamt), 0),
    });
  }, [search, stacodeFilter, dedcodeFilter, empnoFilter, periodFilter, gf, sortKey, sortDir, scopeRegcode, scopeDivcodes]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Unique filter options (from the small aux tables / ded codes)
  const stacodeOptions = useMemo(() => [...new Set(employees.map((e) => e.stacode).filter(Boolean))].sort(), [employees]);
  const dedcodeOptions = useMemo(() => dedCodes.map((c) => c.dedcode), [dedCodes]);

  const dedCodeSet = useMemo(() => new Set(dedCodes.map((c) => c.dedcode.toUpperCase())), [dedCodes]);

  // Build display rows from the server-paginated data
  const pageOffset = serverPag.page * 50;
  const rows: DedfileRow[] = useMemo(() =>
    serverPag.rows.map((d, i) => serverRowToDedfileRow(d, i, pageOffset)),
  [serverPag.rows, pageOffset]);

  function handleSort(key: keyof DedfileRow) {
    if (!SORT_KEY_MAP[key]) return; // ignore non-sortable columns
    if (sortKey === key) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir('asc'); }
  }

  function openAdd() { setEditing(null); setForm(emptyForm()); setError(''); setShowModal(true); }
  function openEdit(d: PayrollDeduction) { setEditing(d); setForm(formFromDed(d)); setError(''); setShowModal(true); }
  function openDuplicate(d: PayrollDeduction) { setEditing(null); setForm({ ...formFromDed(d), policyno: '' }); setError(''); setShowModal(true); }

  async function backupBeforeSave(): Promise<boolean> {
    try {
      const allDeds = await fetchAll(() => supabase.from('payroll_deductions').select('*').order('empno').order('dedcode'));
      const allEmps = await fetchAll(() => supabase.from('employees').select('*'));
      const data = generateDedfileDbf(allDeds, allEmps);
      downloadFile({ filename: `DEDFILE_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.DBF`, content: data, mimeType: 'application/dbf' });
      await logAudit('backup_before_save', 'dedfile', `backup_${Date.now()}`);
      return true;
    } catch { return false; }
  }

  async function save() {
    setError('');
    if (!form.employee_id) { setError('Please select an employee.'); return; }
    if (!form.empno || form.empno.length !== 7) { setError('EMPNO must be exactly 7 characters.'); return; }
    if (!form.dedcode) { setError('Deduction Code is required.'); return; }
    if (dedCodes.length > 0 && !dedCodeSet.has(form.dedcode.toUpperCase())) {
      setError(`Deduction Code "${form.dedcode}" does not exist in DEDTABLE.`); return;
    }
    if (form.policyno && form.policyno.length > 14) { setError('POLICYNO must not exceed 14 characters.'); return; }
    if (form.dedamt < 0) { setError('Deduction Amount cannot be negative.'); return; }
    if (Number(form.dedamt) > 999999.99) { setError('Deduction Amount exceeds maximum (N,8,2).'); return; }

    setSaving(true);
    await backupBeforeSave();
    const payload = {
      employee_id: form.employee_id, empno: form.empno, dedcode: form.dedcode.toUpperCase(),
      dedid: form.dedid, policyno: form.policyno, effmm: form.effmm, effyy: form.effyy,
      termm: form.termm === '' ? null : form.termm, teryy: form.teryy === '' ? null : form.teryy,
      dedamt: form.dedamt, principal: form.principal, interest: form.interest,
      charges: form.charges, proceeds: form.proceeds, agency: form.agency,
      status: form.status, type: form.type,
      updated_by: 'system', updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error: err } = await supabase.from('payroll_deductions').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
      await logAudit('dedfile_update', 'payroll_deductions', editing.id, { empno: form.empno, dedcode: form.dedcode });
    } else {
      const { error: err } = await supabase.from('payroll_deductions').insert({ ...payload, created_by: 'system' });
      if (err) { setError(err.message); setSaving(false); return; }
      await logAudit('dedfile_insert', 'payroll_deductions', undefined, { empno: form.empno, dedcode: form.dedcode });
    }
    if (form.employee_id) await recomputeEmployeeNetPay(form.employee_id);
    setSaving(false);
    setShowModal(false);
    refreshFn.current();
    loadStats();
  }

  async function remove(d: PayrollDeduction) {
    if (!confirm(`Delete deduction ${d.dedcode} for ${d.empno}?`)) return;
    await backupBeforeSave();
    const empId = d.employee_id;
    await supabase.from('payroll_deductions').delete().eq('id', d.id);
    await logAudit('dedfile_delete', 'payroll_deductions', d.id, { empno: d.empno, dedcode: d.dedcode });
    if (empId) await recomputeEmployeeNetPay(empId);
    refreshFn.current();
    loadStats();
  }

  // Fetch all matching rows for export (server-side filtered, all pages)
  async function fetchAllFiltered(): Promise<ServerDedRow[]> {
    setExporting(true);
    try {
      const { data: first } = await supabase.rpc('query_dedfile', {
        p_search: search || null,
        p_stacode: stacodeFilter !== 'All' ? stacodeFilter : null,
        p_dedcode: dedcodeFilter !== 'All' ? dedcodeFilter : null,
        p_empno: empnoFilter || null,
        p_period: periodFilter || null,
        p_stacode_min: gf.stacodeMin,
        p_stacode_max: gf.stacodeMax,
        p_sort_key: SORT_KEY_MAP[sortKey] ?? 'empno',
        p_sort_dir: sortDir,
        p_page: 0,
        p_page_size: 1000,
        p_count_only: false,
        p_division_ids: scopedDivisionIds,
        p_regcode: scopeRegcode,
        p_divcodes: scopeDivcodes,
      });
      const firstResult = first as { rows: ServerDedRow[]; total: number } | null;
      if (!firstResult || firstResult.total === 0) return [];
      let allRows: ServerDedRow[] = [...firstResult.rows];
      const pages = Math.ceil(firstResult.total / 1000);
      for (let p = 1; p < pages; p++) {
        const { data: pageData } = await supabase.rpc('query_dedfile', {
          p_search: search || null,
          p_stacode: stacodeFilter !== 'All' ? stacodeFilter : null,
          p_dedcode: dedcodeFilter !== 'All' ? dedcodeFilter : null,
          p_empno: empnoFilter || null,
          p_period: periodFilter || null,
          p_stacode_min: gf.stacodeMin,
          p_stacode_max: gf.stacodeMax,
          p_sort_key: SORT_KEY_MAP[sortKey] ?? 'empno',
          p_sort_dir: sortDir,
          p_page: p,
          p_page_size: 1000,
          p_count_only: false,
          p_division_ids: scopedDivisionIds,
          p_regcode: scopeRegcode,
          p_divcodes: scopeDivcodes,
        });
        const pr = pageData as { rows: ServerDedRow[]; total: number } | null;
        if (pr?.rows) allRows = allRows.concat(pr.rows);
      }
      return allRows;
    } finally {
      setExporting(false);
    }
  }

  function rowsToExportData(allRows: ServerDedRow[]): { deds: PayrollDeduction[]; rows: DedfileRow[] } {
    const deds = allRows.map((r) => {
      const { lname, last_name, fname, first_name, mi, appel, stacode, regcode, divcode, netpay, updcode, update, paydate, editor, hiredate, hire_date, birthdate, gsis_pn, ...ded } = r;
      return ded as PayrollDeduction;
    });
    const exportRows = allRows.map((d, i) => serverRowToDedfileRow(d, i, 0));
    return { deds, rows: exportRows };
  }

  async function exportDbf() {
    const allRows = await fetchAllFiltered();
    const { deds } = rowsToExportData(allRows);
    const data = generateDedfileDbf(deds, employees);
    downloadFile({ filename: `DEDFILE_${new Date().toISOString().slice(0, 10)}.DBF`, content: data, mimeType: 'application/dbf' });
    logAudit('dedfile_export_dbf', 'dedfile', undefined, { recordCount: allRows.length });
  }

  function exportCsv() {
    fetchAllFiltered().then((allRows) => {
      const { rows } = rowsToExportData(allRows);
      const headers = COLUMN_LIST.map((c) => c.label);
      const csvRows = rows.map((r) => COLUMN_LIST.map((c) => {
        const v = r[c.key];
        if (c.date) return fmtDate(v as string | null);
        if (c.numeric) return v as number;
        return String(v ?? '');
      }));
      downloadFile({ filename: `DEDFILE_${new Date().toISOString().slice(0, 10)}.csv`, content: generateCsv(headers, csvRows), mimeType: 'text/csv' });
    });
  }

  function exportExcel() {
    fetchAllFiltered().then((allRows) => {
      const { rows } = rowsToExportData(allRows);
      const headers = COLUMN_LIST.map((c) => c.label);
      const xlsRows = rows.map((r) => COLUMN_LIST.map((c) => {
        const v = r[c.key];
        if (c.date) return fmtDate(v as string | null);
        if (c.numeric) return v as number;
        return String(v ?? '');
      }));
      downloadFile({ filename: `DEDFILE_${new Date().toISOString().slice(0, 10)}.xls`, content: generateExcel(headers, xlsRows, 'DEDFILE'), mimeType: 'application/vnd.ms-excel' });
    });
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search any column…" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
          <select value={stacodeFilter} onChange={(e) => setStacodeFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option>All</option>
            {stacodeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={dedcodeFilter} onChange={(e) => setDedcodeFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option>All</option>
            {dedcodeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={empnoFilter} onChange={(e) => setEmpnoFilter(e.target.value)} placeholder="EMPNO…" className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <input value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} placeholder="Period (YYYYMM)…" className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <GroupFilter value={groupFilter} onChange={setGroupFilter} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" /> Import DBF
          </button>
          <div className="relative">
            <button onClick={() => setExportMenu(!exportMenu)} disabled={exporting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-60 transition-colors">
              <Download className="w-4 h-4" /> {exporting ? 'Preparing…' : 'Export'} {!exporting && <ChevronDown className="w-3 h-3" />}
            </button>
            {exportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-20 py-1">
                  <button onClick={() => { setExportMenu(false); exportDbf(); }} disabled={serverPag.total === 0} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                    <Table2 className="w-4 h-4" /> Export DBF
                  </button>
                  <button onClick={() => { setExportMenu(false); exportExcel(); }} disabled={serverPag.total === 0} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                    <FileSpreadsheet className="w-4 h-4" /> Export Excel
                  </button>
                  <button onClick={() => { setExportMenu(false); exportCsv(); }} disabled={serverPag.total === 0} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Record
          </button>
        </div>
      </div>

      {/* Stats */}
      {!loading && stats && stats.totalRecords > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Records" value={String(stats.totalRecords)} />
          <StatCard label="Active" value={String(stats.activeCount)} tone="emerald" />
          <StatCard label="Deduction Codes" value={String(dedcodeOptions.length)} tone="amber" />
          <StatCard label="Total Amount" value={currency(stats.totalDedAmt)} tone="blue" />
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading DEDFILE records…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500">{serverPag.total === 0 ? 'No records yet. Click "Add Record" or import a DEDFILE.DBF.' : 'No records match your filters.'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto" style={{ maxWidth: '100%' }}>
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 text-center text-slate-400 font-medium w-10">Action</th>
                    {COLUMN_LIST.map((col) => {
                      const isSorted = sortKey === col.key;
                      const canSort = !!col.sortable;
                      return (
                        <th key={col.key} onClick={() => handleSort(col.key)} className={`px-2 py-2 font-semibold border-b border-r border-slate-200 ${canSort ? 'cursor-pointer select-none hover:bg-slate-100' : ''} whitespace-nowrap transition-colors ${isSorted ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>
                          <div className="flex items-center gap-0.5">
                            {col.label}
                            {isSorted && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = serverPag.rows.find((dd) => dd.id === r._dbId);
                    const dedForActions: PayrollDeduction | undefined = d ? (() => {
                      const { lname, last_name, fname, first_name, mi, appel, stacode, regcode, divcode, netpay, updcode, update, paydate, editor, hiredate, hire_date, birthdate, gsis_pn, ...rest } = d as ServerDedRow;
                      return rest as PayrollDeduction;
                    })() : undefined;
                    return (
                      <tr key={r._dbId} className="hover:bg-slate-50">
                        <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-1 py-1.5">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => dedForActions && openEdit(dedForActions)} className="p-0.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => dedForActions && openDuplicate(dedForActions)} className="p-0.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Duplicate"><Copy className="w-3 h-3" /></button>
                            <button onClick={() => dedForActions && remove(dedForActions)} className="p-0.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="w-3 h-3" /></button>
                            <button onClick={() => dedForActions && setHistory(dedForActions)} className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Audit"><History className="w-3 h-3" /></button>
                          </div>
                        </td>
                        {COLUMN_LIST.map((col) => {
                          const v = r[col.key];
                          let display: string;
                          if (col.date) display = fmtDate(v as string | null);
                          else if (col.numeric) display = currency(v as number);
                          else display = String(v ?? '');
                          return (
                            <td key={col.key} className={`px-2 py-1.5 border-b border-r border-slate-100 whitespace-nowrap ${col.numeric ? 'text-right tabular-nums' : ''} ${col.key === 'STATUS' ? 'text-center' : ''}`}>
                              {col.key === 'STATUS' ? (
                                <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${v === 'A' ? 'bg-emerald-50 text-emerald-700' : v === 'S' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{v}</span>
                              ) : display}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                    <td className="sticky left-0 bg-slate-50 border-r border-slate-200 px-2 py-2 text-[10px] text-slate-400">Totals</td>
                    {COLUMN_LIST.map((col) => (
                      <td key={col.key} className={`px-2 py-2 border-r border-slate-100 ${col.key === 'DEDAMT' ? 'text-right tabular-nums' : ''}`}>
                        {col.key === 'DEDAMT' && stats ? currency(stats.totalDedAmt) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Pagination */}
            <Pagination page={serverPag.page} totalPages={serverPag.totalPages} total={serverPag.total} pageSize={50} onPageChange={serverPag.setPage} />
          </>
        )}
      </div>

      {/* Add/Edit/Duplicate modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-slate-800">{editing ? 'Edit Record' : 'Add Record'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
              <div>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">Employee *</span>
                  <select value={form.employee_id} onChange={(e) => { const emp = employees.find((em) => em.id === e.target.value); setForm({ ...form, employee_id: e.target.value, empno: emp?.empno || emp?.employee_number || '' }); }} className={inputCls}>
                    <option value="">Select employee…</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.empno || e.employee_number} — {e.lname || e.last_name}, {e.fname || e.first_name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block"><span className="block text-xs text-slate-600 mb-1">DEDCODE *</span>
                  <input value={form.dedcode} onChange={(e) => setForm({ ...form, dedcode: e.target.value.toUpperCase() })} className={inputCls} list="dedcodes-list" />
                  <datalist id="dedcodes-list">{dedCodes.map((c) => <option key={c.dedcode} value={c.dedcode} />)}</datalist>
                </label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">DEDID</span><input value={form.dedid} onChange={(e) => setForm({ ...form, dedid: e.target.value })} className={inputCls} /></label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">POLICYNO (max 14)</span><input value={form.policyno} onChange={(e) => setForm({ ...form, policyno: e.target.value.slice(0, 14) })} maxLength={14} className={inputCls} /></label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block"><span className="block text-xs text-slate-600 mb-1">EFFMM</span><input type="number" min={1} max={12} value={form.effmm} onChange={(e) => setForm({ ...form, effmm: parseInt(e.target.value) || 1 })} className={inputCls} /></label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">EFFYY</span><input type="number" value={form.effyy} onChange={(e) => setForm({ ...form, effyy: parseInt(e.target.value) || 0 })} className={inputCls} /></label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">TERMM</span><input type="number" min={1} max={12} value={form.termm} onChange={(e) => setForm({ ...form, termm: e.target.value === '' ? '' : parseInt(e.target.value) || '' })} placeholder="—" className={inputCls} /></label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">TERYY</span><input type="number" value={form.teryy} onChange={(e) => setForm({ ...form, teryy: e.target.value === '' ? '' : parseInt(e.target.value) || '' })} placeholder="—" className={inputCls} /></label>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Amounts</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">DEDAMT (N,8,2) *</span><input type="number" step="0.01" min={0} max={999999.99} value={form.dedamt} onChange={(e) => setForm({ ...form, dedamt: parseFloat(e.target.value) || 0 })} className={inputCls} /></label>
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">PRINCIPAL (N,10,2)</span><input type="number" step="0.01" min={0} max={99999999.99} value={form.principal} onChange={(e) => setForm({ ...form, principal: parseFloat(e.target.value) || 0 })} className={inputCls} /></label>
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">INTEREST (N,8,2)</span><input type="number" step="0.01" min={0} value={form.interest} onChange={(e) => setForm({ ...form, interest: parseFloat(e.target.value) || 0 })} className={inputCls} /></label>
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">CHARGES (N,8,2)</span><input type="number" step="0.01" min={0} value={form.charges} onChange={(e) => setForm({ ...form, charges: parseFloat(e.target.value) || 0 })} className={inputCls} /></label>
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">PROCEEDS (N,8,2)</span><input type="number" step="0.01" min={0} value={form.proceeds} onChange={(e) => setForm({ ...form, proceeds: parseFloat(e.target.value) || 0 })} className={inputCls} /></label>
                  <label className="block"><span className="block text-xs text-slate-600 mb-1">AGENCY</span><input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} className={inputCls} /></label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="block text-xs text-slate-600 mb-1">STATUS</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof STATUS_OPTIONS[number] })} className={inputCls}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                </label>
                <label className="block"><span className="block text-xs text-slate-600 mb-1">TYPE</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof TYPE_OPTIONS[number] })} className={inputCls}>{TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Record'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal employees={employees} onClose={() => setShowUpload(false)} onImported={() => { setShowUpload(false); refreshFn.current(); loadStats(); }} logAudit={logAudit} />
      )}

      {/* Audit trail modal */}
      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Audit Trail</h2>
              <button onClick={() => setHistory(null)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Deduction Code</span><span className="font-mono font-semibold text-slate-800">{history.dedcode}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Employee No.</span><span className="font-mono text-slate-800">{history.empno}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Policy No.</span><span className="text-slate-800">{history.policyno || '—'}</span></div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex justify-between"><span className="text-slate-500">Created By</span><span className="text-slate-800">{history.created_by || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Date Created</span><span className="text-slate-800">{new Date(history.created_at).toLocaleString('en-PH')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Last Updated By</span><span className="text-slate-800">{history.updated_by || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Last Updated Date</span><span className="text-slate-800">{new Date(history.updated_at).toLocaleString('en-PH')}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'blue' }) {
  const tones = { emerald: 'text-emerald-600', amber: 'text-amber-600', blue: 'text-blue-600' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${tone ? tones[tone] : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────

interface UploadProps {
  employees: Employee[];
  onClose: () => void;
  onImported: () => void;
  logAudit: (action: string, recordType?: string, recordId?: string, details?: Record<string, unknown>) => Promise<void>;
}

function UploadModal({ employees, onClose, onImported, logAudit }: UploadProps) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[]; autoCreated?: number; summary?: string } | null>(null);
  const [fieldDefs, setFieldDefs] = useState<{ name: string; type: string; length: number; decimals: number }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const empByNumber = useMemo(() => new Map(employees.map((e) => [e.empno || e.employee_number, e])), [employees]);

  const FIELDS_MAP: Record<string, string[]> = {
    empno: ['EMPNO'], dedcode: ['DEDCODE'], dedid: ['DEDID'], policyno: ['POLICYNO'],
    effmm: ['EFFMM'], effyy: ['EFFYY'], termm: ['TERMM'], teryy: ['TERYY'],
    dedamt: ['DEDAMT'], principal: ['PRINCIPAL'], interest: ['INTEREST'],
    charges: ['CHARGES'], proceeds: ['PROCEEDS'], agency: ['AGENCY', 'AGENT'],
    status: ['STATUS'], type: ['TYPE'],
  };

  function normRow(rec: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [normKey, aliases] of Object.entries(FIELDS_MAP)) {
      for (const alias of aliases) {
        if (rec[alias] !== undefined && rec[alias] !== '') { out[normKey] = rec[alias]; break; }
      }
      if (out[normKey] === undefined) out[normKey] = '';
    }
    return out;
  }

  function parseCsv(text: string): Record<string, string>[] {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const delim = lines[0].includes('|') ? '|' : lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delim).map((h) => h.trim().toUpperCase());
    return lines.slice(1).map((line) => {
      const vals = line.split(delim);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
      return normRow(row);
    });
  }

  function handleText(text: string) { setRawText(text); setParsed(parseCsv(text)); }

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) { setResult({ imported: 0, skipped: 0, errors: [validation.error ?? 'Invalid file'] }); return; }
    if (file.name.toLowerCase().endsWith('.dbf')) {
      const buf = await file.arrayBuffer();
      try {
        const { fields, records } = decodeDbf(new Uint8Array(buf));
        setFieldDefs(fields.map((f) => ({ name: f.name, type: f.type, length: f.length, decimals: f.decimals })));
        const mapped = records.map((rec: DbfRecord) => {
          const row: Record<string, string> = {};
          for (const key in rec) { row[key.toUpperCase()] = String(rec[key] ?? '').trim(); }
          return normRow(row);
        });
        setRawText(`[DBF: ${file.name} — ${mapped.length} records]`);
        setParsed(mapped);
      } catch (err) { setResult({ imported: 0, skipped: 0, errors: [`Failed to read DBF: ${(err as Error).message}`] }); }
    } else {
      const text = await file.text();
      handleText(text);
    }
  }

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

  async function doImport() {
    if (parsed.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let skipped = 0;
    const knownEmpnos = new Set(empByNumber.keys());
    const unknownEmpnos = new Set<string>();
    for (const r of parsed) {
      const empno = (r['empno'] ?? '').trim();
      if (empno && !knownEmpnos.has(empno)) unknownEmpnos.add(empno);
    }
    if (unknownEmpnos.size > 0) {
      const stubs = [...unknownEmpnos].map((empno) => ({ employee_number: empno, empno, last_name: '(Imported)', first_name: empno, status: 'Active' }));
      await supabase.from('employees').insert(stubs);
      const { data: newEmps } = await supabase.from('employees').select('id, empno, employee_number').in('employee_number', [...unknownEmpnos]);
      (newEmps as Employee[] | null)?.forEach((e) => empByNumber.set(e.empno || e.employee_number, e));
    }

    const rowMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const empno = (r['empno'] ?? '').trim();
      const dedcode = (r['dedcode'] ?? '').trim().toUpperCase();
      if (!empno || !dedcode) { skipped++; errors.push(`Row ${i + 2}: Missing EMPNO or DEDCODE.`); continue; }
      const emp = empByNumber.get(empno);
      if (!emp) { skipped++; errors.push(`Row ${i + 2}: Employee ${empno} not found.`); continue; }
      const dedamt = parseFloat(r['dedamt'] ?? '0') || 0;
      if (dedamt < 0) { skipped++; errors.push(`Row ${i + 2}: Negative deduction amount.`); continue; }
      const status = decodeStatus(r['status'] ?? '');
      rowMap.set(`${empno}|${dedcode}|${r['policyno'] ?? ''}|${status}`, {
        employee_id: emp.id, empno, dedcode, dedid: r['dedid'] ?? '', policyno: r['policyno'] ?? '',
        effmm: parseInt(r['effmm'] ?? '1') || 1, effyy: parseInt(r['effyy'] ?? '25') || 25,
        termm: r['termm'] ? parseInt(r['termm']) || null : null, teryy: r['teryy'] ? parseInt(r['teryy']) || null : null,
        dedamt, principal: parseFloat(r['principal'] ?? '0') || 0, interest: parseFloat(r['interest'] ?? '0') || 0,
        charges: parseFloat(r['charges'] ?? '0') || 0, proceeds: parseFloat(r['proceeds'] ?? '0') || 0,
        agency: r['agency'] ?? '', status, type: decodeType(r['type'] ?? ''),
        created_by: 'import', updated_by: 'import',
      });
    }

    const allRows = [...rowMap.values()];
    const activeRows = allRows.filter((r) => r.status === 'Active');
    const nonActiveRows = allRows.filter((r) => r.status !== 'Active');
    const activeEmpnos = [...new Set(activeRows.map((r) => r.empno as string))];
    let existingActive: PayrollDeduction[] = [];
    if (activeEmpnos.length > 0) {
      const { data: existing } = await supabase.from('payroll_deductions').select('*').in('empno', activeEmpnos).eq('status', 'Active');
      existingActive = (existing as PayrollDeduction[]) ?? [];
    }
    const existingMap = new Map<string, string>();
    existingActive.forEach((d) => existingMap.set(`${d.empno}|${d.dedcode}|${d.policyno}`, d.id));

    const toUpdate: (Record<string, unknown> & { id: string })[] = [];
    const toInsert: Record<string, unknown>[] = [];
    const affectedEmpIds = new Set<string>();
    for (const row of activeRows) {
      const key = `${row.empno}|${row.dedcode}|${row.policyno}`;
      const existingId = existingMap.get(key);
      if (existingId) toUpdate.push({ ...row, id: existingId });
      else toInsert.push(row);
      if (row.employee_id) affectedEmpIds.add(row.employee_id as string);
    }
    nonActiveRows.forEach((r) => { toInsert.push(r); if (r.employee_id) affectedEmpIds.add(r.employee_id as string); });

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('payroll_deductions').insert(batch);
      if (error) { errors.push(`Batch insert error: ${error.message}`); skipped += batch.length; }
      else imported += batch.length;
    }
    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      const { error } = await supabase.from('payroll_deductions').upsert(batch, { onConflict: 'id' });
      if (error) { errors.push(`Batch update error: ${error.message}`); skipped += batch.length; }
      else imported += batch.length;
    }
    await bulkRecomputeNetPay([...affectedEmpIds]);

    const autoCreated = unknownEmpnos.size;
    const summary = autoCreated > 0 ? ` ${autoCreated} new employee${autoCreated > 1 ? 's' : ''} auto-created.` : '';
    setResult({ imported, skipped, errors: errors.slice(0, 20), autoCreated, summary });
    setImporting(false);
    await logAudit('dedfile_import', 'payroll_deductions', undefined, { imported, skipped, autoCreated });
    if (imported > 0) setTimeout(() => onImported(), 800);
  }

  const matchedCount = parsed.filter((r) => empByNumber.has((r['empno'] ?? '').trim())).length;
  const validRows = parsed.filter((r) => (r['empno'] ?? '').trim() && (r['dedcode'] ?? '').trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-800">Import DEDFILE from DBF / CSV</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div><p className="font-medium mb-1">DEDFILE.DBF — 49 fields, 286-byte record</p><p className="text-xs text-blue-700">Upload a FoxPro DEDFILE.DBF to import all records. Unknown employee numbers are auto-created.</p></div>
          </div>
          {fieldDefs && (
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 mb-2">Preserved FoxPro Field Definitions ({fieldDefs.length} fields)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[11px] font-mono text-slate-600">
                {fieldDefs.map((f) => <div key={f.name} className="flex items-center gap-1"><span className="font-semibold text-slate-800">{f.name}</span><span className="text-slate-400">{f.type}</span><span className="text-slate-400">{f.length}{f.decimals > 0 ? `.${f.decimals}` : ''}</span></div>)}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,.DBF,.dbf,.txt,.prn,.dat" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"><Upload className="w-4 h-4" /> Choose File</button>
            <span className="text-xs text-slate-400">or paste CSV below</span>
          </div>
          <textarea value={rawText} onChange={(e) => handleText(e.target.value)} placeholder="EMPNO,DEDCODE,POLICYNO,EFFMM,EFFYY,DEDAMT,STATUS,TYPE,AGENCY&#10;0000001,LNR,PL001,1,25,5000.00,Active,Loan,GSIS&#10;..." rows={5} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y" />
          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[11px] text-slate-500">Rows Parsed</p><p className="text-sm font-semibold text-slate-700">{parsed.length}</p></div>
                <div className="bg-emerald-50 rounded-lg px-3 py-2"><p className="text-[11px] text-emerald-600">Matched</p><p className="text-sm font-semibold text-emerald-700">{matchedCount}</p></div>
                <div className="bg-amber-50 rounded-lg px-3 py-2"><p className="text-[11px] text-amber-600">Auto-Create</p><p className="text-sm font-semibold text-amber-700">{validRows - matchedCount}</p></div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0"><tr className="text-slate-500"><th className="text-left px-3 py-2 font-medium">EMPNO</th><th className="text-left px-3 py-2 font-medium">DEDCODE</th><th className="text-right px-3 py-2 font-medium">DEDAMT</th><th className="text-center px-3 py-2 font-medium">Match</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.slice(0, 50).map((r, i) => {
                      const matched = empByNumber.has((r['empno'] ?? '').trim());
                      return <tr key={i} className={matched ? '' : 'bg-rose-50/50'}><td className="px-3 py-1.5 font-mono">{r['empno']}</td><td className="px-3 py-1.5 font-mono text-slate-600">{r['dedcode']}</td><td className="px-3 py-1.5 text-right tabular-nums">{r['dedamt']}</td><td className="px-3 py-1.5 text-center">{matched ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-500 inline" />}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm"><CheckCircle2 className="w-4 h-4" /> Imported {result.imported} records. {result.skipped > 0 && `${result.skipped} skipped.`}{result.summary}</div>
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
                  <p className="text-sm font-medium text-rose-800 mb-1">Errors ({result.errors.length})</p>
                  <ul className="text-xs text-rose-700 space-y-0.5 max-h-28 overflow-y-auto">{result.errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">{validRows} records will be imported ({matchedCount} matched, {validRows - matchedCount} new employees).</p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
            <button onClick={doImport} disabled={importing || validRows === 0} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">{importing ? 'Importing…' : `Import ${validRows} Records`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
