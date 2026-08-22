/*
# Fix Division Scope — match legacy REGCODE/DIVCODE rows for scoped users

## Why
DBF-imported employee/deduction rows are stamped with REGCODE + DIVCODE
(the codes from the legacy files) but their `division_id` (uuid) can stay NULL
when the codes did not resolve to a division at import time (code format
mismatch, division not yet in the directory, or the file lacked the codes).

Every shared query RPC clamps non-super_admins to their own division by
`division_id` ONLY — so a division-scoped payroll admin cannot see imported
employee records that carry the right REGCODE/DIVCODE but no division_id.

## Fix
For non-super_admins assigned to a division, the clamp now matches:

    division_id = my_division
      OR (regcode = my_region_code AND divcode = my_division_code)

so imported legacy rows are visible exactly when they belong to the caller's
division, by code or by id. Super-admin behavior is unchanged.

## Functions updated
- query_employees
- query_dedfile
- query_payroll_deductions
- get_dashboard_summary
*/

-- ============================================================================
-- Helper: caller's (region_code, division_code) from their assigned division
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_user_division_codes()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ARRAY[r.region_code, d.division_code]
  FROM profiles p
  JOIN divisions d ON d.id = p.division_id
  JOIN regions r ON r.id = d.region_id
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_current_user_division_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_division_codes() TO authenticated;

-- ============================================================================
-- 1. query_employees
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_employees(text, int, int, text, uuid, text, int, int, boolean, text, text);
DROP FUNCTION IF EXISTS public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid);
DROP FUNCTION IF EXISTS public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid,uuid[]);

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
  p_division_ids uuid[] DEFAULT NULL,
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL
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

  -- Division scoping (server-enforced): super_admin may filter by the selected
  -- division(s). REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes. Everyone else is clamped to
  -- their own division — by id OR by the division's REGCODE/DIVCODE so
  -- imported legacy rows without a stamped division_id stay visible.
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
      v_where := v_where || format(
        ' AND (division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (regcode = %L AND divcode = ANY(%L::text[])))',
        p_regcode, p_divcodes, p_regcode, p_divcodes
      );
    ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
      v_where := v_where || format(' AND division_id = ANY(%L::uuid[])', p_division_ids);
    ELSIF p_division_id IS NOT NULL THEN
      v_where := v_where || format(' AND division_id = %L', p_division_id::text);
    END IF;
  ELSIF v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (division_id = %L OR (regcode = (get_current_user_division_codes())[1] AND divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
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

REVOKE ALL ON FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid,uuid[],text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text,uuid,uuid[],text,text[]) TO authenticated;

-- ============================================================================
-- 2. query_dedfile
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean);
DROP FUNCTION IF EXISTS public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean,uuid[]);

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
  p_division_ids uuid[] DEFAULT NULL,
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL
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
  v_caller_role text;
  v_my_division uuid;
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

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows — by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
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

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
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

REVOKE ALL ON FUNCTION public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean,uuid[],text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.query_dedfile(text,text,text,text,text,int,int,text,text,int,int,boolean,uuid[],text,text[]) TO authenticated;

-- ============================================================================
-- 3. query_payroll_deductions (Deduction Masterfile)
-- ============================================================================
DROP FUNCTION IF EXISTS public.query_payroll_deductions(text,text,text,int,int,int,int,boolean);

CREATE OR REPLACE FUNCTION public.query_payroll_deductions(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_type_filter text DEFAULT NULL,
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL,
  p_stacode_min int DEFAULT NULL,
  p_stacode_max int DEFAULT NULL,
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 10,
  p_count_only boolean DEFAULT false
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
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != 'All' THEN
    v_where := v_where || format(' AND pd.status = %L', p_status_filter);
  END IF;

  IF p_type_filter IS NOT NULL AND p_type_filter != 'All' THEN
    v_where := v_where || format(' AND pd.type = %L', p_type_filter);
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(
      ' AND e.stacode IS NOT NULL AND e.stacode ~ %L AND substring(e.stacode from %s)::int BETWEEN %s AND %s',
      '^[0-9]+$', '1', p_stacode_min, p_stacode_max
    );
  END IF;

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows — by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
  END IF;

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows
  -- that were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno, pd.agency,
             pd.type, pd.status, pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             e.lname, e.last_name, e.fname, e.first_name, e.mi
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY pd.empno, pd.dedcode
      LIMIT %s OFFSET %s
    ) r',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$fn$;

REVOKE ALL ON FUNCTION public.query_payroll_deductions(text,text,text,text,text[],int,int,int,int,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.query_payroll_deductions(text,text,text,text,text[],int,int,int,int,boolean) TO authenticated;

-- ============================================================================
-- 4. get_dashboard_summary
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_dashboard_summary(text);

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  category text DEFAULT NULL,
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL
)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $function$
WITH caller AS (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
scoped_emps AS (
  SELECT id, stacode, status, empno, regcode, divcode
  FROM employees
  WHERE
    CASE
      WHEN category = 'elementary' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 1 AND 499
      WHEN category = 'highschool' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 500 AND 701
      ELSE true
    END
    AND (
      -- super_admin: follow the selected REGCODE/DIVCODE scope (or division ids)
      ((SELECT role FROM caller) = 'super_admin' AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
        OR division_id IN (
          SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
          WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
        )
        OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
      ))
      OR
      -- everyone else: clamped to their own division (if assigned) — by id OR
      -- by REGCODE/DIVCODE so imported legacy rows stay visible
      ((SELECT role FROM caller) <> 'super_admin' AND (
        (SELECT division_id FROM caller) IS NULL
        OR division_id = (SELECT division_id FROM caller)
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE employees.regcode = cc.region_code AND employees.divcode = cc.division_code
        )
      ))
    )
),
active_emps AS (
  SELECT * FROM scoped_emps WHERE status = 'Active'
),
scoped_entries AS (
  SELECT pe.gross_pay, pe.net_pay, pe.dedlnr, pe.dedmed, pe.dedpag, pe.dedtax,
         pe.other_deductions, pe.status, pe.pay_period_id
  FROM payroll_entries pe
  WHERE pe.employee_id IN (SELECT id FROM scoped_emps)
),
-- The division's own current period: the same scope rules as scoped_emps,
-- applied to pay_periods via REGCODE/DIVCODE (plus legacy uncoded periods for
-- callers with no assigned division).
current_period AS (
  SELECT * FROM pay_periods
  WHERE (
    ((SELECT role FROM caller) = 'super_admin' AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
      OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
    ))
    OR
    ((SELECT role FROM caller) <> 'super_admin' AND (
      (SELECT division_id FROM caller) IS NULL
      OR (regcode IS NULL AND divcode IS NULL)
      OR EXISTS (
        SELECT 1 FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = pay_periods.regcode
          AND d.division_code = pay_periods.divcode
          AND d.id = (SELECT division_id FROM caller)
      )
    ))
  )
  ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
  LIMIT 1
),
group_counts AS (
  SELECT g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max,
    COUNT(e.id) AS emp_count
  FROM payroll_groups g
  LEFT JOIN active_emps e ON
    g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
    AND e.stacode ~ '^[0-9]+$'
    AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL
  GROUP BY g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max
),
unassigned AS (
  SELECT COUNT(*) AS cnt FROM active_emps e
  WHERE e.stacode IS NULL
     OR e.stacode !~ '^[0-9]+$'
     OR NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode ~ '^[0-9]+$' AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
    )
),
ded_totals AS (
  SELECT pd.dedcode, COALESCE(dc.dedname, pd.dedcode) AS dedname,
    COUNT(*) AS cnt, SUM(pd.dedamt) AS total
  FROM payroll_deductions pd
  LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  WHERE pd.status = 'Active'
    AND pd.employee_id IN (SELECT id FROM scoped_emps)
  GROUP BY pd.dedcode, dc.dedname
  ORDER BY total DESC
  LIMIT 8
),
loan_accounts AS (
  SELECT COUNT(*) AS cnt FROM payroll_deductions pd
  WHERE pd.type = 'Loan' AND pd.status = 'Active'
    AND pd.employee_id IN (SELECT id FROM scoped_emps)
),
recent_emps AS (
  SELECT e.id, e.empno, e.employee_number, e.fname, e.first_name, e.lname, e.last_name,
         e.poscode, e.position, e.regcode, e.basic, e.basic_salary
  FROM employees e
  WHERE e.id IN (SELECT id FROM scoped_emps)
  ORDER BY e.created_at DESC
  LIMIT 5
)
SELECT json_build_object(
  'totalRecords', (SELECT COUNT(*) FROM scoped_emps),
  'activeEmployees', (SELECT COUNT(*) FROM active_emps),
  'totalGross', COALESCE((SELECT SUM(gross_pay) FROM scoped_entries), 0),
  'totalNet', COALESCE((SELECT SUM(net_pay) FROM scoped_entries), 0),
  'totalMandatory', COALESCE((SELECT SUM(dedlnr + dedmed + dedpag + dedtax) FROM scoped_entries), 0),
  'totalLoanDeds', COALESCE((SELECT SUM(other_deductions) FROM scoped_entries), 0),
  'processedCount', (SELECT COUNT(*) FROM scoped_entries WHERE status = 'Posted'),
  'pendingCount', (SELECT COUNT(*) FROM scoped_entries WHERE status = 'Computed'),
  'currentPeriod', (SELECT to_json(cp) FROM current_period cp),
  'periodNet', COALESCE((SELECT SUM(net_pay) FROM scoped_entries WHERE pay_period_id = (SELECT id FROM current_period)), 0),
  'groupStats', COALESCE((SELECT json_agg(json_build_object(
    'id', gc.id, 'group_code', gc.group_code, 'group_name', gc.group_name,
    'stacode_min', gc.stacode_min, 'stacode_max', gc.stacode_max, 'count', gc.emp_count
  ) ORDER BY gc.stacode_min) FROM group_counts gc), '[]'::json),
  'unassignedCount', (SELECT cnt FROM unassigned),
  'activeLoanAccounts', (SELECT cnt FROM loan_accounts),
  'dedTotalsByCode', COALESCE((SELECT json_agg(json_build_object(
    'code', dt.dedcode, 'name', dt.dedname, 'count', dt.cnt, 'total', dt.total
  )) FROM ded_totals dt), '[]'::json),
  'recentEmployees', COALESCE((SELECT json_agg(json_build_object(
    'id', re.id, 'empno', re.empno, 'employee_number', re.employee_number,
    'fname', re.fname, 'first_name', re.first_name,
    'lname', re.lname, 'last_name', re.last_name,
    'poscode', re.poscode, 'position', re.position,
    'regcode', re.regcode, 'basic', re.basic, 'basic_salary', re.basic_salary
  )) FROM recent_emps re), '[]'::json)
);
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, text, text[]) TO authenticated;

-- Reload PostgREST's schema cache so the new signatures are visible immediately.
NOTIFY pgrst, 'reload schema';
