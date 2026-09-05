/*
# Add unique constraint on pay_periods.period_name

Allows upserting pay periods by period_name during Smart Import forwarding.
Without this, forwarding PAYROLLS.DBF data into pay_periods could create
duplicate period rows. No existing duplicates exist (verified).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'pay_periods' AND con.conname = 'pay_periods_period_name_key'
  ) THEN
    ALTER TABLE pay_periods ADD CONSTRAINT pay_periods_period_name_key UNIQUE (period_name);
  END IF;
END $$;
