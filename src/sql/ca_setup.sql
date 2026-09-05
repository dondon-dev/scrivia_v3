-- Communication Allowance (CA) Payroll Setup
-- Run this in PocketBase SQL console or via migration

-- CA Employees Masterfile
CREATE TABLE IF NOT EXISTS ca_employees (
  id TEXT PRIMARY KEY,
  account_no TEXT NOT NULL UNIQUE,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_initial TEXT,
  position_title TEXT,
  school_name TEXT,
  stacode TEXT,
  category TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- CA Payroll Headers
CREATE TABLE IF NOT EXISTS ca_payroll_headers (
  id TEXT PRIMARY KEY,
  payroll_no TEXT NOT NULL UNIQUE,
  agency TEXT,
  division TEXT,
  school_name TEXT,
  payroll_type TEXT,
  covered_period TEXT,
  status TEXT DEFAULT 'Draft',
  date_generated TEXT,
  total_employees INTEGER DEFAULT 0,
  gross_amount REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  alobs_no TEXT,
  jev_no TEXT,
  payroll_ref_no TEXT,
  created_date TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- CA Payroll Details
CREATE TABLE IF NOT EXISTS ca_payroll_details (
  id TEXT PRIMARY KEY,
  payroll_id TEXT NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES ca_employees(id),
  line_no INTEGER NOT NULL,
  amount REAL DEFAULT 0,
  deduction REAL DEFAULT 0,
  net_amount_due REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- CA Payroll Signatories
CREATE TABLE IF NOT EXISTS ca_payroll_signatories (
  id TEXT PRIMARY KEY,
  payroll_id TEXT NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  name TEXT,
  designation TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ca_employees_account_no ON ca_employees (account_no);
CREATE INDEX IF NOT EXISTS idx_ca_employees_stacode ON ca_employees (stacode);
CREATE INDEX IF NOT EXISTS idx_ca_employees_category ON ca_employees (category);
CREATE INDEX IF NOT EXISTS idx_ca_employees_status ON ca_employees (status);

CREATE INDEX IF NOT EXISTS idx_ca_payroll_details_payroll_id ON ca_payroll_details (payroll_id);
CREATE INDEX IF NOT EXISTS idx_ca_payroll_details_employee_id ON ca_payroll_details (employee_id);
CREATE INDEX IF NOT EXISTS idx_ca_payroll_details_line_no ON ca_payroll_details (line_no);

CREATE INDEX IF NOT EXISTS idx_ca_payroll_signatories_payroll_id ON ca_payroll_signatories (payroll_id);
CREATE INDEX IF NOT EXISTS idx_ca_payroll_signatories_sequence ON ca_payroll_signatories (sequence_no);