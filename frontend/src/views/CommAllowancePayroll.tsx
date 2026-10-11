// ── Communication Allowance Payroll — Detail / Register ──────────────────────
// Department of Education · Division of Calamba City · "Other Payroll" module.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  ArrowLeft, Search, Save, Trash2, X, Upload, Download, FileSpreadsheet, FileText,
  Printer, CheckCircle2, AlertTriangle, UserPlus, Pencil, Wallet,
  Settings2, RefreshCw, HandCoins, Filter, ClipboardCopy,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import caSetupSql from '@/sql/ca_setup.sql?raw';
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { usePositions } from '@/lib/usePositions';
import { Pagination, usePagination } from '@/components/Pagination';
import { currency } from '@/lib/reports';
import {
  caCapability, caAllowedNext, num, money, computeCaTotals,
  detailsToPrintRows, buildCaPrintPages, parseCaDetailCsv, caErrMsg, caIsMissingTable,
  caUpsertEmployees,
  exportCaPayrollExcel, exportCaPayrollExcelByStacode, exportCaPayrollCsv,
  caIsEditable, caMiddleInitial,
} from '@/lib/commAllowance';
import {
  CA_STATUS_COLORS, CA_STATUS_FLOW, CA_SIGNATORY_DEFS, caSignatoryMap,
  type CaEmployee, type CaPayrollDetail, type CaPayrollHeader, type CaSignatory, type CaSignatoryDef, type CaStatus,
} from '@/types/commAllowance';
import type { UserProfile } from '@/types/auth';
import CommAllowancePrint from '@/components/CommAllowancePrint';

interface JoinedRow {
  detail: CaPayrollDetail;
  emp: CaEmployee | undefined;
}

interface Props {
  profile: UserProfile | null;
  payrollId: string;
  onBack: () => void;
}

export default function CommAllowancePayroll({ profile, payrollId, onBack }: Props) {
  const { logAudit } = useAuth();
  const cap = caCapability(profile?.role ?? 'read_only');
  const { positions: positionList } = usePositions();

  const [header, setHeader] = useState<CaPayrollHeader | null>(null);
  const [details, setDetails] = useState<CaPayrollDetail[]>([]);
  const [employees, setEmployees] = useState<CaEmployee[]>([]);
  const [signatories, setSignatories] = useState<CaSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'line' | 'name' | 'amount'>('line');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massField, setMassField] = useState<'amount' | 'deduction'>('amount');
  const [massValue, setMassValue] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [showSigs, setShowSigs] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; updated: number; errors: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    setError(null);
    try {
      const [hRes, dRes, eRes, sRes] = await Promise.all([
        supabase.from('ca_payroll_headers').select('*').eq('id', payrollId).single(),
        fetchAll(() => supabase.from('ca_payroll_details').select('*').eq('payroll_id', payrollId).order('line_no')),
        fetchAll(() => supabase.from('ca_employees').select('*')),
        fetchAll(() => supabase.from('ca_payroll_signatories').select('*').eq('payroll_id', payrollId).order('sequence_no')),
      ]);
      if (hRes.error) throw hRes.error;
      setHeader(hRes.data as CaPayrollHeader);
      setDetails(dRes as CaPayrollDetail[]);
      setEmployees(eRes as CaEmployee[]);
      setSignatories(sRes as CaSignatory[]);
    } catch (err) {
      const msg = caErrMsg(err);
      setDbError(caIsMissingTable(msg) ? msg : null);
      if (!caIsMissingTable(msg)) setError(msg);
    } finally {
      setLoading(false);
    }
  }, [payrollId]);

  useEffect(() => { void load(); }, [load]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Position Management masterfile: position_code → official Position Title.
  const positionMap = useMemo(
    () => new Map(
      positionList.map((p) => [String(p.position_code ?? '').trim().toUpperCase(), p.position_title || p.position_name || p.position_code]),
    ),
    [positionList],
  );

  const rows: JoinedRow[] = useMemo(() => {
    const joined = details.map((d) => ({ detail: d, emp: empMap.get(d.employee_id) }));
    const q = search.trim().toLowerCase();
    let out = q
      ? joined.filter((r) => [r.emp?.account_no, r.emp?.last_name, r.emp?.first_name, r.emp?.position_title]
          .some((v) => (v ?? '').toLowerCase().includes(q)))
      : joined;
    if (schoolFilter !== 'all') out = out.filter((r) => r.emp?.school_name === schoolFilter);
    const sorted = [...out];
    if (sortKey === 'line') sorted.sort((a, b) => a.detail.line_no - b.detail.line_no);
    else if (sortKey === 'name') sorted.sort((a, b) => (a.emp?.last_name ?? '').localeCompare(b.emp?.last_name ?? '') || (a.emp?.first_name ?? '').localeCompare(b.emp?.first_name ?? ''));
    else sorted.sort((a, b) => num(b.detail.amount) - num(a.detail.amount));
    return sorted;
  }, [details, employees, empMap, search, schoolFilter, sortKey]);

  const schools = useMemo(() => [...new Set(employees.map((e) => e.school_name).filter(Boolean))], [employees]);
  const pagination = usePagination(rows, 12, `${search}-${schoolFilter}-${sortKey}`);
  const totals = useMemo(() => computeCaTotals(details), [details]);

  const canEditStatus = cap.canEdit && header ? caIsEditable(header.status) : false;
  const editable = canEditStatus;

  // ── Header save ─────────────────────────────────────────────────────────────
  const saveHeader = async (patch: Partial<CaPayrollHeader>) => {
    if (!header) return;
    setSaving(true);
    const { error: e } = await supabase
      .from('ca_payroll_headers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', header.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setHeader((h) => (h ? { ...h, ...patch } : h));
    await logAudit('ca_header_update', 'ca_payroll', header.id, { payroll_no: header.payroll_no, fields: Object.keys(patch) });
  };

  // ── Row editing ────────────────────────────────────────────────────────────
  const setDetailValue = (id: string, field: 'amount' | 'deduction' | 'remarks', value: string | number) => {
    setDetails((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      if (field === 'remarks') return { ...d, remarks: String(value) };
      const amount = field === 'amount' ? num(value) : num(d.amount);
      const deduction = field === 'deduction' ? num(value) : num(d.deduction);
      return { ...d, amount, deduction, net_amount_due: money(amount - deduction) };
    }));
  };

  const persistRow = async (d: CaPayrollDetail) => {
    const { error: e } = await supabase
      .from('ca_payroll_details')
      .update({ amount: d.amount, deduction: d.deduction, net_amount_due: d.net_amount_due, remarks: d.remarks })
      .eq('id', d.id);
    if (e) { setError(e.message); return; }
    await recomputeHeaderTotals();
  };

  const recomputeHeaderTotals = async () => {
    if (!header) return;
    const all = await fetchAll(() => supabase.from('ca_payroll_details').select('id,amount,deduction').eq('payroll_id', header.id));
    const t = computeCaTotals(all as { amount: number; deduction: number }[]);
    const { error: e } = await supabase
      .from('ca_payroll_headers')
      .update({ total_employees: t.totalEmployees, gross_amount: t.grossAmount, total_deductions: t.totalDeductions, net_amount: t.netAmount, updated_at: new Date().toISOString() })
      .eq('id', header.id);
    if (!e) setHeader((h) => (h ? { ...h, ...t } : h));
  };

  // ── Row add / delete ───────────────────────────────────────────────────────
  const addEmployeeRow = async (emp: CaEmployee, amount: number, deduction: number) => {
    if (!header) return;
    const lineNo = details.length + 1;
    const { error: e } = await supabase.from('ca_payroll_details').insert({
      payroll_id: header.id, employee_id: emp.id, line_no: lineNo,
      amount, deduction, net_amount_due: money(amount - deduction), remarks: '',
    });
    if (e) { setError(e.message); return; }
    await logAudit('ca_detail_add', 'ca_payroll', header.id, { payroll_no: header.payroll_no, employee_id: emp.id });
    await load();
  };

  const removeSelected = async () => {
    if (!header || selected.size === 0) return;
    if (!window.confirm(`Remove ${selected.size} selected row(s)?`)) return;
    const { error: e } = await supabase.from('ca_payroll_details').delete().in('id', [...selected]);
    if (e) { setError(e.message); return; }
    const remaining = await fetchAll(() => supabase.from('ca_payroll_details').select('*').eq('payroll_id', header.id).order('line_no'));
    const renumbered = (remaining as CaPayrollDetail[]).map((d, i) => ({ id: d.id, line_no: i + 1 }));
    for (const r of renumbered) await supabase.from('ca_payroll_details').update({ line_no: r.line_no }).eq('id', r.id);
    setSelected(new Set());
    await logAudit('ca_detail_remove', 'ca_payroll', header.id, { count: selected.size });
    await load();
  };

  // ── Mass update ────────────────────────────────────────────────────────────
  const applyMassUpdate = async () => {
    if (!header || selected.size === 0) return;
    const value = num(massValue);
    const ids = [...selected];
    const rowsToUpdate = details.filter((d) => ids.includes(d.id));
    for (const d of rowsToUpdate) {
      const amount = massField === 'amount' ? value : d.amount;
      const deduction = massField === 'deduction' ? value : d.deduction;
      await supabase.from('ca_payroll_details').update({ amount, deduction, net_amount_due: money(amount - deduction) }).eq('id', d.id);
    }
    setMassValue('');
    setSelected(new Set());
    await logAudit('ca_detail_mass_update', 'ca_payroll', header.id, { field: massField, value, count: ids.length });
    await load();
  };

  // ── Bulk import ────────────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const text = await file.text();
      const { rows: csvRows, errors } = parseCaDetailCsv(text);
      if (csvRows.length === 0) { setError(errors[0] ?? 'No valid rows found.'); return; }

      // Upsert employees by account_no
      const empRows = csvRows
        .filter((r) => r.account_no && (r.last_name || r.first_name))
        .map((r) => ({
          account_no: r.account_no, last_name: r.last_name, first_name: r.first_name,
          middle_initial: caMiddleInitial(r.middle_initial), position_title: r.position_title,
          school_name: r.school_name, stacode: r.stacode ?? '', category: r.category ?? '', status: 'Active', updated_at: new Date().toISOString(),
        }));
      if (empRows.length > 0) {
        const { error: ue } = await caUpsertEmployees(empRows);
        if (ue) { setError(ue.message); return; }
      }
      const empAll = await fetchAll(() => supabase.from('ca_employees').select('id,account_no'));
      const idByAcct = new Map((empAll as { id: string; account_no: string }[]).map((e) => [e.account_no.trim().toUpperCase(), e.id]));

      const detailRows: { payroll_id: string; employee_id: string; line_no: number; amount: number; deduction: number; net_amount_due: number; remarks: string }[] = [];
      let skipped = 0;
      csvRows.forEach((r, i) => {
        const empId = idByAcct.get((r.account_no || '').trim().toUpperCase());
        if (!empId) { skipped++; return; }
        detailRows.push({
          payroll_id: payrollId, employee_id: empId, line_no: details.length + i + 1,
          amount: r.amount, deduction: r.deduction, net_amount_due: money(r.amount - r.deduction), remarks: '',
        });
      });

      const { error: e } = await supabase
        .from('ca_payroll_details')
        .upsert(detailRows, { onConflict: 'payroll_id,employee_id' });
      if (e) throw e;

      setImportResult({ added: detailRows.length - skipped, updated: skipped, errors: errors.length });
      await logAudit('ca_detail_import', 'ca_payroll', payrollId, { rows: detailRows.length, errors: errors.length });
      await load();
      setShowImport(false);
    } catch (err) {
      setError(caErrMsg(err));
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  // ── Workflow ───────────────────────────────────────────────────────────────
  const transition = async (to: CaStatus) => {
    if (!header) return;
    setError(null);
    const { error: e } = await supabase
      .from('ca_payroll_headers')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('id', header.id);
    if (e) { setError(e.message); return; }
    await logAudit(`ca_transition_${to.toLowerCase()}`, 'ca_payroll', header.id, { payroll_no: header.payroll_no, from: header.status, to });
    await load();
    if (to === 'Generated') setNotice(`Payroll ${header.payroll_no} generated successfully.`);
  };

  // ── Signatories ────────────────────────────────────────────────────────────
  const saveSignatory = async (s: CaSignatory, name: string) => {
    const { error: e } = await supabase.from('ca_payroll_signatories').update({ name }).eq('id', s.id);
    if (e) { setError(e.message); return; }
    setSignatories((prev) => prev.map((x) => (x.id === s.id ? { ...x, name } : x)));
  };

  // Older payrolls may not have a row for newly added signatory slots (e.g. Head of Agency) —
  // create the row on first save instead of telling the user to recreate the payroll.
  const ensureSignatory = async (d: CaSignatoryDef, name: string) => {
    if (!header) return;
    const { data, error } = await supabase
      .from('ca_payroll_signatories')
      .insert({ payroll_id: header.id, signatory_type: d.type, name, position: d.position, sequence_no: d.seq })
      .select()
      .single();
    if (error) { setError(error.message); return; }
    if (data) setSignatories((prev) => [...prev, data as CaSignatory]);
  };

  // ── Exports / print ────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!header) return;
    setError(null);
    try { await exportCaPayrollExcel(header, details, empMap); } catch (err) { setError(caErrMsg(err)); }
  };

  const exportPdf = async () => {
    if (!header) return;
    setError(null);
    try { await exportCaPayrollExcelByStacode(header, details, empMap, positionMap); } catch (err) { setError(caErrMsg(err)); }
  };

  if (loading && !header) {
    return (
      <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-2">
        <LoadingIndicator />
      </div>
    );
  }
  if (!header) {
    return (
      <div className="card-base p-10 text-center text-slate-500">
        <p className="font-medium">Payroll not found.</p>
        <button onClick={onBack} className="btn-secondary mt-4"><ArrowLeft className="w-4 h-4" /> Back to Register</button>
      </div>
    );
  }

  const nexts = caAllowedNext(header.status, cap);
  const statusIdx = CA_STATUS_FLOW.indexOf(header.status);
  const sigMap = caSignatoryMap(signatories);
  const printRows = detailsToPrintRows(details, empMap, positionMap);
  const printPages = buildCaPrintPages(printRows);
  const sigDefs = [...CA_SIGNATORY_DEFS].sort((a, b) => a.seq - b.seq);

  return (
    <div className="space-y-5">
      {showPrint && (
        <CommAllowancePrint
          header={header}
          pages={printPages}
          signatories={Object.fromEntries(sigDefs.map((d) => [d.type, { name: sigMap[d.type]?.name ?? '', position: sigMap[d.type]?.position ?? d.position }]))}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="Back to register">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title !text-2xl">{header.payroll_no}</h1>
              <span className={`badge ${CA_STATUS_COLORS[header.status]}`}>{header.status}</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{header.payroll_title} · {header.covered_period}{header.school_name ? ` · ${header.school_name}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPrint(true)} className="btn-primary"><Printer className="w-4 h-4" /> Print</button>
          <button onClick={() => void exportExcel()} className="btn-secondary"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          <button onClick={() => void exportPdf()} className="btn-secondary" title="Export Excel workbook — one worksheet per STACODE/school"><FileText className="w-4 h-4" /> PDF</button>
          <button onClick={() => exportCaPayrollCsv(header, details, empMap, positionMap)} className="btn-secondary"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={() => setShowSigs(true)} className="btn-secondary"><Settings2 className="w-4 h-4" /> Signatories</button>
        </div>
      </div>

      {dbError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Database setup incomplete.</p>
            <p className="mt-0.5">Run the <strong>CA setup script</strong> (<code className="font-mono text-[11px] bg-amber-100 px-1.5 py-0.5 rounded">src/sql/ca_setup.sql</code>) against the app database (app.db) to create all 4 CA collections plus the <strong>category</strong> and <strong>stacode</strong> fields — or copy the SQL below:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(caSetupSql).then(() => {
                    const b = document.getElementById('ca-payroll-copy-sql');
                    if (b) { const t = b.textContent; b.textContent = '✓ Copied!'; setTimeout(() => { b.textContent = t; }, 1600); }
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span id="ca-payroll-copy-sql">Copy Setup SQL</span>
              </button>
              <code className="font-mono text-[11px] bg-amber-100 px-1.5 py-0.5 rounded">src/sql/ca_setup.sql</code>
            </div>
            <p className="mt-2 text-xs opacity-80">{dbError}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-sm">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}

      {/* Workflow stepper */}
      <div className="card-base p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {CA_STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                i === statusIdx ? 'bg-deped-700 text-white border-deped-700'
                  : i < statusIdx ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {i < statusIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                {s}
              </div>
              {i < CA_STATUS_FLOW.length - 1 && <div className={`h-px w-5 ${i < statusIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Actions:</span>
          {nexts.map((to) => (
            <button key={to} onClick={() => void transition(to as CaStatus)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">
              {to === 'Draft' ? <RefreshCw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {to === 'Draft' ? 'Send Back to Draft' : `Mark ${to}`}
            </button>
          ))}
          {nexts.length === 0 && <span className="text-xs text-slate-400">No further actions available for your role at this stage.</span>}
        </div>
      </div>

      {/* Header details */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="section-heading !text-base">Payroll Header</h2>
          {editable && <span className="text-[11px] text-amber-600 font-medium">Editable until Approved</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-5 gap-y-3.5 p-5">
          <Field label="Payroll Number" value={header.payroll_no} mono />
          <Field label="Payroll Type" value={header.payroll_type} editable={editable} onSave={(v) => void saveHeader({ payroll_type: v })} />
          <Field label="Payroll Title" value={header.payroll_title} editable={editable} onSave={(v) => void saveHeader({ payroll_title: v })} />
          <Field label="Agency" value={header.agency} />
          <Field label="Division" value={header.division} />
          <Field label="School Name" value={header.school_name} placeholder="—" editable={editable} onSave={(v) => void saveHeader({ school_name: v })} />
          <Field label="Covered Period" value={header.covered_period} editable={editable} onSave={(v) => void saveHeader({ covered_period: v })} />
          <Field label="Payroll Status" value={header.status} />
          <Field label="Date Generated" value={header.created_date ? new Date(header.created_date).toLocaleString('en-PH') : ''} />
          <Field label="Total Employees" value={String(header.total_employees)} mono />
          <Field label="ALOBS No." value={header.alobs_no} editable={editable} onSave={(v) => void saveHeader({ alobs_no: v })} />
          <Field label="JEV No." value={header.jev_no} editable={editable} onSave={(v) => void saveHeader({ jev_no: v })} />
          <Field label="EO No." value={header.eo_no ?? ''} placeholder="—" editable={editable} onSave={(v) => void saveHeader({ eo_no: v })} />
          <Field label="Date" value={header.date ?? ''} editable={editable} date onSave={(v) => void saveHeader({ date: v || null })} />
          <Field label="Payroll Reference No." value={header.payroll_ref_no} editable={editable} onSave={(v) => void saveHeader({ payroll_ref_no: v })} />
          <Field label="Created By" value={header.created_by} />
        </div>
      </div>

      {/* Register */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-heading !text-base">Payroll Register</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {totals.totalEmployees} employees · Gross ₱{currency(totals.grossAmount)} · Deductions ₱{currency(totals.totalDeductions)} · Net ₱{currency(totals.netAmount)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="input-base pl-9 w-52" />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} className="input-base pl-9 w-48">
                <option value="all">All Schools</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as 'line' | 'name' | 'amount')} className="input-base w-40">
              <option value="line">Sort: Line No.</option>
              <option value="name">Sort: Last Name</option>
              <option value="amount">Sort: Amount</option>
            </select>
            {editable && (
              <>
                <button onClick={() => setShowAdd(true)} className="btn-primary"><UserPlus className="w-4 h-4" /> Add Row</button>
                <button onClick={() => { setShowImport(true); }} className="btn-secondary"><Upload className="w-4 h-4" /> Import</button>
              </>
            )}
          </div>
        </div>

        {editable && selected.size > 0 && (
          <div className="px-5 py-3 bg-amber-50/70 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">{selected.size} selected</span>
            <select value={massField} onChange={(e) => setMassField(e.target.value as 'amount' | 'deduction')} className="input-base !w-32 !py-1.5">
              <option value="amount">Set Amount</option>
              <option value="deduction">Set Deduction</option>
            </select>
            <input type="number" min={0} step="0.01" value={massValue} onChange={(e) => setMassValue(e.target.value)} placeholder="value" className="input-base !w-28 !py-1.5" />
            <button onClick={() => void applyMassUpdate()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-deped-700 text-white text-xs font-semibold hover:bg-deped-800 transition-colors">
              <Save className="w-3.5 h-3.5" /> Apply to Selected
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>
            <button onClick={() => void removeSelected()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Remove Selected
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                {editable && (
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={pagination.pagedItems.length > 0 && pagination.pagedItems.every((r) => selected.has(r.detail.id))}
                      onChange={(e) => {
                        const next = new Set(selected);
                        pagination.pagedItems.forEach((r) => { if (e.target.checked) next.add(r.detail.id); else next.delete(r.detail.id); });
                        setSelected(next);
                      }}
                      className="accent-deped-700" />
                  </th>
                )}
                <th className="text-left px-2 py-3 font-medium w-12">Line No.</th>
                <th className="text-left px-3 py-3 font-medium">Account No.</th>
                <th className="text-left px-3 py-3 font-medium">Last Name</th>
                <th className="text-left px-3 py-3 font-medium">First Name</th>
                <th className="text-left px-2 py-3 font-medium">M.I.</th>
                <th className="text-left px-3 py-3 font-medium">Position</th>
                <th className="text-right px-3 py-3 font-medium">Amount</th>
                <th className="text-right px-3 py-3 font-medium">Deduction</th>
                <th className="text-right px-3 py-3 font-medium">Net Amount Due</th>
                <th className="text-left px-3 py-3 font-medium">Remarks</th>
                <th className="text-left px-3 py-3 font-medium">Signature of Recipient</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagination.pagedItems.map(({ detail: d, emp }) => (
                <tr key={d.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${selected.has(d.id) ? 'bg-deped-50/40' : ''}`}>
                  {editable && (
                    <td className="px-4 py-2">
                      <input type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(d.id); else next.delete(d.id);
                          setSelected(next);
                        }}
                        className="accent-deped-700" />
                    </td>
                  )}
                  <td className="px-2 py-2 text-slate-400 text-xs tabular-nums">{d.line_no}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{emp?.account_no ?? ''}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{emp?.last_name ?? '—'}</td>
                  <td className="px-3 py-2">{emp?.first_name ?? ''}</td>
                  <td className="px-2 py-2">{emp?.middle_initial ?? ''}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{emp?.position_title ? positionMap.get(emp.position_title.trim().toUpperCase()) ?? emp.position_title : ''}</td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <input type="number" min={0} step="0.01" value={d.amount}
                        onChange={(e) => setDetailValue(d.id, 'amount', e.target.value)}
                        onBlur={() => void persistRow(d)}
                        className="w-24 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-deped-500/30" />
                    ) : (
                      <span className="tabular-nums">₱{currency(d.amount)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <input type="number" min={0} step="0.01" value={d.deduction}
                        onChange={(e) => setDetailValue(d.id, 'deduction', e.target.value)}
                        onBlur={() => void persistRow(d)}
                        className="w-24 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-deped-500/30" />
                    ) : (
                      <span className="tabular-nums">₱{currency(d.deduction)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">₱{currency(d.net_amount_due)}</td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <input value={d.remarks} onChange={(e) => setDetailValue(d.id, 'remarks', e.target.value)} onBlur={() => void persistRow(d)}
                        className="w-32 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-deped-500/30" />
                    ) : (
                      <span className="text-xs text-slate-500">{d.remarks}</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><span className="inline-block w-24 border-b border-dashed border-slate-300 h-4" /></td>
                </tr>
              ))}
              {pagination.pagedItems.length === 0 && (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-slate-400">No employees in this payroll yet. {editable ? 'Add a row or import from CSV.' : ''}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                {editable && <td />}
                <td className="px-2 py-2.5 text-xs uppercase text-slate-500" colSpan={6}>TOTAL — {totals.totalEmployees} Employees</td>
                <td className="px-3 py-2.5 text-right tabular-nums">₱{currency(totals.grossAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">₱{currency(totals.totalDeductions)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">₱{currency(totals.netAmount)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <Pagination pagination={pagination} label="employees" />
      </div>

      {/* Add row modal */}
      {showAdd && (
        <AddRowModal
          employees={employees}
          existingIds={new Set(details.map((d) => d.employee_id))}
          defaultAmount={CA_DEFAULT_AMOUNT()}
          positionMap={positionMap}
          onClose={() => setShowAdd(false)}
          onAdd={(emp, amount, deduction) => { void addEmployeeRow(emp, amount, deduction); setShowAdd(false); }}
        />
      )}

      {/* Signatories modal */}
      {showSigs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowSigs(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><Settings2 className="w-5 h-5" /></span>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Signatories & Certification</h3>
                  <p className="text-xs text-slate-500">Names appear on the printed payroll form</p>
                </div>
              </div>
              <button onClick={() => setShowSigs(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {sigDefs.map((d) => (
                <SigEditor
                  key={d.type}
                  def={d}
                  sig={sigMap[d.type]}
                  onSave={(name) => {
                    const existing = sigMap[d.type];
                    if (existing) void saveSignatory(existing, name);
                    else void ensureSignatory(d, name);
                  }}
                />
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onClick={() => setShowSigs(false)} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => !importing && setShowImport(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><Upload className="w-5 h-5" /></span>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Bulk Import Payroll Entries</h3>
                  <p className="text-xs text-slate-500">CSV columns: account_no,last_name,first_name,middle_initial,position_title,school_name,category,amount,deduction</p>
                </div>
              </div>
              <button onClick={() => setShowImport(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
                <Upload className="w-8 h-8 mx-auto text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">New employees are auto-created; existing rows update by Account No.</p>
                <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void handleImportFile(f); }} />
                <button onClick={() => importRef.current?.click()} disabled={importing} className="btn-primary mt-4">
                  {importing ? <LoadingIndicator size={40} /> : <Upload className="w-4 h-4" />}
                  {importing ? 'Importing…' : 'Choose CSV File'}
                </button>
              </div>
              {importResult && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Added {importResult.added} · Updated {importResult.updated} · {importResult.errors} error(s)
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CA_DEFAULT_AMOUNT() { return 700; }


// ── Small building blocks ────────────────────────────────────────────────────

function Field(props: {
  label: string; value: string; mono?: boolean; date?: boolean;
  editable?: boolean; onSave?: (v: string) => void; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);

  if (props.editable && editing) {
    return (
      <div>
        <p className="text-[11px] font-medium text-slate-500 mb-1">{props.label}</p>
        <div className="flex gap-1.5">
          <input
            type={props.date ? 'date' : 'text'}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { props.onSave?.(draft); setEditing(false); }
              if (e.key === 'Escape') setEditing(false);
            }}
            className="input-base !py-1.5"
          />
          <button onClick={() => { props.onSave?.(draft); setEditing(false); }} title="Save" className="px-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"><CheckCircle2 className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => props.editable && (setDraft(props.value), setEditing(true))}
      className={props.editable ? 'cursor-pointer group' : ''} title={props.editable ? 'Click to edit' : undefined}>
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{props.label}</p>
      <p className={`mt-0.5 text-sm text-slate-800 dark:text-slate-100 ${props.mono ? 'font-mono text-xs' : 'font-medium'} ${props.editable ? 'group-hover:text-deped-700 group-hover:underline decoration-dotted underline-offset-2 transition-colors' : ''}`}>
        {props.value || props.placeholder || '—'}
        {props.editable && <Pencil className="w-3 h-3 inline ml-1.5 text-slate-300 group-hover:text-deped-500" />}
      </p>
    </div>
  );
}

function AddRowModal(props: {
  employees: CaEmployee[];
  existingIds: Set<string>;
  defaultAmount: number;
  positionMap: Map<string, string>;
  onClose: () => void;
  onAdd: (emp: CaEmployee, amount: number, deduction: number) => void;
}) {
  const [q, setQ] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<CaEmployee | null>(null);
  const [amount, setAmount] = useState(String(props.defaultAmount));
  const [deduction, setDeduction] = useState('0');
  const available = useMemo(() => {
    const query = q.trim().toLowerCase();
    return props.employees.filter((e) => e.status === 'Active' && !props.existingIds.has(e.id) && (!query || [e.account_no, e.last_name, e.first_name].some((v) => (v ?? '').toLowerCase().includes(query))));
  }, [props.employees, props.existingIds, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={props.onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><UserPlus className="w-5 h-5" /></span>
            <h3 className="font-semibold text-slate-900 dark:text-white">Add Employee Row</h3>
          </div>
          <button onClick={props.onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setSelectedEmp(null); }} placeholder="Search active employees not yet in payroll…" className="input-base pl-9" />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {available.map((e) => (
              <button key={e.id} onClick={() => setSelectedEmp(e)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-deped-50/60 transition-colors ${selectedEmp?.id === e.id ? 'bg-deped-50' : ''}`}>
                <span>
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{e.last_name}, {e.first_name} {e.middle_initial}</span>
                  <span className="block text-xs text-slate-400">{e.account_no} · {e.position_title ? props.positionMap.get(e.position_title.trim().toUpperCase()) ?? e.position_title : ''} · {e.school_name || '—'}</span>
                </span>
                {selectedEmp?.id === e.id && <CheckCircle2 className="w-4 h-4 text-deped-700" />}
              </button>
            ))}
            {available.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">No matching employees available.</p>}
          </div>
          {selectedEmp && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Amount (₱)</span>
                <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Deduction (₱)</span>
                <input type="number" min={0} step="0.01" value={deduction} onChange={(e) => setDeduction(e.target.value)} className="input-base mt-1" />
              </label>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={props.onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => selectedEmp && props.onAdd(selectedEmp, num(amount), num(deduction))} disabled={!selectedEmp} className="btn-primary">
            <Plus /> Add to Payroll
          </button>
        </div>
      </div>
    </div>
  );
}

function Plus() {
  return <UserPlus className="w-4 h-4" />;
}

function SigEditor(props: { def: CaSignatoryDef; sig?: CaSignatory; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(props.sig?.name ?? '');
  useEffect(() => { setDraft(props.sig?.name ?? ''); }, [props.sig?.name]);
  const commit = () => { const v = draft.trim(); if (v) props.onSave(v); };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{props.def.cert || `Signed by: ${props.def.position}`}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-line">{props.def.position}</p>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        placeholder="Full name of signatory"
        className="input-base mt-2"
      />
      {!props.sig && <p className="text-[11px] text-amber-600 mt-1">New slot — the name is saved automatically once you type it.</p>}
    </div>
  );
}
