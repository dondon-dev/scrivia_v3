/**
 * "Assigned School" for Senior High School employees.
 *
 * SHS employees carry the station STACODE 700 (SHS - TEACHING) or 701
 * (SHS - NON TEACHING). Under Organization → Schools → Senior High Schools
 * they can be assigned to an actual school in the division. The special /
 * "Other Payroll" modules (Comm Allowance, etc.) resolve that assigned school;
 * the REGULAR monthly payroll keeps resolving the STACODE station.
 */

/** The SHS station codes (station schools "SHS - TEACHING" / "SHS - NON TEACHING"). */
export const SHS_STACODES = ['700', '701'] as const;

/** True when the stacode is one of the SHS station codes (700/701). */
export function isSHSStationCode(stacode: string | null | undefined): boolean {
  const raw = String(stacode ?? '').trim();
  return raw === '700' || raw === '701';
}

/**
 * The assigned school code for an SHS employee, or '' when none is set.
 * Storing 700/701 (the station itself) is treated the same as '' — the
 * employee has no assigned school beyond their STACODE station.
 */
export function assignedSchoolCodeOf(emp: {
  stacode?: string | null;
  assigned_school_code?: string | null;
}): string {
  if (!isSHSStationCode(emp?.stacode)) return '';
  const code = String(emp?.assigned_school_code ?? '').trim();
  return isSHSStationCode(code) ? '' : code;
}

/**
 * Resolve the school (stacode + name) the employee reports to for the special
 * / "Other Payroll" modules. Returns null when the employee is not SHS or has
 * no valid assigned school — the caller falls back to the STACODE station.
 */
export function caSchoolForEmployee(
  emp: { stacode?: string | null; assigned_school_code?: string | null },
  schoolByCode: Map<string, string>,
): { stacode: string; schoolName: string } | null {
  const assigned = assignedSchoolCodeOf(emp);
  if (!assigned) return null;
  const schoolName = schoolByCode.get(assigned);
  if (!schoolName) return null;
  return { stacode: assigned, schoolName };
}