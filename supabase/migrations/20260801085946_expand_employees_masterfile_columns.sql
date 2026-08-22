/*
# Expand employees table to full 80-column masterfile format

## Overview
Adds the full Philippine government payroll masterfile column set to the employees
table. All new columns use IF NOT EXISTS guards — no existing columns are dropped
or renamed. Existing employee data is migrated from old columns to the new
masterfile columns (empno, fname, lname, basic, banker, etc.).

## New Columns (grouped)
- Identity & Assignment: regcode, divcode, stacode, empno, account, empname,
  fname, mi, lname, appel, poscode, paymode
- Salary: grade, step, basic, trans, pera, aca, rata, ontop, long, clothing, cashallow
- Deductions: dedlnr, dedmed, dedtax, dedpag, netpay, govtlnr, govtecc, govtmed, govtpag
- Codes: pagcode, taxcode, civilstat, attend, sex, exposcode, updcode
- Government IDs: gsis_pn, gsis_id, hdmf_id, phic_id, pib, banker
- Dates: birthdate, "update", paydate, hiredate
- Bonuses: mid_bonus, mid_cash, end_bonus, end_cash, add_bonus, taxref, special, over_wheld
- Excess: exgrade, exstep, exbasic, exlnr, exmed, expag, extax, exglnr, exgmed, exgpag, exgecc
- Differences: saldiff, lnrdiff, meddiff, pagdiff, taxdiff, glnrdiff, gmeddiff, gpagdiff, geccdiff
- Metadata: editor

## Security
No security changes — existing RLS policies already allow full anon/authenticated CRUD.
*/

DO $$
BEGIN
  -- Identity & Assignment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='regcode') THEN ALTER TABLE employees ADD COLUMN regcode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='divcode') THEN ALTER TABLE employees ADD COLUMN divcode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='stacode') THEN ALTER TABLE employees ADD COLUMN stacode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='empno') THEN ALTER TABLE employees ADD COLUMN empno text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='account') THEN ALTER TABLE employees ADD COLUMN account text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='empname') THEN ALTER TABLE employees ADD COLUMN empname text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='fname') THEN ALTER TABLE employees ADD COLUMN fname text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='mi') THEN ALTER TABLE employees ADD COLUMN mi text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='lname') THEN ALTER TABLE employees ADD COLUMN lname text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='appel') THEN ALTER TABLE employees ADD COLUMN appel text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='poscode') THEN ALTER TABLE employees ADD COLUMN poscode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='paymode') THEN ALTER TABLE employees ADD COLUMN paymode text DEFAULT 'ATM'; END IF;

  -- Salary Grade & Step
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='grade') THEN ALTER TABLE employees ADD COLUMN grade integer DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='step') THEN ALTER TABLE employees ADD COLUMN step integer DEFAULT 0; END IF;

  -- Compensation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='basic') THEN ALTER TABLE employees ADD COLUMN basic numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='trans') THEN ALTER TABLE employees ADD COLUMN trans numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='pera') THEN ALTER TABLE employees ADD COLUMN pera numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='aca') THEN ALTER TABLE employees ADD COLUMN aca numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='rata') THEN ALTER TABLE employees ADD COLUMN rata numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='ontop') THEN ALTER TABLE employees ADD COLUMN ontop numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='long') THEN ALTER TABLE employees ADD COLUMN long numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='clothing') THEN ALTER TABLE employees ADD COLUMN clothing numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='cashallow') THEN ALTER TABLE employees ADD COLUMN cashallow numeric(14,2) DEFAULT 0; END IF;

  -- Employee-share deductions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='dedlnr') THEN ALTER TABLE employees ADD COLUMN dedlnr numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='dedmed') THEN ALTER TABLE employees ADD COLUMN dedmed numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='dedtax') THEN ALTER TABLE employees ADD COLUMN dedtax numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='dedpag') THEN ALTER TABLE employees ADD COLUMN dedpag numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='netpay') THEN ALTER TABLE employees ADD COLUMN netpay numeric(14,2) DEFAULT 0; END IF;

  -- Government-share deductions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='govtlnr') THEN ALTER TABLE employees ADD COLUMN govtlnr numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='govtecc') THEN ALTER TABLE employees ADD COLUMN govtecc numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='govtmed') THEN ALTER TABLE employees ADD COLUMN govtmed numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='govtpag') THEN ALTER TABLE employees ADD COLUMN govtpag numeric(14,2) DEFAULT 0; END IF;

  -- Codes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='pagcode') THEN ALTER TABLE employees ADD COLUMN pagcode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='taxcode') THEN ALTER TABLE employees ADD COLUMN taxcode text DEFAULT 'ME1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='civilstat') THEN ALTER TABLE employees ADD COLUMN civilstat text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='attend') THEN ALTER TABLE employees ADD COLUMN attend text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='sex') THEN ALTER TABLE employees ADD COLUMN sex text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exposcode') THEN ALTER TABLE employees ADD COLUMN exposcode text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='updcode') THEN ALTER TABLE employees ADD COLUMN updcode text DEFAULT ''; END IF;

  -- Government IDs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='gsis_pn') THEN ALTER TABLE employees ADD COLUMN gsis_pn text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='gsis_id') THEN ALTER TABLE employees ADD COLUMN gsis_id text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='hdmf_id') THEN ALTER TABLE employees ADD COLUMN hdmf_id text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='phic_id') THEN ALTER TABLE employees ADD COLUMN phic_id text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='pib') THEN ALTER TABLE employees ADD COLUMN pib text DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='banker') THEN ALTER TABLE employees ADD COLUMN banker text DEFAULT ''; END IF;

  -- Dates
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='birthdate') THEN ALTER TABLE employees ADD COLUMN birthdate date; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='"update"') THEN ALTER TABLE employees ADD COLUMN "update" date; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='paydate') THEN ALTER TABLE employees ADD COLUMN paydate date; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='hiredate') THEN ALTER TABLE employees ADD COLUMN hiredate date; END IF;

  -- Bonuses & Adjustments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='mid_bonus') THEN ALTER TABLE employees ADD COLUMN mid_bonus numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='mid_cash') THEN ALTER TABLE employees ADD COLUMN mid_cash numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='end_bonus') THEN ALTER TABLE employees ADD COLUMN end_bonus numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='end_cash') THEN ALTER TABLE employees ADD COLUMN end_cash numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='add_bonus') THEN ALTER TABLE employees ADD COLUMN add_bonus numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='taxref') THEN ALTER TABLE employees ADD COLUMN taxref numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='special') THEN ALTER TABLE employees ADD COLUMN special numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='over_wheld') THEN ALTER TABLE employees ADD COLUMN over_wheld numeric(14,2) DEFAULT 0; END IF;

  -- Excess fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exgrade') THEN ALTER TABLE employees ADD COLUMN exgrade integer DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exstep') THEN ALTER TABLE employees ADD COLUMN exstep integer DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exbasic') THEN ALTER TABLE employees ADD COLUMN exbasic numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exlnr') THEN ALTER TABLE employees ADD COLUMN exlnr numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exmed') THEN ALTER TABLE employees ADD COLUMN exmed numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='expag') THEN ALTER TABLE employees ADD COLUMN expag numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='extax') THEN ALTER TABLE employees ADD COLUMN extax numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exglnr') THEN ALTER TABLE employees ADD COLUMN exglnr numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exgmed') THEN ALTER TABLE employees ADD COLUMN exgmed numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exgpag') THEN ALTER TABLE employees ADD COLUMN exgpag numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='exgecc') THEN ALTER TABLE employees ADD COLUMN exgecc numeric(14,2) DEFAULT 0; END IF;

  -- Difference fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='saldiff') THEN ALTER TABLE employees ADD COLUMN saldiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='lnrdiff') THEN ALTER TABLE employees ADD COLUMN lnrdiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='meddiff') THEN ALTER TABLE employees ADD COLUMN meddiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='pagdiff') THEN ALTER TABLE employees ADD COLUMN pagdiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='taxdiff') THEN ALTER TABLE employees ADD COLUMN taxdiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='glnrdiff') THEN ALTER TABLE employees ADD COLUMN glnrdiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='gmeddiff') THEN ALTER TABLE employees ADD COLUMN gmeddiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='gpagdiff') THEN ALTER TABLE employees ADD COLUMN gpagdiff numeric(14,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='geccdiff') THEN ALTER TABLE employees ADD COLUMN geccdiff numeric(14,2) DEFAULT 0; END IF;

  -- Metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='editor') THEN ALTER TABLE employees ADD COLUMN editor text DEFAULT ''; END IF;
END $$;

-- Migrate existing data from old columns to new masterfile columns
UPDATE employees SET
  empno = COALESCE(NULLIF(empno, ''), employee_number),
  fname = COALESCE(NULLIF(fname, ''), first_name),
  lname = COALESCE(NULLIF(lname, ''), last_name),
  mi = COALESCE(NULLIF(mi, ''), LEFT(middle_name, 1)),
  poscode = COALESCE(NULLIF(poscode, ''), position),
  basic = COALESCE(NULLIF(basic, 0), basic_salary),
  banker = COALESCE(NULLIF(banker, ''), bank_name),
  account = COALESCE(NULLIF(account, ''), bank_account),
  hiredate = COALESCE(hiredate, hire_date),
  phic_id = COALESCE(NULLIF(phic_id, ''), philhealth_number),
  hdmf_id = COALESCE(NULLIF(hdmf_id, ''), pagibig_number),
  taxcode = COALESCE(NULLIF(taxcode, ''), tax_status)
WHERE employee_number IS NOT NULL;
