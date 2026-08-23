export interface PayrollComputation {
  basic: number;
  pera: number;
  aca: number;
  rata: number;
  ontop: number;
  long: number;
  hazardPay: number;
  salaryDifferential: number;
  otherCompensation: number;
  otherEarnings: number;
  dedlnr: number;
  dedmed: number;
  dedpag: number;
  dedtax: number;
  govtlnr: number;
  govtecc: number;
  govtmed: number;
  govtpag: number;
  taxableIncome: number;
  mandatoryDeductions: number;
  totalDeductions: number;
  gross: number;
  netBeforeLoans: number;
  netPay: number;
  loanDeductions: number;
  availableBalance: number;
  loanDeductionCapacity: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TAX_BRACKETS = [
  { max: 20833, base: 0, rate: 0 },
  { max: 33333, base: 0, rate: 0.15 },
  { max: 66667, base: 1875, rate: 0.20 },
  { max: 166667, base: 8541.67, rate: 0.25 },
  { max: 666667, base: 33541.67, rate: 0.30 },
  { max: Infinity, base: 183541.67, rate: 0.35 },
];

// ── PYENT semi-monthly split ──
// PYENT  = total monthly net pay
// PYENT1 = net pay for period 1–15 = FLOOR(PYENT / 2)  (never rounded up)
// PYENT2 = net pay for period 16–30/31 = PYENT - PYENT1 (remainder centavos go here)
export interface PyentSplit {
  pyent: number;
  pyent1: number;
  pyent2: number;
  valid: boolean;
  difference: number;
}

export function computePyentSplit(pyent: number): PyentSplit {
  const p = Math.round((Number(pyent) || 0) * 100) / 100;
  const pyent1 = Math.floor(p * 100 / 2) / 100;
  const pyent2 = Math.round((p - pyent1) * 100) / 100;
  const difference = Math.abs(Math.round((pyent1 + pyent2 - p) * 100) / 100);
  return {
    pyent: p,
    pyent1,
    pyent2,
    valid: difference <= 0.01,
    difference,
  };
}

export function computeWithholdingTax(taxableIncome: number): number {
  const ti = Math.max(0, taxableIncome);
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    if (ti <= TAX_BRACKETS[i].max) {
      const prevMax = i === 0 ? 0 : TAX_BRACKETS[i - 1].max;
      return TAX_BRACKETS[i].base + (ti - prevMax) * TAX_BRACKETS[i].rate;
    }
  }
  return 0;
}

export interface CompensationInput {
  basic: number;
  pera?: number;
  aca?: number;
  rata?: number;
  ontop?: number;
  long?: number;
  hazardPay?: number;
  salaryDifferential?: number;
  otherCompensation?: number;
  otherEarnings?: number;
}

/**
 * STEP 1 — Compute Gross Pay per DepEd APDS:
 * GrossPay = BasicSalary + PERA + Longevity + HazardPay
 *            + SalaryDifferential + OtherCompensation + OtherEarnings
 */
export function computeGrossPay(c: CompensationInput): number {
  return (
    (Number(c.basic) || 0) +
    (Number(c.pera) || 0) +
    (Number(c.long ?? c.ontop) || 0) +
    (Number(c.hazardPay) || 0) +
    (Number(c.salaryDifferential) || 0) +
    (Number(c.otherCompensation) || 0) +
    (Number(c.otherEarnings) || 0)
  );
}

/**
 * STEP 2 — Compute Mandatory Deductions:
 * WithholdingTax + GSISPremium + GSISPolicyLoan + GSISEmergencyLoan
 * + PhilHealth + PagibigPremium + PagibigMPL + PagibigCalamityLoan
 *
 * These are always deducted first, before any loan/APDS deductions.
 *
 * Mandatory deductions that come from deduction_codes (GSIS policy loan,
 * GSIS emergency loan, Pag-IBIG MPL, Pag-IBIG calamity loan) are extracted
 * from the employee's payroll_deductions records and passed in as
 * `mandatoryLoanDeductions`. The statutory premiums (GSIS 9%, PhilHealth,
 * Pag-IBIG, withholding tax) are computed from basic salary.
 */
export function computePayrollDeductions(
  basicSalary: number,
  pera: number = 0,
  aca: number = 0,
  rata: number = 0,
  ontop: number = 0,
  longComp: number = 0,
  loanDeductions: number = 0,
  mandatoryLoanDeductions: number = 0,
  hazardPay: number = 0,
  salaryDifferential: number = 0,
  otherCompensation: number = 0,
  otherEarnings: number = 0,
): PayrollComputation {
  const basic = Number(basicSalary) || 0;
  const peraNum = Number(pera) || 0;
  const acaNum = Number(aca) || 0;
  const rataNum = Number(rata) || 0;
  const ontopNum = Number(ontop) || 0;
  const longNum = Number(longComp) || 0;
  const hazardNum = Number(hazardPay) || 0;
  const salDiffNum = Number(salaryDifferential) || 0;
  const otherCompNum = Number(otherCompensation) || 0;
  const otherEarnNum = Number(otherEarnings) || 0;
  const mandatoryLoans = Number(mandatoryLoanDeductions) || 0;

  // STEP 1 — Gross Pay
  const gross = computeGrossPay({
    basic, pera: peraNum, aca: acaNum, rata: rataNum, ontop: ontopNum,
    long: longNum, hazardPay: hazardNum, salaryDifferential: salDiffNum,
    otherCompensation: otherCompNum, otherEarnings: otherEarnNum,
  });

  // STEP 2 — Mandatory Deductions (statutory premiums + mandatory loans)
  const dedlnr = basic * 0.09;
  // PhilHealth: basic × 5% total, ceiling ₱100K → ₱5,000 total
  // Employee = floor(total/2), Government = total − employee (preserves exact sum)
  const totalPhilHealth = basic >= 100000 ? 5000.0 : round2(basic * 0.05);
  const dedmed = Math.floor(totalPhilHealth * 100 / 2) / 100;
  const govtmed = Math.round((totalPhilHealth - dedmed) * 100) / 100;
  const dedpag = 200.0;
  const govtlnr = basic * 0.12;
  const govtecc = 100.0;
  const govtpag = 200.0;

  const taxableIncome = Math.max(0, basic - dedlnr - dedmed - dedpag);
  const dedtax = computeWithholdingTax(taxableIncome);

  const mandatoryDeductions = dedlnr + dedmed + dedpag + dedtax + mandatoryLoans;

  // STEP 3 — Available Balance
  const availableBalance = gross - mandatoryDeductions;

  return {
    basic, pera: peraNum, aca: acaNum, rata: rataNum, ontop: ontopNum, long: longNum,
    hazardPay: hazardNum, salaryDifferential: salDiffNum,
    otherCompensation: otherCompNum, otherEarnings: otherEarnNum,
    dedlnr, dedmed, dedpag, dedtax,
    govtlnr, govtecc, govtmed, govtpag,
    taxableIncome, mandatoryDeductions,
    totalDeductions: mandatoryDeductions + loanDeductions,
    gross, netBeforeLoans: availableBalance, netPay: availableBalance - loanDeductions,
    loanDeductions,
    availableBalance,
    loanDeductionCapacity: 0,
  };
}
