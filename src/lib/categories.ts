export type PayrollCategory = 'elementary' | 'highschool';

export interface CategoryDef {
  min: number;
  max: number;
  label: string;
  shortLabel: string;
  suffix: string;
}

export const CATEGORIES: Record<PayrollCategory, CategoryDef> = {
  elementary: { min: 1, max: 499, label: 'Elementary Payroll', shortLabel: 'Elementary', suffix: 'ELEMENTARY' },
  highschool: { min: 500, max: 701, label: 'High School Payroll', shortLabel: 'High School', suffix: 'HIGHSCHOOL' },
};

export const CATEGORY_LIST: PayrollCategory[] = ['elementary', 'highschool'];

export function stacodeToNum(stacode: string | null | undefined): number | null {
  if (!stacode || !stacode.trim()) return null;
  const code = stacode.trim();
  if (!/^\d+$/.test(code)) return null;
  const n = parseInt(code, 10);
  return isNaN(n) ? null : n;
}

export function inCategory(stacode: string | null | undefined, cat: PayrollCategory): boolean {
  const n = stacodeToNum(stacode);
  if (n === null) return false;
  const def = CATEGORIES[cat];
  return n >= def.min && n <= def.max;
}

export function categoryOfStacode(stacode: string | null | undefined): PayrollCategory | null {
  for (const cat of CATEGORY_LIST) {
    if (inCategory(stacode, cat)) return cat;
  }
  return null;
}
