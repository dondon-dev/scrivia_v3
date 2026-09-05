/*
# Add Period Covered columns to Initial Payroll Entries

1. Modified Tables
- `initial_payroll_entries`
  - `period_from` (date, nullable) — manual start of the period covered for this row.
  - `period_to`   (date, nullable) — manual end of the period covered for this row.
When both columns are set, they become the basis for computing the CSC
(working-days) and Calendar Days values for that entry, replacing the
previously auto-derived period end date.

2. Notes
- Both columns are nullable so existing rows are unaffected.
- No RLS changes; existing policies on initial_payroll_entries still apply.
*/

ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date;
