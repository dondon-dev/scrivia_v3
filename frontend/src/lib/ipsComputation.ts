// ── CSC Days Present & Initial Payroll Computation Engine ───────────────────
//
// Implements Initial Payroll CSC rules:
//   • Daily Rate = Monthly Salary ÷ 22
//   • Every month is divided into two halves:
//       First Half  (1–15)   = 11 payroll days (allocation)
//       Second Half (16–EOM) = 11 payroll days (allocation)
//   • Payroll Allocation is ALWAYS 11 per half — never recalculated.
//   • The 11 payroll days are the FIRST 11 working days (Mon–Fri) of the half.
//   • When an employee starts mid-period:
//       Days Before Start = working days from period start to day BEFORE
//                            the effectivity date (capped at 11).
//       Payable Days = 11 − Days Before Start.
//   • Gross Salary = Daily Rate × Payable Days.
//
// Example:
//   Monthly Salary = ₱30,000, Start Date = July 24 (Second Half, Jul 16–31)
//   Daily Rate = 30,000 / 22 = ₱1,363.64
//   Payroll Allocation = 11 days
//   Days Before Start = 6 (Jul 16,17,18,19,20,23 — the 6 payroll days before Jul 24)
//   Payable Days = 11 − 6 = 5
//   Gross Salary = 1,363.64 × 5 = ₱6,818.20

export interface CscComputation {
  /** Always 11 per half-period — the standard payroll allocation. */
  payrollAllocation: number;
  /** Working days from period start to day before effectivity (capped at 11). */
  daysBeforeStart: number;
  /** 11 − daysBeforeStart (before absences). */
  payableDays: number;
  /** Calendar days from effectivity date to end of half-period (inclusive). */
  calendarDays: number;
  /** Absences deducted (capped at payable days). */
  absencesDeducted: number;
  /** Payable days minus absences — the figure used for gross salary. */
  finalPayableDays: number;
  /** 'First Half', 'Second Half', or 'Full Month'. */
  periodLabel: 'First Half' | 'Second Half' | 'Full Month';
}

export const CSC_STANDARD_DAYS = 11;

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Count working days (Mon–Fri) between start and end dates, inclusive. */
export function countWorkingDays(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cur <= stop) {
    if (!isWeekend(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Last day of the month for a given date. */
export function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Period start date: 1st of month for First Half, 16th for Second Half. */
export function periodStartDate(effectivity: Date): Date {
  const dom = effectivity.getDate();
  if (dom <= 15) {
    return new Date(effectivity.getFullYear(), effectivity.getMonth(), 1);
  }
  return new Date(effectivity.getFullYear(), effectivity.getMonth(), 16);
}

/** Period end date: 15th for First Half, last day of month for Second Half. */
export function periodEndDate(effectivity: Date): Date {
  const dom = effectivity.getDate();
  if (dom <= 15) {
    return new Date(effectivity.getFullYear(), effectivity.getMonth(), 15);
  }
  return lastDayOfMonth(effectivity);
}

/** Calendar days from effectivity date to period end (inclusive). */
export function computeCalendarDays(effectivity: Date): number {
  const end = periodEndDate(effectivity);
  const diff = end.getDate() - effectivity.getDate() + 1;
  return Math.max(0, diff);
}

/**
 * Full CSC computation from an effectivity date and absence days.
 *
 * Steps:
 *   1. Determine half-period from the effectivity date's day-of-month.
 *   2. daysBeforeStart = working days from period start to day BEFORE
 *      effectivity (capped at 11 — only the first 11 payroll days count).
 *   3. payableDays = max(0, 11 − daysBeforeStart).
 *   4. calendarDays = period end − effectivity + 1.
 *   5. absencesDeducted = min(absences, payableDays).
 *   6. finalPayableDays = payableDays − absencesDeducted.
 */
export function computeCsc(effectivityDate: string, absences: number): CscComputation {
  const effectivity = new Date(effectivityDate);
  if (isNaN(effectivity.getTime())) {
    return {
      payrollAllocation: CSC_STANDARD_DAYS,
      daysBeforeStart: 0,
      payableDays: CSC_STANDARD_DAYS,
      calendarDays: 0,
      absencesDeducted: 0,
      finalPayableDays: CSC_STANDARD_DAYS,
      periodLabel: 'First Half',
    };
  }

  const dom = effectivity.getDate();
  const isFirstHalf = dom <= 15;
  const periodStart = periodStartDate(effectivity);

  const dayBefore = new Date(effectivity);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const rawDaysBefore = countWorkingDays(periodStart, dayBefore);
  const daysBeforeStart = Math.min(rawDaysBefore, CSC_STANDARD_DAYS);
  const payableDays = Math.max(0, CSC_STANDARD_DAYS - daysBeforeStart);
  const calendarDays = computeCalendarDays(effectivity);

  const absencesDeducted = Math.min(Math.max(0, absences), payableDays);
  const finalPayableDays = payableDays - absencesDeducted;

  return {
    payrollAllocation: CSC_STANDARD_DAYS,
    daysBeforeStart,
    payableDays,
    calendarDays,
    absencesDeducted,
    finalPayableDays,
    periodLabel: isFirstHalf ? 'First Half' : 'Second Half',
  };
}

/**
 * CSC computation from an explicitly encoded Period Covered (from/to).
 *
 * Uses the effectivity date to determine the half and prorate the 11-day
 * allocation. When periodFrom/periodTo are provided, calendarDays reflects
 * that explicit range. Falls back to computeCsc when no period is given.
 */
export function computeCscFromPeriod(
  periodFrom: string | null,
  periodTo: string | null,
  absences: number,
  effectivityDate?: string | null,
): CscComputation {
  const eff = effectivityDate ?? periodFrom ?? new Date().toISOString().slice(0, 10);

  if (periodFrom && periodTo) {
    const start = new Date(periodFrom);
    const end = new Date(periodTo);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const calendarDays =
        Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const startDom = start.getDate();
      const endDom = end.getDate();
      const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
      const coversFirstHalf = sameMonth ? startDom <= 15 : true;
      const coversSecondHalf = sameMonth ? endDom >= 16 : true;
      const halvesCovered = (coversFirstHalf ? 1 : 0) + (coversSecondHalf ? 1 : 0);
      const allocation = halvesCovered * CSC_STANDARD_DAYS;
      const isFirstHalf = !coversSecondHalf;
      const workingDaysInPeriod = Math.min(countWorkingDays(start, end), allocation);
      const absencesDeducted = Math.min(Math.max(0, absences), workingDaysInPeriod);
      const finalPayableDays = workingDaysInPeriod - absencesDeducted;
      return {
        payrollAllocation: allocation,
        daysBeforeStart: allocation - workingDaysInPeriod,
        payableDays: workingDaysInPeriod,
        calendarDays,
        absencesDeducted,
        finalPayableDays,
        periodLabel: halvesCovered === 2 ? 'Full Month' : isFirstHalf ? 'First Half' : 'Second Half',
      };
    }
  }

  return computeCsc(eff, absences);
}

export interface PayrollComputation extends CscComputation {
  dailyRate: number;
  grossSalary: number;
  pera: number;
  gsis: number;
  philhealth: number;
  pagibig: number;
  withholdingTax: number;
  totalDeductions: number;
  netPay: number;
}

export const PERA_DAILY = 2000 / 22;
export const GSIS_RATE = 0.09;
export const PHIC_RATE = 0.025;
export const PAGIBIG_FIXED = 100;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Monthly BIR TRAIN Law withholding tax table. */
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
 * Full payroll computation from salary rate, effectivity date, and absences.
 * Uses finalPayableDays (after absence deduction) for gross salary.
 */
export function computePayroll(
  salaryRate: number,
  effectivityDate: string,
  absences: number,
): PayrollComputation {
  const csc = computeCsc(effectivityDate, absences);
  const monthly = Number(salaryRate) || 0;

  const dailyRate = round2(monthly / 22);
  const grossSalary = round2(dailyRate * csc.finalPayableDays);
  const pera = round2(PERA_DAILY * csc.finalPayableDays);

  const gsis = round2(monthly * GSIS_RATE);
  const philhealth = csc.finalPayableDays > 0 ? round2(monthly * PHIC_RATE) : 0;
  const pagibig = csc.finalPayableDays > 0 ? PAGIBIG_FIXED : 0;

  const monthlyTaxableIncome = grossSalary - gsis - philhealth - pagibig;
  const withholdingTax = computeMonthlyWithholdingTax(monthlyTaxableIncome);

  const totalDeductions = round2(withholdingTax + gsis + philhealth + pagibig);
  const netPay = round2(grossSalary + pera - totalDeductions);

  return {
    ...csc,
    dailyRate,
    grossSalary,
    pera,
    gsis,
    philhealth,
    pagibig,
    withholdingTax,
    totalDeductions,
    netPay,
  };
}
