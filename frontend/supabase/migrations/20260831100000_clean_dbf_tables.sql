-- ============================================================
-- CLEAN DBF TABLE RECREATION
-- Replaces all 4 DBF tables with exact column structures
-- matching the original DBF files from DepEd payroll system
-- ============================================================

-- Drop old duplicate/conflicting tables
DROP TABLE IF EXISTS public.payroll_deductions CASCADE;
DROP TABLE IF EXISTS public.dbf_included CASCADE;
DROP TABLE IF EXISTS public.dbf_excluded CASCADE;

-- Also drop any old tables with similar names
DROP TABLE IF EXISTS public.included CASCADE;
DROP TABLE IF EXISTS public.excluded CASCADE;
DROP TABLE IF EXISTS public.deductions CASCADE;

-- ============================================================
-- 1. dbf_mastfile — Employee Masterfile (MASTFILE.DBF)
--    88 columns matching the DBF exactly
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dbf_mastfile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Employee identification (common across all files)
  regcode text NOT NULL DEFAULT '',
  divcode text NOT NULL DEFAULT '',
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  
  -- Employee name (common across all files)
  fname text NOT NULL DEFAULT '',
  mi text NOT NULL DEFAULT '',
  lname text NOT NULL DEFAULT '',
  appel text NOT NULL DEFAULT '',
  
  -- Account and full name
  account text NOT NULL DEFAULT '',
  empname text NOT NULL DEFAULT '',
  
  -- Position and salary grade
  poscode text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  step text NOT NULL DEFAULT '',
  
  -- Salary components
  basic numeric(14,2) NOT NULL DEFAULT 0,
  trans numeric(8,2) NOT NULL DEFAULT 0,
  pera numeric(8,2) NOT NULL DEFAULT 0,
  aca numeric(8,2) NOT NULL DEFAULT 0,
  rata numeric(8,2) NOT NULL DEFAULT 0,
  onto numeric(8,2) NOT NULL DEFAULT 0,
  long numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Employee deductions
  dedlnr numeric(8,2) NOT NULL DEFAULT 0,
  dedmed numeric(8,2) NOT NULL DEFAULT 0,
  dedtax numeric(8,2) NOT NULL DEFAULT 0,
  dedpag numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Net pay
  netpay numeric(9,2) NOT NULL DEFAULT 0,
  
  -- Tax and Pag-IBIG codes
  pagcode text NOT NULL DEFAULT '',
  taxcode text NOT NULL DEFAULT '',
  
  -- Personal information
  civilstat text NOT NULL DEFAULT '',
  attend text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  sex text NOT NULL DEFAULT '',
  birthdate date,
  tin text NOT NULL DEFAULT '',
  
  -- GSIS information
  gsis_pn text NOT NULL DEFAULT '',
  gsis_id text NOT NULL DEFAULT '',
  
  -- Government share
  govlnr numeric(8,2) NOT NULL DEFAULT 0,
  govecc numeric(8,2) NOT NULL DEFAULT 0,
  govtmed numeric(8,2) NOT NULL DEFAULT 0,
  govtpag numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Audit fields
  updcode text NOT NULL DEFAULT '',
  update_date date,
  paydate date,
  editor text NOT NULL DEFAULT '',
  
  -- Payment and banking
  paymode text NOT NULL DEFAULT '',
  hiredate date,
  hdmf_id text NOT NULL DEFAULT '',
  phic_id text NOT NULL DEFAULT '',
  banker text NOT NULL DEFAULT '',
  
  -- Benefits
  pib numeric(8,2) NOT NULL DEFAULT 0,
  clothing numeric(8,2) NOT NULL DEFAULT 0,
  cashallow numeric(8,2) NOT NULL DEFAULT 0,
  mid_bonus numeric(8,2) NOT NULL DEFAULT 0,
  mid_cash numeric(8,2) NOT NULL DEFAULT 0,
  end_bonus numeric(8,2) NOT NULL DEFAULT 0,
  end_cash numeric(8,2) NOT NULL DEFAULT 0,
  add_bonus numeric(8,2) NOT NULL DEFAULT 0,
  taxref numeric(8,2) NOT NULL DEFAULT 0,
  special numeric(8,2) NOT NULL DEFAULT 0,
  over_wheld numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Exposure/assignment
  exposcode text NOT NULL DEFAULT '',
  exgrade text NOT NULL DEFAULT '',
  exstep text NOT NULL DEFAULT '',
  exbasic numeric(9,2) NOT NULL DEFAULT 0,
  exlnr numeric(8,2) NOT NULL DEFAULT 0,
  exmed numeric(8,2) NOT NULL DEFAULT 0,
  expag numeric(8,2) NOT NULL DEFAULT 0,
  extax numeric(8,2) NOT NULL DEFAULT 0,
  exglnr numeric(8,2) NOT NULL DEFAULT 0,
  exgmed numeric(8,2) NOT NULL DEFAULT 0,
  exgpag numeric(8,2) NOT NULL DEFAULT 0,
  exgecc numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Differentials
  saldiff numeric(8,2) NOT NULL DEFAULT 0,
  lnrdiff numeric(8,2) NOT NULL DEFAULT 0,
  meddiff numeric(8,2) NOT NULL DEFAULT 0,
  pagdiff numeric(8,2) NOT NULL DEFAULT 0,
  taxdiff numeric(8,2) NOT NULL DEFAULT 0,
  glnrdiff numeric(8,2) NOT NULL DEFAULT 0,
  gmeddiff numeric(8,2) NOT NULL DEFAULT 0,
  gpagdiff numeric(8,2) NOT NULL DEFAULT 0,
  geccdiff numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Dependents
  depname1 text NOT NULL DEFAULT '',
  depname2 text NOT NULL DEFAULT '',
  depname3 text NOT NULL DEFAULT '',
  depname4 text NOT NULL DEFAULT '',
  depdate1 date,
  depdate2 date,
  depdate3 date,
  depdate4 date,
  
  -- Sync metadata
  payperiod text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dbf_mastfile
CREATE INDEX IF NOT EXISTS idx_mastfile_empno ON public.dbf_mastfile(empno);
CREATE INDEX IF NOT EXISTS idx_mastfile_stacode ON public.dbf_mastfile(stacode);
CREATE INDEX IF NOT EXISTS idx_mastfile_divcode ON public.dbf_mastfile(divcode);
CREATE INDEX IF NOT EXISTS idx_mastfile_regcode ON public.dbf_mastfile(regcode);
CREATE INDEX IF NOT EXISTS idx_mastfile_status ON public.dbf_mastfile(status);

-- ============================================================
-- 2. payroll_deductions — Deduction Masterfile (DEDFILE.DBF)
--    49 columns matching the DBF exactly
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Timestamp fields
  p text NOT NULL DEFAULT '',
  yy text NOT NULL DEFAULT '',
  mm text NOT NULL DEFAULT '',
  dd text NOT NULL DEFAULT '',
  hr text NOT NULL DEFAULT '',
  min_field text NOT NULL DEFAULT '',
  sec text NOT NULL DEFAULT '',
  
  -- Employee identification (common across all files)
  regcode text NOT NULL DEFAULT '',
  divcode text NOT NULL DEFAULT '',
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  
  -- Employee name (common across all files)
  fname text NOT NULL DEFAULT '',
  mi text NOT NULL DEFAULT '',
  lname text NOT NULL DEFAULT '',
  appel text NOT NULL DEFAULT '',
  
  -- Net pay
  netpay numeric(9,2) NOT NULL DEFAULT 0,
  
  -- Deduction details
  dedcode text NOT NULL DEFAULT '',
  policyno text NOT NULL DEFAULT '',
  dedid text NOT NULL DEFAULT '',
  effmm text NOT NULL DEFAULT '',
  effyy text NOT NULL DEFAULT '',
  termm text DEFAULT NULL,
  teryy text DEFAULT NULL,
  dedamt numeric(8,2) NOT NULL DEFAULT 0,
  policydate date,
  
  -- Agent and billing
  agent text NOT NULL DEFAULT '',
  absno numeric(2,0) NOT NULL DEFAULT 0,
  underhr numeric(1,0) NOT NULL DEFAULT 0,
  undermin numeric(2,0) NOT NULL DEFAULT 0,
  
  -- Status and audit
  status text NOT NULL DEFAULT '',
  updcode text NOT NULL DEFAULT '',
  update_date date,
  paydate date,
  editor text NOT NULL DEFAULT '',
  
  -- Loan details
  principal numeric(10,2) NOT NULL DEFAULT 0,
  interest numeric(8,2) NOT NULL DEFAULT 0,
  charges numeric(8,2) NOT NULL DEFAULT 0,
  proceeds numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Classification
  type text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  bill text NOT NULL DEFAULT '',
  abmm text NOT NULL DEFAULT '',
  abyy text NOT NULL DEFAULT '',
  oldcode text NOT NULL DEFAULT '',
  
  -- Employee info
  hiredate date,
  birthdate date,
  gsis_bpn text NOT NULL DEFAULT '',
  qs text NOT NULL DEFAULT '',
  dbf_id text NOT NULL DEFAULT '',
  
  -- Sync metadata
  payperiod text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid,
  created_by text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  upcode text NOT NULL DEFAULT ''
);

-- Indexes for payroll_deductions
CREATE INDEX IF NOT EXISTS idx_dedfile_empno ON public.payroll_deductions(empno);
CREATE INDEX IF NOT EXISTS idx_dedfile_stacode ON public.payroll_deductions(stacode);
CREATE INDEX IF NOT EXISTS idx_dedfile_divcode ON public.payroll_deductions(divcode);
CREATE INDEX IF NOT EXISTS idx_dedfile_regcode ON public.payroll_deductions(regcode);
CREATE INDEX IF NOT EXISTS idx_dedfile_dedcode ON public.payroll_deductions(dedcode);
CREATE INDEX IF NOT EXISTS idx_dedfile_status ON public.payroll_deductions(status);
CREATE INDEX IF NOT EXISTS idx_dedfile_qs ON public.payroll_deductions(qs);

-- ============================================================
-- 3. dbf_included — Included Deductions (INCLUDED.DBF)
--    42 columns matching the DBF exactly
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dbf_included (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Timestamp fields
  p text NOT NULL DEFAULT '',
  yy text NOT NULL DEFAULT '',
  mm text NOT NULL DEFAULT '',
  dd text NOT NULL DEFAULT '',
  hr text NOT NULL DEFAULT '',
  min_field text NOT NULL DEFAULT '',
  sec text NOT NULL DEFAULT '',
  
  -- Classification
  type text NOT NULL DEFAULT '',
  
  -- Employee identification (common across all files)
  regcode text NOT NULL DEFAULT '',
  divcode text NOT NULL DEFAULT '',
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  
  -- Employee name (common across all files)
  fname text NOT NULL DEFAULT '',
  mi text NOT NULL DEFAULT '',
  lname text NOT NULL DEFAULT '',
  appel text NOT NULL DEFAULT '',
  
  -- Net pay
  netpay numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Deduction details
  dedcode text NOT NULL DEFAULT '',
  dedid text NOT NULL DEFAULT '',
  dedamt numeric(8,2) NOT NULL DEFAULT 0,
  effmm text NOT NULL DEFAULT '',
  effyy text NOT NULL DEFAULT '',
  termm text DEFAULT NULL,
  teryy text DEFAULT NULL,
  policyno text NOT NULL DEFAULT '',
  policydate date,
  
  -- Agent and billing
  agent text NOT NULL DEFAULT '',
  absno numeric(2,0) NOT NULL DEFAULT 0,
  underhr numeric(1,0) NOT NULL DEFAULT 0,
  undermin numeric(2,0) NOT NULL DEFAULT 0,
  
  -- Status and audit
  status text NOT NULL DEFAULT '',
  update_date date,
  paydate date,
  editor text NOT NULL DEFAULT '',
  
  -- Additional timestamp
  tm text NOT NULL DEFAULT '',
  ty text NOT NULL DEFAULT '',
  
  -- Loan details
  agency text NOT NULL DEFAULT '',
  principal numeric(9,2) NOT NULL DEFAULT 0,
  interest numeric(9,2) NOT NULL DEFAULT 0,
  charges numeric(9,2) NOT NULL DEFAULT 0,
  proceeds numeric(9,2) NOT NULL DEFAULT 0,
  
  -- Qualification status
  qs text NOT NULL DEFAULT '',
  
  -- Sync metadata
  payperiod text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dbf_included
CREATE INDEX IF NOT EXISTS idx_included_empno ON public.dbf_included(empno);
CREATE INDEX IF NOT EXISTS idx_included_stacode ON public.dbf_included(stacode);
CREATE INDEX IF NOT EXISTS idx_included_divcode ON public.dbf_included(divcode);
CREATE INDEX IF NOT EXISTS idx_included_regcode ON public.dbf_included(regcode);
CREATE INDEX IF NOT EXISTS idx_included_dedcode ON public.dbf_included(dedcode);
CREATE INDEX IF NOT EXISTS idx_included_status ON public.dbf_included(status);
CREATE INDEX IF NOT EXISTS idx_included_qs ON public.dbf_included(qs);

-- ============================================================
-- 4. dbf_excluded — Excluded Deductions (EXCLUDED.DBF)
--    42 columns matching the DBF exactly
--    These are the LEAST PRIORITY deductions (undeducted obligations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dbf_excluded (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Timestamp fields
  p text NOT NULL DEFAULT '',
  yy text NOT NULL DEFAULT '',
  mm text NOT NULL DEFAULT '',
  dd text NOT NULL DEFAULT '',
  hr text NOT NULL DEFAULT '',
  min_field text NOT NULL DEFAULT '',
  sec text NOT NULL DEFAULT '',
  
  -- Classification
  type text NOT NULL DEFAULT '',
  
  -- Employee identification (common across all files)
  regcode text NOT NULL DEFAULT '',
  divcode text NOT NULL DEFAULT '',
  stacode text NOT NULL DEFAULT '',
  empno text NOT NULL DEFAULT '',
  
  -- Employee name (common across all files)
  fname text NOT NULL DEFAULT '',
  mi text NOT NULL DEFAULT '',
  lname text NOT NULL DEFAULT '',
  appel text NOT NULL DEFAULT '',
  
  -- Net pay
  netpay numeric(8,2) NOT NULL DEFAULT 0,
  
  -- Deduction details
  dedcode text NOT NULL DEFAULT '',
  dedid text NOT NULL DEFAULT '',
  dedamt numeric(8,2) NOT NULL DEFAULT 0,
  effmm text NOT NULL DEFAULT '',
  effyy text NOT NULL DEFAULT '',
  termm text DEFAULT NULL,
  teryy text DEFAULT NULL,
  policyno text NOT NULL DEFAULT '',
  policydate date,
  
  -- Agent and billing
  agent text NOT NULL DEFAULT '',
  absno numeric(2,0) NOT NULL DEFAULT 0,
  underhr numeric(1,0) NOT NULL DEFAULT 0,
  undermin numeric(2,0) NOT NULL DEFAULT 0,
  
  -- Status and audit
  status text NOT NULL DEFAULT '',
  update_date date,
  paydate date,
  editor text NOT NULL DEFAULT '',
  
  -- Additional timestamp
  tm text NOT NULL DEFAULT '',
  ty text NOT NULL DEFAULT '',
  
  -- Loan details
  agency text NOT NULL DEFAULT '',
  principal numeric(9,2) NOT NULL DEFAULT 0,
  interest numeric(9,2) NOT NULL DEFAULT 0,
  charges numeric(9,2) NOT NULL DEFAULT 0,
  proceeds numeric(9,2) NOT NULL DEFAULT 0,
  
  -- Qualification status
  qs text NOT NULL DEFAULT '',
  
  -- Sync metadata
  payperiod text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dbf_excluded
CREATE INDEX IF NOT EXISTS idx_excluded_empno ON public.dbf_excluded(empno);
CREATE INDEX IF NOT EXISTS idx_excluded_stacode ON public.dbf_excluded(stacode);
CREATE INDEX IF NOT EXISTS idx_excluded_divcode ON public.dbf_excluded(divcode);
CREATE INDEX IF NOT EXISTS idx_excluded_regcode ON public.dbf_excluded(regcode);
CREATE INDEX IF NOT EXISTS idx_excluded_dedcode ON public.dbf_excluded(dedcode);
CREATE INDEX IF NOT EXISTS idx_excluded_status ON public.dbf_excluded(status);
CREATE INDEX IF NOT EXISTS idx_excluded_qs ON public.dbf_excluded(qs);

-- ============================================================
-- COMMON COLUMNS REFERENCE (across all 4 tables):
-- 
-- Employee ID:  REGCODE, DIVCODE, STACODE, EMPNO
-- Employee Name: FNAME, MI, LNAME, APPEL
-- Net Pay:      NETPAY
-- Deduction:    DEDCODE, DEDID, DEDAMT
-- Policy:       POLICYNO, POLICYDATE
-- Dates:        EFFMM, EFFYY, TERMM, TERYY
-- Agent:        AGENT, ABSNO, AGENCY
-- Loan:         PRINCIPAL, INTEREST, CHARGES, PROCEEDS
-- Status:       STATUS, UPDATE, PAYDATE, EDITOR
-- Classification: TYPE, QS
-- ============================================================

-- ============================================================
-- 5. deductions — Per-period deducted deductions
--    Created by INCLUDED.DBF sync (forwardIncludedToDeductions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  pay_period_id uuid,
  deduction_code text NOT NULL DEFAULT '',
  deduction_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Other',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'DEDFILE',
  reference text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deductions_employee ON public.deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_deductions_period ON public.deductions(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_deductions_source ON public.deductions(source);

-- ============================================================
-- RLS Policies for DBF tables
-- ============================================================
ALTER TABLE public.dbf_mastfile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dbf_included ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dbf_excluded ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

-- Authenticated and service_role full access policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_dbf_mastfile' AND tablename = 'dbf_mastfile') THEN
    CREATE POLICY authenticated_all_dbf_mastfile ON public.dbf_mastfile FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_dbf_mastfile' AND tablename = 'dbf_mastfile') THEN
    CREATE POLICY service_all_dbf_mastfile ON public.dbf_mastfile FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_payroll_deductions' AND tablename = 'payroll_deductions') THEN
    CREATE POLICY authenticated_all_payroll_deductions ON public.payroll_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_payroll_deductions' AND tablename = 'payroll_deductions') THEN
    CREATE POLICY service_all_payroll_deductions ON public.payroll_deductions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_dbf_included' AND tablename = 'dbf_included') THEN
    CREATE POLICY authenticated_all_dbf_included ON public.dbf_included FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_dbf_included' AND tablename = 'dbf_included') THEN
    CREATE POLICY service_all_dbf_included ON public.dbf_included FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_dbf_excluded' AND tablename = 'dbf_excluded') THEN
    CREATE POLICY authenticated_all_dbf_excluded ON public.dbf_excluded FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_dbf_excluded' AND tablename = 'dbf_excluded') THEN
    CREATE POLICY service_all_dbf_excluded ON public.dbf_excluded FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_all_deductions' AND tablename = 'deductions') THEN
    CREATE POLICY authenticated_all_deductions ON public.deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_deductions' AND tablename = 'deductions') THEN
    CREATE POLICY service_all_deductions ON public.deductions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
