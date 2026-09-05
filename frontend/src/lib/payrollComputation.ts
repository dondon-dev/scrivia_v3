// ── DepEd Initial Payroll Computation Engine ───────────────────────────────
// Implements the official DepEd payroll computation rules for permanent employees:
//   Gross Salary, PERA, GSIS, PhilHealth, Pag-IBIG, TRAIN Law Withholding Tax,
//   Total Deductions, Amount Due, and Total Due.
// STACODE grouping: 001-499 = ELEM, 500-699 = JHS, 700-701 = SHS.

export type SchoolGroup = 'ELEM' | 'JHS' | 'SHS';

export interface ComputationInput {
  monthly_salary: number;
  days_present: number;
  calendar_days: number;
  other_deductions: number;
  additional_adjustments: number;
  adjustment_deductions: number;
  philhealth_rate: number; // e.g. 0.05 for 5%
  effectivity_date: string | null; // ISO date string; determines remaining months
}

export interface ComputationResult {
  gross_salary: number;
  pera: number;
  gsis: number;
  philhealth: number;
  pagibig: number;
  annual_income: number;
  annual_deductions: number;
  taxable_income: number;
  annual_tax: number;
  monthly_tax: number;
  total_deductions: number;
  amount_due: number;
  total_due: number;
}

export const PERA_FULL = 2000;
export const PERA_DAILY_DIVISOR = 22;
export const GSIS_RATE = 0.09;
export const PAGIBIG_FIXED = 200;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classify a STACODE into ELEM, JHS, or SHS.
 * 001-499 = ELEM, 500-699 = JHS, 700-701 = SHS.
 */
export function classifyStacode(stacode: string): SchoolGroup {
  const n = parseInt(stacode, 10);
  if (isNaN(n)) return 'ELEM';
  if (n <= 499) return 'ELEM';
  if (n <= 699) return 'JHS';
  return 'SHS';
}

export const SCHOOL_GROUP_LABELS: Record<SchoolGroup, string> = {
  ELEM: 'Elementary',
  JHS: 'Junior High School',
  SHS: 'Senior High School',
};

/**
 * Monthly BIR TRAIN Law withholding tax table.
 * Applied to the monthly taxable income (salary − mandatory deductions).
 */
export function computeMonthlyWithholdingTax(monthlyTaxableIncome: number): number {
  const mti = Math.max(0, monthlyTaxableIncome);
  if (mti <= 20833) return 0;
  if (mti <= 33333) return round2((mti - 20833) * 0.15);
  if (mti <= 66667) return round2(1875 + (mti - 33333) * 0.20);
  if (mti <= 166667) return round2(8541.67 + (mti - 66667) * 0.25);
  if (mti <= 666667) return round2(33541.67 + (mti - 166667) * 0.30);
  return round2(183541.67 + (mti - 666667) * 0.35);
}

/**
 * Remaining months from the effectivity date through December 31 of the same
 * year, inclusive of the current month. Falls back to 12 when no date.
 */
export function remainingMonthsIncludingCurrent(effectivityDate: string | null): number {
  if (!effectivityDate) return 12;
  const d = new Date(effectivityDate);
  if (isNaN(d.getTime())) return 12;
  return 12 - d.getMonth();
}

/**
 * Full payroll computation for a single employee.
 *
 * Gross Salary  = Monthly Salary / Calendar Days × Days Present
 * PERA          = 2000 (full) or 2000 / 22 × Days Present (prorated)
 * GSIS          = Monthly Salary × 9%
 * PhilHealth    = Monthly Salary × Premium Rate ÷ 2
 * Pag-IBIG      = 200
 * Projected Annual Basic Salary = Monthly × RemainingMonths (from effectivity)
 * Projected Annual Deductions  = (GSIS + PhilHealth + Pag-IBIG) × RemainingMonths
 * Projected Annual Taxable Income = Annual Basic Salary − Annual Deductions
 * If Annual Taxable Income ≤ 250,000 → Tax = 0
 * Otherwise apply the monthly BIR TRAIN withholding table to:
 *   Salary(Calendar) − GSIS − PhilHealth − Pag-IBIG
 * Total Deduct  = Tax + GSIS + PhilHealth + Pag-IBIG + Other Deductions
 * Amount Due    = Gross Salary + PERA − Total Deductions
 * Total Due     = Amount Due + Additional Adjustments − Adjustment Deductions
 */
export function computePayroll(input: ComputationInput): ComputationResult {
  const monthly = Number(input.monthly_salary) || 0;
  const daysPresent = Number(input.days_present) || 0;
  const calendarDays = Number(input.calendar_days) || 22;

  const grossSalary = round2((monthly / calendarDays) * daysPresent);

  const isProrated = daysPresent < 22;
  const pera = isProrated
    ? round2((PERA_FULL / PERA_DAILY_DIVISOR) * daysPresent)
    : PERA_FULL;

  // GSIS Personal Share = ROUND(SalaryBasedOnCalendarDays * 0.09, 2)
  const gsis = round2(grossSalary * GSIS_RATE);
  // PhilHealth: IF DaysPresentCSC > 2 THEN ROUND(MonthlySalary * 0.025, 2) ELSE 0
  const philhealth = daysPresent > 2 ? round2(monthly * 0.025) : 0;
  const pagibig = daysPresent > 2 ? PAGIBIG_FIXED : 0;

  const remainingMonths = remainingMonthsIncludingCurrent(input.effectivity_date);
  const annualIncome = round2(monthly * remainingMonths);
  const annualDeductions = round2((gsis + philhealth + pagibig) * remainingMonths);
  const taxableIncome = round2(annualIncome - annualDeductions);

  // Step 4: if projected annual taxable income is ≤ 250,000, no withholding tax.
  // Otherwise apply the monthly BIR TRAIN table to the monthly taxable income.
  const monthlyTaxableIncome = grossSalary - gsis - philhealth - pagibig;
  const monthlyTax = taxableIncome <= 250000
    ? 0
    : computeMonthlyWithholdingTax(monthlyTaxableIncome);
  const annualTax = round2(monthlyTax * remainingMonths);

  const totalDeductions = round2(
    monthlyTax + gsis + philhealth + pagibig + (Number(input.other_deductions) || 0),
  );

  const amountDue = round2(grossSalary + pera - totalDeductions);
  const totalDue = round2(
    amountDue + (Number(input.additional_adjustments) || 0) - (Number(input.adjustment_deductions) || 0),
  );

  return {
    gross_salary: grossSalary,
    pera,
    gsis,
    philhealth,
    pagibig,
    annual_income: annualIncome,
    annual_deductions: annualDeductions,
    taxable_income: taxableIncome,
    annual_tax: annualTax,
    monthly_tax: monthlyTax,
    total_deductions: totalDeductions,
    amount_due: amountDue,
    total_due: totalDue,
  };
}

// ── Summary aggregation ───────────────────────────────────────────────────

export interface GroupSummary {
  group: SchoolGroup;
  label: string;
  count: number;
  total_gross: number;
  total_pera: number;
  total_gsis: number;
  total_philhealth: number;
  total_pagibig: number;
  total_tax: number;
  total_deductions: number;
  total_amount_due: number;
  total_due: number;
}

export interface SchoolSummary {
  stacode: string;
  school: string;
  group: SchoolGroup;
  count: number;
  total_gross: number;
  total_pera: number;
  total_gsis: number;
  total_philhealth: number;
  total_pagibig: number;
  total_tax: number;
  total_deductions: number;
  total_amount_due: number;
  total_due: number;
}

export interface DivisionSummary {
  count: number;
  total_gross: number;
  total_pera: number;
  total_gsis: number;
  total_philhealth: number;
  total_pagibig: number;
  total_tax: number;
  total_deductions: number;
  total_amount_due: number;
  total_due: number;
}

export interface ComputedEntry {
  employee_number: string;
  surname: string;
  first_name: string;
  middle_name: string;
  stacode: string;
  school: string;
  group: SchoolGroup;
  item_no: string;
  position_title: string;
  salary_grade: number | null;
  salary_step: number | null;
  monthly_salary: number;
  days_present: number;
  calendar_days: number;
  tin: string;
  philhealth_no: string;
  hdmf_no: string;
  atm_account_no: string;
  effectivity_date: string | null;
  result: ComputationResult;
  other_deductions: number;
  additional_adjustments: number;
  adjustment_deductions: number;
  absences: number;
}

export interface PayrollSummary {
  entries: ComputedEntry[];
  groups: GroupSummary[];
  schools: SchoolSummary[];
  division: DivisionSummary;
}

function emptyAcc() {
  return {
    count: 0, total_gross: 0, total_pera: 0, total_gsis: 0,
    total_philhealth: 0, total_pagibig: 0, total_tax: 0,
    total_deductions: 0, total_amount_due: 0, total_due: 0,
  };
}

export function buildPayrollSummary(entries: ComputedEntry[]): PayrollSummary {
  const groupOrder: SchoolGroup[] = ['ELEM', 'JHS', 'SHS'];
  const groupMap = new Map<SchoolGroup, ReturnType<typeof emptyAcc>>();
  const schoolMap = new Map<string, ReturnType<typeof emptyAcc> & { group: SchoolGroup; school: string }>();
  const div = emptyAcc();

  for (const e of entries) {
    const r = e.result;
    div.count++;
    div.total_gross += r.gross_salary;
    div.total_pera += r.pera;
    div.total_gsis += r.gsis;
    div.total_philhealth += r.philhealth;
    div.total_pagibig += r.pagibig;
    div.total_tax += r.monthly_tax;
    div.total_deductions += r.total_deductions;
    div.total_amount_due += r.amount_due;
    div.total_due += r.total_due;

    let ga = groupMap.get(e.group);
    if (!ga) { ga = emptyAcc(); groupMap.set(e.group, ga); }
    ga.count++; ga.total_gross += r.gross_salary; ga.total_pera += r.pera;
    ga.total_gsis += r.gsis; ga.total_philhealth += r.philhealth;
    ga.total_pagibig += r.pagibig; ga.total_tax += r.monthly_tax;
    ga.total_deductions += r.total_deductions; ga.total_amount_due += r.amount_due;
    ga.total_due += r.total_due;

    const sk = e.stacode || e.school || 'UNKNOWN';
    let sa = schoolMap.get(sk);
    if (!sa) {
      sa = { ...emptyAcc(), group: e.group, school: e.school || sk };
      schoolMap.set(sk, sa);
    }
    sa.count++; sa.total_gross += r.gross_salary; sa.total_pera += r.pera;
    sa.total_gsis += r.gsis; sa.total_philhealth += r.philhealth;
    sa.total_pagibig += r.pagibig; sa.total_tax += r.monthly_tax;
    sa.total_deductions += r.total_deductions; sa.total_amount_due += r.amount_due;
    sa.total_due += r.total_due;
  }

  const groups: GroupSummary[] = groupOrder
    .filter((g) => groupMap.has(g))
    .map((g) => {
      const a = groupMap.get(g)!;
      return {
        group: g, label: SCHOOL_GROUP_LABELS[g], count: a.count,
        total_gross: round2(a.total_gross), total_pera: round2(a.total_pera),
        total_gsis: round2(a.total_gsis), total_philhealth: round2(a.total_philhealth),
        total_pagibig: round2(a.total_pagibig), total_tax: round2(a.total_tax),
        total_deductions: round2(a.total_deductions), total_amount_due: round2(a.total_amount_due),
        total_due: round2(a.total_due),
      };
    });

  const schools: SchoolSummary[] = Array.from(schoolMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([stacode, a]) => ({
      stacode, school: a.school, group: a.group, count: a.count,
      total_gross: round2(a.total_gross), total_pera: round2(a.total_pera),
      total_gsis: round2(a.total_gsis), total_philhealth: round2(a.total_philhealth),
      total_pagibig: round2(a.total_pagibig), total_tax: round2(a.total_tax),
      total_deductions: round2(a.total_deductions), total_amount_due: round2(a.total_amount_due),
      total_due: round2(a.total_due),
    }));

  const division: DivisionSummary = {
    count: div.count,
    total_gross: round2(div.total_gross), total_pera: round2(div.total_pera),
    total_gsis: round2(div.total_gsis), total_philhealth: round2(div.total_philhealth),
    total_pagibig: round2(div.total_pagibig), total_tax: round2(div.total_tax),
    total_deductions: round2(div.total_deductions), total_amount_due: round2(div.total_amount_due),
    total_due: round2(div.total_due),
  };

  return { entries, groups, schools, division };
}

// Default PhilHealth premium rate: 5% (2024 onwards), employee share = half = 2.5%
export const DEFAULT_PHILHEALTH_RATE = 0.05;
