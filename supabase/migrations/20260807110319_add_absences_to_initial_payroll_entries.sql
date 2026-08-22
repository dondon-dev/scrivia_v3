/*
# Add absences column to initial_payroll_entries

## Purpose
Moves absence tracking from a separate `initial_payroll_absences` table (one row per absence date)
to a single editable `absences` numeric column on each payroll entry row. This simplifies the
UI: the Number of Absences is now editable directly in the payroll table and detail editor,
and feeds into the CSC Days Present formula (CSC = 11 − absences).

## Changes
1. New column on `initial_payroll_entries`:
   - `absences` (numeric, default 0) — number of absent days for this entry.

## Notes
- The old `initial_payroll_absences` table is left in place (no data loss). It is simply no
  longer referenced by the frontend.
- RLS already exists on `initial_payroll_entries`; no policy changes needed — the new column
  inherits the existing row-level access control.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'initial_payroll_entries' AND column_name = 'absences'
  ) THEN
    ALTER TABLE initial_payroll_entries
      ADD COLUMN absences numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
