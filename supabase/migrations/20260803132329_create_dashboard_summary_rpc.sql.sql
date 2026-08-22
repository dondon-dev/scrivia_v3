/*
# Create get_dashboard_summary RPC — Server-Side Aggregation

## Problem
The Dashboard was downloading ALL rows from employees (2,710),
payroll_entries (5,420), and payroll_deductions (9,289) to the
browser, then computing counts and sums in JavaScript. This meant
transferring 17,000+ rows over the network on every page load.

## Fix
Create a single SECURITY INVOKER function that does all aggregation
in SQL and returns one JSON object with the summary numbers. This
reduces data transfer from 17,000+ rows to exactly 1 row.

RLS is respected (SECURITY INVOKER), so each user only sees their
authorized data. The category parameter ('elementary' / 'highschool')
filters by STACODE range server-side.

## Returns
JSON object with: totalRecords, activeEmployees, totalGross, totalNet,
totalMandatory, totalLoanDeds, processedCount, pendingCount, currentPeriod,
periodNet, groupStats (array), unassignedCount, activeLoanAccounts,
dedTotalsByCode (top 8), recentEmployees (latest 5).

## Security
- SECURITY INVOKER: RLS policies apply to all internal queries.
- STABLE: result cached per statement.
- No new tables or columns. Read-only function.
*/

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(category text DEFAULT NULL)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $function$
WITH scoped_emps AS (
  SELECT id, stacode, status, empno
  FROM employees
  WHERE
    CASE
      WHEN category = 'elementary' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 1 AND 499
      WHEN category = 'highschool' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 500 AND 701
      ELSE true
    END
),
active_emps AS (
  SELECT * FROM scoped_emps WHERE status = 'Active'
),
scoped_entries AS (
  SELECT pe.gross_pay, pe.net_pay, pe.dedlnr, pe.dedmed, pe.dedpag, pe.dedtax,
         pe.other_deductions, pe.status, pe.pay_period_id
  FROM payroll_entries pe
  WHERE (category IS NULL OR pe.employee_id IN (SELECT id FROM scoped_emps))
),
current_period AS (
  SELECT * FROM pay_periods
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
    AND (category IS NULL OR pd.employee_id IN (SELECT id FROM scoped_emps))
  GROUP BY pd.dedcode, dc.dedname
  ORDER BY total DESC
  LIMIT 8
),
loan_accounts AS (
  SELECT COUNT(*) AS cnt FROM payroll_deductions pd
  WHERE pd.type = 'Loan' AND pd.status = 'Active'
    AND (category IS NULL OR pd.employee_id IN (SELECT id FROM scoped_emps))
),
recent_emps AS (
  SELECT e.id, e.empno, e.employee_number, e.fname, e.first_name, e.lname, e.last_name,
         e.poscode, e.position, e.regcode, e.basic, e.basic_salary
  FROM employees e
  WHERE
    CASE
      WHEN category = 'elementary' THEN e.stacode ~ '^[0-9]+$' AND e.stacode::int BETWEEN 1 AND 499
      WHEN category = 'highschool' THEN e.stacode ~ '^[0-9]+$' AND e.stacode::int BETWEEN 500 AND 701
      ELSE true
    END
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

GRANT EXECUTE ON FUNCTION get_dashboard_summary(text) TO authenticated;