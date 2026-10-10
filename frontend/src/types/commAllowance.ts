// ── Communication Allowance Payroll — types ─────────────────────────────────
// Department of Education, Division of Calamba City · "Other Payroll" module.

export type CaStatus =
  | 'Draft'
  | 'Generated'
  | 'Reviewed'
  | 'Approved'
  | 'Posted'
  | 'Paid'
  | 'Archived';

export const CA_STATUS_FLOW: CaStatus[] = [
  'Draft', 'Generated', 'Reviewed', 'Approved', 'Posted', 'Paid', 'Archived',
];

export const CA_STATUS_COLORS: Record<CaStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Generated: 'bg-blue-50 text-blue-700 border-blue-200',
  Reviewed: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Posted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Paid: 'bg-teal-50 text-teal-700 border-teal-200',
  Archived: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const CA_DEFAULT_AGENCY = 'Department of Education';
export const CA_DEFAULT_DIVISION = 'Division of Calamba City';
export const CA_DEFAULT_PAYROLL_TYPE = 'Communication Allowance';
/** Default monthly Communication Allowance rate (editable per row). */
export const CA_DEFAULT_AMOUNT = 700;
export const CA_DEFAULT_DEDUCTION = 0;

export const CA_RECORD_TYPE_PAYROLL = 'ca_payroll';
export const CA_RECORD_TYPE_EMPLOYEE = 'ca_employee';

/** tblEmployee */
export interface CaEmployee {
  id: string;
  account_no: string;
  last_name: string;
  first_name: string;
  middle_initial: string;
  position_title: string;
  school_name: string;
  /** School STACODE — used to derive the category: 001–094 → Elementary, 095 → Division Office, 508–701 → Secondary. */
  stacode: string;
  /** Payroll breakdown: Elementary (STACODE 001–094) · Division Office (095) · Secondary (STACODE 508–701) · Non-Plantilla. */
  category: string;
  status: 'Active' | 'Inactive' | string;
  created_at: string;
  updated_at: string;
}

/** tblPayrollHeader */
export interface CaPayrollHeader {
  id: string;
  payroll_no: string;
  payroll_type: string;
  payroll_title: string;
  agency: string;
  division: string;
  school_name: string;
  covered_period: string;
  total_employees: number;
  gross_amount: number;
  total_deductions: number;
  net_amount: number;
  status: CaStatus;
  alobs_no: string;
  jev_no: string;
  /** EO (Executive Order) number shown on the print certification — optional column. */
  eo_no?: string;
  date: string | null;
  payroll_ref_no: string;
  remarks: string;
  created_by: string;
  created_date: string;
  updated_at: string;
}

/** tblPayrollDetail */
export interface CaPayrollDetail {
  id: string;
  payroll_id: string;
  employee_id: string;
  line_no: number;
  amount: number;
  deduction: number;
  net_amount_due: number;
  signature_image: string | null;
  remarks: string;
  created_at: string;
}

/** tblPayrollSignatory */
export interface CaSignatory {
  id: string;
  payroll_id: string;
  signatory_type: string;
  name: string;
  position: string;
  sequence_no: number;
}

export interface CaSignatoryDef {
  type: string;
  cert: string;
  position: string;
  seq: number;
}

/**
 * Official certification block for DepEd communication allowance payrolls.
 * a–d wording and right-column placement match the approved city payroll form:
 *   left column  → a. Authorized Official · b. City Accountant (with amount)
 *   middle column → c. Head of Agency/Authorized Representative · d. Cashier I
 *   right column → City Mayor · As per EO No. 2022-006 · City Administrator · ALOBS/Date/JEV
 */
export const CA_SIGNATORY_DEFS: CaSignatoryDef[] = [
  {
    type: 'authorized_official',
    cert: 'a. CERTIFIED: Services duly rendered as stated.',
    position: 'Authorized Official',
    seq: 1,
  },
  {
    type: 'accountant',
    cert: 'b. CERTIFIED: Supporting documents complete and proper in the amount of ____________.',
    position: 'City Accountant',
    seq: 2,
  },
  {
    type: 'head_of_agency',
    cert: 'c. CERTIFIED CORRECT:',
    position: 'Head of Agency/Authorized Representative',
    seq: 3,
  },
  {
    type: 'cashier',
    cert: 'd. CERTIFIED: Each employee whose name appears above has been paid the amount indicated opposite on his/her name.',
    position: 'Cashier I',
    seq: 4,
  },
  {
    type: 'mayor',
    cert: '',
    position: 'City Mayor',
    seq: 5,
  },
  {
    type: 'city_admin',
    cert: '',
    position: 'City Administrator',
    seq: 6,
  },
];

export function caSignatoryMap(sigs: CaSignatory[]): Record<string, CaSignatory> {
  const m: Record<string, CaSignatory> = {};
  for (const s of sigs) m[s.signatory_type] = s;
  return m;
}
