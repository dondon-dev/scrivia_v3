import type { UserProfile, UserRole } from '@/types/auth';
import { ALL_ROLES, ROLE_LABELS, STACODE_SCOPED_ROLES, PAYROLL_DUTY_ROLES } from '@/types/auth';

/**
 * Master switch for the second factor.
 *
 * DISARMED on request (2026-09-15): every role signs in with a password only.
 * Nothing was deleted — the privileged-role list below, the enrolment and
 * verification screens, and the `/api/auth/mfa/*` routes all stay in place, so
 * setting this back to `true` (together with the matching `MFA_ENFORCED` in
 * `pb_hooks/mfa_totp.pb.js`, which is the copy that actually refuses a
 * password-only session) arms the rule exactly as it was.
 *
 * While it is off, `isMfaPrivileged` answers `false` for every role, which is
 * what keeps a privileged account off the enrolment screen.
 *
 * Worth knowing: `docs/SCRIVIA-CLOUD-Online-Payroll-Project-Proposal.md` still
 * commits to two-factor authentication as a compliance deliverable. The
 * proposal was left as written — it describes the target, not today's build.
 */
export const MFA_ENFORCED = false;

/**
 * Roles that hold privileged access. Every role here can either move payroll
 * money, change who is allowed to, or read sensitive personal information about
 * thousands of people, so a password alone is not adequate for any of them.
 *
 * MUST be kept in step with `PRIVILEGED` in `pb_hooks/mfa_totp.pb.js` — the
 * server is the enforcing copy (it is what refuses a password-only session),
 * and this list only drives what the UI tells the user to do.
 */
export const MFA_PRIVILEGED_ROLES: UserRole[] = [
  'super_admin',
  'payroll_admin',
  'payroll_processor',
  'payroll_preparer',
  'payroll_reviewer',
  'payroll_approver',
  'payroll_payer',
  'hr_administrator',
];

/**
 * Privileged roles that are deliberately EXEMPT from the second factor.
 *
 * `super_admin` is the break-glass account: it is the one that resets other
 * people's factors and it can already grant itself any permission, so a second
 * factor on it buys less than it costs when the account is needed in a hurry.
 *
 * The exemption is recorded rather than hidden — the server writes an
 * `mfa_exempt_login` security event on every such sign-in, so an auditor can
 * still see every password-only privileged session.
 *
 * MUST be kept in step with `MFA_EXEMPT` in `pb_hooks/mfa_totp.pb.js`; it is what
 * `isMfaPrivileged` subtracts.
 */
export const MFA_EXEMPT_ROLES: UserRole[] = ['super_admin'];

/**
 * Whether an account must present a second factor.
 *
 * Unknown roles fail closed to `false`: they hold no permissions anyway, so
 * requiring enrolment would only strand the account on a screen it cannot
 * complete.
 *
 * Always `false` while `MFA_ENFORCED` is off — that is the whole point of the
 * switch, and it is what keeps the client from parking anyone on the enrolment
 * screen. The role list below is untouched, so arming it again restores the
 * rule exactly as it was.
 */
export function isMfaPrivileged(role: string | null | undefined): boolean {
  if (!MFA_ENFORCED) return false;
  const canonical = toUserRole(role);
  if (canonical === null) return false;
  return MFA_PRIVILEGED_ROLES.includes(canonical) && !MFA_EXEMPT_ROLES.includes(canonical);
}

/** True for the four separated payroll duties (prepare / review / approve / pay). */
export function isPayrollDutyRole(role: string | null | undefined): boolean {
  const canonical = toUserRole(role);
  return canonical !== null && PAYROLL_DUTY_ROLES.includes(canonical);
}

/**
 * Segregation-of-duties check, mirroring the server rule in
 * `pb_hooks/mfa_totp.pb.js`.
 *
 * Two accounts for the *same* duty are fine (two preparers are wanted, so the
 * work is not hostage to one person's leave). The same person holding two
 * *different* duties is not. Identity is matched on employee number or e-mail,
 * exactly as the server does, so the warning the user sees here is the
 * rejection they would otherwise get on save.
 *
 * This is a courtesy, not the control: the server check is what actually holds.
 */
export function payrollDutyConflict(
  role: UserRole,
  employeeNumber: string | null | undefined,
  email: string | null | undefined,
  others: Pick<UserProfile, 'id' | 'role' | 'employee_number' | 'email'>[],
  selfId?: string,
): string | null {
  if (!PAYROLL_DUTY_ROLES.includes(role)) return null;
  const emp = (employeeNumber ?? '').trim();
  const mail = (email ?? '').trim().toLowerCase();
  if (!emp && !mail) return null;

  for (const other of others) {
    if (selfId && other.id === selfId) continue;
    const otherRole = toUserRole(other.role);
    if (!otherRole || !PAYROLL_DUTY_ROLES.includes(otherRole)) continue;
    if (otherRole === role) continue; // two preparers are allowed, and wanted
    const sameEmployee = emp !== '' && (other.employee_number ?? '').trim() === emp;
    const sameEmail = mail !== '' && (other.email ?? '').trim().toLowerCase() === mail;
    if (sameEmployee || sameEmail) {
      return `Segregation of duties: this person already holds the “${ROLE_LABELS[otherRole]}” duty on another account. “${ROLE_LABELS[role]}” cannot be held by the same person — preparing, reviewing, approving and releasing payroll must be separate people.`;
    }
  }
  return null;
}

export type DataScope = 'all' | 'stacode' | 'empno';

/**
 * Normalize a role string for comparison — trims, lowercases and collapses
 * separators, so accounts whose stored role has casing/spacing variance
 * ("SuperAdmin", "SUPER_ADMIN", "super admin ", "school-coordinator") all
 * reduce to their canonical spelling before anything compares them.
 */
export function normalizeRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Every spelling accepted for a role: the canonical value itself plus its
 * display label, which is what appears when a role was set by hand
 * ("Payroll Administrator" rather than "payroll_admin").
 */
const ROLE_BY_SLUG: Record<string, UserRole> = (() => {
  const map: Record<string, UserRole> = {};
  for (const role of ALL_ROLES) {
    map[normalizeRole(role)] = role;
    map[normalizeRole(ROLE_LABELS[role])] = role;
  }
  // Spellings that neither the canonical value nor the label produces.
  map.superadmin = 'super_admin';
  map.readonly = 'read_only';
  map.finance_officer = 'division_finance';
  // Short forms of the separated payroll duties.
  map.preparer = 'payroll_preparer';
  map.reviewer = 'payroll_reviewer';
  map.approver = 'payroll_approver';
  map.payer = 'payroll_payer';
  return map;
})();

/**
 * Resolve a stored role to its canonical UserRole, or null when nothing matches.
 *
 * Profiles come straight out of PocketBase, so a role can be stored with casing
 * or spacing variance ("Payroll_Admin", "payroll admin "). Indexing
 * ROLE_PERMISSIONS / ROLE_LABELS with such a value silently yields *no*
 * permissions and a blank label, which hid every screen behind Access Denied.
 * Callers must fail closed on null rather than guess a role.
 */
export function toUserRole(role: string | null | undefined): UserRole | null {
  return ROLE_BY_SLUG[normalizeRole(role)] ?? null;
}

/**
 * Which dashboard a role lands on. `operations` is the full admin Dashboard;
 * every other kind is a layout in views/dashboards/RoleDashboards.
 *
 * This is the single source of truth for "a user's dashboard follows their
 * role": App.tsx and RoleDashboards both route through it, and it canonicalizes
 * the role first so stored casing/spacing variance cannot select the wrong one.
 */
export type RoleDashboardKind =
  | 'operations'
  | 'ess'
  | 'processor'
  | 'payroll_duty'
  | 'accounting'
  | 'hr'
  | 'school'
  | 'finance'
  | 'auditor'
  | 'read_only';

export function dashboardKindForRole(role: string | null | undefined): RoleDashboardKind {
  switch (toUserRole(role)) {
    case 'super_admin':
    case 'payroll_admin':
      return 'operations';
    case 'ess':
      return 'ess';
    case 'payroll_processor':
      return 'processor';
    // The separated duties get a dashboard of their own rather than borrowing a
    // colleague's: each one shows its stage of the payroll cycle, who does the
    // other three, and the segregation rule it is bound by.
    case 'payroll_preparer':
    case 'payroll_reviewer':
    case 'payroll_approver':
    case 'payroll_payer':
      return 'payroll_duty';
    case 'accounting_officer':
      return 'accounting';
    case 'hr_administrator':
      return 'hr';
    case 'school_coordinator':
    case 'school_head':
      return 'school';
    case 'division_finance':
      return 'finance';
    case 'auditor':
      return 'auditor';
    // read_only, and anything unrecognized: fail closed to the least-privileged
    // dashboard rather than showing a role's admin tiles to an unknown value.
    default:
      return 'read_only';
  }
}

/** True when the role is the system super administrator. */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'super_admin';
}

export function getDataScope(role: UserRole): DataScope {
  if (role === 'ess') return 'empno';
  if (STACODE_SCOPED_ROLES.includes(role)) return 'stacode';
  return 'all';
}

export function canSeeAllData(role: UserRole): boolean {
  return getDataScope(role) === 'all';
}

export function isSchoolScoped(role: UserRole): boolean {
  return STACODE_SCOPED_ROLES.includes(role);
}

export function isEssRole(role: UserRole): boolean {
  return role === 'ess';
}

export function canWritePayrollData(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin', 'payroll_processor', 'payroll_preparer', 'hr_administrator'].includes(normalizeRole(role));
}

export function canManageUsers(role: UserRole): boolean {
  return isSuperAdminRole(role);
}

export function canViewAuditLogs(role: UserRole): boolean {
  return ['super_admin', 'auditor', 'payroll_reviewer', 'payroll_approver'].includes(normalizeRole(role));
}

export function canImportDbf(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin'].includes(normalizeRole(role));
}

export function canExportDbf(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin', 'payroll_processor', 'payroll_preparer'].includes(normalizeRole(role));
}

export function canProcessPayroll(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin', 'payroll_processor', 'payroll_preparer'].includes(normalizeRole(role));
}

/**
 * Roles that must never mutate payroll data. `school_coordinator` is here
 * deliberately: the School Payroll Coordinator verifies their school's records,
 * they do not create or change them — so Employee Records hides every write
 * action for them (Employees.tsx) and the server refuses their writes anyway
 * (employeeWriteGuard in pocketbase_bin/main.go).
 */
export function isReadOnlyRole(role: UserRole): boolean {
  return ['read_only', 'accounting_officer', 'division_finance', 'auditor', 'ess', 'school_head', 'school_coordinator'].includes(normalizeRole(role));
}

/**
 * Whether a role may see the NETPAY column in Employee Records.
 *
 * Withheld from the School Payroll Coordinator: their Employee Records access is
 * record *verification* — name, position, grade/step, employment status — not
 * payroll, so the take-home figure is not theirs to read off that screen. The
 * column is hidden in the UI only; `netpay` still travels in the API response,
 * so this is presentation, not a security boundary.
 *
 * Unknown roles fail closed (column hidden), as elsewhere in this module.
 */
export function canSeeNetPay(role: string | null | undefined): boolean {
  const canonical = toUserRole(role);
  if (canonical === null) return false;
  return canonical !== 'school_coordinator';
}

export interface ScopeFilter {
  column: string;
  value: string;
}

export function getStacodeFilter(profile: UserProfile): ScopeFilter | null {
  if (!isSchoolScoped(profile.role)) return null;
  if (!profile.assigned_stacode) return null;
  return { column: 'stacode', value: profile.assigned_stacode };
}

export function getEmpnoFilter(profile: UserProfile): ScopeFilter | null {
  if (!isEssRole(profile.role)) return null;
  const empno = profile.employee_number ?? profile.username;
  if (!empno) return null;
  return { column: 'empno', value: empno };
}

export function getEmployeeFilter(profile: UserProfile): ScopeFilter | null {
  return getStacodeFilter(profile) ?? getEmpnoFilter(profile);
}

export function getScopeDescription(profile: UserProfile): string {
  const scope = getDataScope(profile.role);
  if (scope === 'all') return 'All schools and employees';
  if (scope === 'stacode') return `School STACODE ${profile.assigned_stacode ?? '—'} only`;
  return `Own employee record (${profile.employee_number ?? profile.username ?? '—'}) only`;
}
