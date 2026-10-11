import{
  LayoutDashboard, TrendingUp, BarChart3, PieChart, MapPin,
  Building2, School, GraduationCap, Home, Map as MapIcon, Network,
  Users, Contact, Briefcase, BadgeCheck, DollarSign, UserPlus, UserMinus,
  Award, GitBranch, Calculator, FileText, Zap,
  Gift, ArrowUpDown, History, CheckCircle2,
  Send, Lock, Clock, Calendar, Database, HardDriveDownload,
  Download, Landmark, HeartPulse, Receipt, PiggyBank,
  HandCoins, ClipboardList, Upload, Activity, FileBarChart,
  Megaphone, Bell, ListTodo, AlertTriangle, ScrollText, LogIn,
  Shield, Eye, UserCog, KeyRound, Settings, Cog, BookOpen,
  ListTree, HelpCircle, Mail, ShieldAlert, ShieldCheck,
  Cpu, Wallet, FileSpreadsheet, FileCheck2, FileBarChart2, FileSearch, AlertCircle, Building,
  Table2, Sparkles, Brain, BrainCircuit,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/auth';
import { toUserRole } from '@/lib/authz';

export type ViewKey =
  | 'dashboard' | 'employees' | 'payroll' | 'dedfile' | 'deductions' | 'reports'
  | 'salary' | 'dedmaster' | 'dedengine' | 'taxcalc'
  | 'stacode' | 'users' | 'audit' | 'backup' | 'restore'
  | 'smartimport' | 'pliimport' | 'gsisimport' | 'creator' | 'importbackup'
  | 'org_division' | 'org_elementary' | 'org_highschool' | 'org_units' | 'org_directory' | 'org_regions'
  | 'positionmgmt' | 'positionimport' | 'plantilla' | 'nonplantilla'
  | 'namevalidation' | 'initial_payroll' | 'ips_system' | 'signatories' | 'coming_soon'
  | 'plantilla_allocation'
  | 'service_records'
  | 'ca_dashboard' | 'my_access' | 'ai_center' | 'omnidev_ai' | 'payroll_defs' | 'payroll_sheets'
  | 'notifications' | 'help'
  | 'govt_gsis' | 'govt_w2' | 'govt_calculator'
  | 'policy_library'
  | 'emp_movement' | 'emp_newly_hired' | 'emp_separated' | 'inquiry';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  permission: string;
  viewKey?: ViewKey;
  /** Optional sub-screen to open when the item is clicked (deep-links into
   *  tabbed views such as Reports / UserManagement / Notifications / Help). */
  tab?: string;
  badgeKey?: 'stacode';
  /** Roles that must never see this item — even if the permission matrix
   *  grants `permission` (checked with `isNavItemHiddenForRole`, which also
   *  hides items whose *parent section* is hidden for the role). */
  hiddenRoles?: UserRole[];
  /** Inverse of `hiddenRoles`: when set, ONLY these roles see the item. Used for
   *  entries that exist for a single role so they do not widen other menus —
   *  the School Payroll Coordinator's Inclusion / Exclusion / Detailed /
   *  Newly Hired employee lists. */
  onlyRoles?: UserRole[];
}

export interface NavSubGroup {
  id: string;
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  subGroups?: NavSubGroup[];
  items?: NavItem[];
  leaf?: boolean;
  /** Roles that must never see this section at all — even if the DB-backed
   *  permission matrix grants the underlying permissions (checked with
   *  `isSectionHiddenForRole`, which canonicalizes the stored role). */
  hiddenRoles?: UserRole[];
  /** Inverse of hiddenRoles: when set, ONLY these roles can see the section.
   *  Used for entries that exist for exactly one role (e.g. "My School" for
   *  school-scoped roles) so they do not duplicate another section for admins. */
  onlyRoles?: UserRole[];
}

export const NAV_SECTIONS: NavSection[] = [
  // ── 1. DASHBOARD ──
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    leaf: true,
    items: [
      { id: 'dash_overview', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard', viewKey: 'dashboard' },
    ],
  },

  // ── 2. ORGANIZATION ──
  // School Payroll Coordinator: division/region administration is not part of
  // the role. Only the School Directory entry remains reachable, and the
  // directory view itself scopes the list to the coordinator's assigned
  // school (see SchoolDirectory in views/Organization.tsx).
  {
    id: 'organization',
    label: 'Organization',
    icon: Building2,
    hiddenRoles: ['school_coordinator'],
    items: [
      { id: 'org_regions', label: 'Regions and Divisions', icon: MapIcon, permission: 'groups', viewKey: 'org_regions' },
      { id: 'org_division', label: 'Division Offices', icon: Building2, permission: 'groups', viewKey: 'org_division' },
      { id: 'org_elementary', label: 'Elementary Schools', icon: School, permission: 'groups', viewKey: 'org_elementary' },
      { id: 'org_highschool', label: 'High Schools', icon: GraduationCap, permission: 'groups', viewKey: 'org_highschool' },
      { id: 'org_units', label: 'Implementing Units', icon: Home, permission: 'groups', viewKey: 'org_units' },
      { id: 'org_directory', label: 'School Directory', icon: MapIcon, permission: 'groups', viewKey: 'org_directory' },
    ],
  },

  // ── 2b. MY SCHOOL ──
  // The School Payroll Coordinator's single Organization entry: the School
  // Directory scoped to their assigned school. The `groups` permission is
  // granted to the role in types/auth.ts for exactly this view.
  {
    id: 'my_school',
    label: 'My School',
    icon: School,
    leaf: true,
    onlyRoles: ['school_coordinator', 'school_head'],
    items: [
      { id: 'my_school_directory', label: 'My School', icon: MapPin, permission: 'groups', viewKey: 'org_directory' },
    ],
  },

  // ── 3. EMPLOYEE MANAGEMENT ──
  // School Payroll Coordinator sees: Employee Records, the Inclusion /
  // Exclusion / Detailed employee lists, Newly Hired Employees and Separated
  // Employees, plus Non-Plantilla Items. The other screens are HR masterfile work outside a
  // coordinator's duties, so they are hidden by role rather than by permission —
  // the coordinator holds the `employees` permission, which alone would keep
  // Employment Status / Name Validation / Movement / Service Records visible.
  //
  // The list screens declare `onlyRoles: ['school_coordinator', 'super_admin']`:
  // they are the coordinator's own Records (requested by the coordinator,
  // approved by the Super Admin) — the coordinator sees the rows of their own
  // school, the Super Admin sees every school — and they must not widen any
  // other role's Employee Management menu.
  // "Employee Movement" is a single screen holding Inclusion / Exclusion /
  // Detailed — chosen with a dropdown inside the screen — so it is one menu
  // entry, not three. Newly Hired and Separated are the coordinator's own
  // tables, filled out by hand and never linked to Employee Records.
  {
    id: 'employees',
    label: 'Employee Management',
    icon: Users,
    items: [
      { id: 'emp_records', label: 'Employee Records', icon: Contact, permission: 'employees', viewKey: 'employees' },
      { id: 'emp_inquiry', label: 'Inquiry', icon: FileSearch, permission: 'employees', viewKey: 'inquiry' },
      // The three entry lists belong to the School Payroll Coordinator (who files
      // them for their own school) and are readable by the Super Admin across
      // ALL schools — hence the two-role `onlyRoles`.
      { id: 'emp_movement_list', label: 'Employee Movement', icon: GitBranch, permission: 'employees', viewKey: 'emp_movement', onlyRoles: ['school_coordinator', 'super_admin'] },
      { id: 'emp_newly_hired', label: 'Newly Hired Employees', icon: UserPlus, permission: 'employees', viewKey: 'emp_newly_hired', onlyRoles: ['school_coordinator', 'super_admin'] },
      { id: 'emp_separated', label: 'Separated Employees', icon: UserMinus, permission: 'employees', viewKey: 'emp_separated', onlyRoles: ['school_coordinator', 'super_admin'] },
      { id: 'emp_plantilla', label: 'PSIPOP', icon: Briefcase, permission: 'salary', viewKey: 'plantilla' },
      { id: 'emp_nonplantilla', label: 'Non-Plantilla Items', icon: UserPlus, permission: 'employees', viewKey: 'nonplantilla' },
      { id: 'emp_status', label: 'Employment Status', icon: BadgeCheck, permission: 'employees', viewKey: 'employees', hiddenRoles: ['school_coordinator'] },
      { id: 'emp_name_validation', label: 'Name Validation', icon: FileCheck2, permission: 'employees', viewKey: 'namevalidation', hiddenRoles: ['school_coordinator'] },
      { id: 'emp_movement', label: 'Personnel Movement History', icon: GitBranch, permission: 'employees', viewKey: 'employees', hiddenRoles: ['school_coordinator'] },
      { id: 'emp_pal', label: 'Plantilla Allocation List', icon: ListTree, permission: 'salary', viewKey: 'plantilla_allocation' },
      { id: 'emp_service_records', label: 'Service Records', icon: ScrollText, permission: 'employees', viewKey: 'service_records', hiddenRoles: ['school_coordinator'] },
    ],
  },

  // ── 4. PAYROLL ──
  {
    id: 'payroll',
    label: 'Payroll',
    icon: Calculator,
    items: [
      { id: 'pay_register', label: 'Regular Payroll', icon: Calculator, permission: 'payroll', viewKey: 'payroll' },
      { id: 'pay_initial', label: 'Initial Payroll', icon: Zap, permission: 'payroll', viewKey: 'initial_payroll' },
      { id: 'pay_special', label: 'Special Payroll', icon: Gift, permission: 'payroll', viewKey: 'payroll' },
      { id: 'pay_salary_adj', label: 'Salary Adjustments', icon: ArrowUpDown, permission: 'payroll', viewKey: 'salary' },
      { id: 'pay_step_increment', label: 'Step Increment Processing', icon: TrendingUp, permission: 'payroll', viewKey: 'salary' },
      { id: 'pay_approval', label: 'Payroll Approval Workflow', icon: CheckCircle2, permission: 'payroll', viewKey: 'payroll' },
      { id: 'pay_release', label: 'Payroll Release', icon: Send, permission: 'payroll', viewKey: 'payroll' },
      { id: 'pay_locking', label: 'Payroll Locking', icon: Lock, permission: 'payroll', viewKey: 'payroll' },
      { id: 'pay_history', label: 'Payroll History', icon: History, permission: 'payroll', viewKey: 'reports', tab: 'payrollHistory' },
      { id: 'pay_calendar', label: 'Payroll Calendar', icon: Calendar, permission: 'payroll', viewKey: 'payroll' },
      { id: 'ca_dashboard', label: 'Communication Allowance', icon: HandCoins, permission: 'comm_allowance', viewKey: 'ca_dashboard' },
      { id: 'pay_sheets', label: 'Payroll Sheets (Excel View)', icon: Table2, permission: 'payroll', viewKey: 'payroll_sheets' },
    ],
  },

  // ── 5. REMITTANCE ──
  // Government remittance reports and billing uploads are division-office
  // work. The School Payroll Coordinator never sees this menu — not even
  // when a permission override grants `reports` / `dedengine` / `dbf_restore`.
  {
    id: 'remittance',
    label: 'Remittance',
    icon: Send,
    hiddenRoles: ['school_coordinator'],
    items: [
      { id: 'rem_gsis', label: 'GSIS Report', icon: Landmark, permission: 'dedengine', viewKey: 'govt_gsis' },
      { id: 'rem_philhealth', label: 'PhilHealth Report', icon: HeartPulse, permission: 'reports', viewKey: 'reports', tab: 'philhealth' },
      { id: 'rem_pagibig', label: 'Pag-IBIG Report', icon: Home, permission: 'reports', viewKey: 'reports', tab: 'pagibig' },
      { id: 'rem_gsis_billing', label: 'GSIS Billing Upload', icon: Upload, permission: 'dbf_restore', viewKey: 'gsisimport' },
    ],
  },

  // ── 6. LOANS ──
  {
    id: 'loans',
    label: 'Loans',
    icon: HandCoins,
    items: [
      { id: 'loan_deductions', label: 'Deductions', icon: Table2, permission: 'dedmaster', viewKey: 'deductions' },
      { id: 'loan_dedfile', label: 'DEDFILE Masterfile', icon: Database, permission: 'dedmaster', viewKey: 'dedfile' },
      { id: 'loan_verification', label: 'Loan Verification', icon: CheckCircle2, permission: 'dedengine', viewKey: 'dedmaster' },
      { id: 'loan_provident', label: 'Provident Loan', icon: PiggyBank, permission: 'dedmaster', viewKey: 'dedmaster' },
      { id: 'loan_other', label: 'Other Loans', icon: ClipboardList, permission: 'dedmaster', viewKey: 'dedmaster' },
      { id: 'loan_dedcodes', label: 'Deduction Codes', icon: Cog, permission: 'dedengine', viewKey: 'dedengine' },
      { id: 'loan_billing', label: 'Loan Billing Upload', icon: Upload, permission: 'dbf_restore', viewKey: 'pliimport' },
    ],
  },

  // ── 7. REPORT CENTER ──
  {
    id: 'reports',
    label: 'Report Center',
    icon: FileBarChart,
    items: [
      { id: 'rep_pay_register', label: 'Payroll Register', icon: FileSpreadsheet, permission: 'reports', viewKey: 'reports', tab: 'payrollRegister' },
      { id: 'rep_history', label: 'Payroll History', icon: History, permission: 'reports', viewKey: 'reports', tab: 'payrollHistory' },
      { id: 'rep_deduction_summary', label: 'Deduction Summary', icon: BarChart3, permission: 'reports', viewKey: 'reports', tab: 'deductionSummary' },
      { id: 'rep_loan_ledger', label: 'Loan Deduction Report', icon: BookOpen, permission: 'reports', viewKey: 'reports', tab: 'loanLedger' },
      { id: 'rep_undeducted', label: 'Undeducted Report', icon: AlertCircle, permission: 'reports', viewKey: 'reports', tab: 'undeducted' },
      { id: 'rep_overpayment', label: 'Overpayment Report', icon: AlertCircle, permission: 'reports', viewKey: 'reports', tab: 'overpayment' },
      { id: 'rep_exports', label: 'DBF/CSV Export', icon: Database, permission: 'reports', viewKey: 'reports', tab: 'exports' },
    ],
  },

  // ── 8. BIR ──
  {
    id: 'bir',
    label: 'BIR',
    icon: Receipt,
    items: [
      { id: 'bir_tax', label: 'BIR Tax', icon: Receipt, permission: 'taxcalc', viewKey: 'taxcalc' },
      { id: 'bir_form2316', label: 'BIR Form 2316', icon: FileText, permission: 'taxcalc', viewKey: 'govt_w2' },
    ],
  },

  // ── 9. WORKFLOW & APPROVALS ──
  {
    id: 'workflow',
    label: 'Workflow & Approvals',
    icon: CheckCircle2,
    items: [
      { id: 'wf_pending', label: 'Pending Approvals', icon: Clock, permission: 'payroll', viewKey: 'users', tab: 'pending_approval' },
      { id: 'wf_pay_verification', label: 'Payroll Verification', icon: CheckCircle2, permission: 'payroll', viewKey: 'payroll' },
      { id: 'wf_pay_approval', label: 'Payroll Approval', icon: FileCheck2, permission: 'payroll', viewKey: 'payroll' },
      { id: 'wf_loan_verification', label: 'Loan Verification', icon: Eye, permission: 'dedengine', viewKey: 'dedmaster' },
      { id: 'wf_loan_approval', label: 'Loan Approval', icon: FileCheck2, permission: 'dedengine', viewKey: 'dedmaster' },
      { id: 'wf_remittance_approval', label: 'Remittance Approval', icon: CheckCircle2, permission: 'dedengine', viewKey: 'dedengine' },
      { id: 'wf_monitoring', label: 'Workflow Monitoring', icon: Activity, permission: 'payroll', viewKey: 'audit' },
    ],
  },

  // ── 10. SETTINGS ──
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { id: 'cfg_payroll_defs', label: 'Payroll Definitions & Formulas', icon: Settings, permission: 'payroll_definitions', viewKey: 'payroll_defs' },
      { id: 'cfg_signatories', label: 'Signatory Management', icon: FileCheck2, permission: 'system_settings', viewKey: 'signatories' },
      { id: 'admin_user_mgmt', label: 'User Management', icon: UserCog, permission: 'user_management', viewKey: 'users' },
      { id: 'my_access', label: 'My Access & Permissions', icon: ShieldCheck, permission: 'dashboard', viewKey: 'my_access' },
      { id: 'cfg_salary_grade', label: 'Salary Grade Management', icon: DollarSign, permission: 'salary', viewKey: 'salary' },
      { id: 'cfg_position_mgmt', label: 'Position Management', icon: Award, permission: 'employees', viewKey: 'positionmgmt', hiddenRoles: ['school_coordinator'] },
      { id: 'cfg_smart_import', label: 'Smart Import', icon: Database, permission: 'dbf_restore', viewKey: 'smartimport' },
      { id: 'cfg_export_backup', label: 'Export and Backup', icon: Download, permission: 'dbf_restore', viewKey: 'importbackup' },
    ],
  },

  // ── 11. COPILOT ──
  // Hidden for School Payroll Coordinator: AI tooling is not part of the role.
  {
    id: 'copilot',
    label: 'Copilot',
    icon: BrainCircuit,
    leaf: true,
    hiddenRoles: ['school_coordinator'],
    items: [
      { id: 'ai_center', label: 'Copilot', icon: BrainCircuit, permission: 'dashboard', viewKey: 'ai_center' },
    ],
  },

  // ── 12. MEMOS ──
  {
    id: 'policy_library_section',
    label: 'Memos',
    icon: BookOpen,
    leaf: true,
    items: [
      { id: 'lib_policies', label: 'Memos', icon: BookOpen, permission: 'dashboard', viewKey: 'policy_library' },
    ],
  },

  // ── 13. LOGS ──
  {
    id: 'audit_monitoring',
    label: 'Logs',
    icon: ScrollText,
    leaf: true,
    items: [
      { id: 'audit_trail', label: 'Logs', icon: ScrollText, permission: 'audit_logs', viewKey: 'audit' },
    ],
  },

  // ── 14. HELP & SUPPORT ──
  {
    id: 'help',
    label: 'Help & Support',
    icon: HelpCircle,
    items: [
      { id: 'help_guide', label: 'User Guide', icon: BookOpen, permission: 'dashboard', viewKey: 'help', tab: 'guide' },
      { id: 'help_docs', label: 'System Documentation', icon: FileText, permission: 'dashboard', viewKey: 'help', tab: 'docs' },
      { id: 'help_faqs', label: 'FAQs', icon: HelpCircle, permission: 'dashboard', viewKey: 'help', tab: 'faqs' },
      { id: 'help_contact', label: 'Contact Support', icon: Mail, permission: 'dashboard', viewKey: 'help', tab: 'contact' },
    ],
  },
];

/**
 * Whether a nav section must be hidden outright for a role, regardless of the
 * DB-backed permission matrix. Two reasons a section can hide: it declares
 * `hiddenRoles` containing the role (Remittance for School Payroll
 * Coordinator — hiding by permission alone would re-show it the moment
 * someone grants `reports`), or it declares `onlyRoles` not containing the
 * role ("My School", which exists only for school-scoped roles).
 */
export function isSectionHiddenForRole(section: NavSection, role: string | null | undefined): boolean {
  const canonical = toUserRole(role);
  if (!canonical) return false;
  if (section.hiddenRoles?.includes(canonical)) return true;
  if (section.onlyRoles && !section.onlyRoles.includes(canonical)) return true;
  return false;
}

/**
 * Whether a single nav item must be hidden for the role: either the item
 * declares `hiddenRoles` itself, or its parent section is hidden for the role
 * (e.g. Remittance for School Payroll Coordinator). Applied to favorites and
 * to item filtering inside every nav surface.
 */
export function isNavItemHiddenForRole(item: NavItem, role: string | null | undefined): boolean {
  const canonical = toUserRole(role);
  if (canonical && item.hiddenRoles?.includes(canonical)) return true;
  // `onlyRoles` fails closed: an unrecognized role sees none of these items.
  if (item.onlyRoles && (!canonical || !item.onlyRoles.includes(canonical))) return true;
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.id === item.id)) return isSectionHiddenForRole(section, role);
    if (section.subGroups?.some((sg) => sg.items.some((i) => i.id === item.id))) {
      return isSectionHiddenForRole(section, role);
    }
  }
  return false;
}

// ── Flat lookup of all nav items by ID ──────────────────────────────────────

export const ALL_NAV_ITEMS: Map<string, NavItem> = (() => {
  const map = new Map<string, NavItem>();
  for (const section of NAV_SECTIONS) {
    if (section.items) {
      for (const item of section.items) map.set(item.id, item);
    }
    if (section.subGroups) {
      for (const sg of section.subGroups) {
        for (const item of sg.items) map.set(item.id, item);
      }
    }
  }
  return map;
})();

export function findNavItem(id: string): NavItem | undefined {
  return ALL_NAV_ITEMS.get(id);
}

/** Find the first nav item whose viewKey matches. Used when Dashboard
    onNavigate passes a viewKey instead of a navId. */
export function findNavItemByViewKey(vk: string): NavItem | undefined {
  for (const section of NAV_SECTIONS) {
    if (section.items) {
      const hit = section.items.find((i) => i.viewKey === vk);
      if (hit) return hit;
    }
    if (section.subGroups) {
      for (const sg of section.subGroups) {
        const hit = sg.items.find((i) => i.viewKey === vk);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

export function permissionForView(viewKey: ViewKey): string {
  for (const section of NAV_SECTIONS) {
    if (section.items) {
      for (const item of section.items) {
        if (item.viewKey === viewKey) return item.permission;
      }
    }
    if (section.subGroups) {
      for (const sg of section.subGroups) {
        for (const item of sg.items) {
          if (item.viewKey === viewKey) return item.permission;
        }
      }
    }
  }
  return 'dashboard';
}

export function labelForView(viewKey: ViewKey): string {
  for (const section of NAV_SECTIONS) {
    if (section.items) {
      for (const item of section.items) {
        if (item.viewKey === viewKey) return item.label;
      }
    }
    if (section.subGroups) {
      for (const sg of section.subGroups) {
        for (const item of sg.items) {
          if (item.viewKey === viewKey) return item.label;
        }
      }
    }
  }
  return 'Dashboard';
}

