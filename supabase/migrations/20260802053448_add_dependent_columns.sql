/*
# Add dependent columns to employees table

## Overview
Adds 8 new columns to the `employees` table to store up to 4 dependents
(names and birth dates), matching the legacy DepEd MASTFILE.DBF field
structure (DEPNAME1-4, DEPDATE1-4).

## New Columns
- depname1 text  — dependent 1 name (DBF: C(20))
- depname2 text  — dependent 2 name (DBF: C(20))
- depname3 text  — dependent 3 name (DBF: C(20))
- depname4 text  — dependent 4 name (DBF: C(20))
- depdate1 date  — dependent 1 birth date (DBF: D)
- depdate2 date  — dependent 2 birth date (DBF: D)
- depdate3 date  — dependent 3 birth date (DBF: D)
- depdate4 date  — dependent 4 birth date (DBF: D)

## Security
No security changes — existing RLS policies already cover the employees table.
All new columns inherit the table's existing policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depname1') THEN
    ALTER TABLE employees ADD COLUMN depname1 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depname2') THEN
    ALTER TABLE employees ADD COLUMN depname2 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depname3') THEN
    ALTER TABLE employees ADD COLUMN depname3 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depname4') THEN
    ALTER TABLE employees ADD COLUMN depname4 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depdate1') THEN
    ALTER TABLE employees ADD COLUMN depdate1 date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depdate2') THEN
    ALTER TABLE employees ADD COLUMN depdate2 date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depdate3') THEN
    ALTER TABLE employees ADD COLUMN depdate3 date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='depdate4') THEN
    ALTER TABLE employees ADD COLUMN depdate4 date;
  END IF;
END $$;
