/*
# Create Schools Directory Schema

## Purpose
Create a `schools` masterlist table that serves as the official organizational
directory of schools and implementing units under the Schools Division Office.
This table links to `employees.stacode` for automatic employee count
calculations and integrates with the Employee Masterfile and Payroll modules.

## Changes

### 1. New Table: `schools`
Columns:
- `id` (uuid, PK)
- `school_code` (text, unique) — maps to employees.stacode
- `school_name` (text)
- `school_type` (text) — 'Elementary' | 'Junior High School' | 'Senior High School' | 'Implementing Unit'
- `district` (text, default '')
- `address` (text, default '')
- `school_head` (text, default '')
- `contact_number` (text, default '')
- `email` (text, default '')
- `status` (text, default 'Active')
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. Seed Data
Backfill schools from existing employees.stacode values.

### 3. Security
- RLS enabled on schools with authenticated-only CRUD.
*/

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_code text UNIQUE NOT NULL,
  school_name text NOT NULL DEFAULT '',
  school_type text NOT NULL DEFAULT 'Elementary',
  district text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  school_head text NOT NULL DEFAULT '',
  contact_number text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_schools" ON schools;
CREATE POLICY "select_schools" ON schools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_schools" ON schools;
CREATE POLICY "insert_schools" ON schools FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_schools" ON schools;
CREATE POLICY "update_schools" ON schools FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_schools" ON schools;
CREATE POLICY "delete_schools" ON schools FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_schools_type ON schools(school_type);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

INSERT INTO schools (school_code, school_name, school_type, district, status)
SELECT
  e.stacode AS school_code,
  COALESCE(NULLIF(e.department, ''), 'School ' || e.stacode) AS school_name,
  CASE
    WHEN pg.group_code = 'ELEM' THEN 'Elementary'
    WHEN pg.group_code IN ('JHS','HS') THEN 'Junior High School'
    WHEN pg.group_code = 'SHS' THEN 'Senior High School'
    ELSE 'Elementary'
  END AS school_type,
  COALESCE(NULLIF(e.distcode, ''), '') AS district,
  'Active' AS status
FROM (SELECT DISTINCT stacode, distcode, department, payroll_group_id FROM employees) e
LEFT JOIN payroll_groups pg ON pg.id = e.payroll_group_id
WHERE e.stacode IS NOT NULL AND e.stacode <> ''
ON CONFLICT (school_code) DO NOTHING;

CREATE OR REPLACE FUNCTION update_schools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schools_updated_at ON schools;
CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_schools_updated_at();
