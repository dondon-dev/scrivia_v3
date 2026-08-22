import { supabase, fetchAll, chunkedIn } from '@/lib/supabase';
import { computePayrollDeductions } from '@/lib/payroll';
import { processEmployeeDeductions } from '@/lib/nthp';
import type { Employee, PayrollDeduction, DeductionCode } from '@/types/payroll';

/**
 * Recompute and persist an employee's mandatory deductions and net pay
 * based on their current active payroll_deductions records.
 */
export async function recomputeEmployeeNetPay(employeeId: string): Promise<void> {
  const { data: emp } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle();
  if (!emp) return;

  const { data: deds } = await supabase
    .from('payroll_deductions')
    .select('*')
    .eq('employee_id', employeeId)
    .neq('status', 'Terminated');

  const dedCodesData = await fetchAll(() => supabase.from('deduction_codes').select('*'));
  const dedCodeMap = new Map<string, DeductionCode>(
    (dedCodesData as DeductionCode[]).map((c) => [c.dedcode, c]),
  );

  const empDeds = (deds as PayrollDeduction[]) ?? [];
  const employee = emp as Employee;

  const computed = computePayrollDeductions(
    employee.basic ?? employee.basic_salary ?? 0,
    employee.pera ?? 0,
    employee.aca ?? 0,
    employee.rata ?? 0,
    employee.ontop ?? 0,
    employee.long ?? 0,
  );

  const nthp = processEmployeeDeductions(
    computed.netBeforeLoans,
    empDeds,
    dedCodeMap,
    employee.stacode ?? '',
  );

  await supabase.from('employees').update({
    dedlnr: computed.dedlnr,
    dedmed: computed.dedmed,
    dedpag: computed.dedpag,
    dedtax: computed.dedtax,
    govtlnr: computed.govtlnr,
    govtecc: computed.govtecc,
    govtmed: computed.govtmed,
    govtpag: computed.govtpag,
    netpay: nthp.finalNetPay,
    updated_at: new Date().toISOString(),
  }).eq('id', employeeId);
}

/**
 * Bulk recompute net pay for many employees in just 3 queries + batched updates.
 * Fetches all employees, their deductions, and deduction codes once, computes
 * everything in memory, then updates in batches of 500.
 */
export async function bulkRecomputeNetPay(employeeIds: string[]): Promise<void> {
  if (employeeIds.length === 0) return;

  const uniqueIds = [...new Set(employeeIds)];

  const [empsRes, dedCodesData] = await Promise.all([
    chunkedIn('id', uniqueIds, () => supabase.from('employees').select('*')),
    fetchAll(() => supabase.from('deduction_codes').select('*')),
  ]);
  const allDeds = uniqueIds.length > 0
    ? await chunkedIn('employee_id', uniqueIds, () =>
        supabase.from('payroll_deductions').select('*').neq('status', 'Terminated'),
      )
    : [];

  const employees = empsRes as Employee[];
  const allDedsTyped = allDeds as PayrollDeduction[];
  const dedCodeMap = new Map<string, DeductionCode>(
    (dedCodesData as DeductionCode[]).map((c) => [c.dedcode, c]),
  );

  const dedsByEmp = new Map<string, PayrollDeduction[]>();
  for (const d of allDedsTyped) {
    const arr = dedsByEmp.get(d.employee_id!) ?? [];
    arr.push(d);
    dedsByEmp.set(d.employee_id!, arr);
  }

  const updates = employees.map((emp) => {
    const empDeds = dedsByEmp.get(emp.id) ?? [];
    const computed = computePayrollDeductions(
      emp.basic ?? emp.basic_salary ?? 0,
      emp.pera ?? 0,
      emp.aca ?? 0,
      emp.rata ?? 0,
      emp.ontop ?? 0,
      emp.long ?? 0,
    );
    const nthp = processEmployeeDeductions(
      computed.netBeforeLoans,
      empDeds,
      dedCodeMap,
      emp.stacode ?? '',
    );
    return {
      id: emp.id,
      dedlnr: computed.dedlnr,
      dedmed: computed.dedmed,
      dedpag: computed.dedpag,
      dedtax: computed.dedtax,
      govtlnr: computed.govtlnr,
      govtecc: computed.govtecc,
      govtmed: computed.govtmed,
      govtpag: computed.govtpag,
      netpay: nthp.finalNetPay,
      updated_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500);
    const { error } = await supabase.from('employees').upsert(batch, { onConflict: 'id' });
    if (error) console.error('Bulk recompute batch error:', error.message);
  }
}
