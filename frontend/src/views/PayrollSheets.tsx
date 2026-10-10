// ── Payroll Sheets — Excel-like spreadsheet viewer/editor for payroll files ───
// One embedded spreadsheet view (Google-Sheets style) across every payroll
// type: Regular Payroll, Initial Payroll and Communication Allowance. Each
// payroll "file" opens into an editable grid with per-STACODE sheet tabs for
// Communication Allowance, save-back to the database, and CSV/Excel export.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator, Zap, HandCoins, Search, ArrowLeft, RefreshCw,
  FolderOpen, FileSpreadsheet, Loader2, AlertTriangle,
} from 'lucide-react';
import { supabase, fetchAll, formatError } from '@/lib/pb';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { getEmployeeFilter } from '@/lib/authz';
import { money, num, caStripSchoolPrefix, caStacodeFromSchoolName } from '@/lib/commAllowance';
import { downloadFile, generateCsv, generateExcel } from '@/lib/reports';
import type { CaEmployee, CaPayrollDetail, CaPayrollHeader } from '@/types/commAllowance';
import type { InitialPayrollEntry, InitialPayrollRecord } from '@/types/initialPayroll';
import type { Employee, PayPeriod, PayrollEntry } from '@/types/payroll';
import type { UserProfile } from '@/types/auth';
import SpreadsheetGrid, {
  type SpreadsheetChange, type SpreadsheetColumn, type SpreadsheetRow, type SheetTab,
} from '@/components/SpreadsheetGrid';
import LoadingIndicator from '@/components/LoadingIndicator';

type PayType = 'ca' | 'initial' | 'regular';

interface FileEntry {
  type: PayType;
  id: string;
  title: string;
  sub: string;
  status: string;
}

interface SheetView {
  key: string;
  label: string;
  columns: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
}

interface PayrollSheetsProps {
  profile?: UserProfile | null;
}

const TYPE_META: Record<PayType, { label: string; icon: typeof Calculator; tone: string }> = {
  regular: { label: 'Regular Payroll', icon: Calculator, tone: 'text-blue-600 dark:text-blue-400' },
  initial: { label: 'Initial Payroll', icon: Zap, tone: 'text-emerald-600 dark:text-emerald-400' },
  ca: { label: 'Communication Allowance', icon: HandCoins, tone: 'text-teal-600 dark:text-teal-400' },
};

// ── Column builders ──────────────────────────────────────────────────────────

const CA_COLUMNS: SpreadsheetColumn[] = [
  { key: 'no', label: 'No.', width: 44, align: 'center', type: 'number' },
  { key: 'account_no', label: 'Account No.', width: 130, bold: true },
  { key: 'last_name', label: 'Last Name', width: 150, bold: true },
  { key: 'first_name', label: 'First Name', width: 140 },
  { key: 'middle_initial', label: 'M.I.', width: 48, align: 'center' },
  { key: 'position', label: 'Position', width: 200 },
  { key: 'amount', label: 'Amount', width: 110, type: 'money', align: 'right', editable: true },
  { key: 'deduction', label: 'Deduction', width: 110, type: 'money', align: 'right', editable: true },
  { key: 'net', label: 'Net Amount Due', width: 120, type: 'money', align: 'right', bold: true },
  { key: 'remarks', label: 'Remarks', width: 180, editable: true },
];

const INITIAL_COLUMNS: SpreadsheetColumn[] = [
  { key: 'item_no', label: 'Item No.', width: 64, type: 'number', align: 'center' },
  { key: 'employee_number', label: 'EMP No.', width: 90, bold: true },
  { key: 'surname', label: 'Surname', width: 150, bold: true },
  { key: 'first_name', label: 'First Name', width: 140 },
  { key: 'middle_name', label: 'Middle Name', width: 120 },
  { key: 'school', label: 'School', width: 220 },
  { key: 'position_title', label: 'Position', width: 190 },
  { key: 'salary_grade', label: 'SG', width: 44, type: 'number', align: 'center' },
  { key: 'salary_step', label: 'Step', width: 44, type: 'number', align: 'center' },
  { key: 'monthly_salary', label: 'Monthly Salary', width: 110, type: 'money', editable: true },
  { key: 'days_worked', label: 'Days Worked', width: 90, type: 'number', editable: true },
  { key: 'gross_salary', label: 'Gross', width: 110, type: 'money', editable: true },
  { key: 'basic_salary', label: 'Basic', width: 110, type: 'money', editable: true },
  { key: 'pera', label: 'PERA', width: 100, type: 'money', editable: true },
  { key: 'other_earnings', label: 'Other Earnings', width: 110, type: 'money', editable: true },
  { key: 'total_earnings', label: 'Total Earnings', width: 120, type: 'money', bold: true, editable: true },
  { key: 'gsis', label: 'GSIS', width: 100, type: 'money', editable: true },
  { key: 'philhealth', label: 'PhilHealth', width: 100, type: 'money', editable: true },
  { key: 'pagibig', label: 'Pag-IBIG', width: 100, type: 'money', editable: true },
  { key: 'withholding_tax', label: 'WTax', width: 100, type: 'money', editable: true },
  { key: 'loans', label: 'Loans', width: 100, type: 'money', editable: true },
  { key: 'other_deductions', label: 'Other Ded', width: 110, type: 'money', editable: true },
  { key: 'total_deductions', label: 'Total Deductions', width: 120, type: 'money', bold: true, editable: true },
  { key: 'net_pay', label: 'Net Pay', width: 120, type: 'money', bold: true, editable: true },
  { key: 'atm_account_no', label: 'ATM Account', width: 130 },
];

const REGULAR_COLUMNS: SpreadsheetColumn[] = [
  { key: 'empno', label: 'EMP No.', width: 96, bold: true },
  { key: 'last_name', label: 'Last Name', width: 150, bold: true },
  { key: 'first_name', label: 'First Name', width: 140 },
  { key: 'gross_pay', label: 'Gross Pay', width: 110, type: 'money', editable: true },
  { key: 'dedlnr', label: 'GSIS (LNR)', width: 110, type: 'money', editable: true },
  { key: 'dedmed', label: 'PhilHealth', width: 100, type: 'money', editable: true },
  { key: 'dedpag', label: 'Pag-IBIG', width: 100, type: 'money', editable: true },
  { key: 'dedtax', label: 'WTax', width: 100, type: 'money', editable: true },
  { key: 'loans', label: 'Loans', width: 110, type: 'money', editable: true },
  { key: 'total_deductions', label: 'Total Deductions', width: 120, type: 'money', bold: true, editable: true },
  { key: 'net_pay', label: 'Net Pay', width: 120, type: 'money', bold: true, editable: true },
  { key: 'status', label: 'Status', width: 100, align: 'center' },
];

export default function PayrollSheets({ profile }: PayrollSheetsProps) {
  const { scopedDivisionIds, scopedCodes } = useOrg();

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [sheets, setSheets] = useState<SheetView[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const activeTitle = activeFile?.title ?? '';

  // Loaded row stores used to resolve join fields when saving.
  const loaded = useMemo(
    () => ({ caDetails: new Map<string, CaPayrollDetail>(), regEntries: new Map<string, PayrollEntry>() }),
    [],
  );

  // ── File list ───────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const [ca, init, per, emp] = await Promise.all([
        fetchAll<CaPayrollHeader>(() => supabase.from('ca_payroll_headers').select('*')),
        fetchAll<InitialPayrollRecord>(() => supabase.from('initial_payroll_records').select('*')),
        fetchAll<PayPeriod>(() => supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false })),
        fetchAll<Employee>(() => {
          const scopeFilter = profile ? getEmployeeFilter(profile) : null;
          let q = supabase.from('employees').select('id,empno,employee_number,last_name,lname,first_name,fname,stacode,regcode,divcode,payroll_group_id').eq('status', 'Active');
          if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
          return q;
        }),
      ]);

      const scopedPer = (per ?? []).filter((p) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes }));

      const entries: FileEntry[] = [];
      for (const h of ca ?? []) {
        entries.push({
          type: 'ca',
          id: h.id,
          title: h.payroll_no,
          sub: caStripSchoolPrefix(h.school_name ?? '') || (h.payroll_type ?? 'Communications'),
          status: h.status,
        });
      }
      for (const r of init ?? []) {
        entries.push({
          type: 'initial',
          id: r.id,
          title: r.payroll_no,
          sub: [r.period_from, r.period_to].filter(Boolean).join(' – ') || r.description || '',
          status: r.status,
        });
      }
      const scopedEmp = (emp ?? [] as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes }));
      // Only list periods that have at least one entry — pay periods with no
      // rows are empty files that add noise to the picker.
      const entryCounts = new Map<string, number>();
      await Promise.all(scopedPer.map(async (p) => {
        const ids = scopedEmp.map((e) => e.id);
        if (ids.length === 0) return;
        const { count, error } = await supabase
          .from('payroll_entries')
          .select('id', { count: 'exact', head: true })
          .in('pay_period_id', [p.id])
          .in('employee_id', ids.slice(0, 900));
        if (!error) entryCounts.set(p.id, count ?? 0);
      }));
      for (const p of scopedPer) {
        const c = entryCounts.get(p.id) ?? 0;
        if (c === 0) continue;
        entries.push({
          type: 'regular',
          id: p.id,
          title: p.period_name,
          sub: `${p.frequency ?? ''} · ${p.status}`.trim(),
          status: p.status,
        });
      }

      const order = { ca: 0, initial: 1, regular: 2 } as const;
      entries.sort((a, b) => order[a.type] - order[b.type] || b.title.localeCompare(a.title));
      setFiles(entries);
    } catch (err) {
      setFilesError(formatError(err));
    } finally {
      setFilesLoading(false);
    }
  }, [profile, scopedDivisionIds, scopedCodes]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) =>
      f.title.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q) || f.status.toLowerCase().includes(q),
    );
  }, [files, search]);

  // ── Open a payroll file ─────────────────────────────────────────────────────
  const openFile = useCallback(async (entry: FileEntry) => {
    setOpen(true);
    setActiveFile(entry);
    setRowsLoading(true);
    setRowsError(null);
    setSaveError(null);
    setSheets([]);
    setActiveSheet('');
    loaded.caDetails.clear();
    loaded.regEntries.clear();
    try {
      if (entry.type === 'ca') {
        const [details, emps, header] = await Promise.all([
          fetchAll<CaPayrollDetail>(() => supabase.from('ca_payroll_details').select('*').eq('payroll_id', entry.id).order('line_no')),
          fetchAll<CaEmployee>(() => supabase.from('ca_employees').select('*')),
          supabase.from('ca_payroll_headers').select('*').eq('id', entry.id).single(),
        ]);
        if (header.error) throw header.error;
        const empMap = new Map((emps ?? []).map((e) => [e.id, e]));
        for (const d of details ?? []) loaded.caDetails.set(d.id, d);

        const groups = new Map<string, { stacode: string; school: string; rows: (CaPayrollDetail & { emp?: CaEmployee })[] }>();
        for (const d of details ?? []) {
          const emp = empMap.get(d.employee_id);
          const stacode = emp?.stacode ?? '';
          const key = `${emp?.school_name ?? ''}|${stacode}`;
          const g = groups.get(key) ?? { stacode, school: emp?.school_name ?? '', rows: [] };
          g.rows.push({ ...d, emp });
          groups.set(key, g);
        }
        const sorted = [...groups.entries()].sort((a, b) => {
          const na = parseInt(a[0].split('|')[1] || '99999', 10);
          const nb = parseInt(b[0].split('|')[1] || '99999', 10);
          return (Number.isNaN(na) ? 99999 : na) - (Number.isNaN(nb) ? 99999 : nb);
        });

        const buildSheets: SheetView[] = sorted.map(([key, g], gi) => {
          const schoolBrief = caStripSchoolPrefix(g.school) || (caStacodeFromSchoolName(g.school) ? 'School' : g.school);
          let no = 0;
          const rows: SpreadsheetRow[] = g.rows.map((d) => {
            no += 1;
            return {
              id: d.id,
              cells: {
                no,
                account_no: d.emp?.account_no ?? '',
                last_name: d.emp?.last_name ?? '',
                first_name: d.emp?.first_name ?? '',
                middle_initial: d.emp?.middle_initial ?? '',
                position: d.emp?.position_title ?? '',
                amount: num(d.amount),
                deduction: num(d.deduction),
                net: num(d.net_amount_due),
                remarks: d.remarks ?? '',
              },
            };
          });
          const stacode = String(g.stacode ?? '');
          const label = `${stacode ? stacode.padStart(3, '0') + ' ' : ''}${schoolBrief || 'School ' + (gi + 1)}`;
          return { key, label, columns: CA_COLUMNS, rows };
        });
        setSheets(buildSheets);
        setActiveSheet(buildSheets[0]?.key ?? '');
      } else if (entry.type === 'initial') {
        const recs = await fetchAll<InitialPayrollEntry>(() => supabase.from('initial_payroll_entries').select('*').eq('record_id', entry.id).order('item_no'));
        const rows: SpreadsheetRow[] = (recs ?? []).map((e, i) => ({
          id: e.id,
          cells: {
            item_no: e.item_no ?? i + 1,
            employee_number: e.employee_number ?? '',
            surname: e.surname ?? '',
            first_name: e.first_name ?? '',
            middle_name: e.middle_name ?? '',
            school: e.school ?? '',
            position_title: e.position_title ?? '',
            salary_grade: e.salary_grade,
            salary_step: e.salary_step,
            monthly_salary: num(e.monthly_salary),
            days_worked: num(e.days_worked),
            gross_salary: num(e.gross_salary),
            basic_salary: num(e.basic_salary),
            pera: num(e.pera),
            other_earnings: num(e.other_earnings),
            total_earnings: num(e.total_earnings),
            gsis: num(e.gsis),
            philhealth: num(e.philhealth),
            pagibig: num(e.pagibig),
            withholding_tax: num(e.withholding_tax),
            loans: num(e.loans),
            other_deductions: num(e.other_deductions),
            total_deductions: num(e.total_deductions),
            net_pay: num(e.net_pay),
            atm_account_no: e.atm_account_no ?? '',
          },
        }));
        setSheets([{ key: 'entries', label: 'Entry List', columns: INITIAL_COLUMNS, rows }]);
        setActiveSheet('entries');
      } else {
        const [entries2, emps] = await Promise.all([
          fetchAll<PayrollEntry>(() => supabase.from('payroll_entries')
            .select('id,employee_id,pay_period_id,gross_pay,net_pay,dedlnr,dedmed,dedpag,dedtax,total_deductions,actual_loan_deductions,other_deductions,status')
            .eq('pay_period_id', entry.id)),
          fetchAll<Employee>(() => {
            const scopeFilter = profile ? getEmployeeFilter(profile) : null;
            let q = supabase.from('employees').select('id,empno,employee_number,last_name,lname,first_name,fname,stacode,regcode,divcode,payroll_group_id').eq('status', 'Active');
            if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
            return q;
          }),
        ]);
        const empMap = new Map((emps ?? []).map((e) => [e.id, e]));
        const rows: SpreadsheetRow[] = [];
        for (const pe of entries2 ?? []) {
          const e = empMap.get(pe.employee_id);
          if (!e) continue;
          loaded.regEntries.set(pe.id, pe);
          rows.push({
            id: pe.id,
            cells: {
              empno: e.empno ?? e.employee_number ?? '',
              last_name: e.last_name || e.lname || '',
              first_name: e.first_name || e.fname || '',
              gross_pay: num(pe.gross_pay),
              dedlnr: num(pe.dedlnr),
              dedmed: num(pe.dedmed),
              dedpag: num(pe.dedpag),
              dedtax: num(pe.dedtax),
              loans: num(pe.actual_loan_deductions ?? pe.other_deductions),
              total_deductions: num(pe.total_deductions),
              net_pay: num(pe.net_pay),
              status: pe.status ?? '',
            },
          });
        }
        setSheets([{ key: 'register', label: entry.title, columns: REGULAR_COLUMNS, rows }]);
        setActiveSheet('register');
      }
    } catch (err) {
      setRowsError(formatError(err));
    } finally {
      setRowsLoading(false);
    }
  }, [loaded, profile]);

  const active = sheets.find((s) => s.key === activeSheet) ?? sheets[0];

  // ── Save back ───────────────────────────────────────────────────────────────
  const persistChanges = useCallback(async (changes: SpreadsheetChange[]) => {
    setSaveError(null);
    setSaveMsg(null);
    if (changes.length === 0) return;
    const byRow = new Map<string, { colKey: string; value: unknown }[]>();
    for (const ch of changes) {
      const arr = byRow.get(ch.rowKey) ?? [];
      arr.push({ colKey: ch.colKey, value: ch.value });
      byRow.set(ch.rowKey, arr);
    }
    try {
      const openType = activeFile?.type;
      for (const [rowId, cols] of byRow) {
        const patch: Record<string, unknown> = {};
        for (const c of cols) patch[c.colKey] = c.value;
        if (openType === 'ca') {
          const base = loaded.caDetails.get(rowId);
          const amount = patch.amount ?? base?.amount ?? 0;
          const deduction = patch.deduction ?? base?.deduction ?? 0;
          patch.net_amount_due = money(Number(amount) - Number(deduction));
          const { error } = await supabase.from('ca_payroll_details').update(patch).eq('id', rowId);
          if (error) throw error;
        } else if (openType === 'initial') {
          const { error } = await supabase.from('initial_payroll_entries').update(patch).eq('id', rowId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('payroll_entries').update(patch).eq('id', rowId);
          if (error) throw error;
        }
      }
      setSaveMsg(`Saved ${changes.length} cell${changes.length === 1 ? '' : 's'} · ${activeTitle}`);
    } catch (err) {
      setSaveError(formatError(err));
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, loaded]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    if (!active || active.rows.length === 0) return;
    const headers = active.columns.map((c) => c.label);
    const data = active.rows.map((r) => active.columns.map((c) => r.cells[c.key] ?? ''));
    const csv = generateCsv(headers, data as (string | number)[][]);
    downloadFile({ filename: `PAYROLL_SHEET_${activeTitle.replace(/[^A-Za-z0-9-]/g, '_')}_${active.label.replace(/\s+/g, '_')}.csv`, content: csv, mimeType: 'text/csv' });
  }, [active, activeTitle]);

  const exportExcel = useCallback(() => {
    if (!active || active.rows.length === 0) return;
    const headers = active.columns.map((c) => c.label);
    const data = active.rows.map((r) => active.columns.map((c) => r.cells[c.key] ?? ''));
    const xls = generateExcel(headers, data as (string | number)[][], active.label.slice(0, 31));
    downloadFile({ filename: `PAYROLL_SHEET_${activeTitle.replace(/[^A-Za-z0-9-]/g, '_')}_${active.label.replace(/\s+/g, '_')}.xls`, content: xls, mimeType: 'application/vnd.ms-excel' });
  }, [active, activeTitle]);

  // ── File list screen ────────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Payroll Sheets</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Open any payroll file in an embedded Excel / Google-Sheets style view — edit cells and save back.
            </p>
          </div>
          <button onClick={() => void loadFiles()} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh Files
          </button>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {saveError}
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payroll files…"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm outline-none focus:border-deped-500"
          />
        </div>

        <div className="space-y-2">
          {(['ca', 'initial', 'regular'] as PayType[]).map((type) => {
            const group = filteredFiles.filter((f) => f.type === type);
            if (group.length === 0) return null;
            const Icon = TYPE_META[type].icon;
            return (
              <div key={type} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <Icon className={`w-4 h-4 ${TYPE_META[type].tone}`} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{TYPE_META[type].label}</span>
                  <span className="ml-auto text-xs text-slate-400">{group.length}</span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {group.map((f) => (
                    <li key={`${f.type}-${f.id}`}>
                      <button
                        onClick={() => void openFile(f)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-deped-50 dark:hover:bg-deped-900/20 transition-colors"
                      >
                        <FolderOpen className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{f.title}</span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{f.sub || f.status}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                          {f.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {filesLoading && (
          <div className="flex items-center justify-center py-16"><LoadingIndicator /></div>
        )}
        {!filesLoading && files.length === 0 && !filesError && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-14 text-slate-400">
            <FileSpreadsheet className="w-8 h-8" />
            <p className="text-sm">No payroll files found.</p>
          </div>
        )}
        {filesError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {filesError}
          </div>
        )}
      </div>
    );
  }

  // ── Spreadsheet screen ──────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-12rem)] min-h-[480px] flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Files
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{activeTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {sheets.length} sheet{sheets.length === 1 ? '' : 's'} · {sheets[0]?.rows.length ?? 0} rows
          </p>
        </div>
        {saveMsg && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{saveMsg}</span>}
        {saveError && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {saveError}
          </span>
        )}
      </div>

      {rowsLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading payroll file…</div>
          </div>
        </div>
      ) : active ? (
        <SpreadsheetGrid
          columns={active.columns}
          rows={active.rows}
          sheetTabs={sheets.map((s) => ({ key: s.key, label: s.label } as SheetTab))}
          activeSheet={activeSheet}
          onSheetChange={(k) => setActiveSheet(k)}
          fileName={activeTitle}
          onSave={persistChanges}
          onRefresh={() => {
            const f = files.find((x) => x.title === activeTitle);
            if (f) void openFile(f);
          }}
          onExportCsv={exportCsv}
          onExportExcel={exportExcel}
          onBack={() => setOpen(false)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-sm">
          {rowsError ?? 'This file could not be loaded.'}
        </div>
      )}
    </div>
  );
}