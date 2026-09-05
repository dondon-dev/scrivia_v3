/*
# Add category column to dbf_restore_history

## Purpose
The Restore Data module is scoped by payroll category (Elementary vs High School).
Each DBF restore operation must record which category it belongs to, so restores
performed under "Elementary Payroll" are separated from those under "High School Payroll".

## Changes
- Adds `category` column (text, nullable for backward compatibility with existing rows)
  to `dbf_restore_history`. Values: 'elementary' or 'highschool'.
- Adds an index on (category, restored_at DESC) for efficient per-category listing.

## Security
- No policy changes. Existing owner-scoped RLS policies remain in effect.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dbf_restore_history' AND column_name = 'category'
  ) THEN
    ALTER TABLE dbf_restore_history ADD COLUMN category text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dbf_restore_history_category
  ON dbf_restore_history(category, restored_at DESC);
