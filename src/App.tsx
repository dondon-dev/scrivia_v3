import { useState, useEffect, useRef, Suspense, type FormEvent } from 'react';
import { lazyRetry } from '@/lib/lazyRetry';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wallet, Menu, Moon, Sun, ChevronDown, LogOut, X,
  ShieldCheck, ShieldAlert, Lock, LayoutDashboard, Search, BrainCircuit, Bell,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import ErrorBoundary from '@/components/ErrorBoundary';
import { pageVariants } from '@/lib/motion';
import CommandPalette from '@/components/CommandPalette';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { usePermissions } from '@/lib/permissions';
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/types/auth';
import { supabase, fetchAll } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import { canManageUsers, isSuperAdminRole } from '@/lib/authz';
import { getLockdown, unlockDatabase, activateLockdown, subscribeLockdown, syncLockdownFromDb } from '@/lib/lockdown';
import { findNavItem, findNavItemByViewKey, permissionForView, NAV_SECTIONS, type NavItem, type ViewKey } from '@/lib/navConfig';
import Sidebar from '@/components/Sidebar';
import FlyoutMenu from '@/components/FlyoutMenu';
import CalendarPopover from '@/components/CalendarPopover';
import Footer from '@/components/Footer';
// Views are lazy-loaded so the heavy payroll libraries (exceljs, jspdf,
// pdfjs-dist, jszip) are only fetched when the screen that needs them opens.
const Dashboard = lazyRetry(() => import('@/views/Dashboard'));
const Employees = lazyRetry(() => import('@/views/Employees'));
const Payroll = lazyRetry(() => import('@/views/Payroll'));
const Reports = lazyRetry(() => import('@/views/Reports'));
const SalarySchedule = lazyRetry(() => import('@/views/SalarySchedule'));
const TaxCalculator = lazyRetry(() => import('@/views/TaxCalculator'));
const DeductionMasterfile = lazyRetry(() => import('@/views/DeductionMasterfile'));
const DedfileDbf = lazyRetry(() => import('@/views/DedfileDbf'));
const DeductionEngine = lazyRetry(() => import('@/views/DeductionEngine'));
const UserManagement = lazyRetry(() => import('@/views/UserManagement'));
const AuditLogs = lazyRetry(() => import('@/views/AuditLogs'));
const BackupRestore = lazyRetry(() => import('@/views/BackupRestore'));
const RestoreData = lazyRetry(() => import('@/views/RestoreData'));
const SmartImport = lazyRetry(() => import('@/views/SmartImport'));
const ImportBackup = lazyRetry(() => import('@/views/ImportBackup'));
const PliImport = lazyRetry(() => import('@/views/PliImport'));
const GsisImport = lazyRetry(() => import('@/views/GsisImport'));
const InitialPayroll = lazyRetry(() => import('@/views/InitialPayroll'));
const SignatoryManagement = lazyRetry(() => import('@/views/SignatoryManagement'));
const DivisionOffice = lazyRetry(() => import('@/views/DivisionOffice'));
const PositionManagement = lazyRetry(() => import('@/views/PositionManagement'));
const PlantillaPositions = lazyRetry(() => import('@/views/PlantillaPositions'));
const NonPlantillaItems = lazyRetry(() => import('@/views/NonPlantillaItems'));
const NameValidation = lazyRetry(() => import('@/views/NameValidation'));
const CommAllowance = lazyRetry(() => import('@/views/CommAllowance'));
const CreatorProfile = lazyRetry(() => import('@/views/CreatorProfile'));
const MyAccess = lazyRetry(() => import('@/views/MyAccess'));
const RoleDashboard = lazyRetry(() => import('@/views/dashboards/RoleDashboards'));
const RegionsDivisions = lazyRetry(() => import('@/views/RegionsDivisions'));
const AiCommandCenter = lazyRetry(() => import('@/views/AiCommandCenter'));
const OmniDevAi = lazyRetry(() => import('@/views/OmniDevAi'));
const PayrollDefinitions = lazyRetry(() => import('@/views/PayrollDefinitions'));
const Notifications = lazyRetry(() => import('@/views/Notifications'));
const HelpCenter = lazyRetry(() => import('@/views/HelpCenter'));
const GsisDashboard = lazyRetry(() => import('@/views/GsisDashboard'));
const W2TaxAnnual = lazyRetry(() => import('@/views/W2TaxAnnual'));
const GovPayrollCalculator = lazyRetry(() => import('@/views/GovPayrollCalculator'));
const PolicyLibrary = lazyRetry(() => import('@/views/PolicyLibrary'));

// Organization.tsx exposes named exports — map each to a default export for lazyRetry()
const ElementarySchools = lazyRetry(() => import('@/views/Organization').then(m => ({ default: m.ElementarySchools })));
const HighSchools = lazyRetry(() => import('@/views/Organization').then(m => ({ default: m.HighSchools })));
const ImplementingUnits = lazyRetry(() => import('@/views/Organization').then(m => ({ default: m.ImplementingUnits })));
const SchoolDirectory = lazyRetry(() => import('@/views/Organization').then(m => ({ default: m.SchoolDirectory })));

// Tiny / always-needed components stay eager
import ComingSoon from '@/views/ComingSoon';
import Login from '@/views/auth/Login';
import SignUp from '@/views/auth/SignUp';
import MfaVerify from '@/views/auth/MfaVerify';
import ForgotPassword from '@/views/auth/ForgotPassword';
import ResetPassword from '@/views/auth/ResetPassword';
import EmailVerification from '@/views/auth/EmailVerification';
import type { LucideIcon } from 'lucide-react';
import type { PayrollCategory } from '@/lib/categories';

type AuthView = 'login' | 'signup' | 'forgot' | 'verify' | 'reset';

interface ActiveView {
  navId: string;
  viewKey: ViewKey;
  label: string;
  icon: LucideIcon;
  category: PayrollCategory | null;
  /** Deep-link target tab inside the destination view (e.g. a Reports tab). */
  tab?: string;
}

function roleBadge(role: UserRole): string {
  return ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

// Shown while a lazy-loaded view chunk is being fetched
function ViewLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <ScriviaLogo className="w-10 h-10 animate-pulse mb-3" />
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading view...</span>
    </div>
  );
}

// Shown when a user somehow reaches a view their role has no permission for.
// The render-time guard in renderContent() ensures unauthorized content never
// mounts — this is the friendly screen for the brief moment before the app
// auto-returns them to the dashboard.
function AccessDenied({ label, onGoHome }: { label: string; onGoHome: () => void }) {
  return (
    <div className="max-w-md mx-auto py-16 text-center animate-fade-in">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8 text-rose-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Access Denied</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Your role does not include permission to open “{label}”.
        If you believe this is a mistake, contact your system administrator.
      </p>
      <button
        onClick={onGoHome}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 transition-colors"
      >
        <LayoutDashboard className="w-4 h-4" />
        Go to Dashboard
      </button>
    </div>
  );
}

export default function App() {
  const { user, profile, loading, needsMfa, signOut } = useAuth();
  const { mode, toggle: toggleTheme } = useTheme();
  const { hasPermission: canAccess } = usePermissions();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [activeView, setActiveView] = useState<ActiveView>({
    navId: 'dash_overview', viewKey: 'dashboard', label: 'Dashboard',
    icon: Wallet, category: null,
  });

  const [stacodeBadge, setStacodeBadge] = useState(0);
  const [pendingEmpId, setPendingEmpId] = useState<string | null>(null);  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [hoveredSectionTop, setHoveredSectionTop] = useState(0);
  const [notifFlyoutOpen, setNotifFlyoutOpen] = useState(false);
  const notifLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSectionHover(sectionId: string | null, top?: number) {
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    if (sectionId) {
      setHoveredSection(sectionId);
      if (top !== undefined) setHoveredSectionTop(top);
    } else {
      // Delay before closing so user can move to flyout
      hoverLeaveTimer.current = setTimeout(() => setHoveredSection(null), 300);
    }
  }

  function handleFlyoutCancelHover() {
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
  }
  const [lockdown, setLockdown] = useState(getLockdown());
  const [unlockKey, setUnlockKey] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('reset') || hash.includes('type=recovery')) setAuthView('reset');
    else if (hash.includes('verify') || hash.includes('type=signup') || hash.includes('type=invite')) setAuthView('verify');
  }, []);

  const { scopedCodes } = useOrg();

  useEffect(() => {
    if (!user || !profile) return;
    let active = true;
    (async () => {
      const scope = codeScope(scopedCodes);
      let empQuery = supabase.from('employees').select('stacode').eq('status', 'Active');
      if (scope.regcode) {
        empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const emp = await fetchAll<{ stacode: string | null }>(() => empQuery);
      const grp = await fetchAll<{ id: string; group_code: string; group_name: string; stacode_min: number | null; stacode_max: number | null; status: string }>(() => supabase.from('payroll_groups').select('id,group_code,group_name,stacode_min,stacode_max,status').eq('status', 'Active'));
      const groups = grp;
      const invalid = emp.filter((e) => {
        const s = e.stacode;
        if (!s || !s.trim() || !/^\d+$/.test(s.trim())) return true;
        const n = parseInt(s.trim(), 10);
        return !groups.some((g) => g.stacode_min !== null && g.stacode_max !== null && n >= g.stacode_min && n <= g.stacode_max);
      });
      if (active) setStacodeBadge(invalid.length);
    })();
    return () => { active = false; };
  }, [activeView, user, profile, scopedCodes]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [activeView]);

  // Lockdown: subscribe to changes + pull the persisted state on sign-in.
  useEffect(() => subscribeLockdown(() => {
    setLockdown(getLockdown());
    setUnlockError(null);
  }), []);

  useEffect(() => {
    if (user) void syncLockdownFromDb();
  }, [user]);

  // Permission guard: redirect to dashboard if user can't access current view.
  // Uses the DB-merged permission matrix, so a super_admin revoking a
  // permission kicks that user out of the screen on the next change.
  useEffect(() => {
    if (!profile) return;
    const item = findNavItem(activeView.navId);
    if (item && !canAccess(item.permission)) {
      handleNavigate('dash_overview', null);
    }
  }, [profile, activeView, canAccess]);

  function handleNavigate(navId: string, cat: PayrollCategory | null) {
    // Direct viewKey shortcuts (e.g. AiCommandCenter's 'Ask Copilot' button)
    if (navId === 'ai_omnidev') {
      setActiveView({ navId: 'ai_omnidev', viewKey: 'omnidev_ai', label: 'Payroll Copilot', icon: BrainCircuit, category: cat });
      return;
    }
    // First try matching by nav ID, then fall back to matching by viewKey
    const item = findNavItem(navId) ?? findNavItemByViewKey(navId);
    if (!item) {
      setActiveView({ navId, viewKey: 'dashboard', label: 'Dashboard', icon: Wallet, category: cat });
      return;
    }
    setActiveView({
      navId: item.id,
      viewKey: item.viewKey ?? 'coming_soon',
      label: item.label,
      icon: item.icon,
      category: cat,
      tab: item.tab,
    });
  }

  function handleNavItemClick(item: NavItem, cat: PayrollCategory | null) {
    handleNavigate(item.id, cat);
  }

  function handleUnlockSubmit(e: FormEvent) {
    e.preventDefault();
    const res = unlockDatabase(unlockKey);
    if (!res.ok) {
      setUnlockError(res.error);
    } else {
      setUnlockKey('');
      setUnlockError(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
          <ScriviaLogo className="w-10 h-10 animate-pulse" />
          <span className="text-sm font-medium">Loading SCRIVIA Cloud™…</span>
        </div>
      </div>
    );
  }

  if (needsMfa) {
    return <MfaVerify onSwitch={setAuthView} />;
  }

  // Show the verify/reset screens even when a session exists: a confirmation
  // link or recovery link creates a session, and the user must still see the
  // "Email Verified!" / password reset screen instead of flashing the app.
  if (!user || !profile || authView === 'verify' || authView === 'reset') {
    const authScreen = (() => {
      switch (authView) {
        case 'signup': return <SignUp onSwitch={setAuthView} />;
        case 'forgot': return <ForgotPassword onSwitch={setAuthView} />;
        case 'verify': return <EmailVerification onSwitch={setAuthView} />;
        case 'reset': return <ResetPassword onSwitch={setAuthView} />;
        default: return <Login onSwitch={setAuthView} />;
      }
    })();
    return (
      <div className="auth-container min-h-screen flex flex-col relative overflow-hidden">
        {/* Premium SCRIVIA aurora backdrop — layered mesh gradients with a
            center vignette so the auth card always stays crisp and focused. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {/* Deep navy base wash */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,#101c3f_0%,#070c1d_55%,#04060f_100%)]" />
          {/* Aurora mesh blobs — teal, electric blue, violet, heavily blurred */}
          <div className="absolute -top-44 -left-32 w-[44rem] h-[44rem] rounded-full bg-[#14d9b0]/[0.15] blur-[110px] animate-aurora-shift" />
          <div className="absolute top-1/4 -right-44 w-[48rem] h-[48rem] rounded-full bg-[#2563eb]/[0.20] blur-[120px] animate-aurora-shift" style={{ animationDelay: '-4s' }} />
          <div className="absolute -bottom-52 left-1/4 w-[42rem] h-[42rem] rounded-full bg-[#7c3aed]/[0.12] blur-[130px] animate-aurora-shift" style={{ animationDelay: '-8s' }} />
          <div className="absolute top-12 right-1/3 w-80 h-80 rounded-full bg-[#63b3ff]/[0.12] blur-[90px] animate-pulse-soft" />
          {/* Soft organic light diffusion */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(20,217,176,0.06),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_100%,rgba(37,99,235,0.09),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(124,58,237,0.05),transparent_50%)]" />
          {/* Center vignette — darkens behind the card for focus */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_56%_at_50%_46%,transparent_0%,rgba(4,6,15,0.55)_62%,rgba(3,5,12,0.88)_100%)]" />
          {/* Subtle top/bottom depth */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="flex-1 flex items-center justify-center relative">
          {authScreen}
        </div>
        <Footer variant="auth" />
      </div>
    );
  }

  const { navId, viewKey, tab: viewTab, label: viewLabel, icon: viewIcon } = activeView;
  const ViewIcon = viewIcon;
  const isEss = profile.role === 'ess';
  void isEss;
  // Narrowed alias for use inside nested functions (TS keeps the outer guard's
  // narrowing only in the same scope, not across function boundaries).
  const authedProfile = profile;

  // Render the actual view content. Render-time guard: unauthorized views
  // never mount (defense in depth — the sidebar already hides them).
  function renderContent() {
    if (!canAccess(permissionForView(viewKey))) {
      return <AccessDenied label={viewLabel} onGoHome={() => handleNavigate('dash_overview', null)} />;
    }
    switch (viewKey) {
      case 'dashboard':
        // Full operations dashboard for admin roles; a tailored role-specific
        // dashboard for everyone else (keeps the heavy Dashboard chunk lazy).
        return isSuperAdminRole(authedProfile.role) || authedProfile.role === 'payroll_admin'
          ? <Dashboard onNavigate={(v) => handleNavigate(v, null)} profile={authedProfile} />
          : <RoleDashboard role={authedProfile.role} profile={authedProfile} onNavigate={(v) => handleNavigate(v, null)} />;
      case 'employees': return <Employees highlightEmpId={pendingEmpId} onConsumedHighlight={() => setPendingEmpId(null)} profile={profile} />;
      case 'salary': return <SalarySchedule />;
      case 'dedmaster': return <DeductionMasterfile />;
      case 'dedfile': return <DedfileDbf />;
      case 'dedengine': return <DeductionEngine />;
      case 'payroll': return <Payroll profile={profile} />;
      case 'initial_payroll': return <InitialPayroll profile={profile} />;
      case 'signatories': return <SignatoryManagement />;
      case 'taxcalc': return <TaxCalculator />;
      case 'reports': return <Reports profile={profile} initialTab={viewTab as 'exports' | 'payrollHistory' | 'payrollRegister' | 'deductionSummary' | 'loanLedger' | 'nthp' | 'undeducted' | 'gsis' | 'philhealth' | 'pagibig' | 'salarySummary' | 'netPaySummary' | 'unassigned' | 'overpayment' | 'bankAdvice' | 'payslip' | 'w2' | undefined} />;
      case 'users': return <UserManagement initialTab={viewTab as 'all' | 'pending_approval' | 'approved' | 'rejected' | 'disabled' | undefined} />;
      case 'audit': return <AuditLogs />;
      case 'backup': return <BackupRestore />;
      case 'restore': return <RestoreData />;
      case 'smartimport': return <SmartImport />;
      case 'importbackup': return <ImportBackup />;
      case 'pliimport': return <PliImport />;
      case 'gsisimport': return <GsisImport />;
      case 'creator': return <CreatorProfile />;
      case 'org_elementary': return <ElementarySchools />;
      case 'org_highschool': return <HighSchools />;
      case 'org_units': return <ImplementingUnits />;
      case 'org_division': return <DivisionOffice />;
      case 'org_regions': return <RegionsDivisions onNavigate={(v) => handleNavigate(v, null)} />;
      case 'org_directory': return <SchoolDirectory />;
      case 'positionmgmt': return <PositionManagement initialTab="positions" />;
      case 'positionimport': return <PositionManagement initialTab="import" />;
      case 'plantilla': return <PlantillaPositions />;
      case 'nonplantilla': return <NonPlantillaItems />;
      case 'namevalidation': return <NameValidation />;
      case 'ca_dashboard': return <CommAllowance profile={profile} />;
      case 'my_access': return <MyAccess />;
      case 'ai_center': return <AiCommandCenter onNavigate={(v) => handleNavigate(v, null)} />;
      case 'omnidev_ai': return <OmniDevAi />;
      case 'payroll_defs': return <PayrollDefinitions />;
      case 'notifications': return <Notifications initialTab={viewTab as 'activity' | 'alerts' | 'tasks' | 'system' | undefined} onNavigate={(v) => handleNavigate(v, null)} />;
      case 'help': return <HelpCenter initialTab={viewTab as 'guide' | 'docs' | 'faqs' | 'contact' | undefined} />;
      case 'govt_gsis': return <GsisDashboard />;
      case 'govt_w2': return <W2TaxAnnual />;
      case 'govt_calculator': return <GovPayrollCalculator />;
      case 'policy_library': return <PolicyLibrary />;
      case 'coming_soon': return <ComingSoon title={viewLabel} icon={viewIcon} />;
      default: return <ComingSoon title={viewLabel} icon={viewIcon} />;
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex">
      {/* Sidebar */}
      <Sidebar
        profile={profile}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        activeNavId={navId}
        activeViewKey={viewKey}
        globalCategory={null}
        stacodeBadge={stacodeBadge}
        onNavigate={handleNavItemClick}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onCloseMobile={() => setMobileOpen(false)}
        onSignOut={signOut}
        onHoverSection={handleSectionHover}
      />

      {/* Flyout submenu — fixed overlay, positioned at parent item's Y */}
      {hoveredSection && (
        <FlyoutMenu
          section={NAV_SECTIONS.find((s) => s.id === hoveredSection)!}
          activeNavId={navId}
          top={hoveredSectionTop}
          collapsed={sidebarCollapsed}
          onNavigate={(item) => { setHoveredSection(null); handleNavItemClick(item, null); }}
          onMouseEnter={handleFlyoutCancelHover}
          onMouseLeave={() => handleSectionHover(null)}
        />
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 shrink-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
            <div className="flex items-center gap-2">
              {(() => { const ViewIcon = activeView.icon; return <ViewIcon className="w-5 h-5 text-deped-600 dark:text-deped-400" />; })()}
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 hidden sm:block">{activeView.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors group"
              aria-label="Open command palette"
            >
              <Search className="w-4 h-4" />
              <span className="hidden lg:block text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-500">Search…</span>
              <kbd className="hidden lg:flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-400 border border-slate-200 dark:border-slate-600">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {mode === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <div
              className="relative"
              onMouseEnter={() => {
                if (notifLeaveTimer.current) clearTimeout(notifLeaveTimer.current);
                setNotifFlyoutOpen(true);
              }}
              onMouseLeave={() => {
                notifLeaveTimer.current = setTimeout(() => setNotifFlyoutOpen(false), 250);
              }}
            >
              <button
                onClick={() => {
                  const notifItem = findNavItem('notif_notifications');
                  if (notifItem) {
                    setActiveView({
                      navId: notifItem.id,
                      viewKey: notifItem.viewKey ?? 'notifications',
                      label: notifItem.label,
                      icon: notifItem.icon,
                      category: null,
                      tab: notifItem.tab,
                    });
                  }
                  setNotifFlyoutOpen(false);
                }}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
              </button>

              {/* Notifications flyout */}
              {notifFlyoutOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
                  onMouseEnter={() => { if (notifLeaveTimer.current) clearTimeout(notifLeaveTimer.current); }}
                  onMouseLeave={() => { notifLeaveTimer.current = setTimeout(() => setNotifFlyoutOpen(false), 250); }}
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notifications</p>
                  </div>
                  <div className="py-1">
                    {[
                      { id: 'notif_announcements', label: 'Announcements', icon: '📢' },
                      { id: 'notif_notifications', label: 'Notifications', icon: '🔔' },
                      { id: 'notif_tasks', label: 'Tasks', icon: '📋' },
                      { id: 'notif_alerts', label: 'Alerts', icon: '⚠️' },
                    ].map((item) => {
                      const navItem = findNavItem(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (navItem) {
                              setActiveView({
                                navId: navItem.id,
                                viewKey: navItem.viewKey ?? 'notifications',
                                label: navItem.label,
                                icon: navItem.icon,
                                category: null,
                                tab: navItem.tab,
                              });
                            }
                            setNotifFlyoutOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-white transition-colors text-left"
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {canManageUsers(profile.role) && (
              <button
                onClick={() => {
                  if (window.confirm('Lock the database now? All uploads, imports and syncs will be blocked until it is unlocked with the master key.')) {
                    activateLockdown('Locked manually by an administrator.');
                  }
                }}
                className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                aria-label="Emergency lockdown"
                title="Emergency lockdown — block all uploads and imports"
              >
                <Lock className="w-5 h-5" />
              </button>
            )}

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-deped-500 to-deped-700 flex items-center justify-center text-white font-semibold text-xs">
                  {profile.first_name?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase()}
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-40 overflow-hidden animate-fade-in">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{profile.first_name} {profile.last_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
                      <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded text-[10px] font-medium border bg-deped-100 dark:bg-deped-900/40 text-deped-700 dark:text-deped-300">
                        {ROLE_LABELS[profile.role]}
                      </span>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-slate-400" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Emergency lockdown banner */}
        {lockdown.locked && (
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-wide uppercase">🔒 System Locked — uploads, imports &amp; syncs are disabled</p>
                  <p className="text-xs text-red-100 mt-0.5 truncate">
                    {lockdown.reason ?? 'Emergency lockdown active'}
                    {lockdown.at ? ` · ${new Date(lockdown.at).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
              <form onSubmit={handleUnlockSubmit} className="flex items-center gap-2">
                <input
                  type="password"
                  value={unlockKey}
                  onChange={(e) => setUnlockKey(e.target.value)}
                  placeholder="Enter master unlock key"
                  className="w-52 px-3 py-1.5 rounded-lg bg-white/15 border border-white/30 text-sm text-white placeholder-red-100/70 outline-none focus:ring-2 focus:ring-white/50 font-mono"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors"
                >
                  Unlock
                </button>
              </form>
            </div>
            {unlockError && (
              <p className="max-w-7xl mx-auto px-4 lg:px-8 pb-2 text-xs font-medium text-red-100">{unlockError}</p>
            )}
          </div>
        )}

        {/* Content — page transitions (fade-up 0.4s easeOut on every view change) */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto overflow-x-hidden bg-slate-100 dark:bg-[#0B1220] bg-[radial-gradient(ellipse_at_top,rgba(15,76,255,0.045),transparent_55%)]">
          <div className={`mx-auto ${viewKey === 'creator' ? 'max-w-full px-0' : 'max-w-7xl'}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={viewKey}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Suspense fallback={<ViewLoader />}>
                  <ErrorBoundary key={viewLabel} label={viewLabel}>
                    {renderContent()}
                  </ErrorBoundary>
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <Footer onShowCreator={() => handleNavigate('creator', null)} />
      </div>

      {/* Global command palette — ⌘K / Ctrl+K */}
      <CommandPalette
        profile={profile}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={(navId) => handleNavigate(navId, null)}
      />
    </div>
  );
}

