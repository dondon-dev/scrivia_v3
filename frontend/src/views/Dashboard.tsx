import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import LoadingIndicator from '@/components/LoadingIndicator';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';
import { inCategory, stacodeToNum, type PayrollCategory } from '@/lib/categories';
import {
  Users, Calculator, TrendingUp, ArrowRight, Wallet, Building2, Landmark,
  BarChart3, School, ShieldCheck, ShieldAlert, Upload, Clock, CheckCircle2,
  AlertTriangle, DollarSign, Receipt, ChevronRight, Database, Download,
  ScrollText, FileSpreadsheet, UserCog, HardDriveDownload, Award, Table2, Zap, ListTree,
  Check, Circle, Building, MapPin, Sparkles, Brain, Hash, RefreshCw, type LucideIcon,
} from 'lucide-react';
import { supabase, chunkedIn } from '@/lib/pb';
import { currency } from '@/lib/reports';
import { usePositions } from '@/lib/usePositions';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import type { PayPeriod, PayrollGroup } from '@/types/payroll';
import type { UserProfile } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';
import { canImportDbf, canExportDbf } from '@/lib/authz';
import { usePermissions } from '@/lib/permissions';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { staggerContainer, sparkSeries } from '@/lib/motion';
import { useOrg, codeScope } from '@/lib/org';
import { KpiCard, QuickAction, SectionHeader, ProgressBar, HeroHeader } from '@/components/Enterprise';
import EssDashboard from '@/views/EssDashboard';

type View = 'dashboard' | 'employees' | 'dedmaster' | 'dedengine' | 'payroll' | 'reports' | 'salary' | 'taxcalc' | 'stacode' | 'importbackup' | 'users' | 'audit' | 'initial_payroll' | 'ai_center' | 'positionmgmt' | 'plantilla_allocation';

interface DashboardProps {
  onNavigate: (v: View) => void;
  category?: PayrollCategory | null;
  profile?: UserProfile | null;
  groupFilterValue?: GroupFilterValue;
  onGroupFilterChange?: (v: GroupFilterValue) => void;
}

interface DashboardData {
  totalRecords: number;
  activeEmployees: number;
  totalGross: number;
  totalNet: number;
  totalMandatory: number;
  totalLoanDeds: number;
  processedCount: number;
  pendingCount: number;
  currentPeriod: PayPeriod | null;
  periodNet: number;
  groupStats: (PayrollGroup & { count: number })[];
  unassignedCount: number;
  activeLoanAccounts: number;
  dedTotalsByCode: { code: string; name: string; count: number; total: number }[];
  recentEmployees: {
    id: string; empno: string; employee_number: string;
    fname: string; first_name: string; lname: string; last_name: string;
    poscode: string; position: string; regcode: string; stacode: string;
    basic: number; basic_salary: number;
  }[];
}

interface UploadStats {
  todayCount: number; monthCount: number; failedToday: number;
  gsisToday: number; pliToday: number;
  addedToday: number; updatedToday: number; terminatedToday: number;
}

interface RecentActivity {
  id: string;
  action: string;
  user_email: string | null;
  created_at: string;
  record_type: string | null;
  label: string;
  icon: LucideIcon;
  color: string;
}

/**
 * Normalize dashboard data into the app's DashboardData shape.
 *
 * Accepts either source:
 * - the live `get_dashboard_summary` RPC (camelCase keys), or
 * - the snapshot `dashboard_stats_cache` row (snake_case keys).
 * Numbers are coerced (PostgREST can return numerics as strings).
 */
function normalizeDashboardData(src: Record<string, unknown>): DashboardData {
  const pick = (camel: string, snake: string): unknown => {
    const v = src[camel] ?? src[snake];
    return v === undefined ? null : v;
  };
  // PocketBase stores JSON fields as strings — parse them back to arrays
  const parseJson = (v: unknown): unknown => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
  };
  return {
    totalRecords: Number(pick('totalRecords', 'total_records') ?? 0),
    activeEmployees: Number(pick('activeEmployees', 'active_employees') ?? 0),
    totalGross: Number(pick('totalGross', 'total_gross') ?? 0),
    totalNet: Number(pick('totalNet', 'total_net') ?? 0),
    totalMandatory: Number(pick('totalMandatory', 'total_mandatory') ?? 0),
    totalLoanDeds: Number(pick('totalLoanDeds', 'total_loan_deds') ?? 0),
    processedCount: Number(pick('processedCount', 'processed_count') ?? 0),
    pendingCount: Number(pick('pendingCount', 'pending_count') ?? 0),
    currentPeriod: (() => { const v = pick('currentPeriod', 'current_period'); if (!v) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v as PayPeriod; })(),
    periodNet: Number(pick('periodNet', 'period_net') ?? 0),
    groupStats: parseJson(pick('groupStats', 'group_stats')) as DashboardData['groupStats'],
    unassignedCount: Number(pick('unassignedCount', 'unassigned_count') ?? 0),
    activeLoanAccounts: Number(pick('activeLoanAccounts', 'active_loan_accounts') ?? 0),
    dedTotalsByCode: parseJson(pick('dedTotalsByCode', 'ded_totals_by_code')) as DashboardData['dedTotalsByCode'],
    recentEmployees: parseJson(pick('recentEmployees', 'recent_employees')) as DashboardData['recentEmployees'],
  };
}

export default function Dashboard({ onNavigate, category, profile, groupFilterValue, onGroupFilterChange }: DashboardProps) {
  // DB-merged permission checks — quick actions reflect live grant/revoke.
  const { hasPermission: can } = usePermissions();
  const { selectedRegion, selectedDivision, scoped, scopedCodes } = useOrg();
  if (profile?.role === 'ess') {
    return <EssDashboard profile={profile} />;
  }
  const [internalGroupFilter, setInternalGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const groupFilter = groupFilterValue ?? internalGroupFilter;
  const setGroupFilter = onGroupFilterChange ?? setInternalGroupFilter;
  const [allGroups, setAllGroups] = useState<PayrollGroup[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // True when the live division-scoped aggregation was unavailable and the
  // dashboard fell back to the global snapshot (e.g. DB migration not applied).
  const [scopeDegraded, setScopeDegraded] = useState(false);
  // The actual RPC failure behind the degraded state (shown in the banner +
  // retryable) so the message is accurate instead of a generic migration hint.
  const [scopeError, setScopeError] = useState<string | null>(null);
  // Bumped by the banner's Retry button to re-run the data load.
  const [refreshTick, setRefreshTick] = useState(0);
  const { positions: positionList, lookup: lookupPosition } = usePositions();
  const { entries: schedEntries, meta: schedMeta } = useSalarySchedule();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // Build a scoped dashboard by querying PocketBase collections directly
        // with regcode/divcode filters when a Region/Division is selected.
        const scope = scopedCodes && scopedCodes.length > 0 ? scopedCodes : null;
        const regcode = scope?.[0]?.regcode ?? null;
        const divcodes = scope ? [...new Set(scope.map((s) => s.divcode))] : null;

        // Helper: add division-scope filters to a PocketBase query builder
        const addScope = (q: ReturnType<typeof supabase.from>) => {
          if (regcode && divcodes) {
            return q.eq('regcode', regcode).in('divcode', divcodes);
          }
          return q;
        };

        // Employees are the source of truth for the division scope: employees
        // carry regcode/divcode, but payroll_entries' copies are not stamped
        // and payroll_deductions has no such columns at all — so payroll tables
        // are scoped by the scoped employees' ids instead. All employee rows are
        // needed for active/group counts anyway, so their list length is the
        // exact record total (the adapter now honours `{ count, head }`, which
        // is why head:true is no longer used here).
        const [
          empRes, payPeriodsRes, groupsRes, recentRes, dedCodesRes,
        ] = await Promise.all([
          addScope(supabase.from('employees').select('id,status,payroll_status,regcode,divcode,stacode')),
          supabase.from('pay_periods').select('*').order('created_at', { ascending: false }).limit(1),
          supabase.from('payroll_groups').select('*'),
          addScope(supabase.from('employees').select('id,empno,employee_number,fname,first_name,lname,last_name,poscode,position,regcode,divcode,stacode,basic,basic_salary').order('created_at', { ascending: false }).limit(5)),
          supabase.from('deduction_codes').select('*'),
        ]);
        if (!active) return;

        const allEmps = (empRes.data ?? []) as Array<{
          id: string;
          status: string | null;
          payroll_status: string | null;
          regcode: string | null;
          divcode: string | null;
          stacode: string | null;
        }>;
        const groups = (groupsRes.data ?? []) as PayrollGroup[];

        // ── Payroll-group scope ───────────────────────────────────────────
        // The hero's GroupFilter resolves to either a category (the ELEM / JHS+
        // SHS STACODE band) or one specific payroll group's STACODE range. Every
        // total below — employees, the current period's payroll, deductions and
        // recent hires — is narrowed to that band, so the KPI cards, the hero's
        // "Net Pay This Period", the deduction breakdown and the group panel all
        // describe the same scope. An unset range means "all groups".
        const gf = resolveGroupFilter(groupFilter, groups);
        const inGroupScope = (stacode: unknown): boolean => {
          if (gf.groupId) {
            const n = stacodeToNum(stacode as string);
            return n !== null && n >= (gf.stacodeMin ?? 0) && n <= (gf.stacodeMax ?? 701);
          }
          if (gf.category) return inCategory(stacode as string, gf.category);
          return true;
        };
        const scopedEmps = allEmps.filter((e) => inGroupScope(e.stacode));
        const groupScoped = gf.groupId !== null || gf.category !== null;

        const totalRecords = scopedEmps.length;
        const activeEmployees = scopedEmps.filter((e) => e.status === 'Active' || !e.status).length;
        // The payroll tables carry no STACODE of their own, so they are scoped
        // by the matching employee ids whenever the division or the group filter
        // needs narrowing.
        const needEmpIdScope = Boolean(regcode && divcodes) || groupScoped;
        const scopedEmpIds = needEmpIdScope ? scopedEmps.map((e) => e.id) : null;
        const entriesQuery = () => supabase.from('payroll_entries').select('id,employee_id,pay_period_id,gross_pay,total_deductions,net_pay,status,mandatory_deductions,actual_loan_deductions');
        const dedQuery = () => supabase.from('payroll_deductions').select('id,dedcode,dedamt,agency,type,employee_id');
        const scopedRows = async (mk: () => ReturnType<typeof supabase.from>) => {
          const rows = await chunkedIn('employee_id', scopedEmpIds!, (chunk) => mk().in('employee_id', chunk));
          return { data: rows, error: null };
        };
        const [payEntriesRes, dedRes] = await Promise.all([
          scopedEmpIds ? scopedRows(entriesQuery) : entriesQuery(),
          scopedEmpIds ? scopedRows(dedQuery) : dedQuery(),
        ]);
        if (!active) return;

        const periods = (payPeriodsRes.data ?? []) as PayPeriod[];
        const currentPeriod = periods[0] ?? null;
        const entries = (payEntriesRes.data ?? []) as Record<string, unknown>[];

        // Filter to current period entries
        const currentEntries = currentPeriod
          ? entries.filter((e) => e.pay_period_id === currentPeriod.id)
          : [];
        const computedEntries = currentEntries.filter((e) => e.status === 'Computed');
        const pendingEntries = currentEntries.filter((e) => e.status !== 'Posted' && e.status !== 'Computed');
        const postedEntries = currentEntries.filter((e) => e.status === 'Posted');

        const totalGross = currentEntries.reduce((s, e) => s + Number(e.gross_pay ?? 0), 0);
        const totalNet = currentEntries.reduce((s, e) => s + Number(e.net_pay ?? 0), 0);
        const totalMandatory = currentEntries.reduce((s, e) => s + Number(e.mandatory_deductions ?? 0), 0);
        const totalLoanDeds = currentEntries.reduce((s, e) => s + Number(e.actual_loan_deductions ?? 0), 0);

        // Deduction totals by code
        const deductions = (dedRes.data ?? []) as { dedcode: string; dedname: string; dedamt: number; agency?: string }[];
        const dedCodesResData = (dedCodesRes.data ?? []) as { dedcode: string; dedname: string; description?: string }[];
        const dedCodeMap = new Map(dedCodesResData.map((d) => [d.dedcode, d]));
        const dedAgg = new Map<string, { code: string; name: string; count: number; total: number }>();
        for (const d of deductions) {
          const existing = dedAgg.get(d.dedcode);
          if (existing) { existing.total += d.dedamt; existing.count++; } else {
            const codeInfo = dedCodeMap.get(d.dedcode);
            dedAgg.set(d.dedcode, { code: d.dedcode, name: d.dedname || codeInfo?.description || d.dedcode, count: 1, total: d.dedamt });
          }
        }
        const dedTotalsByCode = [...dedAgg.values()].sort((a, b) => b.total - a.total);

        // Group stats — counted from the same group-scoped employee set, and the
        // list itself narrowed to the selection (the chosen group, or every
        // group inside the selected category band) so it never contradicts the
        // scoped KPI totals.
        const groupStats = groups
          .filter((g) => {
            if (gf.groupId) return g.id === gf.groupId;
            if (gf.category) {
              return (g.stacode_min ?? 0) >= (gf.stacodeMin ?? 0)
                && (g.stacode_max ?? 0) <= (gf.stacodeMax ?? 701);
            }
            return true;
          })
          .map((g) => {
            const min = g.stacode_min ?? 0;
            const max = g.stacode_max ?? 701;
            const count = scopedEmps.filter((e) => {
              const stacode = Number(e.stacode ?? 0);
              return stacode >= min && stacode <= max;
            }).length;
            return { ...g, count };
          });

        // Active loan accounts: employees with non-zero loan deductions
        const activeLoanAccounts = currentEntries.filter((e) => Number(e.actual_loan_deductions ?? 0) > 0).length;

        const summaryResult = {
          data: {
            totalRecords,
            activeEmployees,
            totalGross,
            totalNet,
            totalMandatory,
            totalLoanDeds,
            processedCount: computedEntries.length + postedEntries.length,
            pendingCount: pendingEntries.length,
            currentPeriod,
            periodNet: totalNet,
            groupStats,
            unassignedCount: 0,
            activeLoanAccounts,
            dedTotalsByCode,
            recentEmployees: ((recentRes.data ?? []) as DashboardData['recentEmployees'])
              .filter((e) => inGroupScope(e.stacode)),
          },
          error: null,
        };
        setScopeDegraded(false);
        setScopeError(null);

        const [gsisToday, gsisMonth, pliToday, pliMonth, auditResult] = await Promise.all([
          supabase.from('gsis_import_logs').select('created_at,new_deductions,updated_deductions,failed_records').gte('created_at', todayStart),
          supabase.from('gsis_import_logs').select('created_at').gte('created_at', monthStart),
          supabase.from('pli_import_logs').select('created_at,new_deductions,updated_deductions,terminated_deductions,failed_records').gte('created_at', todayStart),
          supabase.from('pli_import_logs').select('created_at').gte('created_at', monthStart),
          supabase.from('audit_logs').select('id,action,user_email,created_at,record_type').order('created_at', { ascending: false }).limit(8),
        ]);
        if (!active) return;

        if (summaryResult.error || !summaryResult.data) throw summaryResult.error ?? new Error('No dashboard data available');

        const mapped = normalizeDashboardData(summaryResult.data as Record<string, unknown>);
        if (category) {
          const range = category === 'elementary' ? [1, 499] : [500, 701];
          mapped.groupStats = mapped.groupStats.filter(
            (g) => (g.stacode_min ?? 0) >= range[0] && (g.stacode_max ?? 0) <= range[1],
          );
        }
        setData(mapped);

        const gRows = (gsisToday.data ?? []) as { new_deductions: number; updated_deductions: number; failed_records: number }[];
        const pRows = (pliToday.data ?? []) as { new_deductions: number; updated_deductions: number; terminated_deductions: number; failed_records: number }[];
        setUploadStats({
          todayCount: (gsisToday.data?.length ?? 0) + (pliToday.data?.length ?? 0),
          monthCount: (gsisMonth.data?.length ?? 0) + (pliMonth.data?.length ?? 0),
          failedToday: gRows.reduce((s, r) => s + (r.failed_records ?? 0), 0) + pRows.reduce((s, r) => s + (r.failed_records ?? 0), 0),
          gsisToday: gsisToday.data?.length ?? 0,
          pliToday: pliToday.data?.length ?? 0,
          addedToday: gRows.reduce((s, r) => s + (r.new_deductions ?? 0), 0) + pRows.reduce((s, r) => s + (r.new_deductions ?? 0), 0),
          updatedToday: gRows.reduce((s, r) => s + (r.updated_deductions ?? 0), 0) + pRows.reduce((s, r) => s + (r.updated_deductions ?? 0), 0),
          terminatedToday: pRows.reduce((s, r) => s + (r.terminated_deductions ?? 0), 0),
        });

        // Map audit logs to recent activities
        const auditRows = (auditResult.data ?? []) as { id: string; action: string; user_email: string | null; created_at: string; record_type: string | null }[];
        const activities: RecentActivity[] = auditRows.map((row) => {
          const meta = activityMeta(row.action);
          return {
            id: row.id,
            action: row.action,
            user_email: row.user_email,
            created_at: row.created_at,
            record_type: row.record_type,
            label: meta.label,
            icon: meta.icon,
            color: meta.color,
          };
        });
        setRecentActivity(activities);

        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError('Unable to load dashboard data. You may not have permission to view some sections.');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [profile, category, scopedCodes, refreshTick, groupFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        <div className="flex items-center justify-center mr-3">
          <LoadingIndicator size={56} />
        </div>
        Loading dashboard…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-12 h-12 text-amber-400 mb-3" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{loadError}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Contact your administrator if this persists.</p>
      </div>
    );
  }

  if (!data) return null;

  const maxDedTotal = Math.max(...data.dedTotalsByCode.map((d) => d.total), 1);
  const role = profile?.role ?? 'read_only';
  const canImport = canImportDbf(role);
  const canExport = canExportDbf(role);
  const catLabel = category === 'elementary' ? 'Elementary' : category === 'highschool' ? 'High School' : 'All Groups';

  // ── KPI Cards (floating premium cards with sparklines + count-up) ──
  const kpiCards = [
    {
      label: 'Total Employees', value: data.activeEmployees.toLocaleString(), raw: data.activeEmployees,
      icon: Users, accent: 'blue' as const, sublabel: `${data.totalRecords} total records`,
      trend: { value: 'Active', direction: 'up' as const },
      spark: data.groupStats.length > 1 ? data.groupStats.map((g) => g.count) : sparkSeries('employees'),
      hint: `${data.groupStats.length} payroll group${data.groupStats.length === 1 ? '' : 's'}`, onClick: () => onNavigate('employees'),
    },
    {
      label: 'Monthly Payroll', value: currency(data.totalGross), raw: data.totalGross, format: (n: number) => currency(n),
      icon: DollarSign, accent: 'emerald' as const, sublabel: 'Gross this period',
      trend: { value: 'Net ' + currency(data.periodNet), direction: 'up' as const },
      spark: data.dedTotalsByCode.length > 1 ? data.dedTotalsByCode.map((d) => d.total) : sparkSeries('payroll'),
      hint: `${currency(data.totalNet)} all periods`, onClick: () => onNavigate('payroll'),
    },
    {
      label: 'Pending Approvals', value: data.pendingCount.toLocaleString(), raw: data.pendingCount,
      icon: Clock, accent: 'amber' as const, sublabel: 'Awaiting posting',
      trend: { value: data.processedCount.toLocaleString() + ' processed', direction: 'neutral' as const },
      spark: sparkSeries('pending'),
      hint: 'Approve to move the cycle forward', onClick: () => onNavigate('payroll'),
    },
    {
      label: 'Active Loans', value: data.activeLoanAccounts.toLocaleString(), raw: data.activeLoanAccounts,
      icon: Landmark, accent: 'rose' as const, sublabel: `${currency(data.totalLoanDeds)} deductions`,
      trend: { value: 'Monthly', direction: 'down' as const },
      spark: sparkSeries('loans'),
      hint: `${currency(data.totalMandatory)} mandatory deductions`, onClick: () => onNavigate('dedmaster'),
    },
  ];

  // ── Quick Actions (filtered by role) ──
  const allActions: { label: string; desc: string; icon: LucideIcon; color: string; view: View; show: boolean }[] = [
    { label: 'Run Payroll', desc: 'Process a pay period', icon: Calculator, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', view: 'payroll', show: can('payroll') },
    { label: 'Manage Masterfile', desc: 'Add or edit employees', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
    { label: 'Generate Reports', desc: 'Payroll & remittance', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
    { label: 'Users & Roles', desc: 'Manage user accounts', icon: UserCog, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', view: 'users', show: can('user_management') },
    { label: 'Plantilla Allocation List', desc: 'Encode & export PAL form', icon: ListTree, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'plantilla_allocation', show: can('salary') },
  ];
  const quickActions = allActions.filter((a) => a.show);

  return (
    <div className="space-y-3">
      {scopeDegraded && scopedCodes && scopedCodes.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Live division stats unavailable — showing overall totals.</p>
            <p className="mt-0.5 text-xs">
              {scopeError
                ? `${scopeError} Showing overall totals instead. `
                : 'The scoped dashboard aggregation could not run. '}
              If this persists, make sure the latest division-scoping migration has been applied in your Supabase SQL
              Editor (see <code className="font-mono text-[11px] bg-amber-100 px-1 py-0.5 rounded">20260815_scope_by_regcode_divcode.sql</code>),
              then retry to see {selectedDivision?.division_name ?? 'this region'}&rsquo;s numbers.
            </p>
          </div>
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {loading ? 'Loading…' : 'Retry'}
          </button>
        </div>
      )}


      {/* Executive Command Center — hero header (owns the payroll group filter) */}
      <HeroHeader
        filter={<GroupFilter value={groupFilter} onChange={setGroupFilter} />}
        greeting={`${greetingForHour()}, ${profile?.first_name || 'Administrator'}`}
        date={new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        title={data.currentPeriod
          ? `The ${data.currentPeriod.period_name} payroll cycle is ${(data.currentPeriod.status || 'active').toUpperCase()}. ${data.pendingCount > 0 ? `${data.pendingCount.toLocaleString()} entries awaiting approval.` : 'All entries processed — ready for release.'}`
          : 'No active payroll cycle — open the Payroll workspace to start one.'}
        liveLabel={data.currentPeriod ? `Cycle ${(data.currentPeriod.status || 'open').toUpperCase()}` : 'STANDBY'}
        liveTone={data.currentPeriod?.status === 'open' ? 'green' : data.currentPeriod?.status === 'draft' ? 'amber' : 'blue'}
        chips={[
          { icon: UserCog, label: ROLE_LABELS[role] ?? 'User' },
          { icon: Sparkles, label: data.unassignedCount > 0 ? `AI flagged ${data.unassignedCount} issue${data.unassignedCount === 1 ? '' : 's'}` : 'AI scan clean' },
        ]}
        metric={data.currentPeriod ? { label: 'Net Pay This Period', value: currency(data.periodNet) } : undefined}
        actions={[
          { label: 'Run Payroll', icon: Calculator, primary: true, onClick: () => onNavigate('payroll'), },
          { label: 'Reports', icon: FileSpreadsheet, onClick: () => can('reports') && onNavigate('reports'), },
          { label: 'Employees', icon: Users, onClick: () => can('employees') && onNavigate('employees'), },
        ].filter((a) => a.onClick)}
      />

      {/* Floating KPI cards — staggered entrance */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2"
      >
        {kpiCards.map((s) => (
          <KpiCard key={s.label} {...s} />
        ))}
      </motion.div>

      {/* ══ 2-COLUMN LAYOUT: main content + right sidebar ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

      {/* ── LEFT COLUMN (2/3) ── */}
      <div className="lg:col-span-2 space-y-3">

      {/* Payroll Operations Center — workflow timeline */}
      {data.currentPeriod && (
        <PayrollOpsTimeline
          status={data.currentPeriod.status}
          processed={data.processedCount}
          pending={data.pendingCount}
          net={data.periodNet}
          onOpen={() => onNavigate('payroll')}
        />
      )}




      {/* Recent Employees */}
      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Recently Added Employees</h2>
          <button onClick={() => onNavigate('employees')} className="text-xs text-deped-600 dark:text-deped-400 hover:text-deped-700 dark:hover:text-deped-300 font-medium flex items-center gap-1 transition-colors">
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {data.recentEmployees.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-200 dark:text-slate-700" />
            No employees yet. Add your first employee in the Masterfile.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recentEmployees.slice(0, 3).map((e) => {
              const fname = e.fname || e.first_name;
              const lname = e.lname || e.last_name;
              return (
                <div key={e.id} className="px-4 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => onNavigate('employees')}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-deped-400 to-deped-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                      {fname[0]}{lname[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {lname}, {fname}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{e.empno || e.employee_number} · {(() => {
                        const pos = lookupPosition(e.poscode || e.position);
                        return pos ? (pos.position_title || pos.position_name) : (e.poscode || e.position || '—');
                      })()}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular">{currency(e.basic || e.basic_salary)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{e.regcode || '—'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>{/* end left column */}

      {/* ── RIGHT SIDEBAR (1/3) ── */}
      <div className="space-y-3">

      {/* Payroll Groups */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-4 shadow-sm">
        <SectionHeader title="Payroll Groups" icon={School} />
        <div className="space-y-2.5 mt-3">
          {data.groupStats.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-2 py-1.5 -mx-2 transition-colors" onClick={() => onNavigate('employees')}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-deped-50 dark:bg-deped-900/40 text-deped-700 dark:text-deped-300 font-mono font-semibold text-xs shrink-0">
                  {String(g.stacode_min ?? 0).padStart(3, '0')}–{String(g.stacode_max ?? 0).padStart(3, '0')}
                </span>
                <span className="text-slate-600 dark:text-slate-300 truncate">{g.group_name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="tabular font-semibold text-slate-700 dark:text-slate-200 shrink-0 ml-2">{g.count}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-800 font-semibold">
            <span className="text-slate-800 dark:text-slate-100">Total Active</span>
            <span className="tabular text-slate-800 dark:text-slate-100">{data.activeEmployees}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-4 shadow-sm">
        <SectionHeader title="Quick Actions" icon={Zap} />
        <div className="space-y-2 mt-3">
          {quickActions.map((a, i) => (
            <button key={a.label} onClick={() => onNavigate(a.view)} className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group">
              <div className={`w-8 h-8 rounded-lg ${a.color} flex items-center justify-center shrink-0`}>  <a.icon className="w-4 h-4" /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-deped-600 dark:group-hover:text-deped-400 transition-colors">{a.label}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{a.desc}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 ml-auto shrink-0 group-hover:text-deped-500 transition-colors" />
            </button>
          ))}
        </div>
      </div>

      </div>{/* end right sidebar */}
      </div>{/* end 2-column grid */}
    </div>
  );
}

// ── Payroll Operations Center — workflow timeline ──────────────────────────

const PAYROLL_STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'imported', label: 'Imported' },
  { key: 'validated', label: 'Validated' },
  { key: 'calculated', label: 'Calculated' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'approved', label: 'Approved' },
  { key: 'released', label: 'Released' },
  { key: 'archived', label: 'Archived' },
] as const;

function stageIndex(status: string): number {
  const idx = PAYROLL_STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : status === 'open' ? 6 : status === 'closed' ? 7 : 0;
}

function PayrollOpsTimeline({
  status, processed, pending, net, onOpen,
}: {
  status: string; processed: number; pending: number; net: number; onOpen: () => void;
}) {
  const current = stageIndex(status);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      className="nexora-card p-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-nexora-50 dark:bg-nexora-900/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-nexora-600 dark:text-nexora-300" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Payroll Operations Center</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Live workflow status · {status.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> {processed.toLocaleString()} processed
          </span>
          <button
            onClick={onOpen}
            className="text-xs text-nexora-600 dark:text-nexora-300 hover:text-nexora-700 dark:hover:text-nexora-200 font-medium flex items-center gap-1 transition-colors"
          >
            Open Payroll <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0 overflow-x-auto pb-1 -mx-1 px-1">
        {PAYROLL_STAGES.map((stage, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <div key={stage.key} className="flex items-center gap-0 shrink-0">
              <div className="flex flex-col items-center w-[60px]">
                <div className="relative">
                  {isCurrent && (
                    <span className="absolute inset-0 rounded-full bg-nexora-500/30 animate-ripple-ping" />
                  )}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors duration-300 ${
                      done
                        ? 'bg-aurora-500 border-aurora-500 text-white shadow-aurora'
                        : isCurrent
                          ? 'bg-nexora-600 border-nexora-600 text-white shadow-nexora'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {                    done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                </div>
                <span
                  className={`mt-1 text-[9px] font-semibold text-center leading-tight ${
                    isCurrent ? 'text-nexora-600 dark:text-nexora-300' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {i < PAYROLL_STAGES.length - 1 && (
                <div className="w-5 sm:w-8 h-0.5 rounded-full -mt-3.5 relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-500 to-nexora-500"
                    initial={{ width: 0 }}
                    animate={{ width: done || isCurrent ? '100%' : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 + i * 0.05 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {pending > 0
            ? `${pending.toLocaleString()} entries still pending approval in this stage.`
            : 'All entries processed — the cycle is ready for the next stage.'}
        </p>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Net</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular">{currency(net)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Completion</p>
            <p className="text-sm font-bold text-nexora-600 dark:text-nexora-300 tabular">
              {Math.round((processed / Math.max(processed + pending, 1)) * 100)}%
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

function activityMeta(action: string): { label: string; icon: LucideIcon; color: string } {
  const map: Record<string, { label: string; icon: LucideIcon; color: string }> = {
    dbf_smart_sync: { label: 'DBF Smart Import', icon: Database, color: 'bg-deped-100 text-deped-700 dark:bg-deped-900/40 dark:text-deped-300' },
    dbf_restore: { label: 'DBF Restore', icon: HardDriveDownload, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
    gsis_import: { label: 'GSIS Import', icon: Landmark, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    pli_import: { label: 'PLI Import', icon: Upload, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    payroll_run: { label: 'Payroll Processed', icon: Calculator, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    payroll_posted: { label: 'Payroll Posted', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    user_approved: { label: 'User Approved', icon: UserCog, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
    logout: { label: 'User Signed Out', icon: ScrollText, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    auto_logout_inactivity: { label: 'Auto Logout (Inactive)', icon: Clock, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  };
  return map[action] ?? { label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), icon: ScrollText, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
}

/** Map an audit action to the relevant view so recent-activity rows are clickable. */
function activityNavigate(action: string): View | null {
  const map: Record<string, View> = {
    dbf_smart_sync: 'importbackup',
    dbf_restore: 'importbackup',
    gsis_import: 'importbackup',
    pli_import: 'importbackup',
    payroll_run: 'payroll',
    payroll_posted: 'payroll',
    user_approved: 'users',
    user_signup_pending: 'users',
    user_approved_final: 'users',
    mfa_issue: 'audit',
    mfa_verify: 'audit',
  };
  return map[action] ?? null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ── Initial Payroll Summary ──────────────────────────────────────────────────
function InitialPayrollSummary({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { scopedCodes } = useOrg();
  const [stats, setStats] = useState<{ initial: number; ready: number; regular: number } | null>(null);

  useEffect(() => {
    (async () => {
      // Division-scoped counts: REGCODE + DIVCODE are the unique reference for
      // one division's payroll, so a division never sees another division's
      // initial/regular payroll headcount. Unscoped (super admin, "All
      // Divisions") keeps the whole-system figures.
      const scope = codeScope(scopedCodes);
      let base = supabase.from('employees').select('*', { count: 'exact', head: true });
      if (scope.regcode) {
        base = base.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const { count: initial } = await base.eq('payroll_status', 'Initial Payroll');
      const { count: regular } = await base.eq('payroll_status', 'Regular Payroll');
      const { count: ready } = await base
        .eq('payroll_status', 'Initial Payroll')
        .eq('req_appointment_validated', true)
        .eq('req_tin_submitted', true)
        .eq('req_philhealth_submitted', true)
        .eq('req_pagibig_submitted', true)
        .eq('req_atm_submitted', true);
      setStats({
        initial: initial ?? 0,
        ready: ready ?? 0,
        regular: regular ?? 0,
      });
    })();
  }, [scopedCodes]);

  if (!stats) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-600" />
          </div>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Initial Payroll Overview</h3>
        </div>
        <button
          onClick={() => onNavigate('initial_payroll')}
          className="text-xs text-deped-600 dark:text-deped-400 hover:underline font-medium"
        >
          Open Initial Payroll →
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Initial Payroll</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.initial}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Ready for Transfer</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{stats.ready}</p>
        </div>
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">Regular Payroll</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{stats.regular}</p>
        </div>
      </div>
    </div>
  );
}
