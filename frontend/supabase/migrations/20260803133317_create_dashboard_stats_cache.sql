-- ============================================================
-- DASHBOARD STATS CACHE
-- Pre-computed single-row snapshot; updated by triggers.
-- Dashboard reads this instantly — zero row-scanning at load.
-- ============================================================

-- 1. Cache table (one row, refreshed in-place)
CREATE TABLE IF NOT EXISTS public.dashboard_stats_cache (
  id                   int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  total_records        int     NOT NULL DEFAULT 0,
  active_employees     int     NOT NULL DEFAULT 0,
  total_gross          numeric NOT NULL DEFAULT 0,
  total_net            numeric NOT NULL DEFAULT 0,
  total_mandatory      numeric NOT NULL DEFAULT 0,
  total_loan_deds      numeric NOT NULL DEFAULT 0,
  processed_count      int     NOT NULL DEFAULT 0,
  pending_count        int     NOT NULL DEFAULT 0,
  period_net           numeric NOT NULL DEFAULT 0,
  active_loan_accounts int     NOT NULL DEFAULT 0,
  unassigned_count     int     NOT NULL DEFAULT 0,
  group_stats          jsonb   NOT NULL DEFAULT '[]',
  ded_totals_by_code   jsonb   NOT NULL DEFAULT '[]',
  recent_employees     jsonb   NOT NULL DEFAULT '[]',
  current_period       jsonb,
  refreshed_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row
INSERT INTO public.dashboard_stats_cache (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS: authenticated users can read; no user can write directly
ALTER TABLE public.dashboard_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cache_select" ON public.dashboard_stats_cache
  FOR SELECT TO authenticated USING (true);

-- 2. Refresh function — SECURITY DEFINER so it bypasses RLS on source tables
CREATE OR REPLACE FUNCTION public.refresh_dashboard_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total_records        int;
  v_active_employees     int;
  v_total_gross          numeric;
  v_total_net            numeric;
  v_total_mandatory      numeric;
  v_total_loan_deds      numeric;
  v_processed_count      int;
  v_pending_count        int;
  v_period_net           numeric;
  v_active_loan_accounts int;
  v_unassigned_count     int;
  v_group_stats          jsonb;
  v_ded_totals           jsonb;
  v_recent_employees     jsonb;
  v_current_period       jsonb;
  v_current_period_id    uuid;
BEGIN
  -- Employee counts
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Active')
  INTO v_total_records, v_active_employees
  FROM employees;

  -- Payroll entry aggregates
  SELECT
    COALESCE(SUM(gross_pay), 0),
    COALESCE(SUM(net_pay), 0),
    COALESCE(SUM(dedlnr + dedmed + dedpag + dedtax), 0),
    COALESCE(SUM(other_deductions), 0),
    COUNT(*) FILTER (WHERE status = 'Posted'),
    COUNT(*) FILTER (WHERE status = 'Computed')
  INTO v_total_gross, v_total_net, v_total_mandatory, v_total_loan_deds,
       v_processed_count, v_pending_count
  FROM payroll_entries;

  -- Current period
  SELECT id, to_jsonb(p)
  INTO v_current_period_id, v_current_period
  FROM pay_periods p
  ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
  LIMIT 1;

  -- Net pay for current period
  SELECT COALESCE(SUM(net_pay), 0)
  INTO v_period_net
  FROM payroll_entries
  WHERE pay_period_id = v_current_period_id;

  -- Active loan accounts
  SELECT COUNT(*)
  INTO v_active_loan_accounts
  FROM payroll_deductions
  WHERE type = 'Loan' AND status = 'Active';

  -- Payroll group counts
  SELECT COALESCE(json_agg(json_build_object(
    'id', g.id, 'group_code', g.group_code, 'group_name', g.group_name,
    'stacode_min', g.stacode_min, 'stacode_max', g.stacode_max,
    'count', (
      SELECT COUNT(*) FROM employees e
      WHERE e.status = 'Active'
        AND e.stacode ~ '^[0-9]+$'
        AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
    )
  ) ORDER BY g.stacode_min)::jsonb, '[]')
  INTO v_group_stats
  FROM payroll_groups g
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL;

  -- Unassigned count
  SELECT COUNT(*)
  INTO v_unassigned_count
  FROM employees e
  WHERE e.status = 'Active'
    AND NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode ~ '^[0-9]+$'
        AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
    );

  -- Top 8 deduction codes by total
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'total' DESC), '[]')
  INTO v_ded_totals
  FROM (
    SELECT jsonb_build_object(
      'code', pd.dedcode,
      'name', COALESCE(dc.dedname, pd.dedcode),
      'count', COUNT(*),
      'total', SUM(pd.dedamt)
    ) AS row
    FROM payroll_deductions pd
    LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
    WHERE pd.status = 'Active'
    GROUP BY pd.dedcode, dc.dedname
    ORDER BY SUM(pd.dedamt) DESC
    LIMIT 8
  ) sub;

  -- 5 most recently added employees
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'empno', e.empno, 'employee_number', e.employee_number,
    'fname', e.fname, 'first_name', e.first_name,
    'lname', e.lname, 'last_name', e.last_name,
    'poscode', e.poscode, 'position', e.position,
    'regcode', e.regcode, 'basic', e.basic, 'basic_salary', e.basic_salary
  )), '[]')
  INTO v_recent_employees
  FROM (SELECT * FROM employees ORDER BY created_at DESC LIMIT 5) e;

  -- Write to cache (upsert the singleton row)
  INSERT INTO dashboard_stats_cache (
    id, total_records, active_employees, total_gross, total_net,
    total_mandatory, total_loan_deds, processed_count, pending_count,
    period_net, active_loan_accounts, unassigned_count,
    group_stats, ded_totals_by_code, recent_employees, current_period, refreshed_at
  ) VALUES (
    1, v_total_records, v_active_employees, v_total_gross, v_total_net,
    v_total_mandatory, v_total_loan_deds, v_processed_count, v_pending_count,
    v_period_net, v_active_loan_accounts, v_unassigned_count,
    v_group_stats, v_ded_totals, v_recent_employees, v_current_period, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total_records        = EXCLUDED.total_records,
    active_employees     = EXCLUDED.active_employees,
    total_gross          = EXCLUDED.total_gross,
    total_net            = EXCLUDED.total_net,
    total_mandatory      = EXCLUDED.total_mandatory,
    total_loan_deds      = EXCLUDED.total_loan_deds,
    processed_count      = EXCLUDED.processed_count,
    pending_count        = EXCLUDED.pending_count,
    period_net           = EXCLUDED.period_net,
    active_loan_accounts = EXCLUDED.active_loan_accounts,
    unassigned_count     = EXCLUDED.unassigned_count,
    group_stats          = EXCLUDED.group_stats,
    ded_totals_by_code   = EXCLUDED.ded_totals_by_code,
    recent_employees     = EXCLUDED.recent_employees,
    current_period       = EXCLUDED.current_period,
    refreshed_at         = EXCLUDED.refreshed_at;
END;
$fn$;

-- 3. Trigger function — debounced via pg_notify so rapid bulk imports
--    only cause one refresh (the caller does SELECT refresh_dashboard_cache()
--    explicitly after bulk ops; triggers handle single-record changes)
CREATE OR REPLACE FUNCTION public._trig_refresh_dashboard_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM refresh_dashboard_cache();
  RETURN NULL;
END;
$fn$;

-- 4. Triggers on the three tables that affect dashboard numbers
--    Use STATEMENT-level triggers so a bulk import fires once, not per row
DROP TRIGGER IF EXISTS trg_dash_cache_employees ON employees;
CREATE TRIGGER trg_dash_cache_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH STATEMENT EXECUTE FUNCTION _trig_refresh_dashboard_cache();

DROP TRIGGER IF EXISTS trg_dash_cache_payroll_entries ON payroll_entries;
CREATE TRIGGER trg_dash_cache_payroll_entries
  AFTER INSERT OR UPDATE OR DELETE ON payroll_entries
  FOR EACH STATEMENT EXECUTE FUNCTION _trig_refresh_dashboard_cache();

DROP TRIGGER IF EXISTS trg_dash_cache_payroll_deds ON payroll_deductions;
CREATE TRIGGER trg_dash_cache_payroll_deds
  AFTER INSERT OR UPDATE OR DELETE ON payroll_deductions
  FOR EACH STATEMENT EXECUTE FUNCTION _trig_refresh_dashboard_cache();

-- 5. Callable RPC so the app can explicitly force a refresh
CREATE OR REPLACE FUNCTION public.request_dashboard_refresh()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT refresh_dashboard_cache(); $$;

GRANT EXECUTE ON FUNCTION public.request_dashboard_refresh() TO authenticated;

-- 6. Seed the cache right now with current data
SELECT refresh_dashboard_cache();
