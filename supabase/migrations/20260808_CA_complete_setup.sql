/*
# CA Payroll — COMPLETE SETUP (one script, safe to re-run)
# Department of Education · Division of Calamba City · Communication Allowance module
#
# This file is the single migration to run in the Supabase SQL Editor. It combines:
#   1. 20260808_create_comm_allowance_payroll.sql  — ca_employees, ca_payroll_headers,
#      ca_payroll_details, ca_payroll_signatories + RLS policies
#   2. 20260808_add_ca_employee_category.sql       — adds the `category` column
#   3. 20260808_add_ca_employee_categories.sql     — widens category CHECK to the 7
#      payroll-breakdown groups
# …plus a PostgREST schema-cache reload (NOTIFY pgrst) so the app immediately sees
# the new tables instead of "Could not find the table … in the schema cache".
#
# Everything is idempotent (IF NOT EXISTS / DROP IF EXISTS) — running it more than
# once is harmless. Run order: paste the whole file, click Run.
*/

-- ── CA Employees (tblEmployee) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ca_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_no text NOT NULL UNIQUE,
  last_name text NOT NULL,
  first_name text NOT NULL,
  middle_initial text DEFAULT '',
  position_title text DEFAULT '',
  school_name text DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_emp_school ON ca_employees (school_name);
CREATE INDEX IF NOT EXISTS idx_ca_emp_status ON ca_employees (status);
CREATE INDEX IF NOT EXISTS idx_ca_emp_name ON ca_employees (last_name, first_name);

-- ── CA Payroll Headers (tblPayrollHeader) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ca_payroll_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_no text NOT NULL UNIQUE,
  payroll_type text NOT NULL DEFAULT 'Communication Allowance',
  payroll_title text NOT NULL DEFAULT 'Communication Allowance',
  agency text NOT NULL DEFAULT 'Department of Education',
  division text NOT NULL DEFAULT 'Division of Calamba City',
  school_name text NOT NULL DEFAULT '',
  covered_period text NOT NULL DEFAULT '',
  total_employees integer NOT NULL DEFAULT 0,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Generated', 'Reviewed', 'Approved', 'Posted', 'Paid', 'Archived')),
  alobs_no text DEFAULT '',
  jev_no text DEFAULT '',
  eo_no text DEFAULT '',
  date date,
  payroll_ref_no text DEFAULT '',
  remarks text DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_hdr_status ON ca_payroll_headers (status);
CREATE INDEX IF NOT EXISTS idx_ca_hdr_school ON ca_payroll_headers (school_name);
CREATE INDEX IF NOT EXISTS idx_ca_hdr_created ON ca_payroll_headers (created_date DESC);

-- ── CA Payroll Details (tblPayrollDetail) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ca_payroll_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES ca_employees(id) ON DELETE RESTRICT,
  line_no integer NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  net_amount_due numeric(14,2) NOT NULL DEFAULT 0,
  signature_image text DEFAULT NULL,
  remarks text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_ca_det_payroll ON ca_payroll_details (payroll_id);
CREATE INDEX IF NOT EXISTS idx_ca_det_emp ON ca_payroll_details (employee_id);

-- ── CA Payroll Signatories (tblPayrollSignatory) ───────────────────────────
CREATE TABLE IF NOT EXISTS ca_payroll_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
  signatory_type text NOT NULL,
  name text DEFAULT '',
  position text DEFAULT '',
  sequence_no integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ca_sig_payroll ON ca_payroll_signatories (payroll_id, sequence_no);

-- ── Category column + 7 payroll-breakdown groups ───────────────────────────
-- (column comes from 20260808_add_ca_employee_category.sql; the widened CHECK
--  from 20260808_add_ca_employee_categories.sql)
ALTER TABLE ca_employees
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ca_emp_category ON ca_employees (category);

-- ── School STACODE (for category auto-derivation: 001–499 → Elementary,
--    500–701 → Secondary) — from 20260808_add_ca_employee_stacode.sql ────────
ALTER TABLE ca_employees
  ADD COLUMN IF NOT EXISTS stacode text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ca_emp_stacode ON ca_employees (stacode);

-- ── EO (Executive Order) No. for the print certification — safe re-run ───────
ALTER TABLE ca_payroll_headers
  ADD COLUMN IF NOT EXISTS eo_no text DEFAULT '';

ALTER TABLE ca_employees DROP CONSTRAINT IF EXISTS ca_employees_category_check;
ALTER TABLE ca_employees ADD CONSTRAINT ca_employees_category_check
  CHECK (category IN (
    '', 'Division Office', 'Elementary', 'Secondary',
    'LBA & LSA Teachers', 'Utility Workers', 'Without ATM',
    'Separated Employees', 'Non-Plantilla'
  ));

-- ── Row Level Security (authenticated-only: anon has NO access) ────────────
ALTER TABLE ca_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_signatories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_employees_select" ON ca_employees;
CREATE POLICY "ca_employees_select" ON ca_employees FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ca_employees_insert" ON ca_employees;
CREATE POLICY "ca_employees_insert" ON ca_employees FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_employees_update" ON ca_employees;
CREATE POLICY "ca_employees_update" ON ca_employees FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_employees_delete" ON ca_employees;
CREATE POLICY "ca_employees_delete" ON ca_employees FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_headers_select" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_select" ON ca_payroll_headers FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_headers_insert" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_insert" ON ca_payroll_headers FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_headers_update" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_update" ON ca_payroll_headers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_headers_delete" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_delete" ON ca_payroll_headers FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_details_select" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_select" ON ca_payroll_details FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_details_insert" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_insert" ON ca_payroll_details FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_details_update" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_update" ON ca_payroll_details FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_details_delete" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_delete" ON ca_payroll_details FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_signatories_select" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_select" ON ca_payroll_signatories FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_insert" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_insert" ON ca_payroll_signatories FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_update" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_update" ON ca_payroll_signatories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_delete" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_delete" ON ca_payroll_signatories FOR DELETE
  TO authenticated USING (true);

-- Revoke ALL from anon; grant CRUD to authenticated only.
REVOKE ALL ON ca_employees FROM anon;
REVOKE ALL ON ca_payroll_headers FROM anon;
REVOKE ALL ON ca_payroll_details FROM anon;
REVOKE ALL ON ca_payroll_signatories FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ca_employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_headers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_signatories TO authenticated;

-- ── Reload PostgREST schema cache so the app sees the new tables immediately ─
NOTIFY pgrst, 'reload schema';
