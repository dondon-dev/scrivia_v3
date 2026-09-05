/*
# NTHP Compliance Schema (DepEd Order No. 05, s. 2018)

## Purpose
Ensure every employee maintains a minimum Net Take-Home Pay (NTHP) of ₱5,000.00.
Loan deductions that would push net pay below ₱5,000 are not applied and are
instead recorded as "Undeducted Obligations" with the reason "NTHP BELOW ₱5,000.00".

## Changes

### 1. New Table: `undeducted_obligations`
Stores individual loan deductions that were skipped during payroll computation
because applying them would have reduced the employee's net pay below ₱5,000.

Columns:
- `id` (uuid, PK)
- `payroll_entry_id` (uuid, FK → payroll_entries.id ON DELETE CASCADE) — which payroll entry this belongs to
- `employee_id` (uuid, FK → employees.id ON DELETE CASCADE) — which employee
- `pay_period_id` (uuid, FK → pay_periods.id ON DELETE CASCADE) — which pay period
- `deduction_code` (text) — the DEDCODE from DEDFILE
- `deduction_description` (text) — human-readable name from DEDTABLE
- `undeducted_amount` (numeric, default 0) — the amount that was NOT deducted
- `reason` (text, default 'NTHP BELOW ₱5,000.00') — why it was skipped
- `created_at` (timestamptz, default now())

### 2. New Columns on `payroll_entries`
- `nthp_status` (text, default 'PASS') — 'PASS' or 'FAIL' NTHP compliance
- `undeducted_amount` (numeric, default 0) — total amount of undeducted obligations for this entry
- `actual_loan_deductions` (numeric, default 0) — total loan deductions actually applied after NTHP check

### 3. Security
- RLS enabled on `undeducted_obligations` with anon+authenticated full CRUD (single-tenant, no auth)
*/

-- ── Undeducted obligations table ──
CREATE TABLE IF NOT EXISTS undeducted_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_entry_id uuid REFERENCES payroll_entries(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_id uuid REFERENCES pay_periods(id) ON DELETE CASCADE,
  deduction_code text NOT NULL DEFAULT '',
  deduction_description text NOT NULL DEFAULT '',
  undeducted_amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'NTHP BELOW ₱5,000.00',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE undeducted_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_undeducted_obligations" ON undeducted_obligations;
CREATE POLICY "anon_select_undeducted_obligations" ON undeducted_obligations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_undeducted_obligations" ON undeducted_obligations;
CREATE POLICY "anon_insert_undeducted_obligations" ON undeducted_obligations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_undeducted_obligations" ON undeducted_obligations;
CREATE POLICY "anon_update_undeducted_obligations" ON undeducted_obligations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_undeducted_obligations" ON undeducted_obligations;
CREATE POLICY "anon_delete_undeducted_obligations" ON undeducted_obligations FOR DELETE
  TO anon, authenticated USING (true);

-- ── New columns on payroll_entries ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_entries' AND column_name = 'nthp_status') THEN
    ALTER TABLE payroll_entries ADD COLUMN nthp_status text NOT NULL DEFAULT 'PASS';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_entries' AND column_name = 'undeducted_amount') THEN
    ALTER TABLE payroll_entries ADD COLUMN undeducted_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_entries' AND column_name = 'actual_loan_deductions') THEN
    ALTER TABLE payroll_entries ADD COLUMN actual_loan_deductions numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_undeducted_obligations_entry ON undeducted_obligations(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_undeducted_obligations_period ON undeducted_obligations(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_undeducted_obligations_employee ON undeducted_obligations(employee_id);
