// ── Government Agency Payroll Computation Engine ────────────────────────────
// Formulas match the PRE-MIGRATION Scrivia Cloud originals exactly:
//   GSIS L&R (ADJLNR)  → basic × 9% (flat)
//   Medicare (ADJMED)   → basic × 2.5% (flat)
//   W/Tax (PAYTAX)      → BIR TRAIN Law monthly brackets
//   Govt LNR            → basic × 12%
//   Govt ECC            → fixed ₱100
//   Govt MED            → basic × 2.5%
//
// Deduction inclusion + undeduction logic from nthp.ts (NTHP engine):
//   - Priority-based APDS deduction processing (DepEd Order No. 05, s. 2018)
//   - ₱5,000 minimum NTHP floor enforcement
//   - Undeducted obligations tracking
//
// Reference: src/lib/payroll.ts, src/lib/nthp.ts
// ────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── NTHP Threshold ─────────────────────────────────────────────────────────
export const NTHP_THRESHOLD = 5000.00;

// ── TRAIN Law Monthly Tax Brackets ─────────────────────────────────────────
const TAX_BRACKETS = [
  { max: 20833,   base: 0,        rate: 0 },
  { max: 33333,   base: 0,        rate: 0.15 },
  { max: 66667,   base: 1875,     rate: 0.20 },
  { max: 166667,  base: 8541.67,  rate: 0.25 },
  { max: 666667,  base: 33541.67, rate: 0.30 },
  { max: Infinity, base: 183541.67, rate: 0.35 },
];

// ── GSIS Loan & Account Types ───────────────────────────────────────────────
export const GSIS_LOAN_TYPES: Record<string, string> = {
  PL:  'Policy Loan',
  SL:  'Salary Loan',
  EL:  'Emergency Loan',
  RET: 'Retirement',
  CA:  'Cash Advance Loan',
  EA:  'Education Assistance',
  SPL: 'Stock Purchase',
  FP:  'Fly PAL',
  OL:  'Optional Loan',
  ELA: 'Emergency Loan Assistance',
  SOS: 'Supplementary Online Services',
  ESL: 'Emergency Salary Loan',
  RSL: 'Regular Salary Loan',
  KL:  'Kalinga Loan',
  KP:  'Kalinga Plus',
};

export const GSIS_PREMIUM_TYPES: Record<string, string> = {
  PS: 'Personal Share (Compulsory)',
  GS: 'Government Share (Compulsory)',
  EC: 'Employee Compensation',
  OP: 'Optional Policy Premium',
};

export const GSIS_PRENEED_PRODUCTS: Record<string, string> = {
  CE:  'CEAP',
  HI:  'Hospitalization Insurance',
  CI:  'FHPP-CIGNA',
  ED:  'EDU-CHILD',
  GE:  'Genesis Memorial',
  GF:  'Genesis Flexi',
  GP:  'Genesis Plus',
  GM:  'Genesis Special',
  GTI: 'Group Life Term Insurance',
};

export const GSIS_HOUSING_LOANS: Record<string, string> = {
  REL: 'REL / Pabahay Housing',
  LCH: 'Low Cost Housing (DCS)',
};

export const GSIS_BILL_ACCOUNTS = {
  ...GSIS_PREMIUM_TYPES,
  ...GSIS_LOAN_TYPES,
  ...GSIS_PRENEED_PRODUCTS,
  ...GSIS_HOUSING_LOANS,
};

// ── Tax Exemption Codes ─────────────────────────────────────────────────────
export const TAX_EXEMPTIONS: Record<string, { desc: string; annualExemption: number }> = {
  '01': { desc: 'Single, no dependents',              annualExemption: 20000 },
  '02': { desc: 'Married, 1 dependent',               annualExemption: 25000 },
  '03': { desc: 'Married, 2 dependents',              annualExemption: 32000 },
  '04': { desc: 'Head of family, 1 dependent',        annualExemption: 33000 },
  '05': { desc: 'Married, 3 dependents',              annualExemption: 41000 },
  '06': { desc: 'Married, 4 dependents',              annualExemption: 49000 },
  '07': { desc: 'Married, 5 dependents',              annualExemption: 57000 },
  '08': { desc: 'Head of family, 2 dependents',       annualExemption: 40000 },
  '09': { desc: 'Head of family, 3 dependents',       annualExemption: 48000 },
  '10': { desc: 'Head of family, 4 dependents',       annualExemption: 56000 },
  '11': { desc: 'Head of family, 5 dependents',       annualExemption: 64000 },
};

// ── Deduction Code Reference ────────────────────────────────────────────────
export const DEDUCTION_CODES: Record<string, { name: string; category: string; mandated: boolean }> = {
  '003': { name: 'GSIS Life & Retirement', category: 'gsis',     mandated: true },
  '009': { name: 'Medicare Arrears',       category: 'medicare',  mandated: false },
  '013': { name: 'Optional Deduction',     category: 'other',     mandated: false },
  '018': { name: 'L&R Arrears',            category: 'gsis',     mandated: false },
  '020': { name: 'Absence',                category: 'other',     mandated: false },
  '036': { name: 'Withholding Tax',        category: 'tax',       mandated: true },
  '037': { name: 'Overpayment',            category: 'other',     mandated: false },
  '068': { name: 'Absence (Type 2)',       category: 'other',     mandated: false },
  '090': { name: 'Optional (Type 2)',      category: 'other',     mandated: false },
  '111': { name: 'Medicare / PhilHealth',  category: 'medicare',  mandated: true },
  '187': { name: 'Health (Type 2)',        category: 'other',     mandated: false },
  '216': { name: 'Overpayment (Type 2)',   category: 'other',     mandated: false },
  '222': { name: 'PAG-IBIG Fund',          category: 'pagibig',   mandated: true },
  '301': { name: 'GSIS L&R (Legacy)',      category: 'gsis',      mandated: false },
  '381': { name: 'Health (Type 1)',        category: 'other',     mandated: false },
};

// ── NTHP Priority Order (Policy Library deped-001 — FY 2024 GAA Sec. 56) ───
// Lower number = higher priority (deducted first)
//
// Mandatory (always deducted first):
//   1. BIR (Withholding Tax)
//   2. PhilHealth
//   3. GSIS Premium
//   4. Pag-IBIG (HDMF) Premium
//   5. Salary overpayments / absences (DEPED P; GAA codes 0216/0068/0136)
//
// Loans & obligations (FIFS by date incurred):
//   6. GSIS Loans
//   7. Pag-IBIG (HDMF) Loans
//   8. Cooperatives / NSSLAs / Mutual Benefit Associations
//   9. Provident Funds
//   10. Government Financial Institutions
//   11. Insurance Companies
//   12. Rural/Thrift Banks
//   13. Other Accredited Lending Institutions

export interface DeductionRecord {
  dedCode: string;
  dedName: string;
  dedAmt: number;
  agency?: string;
  type?: string;
  effyy?: number;
  effmm?: number;
}

export interface ProcessedDeduction {
  deduction_code: string;
  deduction_description: string;
  scheduled_amount: number;
  deducted_amount: number;
  undeducted_amount: number;
  priority: number;
}

export interface UndeductedObligation {
  deduction_code: string;
  deduction_description: string;
  scheduled_amount: number;
  undeducted_amount: number;
  reason: string;
}

/**
 * Get NTHP deduction priority based on agency and type.
 * Lower number = higher priority = deducted first.
 */
export function getDeductionPriority(agency: string, type: string): number {
  const a = (agency ?? '').toUpperCase();
  const t = (type ?? '').toUpperCase();
  const isLoanType = t === 'L' || t === 'LOAN';
  const isHdmf = a === 'HDMF' || a === 'PAGIBIG' || a === 'PAG-IBIG';

  // Mandatory (Priority 1)
  if (a === 'BIR') return 1;
  if (a === 'PHIC' || a === 'PHILHEALTH') return 2;
  if (a === 'GSIS' && !isLoanType) return 3;
  if (isHdmf && !isLoanType) return 4;
  // Salary overpayments / absences (Priority 1(e))
  if (a === 'DEPED' && t === 'P') return 5;
  // Loans & obligations (Priority 2)
  if (a === 'GSIS' && isLoanType) return 6;
  if (isHdmf && isLoanType) return 7;
  if (t === 'C' || t === 'COOPERATIVE' || t === 'MBA') return 8;
  if (t === 'P' || t === 'PROVIDENT' || t === 'SAVINGS') return 9;
  if (t === 'INSURANCE') return 11;
  if (isLoanType) return 13;
  return 13;
}

// ────────────────────────────────────────────────────────────────────────────
// CORE COMPUTATION FUNCTIONS (Pre-Migration Formulas from payroll.ts)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute GSIS Life & Retirement (L&R) personal share.
 * Original: ADJLNR.PRG → flat 9% of basic pay
 */
export function computeGSISLifeRetirement(basic: number): number {
  return round2(basic * 0.09);
}

/** Government Life & Retirement share = Basic × 12% */
export function computeGovtLifeRetirement(basic: number): number {
  return round2(basic * 0.12);
}

/** Government ECC (Employee Compensation) = fixed ₱100 */
export function computeGovtECC(): number {
  return 100;
}

/**
 * PhilHealth premium total: basic × 5%, ceiling ₱100,000 → ₱5,000 total.
 * Employee share = floor(total / 2) to 2 decimal places.
 * Government share = total − employee share (preserves exact sum).
 */
export function computeMedicare(basic: number): number {
  const total = basic >= 100000 ? 5000.0 : round2(basic * 0.05);
  return Math.floor(total * 100 / 2) / 100;
}

export function computeGovtMedicare(basic: number): number {
  const total = basic >= 100000 ? 5000.0 : round2(basic * 0.05);
  const employee = Math.floor(total * 100 / 2) / 100;
  return Math.round((total - employee) * 100) / 100;
}

/**
 * Compute monthly withholding tax using BIR TRAIN Law brackets.
 * Original: PAYTAX.PRG
 */
export function computeWithholdingTax(taxableIncome: number): number {
  const ti = Math.max(0, taxableIncome);
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    if (ti <= TAX_BRACKETS[i].max) {
      const prevMax = i === 0 ? 0 : TAX_BRACKETS[i - 1].max;
      return round2(TAX_BRACKETS[i].base + (ti - prevMax) * TAX_BRACKETS[i].rate);
    }
  }
  return 0;
}

/**
 * Determine if a deduction should be included (inclusion rule).
 * Original: PAYRINCL.PRG
 *
 * If (netPay − accumulated − newDeduction) < ₱5,000: EXCLUDE
 * If QS = 'U': EXCLUDE
 */
export function shouldIncludeDeduction(
  netPay: number,
  accumulated: number,
  amount: number,
  qs: string,
): boolean {
  if (qs === 'U') return false;
  if (netPay - accumulated - amount < NTHP_THRESHOLD) return false;
  return true;
}

/**
 * Check for negative pay (takehome below ₱5,000).
 * Original: PAYRNEG.PRG
 */
export function checkNegativePay(takeHome: number): { isNegative: boolean; deficit: number } {
  const deficit = NTHP_THRESHOLD - takeHome;
  return {
    isNegative: deficit > 0,
    deficit: round2(Math.max(0, deficit)),
  };
}

/**
 * STEP 4–7 — Process APDS deductions with NTHP enforcement.
 *
 * Step 4: LoanDeductionCapacity = AvailableBalance - ₱5,000
 *         If capacity <= 0, ALL non-mandatory deductions become undeducted.
 * Step 5: Process APDS deductions by priority. For each:
 *         If RemainingCapacity >= DeductionAmount → deduct full amount
 *         Else → move to Undeducted Obligations
 * Step 6: TotalDeductions = MandatoryDeductions + ApprovedLoanDeductions
 * Step 7: NetPay = GrossPay - TotalDeductions
 *         If NetPay < ₱5,000 → reverse last loan deduction, move to undeducted,
 *         recompute until NetPay >= ₱5,000.
 */
export function processDeductionsWithNTHP(
  netPayBeforeLoans: number,
  loanDeductions: DeductionRecord[],
): {
  actualLoanDeductions: number;
  undeductedObligations: UndeductedObligation[];
  processedDeductions: ProcessedDeduction[];
  finalNetPay: number;
  nthpStatus: 'PASS' | 'FAIL';
  loanDeductionCapacity: number;
} {
  const availableBalance = netPayBeforeLoans;
  const loanDeductionCapacity = availableBalance - NTHP_THRESHOLD;

  // Sort by priority (ascending), then FIFO by effective date
  const sorted = [...loanDeductions].sort((a, b) => {
    const pa = getDeductionPriority(a.agency ?? '', a.type ?? '');
    const pb = getDeductionPriority(b.agency ?? '', b.type ?? '');
    if (pa !== pb) return pa - pb;
    const effA = (Number(a.effyy) || 0) * 100 + (Number(a.effmm) || 0);
    const effB = (Number(b.effyy) || 0) * 100 + (Number(b.effmm) || 0);
    if (effA !== effB) return effA - effB;
    return (a.dedCode ?? '').localeCompare(b.dedCode ?? '');
  });

  const processed: ProcessedDeduction[] = [];
  const undeducted: UndeductedObligation[] = [];

  // If capacity <= 0, ALL non-mandatory deductions become undeducted
  if (loanDeductionCapacity <= 0) {
    for (const d of sorted) {
      const amount = round2(Number(d.dedAmt) || 0);
      if (amount <= 0) continue;
      processed.push({
        deduction_code: d.dedCode,
        deduction_description: d.dedName || d.dedCode,
        scheduled_amount: amount,
        deducted_amount: 0,
        undeducted_amount: amount,
        priority: getDeductionPriority(d.agency ?? '', d.type ?? ''),
      });
      undeducted.push({
        deduction_code: d.dedCode,
        deduction_description: d.dedName || d.dedCode,
        scheduled_amount: amount,
        undeducted_amount: amount,
        reason: 'NTHP Threshold Reached',
      });
    }
    return {
      actualLoanDeductions: 0,
      undeductedObligations: undeducted,
      processedDeductions: processed,
      finalNetPay: availableBalance,
      nthpStatus: availableBalance >= NTHP_THRESHOLD ? 'PASS' : 'FAIL',
      loanDeductionCapacity,
    };
  }

  // Step 5 — Process by priority
  let remainingCapacity = loanDeductionCapacity;
  let actualLoanDeductions = 0;
  const deductedLog: ProcessedDeduction[] = [];

  for (const d of sorted) {
    const amount = round2(Number(d.dedAmt) || 0);
    if (amount <= 0) continue;

    const priority = getDeductionPriority(d.agency ?? '', d.type ?? '');

    if (remainingCapacity >= amount) {
      remainingCapacity -= amount;
      actualLoanDeductions += amount;
      const rec: ProcessedDeduction = {
        deduction_code: d.dedCode,
        deduction_description: d.dedName || d.dedCode,
        scheduled_amount: amount,
        deducted_amount: amount,
        undeducted_amount: 0,
        priority,
      };
      processed.push(rec);
      deductedLog.push(rec);
    } else {
      processed.push({
        deduction_code: d.dedCode,
        deduction_description: d.dedName || d.dedCode,
        scheduled_amount: amount,
        deducted_amount: 0,
        undeducted_amount: amount,
        priority,
      });
      undeducted.push({
        deduction_code: d.dedCode,
        deduction_description: d.dedName || d.dedCode,
        scheduled_amount: amount,
        undeducted_amount: amount,
        reason: 'NTHP Threshold Reached',
      });
    }
  }

  // Step 7 — NTHP reversal: ensure NetPay >= ₱5,000
  let netPay = availableBalance - actualLoanDeductions;
  while (netPay < NTHP_THRESHOLD && deductedLog.length > 0) {
    const last = deductedLog.pop()!;
    actualLoanDeductions -= last.deducted_amount;
    last.deducted_amount = 0;
    last.undeducted_amount = last.scheduled_amount;
    undeducted.push({
      deduction_code: last.deduction_code,
      deduction_description: last.deduction_description,
      scheduled_amount: last.scheduled_amount,
      undeducted_amount: last.scheduled_amount,
      reason: 'NTHP Threshold Reached',
    });
    const pIdx = processed.findIndex(
      (p) => p.deduction_code === last.deduction_code && p.deducted_amount > 0,
    );
    if (pIdx >= 0) {
      processed[pIdx].deducted_amount = 0;
      processed[pIdx].undeducted_amount = last.scheduled_amount;
    }
    netPay = availableBalance - actualLoanDeductions;
  }

  return {
    actualLoanDeductions,
    undeductedObligations: undeducted,
    processedDeductions: processed,
    finalNetPay: netPay,
    nthpStatus: netPay >= NTHP_THRESHOLD ? 'PASS' : 'FAIL',
    loanDeductionCapacity,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// W-2 ANNUAL TAX COMPUTATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute W-2 annual tax for an employee across all payroll records.
 */
export function computeW2Tax(records: {
  basic: number;
  trans: number;
  aca: number;
  dedLnr: number;
  dedMed: number;
  dedPag: number;
  dedTax: number;
  health?: number;
  optional?: number;
  addlPag?: number;
  addlTax?: number;
  taxCode: string;
}[]): {
  totalBasic: number;
  totalAca: number;
  totalLnr: number;
  totalMed: number;
  totalPag: number;
  totalWtax: number;
  exemption: number;
  taxableIncome: number;
  annualTaxDue: number;
  totalTaxPaid: number;
  taxPayable: number;
  isRefund: boolean;
} {
  let totalBasic = 0;
  let totalAca = 0;
  let totalLnr = 0;
  let totalMed = 0;
  let totalPag = 0;
  let totalWtax = 0;
  let totalHealth = 0;
  let totalOptional = 0;
  let totalAddlPag = 0;
  let totalAddlTax = 0;
  const taxCode = records[0]?.taxCode || '01';

  for (const r of records) {
    totalBasic += r.basic + r.trans;
    totalAca += r.aca;
    totalLnr += r.dedLnr;
    totalMed += r.dedMed;
    totalPag += r.dedPag;
    totalWtax += r.dedTax;
    totalHealth += r.health || 0;
    totalOptional += r.optional || 0;
    totalAddlPag += r.addlPag || 0;
    totalAddlTax += r.addlTax || 0;
  }

  const exempt = 250000; // TRAIN Law: ₱250,000 annual threshold
  const taxableIncome = Math.max(0, totalBasic - (exempt + totalLnr + totalMed + totalPag + totalHealth + totalOptional + totalAddlPag));

  // Apply TRAIN Law annual tax brackets
  let annualTax = 0;
  if (taxableIncome <= 250000) {
    annualTax = 0;
  } else if (taxableIncome <= 400000) {
    annualTax = (taxableIncome - 250000) * 0.20;
  } else if (taxableIncome <= 800000) {
    annualTax = 30000 + (taxableIncome - 400000) * 0.25;
  } else if (taxableIncome <= 2000000) {
    annualTax = 130000 + (taxableIncome - 800000) * 0.30;
  } else if (taxableIncome <= 8000000) {
    annualTax = 490000 + (taxableIncome - 2000000) * 0.32;
  } else {
    annualTax = 2410000 + (taxableIncome - 8000000) * 0.35;
  }

  const taxPayable = annualTax - totalWtax - totalAddlTax;

  return {
    totalBasic: round2(totalBasic),
    totalAca: round2(totalAca),
    totalLnr: round2(totalLnr),
    totalMed: round2(totalMed),
    totalPag: round2(totalPag),
    totalWtax: round2(totalWtax),
    exemption: exempt,
    taxableIncome: round2(taxableIncome),
    annualTaxDue: round2(annualTax),
    totalTaxPaid: round2(totalWtax + totalAddlTax),
    taxPayable: round2(taxPayable),
    isRefund: taxPayable < 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// FULL PAYROLL GENERATION (from payroll.ts computePayrollDeductions)
// ────────────────────────────────────────────────────────────────────────────

export interface GovPayrollInput {
  empNo: string;
  fname: string;
  lname: string;
  mi?: string;
  appel?: string;
  regCode: string;
  divCode: string;
  staCode: string;
  posCode: string;
  grade: string;
  step: string;
  basic: number;
  trans: number;
  pera: number;
  aca: number;
  onTop: number;
  longev: number;
  rata: number;
  dedPag: number;
  taxCode: string;
  tin?: string;
  gsisPn?: string;
  account?: string;
  payMode: string;
  banker?: string;
  deductions: DeductionRecord[];
}

export interface GovPayrollResult {
  empNo: string;
  fname: string;
  lname: string;
  mi: string;
  appel: string;
  regCode: string;
  divCode: string;
  staCode: string;
  posCode: string;
  grade: string;
  step: string;
  basic: number;
  trans: number;
  pera: number;
  aca: number;
  onTop: number;
  longev: number;
  rata: number;
  gross: number;
  dedLnr: number;
  dedMed: number;
  dedPag: number;
  dedTax: number;
  otherDed: number;
  totalDeductions: number;
  govtLnr: number;
  govtEcc: number;
  govtMed: number;
  takeHome: number;
  take15: number;
  take30: number;
  taxCode: string;
  tin: string;
  gsisPn: string;
  account: string;
  payMode: string;
  banker: string;
  negativePay: { isNegative: boolean; deficit: number };
  undeductedObligations: UndeductedObligation[];
  processedDeductions: ProcessedDeduction[];
  nthpStatus: 'PASS' | 'FAIL';
  loanDeductionCapacity: number;
}

/**
 * Generate payroll for a single employee (the core of PAYRGEN.PRG).
 * Computes all mandated deductions, applies the NTHP deduction inclusion rule,
 * and determines negative pay / undeducted obligations.
 */
export function generateEmployeePayroll(emp: GovPayrollInput): GovPayrollResult {
  // STEP 1 — Gross Pay (payroll.ts: computeGrossPay)
  const gross = round2(emp.basic + emp.trans + emp.pera + emp.aca + emp.onTop + emp.longev + emp.rata);

  // STEP 2 — Mandatory Deductions (payroll.ts formulas)
  const dedLnr = computeGSISLifeRetirement(emp.basic);       // basic × 9%
  const dedMed = computeMedicare(emp.basic);                  // basic × 2.5%
  const dedPag = emp.dedPag;                                  // fixed ₱200

  // Taxable income for withholding tax
  const taxableIncome = Math.max(0, emp.basic - dedLnr - dedMed - dedPag);

  // TRAIN Law withholding tax
  const dedTax = computeWithholdingTax(taxableIncome);

  // Government shares
  const govtLnr = computeGovtLifeRetirement(emp.basic);   // basic × 12%
  const govtEcc = computeGovtECC();                        // fixed ₱100
  const govtMed = computeGovtMedicare(emp.basic);          // basic × 2.5%

  // STEP 3 — Mandatory deductions total
  const mandatoryDeductions = round2(dedLnr + dedMed + dedPag + dedTax);
  const availableBalance = round2(gross - mandatoryDeductions);

  // STEP 4-7 — NTHP deduction processing
  const nthpResult = processDeductionsWithNTHP(availableBalance, emp.deductions);

  const totalDeductions = round2(mandatoryDeductions + nthpResult.actualLoanDeductions);
  const takeHome = round2(gross - totalDeductions);

  // Semi-monthly split (PYENT)
  const take15 = Math.floor(takeHome / 2);
  const take30 = takeHome - take15;

  return {
    empNo: emp.empNo,
    fname: emp.fname,
    lname: emp.lname,
    mi: emp.mi || '',
    appel: emp.appel || '',
    regCode: emp.regCode,
    divCode: emp.divCode,
    staCode: emp.staCode,
    posCode: emp.posCode,
    grade: emp.grade,
    step: emp.step,
    basic: emp.basic,
    trans: emp.trans,
    pera: emp.pera,
    aca: emp.aca,
    onTop: emp.onTop,
    longev: emp.longev,
    rata: emp.rata,
    gross,
    dedLnr,
    dedMed,
    dedPag,
    dedTax,
    otherDed: nthpResult.actualLoanDeductions,
    totalDeductions,
    govtLnr,
    govtEcc,
    govtMed,
    takeHome,
    take15,
    take30,
    taxCode: emp.taxCode,
    tin: emp.tin || '',
    gsisPn: emp.gsisPn || '',
    account: emp.account || '',
    payMode: emp.payMode,
    banker: emp.banker || '',
    negativePay: checkNegativePay(takeHome),
    undeductedObligations: nthpResult.undeductedObligations,
    processedDeductions: nthpResult.processedDeductions,
    nthpStatus: nthpResult.nthpStatus,
    loanDeductionCapacity: nthpResult.loanDeductionCapacity,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// REMITTANCE SUMMARY (GSISARS.PRG)
// ────────────────────────────────────────────────────────────────────────────

export interface RemittanceSummary {
  totalLnr: number;
  totalGovtLnr: number;
  totalGovtEcc: number;
  totalMed: number;
  totalGovtMed: number;
  totalPag: number;
  totalTax: number;
  employeeCount: number;
  byStation: Record<string, { count: number; totalBasic: number; totalNetPay: number }>;
}

export function buildRemittanceSummary(records: GovPayrollResult[]): RemittanceSummary {
  const summary: RemittanceSummary = {
    totalLnr: 0,
    totalGovtLnr: 0,
    totalGovtEcc: 0,
    totalMed: 0,
    totalGovtMed: 0,
    totalPag: 0,
    totalTax: 0,
    employeeCount: records.length,
    byStation: {},
  };

  for (const r of records) {
    summary.totalLnr += r.dedLnr;
    summary.totalGovtLnr += r.govtLnr;
    summary.totalGovtEcc += r.govtEcc;
    summary.totalMed += r.dedMed;
    summary.totalGovtMed += r.govtMed;
    summary.totalPag += r.dedPag;
    summary.totalTax += r.dedTax;

    if (!summary.byStation[r.staCode]) {
      summary.byStation[r.staCode] = { count: 0, totalBasic: 0, totalNetPay: 0 };
    }
    summary.byStation[r.staCode].count++;
    summary.byStation[r.staCode].totalBasic += r.basic;
    summary.byStation[r.staCode].totalNetPay += r.takeHome;
  }

  summary.totalLnr = round2(summary.totalLnr);
  summary.totalGovtLnr = round2(summary.totalGovtLnr);
  summary.totalGovtEcc = round2(summary.totalGovtEcc);
  summary.totalMed = round2(summary.totalMed);
  summary.totalGovtMed = round2(summary.totalGovtMed);
  summary.totalPag = round2(summary.totalPag);
  summary.totalTax = round2(summary.totalTax);

  return summary;
}

// ────────────────────────────────────────────────────────────────────────────
// SALARY GRADE LOOKUP
// ────────────────────────────────────────────────────────────────────────────

export interface SalaryGradeRow {
  grade: string;
  step1: number; step2: number; step3: number; step4: number;
  step5: number; step6: number; step7: number; step8: number;
  salaryYear: string;
}

export function lookupSalary(row: SalaryGradeRow, step: string): number {
  const stepMap: Record<string, number> = {
    '1': row.step1, '2': row.step2, '3': row.step3, '4': row.step4,
    '5': row.step5, '6': row.step6, '7': row.step7, '8': row.step8,
  };
  return stepMap[step] || 0;
}
