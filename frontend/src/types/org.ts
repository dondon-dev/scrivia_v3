export interface Region {
  id: string;
  region_code: string;
  region_name: string;
  sort_order: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Division {
  id: string;
  region_id: string;
  division_code: string;
  division_name: string;
  features: Record<string, boolean>;
  status: string;
  created_at?: string;
  updated_at?: string;
}

/** Default enabled features when a division is created without explicit ones. */
export const DEFAULT_DIVISION_FEATURES: Record<string, boolean> = {
  payroll: true,
  ca: true,
  deductions: true,
  imports: true,
  reports: true,
  ess: true,
  organization: true,
};

export const DIVISION_FEATURE_LABELS: Record<string, string> = {
  payroll: 'Payroll Processing',
  ca: 'Communication Allowance (CA)',
  deductions: 'Deductions & Loans',
  imports: 'DBF / Smart Imports',
  reports: 'Reports & Certifications',
  ess: 'Employee Self-Service',
  organization: 'Organization & Schools',
};

export const DIVISION_FEATURE_KEYS: string[] = Object.keys(DIVISION_FEATURE_LABELS);

export function mergeFeatures(raw: unknown): Record<string, boolean> {
  const base: Record<string, boolean> = { ...DEFAULT_DIVISION_FEATURES };
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'boolean') base[k] = v;
    }
  }
  return base;
}
