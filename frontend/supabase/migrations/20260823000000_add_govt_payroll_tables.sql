-- ============================================================================
-- Government Agency Payroll Tables (payroll-modern integration)
-- Adds GSIS billing, payroll records snapshot, and government share columns
-- ============================================================================

-- 1. GSIS Billing — mirrors gsis_billing entity from payroll-modern
CREATE TABLE IF NOT EXISTS public.gsis_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pol_pre VARCHAR(2),
  pol_sn VARCHAR(11),
  account VARCHAR(5) NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  due_month VARCHAR(7),
  hsng_acct VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gsis_billing_period ON public.gsis_billing (due_month);
CREATE INDEX IF NOT EXISTS idx_gsis_billing_account ON public.gsis_billing (account);

-- 2. GSIS Remittance — per-employee remittance detail
CREATE TABLE IF NOT EXISTS public.gsis_remittance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_no VARCHAR(7) NOT NULL,
  fname VARCHAR(25),
  lname VARCHAR(25),
  mi VARCHAR(25),
  sta_code VARCHAR(3),
  ded_code VARCHAR(5) NOT NULL,
  ded_amt NUMERIC(12,2) DEFAULT 0,
  govt_lnr NUMERIC(12,2) DEFAULT 0,
  govt_ecc NUMERIC(12,2) DEFAULT 0,
  basic NUMERIC(12,2) DEFAULT 0,
  duemonth VARCHAR(7),
  div_code VARCHAR(3),
  pol_pre VARCHAR(2),
  pol_sn VARCHAR(11),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gsis_remit_emp ON public.gsis_remittance (emp_no);
CREATE INDEX IF NOT EXISTS idx_gsis_remit_period ON public.gsis_remittance (duemonth);

-- 3. Government share columns on payroll_entries (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'govt_lnr'
  ) THEN
    ALTER TABLE public.payroll_entries
      ADD COLUMN govt_lnr NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN govt_ecc NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN govt_med NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN govt_pag NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN other_ded NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;

-- 4. RLS policies
ALTER TABLE public.gsis_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gsis_remittance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gsis_billing' AND policyname='Authenticated read') THEN
    CREATE POLICY "Authenticated read" ON public.gsis_billing FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gsis_billing' AND policyname='Authenticated insert') THEN
    CREATE POLICY "Authenticated insert" ON public.gsis_billing FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gsis_remittance' AND policyname='Authenticated read') THEN
    CREATE POLICY "Authenticated read" ON public.gsis_remittance FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gsis_remittance' AND policyname='Authenticated insert') THEN
    CREATE POLICY "Authenticated insert" ON public.gsis_remittance FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
