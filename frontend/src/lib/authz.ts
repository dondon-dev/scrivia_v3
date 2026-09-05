import type { UserProfile, UserRole } from '@/types/auth';
import { STACODE_SCOPED_ROLES } from '@/types/auth';

export type DataScope = 'all' | 'stacode' | 'empno';

/**
 * Normalize a role string for comparison — trims whitespace and lowercases so
 * accounts whose stored role has casing/space variance (e.g. "SuperAdmin",
 * "SUPER_ADMIN", "super admin ") are still recognized correctly.
 */
export function normalizeRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase();
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
  return ['super_admin', 'payroll_admin', 'payroll_processor', 'hr_administrator'].includes(normalizeRole(role));
}

export function canManageUsers(role: UserRole): boolean {
  return isSuperAdminRole(role);
}

export function canViewAuditLogs(role: UserRole): boolean {
  return ['super_admin', 'auditor'].includes(normalizeRole(role));
}

export function canImportDbf(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin'].includes(normalizeRole(role));
}

export function canExportDbf(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin', 'payroll_processor'].includes(normalizeRole(role));
}

export function canProcessPayroll(role: UserRole): boolean {
  return ['super_admin', 'payroll_admin', 'payroll_processor'].includes(normalizeRole(role));
}

export function isReadOnlyRole(role: UserRole): boolean {
  return ['read_only', 'accounting_officer', 'division_finance', 'auditor', 'ess', 'school_head'].includes(normalizeRole(role));
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
