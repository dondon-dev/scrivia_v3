/*
# Plantilla Management — add missing columns and new tables

1. Purpose
   The plantilla_positions table already exists but is missing several columns
   needed by the rebuilt Plantilla Positions Management module. This migration
   adds those columns (non-destructively) and creates two new companion tables:
   plantilla_headers and plantilla_import_logs.

2. Columns added to plantilla_positions
   - header_id (text, nullable, FK→plantilla_headers) — links position to fiscal-year header
   - imported_by (text) — who imported this record
   - education (text) — education level field from PSIPOP
   - eligibility (text) — civil service eligibility (alias for civil_service_eligibility)

3. New tables
   - plantilla_headers: fiscal-year metadata (department, division, budget totals)
   - plantilla_import_logs: PDF import audit trail

4. Security
   - RLS enabled on both new tables with full authenticated CRUD policies.
   - plantilla_positions already has RLS; no change to existing policies.
*/

-- ── Add missing columns to plantilla_positions ─────────────────────────────
ALTER TABLE plantilla_positions ADD COLUMN IF NOT EXISTS header_id text;
ALTER TABLE plantilla_positions ADD COLUMN IF NOT EXISTS imported_by text;
ALTER TABLE plantilla_positions ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE plantilla_positions ADD COLUMN IF NOT EXISTS eligibility text;
ALTER TABLE plantilla_positions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── plantilla_headers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plantilla_headers (
  id text PRIMARY KEY,
  fiscal_year integer NOT NULL DEFAULT 2025,
  department text NOT NULL DEFAULT 'Department of Education',
  bureau_agency text NOT NULL DEFAULT 'Office of the Secretary',
  division_office text NOT NULL DEFAULT 'Division of Calamba City',
  total_positions integer NOT NULL DEFAULT 0,
  filled_positions integer NOT NULL DEFAULT 0,
  unfilled_positions integer NOT NULL DEFAULT 0,
  authorized_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric NOT NULL DEFAULT 0,
  source_pdf text,
  imported_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plantilla_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_plantilla_headers" ON plantilla_headers;
CREATE POLICY "select_plantilla_headers" ON plantilla_headers FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_plantilla_headers" ON plantilla_headers;
CREATE POLICY "insert_plantilla_headers" ON plantilla_headers FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_plantilla_headers" ON plantilla_headers;
CREATE POLICY "update_plantilla_headers" ON plantilla_headers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_plantilla_headers" ON plantilla_headers;
CREATE POLICY "delete_plantilla_headers" ON plantilla_headers FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_plantilla_headers_fy ON plantilla_headers(fiscal_year);

-- Add FK from plantilla_positions.header_id to plantilla_headers (id is text)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_plantilla_pos_header'
  ) THEN
    ALTER TABLE plantilla_positions
      ADD CONSTRAINT fk_plantilla_pos_header
      FOREIGN KEY (header_id) REFERENCES plantilla_headers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── plantilla_import_logs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plantilla_import_logs (
  id text PRIMARY KEY,
  imported_by text NOT NULL DEFAULT 'System',
  import_date text NOT NULL,
  pdf_filename text NOT NULL,
  fiscal_year integer DEFAULT 2025,
  positions_added integer NOT NULL DEFAULT 0,
  positions_updated integer NOT NULL DEFAULT 0,
  positions_vacated integer NOT NULL DEFAULT 0,
  positions_filled integer NOT NULL DEFAULT 0,
  total_records integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  import_batch_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plantilla_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_plantilla_import_logs" ON plantilla_import_logs;
CREATE POLICY "select_plantilla_import_logs" ON plantilla_import_logs FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_plantilla_import_logs" ON plantilla_import_logs;
CREATE POLICY "insert_plantilla_import_logs" ON plantilla_import_logs FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_plantilla_import_logs" ON plantilla_import_logs;
CREATE POLICY "update_plantilla_import_logs" ON plantilla_import_logs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_plantilla_import_logs" ON plantilla_import_logs;
CREATE POLICY "delete_plantilla_import_logs" ON plantilla_import_logs FOR DELETE
  TO authenticated USING (true);

-- ── Indexes on plantilla_positions ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plantilla_pos_item ON plantilla_positions(item_number);
CREATE INDEX IF NOT EXISTS idx_plantilla_pos_school ON plantilla_positions(school_id);
CREATE INDEX IF NOT EXISTS idx_plantilla_pos_category ON plantilla_positions(personnel_category);
CREATE INDEX IF NOT EXISTS idx_plantilla_pos_status ON plantilla_positions(position_status);
CREATE INDEX IF NOT EXISTS idx_plantilla_pos_fy ON plantilla_positions(fiscal_year);
