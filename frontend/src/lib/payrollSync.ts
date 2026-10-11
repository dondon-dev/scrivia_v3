import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { computePayrollDeductions } from '@/lib/payroll';
import { separateMandatoryLoans, NTHP_THRESHOLD, type NthpResult, type ProcessedDeduction, type UndeductedObligationInput } from '@/lib/nthp';
import { isDeductionActive } from '@/views/DeductionMasterfile';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import type { Employee, PayrollDeduction, DeductionCode, Deduction, PayrollEntry } from '@/types/payroll';

/**
 * The masterfile values a per-period deduction line inherits so the extracted
 * dedrecs file is complete: the policy number, effectivity and terms the DEDFILE
 * record carries, plus its loan balances. A blank string / zero balance means
 * "not on file" — Run Payroll's statutory lines (GSIS, tax, PhilHealth,
 * Pag-IBIG) are computed amounts with no masterfile record behind them.
 */
interface MasterRef {
  policyno: string;
  effyy: string;
  effmm: string;
  teryy: string;
  termm: string;
  principal: number;
  interest: number;
  charges: number;
  proceeds: number;
  stacode: string;
}

/** Normalize a month to the two digits the DBF stores ('4' -> '04'). */
function refMonth(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return /^\d+$/.test(s) ? s.padStart(2, '0') : s;
}

/** Normalize a year to the four digits the DBF stores. */
function refYear(v: unknown): string {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) ? s : '';
}

/** EMPNO + DEDCODE, the key the masterfile record is matched on. */
function masterKey(code: unknown): string {
  return String(code ?? '').trim().toUpperCase();
}

export interface SyncResult {
  periodId: string;
  entriesUpdated: number;
  elementaryCount: number;
  highSchoolCount: number;
  /** Σ take-home over the run — the legacy "Total Net Amount". */
  totalNet: number;
  /** Rows with take-home below ₱5,000 — the PAYRNEG negative-pay list. */
  negativeCount: number;
  /** Hard failures (reads/writes that errored). The run is incomplete. */
  errors: string[];
  /** Non-fatal issues: records skipped/truncated during the run. Payroll is computed but incomplete. */
  warnings: string[];
}

/**
 * PocketBase record ids are exactly 15 chars of [a-z0-9]. crypto.randomUUID()
 * (36 chars) fails the collections' id validation, so entries get silently
 * skipped on write — generate a compliant id instead.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * FoxPro PAYRINCL loan pass, engineered for the Regular Payroll run.
 *
 * The legacy pipeline sorts the employee's deduction rows by
 * empno, p, effyy, effmm, yy, mm, dd, hr, min, dedcode, policyno, then walks
 * them against the masterfile NETPAY floor: each row is taken only while the
 * pay left above ₱5,000 still covers it, otherwise it becomes an undeducted
 * (EXCLUDED) row — and a QS='U' row is always excluded. The running-total
 * form below is that same rule: a row is deducted exactly when
 * (net − running − amount) ≥ 5000, i.e. remainingCapacity ≥ amount.
 *
 * Sort is code-unit order like the FoxPro machine sort, and every key is read
 * defensively — V3 rows predate some legacy columns, which simply sort blank.
 */
function foxproLoanKey(d: PayrollDeduction, key: string): string {
  const v = (d as unknown as Record<string, unknown>)[key];
  return String(v ?? '');
}

function foxproCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function foxproLoanSort(a: PayrollDeduction, b: PayrollDeduction): number {
  for (const k of ['p', 'effyy', 'effmm', 'yy', 'mm', 'dd', 'hr', 'min'] as const) {
    const c = foxproCmp(foxproLoanKey(a, k), foxproLoanKey(b, k));
    if (c !== 0) return c;
  }
  return foxproCmp(a.dedcode ?? '', b.dedcode ?? '') || foxproCmp(a.policyno ?? '', b.policyno ?? '');
}

function isUnprioritized(d: PayrollDeduction): boolean {
  return String((d as unknown as Record<string, unknown>).qs ?? '').toUpperCase() === 'U';
}

function applyFoxproFloor(
  netPayBeforeLoans: number,
  loanDeductions: PayrollDeduction[],
  dedCodeMap: Map<string, DeductionCode>,
  stationCode = '',
  mandatoryLoanDeductions = 0,
): NthpResult {
  const availableBalance = netPayBeforeLoans;
  const loanDeductionCapacity = availableBalance - NTHP_THRESHOLD;
  const processed: ProcessedDeduction[] = [];
  const undeducted: UndeductedObligationInput[] = [];
  const deductedLog: ProcessedDeduction[] = [];
  const describe = (d: PayrollDeduction) => dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode;

  // QS='U' rows never reach the floor walk — always excluded, like PAYRINCL.
  const queued = [...loanDeductions].sort(foxproLoanSort);
  let seq = 0;
  const markUndeducted = (d: PayrollDeduction, amount: number, reason: string) => {
    seq += 1;
    processed.push({
      deduction_code: d.dedcode, deduction_description: describe(d),
      scheduled_amount: amount, deducted_amount: 0, undeducted_amount: amount,
      priority: seq, is_mandatory: false, source: d,
    });
    undeducted.push({
      deduction_code: d.dedcode, deduction_description: describe(d),
      scheduled_amount: amount, undeducted_amount: amount,
      station_code: stationCode, reason,
    });
  };
  const rest = queued.filter((d) => {
    const amount = Number(d.dedamt) || 0;
    if (amount <= 0) return false;
    if (isUnprioritized(d)) { markUndeducted(d, amount, 'Excluded by priority (QS=U)'); return false; }
    return true;
  });

  if (loanDeductionCapacity <= 0) {
    for (const d of rest) markUndeducted(d, Number(d.dedamt) || 0, 'NTHP Threshold Reached');
    const finalNetPay = availableBalance;
    return {
      actualLoanDeductions: 0, mandatoryLoanDeductions,
      undeductedObligations: undeducted, processedDeductions: processed,
      nthpStatus: finalNetPay >= NTHP_THRESHOLD ? 'PASS' : 'FAIL',
      finalNetPay, availableBalance, loanDeductionCapacity,
    };
  }

  let remainingCapacity = loanDeductionCapacity;
  let actualLoanDeductions = 0;
  for (const d of rest) {
    const amount = Number(d.dedamt) || 0;
    if (remainingCapacity >= amount) {
      remainingCapacity -= amount;
      actualLoanDeductions += amount;
      seq += 1;
      const rec: ProcessedDeduction = {
        deduction_code: d.dedcode, deduction_description: describe(d),
        scheduled_amount: amount, deducted_amount: amount, undeducted_amount: 0,
        priority: seq, is_mandatory: false, source: d,
      };
      processed.push(rec);
      deductedLog.push(rec);
    } else {
      markUndeducted(d, amount, 'NTHP Threshold Reached');
    }
  }

  // Safety net: never close below the floor — unwind the last rows taken.
  let netPay = availableBalance - actualLoanDeductions;
  while (netPay < NTHP_THRESHOLD && deductedLog.length > 0) {
    const last = deductedLog.pop()!;
    actualLoanDeductions -= last.deducted_amount;
    last.deducted_amount = 0;
    last.undeducted_amount = last.scheduled_amount;
    undeducted.push({
      deduction_code: last.deduction_code, deduction_description: last.deduction_description,
      scheduled_amount: last.scheduled_amount, undeducted_amount: last.scheduled_amount,
      station_code: stationCode, reason: 'NTHP Threshold Reached',
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

  const finalNetPay = netPay;
  return {
    actualLoanDeductions, mandatoryLoanDeductions,
    undeductedObligations: undeducted, processedDeductions: processed,
    nthpStatus: finalNetPay >= NTHP_THRESHOLD ? 'PASS' : 'FAIL',
    finalNetPay, availableBalance, loanDeductionCapacity,
  };
}

export function newPBId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 15; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Recompute payroll entries for the given employees in a specific pay period,
 * reflecting the latest payroll_deductions masterfile. Upserts payroll_entries,
 * undeducted_obligations, and syncs the employees masterfile snapshot.
 *
 * Works for both Elementary (STACODE 1-499) and High School (STACODE 500-701)
 * in a single pass — entries are scoped per-category so neither wipes the other.
 */
export async function syncPayrollForEmployees(
  employeeIds: string[],
  payPeriodId: string,
  payYY: number,
  payMM: number,
): Promise<SyncResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (employeeIds.length === 0) {
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, totalNet: 0, negativeCount: 0, errors, warnings };
  }

  const uniqueIds = [...new Set(employeeIds)];

  // Load employees
  const empsRes = await chunkedIn('id', uniqueIds, (chunk) => supabase.from('employees').select('*').in('id', chunk));
  const employees = (empsRes as Employee[]).filter((e) => e.status === 'Active');
  if (employees.length === 0) {
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, totalNet: 0, negativeCount: 0, errors, warnings };
  }

  // Load ALL payroll deductions. Read through the adapter's full-list path — a
  // manual .range() walk used to silently truncate at PocketBase's 500-row page
  // cap (the loop asked for 1,000-row pages, got 500, and stopped), so loans
  // beyond the first 500 masterfile rows were never seen by the engine and no
  // undeducted obligations were ever produced for them.
  const { data: allDedsData, error: dedLoadErr } = await supabase
    .from('payroll_deductions')
    .select('*')
    .order('id');
  if (dedLoadErr) errors.push('Deduction load: ' + dedLoadErr.message);
  const allDeds = (allDedsData as PayrollDeduction[]) ?? [];

  // Cross-check the masterfile read against PocketBase's true row count so a
  // future paging regression (page caps, truncated range walks) surfaces as an
  // amber warning instead of a "clean" run that silently ignored deductions.
  {
    const { count: dedTotal } = await supabase.from('payroll_deductions').select('id').count('exact');
    if (!dedLoadErr && typeof dedTotal === 'number' && dedTotal > 0 && allDeds.length < dedTotal) {
      warnings.push(`Deduction masterfile truncated: loaded ${allDeds.length} of ${dedTotal} rows. Re-run payroll after fixing the data source.`);
    }
  }

  // Load deduction codes
  const dedCodesData = await fetchAll(() => supabase.from('deduction_codes').select('*'));
  const dedCodeMap = new Map<string, DeductionCode>(
    (dedCodesData as DeductionCode[]).map((c) => [c.dedcode, c]),
  );

  // Build empno → employee map
  const empByEmpno = new Map<string, Employee>();
  employees.forEach((e) => {
    const num = (e.empno ?? e.employee_number ?? '').trim();
    if (num) empByEmpno.set(num, e);
  });

  // The division's EXCLUDED definition (uploaded via Smart Import / EXCLUDED.DBF).
  // Employees flagged EXCLUDED have NONE of their loan deductions taken this
  // period — each scheduled loan becomes an undeducted obligation with reason
  // 'EXCLUDED FROM PAYROLL' (lowest priority), re-deducted first in later
  // periods once the flag clears. The engine must honor this or excluded loans
  // silently leak into the run as regular deductions.
  const excludedEmpnos = new Set<string>();
  {
    const excl = await fetchAll(() => supabase.from('dbf_excluded').select('empno'));
    ((excl as { empno?: string }[]) ?? []).forEach((r) => {
      const n = String(r.empno ?? '').trim();
      if (n) excludedEmpnos.add(n);
    });
  }

  // Build active deductions per employee
  const activeDedsByEmp = new Map<string, PayrollDeduction[]>();
  allDeds.forEach((d) => {
    if (!isDeductionActive(d, payYY, payMM)) return;
    let empId = d.employee_id ?? '';
    if (!empId) {
      const emp = empByEmpno.get((d.empno ?? '').trim());
      if (emp) empId = emp.id;
    }
    if (!empId) return;
    const arr = activeDedsByEmp.get(empId) ?? [];
    arr.push(d);
    activeDedsByEmp.set(empId, arr);
  });

  // Load existing entries for this period (to preserve IDs on upsert)
  const existingEntries = await fetchAll(() =>
    supabase.from('payroll_entries').select('*').eq('pay_period_id', payPeriodId),
  ) as PayrollEntry[];
  const existingByEmp = new Map<string, PayrollEntry>();
  existingEntries.forEach((e) => existingByEmp.set(e.employee_id, e));

  // Compute entries for all affected employees
  const allUndeducted: { payroll_entry_id: string; employee_id: string; pay_period_id: string; deduction_code: string; deduction_description: string; undeducted_amount: number; scheduled_amount: number; station_code: string; reason: string }[] = [];
  // Itemized deduction lines for this run — statutory mandatory lines, mandatory
  // loans, then the APDS loans actually deducted (FIFO stored order). These feed
  // the FOXPRO Payroll Register / Payslip and the period Deductions view.
  const allDedLines: Array<{
    employee_id: string; pay_period_id: string; deduction_code: string; deduction_name: string;
    category: string; amount: number; source: string; reference: string; created_at: string;
  } & Partial<MasterRef>> = [];

  // The DEDFILE import carried each masterfile record's policy number,
  // effectivity, terms and loan balances. Run Payroll's per-period lines are
  // computed amounts only, so without reading those records back the Deductions
  // screen — and the dedrecs export built from it — shows a blank Policy / Eff /
  // Ter on every line the run produced.
  //
  // An employee can hold several loans under one deduction code, so a record is
  // matched on its policy number first and only falls back to the code when the
  // line's masterfile row carries no policy.
  const dedFileByCode = new Map<string, Deduction>();
  const dedFileByPolicy = new Map<string, Deduction>();
  {
    const rows = await chunkedIn<Deduction>('employee_id', uniqueIds, (chunk) =>
      supabase.from('deductions').select('*').eq('source', 'DEDFILE').in('employee_id', chunk),
    );
    rows.forEach((r) => {
      const codePart = `${r.employee_id}|${masterKey(r.deduction_code)}`;
      if (!dedFileByCode.has(codePart)) dedFileByCode.set(codePart, r);
      const policy = String(r.policyno ?? '').trim().toUpperCase();
      if (policy) dedFileByPolicy.set(`${codePart}|${policy}`, r);
    });
  }

  let skippedNotPresent = 0;
  let totalNet = 0;
  let negativeCount = 0;
  const updates = employees.map((e) => {
    // FoxPro PAYRMRG reads only attend='A' masterfile rows into the run.
    // Rows that never carried an ATTEND value (blank) still run — only an
    // explicit non-'A' mark skips the employee.
    const attend = String((e as unknown as Record<string, unknown>).attend ?? '').toUpperCase();
    if (attend !== '' && attend !== 'A') { skippedNotPresent += 1; return null; }
    const empNo = (e.empno ?? e.employee_number ?? '').trim();
    const empDedsAll = activeDedsByEmp.get(e.id) ?? [];
    // EXCLUDED employees (EXCLUDED.DBF / Smart Import definition): NONE of their
    // scheduled deductions are taken this period. Every active masterfile row
    // becomes an undeducted obligation ('EXCLUDED FROM PAYROLL' — lowest
    // priority, re-deducted first in later periods once the flag clears) and
    // nothing flows through NTHP; only the statutory formulas are still applied.
    const excluded = excludedEmpnos.has(empNo);
    const excludedRows = excluded ? empDedsAll.filter((d) => (Number(d.dedamt) || 0) > 0) : [];
    const empDeds = excluded ? [] : empDedsAll;
    const computed = computePayrollDeductions(
      e.basic ?? e.basic_salary ?? 0,
      e.pera ?? 0,
      e.aca ?? 0,
      e.rata ?? 0,
      e.ontop ?? 0,
      e.long ?? 0,
      0,        // loanDeductions — handled separately by the floor pass
      0,        // mandatoryLoanDeductions — handled separately
      e.hazard_pay ?? 0,
      e.salary_differential ?? 0,
      e.other_compensation ?? 0,
      e.other_earnings ?? 0,
    );
    // ── FoxPro PAYRMRG core ─────────────────────────────────────────────
    // gross = basic + trans + pera + aca — and nothing else. The statutory
    // shares are READ from the masterfile row, never recomputed; the
    // recomputed values above survive only as a fallback for blank cells.
    const num = (v: unknown) => Number(v) || 0;
    const mf = (v: unknown, fb: number) => (v === null || v === undefined ? fb : num(v));
    const basic = num(e.basic ?? e.basic_salary);
    const gross = round2(basic + num(e.trans) + num(e.pera) + num(e.aca));
    const dedlnr = mf(e.dedlnr, computed.dedlnr);
    const dedmed = mf(e.dedmed, computed.dedmed);
    const dedpag = mf(e.dedpag, computed.dedpag);
    const dedtax = mf(e.dedtax, computed.dedtax);
    const govtlnr = mf(e.govtlnr, computed.govtlnr);
    const govtecc = mf(e.govtecc, computed.govtecc);
    const govtmed = mf(e.govtmed, computed.govtmed);
    const govtpag = mf(e.govtpag, computed.govtpag);
    const mandatoryDeductions = round2(dedlnr + dedmed + dedpag + dedtax);
    const netBeforeLoans = round2(gross - mandatoryDeductions);
    const { mandatoryLoans, apdsDeductions } = separateMandatoryLoans(empDeds, dedCodeMap);
    const mandatoryTotal = mandatoryLoans.reduce((s, m) => s + (Number(m.dedamt) || 0), 0);
    const fox = applyFoxproFloor(netBeforeLoans - mandatoryTotal, apdsDeductions, dedCodeMap, e.stacode ?? '', mandatoryTotal);
    totalNet = round2(totalNet + fox.finalNetPay);
    if (fox.finalNetPay < NTHP_THRESHOLD) negativeCount += 1;

    const actualLoansTotal = fox.actualLoanDeductions + fox.mandatoryLoanDeductions;
    const existing = existingByEmp.get(e.id);
    const entryId = existing?.id ?? newPBId();

    const pushUndeducted = (
      code: string, desc: string, scheduled: number, undeducted: number, reason: string,
    ) => {
      if (undeducted <= 0) return;
      allUndeducted.push({
        payroll_entry_id: entryId,
        employee_id: e.id,
        pay_period_id: payPeriodId,
        deduction_code: code,
        deduction_description: desc,
        undeducted_amount: Math.round(undeducted * 100) / 100,
        scheduled_amount: Math.round(scheduled * 100) / 100,
        station_code: e.stacode ?? '',
        reason,
      });
    };

    // Floor shortfall obligations
    fox.undeductedObligations.forEach((u) => {
      pushUndeducted(u.deduction_code, u.deduction_description, u.scheduled_amount, u.undeducted_amount, u.reason);
    });
    // EXCLUDED definition obligations — never deducted this period
    excludedRows.forEach((d) => {
      const code = dedCodeMap.get(d.dedcode);
      pushUndeducted(
        d.dedcode,
        code?.dedname ?? d.dedcode,
        Number(d.dedamt) || 0,
        Number(d.dedamt) || 0,
        'EXCLUDED FROM PAYROLL',
      );
    });

    // Itemized deduction lines (same shape the server engine writes)
    const deductedLoans = fox.processedDeductions.filter((p) => p.deducted_amount > 0);
    // The record a line names: the masterfile row the engine deducted from, with
    // the DEDFILE record supplying the terms and balances that row does not hold
    // (payroll_deductions has no TERMM/TERYY/CHARGES/PROCEEDS columns).
    const refFor = (src: PayrollDeduction | undefined, code: string): MasterRef | null => {
      const codePart = `${e.id}|${masterKey(code)}`;
      const policy = String(src?.policyno ?? '').trim().toUpperCase();
      const file = (policy ? dedFileByPolicy.get(`${codePart}|${policy}`) : undefined)
        ?? dedFileByCode.get(codePart)
        ?? null;
      if (!src && !file) return null;
      return {
        policyno: String(src?.policyno ?? '').trim() || String(file?.policyno ?? '').trim(),
        effyy: refYear(src?.effyy) || refYear(file?.effyy),
        effmm: refMonth(src?.effmm) || refMonth(file?.effmm),
        teryy: refYear(file?.teryy) || '',
        termm: refMonth(file?.termm) || '',
        principal: Number(src?.principal) || Number(file?.principal) || 0,
        interest: Number(src?.interest) || Number(file?.interest) || 0,
        charges: Number(file?.charges) || 0,
        proceeds: Number(file?.proceeds) || 0,
        stacode: String(file?.stacode ?? '').trim() || String(src?.stacode ?? '').trim() || String(e.stacode ?? '').trim(),
      };
    };

    const baseTs = Date.now();
    let ord = 0;
    const pushDedLine = (
      code: string, name: string, category: string, amount: number,
      src?: PayrollDeduction,
    ) => {
      if (amount <= 0) return;
      ord += 1;
      const ref = refFor(src, code);
      allDedLines.push({
        employee_id: e.id,
        pay_period_id: payPeriodId,
        deduction_code: code,
        deduction_name: name,
        category,
        amount: Math.round(amount * 100) / 100,
        source: 'Payroll Run',
        reference: entryId,
        created_at: new Date(baseTs + ord).toISOString(),
        ...(ref ? { ...ref } : {}),
      });
    };
    pushDedLine('0003', 'GSIS PERSONAL SHARE', 'Mandatory', dedlnr);
    pushDedLine('0036', 'WITHHOLDING TAX', 'Mandatory', dedtax);
    pushDedLine('0111', 'PHILHEALTH', 'Mandatory', dedmed);
    pushDedLine('0222', 'PAGIBIG FUND', 'Mandatory', dedpag);
    mandatoryLoans.forEach((m) =>
      pushDedLine(m.dedcode, dedCodeMap.get(m.dedcode)?.dedname ?? m.dedcode, 'Loan', Number(m.dedamt) || 0, m));
    deductedLoans.forEach((d) =>
      pushDedLine(d.deduction_code, d.deduction_description, 'Loan', d.deducted_amount, d.source));

    return {
      id: entryId,
      employee_id: e.id,
      pay_period_id: payPeriodId,
      gross_pay: gross,
      total_deductions: mandatoryDeductions + actualLoansTotal,
      net_pay: fox.finalNetPay,
      other_deductions: actualLoansTotal,
      actual_loan_deductions: actualLoansTotal,
      undeducted_amount: fox.undeductedObligations.reduce((s, u) => s + u.undeducted_amount, 0)
        + excludedRows.reduce((s, d) => s + (Number(d.dedamt) || 0), 0),
      nthp_status: fox.nthpStatus,
      status: (existing?.status === 'Posted' ? 'Posted' : 'Computed') as 'Computed' | 'Posted',
      processed_at: new Date().toISOString(),
      dedlnr,
      dedmed,
      dedpag,
      dedtax,
      govtlnr,
      govtecc,
      govtmed,
      govtpag,
      mandatory_deductions: mandatoryDeductions,
      available_balance: netBeforeLoans,
      loan_deduction_capacity: fox.loanDeductionCapacity,
    };
  }).filter((u): u is NonNullable<typeof u> => u !== null);

  if (skippedNotPresent > 0) {
    warnings.push(`${skippedNotPresent} employee(s) skipped: not marked present (ATTEND is not 'A').`);
  }

  // Skip re-writing entries whose computed values are unchanged from the last
  // run — re-runs (e.g. after a deduction sync) then only touch rows that
  // actually moved, cutting the bulk of the network writes.
  const entryChanged = (u: typeof updates[number]) => {
    const ex = existingByEmp.get(u.employee_id);
    if (!ex) return true;
    return (
      Number(ex.gross_pay) !== Number(u.gross_pay) ||
      Number(ex.total_deductions) !== Number(u.total_deductions) ||
      Number(ex.net_pay) !== Number(u.net_pay) ||
      Number(ex.other_deductions ?? ex.actual_loan_deductions) !== Number(u.actual_loan_deductions) ||
      Number(ex.undeducted_amount ?? 0) !== Number(u.undeducted_amount) ||
      (ex.nthp_status ?? '') !== u.nthp_status ||
      ex.status !== u.status ||
      Number(ex.dedlnr) !== Number(u.dedlnr) ||
      Number(ex.dedmed) !== Number(u.dedmed) ||
      Number(ex.dedpag) !== Number(u.dedpag) ||
      Number(ex.dedtax) !== Number(u.dedtax) ||
      Number(ex.govtlnr) !== Number(u.govtlnr) ||
      Number(ex.govtecc) !== Number(u.govtecc) ||
      Number(ex.govtmed) !== Number(u.govtmed) ||
      Number(ex.govtpag) !== Number(u.govtpag) ||
      Number(ex.mandatory_deductions) !== Number(u.mandatory_deductions) ||
      Number(ex.available_balance) !== Number(u.available_balance) ||
      Number(ex.loan_deduction_capacity) !== Number(u.loan_deduction_capacity)
    );
  };
  const writesToDo = updates.filter(entryChanged);

  // Delete old undeducted obligations for these employees in this period
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    const { error } = await supabase.from('undeducted_obligations').delete().eq('pay_period_id', payPeriodId).in('employee_id', chunk);
    if (error) errors.push('Undeducted clear: ' + error.message);
  }

  // Upsert payroll entries (only the ones whose values actually changed)
  for (let i = 0; i < writesToDo.length; i += 500) {
    const chunk = writesToDo.slice(i, i + 500);
    const { data: upserted, error } = await supabase.from('payroll_entries').upsert(chunk);
    if (error) errors.push('Entry upsert: ' + error.message);
    else if ((upserted?.length ?? 0) < chunk.length) {
      warnings.push(`Entry upsert: ${chunk.length - (upserted?.length ?? 0)} record(s) were skipped and NOT saved`);
    }
  }

  // Insert undeducted obligations
  for (let i = 0; i < allUndeducted.length; i += 500) {
    const chunk = allUndeducted.slice(i, i + 500);
    const { data: inserted, error } = await supabase.from('undeducted_obligations').insert(chunk);
    if (error) errors.push('Undeducted insert: ' + error.message);
    else if ((inserted?.length ?? 0) < chunk.length) {
      warnings.push(`Undeducted insert: ${chunk.length - (inserted?.length ?? 0)} record(s) were skipped`);
    }
  }

  // Replace stale run/INCLUDED-derived deduction lines with this sync's output
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    const { error } = await supabase.from('deductions').delete()
      .eq('pay_period_id', payPeriodId)
      .in('employee_id', chunk)
      .in('source', ['Payroll Run', 'INCLUDED']);
    if (error) errors.push('Deduction line clear: ' + error.message);
  }
  for (let i = 0; i < allDedLines.length; i += 500) {
    const chunk = allDedLines.slice(i, i + 500);
    const { data: inserted, error } = await supabase.from('deductions').insert(chunk);
    if (error) errors.push('Deduction line insert: ' + error.message);
    else if ((inserted?.length ?? 0) < chunk.length) {
      warnings.push(`Deduction line insert: ${chunk.length - (inserted?.length ?? 0)} record(s) were skipped`);
    }
  }

  // Sync employee masterfile (only employees whose stored snapshot changed)
  const empUpdates = updates.map((entry) => {
    const e = employees.find((em) => em.id === entry.employee_id)!;
    return {
      id: e.id,
      dedlnr: entry.dedlnr,
      dedmed: entry.dedmed,
      dedpag: entry.dedpag,
      dedtax: entry.dedtax,
      govtlnr: entry.govtlnr,
      govtecc: entry.govtecc,
      govtmed: entry.govtmed,
      govtpag: entry.govtpag,
      netpay: entry.net_pay,
      updated_at: new Date().toISOString(),
    };
  });
  const empChanged = (u: typeof empUpdates[number]) => {
    const e = employees.find((em) => em.id === u.id)!;
    return (
      Number(e.dedlnr) !== Number(u.dedlnr) ||
      Number(e.dedmed) !== Number(u.dedmed) ||
      Number(e.dedpag) !== Number(u.dedpag) ||
      Number(e.dedtax) !== Number(u.dedtax) ||
      Number(e.govtlnr) !== Number(u.govtlnr) ||
      Number(e.govtecc) !== Number(u.govtecc) ||
      Number(e.govtmed) !== Number(u.govtmed) ||
      Number(e.govtpag) !== Number(u.govtpag) ||
      Number(e.netpay) !== Number(u.netpay)
    );
  };
  const empWrites = empUpdates.filter(empChanged);
  for (let i = 0; i < empWrites.length; i += 200) {
    const chunk = empWrites.slice(i, i + 200);
    const { data: upserted, error } = await supabase.from('employees').upsert(chunk);
    if (error) errors.push('Employee sync: ' + error.message);
    else if ((upserted?.length ?? 0) < chunk.length) {
      warnings.push(`Employee sync: ${chunk.length - (upserted?.length ?? 0)} record(s) were skipped`);
    }
  }

  const elementaryCount = employees.filter((e) => inCategory(e.stacode, 'elementary')).length;
  const highSchoolCount = employees.filter((e) => inCategory(e.stacode, 'highschool')).length;

  return {
    periodId: payPeriodId,
    entriesUpdated: updates.length,
    elementaryCount,
    highSchoolCount,
    totalNet,
    negativeCount,
    errors,
    warnings,
  };
}

/**
 * After a PLI/GSIS import, automatically sync all open pay periods so that
 * newly uploaded deductions are immediately reflected in Elementary and High
 * School payroll computations.
 */
export async function syncPayrollAfterImport(
  employeeIds: string[],
  onProgress?: (msg: string) => void,
): Promise<SyncResult[]> {
  if (employeeIds.length === 0) return [];

  // Pay periods are per-division (REGCODE + DIVCODE on the row). Only sync
  // the periods that belong to the imported employees' division(s) — a
  // PLI/GSIS import for one division must never push entries into another
  // division's periods. Legacy uncoded periods remain included.
  const empRows = await chunkedIn('id', employeeIds, (chunk) =>
    supabase.from('employees').select('regcode, divcode').in('id', chunk),
  );
  const empKeys = new Set(
    (empRows as { regcode: string | null; divcode: string | null }[]).map((e) => `${e.regcode ?? ''}|${e.divcode ?? ''}`),
  );

  const allPeriodsArr = await fetchAll(() =>
    supabase
      .from('pay_periods')
      .select('*')
      .in('status', ['draft', 'open'])
      .order('start_date', { ascending: false }),
  );

  const periods = allPeriodsArr.filter((p) => {
    const key = `${p.regcode ?? ''}|${p.divcode ?? ''}`;
    return empKeys.has(key) || key === '|';
  });

  if (periods.length === 0) {
    onProgress?.('No open pay periods found — payroll will reflect deductions on next Run Payroll.');
    return [];
  }

  const results: SyncResult[] = [];
  for (const period of periods) {
    const startDate = period.start_date ? new Date(period.start_date) : new Date();
    const payYY = startDate.getFullYear();
    const payMM = startDate.getMonth() + 1;
    onProgress?.(`Syncing payroll for ${period.period_name ?? 'period'}…`);
    const result = await syncPayrollForEmployees(employeeIds, period.id, payYY, payMM);
    results.push(result);
  }

  return results;
}
