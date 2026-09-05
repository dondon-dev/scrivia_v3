-- CA Payroll: persist the school STACODE on each CA employee.
-- Idempotent — skips if ca_employees table does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_employees') THEN
    ALTER TABLE ca_employees
      ADD COLUMN IF NOT EXISTS stacode text NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_ca_emp_stacode ON ca_employees (stacode);
  END IF;
END$$;
