/*
# Restrict Payroll Tables to Authenticated Users

## Overview
Now that the application has a full authentication system, the payroll data
tables must no longer be accessible by the anonymous (unauthenticated) role.
All CRUD operations now require an authenticated session.

## Changes
For each of the following tables, the 4 existing anon+authenticated policies
are dropped and replaced with authenticated-only equivalents:
- employees
- payroll_groups
- pay_periods
- payroll_entries
- earnings
- deductions
- payroll_deductions
- deduction_codes
- salary_schedule
- undeducted_obligations
- stacode_audit

## Security
- All policies now use `TO authenticated` instead of `TO anon, authenticated`.
- Using (true) is retained because within an authenticated session, all
  authenticated payroll users share access to payroll data — row-level
  isolation is not needed (roles are enforced in the application layer).
- The `anon` role retains NO access to any payroll data table.
*/

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'employees', 'payroll_groups', 'pay_periods', 'payroll_entries',
    'earnings', 'deductions', 'payroll_deductions', 'deduction_codes',
    'salary_schedule', 'undeducted_obligations', 'stacode_audit'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %s;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %s;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %s;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %s;', tbl, tbl);

    EXECUTE format('CREATE POLICY "auth_select_%s" ON %s FOR SELECT TO authenticated USING (true);', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth_insert_%s" ON %s FOR INSERT TO authenticated WITH CHECK (true);', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth_update_%s" ON %s FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth_delete_%s" ON %s FOR DELETE TO authenticated USING (true);', tbl, tbl);
  END LOOP;
END $$;

-- Revoke anon privileges on all payroll tables
REVOKE ALL ON employees FROM anon;
REVOKE ALL ON payroll_groups FROM anon;
REVOKE ALL ON pay_periods FROM anon;
REVOKE ALL ON payroll_entries FROM anon;
REVOKE ALL ON earnings FROM anon;
REVOKE ALL ON deductions FROM anon;
REVOKE ALL ON payroll_deductions FROM anon;
REVOKE ALL ON deduction_codes FROM anon;
REVOKE ALL ON salary_schedule FROM anon;
REVOKE ALL ON undeducted_obligations FROM anon;
REVOKE ALL ON stacode_audit FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pay_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON earnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON deductions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_deductions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON deduction_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON salary_schedule TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON undeducted_obligations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stacode_audit TO authenticated;
