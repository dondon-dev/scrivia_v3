set local check_function_bodies = off;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_payroll_period' AND proargtypes::text[] <@ '{uuid}'::text[]) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reverse_payroll_period(uuid) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reverse_payroll_period(uuid) TO anon';
  END IF;
END
$$;

