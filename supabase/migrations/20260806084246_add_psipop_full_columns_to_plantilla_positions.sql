/*
# Expand plantilla_positions for full PSIPOP PDF import

## Purpose
The existing `plantilla_positions` table has a minimal schema (position_code, position_title,
salary_grade, monthly_salary, level, category, stacode, item_number, status).
The PSIPOP PDF import extracts 17 columns per row; this migration adds the missing columns
so every extracted field can be persisted without data loss.

## Changes (all additive — no drops, no type changes, no renames)
1. New columns on `plantilla_positions`:
   - `salary_step` integer — salary step (1-8) from column (5) STEP
   - `step` integer — alias kept for code compatibility
   - `authorized_salary` numeric — column (3) AUTHORIZED ANNUAL SALARY
   - `actual_salary` numeric — column (4) ACTUAL ANNUAL SALARY
   - `annual_salary` numeric — alias for authorized_salary for code compatibility
   - `area` text — column (6) AREA
   - `type` text — column (7) TYPE
   - `ppa_attribution` text — column (9) P/P/A ATTRIBUTION
   - `employee_name` text — column (10) NAME OF INCUMBENT
   - `sex` text — column (11) SEX
   - `birth_date` text — column (12) DATE OF BIRTH (kept as text to preserve exact format)
   - `date_of_birth` text — alias
   - `tin` text — column (13) TIN
   - `appointment_date` text — column (14) DATE OF ORIGINAL APPOINTMENT
   - `original_appointment_date` text — alias
   - `last_promotion_date` text — column (15) DATE OF LAST PROMOTION
   - `civil_service_eligibility` text — column (17) CIVIL SERVICE ELIGIBILITY
   - `employment_status` text — employment status
   - `appointment_type` text — appointment type
   - `occupation_code` text — occupation code
   - `personnel_category` text — classified category (Teaching / Teaching Related / Non-Teaching)
   - `position_status` text — "Filled" or "Vacant"
   - `school_id` text — school/station code
   - `school_name` text — school/station name
   - `school_type` text — Elementary / High School / Implementing Unit / Division Office
   - `office_assignment` text — office assignment
   - `organizational_unit` text — org unit
   - `department` text — department
   - `bureau` text — bureau/agency
   - `fiscal_year` integer — fiscal year
   - `source_pdf` text — filename of source PDF
   - `import_batch_id` text — batch ID for this import
   - `approval_status` text — Approved / Pending_Approval / Draft
   - `employee_id` text — employee ID
   - `updated_at` timestamptz — already exists, kept
2. Index on `item_number` for dedup lookups during import
3. RLS already enabled; no policy changes needed (existing policies remain)

## Notes
- All columns are nullable or have safe defaults so existing rows are unaffected.
- `status` column already exists and maps to position_status for backward compat.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plantilla_positions') THEN
    CREATE TABLE plantilla_positions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      position_code text DEFAULT '',
      position_title text DEFAULT '',
      salary_grade integer DEFAULT 0,
      monthly_salary numeric DEFAULT 0,
      level text DEFAULT '',
      category text DEFAULT '',
      stacode text DEFAULT '',
      item_number text DEFAULT '',
      status text DEFAULT 'Active'
    );
    ALTER TABLE plantilla_positions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "select_plantilla_positions" ON plantilla_positions FOR SELECT TO authenticated USING (true);
    CREATE POLICY "insert_plantilla_positions" ON plantilla_positions FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "update_plantilla_positions" ON plantilla_positions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "delete_plantilla_positions" ON plantilla_positions FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plantilla_positions') THEN
    RETURN;
  END IF;
  -- Add each column only if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'salary_step') THEN
    ALTER TABLE plantilla_positions ADD COLUMN salary_step integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'step') THEN
    ALTER TABLE plantilla_positions ADD COLUMN step integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'authorized_salary') THEN
    ALTER TABLE plantilla_positions ADD COLUMN authorized_salary numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'actual_salary') THEN
    ALTER TABLE plantilla_positions ADD COLUMN actual_salary numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'annual_salary') THEN
    ALTER TABLE plantilla_positions ADD COLUMN annual_salary numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'area') THEN
    ALTER TABLE plantilla_positions ADD COLUMN area text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'type') THEN
    ALTER TABLE plantilla_positions ADD COLUMN type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'ppa_attribution') THEN
    ALTER TABLE plantilla_positions ADD COLUMN ppa_attribution text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'employee_name') THEN
    ALTER TABLE plantilla_positions ADD COLUMN employee_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'sex') THEN
    ALTER TABLE plantilla_positions ADD COLUMN sex text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'birth_date') THEN
    ALTER TABLE plantilla_positions ADD COLUMN birth_date text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'date_of_birth') THEN
    ALTER TABLE plantilla_positions ADD COLUMN date_of_birth text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'tin') THEN
    ALTER TABLE plantilla_positions ADD COLUMN tin text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'appointment_date') THEN
    ALTER TABLE plantilla_positions ADD COLUMN appointment_date text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'original_appointment_date') THEN
    ALTER TABLE plantilla_positions ADD COLUMN original_appointment_date text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'last_promotion_date') THEN
    ALTER TABLE plantilla_positions ADD COLUMN last_promotion_date text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'civil_service_eligibility') THEN
    ALTER TABLE plantilla_positions ADD COLUMN civil_service_eligibility text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'employment_status') THEN
    ALTER TABLE plantilla_positions ADD COLUMN employment_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'appointment_type') THEN
    ALTER TABLE plantilla_positions ADD COLUMN appointment_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'occupation_code') THEN
    ALTER TABLE plantilla_positions ADD COLUMN occupation_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'personnel_category') THEN
    ALTER TABLE plantilla_positions ADD COLUMN personnel_category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'position_status') THEN
    ALTER TABLE plantilla_positions ADD COLUMN position_status text DEFAULT 'Filled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'school_id') THEN
    ALTER TABLE plantilla_positions ADD COLUMN school_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'school_name') THEN
    ALTER TABLE plantilla_positions ADD COLUMN school_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'school_type') THEN
    ALTER TABLE plantilla_positions ADD COLUMN school_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'office_assignment') THEN
    ALTER TABLE plantilla_positions ADD COLUMN office_assignment text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'organizational_unit') THEN
    ALTER TABLE plantilla_positions ADD COLUMN organizational_unit text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'department') THEN
    ALTER TABLE plantilla_positions ADD COLUMN department text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'bureau') THEN
    ALTER TABLE plantilla_positions ADD COLUMN bureau text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'fiscal_year') THEN
    ALTER TABLE plantilla_positions ADD COLUMN fiscal_year integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'source_pdf') THEN
    ALTER TABLE plantilla_positions ADD COLUMN source_pdf text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'import_batch_id') THEN
    ALTER TABLE plantilla_positions ADD COLUMN import_batch_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'approval_status') THEN
    ALTER TABLE plantilla_positions ADD COLUMN approval_status text DEFAULT 'Approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plantilla_positions' AND column_name = 'employee_id') THEN
    ALTER TABLE plantilla_positions ADD COLUMN employee_id text;
  END IF;
END $$;

-- Index for fast dedup lookups during import (guarded for table existence)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plantilla_positions') THEN
    CREATE INDEX IF NOT EXISTS idx_plantilla_positions_item_number ON plantilla_positions (item_number);
  END IF;
END $$;
