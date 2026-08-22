-- ══════════════════════════════════════════════════════════════════════════════
-- DIVISION-SCOPED ROW-LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════
-- Every table that carries regcode/divcode now enforces:
--   - Users see only their own division's data
--   - super_admin sees everything
--   - Data writers can only INSERT/UPDATE rows matching their scope
--   - Uploaded DBF records are stamped with the uploader's scope
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add scope columns to profiles ───────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS regcode text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS divcode text;

-- Backfill from divisions table if division_id is set
UPDATE profiles p
   SET regcode = r.region_code,
       divcode = d.division_code
  FROM divisions d
  JOIN regions r ON d.region_id = r.id
 WHERE p.division_id = d.id
   AND p.regcode IS NULL;

-- ── 2. Scope helper functions ───────────────────────────────────────────────

-- Returns the current user's REGCODE (or NULL for super_admin with no assignment)
CREATE OR REPLACE FUNCTION public.get_current_user_regcode()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT regcode FROM profiles WHERE id = auth.uid();
$function$;

-- Returns the current user's DIVCODE (or NULL for super_admin with no assignment)
CREATE OR REPLACE FUNCTION public.get_current_user_divcode()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT divcode FROM profiles WHERE id = auth.uid();
$function$;

-- Returns true if the user is super_admin (sees everything)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT get_current_user_role() = 'super_admin';
$function$;

-- Core scoping predicate: pass row's regcode+divcode, returns true if user may see it
-- super_admin sees all; everyone else must match their own regcode+divcode
CREATE OR REPLACE FUNCTION public.user_can_see_row(p_regcode text, p_divcode text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    is_super_admin()
    OR (
      get_current_user_regcode() IS NOT NULL
      AND get_current_user_divcode() IS NOT NULL
      AND p_regcode = get_current_user_regcode()
      AND p_divcode = get_current_user_divcode()
    );
$function$;

-- For INSERT: data writers can insert into their own division
CREATE OR REPLACE FUNCTION public.user_can_write_row(p_regcode text, p_divcode text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    is_super_admin()
    OR (
      is_data_writer()
      AND get_current_user_regcode() IS NOT NULL
      AND get_current_user_divcode() IS NOT NULL
      AND p_regcode = get_current_user_regcode()
      AND p_divcode = get_current_user_divcode()
    );
$function$;

-- ── 3. Drop ALL existing permissive policies on scoped tables ──────────────

-- Ensure scope columns exist on all DBF tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dbf_included','dbf_excluded','dbf_payrolls','dbf_pyent','dbf_pyent1','dbf_pyent2',
    'dbf_stntable','dbf_divtable','dbf_sync_sessions','payroll_deductions','payroll_entries',
    'payent','earnings','deductions','payrolls_dbf','dashboard_stats_cache',
    'undeducted_obligations','pay_periods'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS regcode text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS divcode text', t);
  END LOOP;
END
$$;

-- DBF tables
DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'dbf_stntable','dbf_divtable','dbf_included','dbf_excluded',
    'dbf_payrolls','dbf_pyent','dbf_pyent1','dbf_pyent2'
  ]) LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- Core payroll tables
DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'employees','payroll_deductions','payroll_entries','payent',
    'pay_periods','deductions','undeducted_obligations','earnings',
    'payrolls_dbf','dashboard_stats_cache'
  ]) LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- ── 4. Create scoped policies for DBF tables ───────────────────────────────

-- Pattern: every DBF table has regcode+divcode columns

-- dbf_stntable
CREATE POLICY dbf_stn_select ON dbf_stntable FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_stn_insert ON dbf_stntable FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_stn_update ON dbf_stntable FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_stn_delete ON dbf_stntable FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_divtable
CREATE POLICY dbf_div_select ON dbf_divtable FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_div_insert ON dbf_divtable FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_div_update ON dbf_divtable FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_div_delete ON dbf_divtable FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_included
CREATE POLICY dbf_inc_select ON dbf_included FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_inc_insert ON dbf_included FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_inc_update ON dbf_included FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_inc_delete ON dbf_included FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_excluded
CREATE POLICY dbf_exc_select ON dbf_excluded FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_exc_insert ON dbf_excluded FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_exc_update ON dbf_excluded FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_exc_delete ON dbf_excluded FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_payrolls
CREATE POLICY dbf_pay_select ON dbf_payrolls FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_pay_insert ON dbf_payrolls FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pay_update ON dbf_payrolls FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pay_delete ON dbf_payrolls FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_pyent
CREATE POLICY dbf_pye_select ON dbf_pyent FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_pye_insert ON dbf_pyent FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye_update ON dbf_pyent FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye_delete ON dbf_pyent FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_pyent1
CREATE POLICY dbf_pye1_select ON dbf_pyent1 FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_pye1_insert ON dbf_pyent1 FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye1_update ON dbf_pyent1 FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye1_delete ON dbf_pyent1 FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dbf_pyent2
CREATE POLICY dbf_pye2_select ON dbf_pyent2 FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY dbf_pye2_insert ON dbf_pyent2 FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye2_update ON dbf_pyent2 FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY dbf_pye2_delete ON dbf_pyent2 FOR DELETE USING (user_can_see_row(regcode, divcode));

-- ── 5. Scoped policies for core payroll tables ──────────────────────────────

-- employees (has regcode+divcode)
CREATE POLICY employees_select ON employees FOR SELECT USING (
  user_can_see_row(regcode, divcode)
  OR (get_current_user_role() = 'ess' AND (empno = get_current_user_empno() OR employee_number = get_current_user_empno()))
  OR (get_current_user_role() IN ('school_coordinator','school_head') AND stacode = get_current_user_stacode())
);
CREATE POLICY employees_insert ON employees FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY employees_update ON employees FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY employees_delete ON employees FOR DELETE USING (user_can_see_row(regcode, divcode));

-- payroll_deductions (has regcode+divcode via employee join)
CREATE POLICY pd_select ON payroll_deductions FOR SELECT USING (
  user_can_see_row(regcode, divcode)
  OR (get_current_user_role() = 'ess' AND empno = get_current_user_empno())
  OR (get_current_user_role() IN ('school_coordinator','school_head') AND stacode = get_current_user_stacode())
);
CREATE POLICY pd_insert ON payroll_deductions FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pd_update ON payroll_deductions FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pd_delete ON payroll_deductions FOR DELETE USING (user_can_see_row(regcode, divcode));

-- payroll_entries (scope via employee)
CREATE POLICY pe_select ON payroll_entries FOR SELECT USING (
  user_can_see_row(
    (SELECT e.regcode FROM employees e WHERE e.id = payroll_entries.employee_id),
    (SELECT e.divcode FROM employees e WHERE e.id = payroll_entries.employee_id)
  )
);
CREATE POLICY pe_insert ON payroll_entries FOR INSERT WITH CHECK (
  user_can_write_row(
    (SELECT e.regcode FROM employees e WHERE e.id = employee_id),
    (SELECT e.divcode FROM employees e WHERE e.id = employee_id)
  )
);
CREATE POLICY pe_update ON payroll_entries FOR UPDATE USING (
  user_can_see_row(
    (SELECT e.regcode FROM employees e WHERE e.id = payroll_entries.employee_id),
    (SELECT e.divcode FROM employees e WHERE e.id = payroll_entries.employee_id)
  )
) WITH CHECK (
  user_can_write_row(
    (SELECT e.regcode FROM employees e WHERE e.id = employee_id),
    (SELECT e.divcode FROM employees e WHERE e.id = employee_id)
  )
);
CREATE POLICY pe_delete ON payroll_entries FOR DELETE USING (
  user_can_see_row(
    (SELECT e.regcode FROM employees e WHERE e.id = payroll_entries.employee_id),
    (SELECT e.divcode FROM employees e WHERE e.id = payroll_entries.employee_id)
  )
);

-- deductions (has regcode+divcode)
CREATE POLICY ded_select ON deductions FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY ded_insert ON deductions FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY ded_update ON deductions FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY ded_delete ON deductions FOR DELETE USING (user_can_see_row(regcode, divcode));

-- undeducted_obligations (has regcode+divcode)
CREATE POLICY unded_select ON undeducted_obligations FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY unded_insert ON undeducted_obligations FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY unded_update ON undeducted_obligations FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY unded_delete ON undeducted_obligations FOR DELETE USING (user_can_see_row(regcode, divcode));

-- earnings (has regcode+divcode)
CREATE POLICY earn_select ON earnings FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY earn_insert ON earnings FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY earn_update ON earnings FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY earn_delete ON earnings FOR DELETE USING (user_can_see_row(regcode, divcode));

-- payent (has regcode+divcode)
CREATE POLICY payent_select ON payent FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY payent_insert ON payent FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY payent_update ON payent FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY payent_delete ON payent FOR DELETE USING (user_can_see_row(regcode, divcode));

-- pay_periods (has regcode+divcode)
CREATE POLICY pp_select ON pay_periods FOR SELECT USING (
  user_can_see_row(regcode, divcode)
  OR get_current_user_role() = 'super_admin'
);
CREATE POLICY pp_insert ON pay_periods FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pp_update ON pay_periods FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pp_delete ON pay_periods FOR DELETE USING (
  user_can_see_row(regcode, divcode)
  OR get_current_user_role() = 'super_admin'
);

-- payrolls_dbf (has regcode+divcode)
CREATE POLICY pdbf_select ON payrolls_dbf FOR SELECT USING (user_can_see_row(regcode, divcode));
CREATE POLICY pdbf_insert ON payrolls_dbf FOR INSERT WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pdbf_update ON payrolls_dbf FOR UPDATE USING (user_can_see_row(regcode, divcode)) WITH CHECK (user_can_write_row(regcode, divcode));
CREATE POLICY pdbf_delete ON payrolls_dbf FOR DELETE USING (user_can_see_row(regcode, divcode));

-- dashboard_stats_cache (super_admin only for global stats; per-division stats via RPC)
CREATE POLICY dsc_select ON dashboard_stats_cache FOR SELECT USING (is_super_admin());
CREATE POLICY dsc_insert ON dashboard_stats_cache FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY dsc_update ON dashboard_stats_cache FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY dsc_delete ON dashboard_stats_cache FOR DELETE USING (is_super_admin());

-- ── 6. Profiles: keep existing + allow super_admin to manage ────────────────
-- (profiles policies were not dropped — they remain as-is)

-- ── 7. Sync session metadata (dbf_sync_sessions) — scope by uploader ──────
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'dbf_sync_sessions' AND schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, 'dbf_sync_sessions');
  END LOOP;
END $$;

CREATE POLICY sync_sessions_select ON dbf_sync_sessions FOR SELECT USING (
  is_super_admin() OR performed_by = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY sync_sessions_insert ON dbf_sync_sessions FOR INSERT WITH CHECK (is_data_writer());
CREATE POLICY sync_sessions_delete ON dbf_sync_sessions FOR DELETE USING (
  is_super_admin() OR performed_by = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- ── 8. Grant scope functions to authenticated ───────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_current_user_regcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_divcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_see_row(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_row(text, text) TO authenticated;

-- ── 9. Ensure all scoped tables have FORCE RLS ─────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'dbf_stntable','dbf_divtable','dbf_included','dbf_excluded',
    'dbf_payrolls','dbf_pyent','dbf_pyent1','dbf_pyent2',
    'employees','payroll_deductions','payroll_entries','payent',
    'pay_periods','deductions','undeducted_obligations','earnings',
    'payrolls_dbf','dashboard_stats_cache','dbf_sync_sessions'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
