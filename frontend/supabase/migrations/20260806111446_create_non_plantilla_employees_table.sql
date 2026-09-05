/*
# Create non_plantilla_employees table

1. New Tables
- `non_plantilla_employees`
  - id (uuid, primary key, auto-generated)
  - surname (varchar(100), not null) — employee surname
  - first_name (varchar(100), not null) — employee first name
  - middle_name (varchar(100)) — employee middle name
  - complete_name (varchar(255)) — auto-generated "SURNAME, FIRST_NAME MIDDLE_NAME"
  - school (varchar(255), not null) — assigned school/office
  - designation (varchar(255), not null) — position or designation
  - pagibig_number (varchar(50)) — PAG-IBIG number, unique
  - philhealth (varchar(50)) — PhilHealth number, unique
  - landbank (varchar(50)) — Land Bank account number, unique
  - first_day_of_service (date) — first day of service
  - contact_number (varchar(30)) — mobile number
  - birthday (date) — date of birth
  - sex (varchar(20)) — Male/Female
  - address (text) — complete address
  - civil_status (varchar(50)) — Single/Married/Widowed/Separated
  - tin (varchar(50)) — Tax Identification Number, unique
  - is_deleted (boolean, default false) — soft delete flag
  - created_at (timestamptz, default now()) — record creation date
  - updated_at (timestamptz, default now()) — last update date

2. Indexes
- idx_non_plantilla_surname on surname
- idx_non_plantilla_school on school
- idx_non_plantilla_designation on designation
- idx_non_plantilla_complete_name on complete_name
- idx_non_plantilla_not_deleted on is_deleted (partial, where is_deleted = false)

3. Security
- Enable RLS on non_plantilla_employees.
- Authenticated users can read, insert, update, and delete (soft delete) records.
- Policies scoped TO authenticated with standard CRUD verbs.

4. Notes
- Unique constraints on tin, pagibig_number, philhealth, landbank are partial
  (WHERE the column IS NOT NULL AND the column <> '') so blank values don't
  conflict — uniqueness applies only when the value is actually provided.
- complete_name is auto-generated via a BEFORE INSERT/UPDATE trigger from
  surname, first_name, and middle_name.
- updated_at auto-updates via a BEFORE UPDATE trigger.
*/

CREATE TABLE IF NOT EXISTS non_plantilla_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surname varchar(100) NOT NULL,
  first_name varchar(100) NOT NULL,
  middle_name varchar(100) DEFAULT '',
  complete_name varchar(255) DEFAULT '',
  school varchar(255) NOT NULL,
  designation varchar(255) NOT NULL,
  pagibig_number varchar(50) DEFAULT '',
  philhealth varchar(50) DEFAULT '',
  landbank varchar(50) DEFAULT '',
  first_day_of_service date,
  contact_number varchar(30) DEFAULT '',
  birthday date,
  sex varchar(20) DEFAULT '',
  address text DEFAULT '',
  civil_status varchar(50) DEFAULT '',
  tin varchar(50) DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_non_plantilla_surname ON non_plantilla_employees (surname);
CREATE INDEX IF NOT EXISTS idx_non_plantilla_school ON non_plantilla_employees (school);
CREATE INDEX IF NOT EXISTS idx_non_plantilla_designation ON non_plantilla_employees (designation);
CREATE INDEX IF NOT EXISTS idx_non_plantilla_complete_name ON non_plantilla_employees (complete_name);
CREATE INDEX IF NOT EXISTS idx_non_plantilla_not_deleted ON non_plantilla_employees (id) WHERE is_deleted = false;

-- Partial unique constraints: only enforce uniqueness when value is provided
CREATE UNIQUE INDEX IF NOT EXISTS uq_non_plantilla_tin
  ON non_plantilla_employees (tin) WHERE tin IS NOT NULL AND tin <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_non_plantilla_pagibig
  ON non_plantilla_employees (pagibig_number) WHERE pagibig_number IS NOT NULL AND pagibig_number <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_non_plantilla_philhealth
  ON non_plantilla_employees (philhealth) WHERE philhealth IS NOT NULL AND philhealth <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_non_plantilla_landbank
  ON non_plantilla_employees (landbank) WHERE landbank IS NOT NULL AND landbank <> '';

-- Auto-generate complete_name and update updated_at
CREATE OR REPLACE FUNCTION fn_non_plantilla_before_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Auto-generate complete_name: "SURNAME, FIRST_NAME MIDDLE_NAME"
  NEW.complete_name = trim(
    coalesce(NEW.surname, '') || ', ' ||
    coalesce(NEW.first_name, '') ||
    CASE WHEN coalesce(NEW.middle_name, '') <> '' THEN ' ' || NEW.middle_name ELSE '' END
  );

  -- Normalize empty strings for unique-constrained optional fields
  NEW.tin = nullif(trim(coalesce(NEW.tin, '')), '');
  NEW.pagibig_number = nullif(trim(coalesce(NEW.pagibig_number, '')), '');
  NEW.philhealth = nullif(trim(coalesce(NEW.philhealth, '')), '');
  NEW.landbank = nullif(trim(coalesce(NEW.landbank, '')), '');

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_non_plantilla_before_insert ON non_plantilla_employees;
CREATE TRIGGER trg_non_plantilla_before_insert
  BEFORE INSERT ON non_plantilla_employees
  FOR EACH ROW EXECUTE FUNCTION fn_non_plantilla_before_upsert();

DROP TRIGGER IF EXISTS trg_non_plantilla_before_update ON non_plantilla_employees;
CREATE TRIGGER trg_non_plantilla_before_update
  BEFORE UPDATE ON non_plantilla_employees
  FOR EACH ROW EXECUTE FUNCTION fn_non_plantilla_before_upsert();

-- Enable RLS
ALTER TABLE non_plantilla_employees ENABLE ROW LEVEL SECURITY;

-- CRUD policies for authenticated users
DROP POLICY IF EXISTS "select_non_plantilla" ON non_plantilla_employees;
CREATE POLICY "select_non_plantilla"
  ON non_plantilla_employees FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_non_plantilla" ON non_plantilla_employees;
CREATE POLICY "insert_non_plantilla"
  ON non_plantilla_employees FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_non_plantilla" ON non_plantilla_employees;
CREATE POLICY "update_non_plantilla"
  ON non_plantilla_employees FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_non_plantilla" ON non_plantilla_employees;
CREATE POLICY "delete_non_plantilla"
  ON non_plantilla_employees FOR DELETE
  TO authenticated USING (true);
