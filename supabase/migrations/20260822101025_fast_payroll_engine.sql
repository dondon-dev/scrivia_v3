/*
  NOTE: The statement_timeout and _active_deds optimizations from this migration
  have been folded into the base migration (20260819101020_run_payroll_engine.sql)
  to avoid broken partial patches. This file is kept as a no-op for migration
  history compatibility.
*/
DO $$ BEGIN
  RAISE NOTICE 'fast_payroll_engine: optimizations already in base migration, skipping';
END $$;
