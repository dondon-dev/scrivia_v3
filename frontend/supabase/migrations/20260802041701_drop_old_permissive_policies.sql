-- Drop all old permissive policies that were not removed by the security hardening migration.
-- These old auth_* and anon_* policies used USING(true)/WITH CHECK(true) and override
-- the new role-based policies.

DO $$
DECLARE
  r record;
BEGIN
  -- Drop all auth_* policies on payroll tables
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'auth_%'
      AND tablename IN (
        'employees', 'payroll_groups', 'pay_periods', 'payroll_entries',
        'earnings', 'deductions', 'payroll_deductions', 'deduction_codes',
        'salary_schedule', 'undeducted_obligations', 'stacode_audit'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;

  -- Drop all anon_* policies on payroll tables
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'anon_%'
      AND tablename IN (
        'employees', 'payroll_groups', 'pay_periods', 'payroll_entries',
        'earnings', 'deductions', 'payroll_deductions', 'deduction_codes',
        'salary_schedule', 'undeducted_obligations', 'stacode_audit'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;
