-- Fix: dbf_excluded and dbf_included are missing the regcode column.
-- Remote schema (20260821164631) dropped them, but RLS policies and
-- the sync engine both expect them to exist.
-- Without them, EXCLUDED.DBF and INCLUDED.DBF inserts fail with
-- "could not find the 'regcode' column ... in the schema cache".

ALTER TABLE dbf_excluded
  ADD COLUMN IF NOT EXISTS regcode text NOT NULL DEFAULT ''::text;

CREATE INDEX IF NOT EXISTS idx_dbf_excluded_regcode ON dbf_excluded (regcode);

ALTER TABLE dbf_included
  ADD COLUMN IF NOT EXISTS regcode text NOT NULL DEFAULT ''::text;

CREATE INDEX IF NOT EXISTS idx_dbf_included_regcode ON dbf_included (regcode);
