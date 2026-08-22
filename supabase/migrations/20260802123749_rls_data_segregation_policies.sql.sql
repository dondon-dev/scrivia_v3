/*
# Enterprise Data Segregation — Role-Aware RLS Policies

## Purpose
Replaces all permissive `USING (true)` SELECT policies on payroll tables with
role-aware filters that enforce STACODE and EMPNO-based data segregation.
Previously ANY authenticated user could read ALL payroll data. Now access is scoped by role:

- super_admin, payroll_admin, payroll_processor, accounting_officer,
  hr_administrator, division_finance, auditor, read_only → ALL stacodes
- school_coordinator, school_head → only their assigned_stacode
- ess → only their own employee_number / empno

## New Functions
- `get_current_user_stacode()` → returns the user's assigned_stacode from profiles
- `get_current_user_empno()` → returns the user's employee_number from profiles
- `is_data_admin()` → true if the user's role can see all stacodes
- `is_data_writer()` → true if the user's role can modify payroll data

## Tables Modified (RLS policies replaced)
- employees, payroll_entries, payroll_deductions, deductions, earnings
- pay_periods, payroll_groups, salary_schedule, deduction_codes
- stacode_audit, undeducted_obligations
- dbf_divtable, dbf_excluded, dbf_included, dbf_payrolls, dbf_pyent,
  dbf_pyent1, dbf_pyent2, dbf_stntable, dbf_sync_sessions, payrolls_dbf
*/

-- ── Helper functions ──

CREATE OR REPLACE FUNCTION public.get_current_user_stacode()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_empno()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_data_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT get_current_user_role() IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'accounting_officer', 'hr_administrator',
    'division_finance', 'auditor', 'read_only'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_data_writer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT get_current_user_role() IN (
    'super_admin', 'payroll_admin', 'payroll_processor', 'hr_administrator'
  );
$$;

-- ── Drop all existing policies on target tables ──
DO $$
DECLARE t text; r record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'employees', 'payroll_entries', 'payroll_deductions', 'deductions', 'earnings',
    'pay_periods', 'payroll_groups', 'salary_schedule', 'deduction_codes',
    'stacode_audit', 'undeducted_obligations',
    'dbf_divtable', 'dbf_excluded', 'dbf_included', 'dbf_payrolls',
    'dbf_pyent', 'dbf_pyent1', 'dbf_pyent2', 'dbf_stntable',
    'dbf_sync_sessions', 'payrolls_dbf'
  ])
  LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ── EMPLOYEES table ──

CREATE POLICY "employees_select" ON employees FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND stacode = get_current_user_stacode()
    )
    OR (
      get_current_user_role() = 'ess'
      AND (empno = get_current_user_empno() OR employee_number = get_current_user_empno())
    )
  );

CREATE POLICY "employees_insert" ON employees FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "employees_update" ON employees FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "employees_delete" ON employees FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── PAYROLL_ENTRIES table ──

CREATE POLICY "payroll_entries_select" ON payroll_entries FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = payroll_entries.employee_id
        AND e.stacode = get_current_user_stacode()
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = payroll_entries.employee_id
        AND (e.empno = get_current_user_empno() OR e.employee_number = get_current_user_empno())
      )
    )
  );

CREATE POLICY "payroll_entries_insert" ON payroll_entries FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "payroll_entries_update" ON payroll_entries FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "payroll_entries_delete" ON payroll_entries FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── PAYROLL_DEDUCTIONS table ──

CREATE POLICY "payroll_deductions_select" ON payroll_deductions FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND (
        empno = get_current_user_empno()
        OR EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = payroll_deductions.employee_id
          AND e.stacode = get_current_user_stacode()
        )
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND empno = get_current_user_empno()
    )
  );

CREATE POLICY "payroll_deductions_insert" ON payroll_deductions FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "payroll_deductions_update" ON payroll_deductions FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "payroll_deductions_delete" ON payroll_deductions FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── DEDUCTIONS table ──

CREATE POLICY "deductions_select" ON deductions FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = deductions.employee_id
        AND e.stacode = get_current_user_stacode()
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = deductions.employee_id
        AND (e.empno = get_current_user_empno() OR e.employee_number = get_current_user_empno())
      )
    )
  );

CREATE POLICY "deductions_insert" ON deductions FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "deductions_update" ON deductions FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "deductions_delete" ON deductions FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── EARNINGS table ──

CREATE POLICY "earnings_select" ON earnings FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = earnings.employee_id
        AND e.stacode = get_current_user_stacode()
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = earnings.employee_id
        AND (e.empno = get_current_user_empno() OR e.employee_number = get_current_user_empno())
      )
    )
  );

CREATE POLICY "earnings_insert" ON earnings FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "earnings_update" ON earnings FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "earnings_delete" ON earnings FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── PAY_PERIODS table (reference metadata — all authenticated can read) ──

CREATE POLICY "pay_periods_select" ON pay_periods FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "pay_periods_insert" ON pay_periods FOR INSERT
  TO authenticated WITH CHECK (get_current_user_role() IN ('super_admin', 'payroll_admin'));

CREATE POLICY "pay_periods_update" ON pay_periods FOR UPDATE
  TO authenticated USING (get_current_user_role() IN ('super_admin', 'payroll_admin'))
  WITH CHECK (get_current_user_role() IN ('super_admin', 'payroll_admin'));

CREATE POLICY "pay_periods_delete" ON pay_periods FOR DELETE
  TO authenticated USING (get_current_user_role() = 'super_admin');

-- ── PAYROLL_GROUPS table (reference metadata) ──

CREATE POLICY "payroll_groups_select" ON payroll_groups FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "payroll_groups_insert" ON payroll_groups FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "payroll_groups_update" ON payroll_groups FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "payroll_groups_delete" ON payroll_groups FOR DELETE
  TO authenticated USING (get_current_user_role() = 'super_admin');

-- ── SALARY_SCHEDULE table (reference data) ──

CREATE POLICY "salary_schedule_select" ON salary_schedule FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "salary_schedule_insert" ON salary_schedule FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "salary_schedule_update" ON salary_schedule FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "salary_schedule_delete" ON salary_schedule FOR DELETE
  TO authenticated USING (get_current_user_role() = 'super_admin');

-- ── DEDUCTION_CODES table (reference data) ──

CREATE POLICY "deduction_codes_select" ON deduction_codes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "deduction_codes_insert" ON deduction_codes FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "deduction_codes_update" ON deduction_codes FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "deduction_codes_delete" ON deduction_codes FOR DELETE
  TO authenticated USING (get_current_user_role() = 'super_admin');

-- ── STACODE_AUDIT table (admin/auditor only) ──

CREATE POLICY "stacode_audit_select" ON stacode_audit FOR SELECT
  TO authenticated USING (get_current_user_role() IN ('super_admin', 'auditor', 'division_finance'));

CREATE POLICY "stacode_audit_insert" ON stacode_audit FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

-- ── UNDEDUCTED_OBLIGATIONS table ──

CREATE POLICY "undeducted_obligations_select" ON undeducted_obligations FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = undeducted_obligations.employee_id
        AND e.stacode = get_current_user_stacode()
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = undeducted_obligations.employee_id
        AND (e.empno = get_current_user_empno() OR e.employee_number = get_current_user_empno())
      )
    )
  );

CREATE POLICY "undeducted_obligations_insert" ON undeducted_obligations FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "undeducted_obligations_update" ON undeducted_obligations FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "undeducted_obligations_delete" ON undeducted_obligations FOR DELETE
  TO authenticated USING (is_data_writer());

-- ── DBF TABLES — admin/processor only ──

CREATE POLICY "dbf_div_select" ON dbf_divtable FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_div_insert" ON dbf_divtable FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_div_update" ON dbf_divtable FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_div_delete" ON dbf_divtable FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_exc_select" ON dbf_excluded FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_exc_insert" ON dbf_excluded FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_exc_update" ON dbf_excluded FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_exc_delete" ON dbf_excluded FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_inc_select" ON dbf_included FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_inc_insert" ON dbf_included FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_inc_update" ON dbf_included FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_inc_delete" ON dbf_included FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_pay_select" ON dbf_payrolls FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_pay_insert" ON dbf_payrolls FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pay_update" ON dbf_payrolls FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pay_delete" ON dbf_payrolls FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_pye_select" ON dbf_pyent FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_pye_insert" ON dbf_pyent FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye_update" ON dbf_pyent FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye_delete" ON dbf_pyent FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_pye1_select" ON dbf_pyent1 FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_pye1_insert" ON dbf_pyent1 FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye1_update" ON dbf_pyent1 FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye1_delete" ON dbf_pyent1 FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_pye2_select" ON dbf_pyent2 FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_pye2_insert" ON dbf_pyent2 FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye2_update" ON dbf_pyent2 FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_pye2_delete" ON dbf_pyent2 FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_stn_select" ON dbf_stntable FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_stn_insert" ON dbf_stntable FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_stn_update" ON dbf_stntable FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_stn_delete" ON dbf_stntable FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "dbf_sync_select" ON dbf_sync_sessions FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "dbf_sync_insert" ON dbf_sync_sessions FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "dbf_sync_update" ON dbf_sync_sessions FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "dbf_sync_delete" ON dbf_sync_sessions FOR DELETE TO authenticated USING (is_data_writer());

CREATE POLICY "pdbf_select" ON payrolls_dbf FOR SELECT TO authenticated USING (is_data_writer());
CREATE POLICY "pdbf_insert" ON payrolls_dbf FOR INSERT TO authenticated WITH CHECK (is_data_writer());
CREATE POLICY "pdbf_update" ON payrolls_dbf FOR UPDATE TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());
CREATE POLICY "pdbf_delete" ON payrolls_dbf FOR DELETE TO authenticated USING (is_data_writer());
