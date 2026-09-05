import { useState, useCallback, useMemo, useEffect } from 'react';
import { DatabaseBackup, Download, Upload, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import { inCategory } from '@/lib/categories';
import type { Employee, PayrollGroup } from '@/types/payroll';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';

export default function BackupRestore() {
  const { logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [restorePreview, setRestorePreview] = useState<{ count: number; file: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Employee[] | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroup[]>([]);

  const gf = useMemo(() => resolveGroupFilter(groupFilter, payrollGroups), [groupFilter, payrollGroups]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('payroll_groups').select('*').eq('status', 'Active').order('group_code');
      if (data) setPayrollGroups(data as PayrollGroup[]);
    })();
  }, []);

  const filterEmployees = useCallback((employees: Employee[]): Employee[] => {
    if (gf.groupId) return employees.filter((e) => e.payroll_group_id === gf.groupId);
    if (gf.category) return employees.filter((e) => inCategory(e.stacode, gf.category!));
    return employees;
  }, [gf]);

  const handleBackup = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const scope = codeScope(scopedCodes);
      let query = supabase.from('employees').select('*');
      if (scope.regcode) {
        query = query.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const { data, error } = await query;
      if (error) throw error;
      const filtered = filterEmployees(data);
      const json = JSON.stringify({
        version: 'MASTFILE-DBF-v1',
        exportedAt: new Date().toISOString(),
        recordCount: filtered.length,
        filterLabel: gf.label,
        employees: filtered,
      }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employees_backup_${gf.label.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Backup downloaded successfully — ${filtered.length} employee records exported for ${gf.label}.` });
      await logAudit('backup_create', 'employees', 'all', { recordCount: filtered.length, filter: gf.label });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Backup failed.' });
    } finally {
      setBusy(false);
    }
  }, [logAudit, filterEmployees, gf, scopedCodes]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.employees || !Array.isArray(parsed.employees)) {
          throw new Error('Invalid backup file format — missing employees array.');
        }
        setPendingRestore(parsed.employees as Employee[]);
        setRestorePreview({ count: parsed.employees.length, file: file.name });
        setMessage({ type: 'info', text: `Backup file loaded — ${parsed.employees.length} records ready to restore. Review and confirm below.` });
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to parse backup file.' });
      } finally {
        setBusy(false);
      }
    };
    reader.onerror = () => {
      setMessage({ type: 'error', text: 'Failed to read file.' });
      setBusy(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleRestore = useCallback(async () => {
    if (!pendingRestore) return;
    setBusy(true);
    setMessage(null);
    try {
      let inserted = 0;
      let updated = 0;
      const BATCH = 100;
      for (let i = 0; i < pendingRestore.length; i += BATCH) {
        const batch = pendingRestore.slice(i, i + BATCH);
        const { error } = await supabase.from('employees').upsert(
          batch.map((e) => ({ ...e, updated_at: new Date().toISOString() })),
          { onConflict: 'id' },
        );
        if (error) throw error;
        // Count — assume all are upserts
        const { data: existing } = await supabase.from('employees').select('id').in('id', batch.map((e) => e.id));
        const existingIds = new Set<string>((existing as { id: string }[] ?? []).map((r) => r.id));
        for (const e of batch) {
          if (existingIds.has(e.id)) updated++;
          else inserted++;
        }
      }
      setMessage({ type: 'success', text: `Restore complete — ${inserted} new, ${updated} updated records.` });
      setRestorePreview(null);
      setPendingRestore(null);
      await logAudit('backup_restore', 'employees', 'all', { inserted, updated, total: pendingRestore.length });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Restore failed.' });
    } finally {
      setBusy(false);
    }
  }, [pendingRestore, logAudit]);

  const handleCancelRestore = useCallback(() => {
    setPendingRestore(null);
    setRestorePreview(null);
    setMessage(null);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
            <DatabaseBackup className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Backup & Restore</h1>
            <p className="text-sm text-slate-500">Export and restore the employee masterfile database</p>
          </div>
        </div>
        <GroupFilter value={groupFilter} onChange={setGroupFilter} />
      </div>

      {/* Message banner */}
      {message && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          message.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> :
           message.type === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> :
           <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Backup section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <Download className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Create Backup</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Downloads employee masterfile records as a JSON file{gf.label !== 'All Payroll Groups' ? ` for ${gf.label}` : ''}. This includes all 84 FoxPro DBF fields
              plus internal database metadata. Store the file securely — it contains sensitive payroll data.
            </p>
            <button
              onClick={handleBackup}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              {busy ? 'Working…' : 'Download Backup'}
            </button>
          </div>
        </div>
      </div>

      {/* Restore section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Restore from Backup</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Upload a previously downloaded backup JSON file to restore employee records. Records matching
              an existing ID will be updated; new IDs will be inserted. This action is logged in the audit trail.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Select Backup File
              <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" disabled={busy} />
            </label>
          </div>
        </div>

        {/* Restore confirmation */}
        {restorePreview && (
          <div className="mt-5 border border-amber-200 rounded-lg p-4 bg-amber-50">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-800">Confirm Restore</h3>
                <p className="text-sm text-amber-700 mt-1">
                  File: <span className="font-mono">{restorePreview.file}</span> — {restorePreview.count} records will be upserted.
                  Existing records with matching IDs will be overwritten.
                </p>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={handleRestore}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {busy ? 'Restoring…' : 'Confirm Restore'}
                  </button>
                  <button
                    onClick={handleCancelRestore}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
