/*
# Create PAYROLLS.DBF management table

## Purpose
Stores payroll records compatible with the Visual FoxPro PAYROLLS.DBF format.
This table mirrors the exact 36-field structure of the DepEd FoxPro PAYROLLS.DBF file,
enabling import, edit, and re-export with byte-structure compatibility.

## New Table: payrolls_dbf
- `id` (uuid, primary key)
- `paycode` (numeric, N(1,0)) — payroll code flag
- `regcode` (text, C(3)) — region code
- `divcode` (text, C(3)) — division code
- `stacode` (text, C(3)) — station code
- `empno` (text, C(7)) — employee number
- `fname` (text, C(15)) — first name
- `mi` (text, C(2)) — middle initial
- `lname` (text, C(15)) — last name
- `appel` (text, C(3)) — appellation
- `basic` (numeric, N(8,2)) — basic salary
- `trans` (numeric, N(8,2)) — transportation allowance
- `dedlnr` (numeric, N(8,2)) — loan deduction
- `dedmed` (numeric, N(6,2)) — medicare deduction
- `dedpag` (numeric, N(6,2)) — pag-ibig deduction
- `dedtax` (numeric, N(8,2)) — tax deduction
- `otherded` (numeric, N(8,2)) — other deductions
- `office` (text, C(6)) — office code
- `ending` (text, C(8)) — ending period
- `issue` (text, C(8)) — issue date
- `chkno` (bigint, N(10,0)) — check number
- `ontop` (numeric, N(7,2)) — on-top allowance
- `long` (numeric, N(7,2)) — longevity pay
- `rata` (numeric, N(7,2)) — RATA allowance
- `pera` (numeric, N(7,2)) — PERA allowance
- `aca` (numeric, N(8,2)) — ACA allowance
- `takehome` (numeric, N(8,2)) — computed take-home pay
- `poscode` (text, C(4)) — position code
- `grade` (text, C(2)) — salary grade
- `step` (text, C(1)) — salary step
- `govtlnr` (numeric, N(8,2)) — government loan share
- `govtecc` (numeric, N(8,2)) — government ECC share
- `govtpag` (numeric, N(8,2)) — government pag-ibig share
- `govtmed` (numeric, N(8,2)) — government medicare share
- `taxcode` (text, C(2)) — tax code
- `paymode` (text, C(1)) — pay mode
- `bank` (text, C(3)) — bank code
- `created_at` (timestamptz) — record creation timestamp
- `updated_at` (timestamptz) — last update timestamp

## Security
- RLS enabled, scoped to authenticated users (app has sign-in).
- 4 CRUD policies: select/insert/update/delete for authenticated.
*/

CREATE TABLE IF NOT EXISTS payrolls_dbf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paycode numeric(1,0) NOT NULL DEFAULT 0,
  regcode text NOT NULL DEFAULT '',
  divcode text NOT NULL DEFAULT '',
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  fname text NOT NULL DEFAULT '',
  mi text NOT NULL DEFAULT '',
  lname text NOT NULL DEFAULT '',
  appel text NOT NULL DEFAULT '',
  basic numeric(8,2) NOT NULL DEFAULT 0,
  trans numeric(8,2) NOT NULL DEFAULT 0,
  dedlnr numeric(8,2) NOT NULL DEFAULT 0,
  dedmed numeric(6,2) NOT NULL DEFAULT 0,
  dedpag numeric(6,2) NOT NULL DEFAULT 0,
  dedtax numeric(8,2) NOT NULL DEFAULT 0,
  otherded numeric(8,2) NOT NULL DEFAULT 0,
  office text NOT NULL DEFAULT '',
  ending text NOT NULL DEFAULT '',
  issue text NOT NULL DEFAULT '',
  chkno bigint NOT NULL DEFAULT 0,
  ontop numeric(7,2) NOT NULL DEFAULT 0,
  long numeric(7,2) NOT NULL DEFAULT 0,
  rata numeric(7,2) NOT NULL DEFAULT 0,
  pera numeric(7,2) NOT NULL DEFAULT 0,
  aca numeric(8,2) NOT NULL DEFAULT 0,
  takehome numeric(8,2) NOT NULL DEFAULT 0,
  poscode text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  step text NOT NULL DEFAULT '',
  govtlnr numeric(8,2) NOT NULL DEFAULT 0,
  govtecc numeric(8,2) NOT NULL DEFAULT 0,
  govtpag numeric(8,2) NOT NULL DEFAULT 0,
  govtmed numeric(8,2) NOT NULL DEFAULT 0,
  taxcode text NOT NULL DEFAULT '',
  paymode text NOT NULL DEFAULT '',
  bank text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payrolls_dbf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payrolls_dbf" ON payrolls_dbf;
CREATE POLICY "select_payrolls_dbf" ON payrolls_dbf FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_payrolls_dbf" ON payrolls_dbf;
CREATE POLICY "insert_payrolls_dbf" ON payrolls_dbf FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_payrolls_dbf" ON payrolls_dbf;
CREATE POLICY "update_payrolls_dbf" ON payrolls_dbf FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_payrolls_dbf" ON payrolls_dbf;
CREATE POLICY "delete_payrolls_dbf" ON payrolls_dbf FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_payrolls_dbf_empno ON payrolls_dbf (empno);
CREATE INDEX IF NOT EXISTS idx_payrolls_dbf_stacode ON payrolls_dbf (stacode);
CREATE INDEX IF NOT EXISTS idx_payrolls_dbf_bank ON payrolls_dbf (bank);
CREATE INDEX IF NOT EXISTS idx_payrolls_dbf_lname ON payrolls_dbf (lname);
