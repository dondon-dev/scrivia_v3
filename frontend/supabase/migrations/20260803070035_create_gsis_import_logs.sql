/*
# Create GSIS import logs table

## Purpose
Audit trail for every GSIS deduction upload session. Records who uploaded,
which file, how many records were added/updated/failed, and processing time.

## 1. New Tables

### gsis_import_logs
- `id` uuid primary key
- `uploaded_by` text — email of the user who performed the upload
- `uploaded_by_id` uuid — auth user id of the uploader (defaults to auth.uid())
- `filename` text — name of the uploaded GSIS TXT file
- `total_records` int — total records in the uploaded file
- `matched_records` int — records that matched an existing deduction (UPDATE)
- `new_deductions` int — records inserted as new deductions (ADD)
- `updated_deductions` int — records that updated an existing deduction
- `failed_records` int — records that failed validation
- `processing_time_ms` int — duration of the import in milliseconds
- `status` text — 'Completed' | 'Failed' | 'Partial'
- `created_at` timestamptz default now()

## 2. Security
- RLS enabled on gsis_import_logs.
- Four CRUD policies scoped to authenticated users (owner = uploaded_by_id).
  SELECT/INSERT/UPDATE/DELETE all check auth.uid() = uploaded_by_id.
  The uploaded_by_id column defaults to auth.uid() so inserts succeed even
  when the client omits the field.

## 3. Indexes
- Index on gsis_import_logs (uploaded_by_id, created_at desc) for history list.
*/

CREATE TABLE IF NOT EXISTS gsis_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by text NOT NULL DEFAULT '',
  uploaded_by_id uuid NOT NULL DEFAULT auth.uid(),
  filename text NOT NULL DEFAULT '',
  total_records int NOT NULL DEFAULT 0,
  matched_records int NOT NULL DEFAULT 0,
  new_deductions int NOT NULL DEFAULT 0,
  updated_deductions int NOT NULL DEFAULT 0,
  failed_records int NOT NULL DEFAULT 0,
  processing_time_ms int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gsis_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_gsis_import_logs" ON gsis_import_logs;
CREATE POLICY "select_own_gsis_import_logs"
  ON gsis_import_logs FOR SELECT
  TO authenticated USING (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "insert_own_gsis_import_logs" ON gsis_import_logs;
CREATE POLICY "insert_own_gsis_import_logs"
  ON gsis_import_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "update_own_gsis_import_logs" ON gsis_import_logs;
CREATE POLICY "update_own_gsis_import_logs"
  ON gsis_import_logs FOR UPDATE
  TO authenticated USING (auth.uid() = uploaded_by_id) WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "delete_own_gsis_import_logs" ON gsis_import_logs;
CREATE POLICY "delete_own_gsis_import_logs"
  ON gsis_import_logs FOR DELETE
  TO authenticated USING (auth.uid() = uploaded_by_id);

CREATE INDEX IF NOT EXISTS idx_gsis_import_logs_user_created
  ON gsis_import_logs (uploaded_by_id, created_at DESC);
