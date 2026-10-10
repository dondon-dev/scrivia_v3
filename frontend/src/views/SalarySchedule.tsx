import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, RefreshCw, AlertCircle, CheckCircle2, Table2, Trash2 } from 'lucide-react';
import { supabase, fetchAll, formatError } from '@/lib/pb';
import { currency, downloadFile } from '@/lib/reports';
import { validateUpload } from '@/lib/uploadSecurity';
import type { SalaryScheduleEntry } from '@/types/payroll';
import { usePagination, Pagination } from '@/components/Pagination';

interface UploadRow {
  grade: number;
  step: number;
  monthly_salary: number;
  row: number;
  error?: string;
}

/** Outcome of pushing the salary schedule onto employee records. */
interface SalarySyncStats {
  total: number;
  updated: number;
  unchanged: number;
  noGradeStep: number;
  unmatched: number;
  failed: number;
}

function parseSalaryCsv(text: string): UploadRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  const rows: UploadRow[] = [];
  // Skip header row if it contains non-numeric data in first column
  const startIdx = lines[0] && isNaN(parseInt(lines[0].split(/[,\t]/)[0])) ? 1 : 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(/[,\t]/).map((c) => c.trim());
    const grade = parseInt(cols[0]);
    const step = parseInt(cols[1]);
    const salaryStr = cols[2]?.replace(/[^\d.]/g, '');
    const salary = parseFloat(salaryStr);
    const row: UploadRow = { grade, step, monthly_salary: salary, row: i + 1 };
    if (isNaN(grade) || grade < 1 || grade > 33) row.error = `Invalid grade "${cols[0]}"`;
    else if (isNaN(step) || step < 1 || step > 8) row.error = `Invalid step "${cols[1]}"`;
    else if (isNaN(salary) || salary <= 0) row.error = `Invalid salary "${cols[2]}"`;
    rows.push(row);
  }
  return rows;
}

export default function SalarySchedule() {
  const [entries, setEntries] = useState<SalaryScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tranche, setTranche] = useState('Third Tranche');
  const [circularNo, setCircularNo] = useState('NBC 601');
  const [effectiveDate, setEffectiveDate] = useState('2026-01-01');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [meta, setMeta] = useState<{ tranche: string; circular_no: string; effective_date: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ stats?: SalarySyncStats; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAll(() =>
      supabase.from('salary_schedule')
        .select('*')
        .order('grade', { ascending: true })
        .order('step', { ascending: true }),
    );
    setEntries(data as SalaryScheduleEntry[]);
    if (data && data.length > 0) {
      const first = data[0];
      setTranche(first.tranche);
      setCircularNo(first.circular_no);
      setEffectiveDate(first.effective_date);
      setMeta({ tranche: first.tranche, circular_no: first.circular_no, effective_date: first.effective_date });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build grade x step matrix
  const gradeMap = new Map<number, Map<number, number>>();
  entries.forEach((e) => {
    if (!gradeMap.has(e.grade)) gradeMap.set(e.grade, new Map());
    gradeMap.get(e.grade)!.set(e.step, e.monthly_salary);
  });
  const grades = Array.from(gradeMap.keys()).sort((a, b) => a - b);
  const maxStep = Math.max(...entries.map((e) => e.step), 8);
  const pag = usePagination(grades, 10, entries);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = await validateUpload(file);
    if (!validation.valid) {
      setUploadResult({ success: false, message: validation.error ?? 'Invalid file.' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const rows = parseSalaryCsv(text);
      setUploadRows(rows);
      setUploadResult(null);
    };
    reader.readAsText(file);
  }

  async function applyUpload() {
    const valid = uploadRows.filter((r) => !r.error);
    if (valid.length === 0) return;
    setUploading(true);
    setUploadResult(null);

    // Delete existing schedule entries for this tranche, then insert new ones
    const { error: delErr } = await supabase
      .from('salary_schedule')
      .delete()
      .eq('tranche', tranche);
    if (delErr) {
      setUploadResult({ success: false, message: delErr.message });
      setUploading(false);
      return;
    }

    const payload = valid.map((r) => ({
      tranche,
      circular_no: circularNo,
      effective_date: effectiveDate,
      grade: r.grade,
      step: r.step,
      monthly_salary: r.monthly_salary,
    }));

    const { error: insErr } = await supabase.from('salary_schedule').insert(payload);
    if (insErr) {
      setUploadResult({ success: false, message: insErr.message });
    } else {
      setUploadResult({ success: true, message: `Successfully uploaded ${valid.length} salary entries for ${tranche} (${circularNo}).` });
      setShowUpload(false);
      setUploadRows([]);
      await load();
      const stats = await updateEmployeesBasicSalaryFromServer();
      setSyncResult({ stats });
    }
    setUploading(false);
  }

  function exportCsv() {
    const headers = ['Grade', 'Step', 'MonthlySalary'];
    const rows = entries.map((e) => [e.grade, e.step, e.monthly_salary]);
    const escape = (v: string | number) => String(v);
    const lines = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))];
    const content = new TextEncoder().encode(lines.join('\n'));
    downloadFile({
      filename: `salary_schedule_${tranche.replace(/\s+/g, '_')}_${effectiveDate}.csv`,
      content,
      mimeType: 'text/csv',
    });
  }

  async function resetToDefault() {
    if (!confirm('Reset salary schedule to seeded NBC 601 data? This will delete any uploaded changes.')) return;
    await supabase.from('salary_schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await load();
    const stats = await updateEmployeesBasicSalaryFromServer();
    setSyncResult({ stats });
  }

  /**
   * Read the salary schedule and return a `grade-step` → monthly salary map.
   */
  async function buildScheduleMap(): Promise<Map<string, number>> {
    const schedData = await fetchAll<{ grade: number; step: number; monthly_salary: number }>(() =>
      supabase.from('salary_schedule').select('grade,step,monthly_salary'),
    );
    const gradeStepMap = new Map<string, number>();
    for (const e of schedData) {
      const salary = Number(e.monthly_salary);
      if (Number.isFinite(salary)) gradeStepMap.set(`${e.grade}-${e.step}`, salary);
    }
    return gradeStepMap;
  }

  /** Update all employees' basic/basic_salary from the current salary schedule. */
  async function updateEmployeesBasicSalaryFromServer(): Promise<SalarySyncStats> {
    return applySalaryToEmployees(await buildScheduleMap());
  }

  /**
   * Update every employee record's Basic Salary from a `grade-step` → salary map.
   *
   * Each employee is matched by their Grade + Step; those without a grade/step
   * or with no matching schedule cell are left untouched and reported instead.
   * Writes go through the adapter's bounded-concurrency batch update so a
   * division-sized file does not take a serial minute per thousand rows.
   */
  async function applySalaryToEmployees(gradeStepMap: Map<string, number>): Promise<SalarySyncStats> {
    const stats: SalarySyncStats = { total: 0, updated: 0, unchanged: 0, noGradeStep: 0, unmatched: 0, failed: 0 };
    const employees = await fetchAll<{ id: string; grade: number; step: number; basic: number; basic_salary: number }>(
      () => supabase.from('employees').select('id,grade,step,basic,basic_salary'),
    );
    stats.total = employees.length;
    if (employees.length === 0) return stats;

    // PocketBase stamps the system `updated` field itself, so the payload is
    // deliberately limited to the two salary columns.
    const updates: { id: string; basic: number; basic_salary: number }[] = [];

    for (const emp of employees) {
      const grade = Number(emp.grade) || 0;
      const step = Number(emp.step) || 0;
      if (grade <= 0 || step <= 0) {
        stats.noGradeStep++;
        continue;
      }
      const salary = gradeStepMap.get(`${grade}-${step}`);
      if (salary == null) {
        stats.unmatched++;
        continue;
      }
      if (Number(emp.basic) === salary && Number(emp.basic_salary) === salary) {
        stats.unchanged++;
        continue;
      }
      updates.push({ id: emp.id, basic: salary, basic_salary: salary });
    }

    if (updates.length === 0) return stats;

    // Batch the id-bearing rows; the adapter runs them through its 12-way pool.
    const batchSize = 250;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const { data, error } = await supabase.from('employees').upsert(batch);
      if (error) {
        stats.failed += batch.length;
      } else {
        const written = Array.isArray(data) ? data.length : 0;
        stats.updated += written;
        stats.failed += batch.length - written;
      }
    }
    return stats;
  }

  /** Manual, user-triggered sync of all employee Basic Salaries from the schedule. */
  async function handleSyncEmployeeSalaries() {
    const ok = confirm(
      `Update the Basic Salary of all employee records using the current ${tranche} schedule (${circularNo})?\n\n` +
      `Employees are matched by Grade & Step. Those without a grade/step or with no matching schedule entry are left unchanged.`,
    );
    if (!ok) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const stats = await updateEmployeesBasicSalaryFromServer();
      setSyncResult({ stats });
    } catch (err) {
      setSyncResult({ error: formatError(err) });
    }
    setSyncing(false);
  }

  const validCount = uploadRows.filter((r) => !r.error).length;
  const errorCount = uploadRows.filter((r) => r.error).length;
  const syncStats = syncResult?.stats;

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Table2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">DBM Salary Schedule</p>
              {meta && (
                <p className="text-sm text-slate-500">
                  {meta.tranche} &middot; {meta.circular_no} &middot; Effective {meta.effective_date}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={entries.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload New Schedule
            </button>
            <button
              onClick={handleSyncEmployeeSalaries}
              disabled={syncing || entries.length === 0}
              title="Apply this schedule to the Basic Salary of every employee record, matched by Grade & Step"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Updating Employees…' : 'Update Employee Salaries'}
            </button>
          </div>
        </div>
      </div>

      {/* Result of applying the schedule to employee records */}
      {syncResult && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${
            syncResult.error
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {syncResult.error ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            {syncResult.error ? (
              <span>Could not update employee salaries: {syncResult.error}</span>
            ) : syncStats ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">
                  {syncStats.updated} employee{syncStats.updated === 1 ? '' : 's'} updated
                </span>
                <span className="text-emerald-700">{syncStats.unchanged} already current</span>
                {syncStats.noGradeStep > 0 && (
                  <span className="text-amber-700">{syncStats.noGradeStep} skipped — no Grade/Step</span>
                )}
                {syncStats.unmatched > 0 && (
                  <span className="text-amber-700">{syncStats.unmatched} skipped — Grade/Step not in schedule</span>
                )}
                {syncStats.failed > 0 && (
                  <span className="text-rose-700">{syncStats.failed} failed</span>
                )}
                <span className="text-emerald-700/70">of {syncStats.total} employee records</span>
              </div>
            ) : null}
          </div>
          <button
            onClick={() => setSyncResult(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Salary grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading salary schedule…</div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Table2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            No salary schedule loaded. Upload a DBM circular to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-slate-50">SG</th>
                  {Array.from({ length: maxStep }, (_, i) => i + 1).map((s) => (
                    <th key={s} className="text-right px-3 py-3 font-medium">Step {s}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pag.pagedItems.map((g) => {
                  const stepMap = gradeMap.get(g)!;
                  return (
                    <tr key={g} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-700 sticky left-0 bg-white">SG {g}</td>
                      {Array.from({ length: maxStep }, (_, i) => i + 1).map((s) => {
                        const val = stepMap.get(s);
                        return (
                          <td key={s} className="px-3 py-2.5 text-right text-slate-600 tabular-nums">
                            {val != null ? currency(val) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} />
        {!loading && entries.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            {entries.length} entries &middot; {grades.length} salary grades &middot; Source: EO 64, s. 2024 / DBM NBC No. 601
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Upload DBM Salary Schedule</h2>
              <button onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }} className="p-1 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Circular metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">Tranche</span>
                  <input
                    value={tranche}
                    onChange={(e) => setTranche(e.target.value)}
                    placeholder="e.g. Fourth Tranche"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">Circular No.</span>
                  <input
                    value={circularNo}
                    onChange={(e) => setCircularNo(e.target.value)}
                    placeholder="e.g. NBC 602"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">Effective Date</span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </label>
              </div>

              {/* File picker */}
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Choose CSV File
                </button>
                <p className="text-xs text-slate-400 mt-2">
                  Format: Grade, Step, MonthlySalary (one row per cell, e.g. <code className="text-slate-500">11,1,31705</code>)
                </p>
              </div>

              {/* Upload results */}
              {uploadResult && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  uploadResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {uploadResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {uploadResult.message}
                </div>
              )}

              {/* Preview */}
              {uploadRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Preview ({uploadRows.length} rows)</span>
                    <span className="text-xs text-slate-500">
                      <span className="text-emerald-600">{validCount} valid</span>
                      {errorCount > 0 && <span className="text-rose-600"> · {errorCount} errors</span>}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Row</th>
                          <th className="text-left px-3 py-2 font-medium">Grade</th>
                          <th className="text-left px-3 py-2 font-medium">Step</th>
                          <th className="text-right px-3 py-2 font-medium">Salary</th>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uploadRows.slice(0, 50).map((r) => (
                          <tr key={r.row} className={r.error ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-1.5 text-slate-400">{r.row}</td>
                            <td className="px-3 py-1.5">{r.grade}</td>
                            <td className="px-3 py-1.5">{r.step}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.monthly_salary ? currency(r.monthly_salary) : '—'}</td>
                            <td className="px-3 py-1.5">
                              {r.error ? <span className="text-rose-600">{r.error}</span> : <span className="text-emerald-600">OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {uploadRows.length > 50 && <p className="text-xs text-slate-400">Showing first 50 of {uploadRows.length} rows</p>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button
                onClick={applyUpload}
                disabled={uploading || validCount === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {uploading ? 'Uploading…' : `Upload ${validCount} Entries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
