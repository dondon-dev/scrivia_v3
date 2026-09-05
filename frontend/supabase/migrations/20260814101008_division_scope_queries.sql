/*
# Division Scope Filters for SuperAdmin Org Context

## Purpose
Lets a Super Administrator filter every data module to the Region/Division
selected in the sidebar org selector. The frontend passes `p_division_ids`
(a uuid[] of the selected division — or every division in the selected region)
to the shared query RPCs, which filter server-side.

- `query_schools_with_stats(p_school_type, p_division_ids)` — schools scoped
  by `schools.division_id`.
- `query_dedfile(...)` — DEDFILE (payroll_deductions) scoped by the joined
  employee's `division_id`.
- `query_employees(...)` — employee masterfile scoped by `division_id`
  (adds `p_division_ids` alongside the existing `p_division_id`).

Non-super_admins are unaffected: the RPCs keep their existing server-side
clamping to the caller's own division.
*/

-- ============================================================================
-- 1. query_schools_with_stats — add p_division_ids
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_schools_with_stats(text);

CREATE OR REPLACE FUNCTION public.query_schools_with_stats(
  p_school_type text DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  school_code text,
  school_name text,
  school_type text,
  cluster text,
  address text,
  school_head text,
  contact_number text,
  email text,
  status text,
  total_employees bigint,
  teaching_personnel bigint,
  non_teaching_personnel bigint,
  active_payroll_employees bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.school_code,
    s.school_name,
    s.school_type,
    s.cluster,
    s.address,
    s.school_head,
    s.contact_number,
    s.email,
    s.status,
    COALESCE(st.total, 0) AS total_employees,
    COALESCE(st.teaching, 0) AS teaching_personnel,
    COALESCE(st.non_teaching, 0) AS non_teaching_personnel,
    COALESCE(st.active, 0) AS active_payroll_employees
  FROM schools s
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE e.poscode ~ '^[12]') AS teaching,
      COUNT(*) FILTER (WHERE e.poscode IS NOT NULL AND e.poscode <> '' AND e.poscode !~ '^[12]') AS non_teaching,
      COUNT(*) FILTER (WHERE e.status = 'Active') AS active
    FROM employees e
    WHERE e.stacode = s.school_code
  ) st ON true
  WHERE (p_school_type IS NULL OR s.school_type = p_school_type)
    AND (p_division_ids IS NULL OR cardinality(p_division_ids) = 0 OR s.division_id = ANY(p_division_ids))
  ORDER BY s.school_code;
$$;

REVOKE ALL ON FUNCTION public.query_schools_with_stats(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_schools_with_stats(text, uuid[]) TO authenticated;

-- ============================================================================
-- 2. query_dedfile — add p_division_ids (scopes via joined employee)
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean);

CREATE OR REPLACE FUNCTION public.query_dedfile(
  p_search text DEFAULT NULL,
  p_stacode text DEFAULT NULL,
  p_dedcode text DEFAULT NULL,
  p_empno text DEFAULT NULL,
  p_period text DEFAULT NULL,
  p_stacode_min int DEFAULT NULL,
  p_stacode_max int DEFAULT NULL,
  p_sort_key text DEFAULT 'empno',
  p_sort_dir text DEFAULT 'asc',
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 50,
  p_count_only boolean DEFAULT false,
  p_division_ids uuid[] DEFAULT NULL
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
  v_sort_col text;
  v_sort_dir_clause text;
BEGIN
  v_search := trim(coalesce(p_search, ''));

  -- Build WHERE clause
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L OR e.stacode ILIKE %L OR e.regcode ILIKE %L OR e.divcode ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  IF p_stacode IS NOT NULL AND p_stacode != 'All' AND p_stacode != '' THEN
    v_where := v_where || format(' AND e.stacode = %L', p_stacode);
  END IF;

  IF p_dedcode IS NOT NULL AND p_dedcode != 'All' AND p_dedcode != '' THEN
    v_where := v_where || format(' AND pd.dedcode = %L', p_dedcode);
  END IF;

  IF p_empno IS NOT NULL AND trim(p_empno) != '' THEN
    v_where := v_where || format(' AND pd.empno ILIKE %L', '%'||trim(p_empno)||'%');
  END IF;

  IF p_period IS NOT NULL AND trim(p_period) != '' THEN
    v_where := v_where || format(' AND lpad(pd.effyy::text, 4, ''0'') || lpad(pd.effmm::text, 2, ''0'') ILIKE %L', '%'||trim(p_period)||'%');
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND e.stacode_num >= %s AND e.stacode_num <= %s', p_stacode_min, p_stacode_max);
  END IF;

  -- Division scoping (server-enforced): filter by the SuperAdmin's selected
  -- division(s). Non-super_admins see only their own division via the
  -- employee join (their rows are clamped by the caller's profile division).
  IF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
    v_where := v_where || format(' AND e.division_id = ANY(%L::uuid[])', p_division_ids);
  END IF;

  -- Determine sort column
  v_sort_col := CASE lower(coalesce(p_sort_key, 'empno'))
    WHEN 'empno' THEN 'pd.empno'
    WHEN 'dedcode' THEN 'pd.dedcode'
    WHEN 'dedamt' THEN 'pd.dedamt'
    WHEN 'policyno' THEN 'pd.policyno'
    WHEN 'agency' THEN 'pd.agency'
    WHEN 'status' THEN 'pd.status'
    WHEN 'type' THEN 'pd.type'
    WHEN 'lname' THEN 'e.lname'
    WHEN 'stacode' THEN 'e.stacode'
    WHEN 'effyy' THEN 'pd.effyy'
    WHEN 'effmm' THEN 'pd.effmm'
    WHEN 'principal' THEN 'pd.principal'
    WHEN 'netpay' THEN 'e.netpay'
    ELSE 'pd.empno'
  END;

  v_sort_dir_clause := CASE lower(coalesce(p_sort_dir, 'asc'))
    WHEN 'desc' THEN 'DESC'
    ELSE 'ASC'
  END;

  -- Count total
  EXECUTE format(
    'SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s',
    v_where
  ) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno,
             pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             pd.agency, pd.status, pd.type,
             pd.created_by, pd.created_at, pd.updated_by, pd.updated_at,
             e.lname, e.last_name, e.fname, e.first_name, e.mi, e.appel,
             e.stacode, e.regcode, e.divcode, e.netpay, e.updcode, e.update,
             e.paydate, e.editor, e.hiredate, e.hire_date, e.birthdate, e.gsis_pn
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY %s %s, pd.dedcode ASC
      LIMIT %s OFFSET %s
    ) r',
    v_where, v_sort_col, v_sort_dir_clause, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean,uuid[]) TO authenticated;

-- ============================================================================
-- 3. query_employees — add p_division_ids (keeps p_division_id for compat)
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid);

CREATE OR REPLACE FUNCTION public.query_employees(
  p_search text DEFAULT NULL,
  p_stacode_min integer DEFAULT NULL,
  p_stacode_max integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_stacode text DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 10,
  p_count_only boolean DEFAULT false,
  p_scope_column text DEFAULT NULL,
  p_scope_value text DEFAULT NULL,
  p_division_id uuid DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL
) RETURNS jsonb
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

  -- Division scoping (server-enforced): super_admin may filter by any
  -- division or set of divisions; everyone else is clamped to their own
  -- division, if they have one.
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    IF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
      v_where := v_where || format(' AND division_id = ANY(%L::uuid[])', p_division_ids);
    ELSIF p_division_id IS NOT NULL THEN
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

  IF p_group_id IS NOT NULL THEN
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

GRANT EXECUTE ON FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid,uuid[]) TO authenticated;

-- Reload PostgREST's schema cache so the new signatures are visible immediately.
NOTIFY pgrst, 'reload schema';
