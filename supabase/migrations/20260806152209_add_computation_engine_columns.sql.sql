/*
# Add Payroll Computation Engine Columns

## Purpose
Support the DepEd Initial Payroll Computation Engine which automatically computes
gross salary, PERA, GSIS, PhilHealth, Pag-IBIG, TRAIN Law withholding tax, and net pay
for permanent employees, grouped by ELEM / JHS / SHS based on STACODE.

## Changes to initial_payroll_entries
New columns:
- stacode (text) — Station code for grouping (ELEM 001-499, JHS 500-699, SHS 700-701)
- effectivity_date (date) — Date the salary is effective
- calendar_days (numeric, default 22) — Calendar days in the pay period (used for gross proration)
- additional_adjustments (numeric, default 0) — Additional earnings/adjustments added to net
- adjustment_deductions (numeric, default 0) — Adjustment deductions subtracted from net
- annual_income (numeric, default 0) — Computed annual income (monthly x 12)
- annual_deductions (numeric, default 0) — Computed annual deductions
- taxable_income (numeric, default 0) — Computed taxable income
- annual_tax (numeric, default 0) — Computed annual TRAIN Law withholding tax
- amount_due (numeric, default 0) — Gross + PERA - Total Deductions
- total_due (numeric, default 0) — Amount Due + Additional Adjustments - Adjustment Deductions
- school_group (text) — Computed group: 'ELEM', 'JHS', 'SHS'

## Security
- No new tables; existing RLS policies on initial_payroll_entries cover the new columns.
*/

ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS stacode text;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS effectivity_date date;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS calendar_days numeric(5,1) NOT NULL DEFAULT 22;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS additional_adjustments numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS adjustment_deductions numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS annual_income numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS annual_deductions numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS taxable_income numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS annual_tax numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS amount_due numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS total_due numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE initial_payroll_entries
  ADD COLUMN IF NOT EXISTS school_group text;

CREATE INDEX IF NOT EXISTS idx_ip_entries_stacode ON initial_payroll_entries (stacode);
CREATE INDEX IF NOT EXISTS idx_ip_entries_school_group ON initial_payroll_entries (school_group);
