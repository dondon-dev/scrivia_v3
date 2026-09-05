-- Add missing columns from actual DBF files to system tables.
-- DEDFILE.DBF has 49 fields, EXCLUDED/INCLUDED have 42 fields each.
-- This migration adds the columns the system was missing.

-- ═══════════════════════════════════════════════════════════════════════════
-- DEDFILE → payroll_deductions (add missing columns)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS regcode text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS divcode text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS fname text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS mi text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS lname text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS appel text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS netpay numeric DEFAULT 0;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS policydate date;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS agent text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS absno numeric DEFAULT 0;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS underhr numeric DEFAULT 0;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS undermin numeric DEFAULT 0;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS bill text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS abmm text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS abyy text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS oldcode text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS hiredate date;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS birthdate date;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS gsis_bpn text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS qs text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS dedfile_id text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS upcode text DEFAULT '';
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS paydate date;
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS editor text DEFAULT '';

-- ═══════════════════════════════════════════════════════════════════════════
-- EXCLUDED.DBF → dbf_excluded (add missing columns)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS type text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS fname text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS mi text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS lname text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS appEL text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS netpay numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS dedcode text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS dedid text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS dedamt numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS effmm text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS effyy text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS termm text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS teryy text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS policyno text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS policydate date;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS agent text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS absno numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS underhr numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS undermin numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS status text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS update_date date;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS paydate date;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS editor text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS tm text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS ty text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS agency text DEFAULT '';
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS principal numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS interest numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS charges numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS proceeds numeric DEFAULT 0;
ALTER TABLE dbf_excluded ADD COLUMN IF NOT EXISTS qs text DEFAULT '';

-- ═══════════════════════════════════════════════════════════════════════════
-- INCLUDED.DBF → dbf_included (add missing columns)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS type text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS fname text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS mi text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS lname text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS appel text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS netpay numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS dedcode text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS dedid text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS dedamt numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS effmm text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS effyy text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS termm text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS teryy text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS policyno text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS policydate date;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS agent text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS absno numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS underhr numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS undermin numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS status text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS update_date date;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS paydate date;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS editor text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS tm text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS ty text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS agency text DEFAULT '';
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS principal numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS interest numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS charges numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS proceeds numeric DEFAULT 0;
ALTER TABLE dbf_included ADD COLUMN IF NOT EXISTS qs text DEFAULT '';
