-- CA Payroll: persist the school STACODE on each CA employee so the category
-- (Payroll Breakdown) can be derived in the app: STACODE 001–499 → Elementary,
-- STACODE 500–701 → Secondary. Idempotent — safe to re-run.
ALTER TABLE ca_employees
  ADD COLUMN IF NOT EXISTS stacode text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ca_emp_stacode ON ca_employees (stacode);
