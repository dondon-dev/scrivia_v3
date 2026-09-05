-- Add per-deduction breakdown columns to payroll_entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='dedlnr') THEN
    ALTER TABLE payroll_entries ADD COLUMN dedlnr numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='dedmed') THEN
    ALTER TABLE payroll_entries ADD COLUMN dedmed numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='dedpag') THEN
    ALTER TABLE payroll_entries ADD COLUMN dedpag numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='dedtax') THEN
    ALTER TABLE payroll_entries ADD COLUMN dedtax numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='govtlnr') THEN
    ALTER TABLE payroll_entries ADD COLUMN govtlnr numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='govtecc') THEN
    ALTER TABLE payroll_entries ADD COLUMN govtecc numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='govtmed') THEN
    ALTER TABLE payroll_entries ADD COLUMN govtmed numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='govtpag') THEN
    ALTER TABLE payroll_entries ADD COLUMN govtpag numeric(14,2) DEFAULT 0;
  END IF;
END $$;