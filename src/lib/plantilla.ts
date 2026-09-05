import { supabase, fetchAll } from '@/lib/pb';

// ── Types ─────────────────────────────────────────────────────────────────

export type PersonnelCategory = 'Teaching' | 'Teaching Related' | 'Non-Teaching';
export type PositionStatus = 'Filled' | 'Vacant';
export type SchoolType = 'Elementary' | 'High School' | 'Implementing Unit' | 'Division Office';
export type ApprovalStatus = 'Approved' | 'Pending_Approval' | 'Draft' | 'Rejected';

export interface PlantillaPosition {
  id: string;
  header_id?: string;
  item_number: string;
  position_title: string;
  salary_grade: number;
  salary_step: number;
  step?: number;
  annual_salary: number;
  authorized_salary: number;
  actual_salary: number;
  area?: string;
  type?: string;
  education?: string;
  appointment_type?: string;
  level?: string;
  occupation_code?: string;
  ppa_attribution?: string;
  school_id: string;
  school_name?: string;
  school_type?: SchoolType;
  office_assignment: string;
  employee_id: string;
  employee_name: string;
  sex: 'Male' | 'Female' | 'M' | 'F' | '';
  birth_date: string;
  date_of_birth?: string;
  tin: string;
  appointment_date: string;
  original_appointment_date?: string;
  last_promotion_date: string;
  eligibility: string;
  civil_service_eligibility?: string;
  employment_status?: string;
  personnel_category: PersonnelCategory;
  position_status: PositionStatus;
  source_pdf?: string;
  import_batch_id?: string;
  imported_by?: string;
  approval_status?: ApprovalStatus;
  fiscal_year?: number;
  organizational_unit?: string;
  department?: string;
  bureau?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlantillaHeader {
  id: string;
  fiscal_year: number;
  department: string;
  bureau_agency: string;
  division_office: string;
  total_positions: number;
  filled_positions: number;
  unfilled_positions: number;
  authorized_amount: number;
  actual_amount: number;
  source_pdf?: string;
  imported_by?: string;
  created_at?: string;
}

export interface PSIPOPAuditLog {
  id: string;
  imported_by: string;
  import_date: string;
  pdf_filename: string;
  fiscal_year?: number;
  positions_added: number;
  positions_updated: number;
  positions_vacated: number;
  positions_filled: number;
  total_records: number;
  status: 'Completed' | 'Pending_Approval' | 'Rejected';
  import_batch_id?: string;
}

export interface SchoolPlantillaSummary {
  school_code: string;
  school_name: string;
  school_type: SchoolType;
  authorized_plantilla: number;
  filled_positions: number;
  vacant_positions: number;
  total_employees: number;
}

// ── Automatic Personnel Classification ──────────────────────────────────────

export function classifyPersonnelCategory(title: string): PersonnelCategory {
  const upper = title.toUpperCase();

  if (
    upper.includes('TEACHER') ||
    upper.includes('MASTER TEACHER') ||
    upper.includes('HEAD TEACHER') ||
    upper.includes('PRINCIPAL') ||
    upper.includes('SPET') ||
    upper.includes('INSTRUCTOR') ||
    upper.includes('PROFESSOR')
  ) {
    return 'Teaching';
  }

  if (
    upper.includes('EDUCATION PROGRAM') ||
    upper.includes('SUPERVISOR') ||
    upper.includes('PSDS') ||
    upper.includes('EPS') ||
    upper.includes('GUIDANCE') ||
    upper.includes('LIBRARIAN') ||
    upper.includes('VOCATIONAL') ||
    upper.includes('CHIEF EDUCATION')
  ) {
    return 'Teaching Related';
  }

  return 'Non-Teaching';
}

// ── Seed Data ──────────────────────────────────────────────────────────────

export const INITIAL_PLANTILLA_POSITIONS: PlantillaPosition[] = [
  {
    id: 'pl-als-001',
    item_number: 'OSEC-DECSB-TCH1-270096-2023',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2024-096',
    employee_name: 'APACIBLE, ALDRIN IBALE',
    sex: 'Male',
    birth_date: '10/19/1992',
    date_of_birth: '10/19/1992',
    tin: '330124009000',
    appointment_date: '09/05/2024',
    original_appointment_date: '09/05/2024',
    last_promotion_date: '09/05/2024',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '041',
    level: 'R',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-als-002',
    item_number: 'OSEC-DECSB-TCH1-270412-2025',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2025-412',
    employee_name: 'LUMAGBAS, EDGAR ECLIPSE',
    sex: 'Male',
    birth_date: '12/26/1977',
    date_of_birth: '12/26/1977',
    tin: '201236901000',
    appointment_date: '06/25/2025',
    original_appointment_date: '06/25/2025',
    last_promotion_date: '06/25/2025',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '1536',
    level: 'M',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-als-003',
    item_number: 'OSEC-DECSB-TCH1-270413-2025',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2025-413',
    employee_name: 'LURICA, JOESANREY CORPIN',
    sex: 'Male',
    birth_date: '08/15/1986',
    date_of_birth: '08/15/1986',
    tin: '268482164000',
    appointment_date: '07/03/2025',
    original_appointment_date: '07/03/2025',
    last_promotion_date: '07/03/2025',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '1536',
    level: 'M',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-als-004',
    item_number: 'OSEC-DECSB-TCH1-270414-2025',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2025-414',
    employee_name: 'POBLETE, EUPEL NATIVIDAD',
    sex: 'Female',
    birth_date: '08/20/1993',
    date_of_birth: '08/20/1993',
    tin: '318821619000',
    appointment_date: '07/01/2025',
    original_appointment_date: '07/01/2025',
    last_promotion_date: '07/01/2025',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '1536',
    level: 'M',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-als-005',
    item_number: 'OSEC-DECSB-TCH1-270929-2024',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2024-929',
    employee_name: 'BARBACENA, EUNICE ANNE CARDOZA',
    sex: 'Female',
    birth_date: '01/23/1999',
    date_of_birth: '01/23/1999',
    tin: '645557294000',
    appointment_date: '07/22/2024',
    original_appointment_date: '07/22/2024',
    last_promotion_date: '07/22/2024',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '1536',
    level: 'M',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-als-006',
    item_number: 'OSEC-DECSB-TCH1-270930-2024',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    step: 1,
    annual_salary: 360288,
    authorized_salary: 360288,
    actual_salary: 360288,
    school_id: 'SCH-1801.0005',
    school_name: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    school_type: 'Division Office',
    office_assignment: 'Alternative Learning System (ALS)',
    employee_id: 'EMP-2024-930',
    employee_name: 'CARANZA, MA FE ESTEBAN',
    sex: 'Female',
    birth_date: '09/30/1983',
    date_of_birth: '09/30/1983',
    tin: '439338532000',
    appointment_date: '09/05/2024',
    original_appointment_date: '09/05/2024',
    last_promotion_date: '09/05/2024',
    eligibility: 'LET',
    civil_service_eligibility: 'LET',
    employment_status: 'Permanent',
    appointment_type: 'Regular',
    occupation_code: '1536',
    level: 'M',
    ppa_attribution: '310400100002000',
    organizational_unit: '1801.0005 DIVISION OF CALAMBA CITY - ALS',
    department: 'Department of Education',
    bureau: 'Office of the Secretary',
    fiscal_year: 2025,
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'Admin Officer',
  },
  {
    id: 'pl-001',
    item_number: 'OSEC-DECSB-TCH1-300101-2022',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    annual_salary: 324000,
    authorized_salary: 324000,
    actual_salary: 324000,
    school_id: 'SCH-1001',
    school_name: 'Mabini Central Elementary School',
    school_type: 'Elementary',
    office_assignment: 'Grade 1 Department',
    employee_id: 'EMP-2024-001',
    employee_name: 'SANTOS, MARIA CLARA',
    sex: 'Female',
    birth_date: '1992-05-14',
    tin: '123-456-789-000',
    appointment_date: '2018-06-01',
    last_promotion_date: '2021-08-15',
    eligibility: 'LET / PBET',
    employment_status: 'Permanent',
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-002',
    item_number: 'OSEC-DECSB-TCH2-300102-2021',
    position_title: 'Teacher II',
    salary_grade: 12,
    salary_step: 2,
    annual_salary: 350000,
    authorized_salary: 350000,
    actual_salary: 350000,
    school_id: 'SCH-1001',
    school_name: 'Mabini Central Elementary School',
    school_type: 'Elementary',
    office_assignment: 'Grade 4 Department',
    employee_id: 'EMP-2024-002',
    employee_name: 'DELA CRUZ, JUAN MIGUEL',
    sex: 'Male',
    birth_date: '1988-11-03',
    tin: '234-567-890-000',
    appointment_date: '2015-09-15',
    last_promotion_date: '2020-01-10',
    eligibility: 'LET Passed',
    employment_status: 'Permanent',
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-003',
    item_number: 'OSEC-DECSB-TCH3-300103-2020',
    position_title: 'Teacher III',
    salary_grade: 13,
    salary_step: 3,
    annual_salary: 382000,
    authorized_salary: 382000,
    actual_salary: 382000,
    school_id: 'SCH-2001',
    school_name: 'Rizal National High School',
    school_type: 'High School',
    office_assignment: 'Science Department',
    employee_id: 'EMP-2024-003',
    employee_name: 'REYES, JOSE PAULO',
    sex: 'Male',
    birth_date: '1985-02-20',
    tin: '345-678-901-000',
    appointment_date: '2012-07-01',
    last_promotion_date: '2019-03-22',
    eligibility: 'LET Passed',
    employment_status: 'Permanent',
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-004',
    item_number: 'OSEC-DECSB-MTCH1-300104-2019',
    position_title: 'Master Teacher I',
    salary_grade: 18,
    salary_step: 1,
    annual_salary: 580000,
    authorized_salary: 580000,
    actual_salary: 580000,
    school_id: 'SCH-2001',
    school_name: 'Rizal National High School',
    school_type: 'High School',
    office_assignment: 'Mathematics Department',
    employee_id: 'EMP-2024-004',
    employee_name: 'GONZALES, ANA LIZA',
    sex: 'Female',
    birth_date: '1979-08-12',
    tin: '456-789-012-000',
    appointment_date: '2005-06-15',
    last_promotion_date: '2018-10-01',
    eligibility: 'LET / Masteral Degree',
    employment_status: 'Permanent',
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-005',
    item_number: 'OSEC-DECSB-PRN1-300105-2018',
    position_title: 'Principal I',
    salary_grade: 19,
    salary_step: 2,
    annual_salary: 630000,
    authorized_salary: 630000,
    actual_salary: 0,
    school_id: 'SCH-1002',
    school_name: 'Bonifacio Elementary School',
    school_type: 'Elementary',
    office_assignment: 'Office of the School Head',
    employee_id: '',
    employee_name: '',
    sex: '',
    birth_date: '',
    tin: '',
    appointment_date: '',
    last_promotion_date: '',
    eligibility: 'NQESH / NOP Passed',
    employment_status: '',
    personnel_category: 'Teaching',
    position_status: 'Vacant',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-006',
    item_number: 'OSEC-DECSB-ADOF5-300106-2018',
    position_title: 'Administrative Officer V',
    salary_grade: 18,
    salary_step: 1,
    annual_salary: 580000,
    authorized_salary: 580000,
    actual_salary: 580000,
    school_id: 'SCH-3001',
    school_name: 'Quezon High School (Implementing Unit)',
    school_type: 'Implementing Unit',
    office_assignment: 'Administrative Services',
    employee_id: 'EMP-2024-006',
    employee_name: 'BAUTISTA, ROBERT JAMES',
    sex: 'Male',
    birth_date: '1982-04-25',
    tin: '567-890-123-000',
    appointment_date: '2010-02-10',
    last_promotion_date: '2020-05-18',
    eligibility: 'Career Service Professional',
    employment_status: 'Permanent',
    personnel_category: 'Non-Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-007',
    item_number: 'OSEC-DECSB-EPS1-300107-2021',
    position_title: 'Education Program Specialist II',
    salary_grade: 16,
    salary_step: 1,
    annual_salary: 480000,
    authorized_salary: 480000,
    actual_salary: 480000,
    school_id: 'DIV-001',
    school_name: 'Division Office',
    school_type: 'Division Office',
    office_assignment: 'Curriculum Implementation Division',
    employee_id: 'EMP-2024-007',
    employee_name: 'MENDOZA, CORAZON',
    sex: 'Female',
    birth_date: '1976-12-08',
    tin: '678-901-234-000',
    appointment_date: '2008-01-15',
    last_promotion_date: '2017-09-01',
    eligibility: 'LET / RA 1080',
    employment_status: 'Permanent',
    personnel_category: 'Teaching Related',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-008',
    item_number: 'OSEC-DECSB-ADA6-300108-2022',
    position_title: 'Administrative Assistant III',
    salary_grade: 9,
    salary_step: 1,
    annual_salary: 260000,
    authorized_salary: 260000,
    actual_salary: 0,
    school_id: 'DIV-001',
    school_name: 'Division Office',
    school_type: 'Division Office',
    office_assignment: 'Accounting Section',
    employee_id: '',
    employee_name: '',
    sex: '',
    birth_date: '',
    tin: '',
    appointment_date: '',
    last_promotion_date: '',
    eligibility: 'Career Service Sub-Professional',
    employment_status: '',
    personnel_category: 'Non-Teaching',
    position_status: 'Vacant',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-009',
    item_number: 'OSEC-DECSB-GC1-300109-2021',
    position_title: 'Guidance Counselor I',
    salary_grade: 11,
    salary_step: 1,
    annual_salary: 324000,
    authorized_salary: 324000,
    actual_salary: 324000,
    school_id: 'SCH-2001',
    school_name: 'Rizal National High School',
    school_type: 'High School',
    office_assignment: 'Guidance Office',
    employee_id: 'EMP-2024-009',
    employee_name: 'AQUINO, TERESA ROSA',
    sex: 'Female',
    birth_date: '1990-09-17',
    tin: '789-012-345-000',
    appointment_date: '2019-11-04',
    last_promotion_date: '2022-04-12',
    eligibility: 'RA 1080 Guidance Counselor',
    employment_status: 'Permanent',
    personnel_category: 'Teaching Related',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
  {
    id: 'pl-010',
    item_number: 'OSEC-DECSB-TCH1-300110-2023',
    position_title: 'Teacher I',
    salary_grade: 11,
    salary_step: 1,
    annual_salary: 324000,
    authorized_salary: 324000,
    actual_salary: 324000,
    school_id: 'SCH-1002',
    school_name: 'Bonifacio Elementary School',
    school_type: 'Elementary',
    office_assignment: 'Grade 2 Department',
    employee_id: 'EMP-2024-010',
    employee_name: 'RAMOS, BENJAMIN JR.',
    sex: 'Male',
    birth_date: '1995-01-30',
    tin: '890-123-456-000',
    appointment_date: '2022-08-22',
    last_promotion_date: '2022-08-22',
    eligibility: 'LET Passed',
    employment_status: 'Permanent',
    personnel_category: 'Teaching',
    position_status: 'Filled',
    approval_status: 'Approved',
    imported_by: 'HR Officer',
  },
];

export const INITIAL_HEADERS: PlantillaHeader[] = [];

// No default/fake entries — the "Recent Imports" list is loaded from the
// plantilla_import_logs table so only real uploads ever appear.
export const INITIAL_AUDIT_LOGS: PSIPOPAuditLog[] = [];  // No default entries — only real uploads appear.

// ── Data Access Layer ──────────────────────────────────────────────────────

const LS_KEY = 'deped_plantilla_positions';

export async function loadPlantillaPositions(): Promise<PlantillaPosition[]> {
  try {
    const data = await fetchAll<PlantillaPosition>(() =>
      supabase.from('plantilla_positions').select('*').order('item_number', { ascending: true })
    );
    if (data && data.length > 0) return data;
  } catch {
    // fall through to localStorage
  }

  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch { /* ignore */ }
  }
  // No hardcoded seed data — the Plantilla Intelligence Center starts empty
  // until the user uploads real PSIPOP PDF files.
  return [];
}

export async function savePlantillaPositions(positions: PlantillaPosition[]): Promise<void> {
  // The database is the source of truth — never swallow a failed write, or
  // uploads look "saved" (local-only) and then disappear after a reload.
  const { error } = await supabase.from('plantilla_positions').upsert(positions, { onConflict: 'id' });
  if (error) {
    throw new Error(`Plantilla positions could not be saved: ${error.message}`);
  }
  localStorage.setItem(LS_KEY, JSON.stringify(positions));
}

export async function deletePlantillaPosition(id: string, updatedPositions: PlantillaPosition[]): Promise<void> {
  const { error } = await supabase.from('plantilla_positions').delete().eq('id', id);
  if (error) throw new Error(`Could not delete position: ${error.message}`);
  localStorage.setItem(LS_KEY, JSON.stringify(updatedPositions));
}

export async function bulkDeletePlantillaPositions(ids: string[], updatedPositions: PlantillaPosition[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('plantilla_positions').delete().in('id', ids);
  if (error) throw new Error(`Could not delete positions: ${error.message}`);
  localStorage.setItem(LS_KEY, JSON.stringify(updatedPositions));
}

export async function deleteAllPlantillaPositions(): Promise<void> {
  const { error } = await supabase.from('plantilla_positions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(`Could not delete positions: ${error.message}`);
  localStorage.removeItem(LS_KEY);
}

/** Load the real PSIPOP import audit trail from the database (newest first). */
export async function loadImportLogs(): Promise<PSIPOPAuditLog[]> {
  try {
    return await fetchAll<PSIPOPAuditLog>(() =>
      supabase.from('plantilla_import_logs').select('*').order('created_at', { ascending: false }).order('import_date', { ascending: false })
    );
  } catch (err) {
    console.error('Error loading plantilla import logs:', err);
    return [];
  }
}

/** Persist a completed PSIPOP import to the audit trail. */
export async function saveImportLog(log: PSIPOPAuditLog): Promise<void> {
  const { error } = await supabase.from('plantilla_import_logs').upsert(log, { onConflict: 'id' });
  if (error) throw new Error(`Import log could not be saved: ${error.message}`);
}

/**
 * Remove duplicate plantilla positions by item_number, keeping the first
 * occurrence (which is the most recently imported). Returns the deduplicated
 * array and the count of removed duplicates.
 */
export function deduplicatePositions(positions: PlantillaPosition[]): {
  deduped: PlantillaPosition[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const deduped: PlantillaPosition[] = [];
  for (const pos of positions) {
    const key = (pos.item_number || '').toUpperCase().trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(pos);
  }
  return { deduped, removedCount: positions.length - deduped.length };
}
