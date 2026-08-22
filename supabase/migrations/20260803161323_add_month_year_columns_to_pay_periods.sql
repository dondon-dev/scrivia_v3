/*
# Monthly Payroll Periods — Step 1: Add columns + backfill

Adds month, year, period_number columns to pay_periods and backfills them
from start_date. The closed-period protection trigger is temporarily disabled
during the backfill since we are only adding metadata, not changing status.
*/

-- 1. Add columns
ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS month int;
ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS period_number int;

-- 2. Temporarily disable the closed-period protection trigger for the backfill
ALTER TABLE pay_periods DISABLE TRIGGER trg_protect_closed_periods;

-- 3. Backfill from start_date
UPDATE pay_periods
SET month = EXTRACT(MONTH FROM start_date)::int,
    year = EXTRACT(YEAR FROM start_date)::int,
    period_number = EXTRACT(MONTH FROM start_date)::int
WHERE month IS NULL;

-- 4. Re-enable the trigger
ALTER TABLE pay_periods ENABLE TRIGGER trg_protect_closed_periods;
