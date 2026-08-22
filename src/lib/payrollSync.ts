import { supabase, fetchAll, chunkedIn } from '@/lib/supabase';
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
  errors: string[];
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
  if (employeeIds.length === 0) {
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, errors };
  }

  const uniqueIds = [...new Set(employeeIds)];

  // Load employees
  const empsRes = await chunkedIn('id', uniqueIds, () => supabase.from('employees').select('*'));
  const employees = (empsRes as Employee[]).filter((e) => e.status === 'Active');
  if (employees.length === 0) {
    return { periodId: payPeriodId, entriesUpdated: 0, elementaryCount: 0, highSchoolCount: 0, errors };
  }

  // Load all payroll deductions (paginated)
  const allDeds: PayrollDeduction[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error } = await supabase
      .from('payroll_deductions')
      .select('*')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) { errors.push('Deduction load: ' + error.message); break; }
    if (!page || page.length === 0) break;
    allDeds.push(...(page as PayrollDeduction[]));
    if (page.length < pageSize) break;
    offset += pageSize;
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
    const empDeds = activeDedsByEmp.get(e.id) ?? [];
    const computed = computePayrollDeductions(
      e.basic ?? e.basic_salary ?? 0, e.pera ?? 0, e.aca ?? 0, e.rata ?? 0, e.ontop ?? 0, e.long ?? 0, 0,
    );
    const nthp = processEmployeeDeductions(
      computed.netBeforeLoans, empDeds, dedCodeMap, e.stacode ?? '',
    );

    const actualLoansTotal = nthp.actualLoanDeductions + nthp.mandatoryLoanDeductions;
    const existing = existingByEmp.get(e.id);
    const entryId = existing?.id ?? crypto.randomUUID();

    nthp.undeductedObligations.forEach((u) => {
      allUndeducted.push({
        payroll_entry_id: entryId,
        employee_id: e.id,
        pay_period_id: payPeriodId,
        deduction_code: u.deduction_code,
        deduction_description: u.deduction_description,
        undeducted_amount: u.undeducted_amount,
        scheduled_amount: u.scheduled_amount,
        station_code: u.station_code,
        reason: u.reason,
      });
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
      undeducted_amount: nthp.undeductedObligations.reduce((s, u) => s + u.undeducted_amount, 0),
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

  // Delete old undeducted obligations for these employees in this period
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    const { error } = await supabase.from('undeducted_obligations').delete().eq('pay_period_id', payPeriodId).in('employee_id', chunk);
    if (error) errors.push('Undeducted clear: ' + error.message);
  }

  // Upsert payroll entries
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await supabase.from('payroll_entries').upsert(updates.slice(i, i + 500));
    if (error) errors.push('Entry upsert: ' + error.message);
  }

  // Insert undeducted obligations
  for (let i = 0; i < allUndeducted.length; i += 500) {
    const { error } = await supabase.from('undeducted_obligations').insert(allUndeducted.slice(i, i + 500));
    if (error) errors.push('Undeducted insert: ' + error.message);
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
    const { error } = await supabase.from('deductions').insert(allDedLines.slice(i, i + 500));
    if (error) errors.push('Deduction line insert: ' + error.message);
  }

  // Sync employee masterfile
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
  for (let i = 0; i < empUpdates.length; i += 200) {
    const { error } = await supabase.from('employees').upsert(empUpdates.slice(i, i + 200));
    if (error) errors.push('Employee sync: ' + error.message);
  }

  const elementaryCount = employees.filter((e) => inCategory(e.stacode, 'elementary')).length;
  const highSchoolCount = employees.filter((e) => inCategory(e.stacode, 'highschool')).length;

  return {
    periodId: payPeriodId,
    entriesUpdated: updates.length,
    elementaryCount,
    highSchoolCount,
    errors,
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
  const empRows = await chunkedIn('id', employeeIds, () =>
    supabase.from('employees').select('regcode, divcode'),
  );
  const empKeys = new Set(
    (empRows as { regcode: string | null; divcode: string | null }[]).map((e) => `${e.regcode ?? ''}|${e.divcode ?? ''}`),
  );

  const { data: allPeriods } = await supabase
    .from('pay_periods')
    .select('*')
    .in('status', ['draft', 'open'])
    .order('start_date', { ascending: false });

  const periods = (allPeriods ?? []).filter((p) => {
    const key = `${p.regcode ?? ''}|${p.divcode ?? ''}`;
    return empKeys.has(key) || key === '|';
  });

  if (!periods || periods.length === 0) {
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
