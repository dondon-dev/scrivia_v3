/*
# Create deduction_codes table — DepEd Payroll Deduction Engine

1. New Tables
- `deduction_codes`: Master list of all valid deduction codes compatible with
  the FoxPro DEDTABLE.DBF file. Each row is one deduction code with its type,
  agency, full name, and active flag. The system allows any DEDCODE from
  DEDTABLE.DBF without modifying source code — new codes can be added via the
  UI or imported from a DBF file.

2. Columns (deduction_codes)
- dedcode (text, PK) — the deduction code (e.g. 0001, 0002, GSIS, 0222)
- type (text) — category: Loan | Insurance | Membership | Savings | Mandatory | Overpayment | Absence | Bank | Cooperative | Association | Other
- agency (text) — agency/group: GSIS | BIR | PHILHEALTH | PAGIBIG | DEPED | BANK | COOPERATIVE | INSURANCE | OTHER
- dedname (text) — full human-readable name (e.g. "GSIS POLICY LOAN")
- active (boolean) — whether this code is active/usable in payroll
- created_at (timestamptz) — when the record was created

3. Security
- Enable RLS on deduction_codes.
- Single-tenant (no sign-in): allow anon + authenticated full CRUD.

4. Seed Data
- All mandatory DepEd deduction codes are inserted: GSIS loans/insurance,
  BIR withholding tax, PhilHealth, PagIBIG, DepEd overpayments, absences,
  banks/cooperatives/insurance, and more.

5. Notes
- This table is the single source of truth for valid deduction codes.
  payroll_deductions.dedcode should reference these codes.
- Any DEDCODE from DEDTABLE.DBF can be added without code changes.
*/

CREATE TABLE IF NOT EXISTS deduction_codes (
  dedcode text PRIMARY KEY,
  type text NOT NULL DEFAULT 'Other',
  agency text NOT NULL DEFAULT 'OTHER',
  dedname text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deduction_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deduction_codes" ON deduction_codes;
CREATE POLICY "anon_select_deduction_codes" ON deduction_codes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_deduction_codes" ON deduction_codes;
CREATE POLICY "anon_insert_deduction_codes" ON deduction_codes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_deduction_codes" ON deduction_codes;
CREATE POLICY "anon_update_deduction_codes" ON deduction_codes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_deduction_codes" ON deduction_codes;
CREATE POLICY "anon_delete_deduction_codes" ON deduction_codes FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_dc_agency ON deduction_codes(agency);
CREATE INDEX IF NOT EXISTS idx_dc_type ON deduction_codes(type);
CREATE INDEX IF NOT EXISTS idx_dc_active ON deduction_codes(active);

-- Seed all mandatory DepEd deduction codes
INSERT INTO deduction_codes (dedcode, type, agency, dedname, active) VALUES
-- GSIS
('GSIS', 'Mandatory', 'GSIS', 'GSIS PREMIUM', true),
('0001', 'Loan', 'GSIS', 'GSIS POLICY LOAN', true),
('0002', 'Loan', 'GSIS', 'GSIS SALARY LOAN', true),
('0002E', 'Loan', 'GSIS', 'GSIS ENHANCED SALARY LOAN', true),
('0002R', 'Loan', 'GSIS', 'GSIS RESTRUCTURED SALARY LOAN', true),
('0003', 'Mandatory', 'GSIS', 'GSIS PERSONAL SHARE', true),
('0013', 'Insurance', 'GSIS', 'GSIS OPTIONAL INSURANCE PREMIUM', true),
('0014', 'Insurance', 'GSIS', 'GSIS GENESIS MEMORIAL', true),
('0015', 'Insurance', 'GSIS', 'GSIS EDU-CHILD', true),
('0016', 'Insurance', 'GSIS', 'GSIS FHPP-CIGNA', true),
('0018', 'Insurance', 'GSIS', 'GSIS PS PREMIUM ARREARS', true),
('0019', 'Insurance', 'GSIS', 'GSIS GENESIS FLEXI', true),
('0021', 'Loan', 'GSIS', 'GSIS SUMMER ONE MONTH SALARY LOAN', true),
('0022', 'Insurance', 'GSIS', 'GSIS GENESIS PLUS', true),
('0025', 'Loan', 'GSIS', 'GSIS STOCK PURCHASE LOAN', true),
('0026', 'Loan', 'GSIS', 'GSIS CASH ADVANCE LOAN', true),
('0027', 'Loan', 'GSIS', 'GSIS HELP', true),
('0031', 'Loan', 'GSIS', 'GSIS REAL ESTATE LOAN', true),
('0039', 'Loan', 'GSIS', 'GSIS RETIREMENT LOAN', true),
('0048', 'Loan', 'GSIS', 'GSIS OPTIONAL POLICY LOAN', true),
('0090', 'Loan', 'GSIS', 'GSIS UNLIMITED OPTIONAL POLICY LOAN', true),
('0099', 'Loan', 'GSIS', 'GSIS EMERGENCY LOAN ASSISTANCE', true),
('0108', 'Loan', 'GSIS', 'GSIS UNLIMITED OPTIONAL POLICY LOAN', true),
('0114', 'Loan', 'GSIS', 'GSIS LOW COST HOUSING LOAN', true),
('0123', 'Loan', 'GSIS', 'GSIS FLY-PAL LOAN', true),
('0129', 'Loan', 'GSIS', 'GSIS EDUCATIONAL ASSISTANCE LOAN', true),
('0131', 'Loan', 'GSIS', 'GSIS PABAHAY HOUSING LOAN', true),
('0132', 'Loan', 'GSIS', 'GSIS CONSOLIDATED LOAN', true),
('0133', 'Loan', 'GSIS', 'GSIS MPL LITE', true),
('0383', 'Loan', 'GSIS', 'GSIS DECS HOUSING LOAN', true),
('0704', 'Loan', 'GSIS', 'GSIS EMERGENCY LOAN', true),
-- BIR
('0017', 'Other', 'BIR', 'BIR FINES AND FORFEITURES', true),
('0034', 'Mandatory', 'BIR', 'TAX PAYABLE 2025', true),
('0036', 'Mandatory', 'BIR', 'WITHHOLDING TAX', true),
-- PHILHEALTH
('0009', 'Mandatory', 'PHILHEALTH', 'MEDICARE ARREARS', true),
('0111', 'Mandatory', 'PHILHEALTH', 'PHILHEALTH', true),
-- PAGIBIG
('0222', 'Mandatory', 'PAGIBIG', 'PAGIBIG FUND', true),
('0222A', 'Mandatory', 'PAGIBIG', 'PAGIBIG ADDITIONAL', true),
('0332', 'Loan', 'PAGIBIG', 'PAGIBIG HOUSING LOAN', true),
('0333', 'Loan', 'PAGIBIG', 'PAGIBIG KASIPAGAN LOAN', true),
('0334', 'Loan', 'PAGIBIG', 'PAGIBIG EMERGENCY LOAN', true),
('0335', 'Loan', 'PAGIBIG', 'PAGIBIG PROVIDENT LOAN', true),
('0336', 'Loan', 'PAGIBIG', 'PAGIBIG MULTI PURPOSE LOAN', true),
('0382', 'Loan', 'PAGIBIG', 'PAGIBIG DECS HOUSING LOAN', true),
-- DEPED OVERPAYMENTS
('0006', 'Overpayment', 'DEPED', 'OVERPAYMENT AMELIORATION', true),
('0033', 'Overpayment', 'DEPED', 'OVERPAYMENT SALARY DIFFERENTIAL NBC468', true),
('0037', 'Overpayment', 'DEPED', 'OVERPAYMENT CURRENT SALARY', true),
('0061', 'Overpayment', 'DEPED', 'OVERPAYMENT CASH GIFT', true),
('0101', 'Overpayment', 'DEPED', 'OVERPAYMENT LIVING ALLOWANCE', true),
('0135', 'Overpayment', 'DEPED', 'OVERPAYMENT LONGEVITY PAY', true),
('0136', 'Overpayment', 'DEPED', 'OVERPAYMENT PERA', true),
('0137', 'Overpayment', 'DEPED', 'OVERPAYMENT PIB', true),
('0205', 'Overpayment', 'DEPED', 'OVERPAYMENT INCENTIVE PAY', true),
('0206', 'Overpayment', 'DEPED', 'OVERPAYMENT BONUS', true),
('0210', 'Overpayment', 'DEPED', 'OVERPAYMENT TEACHING AID', true),
('0216', 'Overpayment', 'DEPED', 'OVERPAYMENT PROPORTIONAL VACATION PAY', true),
('0227', 'Overpayment', 'DEPED', 'OVERPAYMENT RATA', true),
('0228', 'Overpayment', 'DEPED', 'OVERPAYMENT RA6758', true),
('0229', 'Overpayment', 'DEPED', 'OVERPAYMENT OVER AND ABOVE RA6758', true),
('0303', 'Overpayment', 'DEPED', 'OVERPAYMENT CLOTHING ALLOWANCE', true),
('0338', 'Overpayment', 'DEPED', 'OVERPAYMENT ACA', true),
-- ABSENCES
('0020', 'Absence', 'DEPED', 'PRIOR YEARS ABSENCES', true),
('0068', 'Absence', 'DEPED', 'CURRENT ABSENCES', true),
-- BANKS / COOPERATIVES / INSURANCE
('0004', 'Bank', 'BANK', 'PNB', true),
('0008', 'Bank', 'BANK', 'DBP', true),
('0049', 'Savings', 'COOPERATIVE', 'ECSLA', true),
('0085', 'Savings', 'COOPERATIVE', 'MTSLA', true),
('0119', 'Insurance', 'INSURANCE', 'PPSTA', true),
('0324', 'Bank', 'BANK', 'LANDBANK', true),
('0326', 'Bank', 'BANK', 'PHILIPPINE VETERANS BANK', true),
('0339', 'Bank', 'BANK', 'CITY SAVINGS BANK', true),
('0342', 'Bank', 'BANK', 'TEACHERS DEVELOPMENT BANK', true)
ON CONFLICT (dedcode) DO UPDATE SET
  type = EXCLUDED.type,
  agency = EXCLUDED.agency,
  dedname = EXCLUDED.dedname,
  active = EXCLUDED.active;