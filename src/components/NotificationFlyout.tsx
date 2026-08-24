import { useState, useEffect } from 'react';
import { Bell, Megaphone, ListTodo, AlertTriangle, Activity as ActivityIcon, Clock, ChevronRight, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import type { AuditLog } from '@/types/auth';

const ACTION_LABELS: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  auto_logout_inactivity: 'Auto logout (inactivity)',
  signup: 'Account registration',
  user_role_change: 'Role changed',
  user_mfa_toggle: 'MFA toggled',
  password_change: 'Password changed',
  payroll_generate: 'Payroll generated',
  payroll_approve: 'Payroll approved',
  employee_update: 'Employee record updated',
  employee_create: 'Employee record created',
  deduction_update: 'Deduction updated',
  dbf_upload: 'DBF file uploaded',
  report_generate: 'Report generated',
  payroll_reverse: 'Payroll reversed',
  payroll_delete: 'Payroll deleted',
  dedfile_import_dbf: 'DEDFILE imported',
  dedmaster_import_dbf: 'Deduction masterfile imported',
  stacode_validation: 'STACODE validated',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

type Tab = 'announcements' | 'notifications' | 'tasks' | 'alerts';

interface Props {
  onClose: () => void;
  onNavigate: (navId: string) => void;
}

export default function NotificationFlyout({ onClose, onNavigate }: Props) {
  const { scopedCodes } = useOrg();
  const [activeTab, setActiveTab] = useState<Tab>('notifications');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [openPeriods, setOpenPeriods] = useState(0);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [pendingUsers, setPendingUsers] = useState<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string; created_at: string }[]>([]);

  useEffect(() => {
    if (!loading) return;
    (async () => {
      try {
        const scope = codeScope(scopedCodes);
        const logQuery = supabase.from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(15);
        if (scope.regcode) {
          const divs = (scope.divcodes ?? []).join(',');
          logQuery.or(`and(regcode.eq.${scope.regcode},divcode.in.(${divs})),regcode.is.null`);
        }
        const [logsRes, periodsRes, entriesRes, usersRes] = await Promise.all([
          logQuery,
          fetchAll(() => {
            let q = supabase.from('pay_periods').select('status');
            if (scope.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
            return q;
          }),
          fetchAll(() => {
            let q = supabase.from('payroll_entries').select('id').eq('status', 'Computed');
            if (scope.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
            return q;
          }),
          fetchAll(() => supabase.from('profiles').select('id,email,first_name,last_name,role,created_at').eq('status', 'pending_approval').order('created_at', { ascending: false }).limit(10)),
        ]);
        setLogs((logsRes.data as AuditLog[]) ?? []);
        setOpenPeriods(periodsRes.filter((p: any) => p.status !== 'closed').length);
        setPendingEntries(entriesRes.length);
        setPendingUsers((usersRes as typeof pendingUsers) ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [loading, scopedCodes]);

  const tabs: { id: Tab; label: string; icon: typeof Bell; count: number }[] = [
    { id: 'announcements', label: 'Announcements', icon: Megaphone, count: 0 },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: logs.length },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, count: pendingUsers.length },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, count: openPeriods + pendingEntries },
  ];

  const navMap: Record<Tab, string> = {
    announcements: 'notif_announcements',
    notifications: 'notif_notifications',
    tasks: 'notif_tasks',
    alerts: 'notif_alerts',
  };

  return (
    <div
      className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
      onMouseLeave={onClose}
    >
      {/* Tab Bar */}
      <div className="flex border-b border-slate-100 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition-colors relative ${
              activeTab === t.id
                ? 'text-deped-700 dark:text-deped-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.count > 0 && (
              <span className="absolute -top-0.5 right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                {t.count > 99 ? '99+' : t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Label */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {tabs.find(t => t.id === activeTab)?.label}
        </p>
        <button onClick={() => setLoading(true)} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Refresh">
          <RefreshCw className={`w-3 h-3 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-72 overflow-y-auto">
        {/* Announcements Tab */}
        {activeTab === 'announcements' && (
          <div className="px-4 py-6 text-center">
            <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No announcements</p>
            <p className="text-[10px] text-slate-300 mt-1">System announcements will appear here</p>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          loading ? (
            <div className="px-4 py-6 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-600 mx-auto" />
            </div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No recent activity</p>
            </div>
          ) : (
            logs.slice(0, 8).map((log, i) => (
              <div key={log.id ?? i} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-start gap-2">
                  <ActivityIcon className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {log.user_email ?? 'System'} · {timeAgo(log.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          loading ? (
            <div className="px-4 py-6 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-600 mx-auto" />
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No pending tasks</p>
              <p className="text-[10px] text-slate-300 mt-1">All user approvals are up to date</p>
            </div>
          ) : (
            pendingUsers.map((u) => (
              <div key={u.id} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {u.last_name ? `${u.last_name}, ${u.first_name}` : u.email}
                    </p>
                    <p className="text-[10px] text-slate-400">Pending approval · {u.role}</p>
                  </div>
                </div>
              </div>
            ))
          )
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          loading ? (
            <div className="px-4 py-6 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-600 mx-auto" />
            </div>
          ) : openPeriods === 0 && pendingEntries === 0 ? (
            <div className="px-4 py-6 text-center">
              <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No alerts</p>
              <p className="text-[10px] text-slate-300 mt-1">All systems operating normally</p>
            </div>
          ) : (
            <>
              {openPeriods > 0 && (
                <div className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-50 dark:border-slate-700/50">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{openPeriods} open payroll period(s)</p>
                      <p className="text-[10px] text-slate-400">Review and close before next payroll run</p>
                    </div>
                  </div>
                </div>
              )}
              {pendingEntries > 0 && (
                <div className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-50 dark:border-slate-700/50">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{pendingEntries} unposted entries</p>
                      <p className="text-[10px] text-slate-400">Computed payroll entries awaiting approval</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={() => { onNavigate(navMap[activeTab]); onClose(); }}
          className="w-full flex items-center justify-center gap-1 text-xs font-medium text-deped-700 dark:text-deped-400 hover:text-deped-800 transition-colors"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
