-- ============================================================
-- FAST PAYROLL HISTORY ENGINE (Report Center → Payroll History)
--
-- Why: the previous get_payroll_history_by_month was SECURITY INVOKER
-- (and default volatile), so every internal scan ran under the caller's
-- RLS policies — the per-row scope helpers made it 3.5s server-side for
-- one year of 2,709 employees, so the Payroll History tab spun for
-- seconds and often timed out, which surfaced as the Report Center
-- "not synced" with the database.
--
-- Fix: same treatment as the fast dashboard engine — SECURITY DEFINER,
-- STABLE, explicit search_path, and the function clamps the scope itself
-- (caller role from profiles + requested REGCODE/DIVCODE), so RLS is not
-- needed for authorization inside it. The signature, output shape, scope
-- rules, and every table are unchanged — only execution privileges.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_payroll_history_by_month(
  p_year int,
  p_regcode text DEFAULT NULL,
  p_divcode text DEFAULT NULL
)
RETURNS TABLE (
  period_id uuid,
  month int,
  year int,
  period_name text,
  status text,
  pay_date date,
  employee_count bigint,
  total_gross numeric,
  total_deductions numeric,
  total_net numeric,
  total_undeducted numeric,
  nthp_pass_count bigint,
  nthp_fail_count bigint
)
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
is_super AS MATERIALIZED (
  SELECT (SELECT role FROM caller) = 'super_admin' AS v
),
-- Employees in scope: super_admin follows the requested REGCODE/DIVCODE
-- (global when null); everyone else is clamped to their own division (by
-- id, by legacy codes, or all when no division is assigned).
scoped_emps AS MATERIALIZED (
  SELECT e.id FROM employees e
  WHERE
    ((SELECT v FROM is_super) AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
      OR e.regcode = p_regcode AND e.divcode = p_divcode
      OR e.division_id IN (
        SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = p_regcode AND d.division_code = p_divcode
      )
    ))
    OR
    (NOT (SELECT v FROM is_super) AND (
      (SELECT division_id FROM caller) IS NULL
      OR e.division_id = (SELECT division_id FROM caller)
      OR EXISTS (
        SELECT 1 FROM caller_codes cc
        WHERE e.regcode = cc.region_code AND e.divcode = cc.division_code
      )
    ))
),
scoped_periods AS MATERIALIZED (
  SELECT pp.id, pp.month, pp.year, pp.period_name, pp.status, pp.pay_date
  FROM pay_periods pp
  WHERE pp.year = p_year
    AND (
      ((SELECT v FROM is_super) AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
        OR pp.regcode = p_regcode AND pp.divcode = p_divcode
      ))
      OR
      (NOT (SELECT v FROM is_super) AND (
        (SELECT division_id FROM caller) IS NULL
        OR pp.regcode IS NULL OR pp.divcode IS NULL
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE pp.regcode = cc.region_code AND pp.divcode = cc.division_code
        )
      ))
    )
)
SELECT
  p.id, p.month, p.year, p.period_name, p.status, p.pay_date,
  COUNT(pe.id) AS employee_count,
  COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
  COALESCE(SUM(pe.total_deductions), 0) AS total_deductions,
  COALESCE(SUM(pe.net_pay), 0) AS total_net,
  COALESCE(SUM(pe.undeducted_amount), 0) AS total_undeducted,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'PASS') AS nthp_pass_count,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'FAIL') AS nthp_fail_count
FROM scoped_periods p
LEFT JOIN payroll_entries pe
  ON pe.pay_period_id = p.id
 AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
GROUP BY p.id, p.month, p.year, p.period_name, p.status, p.pay_date
ORDER BY p.month ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_payroll_history_by_month(int, text, text) TO authenticated;

-- Reload PostgREST's schema cache so the new definition is visible immediately.
NOTIFY pgrst, 'reload schema';
