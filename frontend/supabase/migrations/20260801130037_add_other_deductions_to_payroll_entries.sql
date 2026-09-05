/*
# Add other_deductions column to payroll_entries

1. Modified Tables
- `payroll_entries`: Adds `other_deductions` (numeric 14,2, default 0) to store
  the total of additional deductions pulled from the Deduction Masterfile
  (payroll_deductions) during a payroll run. This is the sum of all active
  masterfile deductions for the employee (loans, insurance, savings, etc.)
  that are NOT part of the standard GSIS/Medicare/PagIBIG/Tax deductions.

2. Notes
- Non-destructive: only adds a column, no data loss.
- existing computed entries will show 0 for other_deductions until re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='other_deductions') THEN
    ALTER TABLE payroll_entries ADD COLUMN other_deductions numeric(14,2) DEFAULT 0;
  END IF;
END $$;