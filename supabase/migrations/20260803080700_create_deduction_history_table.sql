/*
# Create Deduction History Table

1. New Tables
- `deduction_history`
  - `id` (uuid, primary key)
  - `deduction_id` (uuid, foreign key to payroll_deductions.id, ON DELETE CASCADE)
  - `stacode` (text) — denormalized for reporting
  - `empno` (text) — denormalized for reporting
  - `dedcode` (text) — denormalized for reporting
  - `policyno` (text) — denormalized for reporting
  - `action` (text) — 'ADD', 'UPDATE', or 'TERMINATE'
  - `prev_dedamt` (numeric, nullable) — previous deduction amount
  - `new_dedamt` (numeric, nullable) — new deduction amount
  - `prev_status` (text, nullable) — previous status
  - `new_status` (text, nullable) — new status
  - `prev_principal` (numeric, nullable) — previous principal
  - `new_principal` (numeric, nullable) — new principal
  - `prev_interest` (numeric, nullable) — previous interest
  - `new_interest` (numeric, nullable) — new interest
  - `prev_charges` (numeric, nullable) — previous charges
  - `new_charges` (numeric, nullable) — new charges
  - `changed_by` (text) — email of the user who made the change
  - `payroll_period` (text, nullable) — payroll period name if applicable
  - `source` (text) — 'GSIS', 'PLI', or 'MANUAL'
  - `changed_at` (timestamptz, default now())

2. Security
- Enable RLS on `deduction_history`.
- Authenticated users can read and insert history records (history is append-only, no update/delete).
- Indexes on deduction_id and changed_at for query performance.

3. Notes
- No historical record shall be deleted — UPDATE and DELETE policies are denied.
- The deduction_id FK uses ON DELETE CASCADE so if a deduction is deleted, its history
  goes too, but the application never deletes deductions (only terminates them).
*/

CREATE TABLE IF NOT EXISTS deduction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deduction_id uuid REFERENCES payroll_deductions(id) ON DELETE CASCADE,
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  dedcode text NOT NULL DEFAULT '',
  policyno text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (action IN ('ADD', 'UPDATE', 'TERMINATE')),
  prev_dedamt numeric(12,2),
  new_dedamt numeric(12,2),
  prev_status text,
  new_status text,
  prev_principal numeric(12,2),
  new_principal numeric(12,2),
  prev_interest numeric(12,2),
  new_interest numeric(12,2),
  prev_charges numeric(12,2),
  new_charges numeric(12,2),
  changed_by text NOT NULL DEFAULT '',
  payroll_period text,
  source text NOT NULL DEFAULT 'MANUAL',
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deduction_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_deduction_history_deduction_id ON deduction_history(deduction_id);
CREATE INDEX IF NOT EXISTS idx_deduction_history_changed_at ON deduction_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deduction_history_empno ON deduction_history(empno);

DROP POLICY IF EXISTS "select_deduction_history" ON deduction_history;
CREATE POLICY "select_deduction_history"
ON deduction_history FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_deduction_history" ON deduction_history;
CREATE POLICY "insert_deduction_history"
ON deduction_history FOR INSERT
TO authenticated WITH CHECK (true);
