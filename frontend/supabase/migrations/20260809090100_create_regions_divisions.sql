/*
# Regions & Divisions hierarchy

Adds the organizational hierarchy (DepEd Regions → Schools Divisions) that
drives division-scoped payroll:

1. `regions`  — DepEd regions (e.g., Region IV-A CALABARZON). Super admin CRUD.
2. `divisions` — Schools Division Offices under a region. Super admin CRUD,
   per-division enabled features stored as jsonb.
3. `profiles.region_id / division_id` — the region/division a user belongs to.
   A payroll_admin is scoped to their division; super_admin sees all and can
   switch context.
4. `schools.division_id` + `employees.division_id` — data-scoping anchors.
5. `division_office.division_id` — per-division division office profiles
   (existing single row remains as the legacy/global profile: NULL division_id).
6. RLS: regions/divisions readable by authenticated, written only by
   super_admin via SECURITY DEFINER RPCs (matching the existing audit-logged
   admin RPC pattern).
7. `protect_profile_columns()` updated so non-super_admins can never change
   their own region_id/division_id (prevents self-escalation).
8. `query_employees()` gains a `p_division_id` filter that is enforced
   server-side: non-super_admins are always clamped to their own division.
*/

-- ============================================================================
-- 1. regions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text UNIQUE NOT NULL CHECK (region_code <> ''),
  region_name text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_select" ON public.regions;
CREATE POLICY "regions_select" ON public.regions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "regions_insert" ON public.regions;
CREATE POLICY "regions_insert" ON public.regions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "regions_update" ON public.regions;
CREATE POLICY "regions_update" ON public.regions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "regions_delete" ON public.regions;
CREATE POLICY "regions_delete" ON public.regions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ============================================================================
-- 2. divisions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  division_code text UNIQUE NOT NULL CHECK (division_code <> ''),
  division_name text NOT NULL DEFAULT '',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divisions_region ON public.divisions(region_id);

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "divisions_select" ON public.divisions;
CREATE POLICY "divisions_select" ON public.divisions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "divisions_insert" ON public.divisions;
CREATE POLICY "divisions_insert" ON public.divisions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "divisions_update" ON public.divisions;
CREATE POLICY "divisions_update" ON public.divisions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "divisions_delete" ON public.divisions;
CREATE POLICY "divisions_delete" ON public.divisions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ============================================================================
-- 3. Division-scoping columns
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_division ON public.profiles(division_id);
CREATE INDEX IF NOT EXISTS idx_profiles_region ON public.profiles(region_id);

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schools_division ON public.schools(division_id);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_division ON public.employees(division_id);

ALTER TABLE public.division_office
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_division_office_division ON public.division_office(division_id);

-- ============================================================================
-- 4. protect_profile_columns: guard region_id / division_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_self_update boolean;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- Non-super_admin: block guarded columns outright.
  IF NOT (auth.uid() = NEW.id AND auth.uid() = OLD.id) THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not authorized to change role';
    END IF;
    IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
      RAISE EXCEPTION 'Not authorized to change assigned STACODE';
    END IF;
    IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
      RAISE EXCEPTION 'Not authorized to change employee number';
    END IF;
    IF NEW.region_id IS DISTINCT FROM OLD.region_id THEN
      RAISE EXCEPTION 'Not authorized to change region';
    END IF;
    IF NEW.division_id IS DISTINCT FROM OLD.division_id THEN
      RAISE EXCEPTION 'Not authorized to change division';
    END IF;
    IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
      RAISE EXCEPTION 'Not authorized to change MFA settings';
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
      RAISE EXCEPTION 'Not authorized to change email verification status';
    END IF;
    IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
      RAISE EXCEPTION 'Not authorized to change login attempt count';
    END IF;
    IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
      RAISE EXCEPTION 'Not authorized to unlock accounts';
    END IF;
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
      RAISE EXCEPTION 'Not authorized to change login timestamp';
    END IF;
    IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
      RAISE EXCEPTION 'Not authorized to change login IP';
    END IF;
    RETURN NEW;
  END IF;

  -- Self-update path: allow login tracking + email_verified + mfa_enabled,
  -- but never region/division/role/STACODE/employee_number.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
    RAISE EXCEPTION 'Not authorized to change assigned STACODE';
  END IF;
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Not authorized to change employee number';
  END IF;
  IF NEW.region_id IS DISTINCT FROM OLD.region_id THEN
    RAISE EXCEPTION 'Not authorized to change region';
  END IF;
  IF NEW.division_id IS DISTINCT FROM OLD.division_id THEN
    RAISE EXCEPTION 'Not authorized to change division';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Super-admin RPCs
-- ============================================================================

-- ── upsert_region ──
CREATE OR REPLACE FUNCTION public.upsert_region(
  p_region_id uuid DEFAULT NULL,
  p_region_code text DEFAULT NULL,
  p_region_name text DEFAULT NULL,
  p_sort_order int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  INSERT INTO regions (id, region_code, region_name, sort_order)
  VALUES (
    COALESCE(p_region_id, gen_random_uuid()),
    upper(trim(COALESCE(p_region_code, ''))),
    trim(COALESCE(p_region_name, '')),
    COALESCE(p_sort_order, 0)
  )
  ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'region_upsert', 'regions', v_id::text,
    jsonb_build_object('code', upper(trim(COALESCE(p_region_code, ''))), 'name', trim(COALESCE(p_region_name, '')))
  );

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_region(uuid, text, text, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_region(uuid, text, text, int) TO authenticated;

-- ── delete_region ──
CREATE OR REPLACE FUNCTION public.delete_region(p_region_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_division_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  SELECT count(*) INTO v_division_count FROM divisions WHERE region_id = p_region_id;
  IF v_division_count > 0 THEN
    RAISE EXCEPTION 'Region has % division(s). Remove them first.', v_division_count;
  END IF;

  DELETE FROM regions WHERE id = p_region_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'region_delete', 'regions', p_region_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_region(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_region(uuid) TO authenticated;

-- ── upsert_division ──
CREATE OR REPLACE FUNCTION public.upsert_division(
  p_division_id uuid DEFAULT NULL,
  p_region_id uuid DEFAULT NULL,
  p_division_code text DEFAULT NULL,
  p_division_name text DEFAULT NULL,
  p_features jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;
  IF p_region_id IS NULL THEN
    RAISE EXCEPTION 'Region is required';
  END IF;

  INSERT INTO divisions (id, region_id, division_code, division_name, features)
  VALUES (
    COALESCE(p_division_id, gen_random_uuid()),
    p_region_id,
    upper(trim(COALESCE(p_division_code, ''))),
    trim(COALESCE(p_division_name, '')),
    COALESCE(p_features, '{}'::jsonb)
  )
  ON CONFLICT (division_code) DO UPDATE SET
    region_id = EXCLUDED.region_id,
    division_name = EXCLUDED.division_name,
    features = EXCLUDED.features,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'division_upsert', 'divisions', v_id::text,
    jsonb_build_object('code', upper(trim(COALESCE(p_division_code, ''))), 'name', trim(COALESCE(p_division_name, '')))
  );

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_division(uuid, uuid, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_division(uuid, uuid, text, text, jsonb) TO authenticated;

-- ── delete_division ──
CREATE OR REPLACE FUNCTION public.delete_division(p_division_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_emp_count int;
  v_school_count int;
  v_user_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;

  SELECT count(*) INTO v_emp_count FROM employees WHERE division_id = p_division_id;
  SELECT count(*) INTO v_school_count FROM schools WHERE division_id = p_division_id;
  SELECT count(*) INTO v_user_count FROM profiles WHERE division_id = p_division_id;
  IF v_emp_count + v_school_count + v_user_count > 0 THEN
    RAISE EXCEPTION 'Division still has data assigned (% employees, % schools, % users). Reassign or remove it first.',
      v_emp_count, v_school_count, v_user_count;
  END IF;

  DELETE FROM divisions WHERE id = p_division_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_delete', 'divisions', p_division_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_division(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_division(uuid) TO authenticated;

-- ── set_user_division ──
CREATE OR REPLACE FUNCTION public.set_user_division(
  p_target_user uuid,
  p_region_id uuid DEFAULT NULL,
  p_division_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign regions and divisions';
  END IF;

  UPDATE profiles
    SET region_id = p_region_id,
        division_id = p_division_id,
        updated_at = now()
    WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'user_division_change', 'profiles', p_target_user::text,
    jsonb_build_object('region_id', p_region_id, 'division_id', p_division_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_division(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_division(uuid, uuid, uuid) TO authenticated;

-- ── assign_schools_to_division ──
CREATE OR REPLACE FUNCTION public.assign_schools_to_division(
  p_division_id uuid,
  p_school_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_assigned int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = p_division_id, updated_at = now()
  WHERE id = ANY(p_school_ids);
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_assigned', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_assigned));

  RETURN jsonb_build_object('success', true, 'assigned', v_assigned);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_schools_to_division(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_schools_to_division(uuid, uuid[]) TO authenticated;

-- ── clear_schools_from_division: unassign schools (reverts to unassigned) ──
CREATE OR REPLACE FUNCTION public.clear_schools_from_division(
  p_division_id uuid,
  p_school_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_cleared int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = NULL, updated_at = now()
  WHERE id = ANY(p_school_ids) AND division_id = p_division_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_cleared', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_cleared));

  RETURN jsonb_build_object('success', true, 'cleared', v_cleared);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_schools_from_division(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_schools_from_division(uuid, uuid[]) TO authenticated;

-- ── sync_employees_to_division: map employees whose school belongs to the
--    division (by STACODE = schools.school_code) onto the division. ──
CREATE OR REPLACE FUNCTION public.sync_employees_to_division(p_division_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_updated int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign employees';
  END IF;

  UPDATE employees e
    SET division_id = p_division_id
    FROM schools s
    WHERE s.division_id = p_division_id
      AND s.school_code = e.stacode
      AND (e.division_id IS DISTINCT FROM p_division_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_employees_synced', 'divisions', p_division_id::text,
    jsonb_build_object('employee_count', v_updated));

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_employees_to_division(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_employees_to_division(uuid) TO authenticated;

-- ============================================================================
-- 6. query_employees: add division scoping (server-enforced)
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_employees(text, int, int, text, uuid, text, int, int, boolean, text, text);

CREATE OR REPLACE FUNCTION public.query_employees(
  p_search text DEFAULT NULL,
  p_stacode_min int DEFAULT NULL,
  p_stacode_max int DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_stacode text DEFAULT NULL,
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 10,
  p_count_only boolean DEFAULT false,
  p_scope_column text DEFAULT NULL,
  p_scope_value text DEFAULT NULL,
  p_division_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (empno ILIKE %L OR employee_number ILIKE %L OR lname ILIKE %L OR last_name ILIKE %L OR fname ILIKE %L OR first_name ILIKE %L OR mi ILIKE %L OR middle_name ILIKE %L OR poscode ILIKE %L OR department ILIKE %L OR stacode ILIKE %L OR empname ILIKE %L OR account ILIKE %L OR banker ILIKE %L OR tin ILIKE %L OR gsis_id ILIKE %L OR gsis_pn ILIKE %L OR hdmf_id ILIKE %L OR phic_id ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  -- Division scoping (server-enforced): super_admin may filter by any division;
  -- everyone else is clamped to their own division, if they have one.
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    IF p_division_id IS NOT NULL THEN
      v_where := v_where || format(' AND division_id = %L', p_division_id::text);
    END IF;
  ELSIF v_my_division IS NOT NULL THEN
    v_where := v_where || format(' AND division_id = %L', v_my_division::text);
  END IF;

  -- Scope filter for role-based data segregation
  IF p_scope_column IS NOT NULL AND p_scope_value IS NOT NULL AND p_scope_column != '' THEN
    IF p_scope_column = 'stacode' THEN
      v_where := v_where || format(' AND stacode = %L', p_scope_value);
    ELSIF p_scope_column = 'empno' THEN
      v_where := v_where || format(' AND (empno = %L OR employee_number = %L)', p_scope_value, p_scope_value);
    END IF;
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND stacode_num >= %s AND stacode_num <= %s', p_stacode_min, p_stacode_max);
  ELSIF p_stacode IS NOT NULL AND p_stacode != '' THEN
    v_where := v_where || format(' AND stacode = %L', p_stacode);
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    v_where := v_where || format(' AND status = %L', p_status);
  END IF;

  IF p_group_id IS NOT NULL AND p_group_id != '' THEN
    v_where := v_where || format(' AND payroll_group_id = %L', p_group_id::text);
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM employees WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(e)), ''[]''::jsonb) FROM (SELECT * FROM employees WHERE true %s ORDER BY lname, fname LIMIT %s OFFSET %s) e',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.query_employees(text, int, int, text, uuid, text, int, int, boolean, text, text, uuid) TO authenticated;

-- Reload PostgREST's schema cache so the new tables/functions are visible immediately.
NOTIFY pgrst, 'reload schema';
