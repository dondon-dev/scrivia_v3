import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Search, Pencil, Trash2, X, Upload, Download, FileDown,
  Landmark, Calculator, FileBarChart, Coins, Building2, ShieldCheck,
  Banknote, Wallet, TrendingDown, AlertCircle, CheckCircle2,
  Info, Power, Database, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import { downloadFile, currency, generateCsv } from '@/lib/reports';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { validateUpload } from '@/lib/uploadSecurity';
import type { DeductionCode, Employee, PayrollDeduction } from '@/types/payroll';
import { usePagination, Pagination } from '@/components/Pagination';

const TYPE_OPTIONS = ['Mandatory', 'Loan', 'Insurance', 'Membership', 'Savings', 'Overpayment', 'Absence', 'Bank', 'Cooperative', 'Association', 'Other'] as const;
const AGENCY_OPTIONS = ['GSIS', 'BIR', 'PHILHEALTH', 'PAGIBIG', 'DEPED', 'BANK', 'COOPERATIVE', 'INSURANCE', 'ASSOCIATION', 'OTHER'] as const;

// Report group definitions — matches the DepEd payroll deduction grouping
const REPORT_GROUPS: { id: string; label: string; agencies: string[]; icon: typeof Landmark }[] = [
  { id: 'gsis', label: 'GSIS', agencies: ['GSIS'], icon: ShieldCheck },
  { id: 'bir', label: 'BIR', agencies: ['BIR'], icon: FileText },
  { id: 'philhealth', label: 'PhilHealth', agencies: ['PHILHEALTH'], icon: Plus },
  { id: 'pagibig', label: 'PagIBIG', agencies: ['PAGIBIG'], icon: Landmark },
  { id: 'deped', label: 'DepEd Overpayments', agencies: ['DEPED'], icon: Building2 },
  { id: 'loans', label: 'Loans', agencies: [], icon: Coins, },
  { id: 'banks', label: 'Banks', agencies: ['BANK'], icon: Banknote },
  { id: 'others', label: 'Others', agencies: ['OTHER', 'INSURANCE', 'COOPERATIVE', 'ASSOCIATION'], icon: Wallet },
];

function groupForCode(code: DeductionCode): string {
  if (code.agency === 'GSIS') return 'gsis';
  if (code.agency === 'BIR') return 'bir';
  if (code.agency === 'PHILHEALTH') return 'philhealth';
  if (code.agency === 'PAGIBIG') return 'pagibig';
  if (code.agency === 'DEPED') return 'deped';
  if (code.agency === 'BANK') return 'banks';
  if (code.type === 'Loan') return 'loans';
  return 'others';
}

interface CodeForm {
  dedcode: string;
  type: string;
  agency: string;
  dedname: string;
  active: boolean;
}

function emptyCodeForm(): CodeForm {
  return { dedcode: '', type: 'Other', agency: 'OTHER', dedname: '', active: true };
}

export default function DeductionEngine() {
  const [codes, setCodes] = useState<DeductionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DeductionCode | null>(null);
  const [form, setForm] = useState<CodeForm>(emptyCodeForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalDeductions: number; grossPay: number; netPay: number; activeCount: number; groupTotals: Record<string, { amount: number; count: number }> } | null>(null);
  const [reportData, setReportData] = useState<{ deductions: PayrollDeduction[]; employees: Employee[] } | null>(null);

  const { scopedCodes } = useOrg();

  const load = useCallback(async () => {
    setLoading(true);
    // Only load deduction codes (small table) + stats RPC — no bulk row downloads
    const { data: codeData } = await supabase.from('deduction_codes').select('*').order('dedcode');
    setCodes((codeData as DeductionCode[]) ?? []);
    const scope = codeScope(scopedCodes);
    const { data: statsData } = await supabase.rpc('get_deduction_engine_stats',
      scope.regcode ? { p_regcode: scope.regcode, p_divcodes: scope.divcodes ?? [] } : {});
    if (statsData) {
      const s = statsData as { totalDeductions: string; grossPay: string; netPay: string; activeCount: number; groupTotals: { group_id: string; count: number; amount: string }[] };
      const groupTotals: Record<string, { amount: number; count: number }> = {};
      s.groupTotals?.forEach((g) => { groupTotals[g.group_id] = { amount: Number(g.amount), count: g.count }; });
      setStats({ totalDeductions: Number(s.totalDeductions), grossPay: Number(s.grossPay), netPay: Number(s.netPay), activeCount: s.activeCount, groupTotals });
    }
    setLoading(false);
  }, [scopedCodes]);

  useEffect(() => { load(); }, [load]);

  // Load all deductions + employees on-demand only when a report panel is opened
  useEffect(() => {
    if (activeReport && !reportData) {
      (async () => {
        const scope = codeScope(scopedCodes);
        let empQuery = supabase.from('employees').select('id,empno,employee_number,lname,last_name,fname,first_name,mi').order('last_name');
        if (scope.regcode) {
          empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
        }
        const { data: e } = await empQuery;
        const scopedEmps = (e as Employee[]) ?? [];
        const empnos = [...new Set(scopedEmps.map((x) => x.empno ?? x.employee_number ?? '').filter(Boolean))];
        let dedQuery = supabase.from('payroll_deductions').select('id,employee_id,empno,dedcode,dedamt,status,type,agency,dedid,policyno,effmm,effyy,termm,teryy,principal,interest,charges,proceeds').order('dedcode');
        if (scope.regcode && empnos.length > 0) {
          dedQuery = dedQuery.in('empno', empnos);
        } else if (scope.regcode) {
          dedQuery = dedQuery.eq('empno', '__none__');
        }
        const { data: d } = await dedQuery;
        setReportData({ deductions: (d as PayrollDeduction[]) ?? [], employees: scopedEmps });
      })();
    }
    if (!activeReport) setReportData(null);
  }, [activeReport, scopedCodes]);

  const codeMap = useMemo(() => new Map(codes.map((c) => [c.dedcode, c])), [codes]);
  const empMap = useMemo(() => new Map((reportData?.employees ?? []).map((e) => [e.id, e])), [reportData]);

  const filtered = useMemo(() => {
    return codes.filter((c) => {
      if (agencyFilter !== 'All' && c.agency !== agencyFilter) return false;
      if (activeFilter === 'Active' && !c.active) return false;
      if (activeFilter === 'Inactive' && c.active) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [c.dedcode, c.dedname, c.type, c.agency].some((v) => v?.toLowerCase().includes(q));
    });
  }, [codes, search, agencyFilter, activeFilter]);

  const pag = usePagination(filtered, 10, `${search}|${agencyFilter}|${activeFilter}`);

  function openAdd() {
    setEditing(null);
    setForm(emptyCodeForm());
    setError('');
    setShowModal(true);
  }

  function openEdit(c: DeductionCode) {
    setEditing(c);
    setForm({ dedcode: c.dedcode, type: c.type, agency: c.agency, dedname: c.dedname, active: c.active });
    setError('');
    setShowModal(true);
  }

  async function save() {
    setError('');
    if (!form.dedcode.trim()) { setError('Deduction Code is required.'); return; }
    if (!form.dedname.trim()) { setError('Deduction Name is required.'); return; }
    setSaving(true);
    const payload = {
      dedcode: form.dedcode.toUpperCase().trim(),
      type: form.type,
      agency: form.agency,
      dedname: form.dedname.trim(),
      active: form.active,
    };
    if (editing) {
      const { error: err } = await supabase.from('deduction_codes').update(payload).eq('dedcode', editing.dedcode);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('deduction_codes').insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function remove(c: DeductionCode) {
    if (!confirm(`Delete deduction code ${c.dedcode} — ${c.dedname}?`)) return;
    await supabase.from('deduction_codes').delete().eq('dedcode', c.dedcode);
    load();
  }

  async function toggleActive(c: DeductionCode) {
    await supabase.from('deduction_codes').update({ active: !c.active }).eq('dedcode', c.dedcode);
    load();
  }

  function exportCodesCsv() {
    const content = generateCsv(
      ['DEDCODE', 'TYPE', 'AGENCY', 'DEDNAME', 'ACTIVE'],
      filtered.map((c) => [c.dedcode, c.type, c.agency, c.dedname, c.active ? 'T' : 'F']),
    );
    downloadFile({ filename: `deduction_codes_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

  return (
    <div className="space-y-5">
      {/* Computation summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Gross Pay" value={currency(stats?.grossPay ?? 0)} icon={Wallet} tone="blue" />
        <SummaryCard label="Total Deductions" value={currency(stats?.totalDeductions ?? 0)} icon={TrendingDown} tone="rose" />
        <SummaryCard label="Net Pay" value={currency(stats?.netPay ?? 0)} icon={Banknote} tone="emerald" />
        <SummaryCard label="Active Deductions" value={String(stats?.activeCount ?? 0)} icon={CheckCircle2} tone="amber" />
      </div>

      {/* Grouped report buttons */}
      {!loading && (stats?.activeCount ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileBarChart className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Deduction Reports by Group</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {REPORT_GROUPS.map((g) => {
              const total = stats?.groupTotals[g.id]?.amount ?? 0;
              const count = stats?.groupTotals[g.id]?.count ?? 0;
              const Icon = g.icon;
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveReport(activeReport === g.id ? null : g.id)}
                  className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    activeReport === g.id
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-700">{g.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{currency(total)}</span>
                  <span className="text-[10px] text-slate-400">{count} {count === 1 ? 'entry' : 'entries'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Report panel */}
      {activeReport && reportData && (
        <GroupReport
          groupId={activeReport}
          deductions={reportData.deductions}
          codeMap={codeMap}
          empMap={empMap}
          onClose={() => setActiveReport(null)}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, agency…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
            <option>All</option>
            {AGENCY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" /> Import DEDTABLE
          </button>
          <button onClick={exportCodesCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Code
          </button>
        </div>
      </div>

      {/* Codes table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading deduction codes…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Database className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500">
              {codes.length === 0 ? 'No deduction codes yet. Click "Add Code" or import DEDTABLE.DBF.' : 'No codes match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Code</th>
                  <th className="text-left px-4 py-3 font-medium">Deduction Name</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Agency</th>
                  <th className="text-center px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pag.pagedItems.map((c) => {
                  return (
                    <tr key={c.dedcode} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-mono font-semibold">{c.dedcode}</span></td>
                      <td className="px-4 py-3 text-slate-800">{c.dedname}</td>
                      <td className="px-4 py-3 text-slate-600">{c.type}</td>
                      <td className="px-4 py-3"><span className="text-xs text-slate-500">{c.agency}</span></td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(c)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            c.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <Power className="w-3 h-3" /> {c.active ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(c)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete">
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
                  <td colSpan={6} className="px-4 py-3">{filtered.length} deduction codes</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} label="codes" />
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editing ? 'Edit Deduction Code' : 'Add Deduction Code'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <label className="block">
                <span className="block text-xs text-slate-600 mb-1">Deduction Code *</span>
                <input
                  value={form.dedcode}
                  onChange={(e) => setForm({ ...form, dedcode: e.target.value.toUpperCase() })}
                  placeholder="0001"
                  disabled={!!editing}
                  className={inputCls + (editing ? ' bg-slate-100 text-slate-500' : '')}
                />
              </label>
              <label className="block">
                <span className="block text-xs text-slate-600 mb-1">Deduction Name *</span>
                <input
                  value={form.dedname}
                  onChange={(e) => setForm({ ...form, dedname: e.target.value })}
                  placeholder="GSIS POLICY LOAN"
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Type</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-600 mb-1">Agency</span>
                  <select value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} className={inputCls}>
                    {AGENCY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-slate-700">Active (available for payroll deductions)</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadCodesModal
          existingCodes={new Set(codes.map((c) => c.dedcode))}
          onClose={() => setShowUpload(false)}
          onImported={() => { setShowUpload(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Wallet; tone: 'blue' | 'rose' | 'emerald' | 'amber' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    rose: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${tones[tone]} flex items-center justify-center shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Group Report Panel ────────────────────────────────────────────────────

interface GroupReportProps {
  groupId: string;
  deductions: PayrollDeduction[];
  codeMap: Map<string, DeductionCode>;
  empMap: Map<string, Employee>;
  onClose: () => void;
}

function GroupReport({ groupId, deductions, codeMap, empMap, onClose }: GroupReportProps) {
  const group = REPORT_GROUPS.find((g) => g.id === groupId);
  if (!group) return null;
  const Icon = group.icon;

  // Filter deductions that belong to this group
  const groupDeds = deductions.filter((d) => {
    if (d.status !== 'Active') return false;
    const code = codeMap.get(d.dedcode);
    if (!code || !code.active) return false;
    return groupForCode(code) === groupId;
  });

  // Sub-group by deduction code
  const byCode: Record<string, { count: number; amount: number; dedname: string }> = {};
  groupDeds.forEach((d) => {
    const code = codeMap.get(d.dedcode);
    (byCode[d.dedcode] ??= { count: 0, amount: 0, dedname: code?.dedname ?? d.dedcode });
    byCode[d.dedcode].count++;
    byCode[d.dedcode].amount += Number(d.dedamt);
  });
  const sortedCodes = Object.entries(byCode).sort(([, a], [, b]) => b.amount - a.amount);
  const totalAmount = groupDeds.reduce((s, d) => s + Number(d.dedamt), 0);

  const detailPag = usePagination(groupDeds, 10, groupDeds);
  const codePag = usePagination(sortedCodes, 10, sortedCodes);

  function exportGroup() {
    const content = generateCsv(
      ['EMPNO', 'Name', 'DEDCODE', 'Deduction Name', 'Amount', 'Type', 'Agency'],
      groupDeds.map((d) => {
        const e = empMap.get(d.employee_id ?? '');
        const code = codeMap.get(d.dedcode);
        return [
          d.empno,
          e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : '',
          d.dedcode,
          code?.dedname ?? '',
          d.dedamt.toFixed(2),
          code?.type ?? '',
          code?.agency ?? '',
        ];
      }),
    );
    downloadFile({ filename: `${group!.label.replace(/\s/g, '_')}_report_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800">{group.label} Report</h3>
          <span className="text-xs text-slate-400">{groupDeds.length} entries · {currency(totalAmount)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportGroup} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            <FileDown className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* Summary by code */}
        {sortedCodes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Deduction Name</th>
                  <th className="text-right px-3 py-2 font-medium">Employees</th>
                  <th className="text-right px-3 py-2 font-medium">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {codePag.pagedItems.map(([code, v]) => (
                  <tr key={code} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono font-semibold text-xs">{code}</span></td>
                    <td className="px-3 py-2.5 text-slate-700">{v.dedname}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{currency(v.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td colSpan={3} className="px-3 py-2.5">TOTAL</td>
                  <td className="px-3 py-2.5 text-right">{currency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Per-employee detail */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Employee Detail</p>
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">EMPNO</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailPag.pagedItems.map((d) => {
                  const e = empMap.get(d.employee_id ?? '');
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-600">{d.empno}</td>
                      <td className="px-3 py-2 text-slate-800">{e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : d.empno}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono">{d.dedcode}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{currency(d.dedamt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={detailPag.page} totalPages={detailPag.totalPages} total={detailPag.total} onPageChange={detailPag.setPage} label="entries" />
        </div>
      </div>
    </div>
  );
}

// ── Upload DEDTABLE.DBF Modal ─────────────────────────────────────────────

interface UploadCodesProps {
  existingCodes: Set<string>;
  onClose: () => void;
  onImported: () => void;
}

function UploadCodesModal({ existingCodes, onClose, onImported }: UploadCodesProps) {
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) {
      setResult({ imported: 0, updated: 0, skipped: 0, errors: [validation.error ?? 'Invalid file'] });
      return;
    }
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith('.dbf')) {
      const buf = await file.arrayBuffer();
      try {
        const { records } = decodeDbf(new Uint8Array(buf));
        const mapped = records.map((rec: DbfRecord) => {
          const row: Record<string, string> = {};
          for (const key in rec) { row[key.toUpperCase()] = String(rec[key] ?? '').trim(); }
          return row;
        });
        setParsed(mapped);
      } catch (err) {
        setResult({ imported: 0, updated: 0, skipped: 0, errors: [`Failed to read DBF: ${(err as Error).message}`] });
      }
    } else {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setParsed([]); return; }
      const delim = lines[0].includes('|') ? '|' : lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delim).map((h) => h.trim().toUpperCase());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(delim);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
        return row;
      });
      setParsed(rows);
    }
  }

  async function doImport() {
    if (parsed.length === 0) return;
    setImporting(true);
    const toUpsert: Record<string, unknown>[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const dedcode = (r['DEDCODE'] ?? '').trim().toUpperCase();
      if (!dedcode) { skipped++; errors.push(`Row ${i + 2}: Missing DEDCODE.`); continue; }
      toUpsert.push({
        dedcode,
        type: (r['TYPE'] ?? 'Other').trim() || 'Other',
        agency: (r['AGENCY'] ?? 'OTHER').trim().toUpperCase() || 'OTHER',
        dedname: (r['DEDNAME'] ?? r['DEDCODE'] ?? '').trim(),
        active: ['T', 'TRUE', 'Y', 'YES', '1', 'ACTIVE'].includes((r['ACTIVE'] ?? 'T').trim().toUpperCase()),
      });
    }

    let imported = 0;
    let updated = 0;
    for (let i = 0; i < toUpsert.length; i += 100) {
      const batch = toUpsert.slice(i, i + 100);
      const { error } = await supabase.from('deduction_codes').upsert(batch, { onConflict: 'dedcode' });
      if (error) {
        errors.push(`Batch error: ${error.message}`);
        skipped += batch.length;
      } else {
        batch.forEach((b) => {
          if (existingCodes.has(b.dedcode as string)) updated++;
          else imported++;
        });
      }
    }

    setResult({ imported, updated, skipped, errors: errors.slice(0, 20) });
    setImporting(false);
    if (imported + updated > 0) setTimeout(() => onImported(), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-800">Import Deduction Codes from DEDTABLE.DBF</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-3 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Expected columns</p>
              <p className="text-xs text-emerald-700">DEDCODE, TYPE, AGENCY, DEDNAME, ACTIVE — existing codes will be updated, new codes will be added.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,.dbf,.txt,.prn,.dat" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
              <Upload className="w-4 h-4" /> Choose DEDTABLE.DBF
            </button>
            {fileName && <span className="text-xs text-slate-500">{fileName} — {parsed.length} records</span>}
          </div>

          {parsed.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-slate-500">
                    <th className="text-left px-3 py-2 font-medium">DEDCODE</th>
                    <th className="text-left px-3 py-2 font-medium">DEDNAME</th>
                    <th className="text-left px-3 py-2 font-medium">AGENCY</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.slice(0, 50).map((r, i) => {
                    const code = (r['DEDCODE'] ?? '').trim().toUpperCase();
                    const exists = existingCodes.has(code);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{code}</td>
                        <td className="px-3 py-1.5 text-slate-600">{r['DEDNAME']}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r['AGENCY']}</td>
                        <td className="px-3 py-1.5 text-center">
                          {exists ? <span className="text-xs text-amber-600">Update</span> : <span className="text-xs text-emerald-600">New</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                <CheckCircle2 className="w-4 h-4" /> {result.imported} new codes imported, {result.updated} updated. {result.skipped > 0 && `${result.skipped} skipped.`}
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={doImport} disabled={importing || parsed.length === 0} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {importing ? 'Importing…' : `Import ${parsed.length} Codes`}
          </button>
        </div>
      </div>
    </div>
  );
}
