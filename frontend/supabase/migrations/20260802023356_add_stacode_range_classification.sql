/*
# STACODE-Based Payroll Group Classification

## Purpose
Replace the old ELEM/HS default groups with STACODE-range-driven classification.
Employees are automatically assigned to payroll groups based on their STACODE:
  001-499  → Elementary
  500-699  → Junior High School
  700-701  → Senior High School

## Changes

### 1. Add STACODE range columns to payroll_groups
- `stacode_min` (int, nullable) — lower bound (inclusive)
- `stacode_max` (int, nullable) — upper bound (inclusive)

Groups with NULL ranges (e.g. District Office 800-899) can be added later
without code changes — the classification function reads from the DB.

### 2. Replace default groups
Drop old ELEM/HS groups (they had no range data and the names don't match
the new spec). Insert three new defaults with ranges:
- ELEM: Elementary, 001-499
- JHS: Junior High School, 500-699
- SHS: Senior High School, 700-701

### 3. Backfill employees
Reclassify every employee based on STACODE numeric value:
  1-499 → ELEM, 500-699 → JHS, 700-701 → SHS
  Empty/invalid STACODE → payroll_group_id = NULL (Unassigned)

### 4. Index for range queries
*/

-- Add range columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_groups' AND column_name = 'stacode_min') THEN
    ALTER TABLE payroll_groups ADD COLUMN stacode_min integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_groups' AND column_name = 'stacode_max') THEN
    ALTER TABLE payroll_groups ADD COLUMN stacode_max integer;
  END IF;
END $$;

-- Remove old default groups and their employee references
UPDATE employees SET payroll_group_id = NULL WHERE payroll_group_id IN (
  SELECT id FROM payroll_groups WHERE group_code IN ('ELEM', 'HS')
);
DELETE FROM payroll_groups WHERE group_code IN ('ELEM', 'HS');

-- Insert new default groups with STACODE ranges
INSERT INTO payroll_groups (group_code, group_name, description, status, stacode_min, stacode_max, created_by)
VALUES
  ('ELEM', 'Elementary', 'Elementary Schools Payroll (STACODE 001-499)', 'Active', 1, 499, 'system'),
  ('JHS', 'Junior High School', 'Junior High School Payroll (STACODE 500-699)', 'Active', 500, 699, 'system'),
  ('SHS', 'Senior High School', 'Senior High School Payroll (STACODE 700-701)', 'Active', 700, 701, 'system')
ON CONFLICT (group_code) DO UPDATE SET
  stacode_min = EXCLUDED.stacode_min,
  stacode_max = EXCLUDED.stacode_max,
  group_name = EXCLUDED.group_name,
  description = EXCLUDED.description;

-- Backfill: classify all employees by STACODE
UPDATE employees e
SET payroll_group_id = (
  SELECT pg.id FROM payroll_groups pg
  WHERE pg.stacode_min IS NOT NULL
    AND pg.stacode_max IS NOT NULL
    AND e.stacode ~ '^[0-9]+$'
    AND CAST(e.stacode AS INTEGER) >= pg.stacode_min
    AND CAST(e.stacode AS INTEGER) <= pg.stacode_max
    AND pg.status = 'Active'
  LIMIT 1
)
WHERE e.stacode ~ '^[0-9]+$';

-- Set payroll_group_id to NULL for invalid/empty STACODE
UPDATE employees SET payroll_group_id = NULL
WHERE stacode IS NULL OR stacode = '' OR stacode !~ '^[0-9]+$';

-- Index for range lookups
CREATE INDEX IF NOT EXISTS idx_payroll_groups_stacode_range
  ON payroll_groups(stacode_min, stacode_max)
  WHERE stacode_min IS NOT NULL AND stacode_max IS NOT NULL;
