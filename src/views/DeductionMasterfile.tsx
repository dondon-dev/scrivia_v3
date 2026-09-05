import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Pencil, Trash2, X, Upload, Download, FileText, Landmark,
  CheckCircle2, AlertTriangle, AlertCircle, ClipboardList, FileBarChart,
  CalendarClock, Coins, ShieldCheck, ChevronDown, Info, History, MoreVertical,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/pb';
import { downloadFile, currency, generateCsv, generateDedfileDbf, DEDFILE_FIELDS } from '@/lib/reports';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { validateUpload } from '@/lib/uploadSecurity';
import { recomputeEmployeeNetPay, bulkRecomputeNetPay } from '@/lib/recompute';
import type { Employee, PayrollDeduction, PayrollGroup, DeductionCode } from '@/types/payroll';
import DeleteAllConfirm from '@/components/DeleteAllConfirm';
import { Pagination } from '@/components/Pagination';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';
import { useServerPagination } from '@/lib/useServerPagination';
import { useOrg, matchesOrgScope } from '@/lib/org';

const STATUS_OPTIONS = ['Active', 'Suspended', 'Terminated'] as const;
const TYPE_OPTIONS = ['Loan', 'Insurance', 'Membership', 'Savings', 'Other'] as const;

interface DedForm {
  empno: string;
  employee_id: string;
  dedcode: string;
  dedid: string;
  policyno: string;
  effmm: number;
  effyy: number;
  termm: number | '';
  teryy: number | '';
  dedamt: number;
  principal: number;
  interest: number;
  charges: number;
  proceeds: number;
  agency: string;
  status: typeof STATUS_OPTIONS[number];
  type: typeof TYPE_OPTIONS[number];
}

function emptyForm(): DedForm {
  return {
    empno: '', employee_id: '', dedcode: '', dedid: '', policyno: '',
    effmm: 1, effyy: 25, termm: '', teryy: '',
    dedamt: 0, principal: 0, interest: 0, charges: 0, proceeds: 0,
    agency: '', status: 'Active', type: 'Other',
  };
}

function formFromDed(d: PayrollDeduction): DedForm {
  return {
    empno: d.empno, employee_id: d.employee_id ?? '', dedcode: d.dedcode,
    dedid: d.dedid, policyno: d.policyno, effmm: d.effmm, effyy: d.effyy,
    termm: d.termm ?? '', teryy: d.teryy ?? '',
    dedamt: Number(d.dedamt), principal: Number(d.principal),
    interest: Number(d.interest), charges: Number(d.charges),
    proceeds: Number(d.proceeds), agency: d.agency, status: d.status, type: d.type,
  };
}

// Normalize a year to 4 digits. Values < 100 are treated as 2-digit (e.g. 25 → 2025).
function toFullYear(yy: number): number {
  return yy < 100 ? 2000 + yy : yy;
}

// Check if a deduction is active for a given payroll year/month.
// Per spec: STATUS <> 'T' — only Terminated deductions are excluded.
// Active and Suspended deductions are both included in payroll computation.
// Accepts either 2-digit or 4-digit years for both the deduction and the payroll period.
export function isDeductionActive(d: PayrollDeduction, payYY: number, payMM: number): boolean {
  if (d.status === 'Terminated') return false;
  const payYear = toFullYear(payYY);
  const payrollYM = payYear * 100 + payMM;
  const effectiveYM = toFullYear(d.effyy) * 100 + d.effmm;
  if (payrollYM < effectiveYM) return false;
  if (d.teryy != null && d.termm != null && d.teryy > 0 && d.termm > 0) {
    const termYM = toFullYear(d.teryy) * 100 + d.termm;
    if (payrollYM > termYM) return false;
  }
  return true;
}

export default function DeductionMasterfile() {
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PayrollDeduction | null>(null);
  const [form, setForm] = useState<DedForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [history, setHistory] = useState<PayrollDeduction | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [allDedsForReport, setAllDedsForReport] = useState<PayrollDeduction[] | null>(null);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);

  const dedCodeMap = useMemo(() => new Map(dedCodes.map((c) => [c.dedcode, c])), [dedCodes]);
  const groupsForFilter = useMemo(() => payrollGroups, [payrollGroups]);
  const gf = useMemo(() => resolveGroupFilter(groupFilter, groupsForFilter), [groupFilter, groupsForFilter]);

  // Server-side pagination for deductions — fetch 10 rows per page, not 9,289
  const serverPag = useServerPagination<PayrollDeduction>('query_payroll_deductions', {
    p_search: search || null,
    p_status_filter: statusFilter,
    p_type_filter: typeFilter,
    // REGCODE + DIVCODE are the unique reference for one division's payroll
    p_regcode: scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null,
    p_divcodes: scopedCodes && scopedCodes.length > 0 ? scopedCodes.map((c) => c.divcode) : null,
    p_stacode_min: gf.stacodeMin,
    p_stacode_max: gf.stacodeMax,
  }, { pageSize: 10 });
  const deductions = serverPag.rows;

  // Fetch all deductions on-demand when a report panel is opened, limited to
  // the selected division's employees (by employee_id, with empno fallback for
  // legacy rows that carry no employee_id).
  useEffect(() => {
    if (activeReport && !allDedsForReport && employees.length > 0) {
      (async () => {
        const all = await fetchAll(() => supabase.from('payroll_deductions').select('id,employee_id,empno,dedcode,dedid,policyno,agency,type,status,effmm,effyy,termm,teryy,dedamt,principal,interest,charges,proceeds').order('empno'));
        const empIds = new Set(employees.map((e) => e.id));
        const empNos = new Set(employees.map((e) => (e.empno ?? e.employee_number ?? '').trim()));
        setAllDedsForReport((all as PayrollDeduction[]).filter(
          (d) => empIds.has(d.employee_id ?? '') || empNos.has((d.empno ?? '').trim()),
        ));
      })();
    }
    if (!activeReport) setAllDedsForReport(null);
  }, [activeReport, employees]);

  const refreshFn = useRef<() => void>(() => {});
  refreshFn.current = serverPag.refresh;

  const load = useCallback(async () => {
    setLoading(true);
    const [emp, grp] = await Promise.all([
      fetchAll(() => supabase.from('employees').select('id,empno,employee_number,lname,last_name,fname,first_name,mi,division_id,regcode,divcode').order('last_name')),
      fetchAll(() => supabase.from('payroll_groups').select('*').eq('status', 'Active').order('group_code')),
    ]);
    // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
    // unique reference for one division's payroll.
    setEmployees((emp as unknown as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
    setPayrollGroups(grp as PayrollGroup[]);
    setLoading(false);
  }, [scopedDivisionIds, scopedCodes]);

  useEffect(() => { load(); refreshFn.current(); }, [load]);

  // Keep totalCount in sync for stats display
  useEffect(() => { setTotalCount(serverPag.total); }, [serverPag.total]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const empByNumber = useMemo(() => new Map(employees.map((e) => [e.empno || e.employee_number, e])), [employees]);

  // Stats are now based on the current page (the server already filtered)
  const totalAmount = deductions.reduce((s, d) => s + Number(d.dedamt), 0);
  const activeCount = deductions.filter((d) => d.status === 'Active').length;
  const loanCount = deductions.filter((d) => d.type === 'Loan').length;

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setShowModal(true);
  }

  function openEdit(d: PayrollDeduction) {
    setEditing(d);
    setForm(formFromDed(d));
    setError('');
    setShowModal(true);
  }

  async function save() {
    setError('');
    if (!form.employee_id) { setError('Please select an employee.'); return; }
    if (!form.dedcode) { setError('Deduction Code is required.'); return; }
    if (form.dedamt < 0) { setError('Deduction Amount cannot be negative.'); return; }
    const effYM = form.effyy * 100 + form.effmm;
    if (form.teryy !== '' && form.termm !== '' && form.teryy > 0 && form.termm > 0) {
      const termYM = form.teryy * 100 + form.termm;
      if (effYM > termYM) { setError('Effective Date must not be later than Termination Date.'); return; }
    }
    // Duplicate check: active ded with same empno + dedcode + policyno
    const dupes = deductions.filter((d) =>
      d.empno === form.empno &&
      d.dedcode === form.dedcode &&
      d.policyno === form.policyno &&
      d.status === 'Active' &&
      d.id !== editing?.id
    );
    if (dupes.length > 0 && form.status === 'Active') {
      setError('An active deduction with the same Employee Number, Deduction Code, and Policy Number already exists.');
      return;
    }

    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      empno: form.empno,
      dedcode: form.dedcode.toUpperCase(),
      dedid: form.dedid,
      policyno: form.policyno,
      effmm: form.effmm,
      effyy: form.effyy,
      termm: form.termm === '' ? null : form.termm,
      teryy: form.teryy === '' ? null : form.teryy,
      dedamt: form.dedamt,
      principal: form.principal,
      interest: form.interest,
      charges: form.charges,
      proceeds: form.proceeds,
      agency: form.agency,
      status: form.status,
      type: form.type,
      updated_by: 'system',
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error: err } = await supabase.from('payroll_deductions').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('payroll_deductions').insert({ ...payload, created_by: 'system' });
      if (err) { setError(err.message); setSaving(false); return; }
    }
    // Auto-recompute the affected employee's net pay after deduction add/edit
    if (form.employee_id) await recomputeEmployeeNetPay(form.employee_id);
    setSaving(false);
    setShowModal(false);
    load(); refreshFn.current();
  }

  async function remove(d: PayrollDeduction) {
    if (!confirm(`Delete deduction ${d.dedcode} for ${d.empno}?`)) return;
    const empId = d.employee_id;
    await supabase.from('payroll_deductions').delete().eq('id', d.id);
    // Auto-recompute the affected employee's net pay after deduction delete
    if (empId) await recomputeEmployeeNetPay(empId);
    load(); refreshFn.current();
  }

  async function deleteAllDeductions() {
    const { error } = await supabase.from('payroll_deductions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await load(); refreshFn.current();
  }

  function exportCsv() {
    const rows = deductions.map((d) => {
      const e = empMap.get(d.employee_id ?? '');
      return [
        d.empno, e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : '',
        d.dedcode, d.dedid, d.policyno, d.agency, d.type, d.status,
        String(d.effmm).padStart(2, '0'), String(d.effyy).padStart(2, '0'),
        d.termm ? String(d.termm).padStart(2, '0') : '', d.teryy ? String(d.teryy).padStart(2, '0') : '',
        d.dedamt, d.principal, d.interest, d.charges, d.proceeds,
      ];
    });
    const content = generateCsv(
      ['EMPNO', 'NAME', 'DEDCODE', 'DEDID', 'POLICYNO', 'AGENCY', 'TYPE', 'STATUS', 'EFFMM', 'EFFYY', 'TERMM', 'TERYY', 'DEDAMT', 'PRINCIPAL', 'INTEREST', 'CHARGES', 'PROCEEDS'],
      rows,
    );
    downloadFile({ filename: `deduction_masterfile_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  function exportDbf() {
    const data = generateDedfileDbf(deductions, employees);
    downloadFile({ filename: `DEDFILE_${new Date().toISOString().slice(0, 10)}.DBF`, content: data, mimeType: 'application/dbf' });
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by emp no, code, policy…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option>All</option><option>Active</option><option>Suspended</option><option>Terminated</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option>All</option><option>Loan</option><option>Insurance</option><option>Membership</option><option>Savings</option><option>Other</option>
          </select>
          <GroupFilter value={groupFilter} onChange={setGroupFilter} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" /> Import DBF
          </button>
          <button onClick={exportDbf} disabled={deductions.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Export DBF
          </button>
          <button onClick={exportCsv} disabled={deductions.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Deduction
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-20 py-1">
                  <button
                    onClick={() => { setMenuOpen(false); setShowDeleteAll(true); }}
                    disabled={deductions.length === 0}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete All Deductions
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Records" value={String(totalCount)} />
          <StatCard label="Active" value={String(activeCount)} tone="emerald" />
          <StatCard label="Loans" value={String(loanCount)} tone="amber" />
          <StatCard label="Total Monthly Amount" value={currency(totalAmount)} tone="blue" />
        </div>
      )}

      {/* Reports bar */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Reports:</span>
          {[
            { id: 'ledger', label: 'Employee Deduction Ledger', icon: ClipboardList },
            { id: 'summary', label: 'Deduction Summary by Code', icon: FileBarChart },
            { id: 'remittance', label: 'Monthly Remittance', icon: Coins },
            { id: 'loans', label: 'Active Loans', icon: Landmark },
            { id: 'expiring', label: 'Expiring Deductions', icon: CalendarClock },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveReport(activeReport === r.id ? null : r.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeReport === r.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <r.icon className="w-3.5 h-3.5" /> {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Report panel */}
      {activeReport && (
        <ReportPanel
          reportId={activeReport}
          deductions={allDedsForReport ?? deductions}
          empMap={empMap}
          dedCodeMap={dedCodeMap}
          onClose={() => setActiveReport(null)}
        />
      )}

      {/* Main table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading deduction masterfile…</div>
        ) : deductions.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500">
              {totalCount === 0 ? 'No deductions yet. Click "Add Deduction" or import a file.' : 'No deductions match your filters.'}
            </p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Code</th>
                  <th className="text-left px-4 py-3 font-medium">Policy No.</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-center px-4 py-3 font-medium">Eff. Period</th>
                  <th className="text-center px-4 py-3 font-medium">Term. Period</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deductions.map((d) => {
                  const e = empMap.get(d.employee_id ?? '');
                  const name = e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : d.empno;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono font-semibold">{d.dedcode}</span>{dedCodeMap.get(d.dedcode)?.dedname && <span className="block text-[10px] text-slate-400 mt-0.5">{dedCodeMap.get(d.dedcode)!.dedname}</span>}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{d.policyno || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{d.type}</td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">{String(d.effmm).padStart(2, '0')}/{String(d.effyy).padStart(2, '0')}</td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">{d.termm ? `${String(d.termm).padStart(2, '0')}/${String(d.teryy).padStart(2, '0')}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{currency(d.dedamt)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                          d.status === 'Suspended' ? 'bg-amber-50 text-amber-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setHistory(d)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Audit trail">
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => openEdit(d)} className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(d)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                  <td colSpan={7} className="px-4 py-3">Totals ({totalCount} records)</td>
                  <td className="px-4 py-3 text-right">{currency(totalAmount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination page={serverPag.page} totalPages={serverPag.totalPages} total={serverPag.total} onPageChange={serverPag.setPage} />
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-slate-800">{editing ? 'Edit Deduction' : 'Add Deduction'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <div>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Employee *</span>
                  <select
                    value={form.employee_id}
                    onChange={(e) => {
                      const emp = employees.find((em) => em.id === e.target.value);
                      setForm({ ...form, employee_id: e.target.value, empno: emp?.empno || emp?.employee_number || '' });
                    }}
                    className={inputCls}
                  >
                    <option value="">Select employee…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.empno || e.employee_number} — {e.lname || e.last_name}, {e.fname || e.first_name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Deduction Code *</span>
                  <select
                    value={form.dedcode}
                    onChange={(e) => {
                      const code = dedCodes.find((c) => c.dedcode === e.target.value);
                      setForm({ ...form, dedcode: e.target.value, agency: code?.agency ?? form.agency, type: (code?.type as typeof TYPE_OPTIONS[number]) ?? form.type });
                    }}
                    className={inputCls}
                  >
                    <option value="">Select code…</option>
                    {dedCodes.map((c) => (
                      <option key={c.dedcode} value={c.dedcode}>{c.dedcode} — {c.dedname} ({c.agency})</option>
                    ))}
                  </select>
                  {form.dedcode && !dedCodeMap.has(form.dedcode) && (
                    <span className="block text-[10px] text-amber-600 mt-0.5">Code not in lookup — agency/type must be set manually</span>
                  )}
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Deduction ID</span>
                  <input value={form.dedid} onChange={(e) => setForm({ ...form, dedid: e.target.value })} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Policy Number</span>
                  <input value={form.policyno} onChange={(e) => setForm({ ...form, policyno: e.target.value })} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Eff. Month</span>
                  <input type="number" min={1} max={12} value={form.effmm} onChange={(e) => setForm({ ...form, effmm: parseInt(e.target.value) || 1 })} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Eff. Year (YY)</span>
                  <input type="number" value={form.effyy} onChange={(e) => setForm({ ...form, effyy: parseInt(e.target.value) || 0 })} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Term. Month</span>
                  <input type="number" min={1} max={12} value={form.termm} onChange={(e) => setForm({ ...form, termm: e.target.value === '' ? '' : parseInt(e.target.value) || '' })} placeholder="—" className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Term. Year (YY)</span>
                  <input type="number" value={form.teryy} onChange={(e) => setForm({ ...form, teryy: e.target.value === '' ? '' : parseInt(e.target.value) || '' })} placeholder="—" className={inputCls} />
                </label>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Amounts</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Deduction Amount *</span>
                    <input type="number" step="0.01" min={0} value={form.dedamt} onChange={(e) => setForm({ ...form, dedamt: parseFloat(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Principal</span>
                    <input type="number" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: parseFloat(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Interest</span>
                    <input type="number" step="0.01" value={form.interest} onChange={(e) => setForm({ ...form, interest: parseFloat(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Charges</span>
                    <input type="number" step="0.01" value={form.charges} onChange={(e) => setForm({ ...form, charges: parseFloat(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Loan Proceeds</span>
                    <input type="number" step="0.01" value={form.proceeds} onChange={(e) => setForm({ ...form, proceeds: parseFloat(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-600 mb-1">Agency</span>
                    <input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} className={inputCls} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Status</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof STATUS_OPTIONS[number] })} className={inputCls}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Type</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof TYPE_OPTIONS[number] })} className={inputCls}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Deduction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      <DeleteAllConfirm
        open={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={deleteAllDeductions}
        title="Delete All Deductions"
        count={totalCount}
        label="deduction records"
        description="This will remove every deduction from the masterfile. Employee records will remain, but all loan, insurance, membership, and savings deductions will be permanently deleted."
      />

      {showUpload && (
        <UploadModal
          employees={employees}
          empByNumber={empByNumber}
          onClose={() => { setShowUpload(false); }}
          onImported={() => { setShowUpload(false); load(); refreshFn.current(); }}
        />
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

// ── Upload Modal (CSV / DBF) ─────────────────────────────────────────────

interface UploadProps {
  employees: Employee[];
  empByNumber: Map<string, Employee>;
  onClose: () => void;
  onImported: () => void;
}

function UploadModal({ employees: _employees, empByNumber, onClose, onImported }: UploadProps) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[]; autoCreated?: number; summary?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Map FoxPro DEDFILE column names to normalized keys.
  // DEDFILE uses short codes: DEDC, DE, EF, IEFFY, TEITERY, S, T, AGENT, etc.
  const FIELDS_MAP: Record<string, string[]> = {
    empno:     ['EMPNO'],
    dedcode:   ['DEDC', 'DEDCODE'],
    dedid:     ['DE', 'DEDID'],
    policyno:  ['POLICYNO'],
    effmm:     ['EF', 'EFFMM'],
    effyy:     ['IEFFY', 'EFFYY'],
    termm:     ['TEITERY', 'TERMM'], // TEITERY in DBF is termination year; termm may not exist
    teryy:     ['TEITERY', 'TERYY'],
    dedamt:    ['DEDAMT'],
    principal: ['PRINCIPAL'],
    interest:  ['INTEREST'],
    charges:   ['CHARGES'],
    proceeds:  ['PROCEED', 'PROCEEDS'],
    agency:    ['AGENT', 'AGEN', 'AGENCY'],
    status:    ['S', 'STATUS'],
    type:      ['T', 'TYPE'],
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

  function handleText(text: string) {
    setRawText(text);
    setParsed(parseCsv(text));
  }

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) {
      setResult({ imported: 0, skipped: 0, errors: [validation.error ?? 'Invalid file'] });
      return;
    }
    if (file.name.toLowerCase().endsWith('.dbf')) {
      const buf = await file.arrayBuffer();
      try {
        const { records } = decodeDbf(new Uint8Array(buf));
        const mapped = records.map((rec: DbfRecord) => {
          const row: Record<string, string> = {};
          for (const key in rec) { row[key.toUpperCase()] = String(rec[key] ?? '').trim(); }
          return normRow(row);
        });
        setRawText(`[DBF file: ${file.name} — ${mapped.length} records]`);
        setParsed(mapped);
      } catch (err) {
        setResult({ imported: 0, skipped: 0, errors: [`Failed to read DBF: ${(err as Error).message}`] });
      }
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

    // 1. Auto-create stub employees for unknown empnos
    const knownEmpnos = new Set(empByNumber.keys());
    const unknownEmpnos = new Set<string>();
    for (const r of parsed) {
      const empno = (r['empno'] ?? '').trim();
      if (empno && !knownEmpnos.has(empno)) unknownEmpnos.add(empno);
    }
    if (unknownEmpnos.size > 0) {
      const stubs = [...unknownEmpnos].map((empno) => ({
        employee_number: empno,
        empno,
        last_name: '(Imported)',
        first_name: empno,
        status: 'Active',
      }));
      await supabase.from('employees').insert(stubs);
      const { data: newEmps } = await supabase
        .from('employees')
        .select('id, empno, employee_number, lname, last_name, fname, first_name, mi')
        .in('employee_number', [...unknownEmpnos]);
      (newEmps as Employee[] | null)?.forEach((e) => {
        empByNumber.set(e.empno || e.employee_number, e);
      });
    }

    // 2. Parse, validate, and de-duplicate rows
    const rowMap = new Map<string, Record<string, unknown>>(); // key: empno|dedcode|policyno|status
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const empno = (r['empno'] ?? '').trim();
      const dedcode = (r['dedcode'] ?? '').trim().toUpperCase();
      if (!empno || !dedcode) { skipped++; errors.push(`Row ${i + 2}: Missing EMPNO or DEDC.`); continue; }
      const emp = empByNumber.get(empno);
      if (!emp) { skipped++; errors.push(`Row ${i + 2}: Employee ${empno} not found.`); continue; }
      const dedamt = parseFloat(r['dedamt'] ?? '0') || 0;
      if (dedamt < 0) { skipped++; errors.push(`Row ${i + 2}: Negative deduction amount for ${empno}.`); continue; }
      const status = decodeStatus(r['status'] ?? '');
      const policyno = (r['policyno'] ?? '').trim();
      const row: Record<string, unknown> = {
        employee_id: emp.id,
        empno,
        dedcode,
        dedid: r['dedid'] ?? '',
        policyno,
        effmm: parseInt(r['effmm'] ?? '1') || 1,
        effyy: parseInt(r['effyy'] ?? '25') || 25,
        termm: r['termm'] ? parseInt(r['termm']) || null : null,
        teryy: r['teryy'] ? parseInt(r['teryy']) || null : null,
        dedamt,
        principal: parseFloat(r['principal'] ?? '0') || 0,
        interest: parseFloat(r['interest'] ?? '0') || 0,
        charges: parseFloat(r['charges'] ?? '0') || 0,
        proceeds: parseFloat(r['proceeds'] ?? '0') || 0,
        agency: r['agency'] ?? '',
        status,
        type: decodeType(r['type'] ?? ''),
        created_by: 'import',
        updated_by: 'import',
      };
      rowMap.set(`${empno}|${dedcode}|${policyno}|${status}`, row);
    }

    const allRows = [...rowMap.values()];
    const activeRows = allRows.filter((r) => r.status === 'Active');
    const nonActiveRows = allRows.filter((r) => r.status !== 'Active');

    // 3. Fetch existing active deductions to upsert instead of insert
    const activeEmpnos = [...new Set(activeRows.map((r) => r.empno as string))];
    let existingActive: PayrollDeduction[] = [];
    if (activeEmpnos.length > 0) {
      const { data: existing } = await supabase
        .from('payroll_deductions')
        .select('*')
        .in('empno', activeEmpnos)
        .eq('status', 'Active');
      existingActive = (existing as PayrollDeduction[]) ?? [];
    }
    const existingMap = new Map<string, string>();
    existingActive.forEach((d) => existingMap.set(`${d.empno}|${d.dedcode}|${d.policyno}`, d.id));

    // 4. Split active rows into updates vs inserts
    const toUpdate: (Record<string, unknown> & { id: string })[] = [];
    const toInsert: Record<string, unknown>[] = [];
    const affectedEmpIds = new Set<string>();

    for (const row of activeRows) {
      const key = `${row.empno}|${row.dedcode}|${row.policyno}`;
      const existingId = existingMap.get(key);
      if (existingId) {
        toUpdate.push({ ...row, id: existingId });
      } else {
        toInsert.push(row);
      }
      if (row.employee_id) affectedEmpIds.add(row.employee_id as string);
    }
    nonActiveRows.forEach((r) => {
      toInsert.push(r);
      if (r.employee_id) affectedEmpIds.add(r.employee_id as string);
    });

    // 5. Batch insert new rows (500 per batch)
    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('payroll_deductions').insert(batch);
      if (error) {
        errors.push(`Batch insert error: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
    }

    // 6. Batch update existing active rows (500 per batch)
    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      const { error } = await supabase.from('payroll_deductions').upsert(batch, { onConflict: 'id' });
      if (error) {
        errors.push(`Batch update error: ${error.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
    }

    // 7. Bulk recompute net pay for all affected employees
    await bulkRecomputeNetPay([...affectedEmpIds]);

    const autoCreated = unknownEmpnos.size;
    const summary = autoCreated > 0 ? ` ${autoCreated} new employee${autoCreated > 1 ? 's' : ''} auto-created.` : '';
    setResult({ imported, skipped, errors: errors.slice(0, 20), autoCreated, summary });
    setImporting(false);
    if (imported > 0) setTimeout(() => onImported(), 800);
  }

  const matchedCount = parsed.filter((r) => empByNumber.has((r['empno'] ?? '').trim())).length;
  const validRows = parsed.filter((r) => (r['empno'] ?? '').trim() && (r['dedcode'] ?? '').trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-800">Import Deductions from CSV / DBF</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Expected columns</p>
              <p className="text-xs text-blue-700">EMPNO, DEDCODE, POLICYNO, DEDID, EFFMM, EFFYY, TERMM, TERYY, DEDAMT, PRINCIPAL, INTEREST, CHARGES, PROCEEDS, STATUS, TYPE, AGENCY</p>
              <p className="text-xs text-blue-700 mt-1">Unknown employee numbers are auto-created as stub records. Duplicate active deductions are updated instead of skipped.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,.DBF,.dbf,.txt,.prn,.dat" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Upload className="w-4 h-4" /> Choose File
            </button>
            <span className="text-xs text-slate-400">or paste CSV below</span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => handleText(e.target.value)}
            placeholder="EMPNO,DEDCODE,POLICYNO,EFFMM,EFFYY,DEDAMT,STATUS,TYPE,AGENCY&#10;EMP001,LNR,PL001,1,25,5000.00,Active,Loan,GSIS&#10;..."
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y"
          />

          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[11px] text-slate-500">Rows Parsed</p><p className="text-sm font-semibold text-slate-700">{parsed.length}</p></div>
                <div className="bg-emerald-50 rounded-lg px-3 py-2"><p className="text-[11px] text-emerald-600">Matched</p><p className="text-sm font-semibold text-emerald-700">{matchedCount}</p></div>
                <div className="bg-amber-50 rounded-lg px-3 py-2"><p className="text-[11px] text-amber-600">Will Auto-Create</p><p className="text-sm font-semibold text-amber-700">{validRows - matchedCount}</p></div>
              </div>
              {parsed.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-500">
                        <th className="text-left px-3 py-2 font-medium">EMPNO</th>
                        <th className="text-left px-3 py-2 font-medium">DEDCODE</th>
                        <th className="text-right px-3 py-2 font-medium">DEDAMT</th>
                        <th className="text-center px-3 py-2 font-medium">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsed.slice(0, 50).map((r, i) => {
                        const matched = empByNumber.has((r['empno'] ?? '').trim());
                        return (
                          <tr key={i} className={matched ? '' : 'bg-rose-50/50'}>
                            <td className="px-3 py-1.5 font-mono">{r['empno']}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600">{r['dedcode']}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r['dedamt']}</td>
                            <td className="px-3 py-1.5 text-center">
                              {matched ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-500 inline" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Imported {result.imported} records. {result.skipped > 0 && `${result.skipped} skipped.`}{result.summary}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
                  <p className="text-sm font-medium text-rose-800 mb-1">Errors ({result.errors.length})</p>
                  <ul className="text-xs text-rose-700 space-y-0.5 max-h-28 overflow-y-auto">
                    {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">{validRows} records will be imported ({matchedCount} matched, {validRows - matchedCount} new employees).</p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
            <button onClick={doImport} disabled={importing || validRows === 0} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {importing ? 'Importing…' : `Import ${validRows} Records`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reports Panel ────────────────────────────────────────────────────────

interface ReportProps {
  reportId: string;
  deductions: PayrollDeduction[];
  empMap: Map<string, Employee>;
  dedCodeMap: Map<string, DeductionCode>;
  onClose: () => void;
}

function ReportPanel({ reportId, deductions, empMap, dedCodeMap, onClose }: ReportProps) {
  const reportConfig: Record<string, { title: string; icon: typeof FileText }> = {
    ledger: { title: 'Employee Deduction Ledger', icon: ClipboardList },
    summary: { title: 'Deduction Summary by Deduction Code', icon: FileBarChart },
    remittance: { title: 'Monthly Remittance Report', icon: Coins },
    loans: { title: 'Active Loans Report', icon: Landmark },
    expiring: { title: 'Expiring Deductions Report', icon: CalendarClock },
  };
  const cfg = reportConfig[reportId];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">{cfg.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportReport(reportId, deductions, empMap)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>
      <div className="p-5">
        <ReportContent reportId={reportId} deductions={deductions} empMap={empMap} dedCodeMap={dedCodeMap} />
      </div>
    </div>
  );
}

function ReportContent({ reportId, deductions, empMap, dedCodeMap }: { reportId: string; deductions: PayrollDeduction[]; empMap: Map<string, Employee>; dedCodeMap: Map<string, DeductionCode> }) {
  if (reportId === 'ledger') {
    const sorted = [...deductions].sort((a, b) => {
      const ea = empMap.get(a.employee_id ?? '');
      const eb = empMap.get(b.employee_id ?? '');
      const na = (ea?.lname || ea?.last_name || '') + (a.dedcode);
      const nb = (eb?.lname || eb?.last_name || '') + (b.dedcode);
      return na.localeCompare(nb);
    });
    return (
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-slate-500 uppercase tracking-wider">
              <th className="text-left px-3 py-2 font-medium">EMPNO</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium">Policy</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-center px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((d) => {
              const e = empMap.get(d.employee_id ?? '');
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-600">{d.empno}</td>
                  <td className="px-3 py-2 text-slate-800">{e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : d.empno}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">{d.dedcode}</span>{dedCodeMap.get(d.dedcode)?.dedname && <span className="block text-[10px] text-slate-400 mt-0.5">{dedCodeMap.get(d.dedcode)!.dedname}</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{d.policyno || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{d.type}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{currency(d.dedamt)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      d.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                      d.status === 'Suspended' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                    }`}>{d.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportId === 'summary') {
    const grouped: Record<string, { count: number; amount: number; active: number }> = {};
    deductions.forEach((d) => {
      (grouped[d.dedcode] ??= { count: 0, amount: 0, active: 0 });
      grouped[d.dedcode].count++;
      grouped[d.dedcode].amount += Number(d.dedamt);
      if (d.status === 'Active') grouped[d.dedcode].active++;
    });
    const sorted = Object.entries(grouped).sort(([, a], [, b]) => b.amount - a.amount);
    const totalAmt = sorted.reduce((s, [, v]) => s + v.amount, 0);
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
            <th className="text-left px-3 py-2 font-medium">Deduction Code</th>
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-right px-3 py-2 font-medium">Total Records</th>
            <th className="text-right px-3 py-2 font-medium">Active</th>
            <th className="text-right px-3 py-2 font-medium">Total Monthly Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(([code, v]) => (
            <tr key={code} className="hover:bg-slate-50">
              <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono font-semibold">{code}</span></td>
              <td className="px-3 py-2.5 text-slate-600 text-xs">{dedCodeMap.get(code)?.dedname ?? '—'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{v.count}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{v.active}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{currency(v.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
            <td className="px-3 py-2.5">TOTAL</td>
            <td className="px-3 py-2.5"></td>
            <td className="px-3 py-2.5 text-right">{deductions.length}</td>
            <td className="px-3 py-2.5 text-right text-emerald-600">{deductions.filter((d) => d.status === 'Active').length}</td>
            <td className="px-3 py-2.5 text-right">{currency(totalAmt)}</td>
          </tr>
        </tfoot>
      </table>
    );
  }

  if (reportId === 'remittance') {
    const grouped: Record<string, Record<string, { count: number; amount: number }>> = {};
    deductions.filter((d) => d.status === 'Active').forEach((d) => {
      (grouped[d.agency || 'UNKNOWN'] ??= {});
      (grouped[d.agency || 'UNKNOWN'][d.dedcode] ??= { count: 0, amount: 0 });
      grouped[d.agency || 'UNKNOWN'][d.dedcode].count++;
      grouped[d.agency || 'UNKNOWN'][d.dedcode].amount += Number(d.dedamt);
    });
    const agencies = Object.keys(grouped).sort();
    if (agencies.length === 0) return <p className="text-sm text-slate-400 text-center py-8">No active deductions to remit.</p>;
    return (
      <div className="space-y-4">
        {agencies.map((agency) => {
          const codes = Object.entries(grouped[agency]).sort(([, a], [, b]) => b.amount - a.amount);
          const total = codes.reduce((s, [, v]) => s + v.amount, 0);
          return (
            <div key={agency} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Agency: {agency}</span>
                <span className="text-sm font-medium text-slate-600">{currency(total)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-right px-3 py-2 font-medium">Employees</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {codes.map(([code, v]) => (
                    <tr key={code}>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-xs">{code}</span></td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{dedCodeMap.get(code)?.dedname ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{v.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{currency(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  if (reportId === 'loans') {
    const loans = deductions.filter((d) => d.type === 'Loan' && d.status === 'Active');
    if (loans.length === 0) return <p className="text-sm text-slate-400 text-center py-8">No active loans.</p>;
    const totalPrincipal = loans.reduce((s, d) => s + Number(d.principal), 0);
    const totalDed = loans.reduce((s, d) => s + Number(d.dedamt), 0);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[11px] text-slate-500">Active Loans</p><p className="text-sm font-semibold text-slate-700">{loans.length}</p></div>
          <div className="bg-amber-50 rounded-lg px-3 py-2"><p className="text-[11px] text-amber-600">Total Principal</p><p className="text-sm font-semibold text-amber-700">{currency(totalPrincipal)}</p></div>
          <div className="bg-blue-50 rounded-lg px-3 py-2"><p className="text-[11px] text-blue-600">Monthly Deduction</p><p className="text-sm font-semibold text-blue-700">{currency(totalDed)}</p></div>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-slate-500 uppercase tracking-wider">
                <th className="text-left px-3 py-2 font-medium">EMPNO</th>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Policy</th>
                <th className="text-right px-3 py-2 font-medium">Principal</th>
                <th className="text-right px-3 py-2 font-medium">Interest</th>
                <th className="text-right px-3 py-2 font-medium">Monthly</th>
                <th className="text-center px-3 py-2 font-medium">Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-600">{d.empno}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">{d.dedcode}</span>{dedCodeMap.get(d.dedcode)?.dedname && <span className="block text-[10px] text-slate-400 mt-0.5">{dedCodeMap.get(d.dedcode)!.dedname}</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{d.policyno || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{currency(d.principal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{currency(d.interest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{currency(d.dedamt)}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{String(d.effmm).padStart(2, '0')}/{String(d.effyy).padStart(2, '0')} – {d.termm ? `${String(d.termm).padStart(2, '0')}/${String(d.teryy).padStart(2, '0')}` : 'open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportId === 'expiring') {
    const now = new Date();
    const currentYY = now.getFullYear() % 100;
    const currentMM = now.getMonth() + 1;
    const currentYM = currentYY * 100 + currentMM;
    const threeMonthsLater = currentYM + 3;
    const expiring = deductions.filter((d) => {
      if (d.status !== 'Active' || d.teryy == null || d.termm == null || d.teryy === 0 || d.termm === 0) return false;
      const termYM = d.teryy * 100 + d.termm;
      return termYM >= currentYM && termYM <= threeMonthsLater;
    }).sort((a, b) => (a.teryy! * 100 + a.termm!) - (b.teryy! * 100 + b.termm!));

    if (expiring.length === 0) return <p className="text-sm text-slate-400 text-center py-8">No deductions expiring in the next 3 months.</p>;
    return (
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-slate-500 uppercase tracking-wider">
              <th className="text-left px-3 py-2 font-medium">EMPNO</th>
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium">Policy</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-center px-3 py-2 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expiring.map((d) => (
              <tr key={d.id} className="hover:bg-amber-50/30">
                <td className="px-3 py-2 font-mono text-slate-600">{d.empno}</td>
                <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-mono">{d.dedcode}</span></td>
                <td className="px-3 py-2 text-slate-500">{d.policyno || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(d.dedamt)}</td>
                <td className="px-3 py-2 text-center font-medium text-amber-700">{String(d.termm).padStart(2, '0')}/{String(d.teryy).padStart(2, '0')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

function exportReport(reportId: string, deductions: PayrollDeduction[], empMap: Map<string, Employee>) {
  if (reportId === 'summary') {
    const grouped: Record<string, { count: number; amount: number; active: number }> = {};
    deductions.forEach((d) => {
      (grouped[d.dedcode] ??= { count: 0, amount: 0, active: 0 });
      grouped[d.dedcode].count++;
      grouped[d.dedcode].amount += Number(d.dedamt);
      if (d.status === 'Active') grouped[d.dedcode].active++;
    });
    const content = generateCsv(
      ['Deduction Code', 'Total Records', 'Active', 'Total Monthly Amount'],
      Object.entries(grouped).sort(([, a], [, b]) => b.amount - a.amount).map(([code, v]) => [code, v.count, v.active, v.amount.toFixed(2)]),
    );
    downloadFile({ filename: `deduction_summary_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  } else if (reportId === 'loans') {
    const loans = deductions.filter((d) => d.type === 'Loan' && d.status === 'Active');
    const content = generateCsv(
      ['EMPNO', 'Code', 'PolicyNo', 'Principal', 'Interest', 'Charges', 'Proceeds', 'Monthly', 'EffPeriod', 'TermPeriod'],
      loans.map((d) => [d.empno, d.dedcode, d.policyno, d.principal, d.interest, d.charges, d.proceeds, d.dedamt, `${String(d.effmm).padStart(2, '0')}/${String(d.effyy).padStart(2, '0')}`, d.termm ? `${String(d.termm).padStart(2, '0')}/${String(d.teryy).padStart(2, '0')}` : 'open']),
    );
    downloadFile({ filename: `active_loans_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  } else {
    const content = generateCsv(
      ['EMPNO', 'Name', 'Code', 'PolicyNo', 'Type', 'Amount', 'Status', 'EffPeriod', 'TermPeriod'],
      deductions.map((d) => {
        const e = empMap.get(d.employee_id ?? '');
        return [d.empno, e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : '', d.dedcode, d.policyno, d.type, d.dedamt, d.status, `${String(d.effmm).padStart(2, '0')}/${String(d.effyy).padStart(2, '0')}`, d.termm ? `${String(d.termm).padStart(2, '0')}/${String(d.teryy).padStart(2, '0')}` : 'open'];
      }),
    );
    downloadFile({ filename: `${reportId}_report_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }
}
