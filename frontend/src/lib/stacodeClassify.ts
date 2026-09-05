import type { PayrollGroup } from '@/types/payroll';

/**
 * Classify an employee into a payroll group based on their STACODE.
 *
 * STACODE is a numeric string (e.g. "508", "700"). The function parses it
 * as an integer and finds the first active payroll group whose
 * [stacode_min, stacode_max] range contains it.
 *
 * Returns the PayrollGroup or null if STACODE is empty/invalid/no match.
 */
export function classifyByStacode(
  stacode: string | undefined | null,
  groups: PayrollGroup[],
): PayrollGroup | null {
  if (!stacode || !stacode.trim()) return null;
  const code = stacode.trim();
  if (!/^\d+$/.test(code)) return null;
  const num = parseInt(code, 10);
  if (isNaN(num)) return null;

  return (
    groups.find(
      (g) =>
        g.status === 'Active' &&
        g.stacode_min !== null &&
        g.stacode_max !== null &&
        num >= g.stacode_min &&
        num <= g.stacode_max,
    ) ?? null
  );
}

/**
 * Returns true if the STACODE is valid and classifiable into a payroll group.
 */
export function isValidStacode(stacode: string | undefined | null, groups: PayrollGroup[]): boolean {
  return classifyByStacode(stacode, groups) !== null;
}

/**
 * Returns the payroll group label for a given stacode, or 'Unassigned'.
 */
export function stacodeGroupLabel(stacode: string | undefined | null, groups: PayrollGroup[]): string {
  const g = classifyByStacode(stacode, groups);
  return g ? g.group_name : 'Unassigned';
}
