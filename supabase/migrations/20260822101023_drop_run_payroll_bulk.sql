/*
# Drop run_payroll_bulk — run_payroll_engine is the only engine

run_payroll_bulk(uuid, jsonb, jsonb, jsonb) is the superseded bulk engine
from 20260817/20260818. The app has called run_payroll_engine(uuid) since
20260819 (which also writes itemized deduction lines for the reports), and
the cleanup migration 20260819130000 already intended to drop it — but it was
never applied to the live project, so the dead function is still present.

Dropping it guarantees there is exactly one payroll engine and no code path
can accidentally land on the older (unoptimized) implementation.

## Security
- Function is SECURITY DEFINER; dropping it removes its grants too.
- No tables / policies touched. run_payroll_engine is unchanged.
*/

DROP FUNCTION IF EXISTS public.run_payroll_bulk(uuid, jsonb, jsonb, jsonb);

-- Sanity: the current engine must exist and stay untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'run_payroll_engine'
  ) THEN
    RAISE EXCEPTION 'run_payroll_engine missing after cleanup';
  END IF;
END $$;
