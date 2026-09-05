/*
# Create dbf_restore_history table

## Purpose
Tracks every FoxPro DBF file restore operation in the Restore Data module.
Each row records which of the 10 supported legacy tables was restored,
the uploaded filename, checksum, record count, file size, and who performed it.

## New Tables
- `dbf_restore_history`
  - `id` (uuid, PK)
  - `table_name` (text) — one of: DEDFILE, DIVTABLE, EXCLUDED, INCLUDED, MASTFILE, PAYROLLS, PYENT, PYENT1, PYENT2, STNTABLE
  - `original_filename` (text)
  - `file_size` (bigint)
  - `checksum` (text) — SHA-256 hex digest
  - `dbf_version` (int2) — version byte from DBF header
  - `header_size` (int2)
  - `record_size` (int2)
  - `field_count` (int2)
  - `record_count` (integer)
  - `code_page` (int2) — language driver byte from offset 29
  - `sidecar_files` (jsonb) — names of any .CDX/.FPT/.IDX files
  - `user_id` (uuid, FK to auth.users)
  - `user_email` (text)
  - `restored_at` (timestamptz, default now())

## Security
- RLS enabled, owner-scoped to authenticated users.
*/
CREATE TABLE IF NOT EXISTS dbf_restore_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  original_filename text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  checksum text,
  dbf_version int2,
  header_size int2,
  record_size int2,
  field_count int2,
  record_count integer NOT NULL DEFAULT 0,
  code_page int2,
  sidecar_files jsonb DEFAULT '[]'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  restored_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dbf_restore_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_restores" ON dbf_restore_history;
CREATE POLICY "select_own_restores" ON dbf_restore_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_restores" ON dbf_restore_history;
CREATE POLICY "insert_own_restores" ON dbf_restore_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_restores" ON dbf_restore_history;
CREATE POLICY "update_own_restores" ON dbf_restore_history FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_restores" ON dbf_restore_history;
CREATE POLICY "delete_own_restores" ON dbf_restore_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dbf_restore_history_table ON dbf_restore_history(table_name);
CREATE INDEX IF NOT EXISTS idx_dbf_restore_history_user ON dbf_restore_history(user_id);
CREATE INDEX IF NOT EXISTS idx_dbf_restore_history_restored ON dbf_restore_history(restored_at DESC);
