import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert, ShieldCheck, Search, Pencil, Save, X, RefreshCw, Download,
  FileSpreadsheet, FileText, Table, ExternalLink, AlertTriangle, CheckCircle2,
  History, ChevronDown, ChevronRight, Clock, User,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { downloadFile, generateCsv } from '@/lib/reports';
import type { Employee, PayrollGroup } from '@/types/payroll';

interface StacodeAuditEntry {
  id: string;
  employee_no: string;
  old_stacode: string;
  new_stacode: string;
  old_group_code: string;
  new_group_code: string;
  changed_by: string;
  changed_at: string;
  reason: string;
}

type ExportFormat = 'csv' | 'excel' | 'pdf';

interface Props {
  onNavigateMasterfile?: (empId: string) => void;
  onContinuePayroll?: () => void;
  onCancelPayroll?: () => void;
}

export default function StacodeValidation({ onNavigateMasterfile, onContinuePayroll, onCancelPayroll }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<PayrollGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStacode, setEditStacode] = useState('');
  const [saving, setSaving] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateMsg, setRevalidateMsg] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<StacodeAuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const { scopedCodes } = useOrg();

  const load = useCallback(async () => {
    setLoading(true);
    const scope = codeScope(scopedCodes);
    let empQuery = supabase.from('employees').select('*').order('lname', { ascending: true });
    if (scope.regcode) {
      empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    }
    const [emp, grp, aud] = await Promise.all([
      fetchAll(() => empQuery),
      supabase.from('payroll_groups').select('*').order('group_code'),
      supabase.from('stacode_audit').select('*').order('changed_at', { ascending: false }).limit(100),
    ]);
    setEmployees(emp as Employee[]);
    setGroups((grp.data as PayrollGroup[]) ?? []);
    setAuditEntries((aud.data as StacodeAuditEntry[]) ?? []);
    setLoading(false);
  }, [scopedCodes]);

  useEffect(() => { load(); }, [load]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const validEmployees = useMemo(() =>
    employees.filter((e) => classifyByStacode(e.stacode, groups) !== null),
    [employees, groups],
  );

  const invalidEmployees = useMemo(() =>
    employees.filter((e) => classifyByStacode(e.stacode, groups) === null),
    [employees, groups],
  );

  const filteredInvalid = useMemo(() => {
    if (!search) return invalidEmployees;
    const q = search.toLowerCase();
    return invalidEmployees.filter((e) =>
      (e.empno || e.employee_number || '').toLowerCase().includes(q) ||
      `${e.lname || e.last_name}, ${e.fname || e.first_name}`.toLowerCase().includes(q) ||
      (e.stacode || '').toLowerCase().includes(q),
    );
  }, [invalidEmployees, search]);

  function validationError(stacode: string): string {
    if (!stacode || !stacode.trim()) return 'STACODE is empty';
    if (!/^\d+$/.test(stacode.trim())) return 'STACODE is non-numeric';
    const code = parseInt(stacode.trim(), 10);
    const matched = groups.filter((g) =>
      g.status === 'Active' && g.stacode_min !== null && g.stacode_max !== null &&
      code >= g.stacode_min && code <= g.stacode_max,
    );
    if (matched.length === 0) return `STACODE ${stacode} does not match any configured range`;
    return 'Unknown error';
  }

  function schoolName(e: Employee): string {
    return e.stacode ? `Station ${e.stacode}` : 'No station';
  }

  function groupStatusLabel(e: Employee): string {
    const g = classifyByStacode(e.stacode, groups);
    if (g) return g.group_name;
    return e.payroll_group_id ? 'Assigned (mismatch)' : 'Unassigned';
  }

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setEditStacode(e.stacode ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStacode('');
  }

  async function saveStacode(e: Employee) {
    const newCode = editStacode.trim();
    if (!newCode) {
      alert('STACODE cannot be empty.');
      return;
    }
    if (!/^\d+$/.test(newCode)) {
      alert('STACODE must be numeric.');
      return;
    }
    setSaving(true);
    const oldStacode = e.stacode ?? '';
    const oldGroup = classifyByStacode(oldStacode, groups);
    const newGroup = classifyByStacode(newCode, groups);

    const { error: updErr } = await supabase
      .from('employees')
      .update({
        stacode: newCode,
        payroll_group_id: newGroup?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', e.id);

    if (updErr) {
      alert('Failed to update: ' + updErr.message);
      setSaving(false);
      return;
    }

    await supabase.from('stacode_audit').insert({
      employee_id: e.id,
      employee_no: e.empno || e.employee_number || '',
      old_stacode: oldStacode,
      new_stacode: newCode,
      old_group_code: oldGroup?.group_code ?? 'Unassigned',
      new_group_code: newGroup?.group_code ?? 'Unassigned',
      changed_by: 'system',
      reason: `Corrected from "${oldStacode || '(empty)'}" to "${newCode}"`,
    });

    setSaving(false);
    setEditingId(null);
    setEditStacode('');
    await load();
  }

  async function revalidateAll() {
    setRevalidating(true);
    setRevalidateMsg(null);
    let updated = 0;
    for (const e of employees) {
      const g = classifyByStacode(e.stacode, groups);
      const currentGroupId = e.payroll_group_id ?? null;
      const newGroupId = g?.id ?? null;
      if (currentGroupId !== newGroupId) {
        await supabase.from('employees')
          .update({ payroll_group_id: newGroupId, updated_at: new Date().toISOString() })
          .eq('id', e.id);
        updated++;
      }
    }
    setRevalidating(false);
    setRevalidateMsg(`Revalidation complete: ${updated} employee(s) reclassified based on current STACODE ranges.`);
    await load();
  }

  function exportReport(format: ExportFormat) {
    const rows = invalidEmployees.map((e) => ({
      'Employee No.': e.empno || e.employee_number || '',
      'Employee Name': `${e.lname || e.last_name}, ${e.fname || e.first_name}`,
      'School': schoolName(e),
      'STACODE': e.stacode || '(empty)',
      'Error Description': validationError(e.stacode ?? ''),
      'Status': e.status,
    }));

    if (rows.length === 0) {
      setExportMsg('No unassigned employees to export.');
      setTimeout(() => setExportMsg(null), 3000);
      return;
    }

    const headers = Object.keys(rows[0] ?? {});
    const csvBytes = generateCsv(headers, rows.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? ''))));

    if (format === 'csv') {
      downloadFile({ filename: 'unassigned_stacode_report.csv', content: csvBytes, mimeType: 'text/csv' });
    } else if (format === 'excel') {
      // Excel-compatible CSV with UTF-8 BOM
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const excel = new Uint8Array(bom.length + csvBytes.length);
      excel.set(bom);
      excel.set(csvBytes, bom.length);
      downloadFile({ filename: 'unassigned_stacode_report.xlsx', content: excel, mimeType: 'application/vnd.ms-excel' });
    } else if (format === 'pdf') {
      // Generate a printable HTML report that opens as PDF
      const html = generatePdfHtml(rows, validEmployees.length, invalidEmployees.length);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.onload = () => { setTimeout(() => win.print(), 500); };
      }
    }
    setExportMsg(`Unassigned STACODE Report exported as ${format.toUpperCase()}.`);
    setTimeout(() => setExportMsg(null), 3000);
  }

  const totalEmployees = employees.length;
  const validCount = validEmployees.length;
  const invalidCount = invalidEmployees.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-semibold text-slate-800">STACODE Validation & Correction</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Validate, correct, and audit employee STACODE assignments before payroll generation.
        </p>
      </div>

      {/* Validation Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">Valid Employees</div>
              <div className="text-2xl font-bold text-emerald-600 tabular-nums">{validCount.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">Invalid / Missing STACODE</div>
              <div className="text-2xl font-bold text-amber-600 tabular-nums">{invalidCount.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <User className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Employees</div>
              <div className="text-2xl font-bold text-slate-700 tabular-nums">{totalEmployees.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      {invalidCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 text-sm">Payroll Validation Warning</h3>
              <p className="text-sm text-amber-800 mt-1">
                <span className="font-semibold">{invalidCount} employee(s)</span> have invalid or missing STACODE and will be excluded from payroll processing.
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Please correct their STACODE in the Masterfile or review the Unassigned STACODE Report before generating payroll.
              </p>
            </div>
          </div>

          {/* Action button group */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <Search className="w-3.5 h-3.5" /> View Unassigned Employees
            </button>
            <button
              onClick={revalidateAll}
              disabled={revalidating}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {revalidating ? <ScriviaLogo className="w-3.5 h-3.5 animate-pulse" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {revalidating ? 'Revalidating...' : 'Auto-Revalidate All'}
            </button>
            <div className="relative group">
              <button
                onClick={() => exportReport('csv')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export Report
              </button>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => onContinuePayroll?.()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Continue Payroll (Exclude Invalid)
              </button>
              <button
                onClick={() => onCancelPayroll?.()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancel Payroll
              </button>
            </div>
          </div>

          {/* Export format buttons */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-amber-700 font-medium">Export format:</span>
            <button onClick={() => exportReport('csv')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <Table className="w-3 h-3" /> CSV
            </button>
            <button onClick={() => exportReport('excel')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <FileSpreadsheet className="w-3 h-3" /> Excel
            </button>
            <button onClick={() => exportReport('pdf')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <FileText className="w-3 h-3" /> PDF
            </button>
          </div>
        </div>
      )}

      {/* Revalidate message */}
      {revalidateMsg && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{revalidateMsg}</span>
        </div>
      )}

      {/* Export message */}
      {exportMsg && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
          <Download className="w-4 h-4 shrink-0" />
          <span>{exportMsg}</span>
        </div>
      )}

      {/* No invalid employees state */}
      {invalidCount === 0 && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
          <h3 className="font-semibold text-slate-700">All Employees Validated</h3>
          <p className="text-sm text-slate-500 mt-1">
            All {validCount.toLocaleString()} employees have valid STACODE assignments. No corrections needed.
          </p>
        </div>
      )}

      {/* Unassigned Employees Table */}
      {invalidCount > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 gap-3 flex-wrap">
            <h3 className="font-semibold text-slate-800 text-sm">Unassigned STACODE Employees</h3>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee no, name, STACODE..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Employee No.</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-left px-4 py-3 font-medium">STACODE</th>
                    <th className="text-left px-4 py-3 font-medium">School Name</th>
                    <th className="text-left px-4 py-3 font-medium">Position</th>
                    <th className="text-left px-4 py-3 font-medium">Payroll Group</th>
                    <th className="text-left px-4 py-3 font-medium">Validation Error</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvalid.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.empno || e.employee_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-800">{e.lname || e.last_name}, {e.fname || e.first_name}</td>
                      <td className="px-4 py-3">
                        {editingId === e.id ? (
                          <input
                            type="text"
                            value={editStacode}
                            onChange={(ev) => setEditStacode(ev.target.value.replace(/\D/g, ''))}
                            autoFocus
                            className="w-20 px-2 py-1 border border-emerald-400 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            placeholder="e.g. 508"
                          />
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-semibold ${
                            !e.stacode ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                          }`}>{e.stacode || '(empty)'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{schoolName(e)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{e.poscode || e.position || '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                          groupStatusLabel(e) === 'Unassigned' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>{groupStatusLabel(e)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-rose-600">{validationError(e.stacode ?? '')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {editingId === e.id ? (
                            <>
                              <button
                                onClick={() => saveStacode(e)}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                              >
                                <Save className="w-3 h-3" /> Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(e)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => onNavigateMasterfile?.(e.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" /> Masterfile
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInvalid.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">No employees match your search.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit Trail */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">STACODE Correction Audit Trail</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">{auditEntries.length}</span>
          </div>
          {showAudit ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>
        {showAudit && (
          <div className="overflow-x-auto">
            {auditEntries.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No STACODE corrections have been logged yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Employee No.</th>
                    <th className="text-left px-4 py-3 font-medium">Old STACODE</th>
                    <th className="text-left px-4 py-3 font-medium">New STACODE</th>
                    <th className="text-left px-4 py-3 font-medium">Old Group</th>
                    <th className="text-left px-4 py-3 font-medium">New Group</th>
                    <th className="text-left px-4 py-3 font-medium">Changed By</th>
                    <th className="text-left px-4 py-3 font-medium">Date/Time</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditEntries.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.employee_no}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-mono">{a.old_stacode || '(empty)'}</span></td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-mono">{a.new_stacode}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.old_group_code}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium">{a.new_group_code}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.changed_by}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(a.changed_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function generatePdfHtml(rows: Record<string, string>[], validCount: number, invalidCount: number): string {
  const date = new Date().toLocaleString();
  const tableRows = rows.map((r) => `
    <tr>
      <td>${r['Employee No.'] || ''}</td>
      <td>${r['Employee Name'] || ''}</td>
      <td>${r['School'] || ''}</td>
      <td>${r['STACODE'] || ''}</td>
      <td>${r['Error Description'] || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<title>Unassigned STACODE Report</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
  h1 { font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
  .stats { display: flex; gap: 20px; margin-bottom: 20px; }
  .stat { padding: 10px 16px; border-radius: 8px; background: #f1f5f9; font-size: 13px; }
  .stat strong { display: block; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; }
  @media print { body { margin: 15px; } }
</style>
</head>
<body>
  <h1>Unassigned STACODE Report</h1>
  <div class="meta">Generated: ${date}</div>
  <div class="stats">
    <div class="stat">Valid Employees<strong>${validCount.toLocaleString()}</strong></div>
    <div class="stat">Invalid Employees<strong style="color:#d97706">${invalidCount.toLocaleString()}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Employee No.</th>
        <th>Employee Name</th>
        <th>School</th>
        <th>STACODE</th>
        <th>Error Description</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">SCRIVIA CLOUD™ — STACODE Validation Report</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
}
