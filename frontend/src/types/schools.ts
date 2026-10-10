export type SchoolType = 'Elementary' | 'Junior High School' | 'Senior High School' | 'Implementing Unit';

export interface School {
  id: string;
  school_code: string;
  school_name: string;
  school_type: SchoolType;
  cluster: string;
  address: string;
  school_head: string;
  /** Administrative Officer II designated for the school (optional). */
  admin_officer_ii?: string;
  contact_number: string;
  email: string;
  status: string;
  /** Station code — mirrors `school_code`; payroll + the PAL match employees on it. */
  stacode?: string;
  /** Owning division (empty/'': not assigned to a division yet). */
  division_id?: string | null;
  region_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolWithStats extends School {
  total_employees: number;
  teaching_personnel: number;
  non_teaching_personnel: number;
  active_payroll_employees: number;
  /** True for a school merged in because it has no division_id (see SchoolManagement). */
  unscoped?: boolean;
}
