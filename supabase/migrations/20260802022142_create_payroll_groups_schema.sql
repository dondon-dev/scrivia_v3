/*
# Payroll Group Management Schema

## Purpose
Create a flexible payroll group system that allows employees to be grouped
(Elementary, High School, Division Office, etc.) and payroll to be processed
per group. The system supports unlimited groups — new groups can be added
without code or schema changes.

## Changes

### 1. New Table: `payroll_groups`
Stores payroll group definitions. Seeded with two defaults (ELEM, HS).

Columns:
- `id` (uuid, PK)
- `group_code` (text, unique) — e.g. ELEM, HS, ALS, SPED
- `group_name` (text) — e.g. "Elementary Payroll"
- `description` (text) — e.g. "Elementary Schools Payroll"
- `status` (text, default 'Active') — Active or Inactive
- `created_at` (timestamptz, default now())
- `created_by` (text, default 'system')

### 2. New Columns on `employees`
- `payroll_group_id` (uuid, nullable, FK → payroll_groups.id ON DELETE SET NULL)
- `distcode` (text, default '') — district code for district-level reporting

### 3. Seed Data
Inserts two default groups:
- ELEM: "Elementary Payroll" / "Elementary Schools Payroll"
- HS: "High School Payroll" / "Junior and Senior High School Payroll"

### 4. Employee Backfill
Assigns existing employees to a default group based on stacode:
- stacode starting with 'E' → ELEM
- stacode starting with 'H' or 'S' → HS
- Otherwise → ELEM (default)

### 5. Security
- RLS enabled on payroll_groups with anon+authenticated full CRUD (single-tenant, no auth)
*/

CREATE TABLE IF NOT EXISTS payroll_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code text UNIQUE NOT NULL,
  group_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);

ALTER TABLE payroll_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payroll_groups" ON payroll_groups;
CREATE POLICY "anon_select_payroll_groups" ON payroll_groups FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payroll_groups" ON payroll_groups;
CREATE POLICY "anon_insert_payroll_groups" ON payroll_groups FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payroll_groups" ON payroll_groups;
CREATE POLICY "anon_update_payroll_groups" ON payroll_groups FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payroll_groups" ON payroll_groups;
CREATE POLICY "anon_delete_payroll_groups" ON payroll_groups FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default groups (idempotent)
INSERT INTO payroll_groups (group_code, group_name, description, status, created_by)
VALUES ('ELEM', 'Elementary Payroll', 'Elementary Schools Payroll', 'Active', 'system')
ON CONFLICT (group_code) DO NOTHING;

INSERT INTO payroll_groups (group_code, group_name, description, status, created_by)
VALUES ('HS', 'High School Payroll', 'Junior and Senior High School Payroll', 'Active', 'system')
ON CONFLICT (group_code) DO NOTHING;

-- Add payroll_group_id column to employees
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'payroll_group_id') THEN
    ALTER TABLE employees ADD COLUMN payroll_group_id uuid REFERENCES payroll_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add distcode column to employees
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'distcode') THEN
    ALTER TABLE employees ADD COLUMN distcode text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Backfill: assign existing employees to a default group
UPDATE employees e
SET payroll_group_id = pg.id
FROM payroll_groups pg
WHERE e.payroll_group_id IS NULL
  AND pg.group_code = CASE
    WHEN e.stacode ILIKE 'E%' THEN 'ELEM'
    WHEN e.stacode ILIKE 'H%' OR e.stacode ILIKE 'S%' THEN 'HS'
    ELSE 'ELEM'
  END;

-- Any remaining unassigned employees get ELEM
UPDATE employees e
SET payroll_group_id = (SELECT id FROM payroll_groups WHERE group_code = 'ELEM')
WHERE e.payroll_group_id IS NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_employees_payroll_group ON employees(payroll_group_id);
