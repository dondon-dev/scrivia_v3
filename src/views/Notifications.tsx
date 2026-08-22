import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Megaphone, ListTodo, AlertTriangle, Activity as ActivityIcon,
  ArrowRight, RefreshCw, Calendar, Users as UsersIcon, Wallet, ShieldCheck,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import type { AuditLog } from '@/types/auth';

export type NotifTab = 'activity' | 'alerts' | 'tasks' | 'system';

const ACTION_LABELS: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  auto_logout_inactivity: 'Auto logout (inactivity)',
  signup: 'Account registration',
  user_role_change: 'Role changed',
  user_mfa_toggle: 'MFA toggled',
  user_account_unlock: 'Account unlocked',
  password_change: 'Password changed',
  payroll_generate: 'Payroll generated',
  payroll_approve: 'Payroll approved',
  employee_update: 'Employee record updated',
  employee_create: 'Employee record created',
  deduction_update: 'Deduction updated',
  dbf_upload: 'DBF file uploaded',
  report_generate: 'Report generated',
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

interface AlertItem {
  icon: typeof AlertTriangle;
  tone: string;
  title: string;
  detail: string;
  navId?: string;
}

export default function Notifications({
  initialTab = 'activity',
  onNavigate,
}: {
  initialTab?: NotifTab;
  onNavigate?: (navId: string) => void;
}) {
  const { profile } = useAuth();
  const { scopedCodes } = useOrg();
  const [tab, setTab] = useState<NotifTab>(initialTab);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [openPeriods, setOpenPeriods] = useState(0);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [pendingUsers, setPendingUsers] = useState<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string; created_at: string }[]>([]);
  const [systemStats, setSystemStats] = useState<{ label: string; value: string; icon: typeof UsersIcon }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const scope = codeScope(scopedCodes);

      // Activity: latest audit trail entries for this division's scope.
      const logQuery = supabase.from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (scope.regcode) {
        const divs = (scope.divcodes ?? []).join(',');
        logQuery.or(`and(regcode.eq.${scope.regcode},divcode.in.(${divs})),regcode.is.null`);
      }
      const logsRes = await logQuery;
      setLogs((logsRes.data as AuditLog[]) ?? []);

      // Alerts: open pay periods + unposted (Computed) payroll entries.
      const [periodsRes, entriesRes, usersRes] = await Promise.all([
        fetchAll(() => {
          let q = supabase.from('pay_periods').select('status');
          if (scope.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
          return q;
        }),
        fetchAll(() => {
          let q = supabase.from('payroll_entries').select('status').eq('status', 'Computed');
          if (scope.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
          return q;
        }),
        fetchAll(() => supabase.from('profiles').select('id,email,first_name,last_name,role,created_at').eq('status', 'pending_approval').order('created_at', { ascending: false }).limit(20)),
      ]);
      setOpenPeriods(periodsRes.filter((p) => p.status !== 'closed').length);
      setPendingEntries(entriesRes.length);
      setPendingUsers((usersRes as typeof pendingUsers) ?? []);

      // System snapshot: live counts straight from the main database.
      const [empRes, dedRes, grpRes, schoolRes] = await Promise.all([
        fetchAll(() => {
          let q = supabase.from('employees').select('status');
          if (scope.regcode) q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
          return q;
        }),
        fetchAll(() => supabase.from('deduction_codes').select('id').eq('active', true)),
        fetchAll(() => supabase.from('payroll_groups').select('id').eq('status', 'Active')),
        fetchAll(() => supabase.from('schools').select('id')),
      ]);
      setSystemStats([
        { label: 'Active Employees', value: empRes.filter((e) => e.status === 'Active').length.toLocaleString(), icon: UsersIcon },
        { label: 'Active Deduction Codes', value: dedRes.length.toLocaleString(), icon: ShieldCheck },
        { label: 'Payroll Groups', value: grpRes.length.toLocaleString(), icon: Wallet },
        { label: 'Schools in Directory', value: schoolRes.length.toLocaleString(), icon: Megaphone },
      ]);
    } finally {
      setLoading(false);
    }
  }, [scopedCodes]);

  useEffect(() => { void load(); }, [load]);

  const alerts: AlertItem[] = [
    ...(openPeriods > 0 ? [{
      icon: Calendar,
      tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 ring-blue-100 dark:ring-blue-800/40',
      title: `${openPeriods} open pay period${openPeriods > 1 ? 's' : ''} in your scope`,
      detail: 'Open periods are ready for computation. Run payroll to generate entries.',
      navId: 'pay_register',
    }] : []),
    ...(pendingEntries > 0 ? [{
      icon: ActivityIcon,
      tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 ring-amber-100 dark:ring-amber-800/40',
      title: `${pendingEntries.toLocaleString()} computed entr${pendingEntries === 1 ? 'y' : 'ies'} awaiting posting`,
      detail: 'Review the computed entries and post the pay period to finalize payroll.',
      navId: 'pay_register',
    }] : []),
    ...(pendingUsers.length > 0 ? [{
      icon: UsersIcon,
      tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 ring-rose-100 dark:ring-rose-800/40',
      title: `${pendingUsers.length} account request${pendingUsers.length > 1 ? 's' : ''} pending approval`,
      detail: 'New user registrations are waiting for review in User Management.',
      navId: 'admin_users',
    }] : []),
  ];

  const tabs: { id: NotifTab; label: string; icon: typeof Bell }[] = [
    { id: 'activity', label: 'Activity', icon: Bell },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'system', label: 'System', icon: Megaphone },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          {tabs.find((t) => t.id === tab)?.label ?? 'Notifications'}
        </h2>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">Loading live data…</div>
      ) : tab === 'activity' ? (
        <div className="space-y-2">
          {logs.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">No activity recorded in your scope yet.</p>
          )}
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-deped-50 dark:bg-deped-900/40 flex items-center justify-center shrink-0">
                <ActivityIcon className="w-4 h-4 text-deped-600 dark:text-deped-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{l.user_email ?? 'System'}</span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">{ACTION_LABELS[l.action] ?? l.action.replace(/_/g, ' ')}</span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(l.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'alerts' ? (
        <div className="space-y-3">
          {alerts.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
              All clear — no open items in your scope.
            </p>
          )}
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ${a.tone}`}>
                <a.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{a.detail}</p>
              </div>
              {a.navId && onNavigate && (
                <button
                  onClick={() => onNavigate(a.navId!)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-deped-700 dark:text-deped-300 hover:bg-deped-50 dark:hover:bg-deped-900/40 transition-colors shrink-0"
                >
                  Open <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : tab === 'tasks' ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Pending account approvals</p>
          {pendingUsers.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">No pending tasks — you're all caught up.</p>
          )}
          {pendingUsers.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0">
                {(u.first_name?.[0] ?? u.email[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                  {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                </p>
                <p className="text-xs text-slate-400">{u.email} · {u.role.replace(/_/g, ' ')} · requested {timeAgo(u.created_at)}</p>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('admin_users')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-deped-700 dark:text-deped-300 hover:bg-deped-50 dark:hover:bg-deped-900/40 transition-colors shrink-0"
                >
                  Review <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {systemStats.map((s) => (
            <div key={s.label} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <s.icon className="w-5 h-5 text-deped-500 mb-3" />
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
