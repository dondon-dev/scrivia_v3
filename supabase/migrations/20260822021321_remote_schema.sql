set local check_function_bodies = off;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_payroll_period' AND proargtypes::text[] <@ '{uuid}'::text[]) THEN
    REVOKE ALL ON FUNCTION public.reverse_payroll_period(uuid) FROM public;
  END IF;
END $$;

