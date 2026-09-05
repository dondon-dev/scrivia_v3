-- Test wrapper: SECURITY DEFINER bypasses RLS/auth
CREATE OR REPLACE FUNCTION test_bypass_payroll(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE r jsonb;
BEGIN
  SELECT run_payroll_engine(p_period_id) INTO r;
  RETURN r;
END;
$$;
