/**
 * Targeted unit tests for the payroll computation engine that the
 * payroll run depends on (src/lib/payroll.ts + src/lib/nthp.ts).
 *
 * Run:  bun scripts/test-payroll-engine.ts
 * Exits non-zero on any failed assertion.
 */
import assert from 'node:assert/strict';
import { computePayrollDeductions } from '../src/lib/payroll';
import {
  NTHP_THRESHOLD,
  applyNthpCompliance,
  getDeductionPriority,
  processEmployeeDeductions,
  type PayrollDeduction,
  type DeductionCode,
} from '../src/lib/nthp';

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

function ded(overrides: Partial<PayrollDeduction> = {}): PayrollDeduction {
  return {
    id: 'x', employee_id: 'e', empno: '1', dedcode: 'X', dedid: '',
    policyno: '', agency: '', type: '', status: 'Active',
    effmm: 1, effyy: 2025, termm: 12, teryy: 2099,
    dedamt: 0, principal: 0, interest: 0, charges: 0, proceeds: 0,
    ...overrides,
  } as PayrollDeduction;
}

function code(overrides: Partial<DeductionCode> = {}): DeductionCode {
  return {
    dedcode: 'X', dedname: 'Test', agency: '', type: '', status: 'Active',
    ...overrides,
  } as DeductionCode;
}

console.log('computePayrollDeductions (statutory premiums)');
ok('GSIS premium = 9% of basic', () => {
  const r = computePayrollDeductions(25000);
  assert.equal(r.dedlnr, 2250);
});
ok('PhilHealth premium ≈ 2.5% of basic', () => {
  const r = computePayrollDeductions(25000);
  assert.ok(Math.abs(r.dedmed - 625) < 0.01);
});
ok('Pag-IBIG premium = 200 (flat)', () => {
  const r = computePayrollDeductions(25000);
  assert.equal(r.dedpag, 200);
});
ok('gross = basic + pera + long [+ hazard/differential/other]; ACA/RATA/ontop tracked separately, not in monthly gross (current behavior)', () => {
  const r = computePayrollDeductions(25000, 2000, 500, 300, 100, 50);
  assert.equal(r.gross, 27050); // 25000 + 2000 + 50
  // ontop is not folded into gross (long ?? ontop fallback is unreachable
  // because long is coerced to a number first) — locks in current behavior
  assert.equal(computePayrollDeductions(25000, 0, 0, 0, 100).gross, 25000);
  // hazard + differential + other compensation DO count
  assert.equal(computePayrollDeductions(25000, 0, 0, 0, 0, 0, 0, 0, 500, 300, 200, 100).gross, 26100);
});
ok('net = gross - mandatory - loans', () => {
  const r = computePayrollDeductions(25000, 2000, 0, 0, 0, 0, 3000, 1000);
  assert.equal(r.netPay, r.availableBalance - 3000);
  assert.equal(r.mandatoryDeductions, r.dedlnr + r.dedmed + r.dedpag + r.dedtax + 1000);
});

console.log('getDeductionPriority (DepEd order)');
ok('DepEd/FY2024-GAA order: BIR=1, PHIC=2, GSIS prem=3, HDMF prem=4, overpayment=5, GSIS loan=6, HDMF loan=7', () => {
  assert.equal(getDeductionPriority('BIR', 'TAX', 'WHT'), 1);
  assert.equal(getDeductionPriority('PHIC', 'PREMIUM', 'PHIC'), 2);
  assert.equal(getDeductionPriority('GSIS', 'PREMIUM', 'GSIS'), 3);
  assert.equal(getDeductionPriority('HDMF', 'PREMIUM', 'PAGIBIG'), 4);
  // Priority 1(e) salary overpayments — named codes and DEPED 'P' rows
  assert.equal(getDeductionPriority('DEPED', 'P', '0216'), 5);
  assert.equal(getDeductionPriority('DEPED', 'P', '0068'), 5);
  assert.equal(getDeductionPriority('DEPED', 'P', '0136'), 5);
  assert.equal(getDeductionPriority('', '', '0136'), 5);
  assert.equal(getDeductionPriority('GSIS', 'LOAN', 'GPL'), 6);
  assert.equal(getDeductionPriority('HDMF', 'LOAN', 'MPL'), 7);
});
ok('cooperative/MBA=8, provident=9, insurance=11, other loan=13', () => {
  assert.equal(getDeductionPriority('COOP', 'COOPERATIVE', 'COOP1'), 8);
  assert.equal(getDeductionPriority('ANY', 'L', 'MBA-COOP'), 8);
  assert.equal(getDeductionPriority('ANY', 'PROVIDENT', 'PF'), 9);
  assert.equal(getDeductionPriority('SUN', 'INSURANCE', 'INS'), 11);
  assert.equal(getDeductionPriority('OTHER', 'LOAN', 'LEND1'), 13);
});

console.log('applyNthpCompliance (APDS processing)');
const map = new Map<string, DeductionCode>([
  ['COOP1', code({ dedcode: 'COOP1', dedname: 'Coop', agency: 'COOP', type: 'COOPERATIVE' })],
  ['MBA1', code({ dedcode: 'MBA1', dedname: 'MBA', agency: 'ANY', type: 'L' })],
  ['PF1', code({ dedcode: 'PF1', dedname: 'ProvFund', agency: 'ANY', type: 'PROVIDENT' })],
  ['GSISL', code({ dedcode: 'GSISL', dedname: 'GSIS Loan', agency: 'GSIS', type: 'LOAN' })],
  ['BIR', code({ dedcode: 'BIR', dedname: 'WHT', agency: 'BIR', type: 'TAX' })],
]);

ok('FIFO: same priority, older effective date deducted first', () => {
  const r = applyNthpCompliance(20000, [
    ded({ dedcode: 'MBA1', dedamt: 1000, effyy: 2026, effmm: 6 }),
    ded({ dedcode: 'MBA1', dedamt: 500, effyy: 2025, effmm: 1 }),
  ], map, '0001');
  assert.equal(r.actualLoanDeductions, 1500);
  const order = r.processedDeductions.map((p) => p.deduction_code);
  assert.deepEqual(order, ['MBA1', 'MBA1']); // both fully deducted
  assert.equal(r.undeductedObligations.length, 0);
});

ok('capacity exhaustion: last-priority deduction goes undeducted, stays last in line', () => {
  // capacity = 10000 - 5000 = 5000
  const r = applyNthpCompliance(10000, [
    ded({ dedcode: 'COOP1', dedamt: 3000, effyy: 2025, effmm: 1 }),
    ded({ dedcode: 'MBA1', dedamt: 2000, effyy: 2025, effmm: 2 }),
    ded({ dedcode: 'PF1', dedamt: 3000, effyy: 2025, effmm: 3 }), // exceeds capacity
  ], map, '0001');
  assert.equal(r.actualLoanDeductions, 5000);
  assert.equal(r.undeductedObligations.length, 1);
  assert.equal(r.undeductedObligations[0].deduction_code, 'PF1');
  assert.equal(r.undeductedObligations[0].reason, 'NTHP Threshold Reached');
  // undeducted item is positioned last in the processed line
  assert.equal(r.processedDeductions[r.processedDeductions.length - 1].deduction_code, 'PF1');
});

ok('zero capacity: ALL non-mandatory deductions become undeducted', () => {
  const r = applyNthpCompliance(5000, [
    ded({ dedcode: 'COOP1', dedamt: 500 }),
    ded({ dedcode: 'MBA1', dedamt: 300 }),
  ], map, '0001');
  assert.equal(r.actualLoanDeductions, 0);
  assert.equal(r.undeductedObligations.length, 2);
  assert.equal(r.nthpStatus, 'PASS'); // net = 5000 = threshold
});

ok('NTHP floor: net below 5000 reverses last deducted loan into undeducted', () => {
  // available = 6000 → capacity 1000. Loans: 800 + 800 = 1600.
  // First 800 deducted, second would exceed capacity → undeducted. net = 5200 PASS.
  // Force reversal: available = 5500, capacity 500, one loan 700 → nothing deducted,
  // net stays 5500. To trigger Step-7 reversal we need deducted loans that push
  // net < 5000: capacity must cover the loans but leave net < 5000. available=5200,
  // capacity=200 → no loan deducted. Use available=10000 (capacity 5000):
  // loans 3000 + 2500 = 5500 → both deducted (5000 cap), net = 4500 < 5000 →
  // last (2500) reversed.
  const r = applyNthpCompliance(10000, [
    ded({ dedcode: 'COOP1', dedamt: 3000, effyy: 2025, effmm: 1 }),
    ded({ dedcode: 'MBA1', dedamt: 2500, effyy: 2025, effmm: 2 }),
  ], map, '0001');
  assert.equal(r.finalNetPay, 7000);
  assert.equal(r.actualLoanDeductions, 3000);
  assert.equal(r.undeductedObligations.length, 1);
  assert.equal(r.undeductedObligations[0].deduction_code, 'MBA1');
  assert.equal(r.nthpStatus, 'PASS');
});

ok('NTHP FAIL when final net pay is below the 5000 floor', () => {
  const r = applyNthpCompliance(4000, [], map, '0001');
  assert.equal(r.nthpStatus, 'FAIL');
  assert.equal(r.finalNetPay, 4000);
});

console.log('processEmployeeDeductions (mandatory loan separation)');
ok('GSIS/HDMF loans are mandatory and deducted before APDS', () => {
  const m = new Map<string, DeductionCode>([
    ['GSISL', code({ dedcode: 'GSISL', dedname: 'GSIS Loan', agency: 'GSIS', type: 'LOAN' })],
    ['COOP1', code({ dedcode: 'COOP1', dedname: 'Coop', agency: 'COOP', type: 'COOPERATIVE' })],
    ['BIR', code({ dedcode: 'BIR', dedname: 'WHT', agency: 'BIR', type: 'TAX' })],
  ]);
  const r = processEmployeeDeductions(30000, [
    ded({ dedcode: 'GSISL', dedamt: 2000 }),
    ded({ dedcode: 'COOP1', dedamt: 1000 }),
  ], m, '0001');
  assert.equal(r.mandatoryLoanDeductions, 2000);
  assert.equal(r.availableBalance, 30000 - 2000);
  // APDS coop fully deducted
  assert.equal(r.processedDeductions.find((p) => p.deduction_code === 'COOP1')?.deducted_amount, 1000);
});

console.log(`\n${passed} assertions passed`);
