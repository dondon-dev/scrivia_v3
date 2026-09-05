/*
# Initial Payroll Management System

## Purpose
Separate payroll for newly hired employees whose payroll requirements are not yet complete.
Employees stay in Initial Payroll until all requirements (ATM, TIN, PhilHealth, Pag-IBIG,
appointment validation) are submitted and approved, then they are transferred to Regular Payroll.

## New Tables

1. **initial_payroll_records** — Header + line items for each initial payroll run.
   - payroll_no (unique, format YYYY-MM-XXX)
   - payroll_date, period_from, period_to, description
   - status: draft / posted / reversed
   - created_by, created_at, updated_at

2. **initial_payroll_entries** — Per-employee payroll line items within an initial payroll run.
   - record_id (FK to initial_payroll_records)
   - employee_id (FK to employees)
   - days_worked, daily_rate, gross_salary
   - Earnings: basic_salary, pera, mid_year_bonus, cash_gift, clothing_allowance, cna_incentive, other_earnings
   - Deductions: gsis, philhealth, pagibig, withholding_tax, loans, other_deductions
   - total_earnings, total_deductions, net_pay
   - created_at

3. **initial_payroll_transfers** — Audit log of employees moved from Initial to Regular Payroll.
   - employee_id, employee_name, employee_number
   - transferred_at, payroll_no, processed_by

4. **signatories** — Payroll signatory maintenance (editable via Admin Settings).
   - role: prepared_by / certified_correct / checked_by / recommending_approval / approved_by
   - name, position, office
   - is_active, updated_at

5. **payroll_number_counter** — Sequential counter for automatic payroll numbering (YYYY-MM-XXX).
   - year, month, last_number

## Modified Tables
- **employees** — Added `payroll_status` column (text, default 'Regular Payroll').
  Values: 'Initial Payroll', 'Regular Payroll', 'Inactive'.
  Added requirement-check columns:
  - req_appointment_validated (boolean default false)
  - req_tin_submitted (boolean default false)
  - req_philhealth_submitted (boolean default false)
  - req_pagibig_submitted (boolean default false)
  - req_atm_submitted (boolean default false)

## Security
- RLS enabled on all new tables, scoped to authenticated users.
- Employees table already has RLS; new column inherits existing policies.

## Notes
- Newly hired employees default to 'Initial Payroll' via application logic.
- Payroll number format: YYYY-MM-XXX (e.g. 2026-07-074). Admin may override.
- Transfer preserves initial payroll history (entries are never deleted).
*/

-- ── payroll_status + requirement flags on employees ──
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS payroll_status text NOT NULL DEFAULT 'Regular Payroll';
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS req_appointment_validated boolean NOT NULL DEFAULT false;
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS req_tin_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS req_philhealth_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS req_pagibig_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS req_atm_submitted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_payroll_status ON employees (payroll_status);

-- ── initial_payroll_records ──
CREATE TABLE IF NOT EXISTS initial_payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_no text UNIQUE NOT NULL,
  payroll_date date,
  period_from date,
  period_to date,
  description text,
  status text NOT NULL DEFAULT 'draft',
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE initial_payroll_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_initial_payroll_records" ON initial_payroll_records;
CREATE POLICY "select_initial_payroll_records" ON initial_payroll_records FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_initial_payroll_records" ON initial_payroll_records;
CREATE POLICY "insert_initial_payroll_records" ON initial_payroll_records FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_initial_payroll_records" ON initial_payroll_records;
CREATE POLICY "update_initial_payroll_records" ON initial_payroll_records FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_initial_payroll_records" ON initial_payroll_records;
CREATE POLICY "delete_initial_payroll_records" ON initial_payroll_records FOR DELETE
  TO authenticated USING (true);

-- ── initial_payroll_entries ──
CREATE TABLE IF NOT EXISTS initial_payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES initial_payroll_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  item_no text,
  employee_number text,
  surname text,
  first_name text,
  middle_name text,
  school text,
  position_title text,
  salary_grade integer,
  salary_step integer,
  monthly_salary numeric(14,2),
  days_worked numeric(5,1) NOT NULL DEFAULT 0,
  daily_rate numeric(14,2) NOT NULL DEFAULT 0,
  gross_salary numeric(14,2) NOT NULL DEFAULT 0,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  pera numeric(14,2) NOT NULL DEFAULT 0,
  mid_year_bonus numeric(14,2) NOT NULL DEFAULT 0,
  cash_gift numeric(14,2) NOT NULL DEFAULT 0,
  clothing_allowance numeric(14,2) NOT NULL DEFAULT 0,
  cna_incentive numeric(14,2) NOT NULL DEFAULT 0,
  other_earnings numeric(14,2) NOT NULL DEFAULT 0,
  total_earnings numeric(14,2) NOT NULL DEFAULT 0,
  gsis numeric(14,2) NOT NULL DEFAULT 0,
  philhealth numeric(14,2) NOT NULL DEFAULT 0,
  pagibig numeric(14,2) NOT NULL DEFAULT 0,
  withholding_tax numeric(14,2) NOT NULL DEFAULT 0,
  loans numeric(14,2) NOT NULL DEFAULT 0,
  other_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  tin text,
  philhealth_no text,
  hdmf_no text,
  atm_account_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE initial_payroll_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_initial_payroll_entries" ON initial_payroll_entries;
CREATE POLICY "select_initial_payroll_entries" ON initial_payroll_entries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_initial_payroll_entries" ON initial_payroll_entries;
CREATE POLICY "insert_initial_payroll_entries" ON initial_payroll_entries FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_initial_payroll_entries" ON initial_payroll_entries;
CREATE POLICY "update_initial_payroll_entries" ON initial_payroll_entries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_initial_payroll_entries" ON initial_payroll_entries;
CREATE POLICY "delete_initial_payroll_entries" ON initial_payroll_entries FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ip_entries_record ON initial_payroll_entries (record_id);
CREATE INDEX IF NOT EXISTS idx_ip_entries_employee ON initial_payroll_entries (employee_id);

-- ── initial_payroll_transfers ──
CREATE TABLE IF NOT EXISTS initial_payroll_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_number text,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  payroll_no text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by_name text
);

ALTER TABLE initial_payroll_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_initial_payroll_transfers" ON initial_payroll_transfers;
CREATE POLICY "select_initial_payroll_transfers" ON initial_payroll_transfers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_initial_payroll_transfers" ON initial_payroll_transfers;
CREATE POLICY "insert_initial_payroll_transfers" ON initial_payroll_transfers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_initial_payroll_transfers" ON initial_payroll_transfers;
CREATE POLICY "update_initial_payroll_transfers" ON initial_payroll_transfers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_initial_payroll_transfers" ON initial_payroll_transfers;
CREATE POLICY "delete_initial_payroll_transfers" ON initial_payroll_transfers FOR DELETE
  TO authenticated USING (true);

-- ── signatories ──
CREATE TABLE IF NOT EXISTS signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  name text NOT NULL,
  position text,
  office text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signatories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_signatories" ON signatories;
CREATE POLICY "select_signatories" ON signatories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_signatories" ON signatories;
CREATE POLICY "insert_signatories" ON signatories FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_signatories" ON signatories;
CREATE POLICY "update_signatories" ON signatories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_signatories" ON signatories;
CREATE POLICY "delete_signatories" ON signatories FOR DELETE
  TO authenticated USING (true);

-- ── payroll_number_counter ──
CREATE TABLE IF NOT EXISTS payroll_number_counter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  UNIQUE (year, month)
);

ALTER TABLE payroll_number_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payroll_number_counter" ON payroll_number_counter;
CREATE POLICY "select_payroll_number_counter" ON payroll_number_counter FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_payroll_number_counter" ON payroll_number_counter;
CREATE POLICY "insert_payroll_number_counter" ON payroll_number_counter FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_payroll_number_counter" ON payroll_number_counter;
CREATE POLICY "update_payroll_number_counter" ON payroll_number_counter FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_payroll_number_counter" ON payroll_number_counter;
CREATE POLICY "delete_payroll_number_counter" ON payroll_number_counter FOR DELETE
  TO authenticated USING (true);

-- ── Seed default signatories ──
INSERT INTO signatories (role, name, position, office, is_active)
VALUES
  ('prepared_by', 'Payroll Processor', 'Payroll Processor', 'Accounting Office', false),
  ('certified_correct', 'Accounting Officer', 'Accounting Officer', 'Accounting Office', false),
  ('checked_by', 'HR Administrator', 'HR Administrator', 'Human Resources', false),
  ('recommending_approval', 'Division Chief', 'Division Chief', 'Office of the Superintendent', false),
  ('approved_by', 'Schools Division Superintendent', 'Schools Division Superintendent', 'Office of the Superintendent', false)
ON CONFLICT DO NOTHING;
