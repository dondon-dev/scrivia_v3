import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Download, Table2, Info, ChevronDown, ChevronUp,
  FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll } from '@/lib/supabase';
import { downloadFile, currency, generateCsv, generateExcel, generatePayrollDbf } from '@/lib/reports';
import { useAuth } from '@/lib/auth';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import type { Employee, PayPeriod, PayrollEntry } from '@/types/payroll';
import { usePagination, Pagination } from '@/components/Pagination';

interface PayrollRow {
  id: string;
  empno: string;
  lname: string;
  fname: string;
  dept: string;
  bankac: string;
  stacode: string;
  gross: number;
  deduct: number;
  net: number;
  period: string;
  status: string;
}

const FIELD_SPEC: { key: keyof PayrollRow; label: string; type: 'C' | 'N'; len: number; dec: number }[] = [
  { key: 'empno',   label: 'EMPNO',   type: 'C', len: 15, dec: 0 },
  { key: 'lname',   label: 'LNAME',   type: 'C', len: 25, dec: 0 },
  { key: 'fname',   label: 'FNAME',   type: 'C', len: 25, dec: 0 },
  { key: 'dept',    label: 'DEPT',    type: 'C', len: 20, dec: 0 },
  { key: 'bankac',  label: 'BANKAC',  type: 'C', len: 20, dec: 0 },
  { key: 'gross',   label: 'GROSS',   type: 'N', len: 12, dec: 2 },
  { key: 'deduct',  label: 'DEDUCT',  type: 'N', len: 12, dec: 2 },
  { key: 'net',     label: 'NET',     type: 'N', len: 12, dec: 2 },
  { key: 'period',  label: 'PERIOD',  type: 'C', len: 25, dec: 0 },
  { key: 'status',  label: 'STATUS',  type: 'C', len: 10, dec: 0 },
];

type SortDir = 'asc' | 'desc';

function entryToRow(entry: PayrollEntry, emp: Employee | undefined, period: PayPeriod | undefined): PayrollRow {
  return {
    id: entry.id,
    empno: emp?.empno || emp?.employee_number || '',
    lname: emp?.lname || emp?.last_name || '',
    fname: emp?.fname || emp?.first_name || '',
    dept: emp?.department || '',
    bankac: emp?.account || emp?.bank_account || '',
    stacode: emp?.stacode || '',
    gross: Number(entry.gross_pay ?? 0),
    deduct: Number(entry.total_deductions ?? 0),
    net: Number(entry.net_pay ?? 0),
    period: period?.period_name ?? '',
    status: entry.status ?? '',
  };
}

export default function PayrollDbfManager({ category }: { category?: PayrollCategory | null }) {
  const { logAudit } = useAuth();
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmpno, setSearchEmpno] = useState('');
  const [searchLname, setSearchLname] = useState('');
  const [sortKey, setSortKey] = useState<keyof PayrollRow>('empno');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [exportMenu, setExportMenu] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: per }, emp] = await Promise.all([
        supabase.from('pay_periods').select('*').order('start_date', { ascending: false }),
        fetchAll(() => supabase.from('employees').select('*').order('last_name')),
      ]);
      const scopedPer = (per ?? []).filter((p) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes }));
      setPeriods(scopedPer);
      // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
      // unique reference for one division's payroll.
      setEmployees((emp as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
      if (scopedPer.length > 0) setPeriodId(scopedPer[0].id);
      setLoading(false);
    })();
  }, [scopedDivisionIds, scopedCodes]);

  const loadData = useCallback(async () => {
    if (!periodId) { setEntries([]); return; }
    const ent = await fetchAll(() => supabase.from('payroll_entries').select('*').eq('pay_period_id', periodId));
    setEntries(ent);
  }, [periodId]);

  useEffect(() => { loadData(); }, [loadData]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const currentPeriod = periods.find((p) => p.id === periodId);

  // Only show/export entries belonging to the selected division's employees.
  const allRows = useMemo(() =>
    entries
      .filter((e) => empMap.has(e.employee_id))
      .map((e) => entryToRow(e, empMap.get(e.employee_id), currentPeriod)),
    [entries, empMap, currentPeriod],
  );

  const filtered = useMemo(() => {
    let rows = allRows;
    if (category) rows = rows.filter((r) => inCategory(r.stacode, category));
    if (searchEmpno) rows = rows.filter((r) => r.empno.includes(searchEmpno.trim()));
    if (searchLname) rows = rows.filter((r) => r.lname.toUpperCase().includes(searchLname.trim().toUpperCase()));
    const col = FIELD_SPEC.find((c) => c.key === sortKey);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      let cmp: number;
      if (col?.type === 'N') cmp = (av as number) - (bv as number);
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [allRows, searchEmpno, searchLname, sortKey, sortDir, category]);

  const pag = usePagination(filtered, 50, [searchEmpno, searchLname, periodId, category]);

  const totalGross = filtered.reduce((s, r) => s + r.gross, 0);
  const totalDeduct = filtered.reduce((s, r) => s + r.deduct, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net, 0);

  function handleSort(key: keyof PayrollRow) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function exportDbf() {
    const data = generatePayrollDbf(entries.filter((e) => empMap.has(e.employee_id)), employees, currentPeriod!);
    downloadFile({ filename: `PAYROLL_${currentPeriod?.period_name?.replace(/\s/g, '_') ?? 'export'}.dbf`, content: data, mimeType: 'application/dbf' });
    logAudit('payroll_dbf_export', 'pay_period', periodId, { recordCount: filtered.length, periodName: currentPeriod?.period_name });
  }

  function exportCsv() {
    const headers = FIELD_SPEC.map((s) => s.label);
    const rows = filtered.map((r) => FIELD_SPEC.map((s) => s.type === 'N' ? r[s.key] : r[s.key]));
    downloadFile({ filename: `PAYROLL_${currentPeriod?.period_name?.replace(/\s/g, '_') ?? 'export'}.csv`, content: generateCsv(headers, rows), mimeType: 'text/csv' });
  }

  function exportExcel() {
    const headers = FIELD_SPEC.map((s) => s.label);
    const rows = filtered.map((r) => FIELD_SPEC.map((s) => r[s.key]));
    downloadFile({ filename: `PAYROLL_${currentPeriod?.period_name?.replace(/\s/g, '_') ?? 'export'}.xls`, content: generateExcel(headers, rows, 'PAYROLL'), mimeType: 'application/vnd.ms-excel' });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Table2 className="w-5 h-5 text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-800">PAYROLL.DBF — Payroll Export</h1>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Data comes from the Payroll Run.</p>
          <p className="text-xs text-blue-700 mt-0.5">Select a pay period to view computed payroll entries. The grid and all exports are generated from the payroll run results — not a separate table. Run payroll first on the Payroll page if no entries appear.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-w-[200px]">
            {periods.length === 0 && <option>No pay periods yet</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
          {currentPeriod && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${currentPeriod.status === 'open' ? 'bg-emerald-50 text-emerald-700' : currentPeriod.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{currentPeriod.status.toUpperCase()}</span>
          )}
          <div className="relative flex-1 min-w-[120px] max-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchEmpno} onChange={(e) => setSearchEmpno(e.target.value)} placeholder="Search EMPNO…" className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
          <div className="relative flex-1 min-w-[120px] max-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchLname} onChange={(e) => setSearchLname(e.target.value)} placeholder="Search Last Name…" className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors" title="Refresh data">
            {loading ? <ScriviaLogo className="w-4 h-4 animate-pulse" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button onClick={() => setExportMenu(!exportMenu)} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" /> Export <ChevronDown className="w-3 h-3" />
            </button>
            {exportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-20 py-1">
                  <button onClick={() => { setExportMenu(false); exportDbf(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"><Table2 className="w-4 h-4" /> Export DBF</button>
                  <button onClick={() => { setExportMenu(false); exportExcel(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"><FileSpreadsheet className="w-4 h-4" /> Export Excel</button>
                  <button onClick={() => { setExportMenu(false); exportCsv(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"><Download className="w-4 h-4" /> Export CSV</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Records" value={String(filtered.length)} />
          <StatCard label="Total GROSS" value={currency(totalGross)} tone="blue" />
          <StatCard label="Total Deductions" value={currency(totalDeduct)} tone="rose" />
          <StatCard label="Total NET" value={currency(totalNet)} tone="emerald" />
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading payroll data…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Table2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500 mb-1">
              {periods.length === 0 ? 'No pay periods exist yet. Create one on the Payroll page first.' : entries.length === 0 ? 'No payroll entries for this period. Run payroll on the Payroll page first.' : 'No records match your filters.'}
            </p>
            {entries.length === 0 && periods.length > 0 && (
              <a href="#" onClick={(e) => e.preventDefault()} className="text-xs text-blue-600 hover:underline">Go to Payroll page to run payroll</a>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    {FIELD_SPEC.map((col) => {
                      const isSorted = sortKey === col.key;
                      return (
                        <th key={col.key} onClick={() => handleSort(col.key)} className={`px-3 py-2.5 font-semibold border-b border-r border-slate-200 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition-colors ${isSorted ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>
                          <div className="flex items-center gap-0.5">{col.label}{isSorted && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pag.pagedItems.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      {FIELD_SPEC.map((col) => {
                        const v = r[col.key];
                        return (
                          <td key={col.key} className={`px-3 py-2 border-b border-r border-slate-100 whitespace-nowrap ${col.type === 'N' ? 'text-right tabular-nums' : ''} ${col.key === 'net' ? 'font-semibold text-emerald-700' : ''}`}>
                            {col.type === 'N' ? currency(v as number) : String(v ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                    {FIELD_SPEC.map((col) => (
                      <td key={col.key} className={`px-3 py-2 border-r border-slate-100 ${col.key === 'gross' || col.key === 'deduct' || col.key === 'net' ? 'text-right tabular-nums' : ''}`}>
                        {col.key === 'gross' ? currency(totalGross) : col.key === 'deduct' ? currency(totalDeduct) : col.key === 'net' ? currency(totalNet) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'blue' | 'rose' }) {
  const tones: Record<string, string> = { emerald: 'text-emerald-600', amber: 'text-amber-600', blue: 'text-blue-600', rose: 'text-rose-600' };
  return <div className="bg-white rounded-xl border border-slate-200 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-lg font-semibold mt-0.5 ${tone ? tones[tone] : 'text-slate-800'}`}>{value}</p></div>;
}
