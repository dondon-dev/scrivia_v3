import{
  LayoutDashboard, TrendingUp, BarChart3, PieChart,
  Building2, School, GraduationCap, Home, Map as MapIcon, Network,
  Users, Contact, Briefcase, BadgeCheck, DollarSign, UserPlus,
  Award, GitBranch, Calculator, FileText, Zap,
  Gift, MoreHorizontal, ArrowUpDown, History, CheckCircle2,
  Send, Lock, Clock, Calendar, Database, HardDriveDownload,
  Download, Landmark, HeartPulse, Receipt, PiggyBank,
  HandCoins, ClipboardList, Upload, Activity, FileBarChart,
  Megaphone, Bell, ListTodo, AlertTriangle, ScrollText, LogIn,
  Shield, Eye, UserCog, KeyRound, Settings, Cog, BookOpen,
  ListTree, HelpCircle, Mail, ShieldAlert, ShieldCheck,
  Cpu, Wallet, FileSpreadsheet, FileCheck2, FileBarChart2, AlertCircle, Building,
  Table2, Sparkles, Brain, BrainCircuit,
  type LucideIcon,
} from 'lucide-react';

export type ViewKey =
  | 'dashboard' | 'employees' | 'payroll' | 'dedfile' | 'reports'
  | 'salary' | 'dedmaster' | 'dedengine' | 'taxcalc'
  | 'stacode' | 'users' | 'audit' | 'backup' | 'restore'
  | 'smartimport' | 'pliimport' | 'gsisimport' | 'creator' | 'importbackup'
  | 'org_division' | 'org_elementary' | 'org_highschool' | 'org_units' | 'org_directory' | 'org_regions'
  | 'positionmgmt' | 'positionimport' | 'plantilla' | 'nonplantilla'
  | 'namevalidation' | 'initial_payroll' | 'ips_system' | 'signatories' | 'coming_soon'
  | 'plantilla_allocation'
  | 'ca_dashboard' | 'my_access' | 'ai_center' | 'omnidev_ai' | 'payroll_defs'
  | 'notifications' | 'help'
  | 'govt_gsis' | 'govt_w2' | 'govt_calculator'
  | 'policy_library';

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
  {
    id: 'organization',
    label: 'Organization',
    icon: Building2,
    items: [
      { id: 'org_regions', label: 'Regions and Divisions', icon: MapIcon, permission: 'groups', viewKey: 'org_regions' },
      { id: 'org_division', label: 'Division Offices', icon: Building2, permission: 'groups', viewKey: 'org_division' },
      { id: 'org_elementary', label: 'Elementary Schools', icon: School, permission: 'groups', viewKey: 'org_elementary' },
      { id: 'org_highschool', label: 'High Schools', icon: GraduationCap, permission: 'groups', viewKey: 'org_highschool' },
      { id: 'org_units', label: 'Implementing Units', icon: Home, permission: 'groups', viewKey: 'org_units' },
      { id: 'org_directory', label: 'School Directory', icon: MapIcon, permission: 'groups', viewKey: 'org_directory' },
    ],
  },

  // ── 3. EMPLOYEE MANAGEMENT ──
  {
    id: 'employees',
    label: 'Employee Management',
    icon: Users,
    items: [
      { id: 'emp_records', label: 'Employee Records', icon: Contact, permission: 'employees', viewKey: 'employees' },
      { id: 'emp_plantilla', label: 'PSIPOP', icon: Briefcase, permission: 'salary', viewKey: 'plantilla' },
      { id: 'emp_nonplantilla', label: 'Non-Plantilla Items', icon: UserPlus, permission: 'employees', viewKey: 'nonplantilla' },
      { id: 'emp_status', label: 'Employment Status', icon: BadgeCheck, permission: 'employees', viewKey: 'employees' },
      { id: 'emp_name_validation', label: 'Name Validation', icon: FileCheck2, permission: 'employees', viewKey: 'namevalidation' },
      { id: 'emp_movement', label: 'Personnel Movement History', icon: GitBranch, permission: 'employees', viewKey: 'employees' },
    ],
    subGroups: [
      {
        id: 'emp_pal_group',
        label: 'Plantilla Allocation List',
        icon: ListTree,
        items: [
          { id: 'emp_pal_elem', label: 'Elementary', icon: School, permission: 'salary', viewKey: 'plantilla_allocation', tab: 'elementary' },
          { id: 'emp_pal_jhs', label: 'Junior High School', icon: GraduationCap, permission: 'salary', viewKey: 'plantilla_allocation', tab: 'junior' },
          { id: 'emp_pal_shs', label: 'Senior High School', icon: GraduationCap, permission: 'salary', viewKey: 'plantilla_allocation', tab: 'senior' },
        ],
      },
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
    ],
    subGroups: [
      {
        id: 'pay_other_group',
        label: 'Other Payroll',
        icon: MoreHorizontal,
        items: [
          { id: 'ca_dashboard', label: 'CA Payroll', icon: HandCoins, permission: 'comm_allowance', viewKey: 'ca_dashboard' },
        ],
      },
    ],
  },

  // ── 5. REMITTANCE ──
  {
    id: 'remittance',
    label: 'Remittance',
    icon: Send,
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
      { id: 'loan_deductions', label: 'Deductions', icon: Table2, permission: 'dedmaster', viewKey: 'dedfile' },
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
      { id: 'cfg_position_mgmt', label: 'Position Management', icon: Award, permission: 'employees', viewKey: 'positionmgmt' },
      { id: 'cfg_smart_import', label: 'Smart Import', icon: Database, permission: 'dbf_restore', viewKey: 'smartimport' },
      { id: 'cfg_export_backup', label: 'Export and Backup', icon: Download, permission: 'dbf_restore', viewKey: 'importbackup' },
    ],
  },

  // ── 11. COPILOT ──
  {
    id: 'copilot',
    label: 'Copilot',
    icon: BrainCircuit,
    leaf: true,
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

