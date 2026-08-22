/*
# Initial Payroll System — dedicated subsystem tables (fix)

Fixes a typo in the previous attempt: DROP POLICY referenced `ips_abs_delete`
instead of `ips_absences`. Re-creates all tables idempotently.
*/

-- ── Employees ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  last_name text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  position text,
  department text,
  employment_status text NOT NULL DEFAULT 'Active',
  salary_rate numeric(12,2) NOT NULL DEFAULT 0,
  date_hired date,
  effectivity_date date NOT NULL DEFAULT CURRENT_DATE,
  tin text,
  gsis_number text,
  philhealth_number text,
  pagibig_number text,
  email text,
  contact_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ips_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ips_emp_select" ON ips_employees;
CREATE POLICY "ips_emp_select" ON ips_employees FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ips_emp_insert" ON ips_employees;
CREATE POLICY "ips_emp_insert" ON ips_employees FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ips_emp_update" ON ips_employees;
CREATE POLICY "ips_emp_update" ON ips_employees FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ips_emp_delete" ON ips_employees;
CREATE POLICY "ips_emp_delete" ON ips_employees FOR DELETE
  TO authenticated USING (true);

-- ── Payroll Periods ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL DEFAULT '1st',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ips_payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ips_pp_select" ON ips_payroll_periods;
CREATE POLICY "ips_pp_select" ON ips_payroll_periods FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ips_pp_insert" ON ips_payroll_periods;
CREATE POLICY "ips_pp_insert" ON ips_payroll_periods FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ips_pp_update" ON ips_payroll_periods;
CREATE POLICY "ips_pp_update" ON ips_payroll_periods FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ips_pp_delete" ON ips_payroll_periods;
CREATE POLICY "ips_pp_delete" ON ips_payroll_periods FOR DELETE
  TO authenticated USING (true);

-- ── Payroll Details (computed) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_payroll_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES ips_employees(id) ON DELETE CASCADE,
  period_id uuid REFERENCES ips_payroll_periods(id) ON DELETE SET NULL,
  effectivity_date date NOT NULL,
  actual_working_days integer NOT NULL DEFAULT 0,
  adjustment integer NOT NULL DEFAULT 0,
  csc_days_present integer NOT NULL DEFAULT 0,
  calendar_days integer NOT NULL DEFAULT 0,
  absences_deducted integer NOT NULL DEFAULT 0,
  final_csc_days_present integer NOT NULL DEFAULT 0,
  gross_salary numeric(12,2) NOT NULL DEFAULT 0,
  pera numeric(12,2) NOT NULL DEFAULT 0,
  gsis numeric(12,2) NOT NULL DEFAULT 0,
  philhealth numeric(12,2) NOT NULL DEFAULT 0,
  pagibig numeric(12,2) NOT NULL DEFAULT 0,
  withholding_tax numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_id)
);

ALTER TABLE ips_payroll_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ips_pd_select" ON ips_payroll_details;
CREATE POLICY "ips_pd_select" ON ips_payroll_details FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ips_pd_insert" ON ips_payroll_details;
CREATE POLICY "ips_pd_insert" ON ips_payroll_details FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ips_pd_update" ON ips_payroll_details;
CREATE POLICY "ips_pd_update" ON ips_payroll_details FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ips_pd_delete" ON ips_payroll_details;
CREATE POLICY "ips_pd_delete" ON ips_payroll_details FOR DELETE
  TO authenticated USING (true);

-- ── Absences ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES ips_employees(id) ON DELETE CASCADE,
  date_of_absence date NOT NULL,
  number_of_days integer NOT NULL DEFAULT 1,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ips_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ips_abs_select" ON ips_absences;
CREATE POLICY "ips_abs_select" ON ips_absences FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ips_abs_insert" ON ips_absences;
CREATE POLICY "ips_abs_insert" ON ips_absences FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ips_abs_update" ON ips_absences;
CREATE POLICY "ips_abs_update" ON ips_absences FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ips_abs_delete" ON ips_absences;
CREATE POLICY "ips_abs_delete" ON ips_absences FOR DELETE
  TO authenticated USING (true);

-- ── Audit Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ips_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  changed_by text,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ips_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ips_audit_select" ON ips_audit_logs;
CREATE POLICY "ips_audit_select" ON ips_audit_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ips_audit_insert" ON ips_audit_logs;
CREATE POLICY "ips_audit_insert" ON ips_audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ips_employees_employee_id ON ips_employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_ips_payroll_details_employee ON ips_payroll_details(employee_id);
CREATE INDEX IF NOT EXISTS idx_ips_payroll_details_period ON ips_payroll_details(period_id);
CREATE INDEX IF NOT EXISTS idx_ips_absences_employee ON ips_absences(employee_id);
CREATE INDEX IF NOT EXISTS idx_ips_audit_logs_changed_at ON ips_audit_logs(changed_at DESC);