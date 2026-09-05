import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { computePayrollDeductions } from '@/lib/payroll';
import { processEmployeeDeductions, separateMandatoryLoans } from '@/lib/nthp';
import { isDeductionActive } from '@/views/DeductionMasterfile';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import type { Employee, PayrollDeduction, DeductionCode, PayrollEntry } from '@/types/payroll';

export interface SyncResult {
  periodId: string;
  entriesUpdated: number;
  elementaryCount: number;
  highSchoolCount: number;
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
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, errors, warnings };
  }

  const uniqueIds = [...new Set(employeeIds)];

  // Load employees
  const empsRes = await chunkedIn('id', uniqueIds, (chunk) => supabase.from('employees').select('*').in('id', chunk));
  const employees = (empsRes as Employee[]).filter((e) => e.status === 'Active');
  if (employees.length === 0) {
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, errors, warnings };
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
  const allDedLines: { employee_id: string; pay_period_id: string; deduction_code: string; deduction_name: string; category: string; amount: number; source: string; reference: string; created_at: string }[] = [];

  const updates = employees.map((e) => {
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
      0,        // loanDeductions — handled separately by NTHP
      0,        // mandatoryLoanDeductions — handled separately
      e.hazard_pay ?? 0,
      e.salary_differential ?? 0,
      e.other_compensation ?? 0,
      e.other_earnings ?? 0,
    );
    const nthp = processEmployeeDeductions(
      computed.netBeforeLoans, empDeds, dedCodeMap, e.stacode ?? '',
    );

    const actualLoansTotal = nthp.actualLoanDeductions + nthp.mandatoryLoanDeductions;
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

    // NTHP shortfall obligations (existing behavior)
    nthp.undeductedObligations.forEach((u) => {
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
    const { mandatoryLoans } = separateMandatoryLoans(empDeds, dedCodeMap);
    const deductedLoans = nthp.processedDeductions.filter((p) => p.deducted_amount > 0);
    const baseTs = Date.now();
    let ord = 0;
    const pushDedLine = (code: string, name: string, category: string, amount: number) => {
      if (amount <= 0) return;
      ord += 1;
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
      });
    };
    pushDedLine('0003', 'GSIS PERSONAL SHARE', 'Mandatory', computed.dedlnr);
    pushDedLine('0036', 'WITHHOLDING TAX', 'Mandatory', computed.dedtax);
    pushDedLine('0111', 'PHILHEALTH', 'Mandatory', computed.dedmed);
    pushDedLine('0222', 'PAGIBIG FUND', 'Mandatory', computed.dedpag);
    mandatoryLoans.forEach((m) =>
      pushDedLine(m.dedcode, dedCodeMap.get(m.dedcode)?.dedname ?? m.dedcode, 'Loan', Number(m.dedamt) || 0));
    deductedLoans.forEach((d) =>
      pushDedLine(d.deduction_code, d.deduction_description, 'Loan', d.deducted_amount));

    return {
      id: entryId,
      employee_id: e.id,
      pay_period_id: payPeriodId,
      gross_pay: computed.gross,
      total_deductions: computed.mandatoryDeductions + actualLoansTotal,
      net_pay: nthp.finalNetPay,
      other_deductions: actualLoansTotal,
      actual_loan_deductions: actualLoansTotal,
      undeducted_amount: nthp.undeductedObligations.reduce((s, u) => s + u.undeducted_amount, 0)
        + excludedRows.reduce((s, d) => s + (Number(d.dedamt) || 0), 0),
      nthp_status: nthp.nthpStatus,
      status: (existing?.status === 'Posted' ? 'Posted' : 'Computed') as 'Computed' | 'Posted',
      processed_at: new Date().toISOString(),
      dedlnr: computed.dedlnr,
      dedmed: computed.dedmed,
      dedpag: computed.dedpag,
      dedtax: computed.dedtax,
      govtlnr: computed.govtlnr,
      govtecc: computed.govtecc,
      govtmed: computed.govtmed,
      govtpag: computed.govtpag,
      mandatory_deductions: computed.mandatoryDeductions,
      available_balance: nthp.availableBalance,
      loan_deduction_capacity: nthp.loanDeductionCapacity,
    };
  });

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
