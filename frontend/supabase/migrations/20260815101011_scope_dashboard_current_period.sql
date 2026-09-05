/*
# Division Dashboard — scope the current period

get_dashboard_summary() already scopes employees, entries, deductions and loans
by REGCODE/DIVCODE, but its `current_period` picked the latest period GLOBALLY —
so one division's dashboard showed another division's active payroll cycle.
With pay periods now per-division (20260815_scope_pay_periods_by_division.sql),
the dashboard must resolve the current period for the SAME division scope.

This recreates the function with a division-scoped current_period (and therefore
a division-scoped periodNet). REGCODE + DIVCODE remain the unique reference for
one division's payroll.
*/

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
      -- everyone else: clamped to their own division (if assigned)
      ((SELECT role FROM caller) <> 'super_admin' AND (
        (SELECT division_id FROM caller) IS NULL OR division_id = (SELECT division_id FROM caller)
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

-- Reload PostgREST's schema cache so the new signature is visible immediately.
NOTIFY pgrst, 'reload schema';
