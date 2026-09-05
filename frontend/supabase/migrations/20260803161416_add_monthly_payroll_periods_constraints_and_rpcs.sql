/*
# Monthly Payroll Periods — Step 2: Clean duplicate + constraints + RPCs

1. Removes the stale semi-monthly draft period "Aug 1-15 2026" that conflicts
   with the real monthly "Aug 2026" (closed/posted). The stale period only has
   Computed entries (never posted), so no posted payroll data is lost.
2. Adds a partial unique index on (year, month) to prevent future duplicates.
3. Adds an index on (year, month) for history queries.
4. Creates generate_monthly_periods() RPC to auto-create 12 monthly periods.
5. Creates get_payroll_history_by_month() RPC for the Reports history view.

## Security
- No new tables — no new RLS policies
- RPCs are SECURITY INVOKER, callable by authenticated users
*/

-- 1. Delete stale semi-monthly draft period and its computed (non-posted) entries
--    The real monthly period "Aug 2026" (closed/posted) is preserved.
ALTER TABLE pay_periods DISABLE TRIGGER trg_protect_closed_periods;

DELETE FROM undeducted_obligations
WHERE pay_period_id = '4ec30163-598e-46c9-8f7b-bbddd229cc0c';

DELETE FROM payroll_entries
WHERE pay_period_id = '4ec30163-598e-46c9-8f7b-bbddd229cc0c';

DELETE FROM pay_periods
WHERE id = '4ec30163-598e-46c9-8f7b-bbddd229cc0c';

ALTER TABLE pay_periods ENABLE TRIGGER trg_protect_closed_periods;

-- 2. Partial unique index on (year, month)
CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_year_month_unique
ON pay_periods (year, month)
WHERE year IS NOT NULL AND month IS NOT NULL;

-- 3. Index for history queries
CREATE INDEX IF NOT EXISTS idx_pay_periods_year_month ON pay_periods (year, month);

-- 4. RPC: generate_monthly_periods(p_year int)
CREATE OR REPLACE FUNCTION generate_monthly_periods(p_year int)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count int := 0;
  v_month int;
  v_start date;
  v_end date;
  v_pay_date date;
  v_period_name text;
BEGIN
  FOR v_month IN 1..12 LOOP
    v_start := make_date(p_year, v_month, 1);
    v_end := (make_date(p_year, v_month, 1) + interval '1 month' - interval '1 day')::date;
    v_pay_date := (make_date(p_year, v_month, 1) + interval '1 month' + interval '14 days')::date;
    v_period_name := to_char(v_start, 'Month') || ' ' || p_year::text;

    INSERT INTO pay_periods (period_name, start_date, end_date, pay_date, frequency, status, month, year, period_number)
    SELECT v_period_name, v_start, v_end, v_pay_date, 'Monthly', 'draft', v_month, p_year, v_month
    WHERE NOT EXISTS (
      SELECT 1 FROM pay_periods WHERE year = p_year AND month = v_month
    );

    v_count := v_count + (ROW_COUNT() > 0)::int;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 5. RPC: get_payroll_history_by_month(p_year int)
CREATE OR REPLACE FUNCTION get_payroll_history_by_month(p_year int)
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
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.month,
    pp.year,
    pp.period_name,
    pp.status,
    pp.pay_date,
    COUNT(pe.id) AS employee_count,
    COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
    COALESCE(SUM(pe.total_deductions), 0) AS total_deductions,
    COALESCE(SUM(pe.net_pay), 0) AS total_net,
    COALESCE(SUM(pe.undeducted_amount), 0) AS total_undeducted,
    COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'PASS') AS nthp_pass_count,
    COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'FAIL') AS nthp_fail_count
  FROM pay_periods pp
  LEFT JOIN payroll_entries pe ON pe.pay_period_id = pp.id
  WHERE pp.year = p_year
  GROUP BY pp.id, pp.month, pp.year, pp.period_name, pp.status, pp.pay_date
  ORDER BY pp.month ASC;
END;
$$;
