/*
# Add DEDFILE columns to deductions table

## Purpose
Enables the Smart Import DEDFILE sync to store ALL 49 DEDFILE columns in the
deductions table (not just the basic 8). This allows the Deductions view to
display effectivity, termination, type, agency, loan details, and other
masterfile fields that were previously only stored in payroll_deductions.

## Columns Added
- stacode (text) — station code for category scoping
- effmm, effyy (text) — effectivity month/year
- termm, teryy (text) — termination month/year
- type (text) — Loan/Insurance/Membership/Savings/Other
- agency (text) — agency code (GSIS, BIR, etc.)
- policyno, policydate (text) — policy reference
- status (text) — Active/Suspended/Terminated
- principal, interest, charges, proceeds (numeric) — loan financials
- absno, underhr, undermin (numeric) — absence/undertime
- oldcode (text) — previous deduction code
- hiredate, birthdate (text) — employee dates
- gsis_bpn, qs (text) — GSIS identifiers
- paydate, editor (text) — pay date and last editor

All columns use IF NOT EXISTS for safe re-runs. Defaults are zero/empty so
existing rows are unaffected.
*/

-- 1. Add stacode (needed for category-scoped queries)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'stacode'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN stacode text NOT NULL DEFAULT '';
  END IF;
END $$;

-- 2. Add effectivity/termination columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'effmm'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN effmm text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'effyy'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN effyy text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'termm'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN termm text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'teryy'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN teryy text NOT NULL DEFAULT '';
  END IF;
END $$;

-- 3. Add deduction metadata columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN type text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'agency'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN agency text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'policyno'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN policyno text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'policydate'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN policydate text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN status text NOT NULL DEFAULT 'Active';
  END IF;
END $$;

-- 4. Add loan financial columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'principal'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN principal numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'interest'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN interest numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'charges'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN charges numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'proceeds'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN proceeds numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 5. Add absence/undertime columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'absno'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN absno numeric(8,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'underhr'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN underhr numeric(8,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'undermin'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN undermin numeric(8,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 6. Add misc DEDFILE columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'oldcode'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN oldcode text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'hiredate'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN hiredate text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'birthdate'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN birthdate text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'gsis_bpn'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN gsis_bpn text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'qs'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN qs text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'paydate'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN paydate text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deductions' AND column_name = 'editor'
  ) THEN
    ALTER TABLE public.deductions ADD COLUMN editor text NOT NULL DEFAULT '';
  END IF;
END $$;

-- 7. Index for stacode-based category queries
CREATE INDEX IF NOT EXISTS idx_deductions_stacode ON public.deductions(stacode);
