-- CA Payroll: payroll-breakdown category for the employee masterfile.
-- The Organization module (schools directory) is NOT an employee source — it only
-- defines the payroll breakdown:
--   Elementary     = STACODE 001–449
--   Secondary      = STACODE 500–701
--   Non-Plantilla  = sourced from non_plantilla_employees
ALTER TABLE ca_employees
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT ''
  CHECK (category IN ('', 'Elementary', 'Secondary', 'Non-Plantilla'));

CREATE INDEX IF NOT EXISTS idx_ca_emp_category ON ca_employees (category);
