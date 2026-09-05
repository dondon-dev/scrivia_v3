export type SchoolType = 'Elementary' | 'Junior High School' | 'Senior High School' | 'Implementing Unit';

export interface School {
  id: string;
  school_code: string;
  school_name: string;
  school_type: SchoolType;
  cluster: string;
  address: string;
  school_head: string;
  contact_number: string;
  email: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolWithStats extends School {
  total_employees: number;
  teaching_personnel: number;
  non_teaching_personnel: number;
  active_payroll_employees: number;
}
