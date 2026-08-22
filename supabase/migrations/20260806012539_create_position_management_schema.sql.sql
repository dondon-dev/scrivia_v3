/*
# Create Position Management Schema

1. New Tables
- `position_management`: Stores position masterfile records imported from legacy
  DepEd POSTFILE.DBF files. Each row represents a position with its code, title,
  salary grade, eight step values, personnel category (Teaching / Teaching Related /
  Non-Teaching), and status.
- `position_import_logs`: Audit trail of every position import operation — who
  imported, when, file name, record counts (new / updated / skipped / errors),
  and the import mode used.

2. Columns — position_management
- id (uuid PK)
- position_code (text, unique) — maps from DBF POSCODE
- old_position_code (text) — maps from DBF OLDCODE
- position_title (text) — maps from DBF POSTITLE
- position_name (text) — maps from DBF POSITION
- salary_grade (int) — maps from DBF GRADE
- step1..step8 (numeric 14,2) — maps from DBF STEP1..STEP8
- personnel_category (text) — 'Teaching' | 'Teaching Related' | 'Non-Teaching'
- position_category_code (text) — maps from DBF SC
- remarks (text) — maps from DBF POSTPLUS
- status (text) — 'Active' | 'Inactive'
- last_imported_at (timestamptz)
- last_updated_at (timestamptz)
- created_at (timestamptz)

3. Columns — position_import_logs
- id (uuid PK)
- uploaded_by (text) — display name of importer
- uploaded_by_id (uuid, default auth.uid()) — owner for RLS
- filename (text) — uploaded file name
- import_mode (text) — 'add_new' | 'update_existing' | 'full_sync'
- total_records (int)
- new_records (int)
- updated_records (int)
- skipped_records (int)
- error_records (int)
- processing_time_ms (int)
- status (text) — 'Completed' | 'Failed' | 'Partial'
- created_at (timestamptz)

4. Security
- RLS enabled on both tables.
- position_management: all authenticated users can SELECT (read reference data);
  only authenticated users can INSERT / UPDATE / DELETE (admin gating is in app).
- position_import_logs: owner-scoped CRUD via auth.uid() = uploaded_by_id.

5. Indexes
- position_management: unique on position_code, index on personnel_category, status.
- position_import_logs: index on (uploaded_by_id, created_at DESC) for history lists.
*/

-- ── position_management ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS position_management (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_code text UNIQUE NOT NULL,
  old_position_code text DEFAULT '',
  position_title text DEFAULT '',
  position_name text DEFAULT '',
  salary_grade int DEFAULT 0,
  step1 numeric(14,2) DEFAULT 0,
  step2 numeric(14,2) DEFAULT 0,
  step3 numeric(14,2) DEFAULT 0,
  step4 numeric(14,2) DEFAULT 0,
  step5 numeric(14,2) DEFAULT 0,
  step6 numeric(14,2) DEFAULT 0,
  step7 numeric(14,2) DEFAULT 0,
  step8 numeric(14,2) DEFAULT 0,
  personnel_category text NOT NULL DEFAULT 'Non-Teaching'
    CHECK (personnel_category IN ('Teaching','Teaching Related','Non-Teaching')),
  position_category_code text DEFAULT '',
  remarks text DEFAULT '',
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active','Inactive')),
  last_imported_at timestamptz,
  last_updated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE position_management ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_position_management" ON position_management;
CREATE POLICY "select_position_management"
  ON position_management FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_position_management" ON position_management;
CREATE POLICY "insert_position_management"
  ON position_management FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_position_management" ON position_management;
CREATE POLICY "update_position_management"
  ON position_management FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_position_management" ON position_management;
CREATE POLICY "delete_position_management"
  ON position_management FOR DELETE TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_position_management_category
  ON position_management (personnel_category);
CREATE INDEX IF NOT EXISTS idx_position_management_status
  ON position_management (status);

-- ── position_import_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS position_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by text NOT NULL DEFAULT '',
  uploaded_by_id uuid NOT NULL DEFAULT auth.uid(),
  filename text NOT NULL DEFAULT '',
  import_mode text NOT NULL DEFAULT 'add_new',
  total_records int NOT NULL DEFAULT 0,
  new_records int NOT NULL DEFAULT 0,
  updated_records int NOT NULL DEFAULT 0,
  skipped_records int NOT NULL DEFAULT 0,
  error_records int NOT NULL DEFAULT 0,
  processing_time_ms int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE position_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_position_import_logs" ON position_import_logs;
CREATE POLICY "select_own_position_import_logs"
  ON position_import_logs FOR SELECT TO authenticated
  USING (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "insert_own_position_import_logs" ON position_import_logs;
CREATE POLICY "insert_own_position_import_logs"
  ON position_import_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "update_own_position_import_logs" ON position_import_logs;
CREATE POLICY "update_own_position_import_logs"
  ON position_import_logs FOR UPDATE TO authenticated
  USING (auth.uid() = uploaded_by_id) WITH CHECK (auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "delete_own_position_import_logs" ON position_import_logs;
CREATE POLICY "delete_own_position_import_logs"
  ON position_import_logs FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by_id);

CREATE INDEX IF NOT EXISTS idx_position_import_logs_user_created
  ON position_import_logs (uploaded_by_id, created_at DESC);
