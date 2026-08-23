import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Search, Trash2, Plus, X, FileText, CheckCircle2, AlertTriangle, Download, Info } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { parseDeductionFile, matchRowsToEmployees, type ParseResult } from '@/lib/textParser';
import { generateDeductionDbf, downloadFile, currency } from '@/lib/reports';
import { validateUpload } from '@/lib/uploadSecurity';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import { getEmployeeFilter } from '@/lib/authz';
import { useOrg, matchesOrgScope } from '@/lib/org';
import type { Employee, Deduction, PayPeriod, DeductionUploadRow, DeductionCode } from '@/types/payroll';
import type { UserProfile } from '@/types/auth';
import { usePagination, Pagination } from '@/components/Pagination';

export default function Deductions({ category, profile }: { category?: PayrollCategory | null; profile?: UserProfile | null }) {
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [summary, setSummary] = useState<{ totalCount: number; totalAmount: number; codeCount: number; empCount: number } | null>(null);
  const [periodId, setPeriodId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));

  useEffect(() => {
    (async () => {
      const scopeFilter = profile ? getEmployeeFilter(profile) : null;
      const empCols = 'id,empno,employee_number,lname,last_name,fname,first_name,mi,stacode,regcode,divcode,division_id,status';
      const [emp, { data: per }, codes] = await Promise.all([
        fetchAll(() => {
          let q = supabase.from('employees').select(empCols).order('last_name');
          if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
          return q;
        }),
        supabase.from('pay_periods').select('*').order('start_date', { ascending: false }),
        fetchAll(() => supabase.from('deduction_codes').select('*').order('dedcode')),
      ]);
      // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
      // unique reference for one division's payroll.
      setEmployees((emp as unknown as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
      const scopedPer = (per ?? []).filter((p) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes }));
      setPeriods(scopedPer);
      setDedCodes(codes as DeductionCode[]);
      if (scopedPer.length > 0) setPeriodId(scopedPer[0].id);
      setLoading(false);
    })();
  }, [profile, scopedDivisionIds, scopedCodes]);

  const loadDeductions = useCallback(async () => {
    if (!periodId) return;
    const data = await fetchAll(() =>
      supabase.from('deductions')
        .select('id,employee_id,pay_period_id,deduction_code,deduction_name,category,amount,source,reference,created_at')
        .eq('pay_period_id', periodId)
        .order('deduction_code'),
    );
    setDeductions(data as Deduction[]);
    // Fetch summary stats via RPC (single call, server-side aggregation)
    const { data: summaryData } = await supabase.rpc('get_deductions_summary', { p_period_id: periodId });
    if (summaryData) {
      const s = summaryData as { totalCount: number; totalAmount: string; codeCount: number; empCount: number };
      setSummary({ totalCount: s.totalCount, totalAmount: Number(s.totalAmount), codeCount: s.codeCount, empCount: s.empCount });
    }
  }, [periodId]);

  useEffect(() => { loadDeductions(); }, [loadDeductions, refetchKey]);

  const empMap = new Map(employees.map((e) => [e.id, e]));
  const filtered = deductions.filter((d) => {
    if (category) {
      const e = empMap.get(d.employee_id);
      if (!e || !inCategory(e.stacode, category)) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    const e = empMap.get(d.employee_id);
    return [d.deduction_code, d.deduction_name, e?.employee_number, e?.last_name, e?.first_name]
      .some((v) => v?.toLowerCase().includes(q));
  });

  const grouped = filtered.reduce((acc, d) => {
    (acc[d.deduction_code] ??= []).push(d);
    return acc;
  }, {} as Record<string, Deduction[]>);

  const totalAmount = filtered.reduce((s, d) => s + d.amount, 0);

  async function removeDeduction(d: Deduction) {
    if (!confirm('Delete this deduction?')) return;
    await supabase.from('deductions').delete().eq('id', d.id);
    setRefetchKey((k) => k + 1);
  }

  function exportDbf(code: string) {
    const content = generateDeductionDbf(deductions, employees, code);
    downloadFile({ filename: `DEDUCTION_${code}_${new Date().toISOString().slice(0, 10)}.DBF`, content, mimeType: 'application/dbf' });
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-w-[200px]"
          >
            {periods.length === 0 && <option>No pay periods yet</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name}</option>)}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deductions…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(true)}
            disabled={!periodId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Manual Entry
          </button>
          <button
            onClick={() => setShowUpload(true)}
            disabled={!periodId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload Text File
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Deductions" value={String(filtered.length)} />
          <SummaryCard label="Total Amount" value={currency(totalAmount)} />
          <SummaryCard label="Deduction Codes" value={String(Object.keys(grouped).length)} />
          <SummaryCard label="Employees" value={String(new Set(filtered.map((d) => d.employee_id)).size)} />
        </div>
      )}

      {/* Deduction groups */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading deductions…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500">
              {periods.length === 0 ? 'Create a pay period first in the Payroll Run tab.' : 'No deductions for this period yet. Upload a text file or add manually.'}
            </p>
          </div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([code, items]) => (
            <DeductionGroup
              key={code}
              code={code}
              codeName={dedCodeMap.get(code)?.dedname ?? null}
              items={items}
              empMap={empMap}
              resetKey={search}
              onExport={exportDbf}
              onRemove={removeDeduction}
            />
          ))
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          employees={employees}
          periodId={periodId}
          dedCodes={dedCodes}
          onClose={() => setShowUpload(false)}
          onImported={() => { setShowUpload(false); setRefetchKey((k) => k + 1); }}
        />
      )}

      {/* Manual add modal */}
      {showAdd && (
        <ManualDeductionModal
          employees={employees}
          periodId={periodId}
          dedCodes={dedCodes}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); setRefetchKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function DeductionGroup({ code, codeName, items, empMap, resetKey, onExport, onRemove }: {
  code: string;
  codeName: string | null;
  items: Deduction[];
  empMap: Map<string, Employee>;
  resetKey: unknown;
  onExport: (code: string) => void;
  onRemove: (d: Deduction) => void;
}) {
  const pag = usePagination(items, 10, resetKey);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-mono font-semibold">{code}</span>
          {codeName && <span className="text-sm text-slate-600">{codeName}</span>}
          <span className="text-sm text-slate-600">{items.length} entries</span>
          <span className="text-sm font-medium text-slate-700">{currency(items.reduce((s, d) => s + d.amount, 0))}</span>
        </div>
        <button
          onClick={() => onExport(code)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> DBF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
              <th className="text-left px-4 py-2 font-medium">Emp. No.</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-left px-4 py-2 font-medium">Reference</th>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pag.pagedItems.map((d) => {
              const e = empMap.get(d.employee_id);
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{e?.employee_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-800">{e ? `${e.last_name}, ${e.first_name}` : 'Unknown'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.deduction_name}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.reference || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      d.source === 'Upload' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                    }`}>{d.source}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{currency(d.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => onRemove(d)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

// ── Upload Modal ───────────────────────────────────────────────────────

function UploadModal({
  employees, periodId, dedCodes, onClose, onImported,
}: {
  employees: Employee[];
  periodId: string;
  dedCodes: DeductionCode[];
  onClose: () => void;
  onImported: () => void;
}) {
  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [matchRows, setMatchRows] = useState<DeductionUploadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleParse(raw: string) {
    setText(raw);
    const result = parseDeductionFile(raw, { hasHeader: true });
    setParseResult(result);
    const empNumbers = new Set(employees.map((e) => e.employee_number));
    setMatchRows(matchRowsToEmployees(result.rows, empNumbers));
  }

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) {
      setParseResult({ rows: [], delimiter: ',', headers: [], rawLines: [], errors: [validation.error ?? 'Invalid file'] });
      return;
    }
    const raw = await file.text();
    handleParse(raw);
  }

  async function doImport() {
    if (!parseResult) return;
    setImporting(true);
    const empByNumber = new Map(employees.map((e) => [e.employee_number, e]));
    const toInsert = parseResult.rows
      .filter((r) => empByNumber.has(r.employee_number))
      .map((r) => {
        const codeInfo = dedCodeMap.get(r.deduction_code);
        return {
          employee_id: empByNumber.get(r.employee_number)!.id,
          pay_period_id: periodId,
          deduction_code: r.deduction_code,
          deduction_name: r.deduction_name || codeInfo?.dedname || r.deduction_code,
          category: codeInfo?.type ?? 'Other',
          amount: r.amount,
          source: 'Upload',
          reference: r.reference,
        };
      });

    let count = 0;
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from('deductions').insert(batch);
      if (!error) count += batch.length;
    }
    setImporting(false);
    setImported(count);
    setTimeout(() => onImported(), 1200);
  }

  const matchedCount = matchRows.filter((r) => r.matched).length;
  const unmatchedCount = matchRows.length - matchedCount;
  const totalAmount = parseResult?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-800">Upload Deductions from Text File</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-5">
          {/* Format help */}
          <div className="flex gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Expected format</p>
              <p className="text-xs text-blue-700">A header row followed by delimited rows (CSV, pipe, tab, or semicolon auto-detected). Required columns: employee number, deduction code, description, amount, reference.</p>
              <pre className="mt-2 text-[11px] bg-white/60 rounded p-2 font-mono overflow-x-auto">{`EMPNO|CODE|DESCRIPTION|AMOUNT|REFERENCE
EMP001|SSS|SSS Premium|581.30|2024-001
EMP002|PHIC|PhilHealth|437.50|2024-001
EMP003|TAX|Withholding Tax|1250.00|BIR-001`}</pre>
            </div>
          </div>

          {/* File picker */}
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.prn,.dat"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Upload className="w-4 h-4" /> Choose File
            </button>
            <span className="text-xs text-slate-400">or paste text below</span>
          </div>

          {/* Text area */}
          <textarea
            value={text}
            onChange={(e) => handleParse(e.target.value)}
            placeholder="EMPNO,CODE,DESCRIPTION,AMOUNT,REFERENCE&#10;EMP001,SSS,SSS Premium,581.30,2024-001&#10;..."
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-y"
          />

          {/* Parse summary */}
          {parseResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="Rows Parsed" value={String(parseResult.rows.length)} tone="slate" />
                <MiniStat label="Matched" value={String(matchedCount)} tone="emerald" />
                <MiniStat label="Unmatched" value={String(unmatchedCount)} tone="rose" />
                <MiniStat label="Total Amount" value={currency(totalAmount)} tone="amber" />
              </div>

              {parseResult.errors.length > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
                  <p className="text-sm font-medium text-rose-800 mb-1">Parse Errors ({parseResult.errors.length})</p>
                  <ul className="text-xs text-rose-700 space-y-0.5 max-h-28 overflow-y-auto">
                    {parseResult.errors.slice(0, 20).map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {matchRows.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-3 py-2 font-medium">Emp. No.</th>
                        <th className="text-left px-3 py-2 font-medium">Code</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-center px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matchRows.slice(0, 100).map((r, i) => (
                        <tr key={i} className={r.matched ? '' : 'bg-rose-50/50'}>
                          <td className="px-3 py-2 font-mono text-xs">{r.employee_number}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.deduction_code}</td>
                          <td className="px-3 py-2 text-slate-600">{r.deduction_name}</td>
                          <td className="px-3 py-2 text-right font-medium">{currency(r.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            {r.matched
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                              : <span className="inline-flex items-center gap-1 text-xs text-rose-600"><AlertTriangle className="w-3.5 h-3.5" /> No match</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {imported > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Successfully imported {imported} deduction records.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            {matchedCount > 0 ? `${matchedCount} records will be imported.` : 'No matching employees found.'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
            <button
              onClick={doImport}
              disabled={importing || matchedCount === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {importing ? 'Importing…' : `Import ${matchedCount} Records`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'rose' | 'amber' }) {
  const tones = {
    slate: 'text-slate-700', emerald: 'text-emerald-600', rose: 'text-rose-600', amber: 'text-amber-600',
  };
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${tones[tone]} mt-0.5`}>{value}</p>
    </div>
  );
}

// ── Manual Entry Modal ─────────────────────────────────────────────────

function ManualDeductionModal({
  employees, periodId, dedCodes, onClose, onSaved,
}: {
  employees: Employee[];
  periodId: string;
  dedCodes: DeductionCode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [empId, setEmpId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));

  async function save() {
    if (!empId || !code || amount <= 0) { setError('Employee, code, and a positive amount are required.'); return; }
    setSaving(true);
    const codeInfo = dedCodeMap.get(code);
    const { error: err } = await supabase.from('deductions').insert({
      employee_id: empId, pay_period_id: periodId, deduction_code: code,
      deduction_name: name || codeInfo?.dedname || code,
      category: codeInfo?.type ?? 'Other',
      amount, source: 'Manual', reference: ref,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Add Deduction</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Employee</span>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.last_name}, {e.first_name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Deduction Code</span>
              <select value={code} onChange={(e) => {
                const c = e.target.value;
                setCode(c);
                const info = dedCodeMap.get(c);
                if (info) setName(info.dedname);
              }} className={inputCls}>
                <option value="">Select code…</option>
                {dedCodes.map((c) => <option key={c.dedcode} value={c.dedcode}>{c.dedcode} — {c.dedname}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Amount</span>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Description</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SSS Premium" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Reference</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Add Deduction'}
          </button>
        </div>
      </div>
    </div>
  );
}
