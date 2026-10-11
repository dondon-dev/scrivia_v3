export interface Employee {
  id: string;
  created_at: string;
  updated_at: string;

  // Legacy fields (kept in sync with masterfile fields on save)
  employee_number: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  department: string;
  bank_name: string;
  bank_account: string;
  basic_salary: number;
  hourly_rate: number;
  tax_status: string;
  sss_number: string;
  philhealth_number: string;
  pagibig_number: string;
  hire_date: string | null;

  // ── Masterfile 80-column fields ──
  // Identity & Assignment
  regcode: string;
  divcode: string;
  stacode: string;
  /** School (school_code) an SHS employee reports to for special/other
   *  payrolls (Comm Allowance, etc.). The regular payroll keeps the
   *  STACODE station (700/701). Set via Organization → Senior High Schools. */
  assigned_school_code?: string | null;
  empno: string;
  account: string;
  empname: string;
  fname: string;
  mi: string;
  lname: string;
  appel: string;
  poscode: string;
  paymode: string;

  // Salary & Grade
  grade: number;
  step: number;
  basic: number;
  trans: number;
  pera: number;
  aca: number;
  rata: number;
  ontop: number;
  long: number;
  clothing: number;
  cashallow: number;

  // Deductions (employee share)
  dedlnr: number;
  dedmed: number;
  dedtax: number;
  dedpag: number;
  netpay: number;

  // Government share
  govtlnr: number;
  govtecc: number;
  govtmed: number;
  govtpag: number;

  // Codes & Status
  pagcode: string;
  taxcode: string;
  civilstat: string;
  attend: string;
  status: string;
  sex: string;
  tin: string;

  // Government IDs
  gsis_pn: string;
  gsis_id: string;
  hdmf_id: string;
  phic_id: string;
  pib: string;
  banker: string;

  // Dates
  birthdate: string | null;
  update: string | null;
  paydate: string | null;
  hiredate: string | null;

  // Bonuses & Adjustments
  mid_bonus: number;
  mid_cash: number;
  end_bonus: number;
  end_cash: number;
  add_bonus: number;
  taxref: number;
  special: number;
  over_wheld: number;

  // Excess fields
  exposcode: string;
  exgrade: number;
  exstep: number;
  exbasic: number;
  exlnr: number;
  exmed: number;
  expag: number;
  extax: number;
  exglnr: number;
  exgmed: number;
  exgpag: number;
  exgecc: number;

  // Difference fields
  saldiff: number;
  lnrdiff: number;
  meddiff: number;
  pagdiff: number;
  taxdiff: number;
  glnrdiff: number;
  gmeddiff: number;
  gpagdiff: number;
  geccdiff: number;

  // Metadata
  updcode: string;
  editor: string;

  // Dependents
  depname1: string;
  depname2: string;
  depname3: string;
  depname4: string;
  depdate1: string | null;
  depdate2: string | null;
  depdate3: string | null;
  depdate4: string | null;

  // Additional earnings (DepEd APDS — included in gross pay)
  hazard_pay: number;
  salary_differential: number;
  other_compensation: number;
  other_earnings: number;

  // Payroll Group
  payroll_group_id: string | null;
  distcode: string;
  division_id: string | null;
}

export interface PayrollGroup {
  id: string;
  group_code: string;
  group_name: string;
  description: string;
  status: 'Active' | 'Inactive';
  created_at: string;
  created_by: string;
  stacode_min: number | null;
  stacode_max: number | null;
}

export interface PayPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  cutoff_date: string | null;
  pay_date: string | null;
  frequency: string;
  status: 'draft' | 'open' | 'closed';
  created_at: string;
  month: number | null;
  year: number | null;
  period_number: number | null;
  /** Division codes (REGCODE + DIVCODE) — the unique reference for one division's payroll. */
  regcode?: string | null;
  divcode?: string | null;
}

export interface Earning {
  id: string;
  employee_id: string;
  pay_period_id: string;
  earning_type: string;
  hours: number;
  amount: number;
  created_at: string;
}

export interface Deduction {
  id: string;
  employee_id: string;
  pay_period_id: string;
  deduction_code: string;
  deduction_name: string;
  category: string;
  amount: number;
  source: string;
  reference: string;
  created_at: string;
  // DEDFILE masterfile columns — stored by Smart Import for full sync
  stacode?: string;
  effmm?: string;
  effyy?: string;
  termm?: string;
  teryy?: string;
  type?: string;
  agency?: string;
  policyno?: string;
  policydate?: string;
  status?: string;
  principal?: number;
  interest?: number;
  charges?: number;
  proceeds?: number;
  absno?: number;
  underhr?: number;
  undermin?: number;
  oldcode?: string;
  hiredate?: string;
  birthdate?: string;
  gsis_bpn?: string;
  qs?: string;
  paydate?: string;
  editor?: string;
  p?: string;
  yy?: string;
  mm?: string;
  dd?: string;
  hr?: string;
  min?: string;
  sec?: string;
  dbf_id?: string;
}

export interface PayrollEntry {
  id: string;
  employee_id: string;
  pay_period_id: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: 'Computed' | 'Posted' | 'Reversed';
  processed_at: string;
  dedlnr: number;
  dedmed: number;
  dedpag: number;
  dedtax: number;
  other_deductions: number;
  govtlnr: number;
  govtecc: number;
  govtmed: number;
  govtpag: number;
  nthp_status: 'PASS' | 'FAIL';
  undeducted_amount: number;
  actual_loan_deductions: number;
  gsis_policy_loan: number;
  gsis_emergency_loan: number;
  pagibig_mpl: number;
  pagibig_calamity_loan: number;
  hazard_pay: number;
  salary_differential: number;
  other_compensation: number;
  other_earnings: number;
  available_balance: number;
  mandatory_deductions: number;
  loan_deduction_capacity: number;
}

export interface SalaryScheduleEntry {
  id: string;
  tranche: string;
  circular_no: string;
  effective_date: string;
  grade: number;
  step: number;
  monthly_salary: number;
  created_at: string;
}

export interface PayrollDeduction {
  id: string;
  employee_id: string | null;
  empno: string;
  dedcode: string;
  dedid: string;
  policyno: string;
  effmm: number;
  effyy: number;
  termm: number | null;
  teryy: number | null;
  dedamt: number;
  principal: number;
  interest: number;
  charges: number;
  proceeds: number;
  /** Station code carried by the DEDFILE record (column added by the import). */
  stacode?: string;
  /** Original FoxPro system/timestamp columns — restored verbatim from the
   * uploaded DEDFILE, never re-stamped (COPY FILE semantics). */
  p?: string;
  yy?: string;
  mm?: string;
  dd?: string;
  hr?: string;
  min?: string;
  sec?: string;
  dbf_id?: string;
  agency: string;
  status: 'Active' | 'Suspended' | 'Terminated';
  type: 'Loan' | 'Insurance' | 'Membership' | 'Savings' | 'Other';
  priority?: number | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface DeductionUploadRow {
  employee_number: string;
  deduction_code: string;
  deduction_name: string;
  amount: number;
  reference: string;
  matched: boolean;
  error?: string;
}

export interface DeductionCode {
  dedcode: string;
  type: string;
  agency: string;
  dedname: string;
  active: boolean;
  created_at: string;
}

export interface UndeductedObligation {
  id: string;
  payroll_entry_id: string;
  employee_id: string;
  pay_period_id: string;
  deduction_code: string;
  deduction_description: string;
  undeducted_amount: number;
  scheduled_amount: number;
  station_code: string;
  reason: string;
  created_at: string;
}

// ── Payent — bank-crediting hashfile (imported via Smart Sync) ────────────
// PYENT.DBF → half 'full' (1 month), PYENT1.DBF → 'first', PYENT2.DBF → 'second'.
// One row per employee per period per half: amount = net amount to credit.
export interface PayentRecord {
  id: string;
  employee_id: string | null;
  empno: string;
  pay_period_id: string | null;
  payperiod: string;
  half: 'full' | 'first' | 'second';
  stacode: string;
  divcode: string;
  regcode: string;
  acct_no: string;
  acct_name: string;
  amount: number;
  branch_cd: string;
  batch_no: string;
  itemcode: string;
  paytype: string;
  remarks: string;
  source: string;
  created_at: string;
}

// ── Payroll Definitions (super_admin only) ─────────────────────────────────
// A definition describes a single payroll field (column) that appears on the
// payroll register: its label, data type, category, default value, sort order,
// and whether it is computed or editable.

export type PayrollFieldCategory =
  | 'earnings'
  | 'mandatory_deductions'
  | 'voluntary_deductions'
  | 'government_share'
  | 'tax'
  | 'net_pay'
  | 'metadata'
  | 'adjustments';

export type PayrollFieldType = 'currency' | 'number' | 'text' | 'date' | 'percentage' | 'computed';

export type PayrollFieldSource = 'manual' | 'formula' | 'imported' | 'system';

export interface PayrollDefinition {
  id: string;
  field_code: string;          // machine key, e.g. 'gross_pay', 'ded_gsis'
  field_label: string;         // display label, e.g. 'Gross Pay'
  field_type: PayrollFieldType;
  field_category: PayrollFieldCategory;
  description: string | null;  // tooltip / help text
  default_value: number | null;
  is_required: boolean;        // must be present on every payroll entry
  is_computed: boolean;        // true = value derived from formula, not editable
  is_visible: boolean;         // whether shown on payroll register UI
  sort_order: number;          // display order within category
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// A formula maps an output field_code to an expression referencing other
// field_codes.  The expression is a simple arithmetic string, e.g.
//   "gross_pay * 0.09"  or  "ROUND((earnings - deductions) * 0.05, 2)"
// The computation engine evaluates these at payroll-calc time.

export interface PayrollFormula {
  id: string;
  formula_name: string;        // human label, e.g. 'GSIS Employee Share'
  output_field_code: string;   // FK → payroll_definitions.field_code
  expression: string;          // arithmetic expression referencing field codes
  description: string | null;
  computation_order: number;   // lower = evaluated first (dependencies)
  version: number;             // schema version for future-proofing
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
