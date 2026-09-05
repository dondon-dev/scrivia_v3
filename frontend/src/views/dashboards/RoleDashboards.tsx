import { useState, useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Calculator, Wallet, Clock, Landmark, ShieldCheck, ShieldAlert,
  ChevronRight, School, FileSpreadsheet, Database, HardDriveDownload,
  ScrollText, Award, Table2, Building2, Upload, Receipt, BarChart3,
  FileBarChart2, CheckCircle2, FileCheck2, Search, Info, Building, MapPin,
  Sparkles, Brain, type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/pb';
import { currency } from '@/lib/reports';
import { usePositions } from '@/lib/usePositions';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import { usePermissions } from '@/lib/permissions';
import { useOrg } from '@/lib/org';
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, type UserProfile, type UserRole,
} from '@/types/auth';
import type { PayPeriod, PayrollGroup } from '@/types/payroll';
import { staggerContainer, sparkSeries } from '@/lib/motion';
import { KpiCard, QuickAction, SectionHeader, EmptyState, ProgressBar, HeroHeader } from '@/components/Enterprise';
import EssDashboard from '@/views/EssDashboard';

/**
 * Role-specific dashboards.
 *
 * App.tsx routes super_admin / payroll_admin to the full operations Dashboard
 * directly; this module covers every other role:
 *   - ess                  → the self-service portal (EssDashboard)
 *   - everything else      → a tailored dashboard below
 *
 * All sections are gated with the DB-merged permission matrix (`can()`), so a
 * Super Admin revoking a permission instantly hides the related tiles here too.
 */

type NavView = string;

interface RoleDashboardProps {
  role: UserRole;
  profile: UserProfile;
  onNavigate: (view: NavView) => void;
}

export default function RoleDashboard({ role, profile, onNavigate }: RoleDashboardProps) {
  if (role === 'ess') return <EssDashboard profile={profile} />;
  switch (role) {
    case 'payroll_processor': return <ProcessorDashboard profile={profile} onNavigate={onNavigate} />;
    case 'accounting_officer': return <AccountingDashboard profile={profile} onNavigate={onNavigate} />;
    case 'hr_administrator': return <HrDashboard profile={profile} onNavigate={onNavigate} />;
    case 'school_coordinator':
    case 'school_head': return <SchoolDashboard profile={profile} onNavigate={onNavigate} />;
    case 'division_finance': return <FinanceDashboard profile={profile} onNavigate={onNavigate} />;
    case 'auditor': return <AuditorDashboard profile={profile} onNavigate={onNavigate} />;
    case 'read_only': return <ReadOnlyDashboard profile={profile} onNavigate={onNavigate} />;
    default: return <ReadOnlyDashboard profile={profile} onNavigate={onNavigate} />;
  }
}

// ── Shared data hook ────────────────────────────────────────────────────────

interface DashboardStats {
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
    poscode: string; position: string; regcode: string;
    basic: number; basic_salary: number;
  }[];
}

function useDashboardStats() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: c, error } = await supabase
        .from('dashboard_stats_cache')
        .select('*')
        .single();
      if (!active) return;
      if (error || !c) {
        setLoading(false);
        return;
      }
      setData({
        totalRecords: c.total_records,
        activeEmployees: c.active_employees,
        totalGross: Number(c.total_gross),
        totalNet: Number(c.total_net),
        totalMandatory: Number(c.total_mandatory),
        totalLoanDeds: Number(c.total_loan_deds),
        processedCount: c.processed_count,
        pendingCount: c.pending_count,
        currentPeriod: c.current_period ?? null,
        periodNet: Number(c.period_net),
        groupStats: (() => { if (Array.isArray(c.group_stats)) return c.group_stats; if (typeof c.group_stats === 'string') try { return JSON.parse(c.group_stats); } catch {} return []; })(),
        unassignedCount: c.unassigned_count,
        activeLoanAccounts: c.active_loan_accounts,
        dedTotalsByCode: (() => { if (Array.isArray(c.ded_totals_by_code)) return c.ded_totals_by_code; if (typeof c.ded_totals_by_code === 'string') try { return JSON.parse(c.ded_totals_by_code); } catch {} return []; })(),
        recentEmployees: (() => { if (Array.isArray(c.recent_employees)) return c.recent_employees; if (typeof c.recent_employees === 'string') try { return JSON.parse(c.recent_employees); } catch {} return []; })(),
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { data, loading };
}

// ── Shared layout pieces ────────────────────────────────────────────────────

function RolePage({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function StatsLoader() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="kpi-card animate-pulse h-28" />
      ))}
    </div>
  );
}

function RoleGreeting({ role, profile, onNavigate }: { role: UserRole; profile: UserProfile; onNavigate?: (v: NavView) => void }) {
  const { selectedRegion, selectedDivision, scoped } = useOrg();
  const { hasPermission: can } = usePermissions();
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  })();
  const actions = [
    { label: 'Reports', icon: FileSpreadsheet, primary: false as const, onClick: () => onNavigate?.('reports') },
    { label: 'Employees', icon: Users, primary: false as const, onClick: () => onNavigate?.('employees') },
  ].filter((a) => can(a.label === 'Reports' ? 'reports' : 'employees'));
  return (
    <HeroHeader
      greeting={`${greeting}, ${profile.first_name || 'Colleague'}`}
      title={ROLE_DESCRIPTIONS[role]}
      date={new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      liveLabel={ROLE_LABELS[role]}
      liveTone="blue"
      chips={[
        { icon: MapPin, label: selectedRegion?.region_name ?? 'All Regions' },
        { icon: Building, label: selectedDivision?.division_name ?? (scoped ? 'Selected Division' : 'All Divisions') },
      ]}
      actions={actions}
    />
  );
}

/** Wraps a KPI grid in the stagger container so cards fade up 0.05s apart. */
function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {children}
    </motion.div>
  );
}

function ReadOnlyBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4">
      <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
        <Info className="w-5 h-5" />
      </div>
      <div className="text-sm">
        <p className="font-semibold text-slate-700 dark:text-slate-200">Read-Only Access</p>
        <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-xs leading-relaxed">
          Your account can view reports and records, but cannot create, edit, or delete data.
          Contact your system administrator if you need write access.
        </p>
      </div>
    </div>
  );
}

function CurrentPeriodChip({ period, net }: { period: PayPeriod; net: number }) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-deped-800 via-deped-700 to-deped-600 p-5 text-white shadow-premium relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 -mr-12 -mt-12 rounded-full bg-white/5" />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-deped-100" />
          </div>
          <div>
            <p className="text-xs text-deped-200 font-medium uppercase tracking-wider">Current Pay Period</p>
            <p className="text-lg font-bold mt-0.5">{period.period_name}</p>
            <p className="text-xs text-deped-200 mt-0.5">
              {period.start_date} → {period.end_date} · Pay date: {period.pay_date || 'TBD'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-xs text-deped-200">Net Pay This Period</p>
            <p className="text-2xl font-bold tabular text-white">{currency(net)}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            period.status === 'open' ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' :
            period.status === 'draft' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30' :
            'bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30'
          }`}>
            {period.status.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ActionDef {
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  view: NavView;
  show: boolean;
}

function QuickActions({ actions, onNavigate }: { actions: ActionDef[]; onNavigate: (v: NavView) => void }) {
  const visible = actions.filter((a) => a.show);
  if (visible.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {visible.slice(0, 8).map((a, i) => (
          <QuickAction key={a.label} label={a.label} desc={a.desc} icon={a.icon} color={a.color} onClick={() => onNavigate(a.view)} delay={i * 50} />
        ))}
      </div>
    </div>
  );
}

function DeductionBars({ totals, onNavigate }: { totals: DashboardStats['dedTotalsByCode']; onNavigate: (v: NavView) => void }) {
  if (totals.length === 0) return null;
  const max = Math.max(...totals.map((d) => d.total), 1);
  return (
    <div className="card-base p-5">
      <SectionHeader
        title="Deduction Totals by Code"
        icon={BarChart3}
        action={
          <button onClick={() => onNavigate('reports')} className="text-xs text-deped-600 dark:text-deped-400 hover:text-deped-700 dark:hover:text-deped-300 font-medium flex items-center gap-1 transition-colors">
            Full Report <ChevronRight className="w-3 h-3" />
          </button>
        }
      />
      <div className="space-y-3">
        {totals.slice(0, 8).map((d) => (
          <div key={d.code}>
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-deped-50 dark:bg-deped-900/40 text-deped-700 dark:text-deped-300 font-mono font-semibold text-xs shrink-0">{d.code}</span>
                <span className="text-slate-600 dark:text-slate-300 truncate">{d.name}</span>
              </div>
              <span className="tabular font-semibold text-slate-700 dark:text-slate-200 shrink-0 ml-2">{currency(d.total)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-deped-400 to-deped-600 transition-all duration-500"
                style={{ width: `${(d.total / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Payroll Processor ───────────────────────────────────────────────────────

function ProcessorDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();
  const [uploadStats, setUploadStats] = useState<{ today: number; added: number; failed: number } | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const [g, p] = await Promise.all([
        supabase.from('gsis_import_logs').select('new_deductions,updated_deductions,failed_records').gte('created_at', todayStart),
        supabase.from('pli_import_logs').select('new_deductions,updated_deductions,terminated_deductions,failed_records').gte('created_at', todayStart),
      ]);
      if (g.error || p.error) return;
      const gRows = (g.data ?? []) as { new_deductions: number; updated_deductions: number; failed_records: number }[];
      const pRows = (p.data ?? []) as { new_deductions: number; updated_deductions: number; terminated_deductions: number; failed_records: number }[];
      setUploadStats({
        today: (g.data?.length ?? 0) + (p.data?.length ?? 0),
        added: gRows.reduce((s, r) => s + (r.new_deductions ?? 0), 0) + pRows.reduce((s, r) => s + (r.new_deductions ?? 0), 0),
        failed: gRows.reduce((s, r) => s + (r.failed_records ?? 0), 0) + pRows.reduce((s, r) => s + (r.failed_records ?? 0), 0),
      });
    })();
  }, []);

  return (
    <RolePage>
      <RoleGreeting role="payroll_processor" profile={profile} onNavigate={onNavigate} />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Active Employees" value={data.activeEmployees.toLocaleString()} raw={data.activeEmployees} icon={Users} accent="blue" sublabel={`${data.totalRecords} total records`} spark={sparkSeries('processor-employees')} onClick={() => onNavigate('employees')} />
            <KpiCard label="Monthly Payroll" value={currency(data.totalGross)} raw={data.totalGross} format={(n) => currency(n)} icon={Wallet} accent="emerald" sublabel="Gross this period" spark={sparkSeries('processor-payroll')} />
            <KpiCard label="Pending Approvals" value={data.pendingCount.toLocaleString()} raw={data.pendingCount} icon={Clock} accent="amber" sublabel="Awaiting posting" spark={sparkSeries('processor-pending')} onClick={() => onNavigate('payroll')} />
            <KpiCard label="Active Loans" value={data.activeLoanAccounts.toLocaleString()} raw={data.activeLoanAccounts} icon={Landmark} accent="rose" sublabel={`${currency(data.totalLoanDeds)} deductions`} spark={sparkSeries('processor-loans')} onClick={() => onNavigate('dedmaster')} />
          </KpiGrid>

          {data.currentPeriod && <CurrentPeriodChip period={data.currentPeriod} net={data.periodNet} />}

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Run Payroll', desc: 'Process a pay period', icon: Calculator, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', view: 'payroll', show: can('payroll') },
              { label: 'Smart Import', desc: 'Sync DBF files (10 tables)', icon: Database, color: 'bg-deped-100 text-deped-700 dark:bg-deped-900/40 dark:text-deped-300', view: 'smartimport', show: can('dbf_restore') },
              { label: 'DBF Import Center', desc: 'Restore legacy DBF data', icon: HardDriveDownload, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', view: 'restore', show: can('dbf_restore') },
              { label: 'Deduction Masterfile', desc: 'Other deductions records', icon: Table2, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', view: 'dedmaster', show: can('dedmaster') },
              { label: 'CA Payroll', desc: 'Communication allowance', icon: Receipt, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'ca_dashboard', show: can('comm_allowance') },
              { label: 'STACODE Validation', desc: 'Check & correct invalid', icon: ShieldAlert, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', view: 'stacode', show: can('stacode') },
              { label: 'SCRIVIA Intelligence', desc: 'Auto-detected payroll exceptions', icon: Brain, color: 'bg-aurora-100 text-aurora-700 dark:bg-aurora-900/40 dark:text-aurora-300', view: 'ai_center', show: can('dashboard') },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DeductionBars totals={data.dedTotalsByCode} onNavigate={onNavigate} />
            <div className="card-base p-5">
              <SectionHeader title="Today's Imports" icon={Upload} />
              {uploadStats ? (
                <div className="grid grid-cols-3 gap-4">
                  <Tile label="Uploads" value={uploadStats.today} />
                  <Tile label="Newly Added" value={uploadStats.added} color="text-emerald-600 dark:text-emerald-400" />
                  <Tile label="Failed" value={uploadStats.failed} color={uploadStats.failed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-slate-600'} />
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">Import activity will appear here.</p>
              )}
              <div className="mt-5">
                <SectionHeader title="Payroll Progress" icon={CheckCircle2} />
                <div className="space-y-3">
                  <ProgressBar value={data.processedCount} max={Math.max(data.processedCount + data.pendingCount, 1)} label="Processed entries" color="bg-emerald-500" />
                  <ProgressBar value={data.pendingCount} max={Math.max(data.processedCount + data.pendingCount, 1)} label="Pending entries" color="bg-amber-500" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </RolePage>
  );
}

// ── Accounting Officer ──────────────────────────────────────────────────────

function AccountingDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();

  return (
    <RolePage>
      <RoleGreeting role="accounting_officer" profile={profile} onNavigate={onNavigate} />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Total Gross Payroll" value={currency(data.totalGross)} raw={data.totalGross} format={(n) => currency(n)} icon={Wallet} accent="blue" sublabel="All periods" spark={sparkSeries('acct-gross')} />
            <KpiCard label="Total Net Payroll" value={currency(data.totalNet)} raw={data.totalNet} format={(n) => currency(n)} icon={Wallet} accent="emerald" sublabel="All periods" spark={sparkSeries('acct-net')} />
            <KpiCard label="Mandatory Deductions" value={currency(data.totalMandatory)} raw={data.totalMandatory} format={(n) => currency(n)} icon={Calculator} accent="amber" sublabel="GSIS + PhilHealth + Pag-IBIG + W/Tax" spark={sparkSeries('acct-mand')} />
            <KpiCard label="Loan Deductions" value={currency(data.totalLoanDeds)} raw={data.totalLoanDeds} format={(n) => currency(n)} icon={Landmark} accent="rose" sublabel={`${data.activeLoanAccounts} active loan accounts`} spark={sparkSeries('acct-loans')} />
          </KpiGrid>

          {data.currentPeriod && <CurrentPeriodChip period={data.currentPeriod} net={data.periodNet} />}

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Generate Reports', desc: 'Payroll & remittance', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
              { label: 'Employee Records', desc: 'View masterfile', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
              { label: 'CA Payroll', desc: 'Communication allowance', icon: Receipt, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'ca_dashboard', show: can('comm_allowance') },
              { label: 'SCRIVIA Intelligence', desc: 'Auto-detected payroll exceptions', icon: Brain, color: 'bg-aurora-100 text-aurora-700 dark:bg-aurora-900/40 dark:text-aurora-300', view: 'ai_center', show: can('dashboard') },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DeductionBars totals={data.dedTotalsByCode} onNavigate={onNavigate} />
            <div className="card-base p-5">
              <SectionHeader title="Reconciliation Notes" icon={FileBarChart2} />
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                  <span className="text-slate-600 dark:text-slate-300">Gross − Mandatory − Loans</span>
                  <span className="tabular font-semibold text-slate-800 dark:text-slate-100">{currency(data.totalGross - data.totalMandatory - data.totalLoanDeds)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Recorded Net Pay</span>
                  <span className="tabular font-bold text-emerald-700 dark:text-emerald-300">{currency(data.totalNet)}</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
                  Use Reports to generate accounting entries and remittance summaries for GSIS, PhilHealth, Pag-IBIG, and BIR.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </RolePage>
  );
}

// ── HR Administrator ────────────────────────────────────────────────────────

function HrDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();
  const { positions: positionList } = usePositions();
  const { entries: schedEntries, meta: schedMeta } = useSalarySchedule();

  return (
    <RolePage>
      <RoleGreeting role="hr_administrator" profile={profile} onNavigate={onNavigate} />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Active Employees" value={data.activeEmployees.toLocaleString()} raw={data.activeEmployees} icon={Users} accent="blue" sublabel={`${data.totalRecords} total records`} spark={sparkSeries('hr-employees')} onClick={() => onNavigate('employees')} />
            <KpiCard label="Total Positions" value={positionList.length} raw={positionList.length} icon={Award} accent="emerald" sublabel="Position masterfile" spark={sparkSeries('hr-positions')} onClick={() => onNavigate('positionmgmt')} />
            <KpiCard label="Salary Grades" value={schedEntries.length ? new Set(schedEntries.map((e) => e.grade)).size : '—'} icon={Table2} accent="amber" sublabel={schedMeta ? `${schedMeta.tranche} tranche` : 'Salary schedule'} spark={sparkSeries('hr-grades')} onClick={() => onNavigate('salary')} />
            <KpiCard label="Invalid STACODE" value={data.unassignedCount.toLocaleString()} raw={data.unassignedCount} icon={ShieldAlert} accent={data.unassignedCount > 0 ? 'rose' : 'slate'} sublabel={data.unassignedCount > 0 ? 'Needs correction' : 'All valid'} spark={sparkSeries('hr-stacode')} onClick={() => (can('stacode') ? onNavigate('stacode') : onNavigate('employees'))} />
          </KpiGrid>

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Manage Masterfile', desc: 'Add or edit employees', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
              { label: 'Position Management', desc: 'Position codes & titles', icon: Award, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', view: 'positionmgmt', show: can('employees') },
              { label: 'Salary Grade Management', desc: 'Grades, steps & tranches', icon: Table2, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'salary', show: can('salary') },
              { label: 'Name Validation', desc: 'Clean employee names', icon: FileCheck2, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', view: 'namevalidation', show: can('employees') },
              { label: 'SCRIVIA Intelligence', desc: 'Auto-detected payroll exceptions', icon: Brain, color: 'bg-aurora-100 text-aurora-700 dark:bg-aurora-900/40 dark:text-aurora-300', view: 'ai_center', show: can('dashboard') },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card-base p-5">
              <SectionHeader title="Positions by Category" icon={Award} />
              <div className="space-y-3">
                <ProgressBar value={positionList.filter((p) => p.personnel_category === 'Teaching').length} max={Math.max(positionList.length, 1)} label="Teaching" color="bg-emerald-500" />
                <ProgressBar value={positionList.filter((p) => p.personnel_category === 'Teaching Related').length} max={Math.max(positionList.length, 1)} label="Teaching Related" color="bg-blue-500" />
                <ProgressBar value={positionList.filter((p) => p.personnel_category === 'Non-Teaching').length} max={Math.max(positionList.length, 1)} label="Non-Teaching" color="bg-amber-500" />
              </div>
              {schedMeta && (
                <p className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Salary schedule: {schedMeta.tranche} · {schedMeta.circular_no} · Effective {schedMeta.effective_date}
                </p>
              )}
            </div>
            <div className="card-base overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Recently Added Employees</h2>
                <button onClick={() => onNavigate('employees')} className="text-xs text-deped-600 dark:text-deped-400 hover:text-deped-700 dark:hover:text-deped-300 font-medium flex items-center gap-1 transition-colors">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {data.recentEmployees.length === 0 ? (
                <EmptyState icon={Building2} title="No employees yet" message="Add your first employee in the masterfile to see them here." />
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentEmployees.slice(0, 6).map((e) => (
                    <div key={e.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-deped-400 to-deped-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                          {(e.fname || e.first_name || '?')[0]}{(e.lname || e.last_name || '?')[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {(e.lname || e.last_name || '—')}, {e.fname || e.first_name || '—'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{e.empno || e.employee_number || '—'} · {e.poscode || e.position || '—'}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular shrink-0">{currency(e.basic || e.basic_salary)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </RolePage>
  );
}

// ── School Coordinator / School Head ────────────────────────────────────────

function SchoolDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data } = useDashboardStats();
  const { hasPermission: can } = usePermissions();
  const stacode = profile.assigned_stacode?.trim() ?? '';

  const [school, setSchool] = useState<{ school_code: string; school_name: string; address: string; school_head: string; school_type: string; cluster: string } | null>(null);
  const [schoolEmployees, setSchoolEmployees] = useState<{ id: string; empno: string; employee_number: string; fname: string; lname: string; poscode: string; position: string }[] | null>(null);
  const [empCount, setEmpCount] = useState<number | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!stacode) { setLoadingSchool(false); return; }
      const candidates = [...new Set([stacode, stacode.padStart(3, '0'), String(parseInt(stacode, 10) || 0)])].filter(Boolean);
      const [s, e, c] = await Promise.all([
        supabase.from('schools').select('school_code, school_name, address, school_head, school_type, cluster').eq('school_code', stacode).maybeSingle(),
        supabase.from('employees').select('id,empno,employee_number,fname,lname,poscode,position').in('stacode', candidates).eq('status', 'Active').order('created_at', { ascending: false }).limit(6),
        supabase.from('employees').select('id', { count: 'exact', head: true }).in('stacode', candidates).eq('status', 'Active'),
      ]);
      if (!active) return;
      if (!s.error) setSchool(s.data as typeof school);
      if (!e.error) setSchoolEmployees((e.data ?? []) as typeof schoolEmployees);
      if (!c.error) setEmpCount(c.count ?? 0);
      setLoadingSchool(false);
    })();
    return () => { active = false; };
  }, [stacode]);

  return (
    <RolePage>
      <RoleGreeting role={profile.role} profile={profile} onNavigate={onNavigate} />

      {loadingSchool ? (
        <StatsLoader />
      ) : !stacode ? (
        <div className="card-base p-6">
          <EmptyState
            icon={ShieldAlert}
            title="No school assigned"
            message="Your account has not been assigned a school (STACODE). Please contact your system administrator so you can view your school's data."
          />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0">
              <School className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Assigned School · STACODE {stacode}</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{school?.school_name ?? `School ${stacode}`}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {[school?.school_type, school?.cluster, school?.address].filter(Boolean).join(' · ') || 'School details not available'}
              </p>
            </div>
            {school?.school_head && (
              <div className="sm:text-right shrink-0">
                <p className="text-xs text-slate-400 dark:text-slate-500">School Head</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{school.school_head}</p>
              </div>
            )}
          </div>

          <KpiGrid>
            <KpiCard label="Active Employees" value={empCount === null ? '—' : empCount.toLocaleString()} icon={Users} accent="cyan" sublabel={`In ${school?.school_name ?? `school ${stacode}`}`} spark={sparkSeries('school-emp')} onClick={() => onNavigate('employees')} />
            <KpiCard label="Division Employees" value={data ? data.activeEmployees.toLocaleString() : '—'} icon={Building2} accent="blue" sublabel="Division-wide (for context)" spark={sparkSeries('school-div')} />
            <KpiCard label="Invalid STACODE" value={data ? data.unassignedCount.toLocaleString() : '—'} icon={ShieldAlert} accent={data && data.unassignedCount > 0 ? 'rose' : 'slate'} sublabel="Division-wide" spark={sparkSeries('school-stacode')} />
            <KpiCard label="Current Period Net" value={data ? currency(data.periodNet) : '—'} icon={Wallet} accent="emerald" sublabel={data?.currentPeriod?.period_name ?? 'Division payroll'} spark={sparkSeries('school-net')} />
          </KpiGrid>

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'School Employees', desc: 'View assigned school staff', icon: Users, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'employees', show: can('employees') },
              { label: 'Generate Reports', desc: 'Payroll & summary reports', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
            ]}
          />

          <div className="card-base overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Employees in Your School</h2>
              <button onClick={() => onNavigate('employees')} className="text-xs text-deped-600 dark:text-deped-400 hover:text-deped-700 dark:hover:text-deped-300 font-medium flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {schoolEmployees && schoolEmployees.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {schoolEmployees.map((e) => (
                  <div key={e.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                        {(e.fname || '?')[0]}{(e.lname || '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{e.lname}, {e.fname}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{e.empno || e.employee_number || '—'} · {e.poscode || e.position || '—'}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">Active</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="No active employees found" message="No active employees are currently mapped to this school's STACODE." />
            )}
          </div>
        </>
      )}
    </RolePage>
  );
}

// ── Division Finance ────────────────────────────────────────────────────────

function FinanceDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();

  return (
    <RolePage>
      <RoleGreeting role="division_finance" profile={profile} onNavigate={onNavigate} />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Total Gross Payroll" value={currency(data.totalGross)} raw={data.totalGross} format={(n) => currency(n)} icon={Wallet} accent="blue" sublabel="All periods" spark={sparkSeries('fin-gross')} />
            <KpiCard label="Total Net Payroll" value={currency(data.totalNet)} raw={data.totalNet} format={(n) => currency(n)} icon={Wallet} accent="emerald" sublabel="All periods" spark={sparkSeries('fin-net')} />
            <KpiCard label="Mandatory Deductions" value={currency(data.totalMandatory)} raw={data.totalMandatory} format={(n) => currency(n)} icon={Landmark} accent="amber" sublabel="GSIS + PhilHealth + Pag-IBIG + W/Tax" spark={sparkSeries('fin-mand')} />
            <KpiCard label="Loan Deductions" value={currency(data.totalLoanDeds)} raw={data.totalLoanDeds} format={(n) => currency(n)} icon={Receipt} accent="rose" sublabel={`${data.activeLoanAccounts} active loan accounts`} spark={sparkSeries('fin-loans')} />
          </KpiGrid>

          {data.currentPeriod && <CurrentPeriodChip period={data.currentPeriod} net={data.periodNet} />}

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Generate Reports', desc: 'Division-level summaries', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
              { label: 'Employee Records', desc: 'View division staff', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
              { label: 'CA Payroll', desc: 'Communication allowance', icon: Receipt, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'ca_dashboard', show: can('comm_allowance') },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DeductionBars totals={data.dedTotalsByCode} onNavigate={onNavigate} />
            <div className="card-base p-5">
              <SectionHeader title="Division Snapshot" icon={Building2} />
              <div className="space-y-3">
                <ProgressBar value={data.processedCount} max={Math.max(data.processedCount + data.pendingCount, 1)} label="Processed payroll entries" color="bg-emerald-500" />
                <ProgressBar value={data.pendingCount} max={Math.max(data.processedCount + data.pendingCount, 1)} label="Pending approval entries" color="bg-amber-500" />
                <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Active employees</span>
                  <span className="tabular font-semibold text-slate-800 dark:text-slate-100">{data.activeEmployees.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                  <span className="text-amber-700 dark:text-amber-400 font-medium">Invalid STACODE records</span>
                  <span className="tabular font-bold text-amber-700 dark:text-amber-300">{data.unassignedCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </RolePage>
  );
}

// ── Auditor ─────────────────────────────────────────────────────────────────

function AuditorDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();
  const [auditStats, setAuditStats] = useState<{ total: number; recent: { id: string; action: string; user_email: string | null; created_at: string }[] } | null>(null);

  useEffect(() => {
    (async () => {
      const [count, recent] = await Promise.all([
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('id,action,user_email,created_at').order('created_at', { ascending: false }).limit(8),
      ]);
      if (count.error || recent.error) return;
      setAuditStats({
        total: count.count ?? 0,
        recent: (recent.data ?? []) as { id: string; action: string; user_email: string | null; created_at: string }[],
      });
    })();
  }, []);

  return (
    <RolePage>
      <RoleGreeting role="auditor" profile={profile} onNavigate={onNavigate} />
      <ReadOnlyBanner />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Active Employees" value={data.activeEmployees.toLocaleString()} raw={data.activeEmployees} icon={Users} accent="blue" sublabel={`${data.totalRecords} total records`} spark={sparkSeries('aud-employees')} />
            <KpiCard label="Monthly Payroll" value={currency(data.totalGross)} raw={data.totalGross} format={(n) => currency(n)} icon={Wallet} accent="emerald" sublabel="Gross this period" spark={sparkSeries('aud-payroll')} />
            <KpiCard label="Pending Approvals" value={data.pendingCount.toLocaleString()} raw={data.pendingCount} icon={Clock} accent="amber" sublabel="Awaiting posting" spark={sparkSeries('aud-pending')} />
            <KpiCard label="Audit Log Entries" value={auditStats ? auditStats.total.toLocaleString() : '—'} icon={ScrollText} accent="slate" sublabel="System activity trail" spark={sparkSeries('aud-log')} onClick={() => onNavigate('audit')} />
          </KpiGrid>

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Audit Trail', desc: 'View system activity', icon: ScrollText, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', view: 'audit', show: can('audit_logs') },
              { label: 'Generate Reports', desc: 'Compliance & payroll reports', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
              { label: 'Employee Records', desc: 'Review masterfile', icon: Users, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
              { label: 'CA Payroll', desc: 'Communication allowance', icon: Receipt, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'ca_dashboard', show: can('comm_allowance') },
            ]}
          />

          {auditStats && auditStats.recent.length > 0 && (
            <div className="card-base p-5">
              <SectionHeader
                title="Recent System Activity"
                icon={Clock}
                action={
                  can('audit_logs') ? (
                    <button onClick={() => onNavigate('audit')} className="text-xs text-deped-600 dark:text-deped-400 hover:text-deped-700 dark:hover:text-deped-300 font-medium flex items-center gap-1 transition-colors">
                      View All <ChevronRight className="w-3 h-3" />
                    </button>
                  ) : undefined
                }
              />
              <div className="space-y-2.5">
                {auditStats.recent.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{a.action.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{a.user_email ?? 'System'} · {timeAgo(a.created_at)}</p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 ml-3" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </RolePage>
  );
}

// ── Read-Only User ──────────────────────────────────────────────────────────

function ReadOnlyDashboard({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: NavView) => void }) {
  const { data, loading } = useDashboardStats();
  const { hasPermission: can } = usePermissions();

  return (
    <RolePage>
      <RoleGreeting role="read_only" profile={profile} onNavigate={onNavigate} />
      <ReadOnlyBanner />
      {loading || !data ? (
        <StatsLoader />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Active Employees" value={data.activeEmployees.toLocaleString()} raw={data.activeEmployees} icon={Users} accent="blue" sublabel={`${data.totalRecords} total records`} spark={sparkSeries('ro-employees')} />
            <KpiCard label="Monthly Payroll" value={currency(data.totalGross)} raw={data.totalGross} format={(n) => currency(n)} icon={Wallet} accent="emerald" sublabel="Gross this period" spark={sparkSeries('ro-payroll')} />
            <KpiCard label="Pending Approvals" value={data.pendingCount.toLocaleString()} raw={data.pendingCount} icon={Clock} accent="amber" sublabel="Awaiting posting" spark={sparkSeries('ro-pending')} />
            <KpiCard label="Active Loans" value={data.activeLoanAccounts.toLocaleString()} raw={data.activeLoanAccounts} icon={Landmark} accent="rose" sublabel={`${currency(data.totalLoanDeds)} deductions`} spark={sparkSeries('ro-loans')} />
          </KpiGrid>

          {data.currentPeriod && <CurrentPeriodChip period={data.currentPeriod} net={data.periodNet} />}

          <QuickActions
            onNavigate={onNavigate}
            actions={[
              { label: 'Generate Reports', desc: 'View available reports', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', view: 'reports', show: can('reports') },
              { label: 'Employee Records', desc: 'Search & view employees', icon: Search, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', view: 'employees', show: can('employees') },
              { label: 'CA Payroll', desc: 'Communication allowance', icon: Receipt, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', view: 'ca_dashboard', show: can('comm_allowance') },
            ]}
          />
        </>
      )}
    </RolePage>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────────

function Tile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value.toLocaleString()}</p>
    </div>
  );
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
