/*
# Communication Allowance Payroll — Department of Education, Division of Calamba City

## Purpose
"Other Payroll" module for Communication Allowance (CA) payrolls. Mirrors the
classic tblEmployee / tblPayrollHeader / tblPayrollDetail / tblPayrollSignatory
design as the ca_* tables below so the register, workflow, and print templates
match official DepEd communication allowance payroll forms.

## Tables
- ca_employees            — CA beneficiary masterfile (AccountNo, names, position, school, status)
- ca_payroll_headers      — one row per payroll run (header fields, workflow status, computed totals)
- ca_payroll_details      — per-employee payroll lines (LineNo, Amount, Deduction, NetAmountDue)
- ca_payroll_signatories  — certification / signatory block (A–D) per payroll

## Workflow
Draft → Generated → Reviewed → Approved → Posted → Paid → Archived
(enforced by a CHECK constraint on ca_payroll_headers.status)

## Security
Single-tenant app: anon + authenticated full CRUD, matching every other table
in this system (data is intentionally shared; no per-user isolation).

## Money handling
Amounts stored as numeric(14,2) for precise monetary calculation.
NetAmountDue is derived (Amount − Deduction) but stored for the historical record,
consistent with payroll_entries.net_pay.
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

-- ── Row Level Security (single-tenant: anon + authenticated full CRUD) ─────
ALTER TABLE ca_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_payroll_signatories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_employees_select" ON ca_employees;
CREATE POLICY "ca_employees_select" ON ca_employees FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ca_employees_insert" ON ca_employees;
CREATE POLICY "ca_employees_insert" ON ca_employees FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_employees_update" ON ca_employees;
CREATE POLICY "ca_employees_update" ON ca_employees FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_employees_delete" ON ca_employees;
CREATE POLICY "ca_employees_delete" ON ca_employees FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_headers_select" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_select" ON ca_payroll_headers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_headers_insert" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_insert" ON ca_payroll_headers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_headers_update" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_update" ON ca_payroll_headers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_headers_delete" ON ca_payroll_headers;
CREATE POLICY "ca_payroll_headers_delete" ON ca_payroll_headers FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_details_select" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_select" ON ca_payroll_details FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_details_insert" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_insert" ON ca_payroll_details FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_details_update" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_update" ON ca_payroll_details FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_details_delete" ON ca_payroll_details;
CREATE POLICY "ca_payroll_details_delete" ON ca_payroll_details FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ca_payroll_signatories_select" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_select" ON ca_payroll_signatories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_insert" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_insert" ON ca_payroll_signatories FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_update" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_update" ON ca_payroll_signatories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_payroll_signatories_delete" ON ca_payroll_signatories;
CREATE POLICY "ca_payroll_signatories_delete" ON ca_payroll_signatories FOR DELETE
  TO anon, authenticated USING (true);
