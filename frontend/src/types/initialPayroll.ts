export interface InitialPayrollRecord {
  id: string;
  payroll_no: string;
  payroll_date: string | null;
  period_from: string | null;
  period_to: string | null;
  description: string | null;
  status: 'draft' | 'posted' | 'reversed';
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  regcode?: string | null;
  divcode?: string | null;
}

export interface InitialPayrollEntry {
  id: string;
  record_id: string;
  employee_id: string;
  item_no: string | null;
  employee_number: string | null;
  surname: string | null;
  first_name: string | null;
  middle_name: string | null;
  school: string | null;
  position_title: string | null;
  salary_grade: number | null;
  salary_step: number | null;
  monthly_salary: number;
  days_worked: number;
  daily_rate: number;
  gross_salary: number;
  basic_salary: number;
  pera: number;
  mid_year_bonus: number;
  cash_gift: number;
  clothing_allowance: number;
  cna_incentive: number;
  other_earnings: number;
  total_earnings: number;
  gsis: number;
  philhealth: number;
  pagibig: number;
  withholding_tax: number;
  loans: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  tin: string | null;
  philhealth_no: string | null;
  hdmf_no: string | null;
  atm_account_no: string | null;
  stacode: string | null;
  effectivity_date: string | null;
  period_from: string | null;
  period_to: string | null;
  calendar_days: number;
  absences: number;
  additional_adjustments: number;
  adjustment_deductions: number;
  annual_income: number;
  annual_deductions: number;
  taxable_income: number;
  annual_tax: number;
  amount_due: number;
  total_due: number;
  school_group: string | null;
  created_at: string;
}

export interface InitialPayrollTransfer {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string | null;
  transferred_at: string;
  payroll_no: string | null;
  processed_by: string | null;
  processed_by_name: string | null;
}

export interface InitialPayrollAbsence {
  id: string;
  employee_id: string;
  date_of_absence: string;
  number_of_days: number;
  remarks: string | null;
  created_at: string;
}

export interface Signatory {
  id: string;
  role: 'prepared_by' | 'certified_correct' | 'checked_by' | 'recommending_approval' | 'approved_by';
  name: string;
  position: string | null;
  office: string | null;
  is_active: boolean;
  updated_at: string;
  created_at: string;
  regcode?: string | null;
  divcode?: string | null;
}

export const SIGNATORY_ROLES: { key: Signatory['role']; label: string }[] = [
  { key: 'prepared_by', label: 'Prepared By' },
  { key: 'certified_correct', label: 'Certified Correct' },
  { key: 'checked_by', label: 'Checked By' },
  { key: 'recommending_approval', label: 'Recommending Approval' },
  { key: 'approved_by', label: 'Approved By' },
];

export type PayrollStatus = 'Initial Payroll' | 'Regular Payroll' | 'Inactive';

export interface EmployeePayrollStatus {
  id: string;
  employee_number: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  empname: string;
  fname: string;
  lname: string;
  mi: string;
  stacode: string;
  position: string;
  department: string;
  bank_name: string;
  bank_account: string;
  basic_salary: number;
  basic: number;
  grade: number;
  step: number;
  tin: string;
  philhealth_number: string;
  pagibig_number: string;
  hire_date: string | null;
  hiredate: string | null;
  payroll_status: PayrollStatus;
  req_appointment_validated: boolean;
  req_tin_submitted: boolean;
  req_philhealth_submitted: boolean;
  req_pagibig_submitted: boolean;
  req_atm_submitted: boolean;
}

export function allRequirementsComplete(e: {
  req_appointment_validated: boolean;
  req_tin_submitted: boolean;
  req_philhealth_submitted: boolean;
  req_pagibig_submitted: boolean;
  req_atm_submitted: boolean;
}): boolean {
  return (
    e.req_appointment_validated &&
    e.req_tin_submitted &&
    e.req_philhealth_submitted &&
    e.req_pagibig_submitted &&
    e.req_atm_submitted
  );
}

export function requirementList(e: {
  req_appointment_validated: boolean;
  req_tin_submitted: boolean;
  req_philhealth_submitted: boolean;
  req_pagibig_submitted: boolean;
  req_atm_submitted: boolean;
}): { label: string; done: boolean }[] {
  return [
    { label: 'Appointment Validated', done: e.req_appointment_validated },
    { label: 'TIN Submitted', done: e.req_tin_submitted },
    { label: 'PhilHealth Submitted', done: e.req_philhealth_submitted },
    { label: 'Pag-IBIG Submitted', done: e.req_pagibig_submitted },
    { label: 'ATM Account Submitted', done: e.req_atm_submitted },
  ];
}

export function dailyRateFromMonthly(monthly: number): number {
  return Math.round((Number(monthly) || 0) / 22 * 100) / 100;
}

export function grossFromDaysWorked(dailyRate: number, daysWorked: number): number {
  return Math.round((dailyRate * (Number(daysWorked) || 0)) * 100) / 100;
}
