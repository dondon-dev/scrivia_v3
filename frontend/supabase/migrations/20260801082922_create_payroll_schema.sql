/*
# Payroll System Schema (single-tenant, no auth)

1. New Tables
- `employees`: The master file of all employees with payroll details (name, position, department, bank, salary, tax status).
- `pay_periods`: Payroll run periods with start/end dates, cut-off, and status (draft/open/closed).
- `earnings`: Per-employee earnings entries (basic, overtime, bonus, allowance, etc.) for a pay period.
- `deductions`: Per-employee deductions (SSS, PhilHealth, Pag-IBIG, tax, loans, etc.) for a pay period. Each deduction has a code and category so it can be grouped into deduction files.
- `payroll_entries`: Computed net-pay summary per employee per pay period.

2. Security
- Enable RLS on every table.
- Single-tenant app (no sign-in): allow anon + authenticated full CRUD because data is intentionally shared.
- `USING (true)` / `WITH CHECK (true)` is acceptable here because there is no per-user data isolation.

3. Important Notes
- Amounts stored as numeric(14,2) for precise monetary calculation.
- `deduction_code` is a short identifier (e.g. SSS, PHIC, PIBIG, TAX, LOAN) used to group deductions into separate files.
- `pay_period_status` uses a text check constraint: draft | open | closed.
- `payroll_entries.net_pay` is derived but stored for historical record.
*/

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text UNIQUE NOT NULL,
  last_name text NOT NULL,
  first_name text NOT NULL,
  middle_name text DEFAULT '',
  position text DEFAULT '',
  department text DEFAULT '',
  bank_name text DEFAULT '',
  bank_account text DEFAULT '',
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  hourly_rate numeric(14,2) NOT NULL DEFAULT 0,
  tax_status text DEFAULT 'ME1',
  sss_number text DEFAULT '',
  philhealth_number text DEFAULT '',
  pagibig_number text DEFAULT '',
  tin text DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  hire_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_employees" ON employees;
CREATE POLICY "anon_select_employees" ON employees FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_employees" ON employees;
CREATE POLICY "anon_insert_employees" ON employees FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_employees" ON employees;
CREATE POLICY "anon_delete_employees" ON employees FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  cutoff_date date,
  pay_date date,
  frequency text DEFAULT 'Semi-Monthly',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_pay_periods" ON pay_periods;
CREATE POLICY "anon_select_pay_periods" ON pay_periods FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pay_periods" ON pay_periods;
CREATE POLICY "anon_insert_pay_periods" ON pay_periods FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pay_periods" ON pay_periods;
CREATE POLICY "anon_update_pay_periods" ON pay_periods FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pay_periods" ON pay_periods;
CREATE POLICY "anon_delete_pay_periods" ON pay_periods FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  earning_type text NOT NULL DEFAULT 'Basic',
  hours numeric(8,2) DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_earnings" ON earnings;
CREATE POLICY "anon_select_earnings" ON earnings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_earnings" ON earnings;
CREATE POLICY "anon_insert_earnings" ON earnings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_earnings" ON earnings;
CREATE POLICY "anon_update_earnings" ON earnings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_earnings" ON earnings;
CREATE POLICY "anon_delete_earnings" ON earnings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  deduction_code text NOT NULL DEFAULT 'MISC',
  deduction_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Mandatory',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  source text DEFAULT 'Manual',
  reference text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_deductions" ON deductions;
CREATE POLICY "anon_select_deductions" ON deductions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deductions" ON deductions;
CREATE POLICY "anon_insert_deductions" ON deductions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deductions" ON deductions;
CREATE POLICY "anon_update_deductions" ON employees;
CREATE POLICY "anon_update_deductions" ON deductions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deductions" ON deductions;
CREATE POLICY "anon_delete_deductions" ON deductions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  gross_pay numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Computed' CHECK (status IN ('Computed','Posted','Reversed')),
  processed_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, pay_period_id)
);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_payroll_entries" ON payroll_entries;
CREATE POLICY "anon_select_payroll_entries" ON payroll_entries FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_payroll_entries" ON payroll_entries;
CREATE POLICY "anon_insert_payroll_entries" ON payroll_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_payroll_entries" ON payroll_entries;
CREATE POLICY "anon_update_payroll_entries" ON payroll_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_payroll_entries" ON payroll_entries;
CREATE POLICY "anon_delete_payroll_entries" ON payroll_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_earnings_employee ON earnings(employee_id);
CREATE INDEX IF NOT EXISTS idx_earnings_period ON earnings(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_deductions_employee ON deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_deductions_period ON deductions(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_deductions_code ON deductions(deduction_code);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
