-- ============================================================
-- FAST DASHBOARD ENGINE (replaces the slow SECURITY INVOKER version)
--
-- Why: the previous get_dashboard_summary was SECURITY INVOKER, so every
-- internal table scan ran under the caller's RLS policies. The RLS SELECT
-- policies on employees / payroll_entries / payroll_deductions evaluate the
-- scope helper functions (is_data_admin(), get_current_user_role(),
-- get_current_user_divcode(), ...) per row and inject several hashed
-- SubPlans into each scan's filter. Measured server-side: ~2.6s for only
-- 2,709 employees / 2,709 entries, and slower under concurrent load — which
-- crossed statement_timeout and surfaced in the app as "Live division stats
-- unavailable — showing overall totals".
--
-- Fix: make the function SECURITY DEFINER, matching query_employees and
-- query_dedfile in this codebase. The function implements its own scope
-- clamping (caller role from profiles + selected REGCODE/DIVCODE), so RLS is
-- not needed for authorization inside it. The signature, scope rules, output
-- shape and every table in the database are unchanged — only the function's
-- execution privileges change.
--
-- This is applied AFTER 20260819120000_optimize_dashboard_summary.sql so the
-- final deployed body is this one on both fresh and existing databases.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  category text DEFAULT NULL,
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH caller AS MATERIALIZED (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS MATERIALIZED (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
scope_div_ids AS MATERIALIZED (
  -- division uuid(s) implied by the selected REGCODE/DIVCODE scope
  SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
),
scoped_emps AS MATERIALIZED (
  SELECT id, stacode, status, empno, employee_number, regcode, divcode, created_at,
         fname, first_name, lname, last_name, poscode, position, basic, basic_salary,
         (CASE WHEN stacode ~ '^[0-9]+$' THEN NULLIF(stacode, '')::int END) AS stacode_num
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
        OR division_id IN (SELECT id FROM scope_div_ids)
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
active_emps AS MATERIALIZED (
  SELECT * FROM scoped_emps WHERE status = 'Active'
),
-- One pass over payroll_entries for all entry-based KPIs. Using
-- employee_id = ANY(<scoped ids>) instead of a JOIN forces the planner
-- to scan payroll_entries ONCE (index-accelerated) rather than once per
-- scoped employee.
entry_agg AS MATERIALIZED (
  SELECT
    COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
    COALESCE(SUM(pe.net_pay), 0) AS total_net,
    COALESCE(SUM(pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax), 0) AS total_mandatory,
    COALESCE(SUM(pe.other_deductions), 0) AS total_loan_deds,
    COUNT(*) FILTER (WHERE pe.status = 'Posted') AS processed_count,
    COUNT(*) FILTER (WHERE pe.status = 'Computed') AS pending_count
  FROM payroll_entries pe
  WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
-- The division's own current period: same scope rules as scoped_emps,
-- applied to pay_periods via REGCODE/DIVCODE (plus legacy uncoded
-- periods for callers with no assigned division).
current_period AS MATERIALIZED (
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
group_counts AS MATERIALIZED (
  SELECT g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max,
    COUNT(e.id) AS emp_count
  FROM payroll_groups g
  LEFT JOIN active_emps e ON
    g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
    AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL
  GROUP BY g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max
),
unassigned AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM active_emps e
  WHERE e.stacode_num IS NULL
     OR NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
    )
),
ded_totals AS MATERIALIZED (
  SELECT pd.dedcode, COALESCE(dc.dedname, pd.dedcode) AS dedname,
    COUNT(*) AS cnt, SUM(pd.dedamt) AS total
  FROM payroll_deductions pd
  LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  WHERE pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
  GROUP BY pd.dedcode, dc.dedname
  ORDER BY total DESC
  LIMIT 8
),
loan_accounts AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM payroll_deductions pd
  WHERE pd.type = 'Loan' AND pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
recent_emps AS MATERIALIZED (
  SELECT e.id, e.empno, e.employee_number, e.fname, e.first_name, e.lname, e.last_name,
         e.poscode, e.position, e.regcode, e.basic, e.basic_salary
  FROM scoped_emps e
  ORDER BY e.created_at DESC
  LIMIT 5
)
SELECT json_build_object(
  'totalRecords', (SELECT COUNT(*) FROM scoped_emps),
  'activeEmployees', (SELECT COUNT(*) FROM active_emps),
  'totalGross', (SELECT total_gross FROM entry_agg),
  'totalNet', (SELECT total_net FROM entry_agg),
  'totalMandatory', (SELECT total_mandatory FROM entry_agg),
  'totalLoanDeds', (SELECT total_loan_deds FROM entry_agg),
  'processedCount', (SELECT processed_count FROM entry_agg),
  'pendingCount', (SELECT pending_count FROM entry_agg),
  'currentPeriod', (SELECT to_json(cp) FROM current_period cp),
  'periodNet', COALESCE((SELECT SUM(pe.net_pay)
    FROM payroll_entries pe
    WHERE pe.pay_period_id = (SELECT id FROM current_period)
      AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))), 0),
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

-- Reload PostgREST's schema cache so the new definition is visible immediately.
NOTIFY pgrst, 'reload schema';
