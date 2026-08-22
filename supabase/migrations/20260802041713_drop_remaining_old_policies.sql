-- Drop remaining old permissive policies on salary_schedule
DROP POLICY IF EXISTS "select_salary_schedule" ON salary_schedule;
DROP POLICY IF EXISTS "insert_salary_schedule" ON salary_schedule;
DROP POLICY IF EXISTS "update_salary_schedule" ON salary_schedule;
DROP POLICY IF EXISTS "delete_salary_schedule" ON salary_schedule;

-- Also check for any remaining old policies on other tables
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'employees', 'payroll_groups', 'pay_periods', 'payroll_entries',
        'earnings', 'deductions', 'payroll_deductions', 'deduction_codes',
        'salary_schedule', 'undeducted_obligations', 'stacode_audit'
      )
      AND policyname NOT LIKE 'employees_%'
      AND policyname NOT LIKE 'payroll_groups_%'
      AND policyname NOT LIKE 'pay_periods_%'
      AND policyname NOT LIKE 'payroll_entries_%'
      AND policyname NOT LIKE 'earnings_%'
      AND policyname NOT LIKE 'deductions_%'
      AND policyname NOT LIKE 'payroll_deductions_%'
      AND policyname NOT LIKE 'deduction_codes_%'
      AND policyname NOT LIKE 'salary_schedule_%'
      AND policyname NOT LIKE 'undeducted_obligations_%'
      AND policyname NOT LIKE 'stacode_audit_%'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;
