export type UserRole =
  | 'super_admin'
  | 'payroll_admin'
  | 'payroll_processor'
  | 'payroll_preparer'
  | 'payroll_reviewer'
  | 'payroll_approver'
  | 'payroll_payer'
  | 'accounting_officer'
  | 'hr_administrator'
  | 'school_coordinator'
  | 'division_finance'
  | 'auditor'
  | 'school_head'
  | 'ess'
  | 'read_only';

export type UserStatus = 'pending_approval' | 'approved' | 'rejected' | 'disabled';

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string;
  username: string | null;
  role: UserRole;
  status: UserStatus;
  region_id: string | null;
  division_id: string | null;
  assigned_stacode: string | null;
  office_assignment: string | null;
  position_designation: string | null;
  employee_number: string | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  disabled_by: string | null;
  disabled_at: string | null;
  mfa_enabled: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  disabled: 'Disabled',
};

export const STATUS_COLORS: Record<UserStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  disabled: 'bg-slate-100 text-slate-600 border-slate-200',
};

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  record_type: string | null;
  record_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// Roles that are scoped to a specific school STACODE
export const STACODE_SCOPED_ROLES: UserRole[] = ['school_coordinator', 'school_head'];

/**
 * The four payroll duties that internal control requires to be held by four
 * different people.
 *
 * Preparing, reviewing, approving and releasing a payroll run must not sit in
 * one pair of hands: whoever computes the payroll must not also be the person
 * who checks it, authorises it, or moves the money. This is the account model
 * that makes that rule enforceable, because the rule can only be broken by
 * giving one person two accounts — which is exactly what
 * `pb_hooks/mfa_totp.pb.js` now refuses on save.
 *
 * Kept in step with `DUTIES` in `pb_hooks/mfa_totp.pb.js` (server enforcement)
 * and `PAYROLL_DUTY_ROLES` in `lib/authz.ts`.
 */
export const PAYROLL_DUTY_ROLES: UserRole[] = [
  'payroll_preparer', 'payroll_reviewer', 'payroll_approver', 'payroll_payer',
];

/** One line per duty, in the order the duties are performed. */
export const PAYROLL_DUTY_STAGES: Record<string, string> = {
  payroll_preparer: 'Stage 1 — Prepare: encode the payroll, import the masterfile, build the draft run.',
  payroll_reviewer: 'Stage 2 — Review: independently verify computations, deductions and registers against the draft.',
  payroll_approver: 'Stage 3 — Approve: authorise the reviewed run and lock the period.',
  payroll_payer: 'Stage 4 — Pay & remit: release the approved run, credit accounts, remit GSIS / PhilHealth / Pag-IBIG / BIR.',
};

export const ALL_ROLES: UserRole[] = [
  'super_admin', 'payroll_admin', 'payroll_processor',
  'payroll_preparer', 'payroll_reviewer', 'payroll_approver', 'payroll_payer',
  'accounting_officer',
  'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
  'school_head', 'ess', 'read_only',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  payroll_admin: 'Payroll Administrator',
  payroll_processor: 'Payroll Processor',
  payroll_preparer: 'Payroll Preparer',
  payroll_reviewer: 'Payroll Reviewer',
  payroll_approver: 'Payroll Approver',
  payroll_payer: 'Payroll Payer / Releasing Officer',
  accounting_officer: 'Accounting Officer',
  hr_administrator: 'HR Administrator',
  school_coordinator: 'School Payroll Coordinator',
  division_finance: 'Division Finance Officer',
  auditor: 'Auditor',
  school_head: 'School Head',
  ess: 'Employee Self-Service',
  read_only: 'Read-Only User',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-50 text-red-700 border-red-200',
  payroll_admin: 'bg-blue-50 text-blue-700 border-blue-200',
  payroll_processor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  payroll_preparer: 'bg-lime-50 text-lime-700 border-lime-200',
  payroll_reviewer: 'bg-sky-50 text-sky-700 border-sky-200',
  payroll_approver: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  payroll_payer: 'bg-rose-50 text-rose-700 border-rose-200',
  accounting_officer: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  hr_administrator: 'bg-violet-50 text-violet-700 border-violet-200',
  school_coordinator: 'bg-amber-50 text-amber-700 border-amber-200',
  division_finance: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  auditor: 'bg-slate-100 text-slate-700 border-slate-200',
  school_head: 'bg-teal-50 text-teal-700 border-teal-200',
  ess: 'bg-orange-50 text-orange-700 border-orange-200',
  read_only: 'bg-gray-50 text-gray-600 border-gray-200',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full system access. Approve/reject users, manage roles, security policies.',
  payroll_admin: 'Primary payroll processor. Import DBF files, process payroll, generate reports.',
  payroll_processor: 'Daily payroll encoding. Upload data, update records, generate draft reports.',
  payroll_preparer: 'PREPARE — encodes the payroll, imports the masterfile and builds the draft run. Cannot review, approve or release it.',
  payroll_reviewer: 'REVIEW — independently verifies the prepared payroll against the registers. Cannot prepare, approve or release it.',
  payroll_approver: 'APPROVE — authorises the reviewed payroll run and locks the period. Cannot prepare, review or release it.',
  payroll_payer: 'PAY & REMIT — releases the approved run, credits accounts and remits GSIS / PhilHealth / Pag-IBIG / BIR. Cannot prepare, review or approve it.',
  accounting_officer: 'Payroll accounting and reconciliation. View computations, generate entries.',
  hr_administrator: 'Employee information management. Add/update employees, positions, salary grades.',
  school_coordinator: 'School-level payroll verification. View assigned school employees only (read-only, Employee Records).',
  division_finance: 'Division-level monitoring. View all reports, summaries, remittances.',
  auditor: 'Audit and compliance review. View audit logs, payroll reports, transactions.',
  school_head: 'School payroll monitoring. View school register and employee list.',
  ess: 'Individual employee portal. View own payslip, payroll history, deductions.',
  read_only: 'Inquiry and reporting only. View reports, search employees.',
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: [
    'dashboard', 'employees', 'groups', 'salary', 'deductions', 'dedmaster',
    'dedengine', 'payroll', 'taxcalc', 'reports', 'stacode',
    'user_management', 'audit_logs', 'system_settings', 'dbf_restore', 'comm_allowance',
    'payroll_definitions',
  ],
  payroll_admin: [
    'dashboard', 'employees', 'groups', 'salary', 'deductions', 'dedmaster',
    'dedengine', 'payroll', 'taxcalc', 'reports', 'stacode', 'dbf_restore', 'comm_allowance',
    // User Management access: lets Payroll Administrators assign a school
    // (STACODE) to School Head / School Payroll Coordinator accounts.
    'user_management',
  ],
  payroll_processor: [
    'dashboard', 'employees', 'deductions', 'dedmaster', 'dedengine', 'payroll', 'stacode', 'comm_allowance',
  ],
  // The four separated payroll duties. Each is deliberately narrower than
  // `payroll_admin`: a preparer can build a run, a reviewer can see it and its
  // registers, an approver can authorise it, a payer can release it — but no
  // single one of them can do another's job. Module permissions cannot express
  // "stage", so the separation is also enforced server-side by refusing to let
  // one person hold two of these roles (see pb_hooks/mfa_totp.pb.js).
  payroll_preparer: [
    'dashboard', 'employees', 'deductions', 'dedmaster', 'dedengine', 'payroll', 'stacode', 'comm_allowance', 'dbf_restore',
  ],
  payroll_reviewer: [
    'dashboard', 'employees', 'payroll', 'deductions', 'dedmaster', 'dedengine', 'reports', 'audit_logs',
  ],
  payroll_approver: [
    'dashboard', 'employees', 'payroll', 'reports', 'audit_logs',
  ],
  payroll_payer: [
    'dashboard', 'payroll', 'reports', 'comm_allowance',
  ],
  accounting_officer: [
    'dashboard', 'reports', 'employees', 'comm_allowance',
  ],
  hr_administrator: [
    'dashboard', 'employees', 'salary',
  ],
  // School Payroll Coordinator: verification only. Dashboard + Employee
  // Records for the assigned school — no Reports, no other modules. `groups`
  // exists solely so the "My School" Organization entry renders; the
  // directory view is scoped to their assigned school. Write actions inside
  // Employee Records are withheld by `isReadOnlyRole` in lib/authz.ts and
  // enforced server-side (main.go).
  school_coordinator: [
    'dashboard', 'employees', 'groups',
  ],
  division_finance: [
    'dashboard', 'reports', 'employees', 'comm_allowance',
  ],
  auditor: [
    'dashboard', 'reports', 'audit_logs', 'employees', 'comm_allowance',
  ],
  school_head: [
    'dashboard', 'employees', 'reports',
  ],
  ess: [
    'dashboard',
  ],
  read_only: [
    'dashboard', 'reports', 'comm_allowance',
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ── Permission catalog (labels + grouping for UI) ───────────────────────────
// NOTE: ROLE_PERMISSIONS above is the *default* matrix. A super_admin can
// override individual cells at runtime through the DB-backed permissions
// system (src/lib/permissions.tsx + role_permissions table).

export interface PermissionInfo {
  label: string;
  description: string;
  group: string;
}

export const PERMISSION_CATALOG: Record<string, PermissionInfo> = {
  dashboard: { label: 'Dashboard', description: 'Overview, announcements, notifications, and help resources', group: 'General' },
  employees: { label: 'Employee Records', description: 'Employee masterfile, non-plantilla items, positions, name validation', group: 'Employee & Organization' },
  groups: { label: 'Organization & Schools', description: 'Division office, school directory, implementing units, organizational structure', group: 'Employee & Organization' },
  salary: { label: 'Salary & Plantilla', description: 'Salary grade management and plantilla positions', group: 'Employee & Organization' },
  deductions: { label: 'Deductions & Loans', description: 'Mandatory/voluntary deductions and loan modules', group: 'Deductions & Taxes' },
  dedmaster: { label: 'Deduction Masterfile', description: 'Deduction records and other deductions', group: 'Deductions & Taxes' },
  dedengine: { label: 'Deduction Engine', description: 'Deduction codes, loan billing, verification, and remittances', group: 'Deductions & Taxes' },
  taxcalc: { label: 'Tax Calculator', description: 'BIR withholding tax calculator', group: 'Deductions & Taxes' },
  payroll: { label: 'Payroll', description: 'Regular/initial payroll, approval workflow, release, locking, history', group: 'Payroll & Imports' },
  dbf_restore: { label: 'DBF Import/Export', description: 'DBF import/export, smart import, GSIS/PLI file uploads', group: 'Payroll & Imports' },
  comm_allowance: { label: 'Comm Allowance (CA)', description: 'Communication allowance payroll processing', group: 'Payroll & Imports' },
  reports: { label: 'Reports', description: 'Payroll, government, financial, and compliance reports', group: 'Reports & Audit' },
  audit_logs: { label: 'Audit Logs', description: 'Audit trail, login history, activity and security logs', group: 'Reports & Audit' },
  stacode: { label: 'STACODE Validation', description: 'School code validation and payroll group mapping', group: 'Administration' },
  user_management: { label: 'User Management', description: 'User approval, role assignment, and the permissions matrix', group: 'Administration' },
  system_settings: { label: 'System Settings', description: 'Signatories, system configuration, and reference tables', group: 'Administration' },
  payroll_definitions: { label: 'Payroll Definitions & Formulas', description: 'Define payroll fields, computation formulas, and formula settings', group: 'Administration' },
};

export const PERMISSION_GROUPS: { id: string; label: string; permissions: string[] }[] = [
  { id: 'general', label: 'General', permissions: ['dashboard'] },
  { id: 'employees', label: 'Employee & Organization', permissions: ['employees', 'groups', 'salary'] },
  { id: 'deductions', label: 'Deductions & Taxes', permissions: ['deductions', 'dedmaster', 'dedengine', 'taxcalc'] },
  { id: 'payroll', label: 'Payroll & Imports', permissions: ['payroll', 'dbf_restore', 'comm_allowance'] },
  { id: 'reports', label: 'Reports & Audit', permissions: ['reports', 'audit_logs'] },
  { id: 'admin', label: 'Administration', permissions: ['stacode', 'user_management', 'system_settings'] },
];

export const ALL_PERMISSIONS: string[] = Object.keys(PERMISSION_CATALOG);

// Whether a role can approve/reject user registrations
// (case/whitespace tolerant so role data variance can't lock the system out)
export function canApproveUsers(role: UserRole): boolean {
  return (role ?? '').trim().toLowerCase() === 'super_admin';
}

// Whether a role can manage other users' roles
export function canManageRoles(role: UserRole): boolean {
  return (role ?? '').trim().toLowerCase() === 'super_admin';
}

// Whether a role needs an assigned STACODE
export function requiresStacode(role: UserRole): boolean {
  return STACODE_SCOPED_ROLES.includes(role);
}
