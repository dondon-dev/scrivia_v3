-- CA Payroll: payroll-breakdown category for the employee masterfile.
-- Idempotent — skips if ca_employees table does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_employees') THEN
    ALTER TABLE ca_employees
      ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT ''
      CHECK (category IN ('', 'Elementary', 'Secondary', 'Non-Plantilla'));
    CREATE INDEX IF NOT EXISTS idx_ca_emp_category ON ca_employees (category);
  END IF;
END$$;
