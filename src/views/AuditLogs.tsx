import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search, Filter } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import { Pagination } from '@/components/Pagination';
import type { AuditLog } from '@/types/auth';

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  auto_logout_inactivity: 'Auto Logout (Inactivity)',
  signup: 'Account Registration',
  user_role_change: 'User Role Changed',
  user_mfa_toggle: 'MFA Toggled',
  user_account_unlock: 'Account Unlocked',
  password_change: 'Password Changed',
  payroll_generate: 'Payroll Generated',
  payroll_approve: 'Payroll Approved',
  employee_update: 'Employee Record Updated',
  employee_create: 'Employee Record Created',
  deduction_update: 'Deduction Updated',
  dbf_upload: 'DBF File Uploaded',
  report_generate: 'Report Generated',
};

export default function AuditLogs() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  const { scopedCodes } = useOrg();

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const scope = codeScope(scopedCodes);
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (filterAction !== 'all') {
      query = query.eq('action', filterAction);
    }
    // Division-scoped: this division's log entries plus system-wide entries
    // that carry no division codes (e.g. super-admin actions).
    if (scope.regcode) {
      const divs = (scope.divcodes ?? []).join(',');
      query = query.or(`and(regcode.eq.${scope.regcode},divcode.in.(${divs})),regcode.is.null`);
    }
    const { data, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    let filtered = (data as AuditLog[]) ?? [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.user_email ?? '').toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.record_id ?? '').toLowerCase().includes(q)
      );
    }
    setLogs(filtered);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [page, filterAction, search, scopedCodes]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const actionKeys = Object.keys(ACTION_LABELS);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 flex-1 w-full">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email, action, record..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Actions</option>
              {actionKeys.map(k => (
                <option key={k} value={k}>{ACTION_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            Page {page + 1}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            No audit logs found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date & Time</th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Record Type</th>
                  <th className="text-left px-4 py-3 font-medium">Record ID</th>
                  <th className="text-left px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 truncate max-w-[180px]">{log.user_email ?? 'System'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionBadgeClass(log.action)}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{log.record_type ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono truncate max-w-[120px]">{log.record_id ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
          total={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          label="logs"
        />
      </div>

      {profile && (
        <div className="text-xs text-slate-400 text-center">
          Viewing audit logs as {profile.email} ({profile.role})
        </div>
      )}
    </div>
  );
}

function actionBadgeClass(action: string): string {
  if (action.includes('login') || action.includes('logout')) return 'bg-blue-50 text-blue-700';
  if (action.includes('payroll')) return 'bg-emerald-50 text-emerald-700';
  if (action.includes('user') || action.includes('role') || action.includes('password')) return 'bg-amber-50 text-amber-700';
  if (action.includes('delete') || action.includes('lock')) return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}
