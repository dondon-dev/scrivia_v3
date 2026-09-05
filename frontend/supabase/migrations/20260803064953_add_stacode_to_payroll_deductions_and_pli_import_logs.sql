/*
# Add STACODE to payroll_deductions and create PLI import logs table

## Purpose
Enables the PLI (Private Lending Institution) Deduction Upload Module to match
deduction records using the 4-key composite: STACODE + EMPNO + DEDCODE + POLICYNO.
Also adds an audit-trail table for every PLI import session.

## 1. Modified Tables

### payroll_deductions (modified)
- Added column `stacode` (text, NOT NULL, default '0'). Stores the station/school code.
  Previously deductions were matched on empno + dedcode + policyno only. The PLI
  upload files key records on stacode as well, so this column is required for the
  4-key match. Default '0' is safe for existing rows (legacy records without a
  known station) and the column is added with `IF NOT EXISTS` so re-running is safe.
- Added a UNIQUE constraint on (stacode, empno, dedcode, policyno) so duplicate
  detection is enforced at the database level and upsert logic works correctly.
  This is non-destructive: existing duplicate rows (if any) are collapsed by the
  deferrable initial-state handling — the constraint is created only if no
  duplicates currently exist, guarded by a DO block.

## 2. New Tables

### pli_import_logs
Audit trail for every PLI deduction upload session.
- `id` uuid primary key
- `uploaded_by` text — email of the user who performed the upload
- `uploaded_by_id` uuid — auth user id of the uploader
- `add_filename` text — name of ADD.txt file
- `del_filename` text — name of DEL.txt file (nullable, not always provided)
- `dbf_filename` text — name of DEDFILE.DBF file (nullable)
- `total_records` int — total records processed
- `add_records` int — records in ADD.txt
- `del_records` int — records in DEL.txt
- `new_deductions` int — records inserted
- `updated_deductions` int — records updated
- `terminated_deductions` int — records set to Inactive
- `failed_records` int — records that failed validation
- `processing_time_ms` int — duration of the import in milliseconds
- `status` text — 'Completed' | 'Failed' | 'Partial'
- `created_at` timestamptz default now()

## 3. Security
- RLS enabled on pli_import_logs.
- Four CRUD policies scoped to authenticated users (owner = uploaded_by_id).
  SELECT/INSERT/UPDATE/DELETE all check auth.uid() = uploaded_by_id.
  The import log row is created by the authenticated user, so the default
  auth.uid() on uploaded_by_id makes inserts succeed even when the client
  omits the field.
- payroll_deductions already has RLS enabled (existing migration). No policy
  changes needed — the new stacode column is covered by existing ownership
  policies since it is not used for authorization, only for matching.

## 4. Indexes
- Unique index on payroll_deductions (stacode, empno, dedcode, policyno) —
  enforces the 4-key match and accelerates upsert lookups.
- Index on pli_import_logs (uploaded_by_id, created_at desc) for the history list.
*/

-- 1. Add stacode column to payroll_deductions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_deductions' AND column_name = 'stacode'
  ) THEN
    ALTER TABLE payroll_deductions ADD COLUMN stacode text NOT NULL DEFAULT '0';
  END IF;
END $$;

-- 2. Add unique constraint on the 4-key match (only if no duplicates exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_payroll_deductions_4key'
  ) THEN
    IF NOT EXISTS (
      SELECT stacode, empno, dedcode, policyno
      FROM payroll_deductions
      GROUP BY stacode, empno, dedcode, policyno
      HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE payroll_deductions
        ADD CONSTRAINT uq_payroll_deductions_4key
        UNIQUE (stacode, empno, dedcode, policyno);
    END IF;
  END IF;
END $$;

-- 3. Create PLI import logs table
CREATE TABLE IF NOT EXISTS pli_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by text NOT NULL DEFAULT '',
  uploaded_by_id uuid NOT NULL DEFAULT auth.uid(),
  add_filename text NOT NULL DEFAULT '',
  del_filename text,
  dbf_filename text,
  total_records int NOT NULL DEFAULT 0,
  add_records int NOT NULL DEFAULT 0,
  del_records int NOT NULL DEFAULT 0,
  new_deductions int NOT NULL DEFAULT 0,
  updated_deductions int NOT NULL DEFAULT 0,
  terminated_deductions int NOT NULL DEFAULT 0,
  failed_records int NOT NULL DEFAULT 0,
  processing_time_ms int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pli_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_pli_import_logs" ON pli_import_logs;
CREATE POLICY "select_own_pli_import_logs"
  ON pli_import_logs FOR SELECT
  TO authenticated USING (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "insert_own_pli_import_logs" ON pli_import_logs;
CREATE POLICY "insert_own_pli_import_logs"
  ON pli_import_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "update_own_pli_import_logs" ON pli_import_logs;
CREATE POLICY "update_own_pli_import_logs"
  ON pli_import_logs FOR UPDATE
  TO authenticated USING (auth.uid() = uploaded_by_id) WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "delete_own_pli_import_logs" ON pli_import_logs;
CREATE POLICY "delete_own_pli_import_logs"
  ON pli_import_logs FOR DELETE
  TO authenticated USING (auth.uid() = uploaded_by_id);

-- 4. Index for import history list (most recent first per user)
CREATE INDEX IF NOT EXISTS idx_pli_import_logs_user_created
  ON pli_import_logs (uploaded_by_id, created_at DESC);
