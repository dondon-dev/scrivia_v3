import type { PayrollDeduction, DeductionCode } from '@/types/payroll';

export const NTHP_THRESHOLD = 5000.00;

/**
 * NTHP Priority Order per DepEd Order No. 05, s. 2018.
 * Lower number = higher priority (deducted first).
 *
 * Mandatory deductions (always deducted first, Step 2):
 * 1. BIR (Withholding Tax)
 * 2. PhilHealth
 * 3. GSIS Premium
 * 4. GSIS Loans (policy loan, emergency loan — mandatory)
 * 5. Pag-IBIG Premium (HDMF)
 * 6. Pag-IBIG Loans (MPL, calamity loan — mandatory)
 *
 * APDS deductions (Step 5), processed by priority:
 * 7.  Cooperatives
 * 8.  Mutual Benefit Associations
 * 9.  Provident Funds
 * 10. Government Financial Institutions
 * 11. Insurance Companies
 * 12. Rural/Thrift Banks
 * 13. Other Accredited Lending Institutions
 */
function isLoan(t: string): boolean {
  return t === 'L' || t === 'LOAN';
}
function isCooperative(t: string): boolean {
  return t === 'C' || t === 'COOPERATIVE';
}
function isProvident(t: string): boolean {
  return t === 'P' || t === 'PROVIDENT' || t === 'SAVINGS';
}
function isHdmf(a: string): boolean {
  return a === 'HDMF' || a === 'PAGIBIG' || a === 'PAG-IBIG';
}
function isPhilhealth(a: string): boolean {
  return a === 'PHIC' || a === 'PHILHEALTH';
}

export function getDeductionPriority(agency: string, type: string, dedcode?: string): number {
  const a = (agency ?? '').toUpperCase();
  const t = (type ?? '').toUpperCase();
  const dc = (dedcode ?? '').toUpperCase();

  // Mandatory — deducted first (Step 2)
  if (a === 'BIR') return 1;
  if (isPhilhealth(a)) return 2;
  if (a === 'GSIS' && !isLoan(t)) return 3;
  if (a === 'GSIS' && isLoan(t)) return 4;
  if (isHdmf(a) && !isLoan(t)) return 5;
  if (isHdmf(a) && isLoan(t)) return 6;

  // APDS priority order (Step 5)
  if (isCooperative(t)) return 7;           // Cooperatives
  if (dc.includes('MBA')) return 8;
  if (dc.includes('PROVIDENT') || dc.includes('PF') || isProvident(t)) return 9;
  if (a === 'DEPED' && isLoan(t)) return 9;
  if (t === 'INSURANCE' || (isProvident(t) && a === 'OTHER')) return 11;  // Insurance companies
  if (isLoan(t) && a === 'OTHER') return 13;  // Other lending institutions
  if (isProvident(t)) return 11;
  if (isLoan(t)) return 13;
  return 13;
}

/**
 * Combine the INCLUDED/EXCLUDED payroll-band priority (from the deduction
 * row's `priority` column) with the agency/type NTHP priority to produce the
 * effective sort priority. Mirrors the server engine's GAA ORDER BY:
 * INCLUDED(1) first, normal(0) middle, EXCLUDED(2) last.
 *
 * 1 = INCLUDED  -> highest band (deducted first)
 * 0/default     -> normal band
 * 2 = EXCLUDED  -> least priority band (deducted last / first to be undeducted)
 */
export function getEffectiveDeductionPriority(
  agency: string,
  type: string,
  dedcode: string | undefined,
  rowPriority: number | null | undefined,
): number {
  const base = getDeductionPriority(agency, type, dedcode);
  if (rowPriority === 2) return 1000 + base;
  if (rowPriority === 1) return -1000 + base;
  return base;
}

/**
 * Classify a deduction as mandatory (always deducted first) vs APDS (loan).
 * Mandatory = BIR withholding tax, PhilHealth, GSIS premium+loans, Pag-IBIG premium+loans.
 */
export function isMandatoryDeduction(agency: string, type: string): boolean {
  const a = (agency ?? '').toUpperCase();
  const t = (type ?? '').toUpperCase();
  return a === 'BIR' || isPhilhealth(a) || a === 'GSIS' || (isHdmf(a) && (isLoan(t) || isProvident(t) || t === 'MANDATORY'));
}

export interface UndeductedObligationInput {
  deduction_code: string;
  deduction_description: string;
  scheduled_amount: number;
  undeducted_amount: number;
  station_code: string;
  reason: string;
}

export interface ProcessedDeduction {
  deduction_code: string;
  deduction_description: string;
  scheduled_amount: number;
  deducted_amount: number;
  undeducted_amount: number;
  priority: number;
  is_mandatory: boolean;
}

export interface NthpResult {
  actualLoanDeductions: number;
  mandatoryLoanDeductions: number;
  undeductedObligations: UndeductedObligationInput[];
  processedDeductions: ProcessedDeduction[];
  nthpStatus: 'PASS' | 'FAIL';
  finalNetPay: number;
  availableBalance: number;
  loanDeductionCapacity: number;
}

/**
 * Extract mandatory loan deductions (GSIS policy loan, GSIS emergency loan,
 * Pag-IBIG MPL, Pag-IBIG calamity loan) from the employee's payroll deductions.
 *
 * These are mandatory deductions per DepEd APDS — always deducted first.
 * Returns the total mandatory loan amount and the remaining non-mandatory
 * (APDS) deductions for priority processing.
 */
export function separateMandatoryLoans(
  deductions: PayrollDeduction[],
  dedCodeMap: Map<string, DeductionCode>,
): { mandatoryLoans: PayrollDeduction[]; apdsDeductions: PayrollDeduction[]; totalMandatoryLoanAmount: number } {
  const mandatoryLoans: PayrollDeduction[] = [];
  const apdsDeductions: PayrollDeduction[] = [];
  let totalMandatoryLoanAmount = 0;

  for (const d of deductions) {
    const code = dedCodeMap.get(d.dedcode);
    const agency = code?.agency ?? '';
    const type = code?.type ?? '';

    const tUpper = (type ?? '').toUpperCase();
    if (isMandatoryDeduction(agency, type) && (tUpper === 'L' || tUpper === 'LOAN')) {
      mandatoryLoans.push(d);
      totalMandatoryLoanAmount += Number(d.dedamt) || 0;
    } else if (!isMandatoryDeduction(agency, type)) {
      apdsDeductions.push(d);
    }
  }

  return { mandatoryLoans, apdsDeductions, totalMandatoryLoanAmount };
}

/**
 * STEP 4–7 — Process APDS deductions with NTHP enforcement.
 *
 * Step 4: Compute LoanDeductionCapacity = AvailableBalance - MinimumNTHP
 *         If capacity <= 0, all non-mandatory deductions become undeducted.
 * Step 5: Process APDS deductions by priority. For each:
 *         If RemainingCapacity >= DeductionAmount → deduct full amount
 *         Else → move to Undeducted Obligations, don't extend termination date.
 * Step 6: TotalDeductions = MandatoryDeductions + ApprovedLoanDeductions
 * Step 7: NetPay = GrossPay - TotalDeductions
 *         If NetPay < 5000 → reverse last loan deduction, move to undeducted,
 *         recompute until NetPay >= 5000.
 *
 * @param netPayBeforeLoans  Available balance after mandatory deductions (Step 3)
 * @param loanDeductions     All non-mandatory (APDS) loan deductions for the employee
 * @param dedCodeMap         Deduction code lookup for agency/type/priority
 * @param stationCode        Employee's station code for undeducted obligations report
 */
export function applyNthpCompliance(
  netPayBeforeLoans: number,
  loanDeductions: PayrollDeduction[],
  dedCodeMap: Map<string, DeductionCode>,
  stationCode: string = '',
  mandatoryLoanDeductions: number = 0,
): NthpResult {
  // Step 4 — Loan Deduction Capacity
  const availableBalance = netPayBeforeLoans;
  const loanDeductionCapacity = availableBalance - NTHP_THRESHOLD;

  // Sort APDS deductions by priority, then FIRST-IN-FIRST-SERVE: within the
  // same priority, the deduction that took effect earliest (EFFYY/EFFMM) is
  // served first, so older obligations are deducted before newer ones.
  const sorted = [...loanDeductions].sort((a, b) => {
    const pa = getEffectiveDeductionPriority(
      dedCodeMap.get(a.dedcode)?.agency ?? '',
      dedCodeMap.get(a.dedcode)?.type ?? '',
      a.dedcode,
      a.priority,
    );
    const pb = getEffectiveDeductionPriority(
      dedCodeMap.get(b.dedcode)?.agency ?? '',
      dedCodeMap.get(b.dedcode)?.type ?? '',
      b.dedcode,
      b.priority,
    );
    if (pa !== pb) return pa - pb;
    // FIFO — first effective date served first
    const effA = (Number(a.effyy) || 0) * 100 + (Number(a.effmm) || 0);
    const effB = (Number(b.effyy) || 0) * 100 + (Number(b.effmm) || 0);
    if (effA !== effB) return effA - effB;
    return (a.dedcode ?? '').localeCompare(b.dedcode ?? '');
  });

  const processed: ProcessedDeduction[] = [];
  const undeducted: UndeductedObligationInput[] = [];
  const deductedLog: ProcessedDeduction[] = [];

  // If capacity <= 0, ALL non-mandatory deductions become undeducted
  if (loanDeductionCapacity <= 0) {
    for (const d of sorted) {
      const amount = Number(d.dedamt) || 0;
      if (amount <= 0) continue;
      const code = dedCodeMap.get(d.dedcode);
      const desc = code?.dedname ?? d.dedcode;
      processed.push({
        deduction_code: d.dedcode,
        deduction_description: desc,
        scheduled_amount: amount,
        deducted_amount: 0,
        undeducted_amount: amount,
        priority: getEffectiveDeductionPriority(code?.agency ?? '', code?.type ?? '', d.dedcode, d.priority),
        is_mandatory: false,
      });
      undeducted.push({
        deduction_code: d.dedcode,
        deduction_description: desc,
        scheduled_amount: amount,
        undeducted_amount: amount,
        station_code: stationCode,
        reason: 'NTHP Threshold Reached',
      });
    }

    const finalNetPay = availableBalance;
    return {
      actualLoanDeductions: 0,
      mandatoryLoanDeductions,
      undeductedObligations: undeducted,
      processedDeductions: processed,
      nthpStatus: finalNetPay >= NTHP_THRESHOLD ? 'PASS' : 'FAIL',
      finalNetPay,
      availableBalance,
      loanDeductionCapacity,
    };
  }

  // Step 5 — Process APDS deductions by priority
  let remainingCapacity = loanDeductionCapacity;
  let actualLoanDeductions = 0;

  for (const d of sorted) {
    const amount = Number(d.dedamt) || 0;
    if (amount <= 0) continue;

    const code = dedCodeMap.get(d.dedcode);
    const desc = code?.dedname ?? d.dedcode;
    const priority = getEffectiveDeductionPriority(code?.agency ?? '', code?.type ?? '', d.dedcode, d.priority);

    if (remainingCapacity >= amount) {
      // Deduct full amount
      remainingCapacity -= amount;
      actualLoanDeductions += amount;
      const rec: ProcessedDeduction = {
        deduction_code: d.dedcode,
        deduction_description: desc,
        scheduled_amount: amount,
        deducted_amount: amount,
        undeducted_amount: 0,
        priority,
        is_mandatory: false,
      };
      processed.push(rec);
      deductedLog.push(rec);
    } else {
      // Move to Undeducted Obligations — do not extend termination date
      processed.push({
        deduction_code: d.dedcode,
        deduction_description: desc,
        scheduled_amount: amount,
        deducted_amount: 0,
        undeducted_amount: amount,
        priority,
        is_mandatory: false,
      });
      undeducted.push({
        deduction_code: d.dedcode,
        deduction_description: desc,
        scheduled_amount: amount,
        undeducted_amount: amount,
        station_code: stationCode,
        reason: 'NTHP Threshold Reached',
      });
    }
  }

  // Step 7 — NTHP reversal: ensure NetPay >= 5000
  // NetPay = availableBalance - actualLoanDeductions
  // If < 5000, reverse the last processed loan deduction(s)
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
      station_code: stationCode,
      reason: 'NTHP Threshold Reached',
    });
    // Update the processed log entry
    const pIdx = processed.findIndex(
      (p) => p.deduction_code === last.deduction_code && p.deducted_amount > 0,
    );
    if (pIdx >= 0) {
      processed[pIdx].deducted_amount = 0;
      processed[pIdx].undeducted_amount = last.scheduled_amount;
    }
    netPay = availableBalance - actualLoanDeductions;
  }

  const finalNetPay = netPay;
  const nthpStatus: 'PASS' | 'FAIL' = finalNetPay >= NTHP_THRESHOLD ? 'PASS' : 'FAIL';

  return {
    actualLoanDeductions,
    mandatoryLoanDeductions,
    undeductedObligations: undeducted,
    processedDeductions: processed,
    nthpStatus,
    finalNetPay,
    availableBalance,
    loanDeductionCapacity,
  };
}

/**
 * Convenience function: separate an employee's deductions into mandatory loans
 * and APDS deductions, then run full NTHP compliance.
 *
 * This is the main entry point for the payroll computation engine. It:
 * 1. Separates mandatory loan deductions (GSIS policy/emergency, Pag-IBIG MPL/calamity)
 * 2. Passes APDS deductions through priority-based NTHP processing
 * 3. Returns the full computation result with undeducted obligations
 */
export function processEmployeeDeductions(
  netPayBeforeLoans: number,
  allDeductions: PayrollDeduction[],
  dedCodeMap: Map<string, DeductionCode>,
  stationCode: string = '',
): NthpResult {
  const { apdsDeductions, totalMandatoryLoanAmount } = separateMandatoryLoans(allDeductions, dedCodeMap);
  return applyNthpCompliance(
    netPayBeforeLoans - totalMandatoryLoanAmount,
    apdsDeductions,
    dedCodeMap,
    stationCode,
    totalMandatoryLoanAmount,
  );
}
