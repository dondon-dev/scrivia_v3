/*
# Expand Undeducted Obligations + Payroll Entries for DepEd APDS Engine

## Purpose
The Undeducted Obligations Report (per DepEd Order No. 05, s. 2018) requires
StationCode and ScheduledAmount fields. The payroll_entries table needs a
full mandatory-deduction breakdown (GSIS policy loan, GSIS emergency loan,
Pag-IBIG MPL, Pag-IBIG calamity loan, hazard pay, salary differential, other
compensation, other earnings) to match the 8-step computation sequence.

## Changes

### 1. undeducted_obligations — new columns
- `station_code` (text, nullable) — employee's station code for the report
- `scheduled_amount` (numeric, default 0) — the full scheduled deduction amount
  (before NTHP reduction). The existing `undeducted_amount` column holds the
  portion that could not be deducted.

### 2. payroll_entries — new columns
- `gsis_policy_loan` (numeric, default 0) — GSIS policy loan deduction
- `gsis_emergency_loan` (numeric, default 0) — GSIS emergency loan deduction
- `pagibig_mpl` (numeric, default 0) — Pag-IBIG mandatory provident loan
- `pagibig_calamity_loan` (numeric, default 0) — Pag-IBIG calamity loan
- `hazard_pay` (numeric, default 0) — hazard pay component of gross
- `salary_differential` (numeric, default 0) — salary differential
- `other_compensation` (numeric, default 0) — other compensation
- `other_earnings` (numeric, default 0) — other earnings
- `available_balance` (numeric, default 0) — gross minus mandatory deductions
- `mandatory_deductions` (numeric, default 0) — sum of all mandatory deductions
- `loan_deduction_capacity` (numeric, default 0) — available balance minus NTHP threshold

## Security
No security changes. All existing RLS policies remain in effect.
All new columns are additive — no data loss.
*/

ALTER TABLE undeducted_obligations
  ADD COLUMN IF NOT EXISTS station_code text,
  ADD COLUMN IF NOT EXISTS scheduled_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS gsis_policy_loan numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gsis_emergency_loan numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagibig_mpl numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagibig_calamity_loan numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hazard_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_differential numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_compensation numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_earnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mandatory_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_deduction_capacity numeric NOT NULL DEFAULT 0;
