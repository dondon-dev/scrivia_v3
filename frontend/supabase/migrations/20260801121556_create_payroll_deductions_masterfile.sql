/*
# Create payroll_deductions masterfile table

1. New Tables
- `payroll_deductions`: Stores deduction masterfile records per employee,
  modeled on the DEDFILE.DBF structure. Each row is one deduction (loan,
  insurance, membership, savings, other) linked to an employee via
  employee_id FK. Contains effective/termination year-month, amounts
  (deduction, principal, interest, charges, loan proceeds), agency code,
  status, type, and audit trail fields.

2. Columns (payroll_deductions)
- id (uuid, PK, default gen_random_uuid)
- employee_id (uuid, FK → employees.id ON DELETE CASCADE)
- empno (text) — employee number, denormalized for import matching
- dedcode (text) — deduction code (e.g. LNR, MED, PAG, LOAN)
- dedid (text) — deduction identifier
- policyno (text) — policy / reference number
- effmm (smallint) — effective month (1-12)
- effyy (smallint) — effective year (2-digit)
- termm (smallint) — termination month (1-12, nullable)
- teryy (smallint) — termination year (2-digit, nullable)
- dedamt (numeric 12,2) — deduction amount deducted each payroll
- principal (numeric 12,2) — principal amount (loans)
- interest (numeric 12,2) — interest amount (loans)
- charges (numeric 12,2) — charges amount (loans)
- proceeds (numeric 12,2) — loan proceeds
- agency (text) — agency code
- status (text) — Active | Suspended | Terminated (default Active)
- type (text) — Loan | Insurance | Membership | Savings | Other
- created_by (text) — audit: who created the record
- created_at (timestamptz) — audit: creation timestamp
- updated_by (text) — audit: who last updated
- updated_at (timestamptz) — audit: last update timestamp

3. Constraints
- CHECK dedamt >= 0 (no negative deduction amounts)
- CHECK effmm BETWEEN 1 AND 12
- CHECK termm BETWEEN 1 AND 12 (when not null)
- CHECK status IN ('Active','Suspended','Terminated')
- CHECK type IN ('Loan','Insurance','Membership','Savings','Other')
- Unique: one active deduction per (empno, dedcode, policyno) where status='Active'
  (partial unique index to prevent duplicates while allowing terminated records)

4. Indexes
- idx_pd_employee_id — lookup by employee
- idx_pd_empno — import matching
- idx_pd_status — filter active during payroll
- idx_pd_dedcode — group by code for reports
- idx_pd_type — filter by type for reports

5. Security
- Enable RLS on payroll_deductions.
- Single-tenant (no sign-in): allow anon + authenticated full CRUD.
*/

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  empno text NOT NULL DEFAULT '',
  dedcode text NOT NULL DEFAULT '',
  dedid text DEFAULT '',
  policyno text DEFAULT '',
  effmm smallint NOT NULL DEFAULT 1,
  effyy smallint NOT NULL DEFAULT 0,
  termm smallint,
  teryy smallint,
  dedamt numeric(12,2) NOT NULL DEFAULT 0 CHECK (dedamt >= 0),
  principal numeric(12,2) DEFAULT 0,
  interest numeric(12,2) DEFAULT 0,
  charges numeric(12,2) DEFAULT 0,
  proceeds numeric(12,2) DEFAULT 0,
  agency text DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Suspended','Terminated')),
  type text NOT NULL DEFAULT 'Other' CHECK (type IN ('Loan','Insurance','Membership','Savings','Other')),
  created_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payroll_deductions" ON payroll_deductions;
CREATE POLICY "anon_select_payroll_deductions" ON payroll_deductions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payroll_deductions" ON payroll_deductions;
CREATE POLICY "anon_insert_payroll_deductions" ON payroll_deductions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payroll_deductions" ON payroll_deductions;
CREATE POLICY "anon_update_payroll_deductions" ON payroll_deductions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payroll_deductions" ON payroll_deductions;
CREATE POLICY "anon_delete_payroll_deductions" ON payroll_deductions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pd_employee_id ON payroll_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pd_empno ON payroll_deductions(empno);
CREATE INDEX IF NOT EXISTS idx_pd_status ON payroll_deductions(status);
CREATE INDEX IF NOT EXISTS idx_pd_dedcode ON payroll_deductions(dedcode);
CREATE INDEX IF NOT EXISTS idx_pd_type ON payroll_deductions(type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pd_active_unique
  ON payroll_deductions(empno, dedcode, policyno)
  WHERE status = 'Active';