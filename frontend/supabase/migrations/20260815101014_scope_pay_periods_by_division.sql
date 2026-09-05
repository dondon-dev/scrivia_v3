/*
# Per-Division Payroll Periods

Each division owns its own monthly payroll periods, so one division creating,
running or locking a month no longer blocks another division from doing the
same. REGCODE + DIVCODE are the unique reference for one division's payroll
(see the scoping work in 20260815_scope_by_regcode_divcode.sql).

Changes:
1. Adds `regcode` / `divcode` columns to pay_periods (nullable — legacy rows
   created before scoping carry no codes).
2. Replaces the global (year, month) unique index with:
   - a per-division unique index on (year, month, regcode, divcode), and
   - a legacy unique index that keeps the old one-period-per-month rule for
     rows that still have no codes.
3. Recreates generate_monthly_periods() with optional p_regcode / p_divcode so
   a division can generate its own full year without touching other divisions.
4. get_payroll_history_by_month() gains the same optional scope params.

## Security
- No new tables / policies. Period rows are not sensitive by themselves, but
  every screen that consumes them is scoped by REGCODE/DIVCODE client-side and
  the entries inside a period are division-scoped via the employee link.
*/

-- 1. Division codes on pay_periods
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS regcode text,
  ADD COLUMN IF NOT EXISTS divcode text;

-- 2. Per-division uniqueness: one period per (year, month) per division.
DROP INDEX IF EXISTS pay_periods_year_month_unique;
CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_year_month_div_unique
  ON pay_periods (year, month, regcode, divcode)
  WHERE year IS NOT NULL AND month IS NOT NULL AND regcode IS NOT NULL AND divcode IS NOT NULL;

-- Legacy rows (no codes): keep the original one-period-per-month rule.
CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_year_month_legacy_unique
  ON pay_periods (year, month)
  WHERE year IS NOT NULL AND month IS NOT NULL AND regcode IS NULL AND divcode IS NULL;

CREATE INDEX IF NOT EXISTS idx_pay_periods_divcode ON pay_periods (regcode, divcode);

-- 3. RPC: generate_monthly_periods(p_year, p_regcode, p_divcode)
--    Creates 12 monthly periods scoped to the given division (NULL codes keep
--    the legacy behavior of a single global set of periods).
DROP FUNCTION IF EXISTS generate_monthly_periods(int);
CREATE OR REPLACE FUNCTION generate_monthly_periods(p_year int, p_regcode text DEFAULT NULL, p_divcode text DEFAULT NULL)
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

    INSERT INTO pay_periods (period_name, start_date, end_date, pay_date, frequency, status, month, year, period_number, regcode, divcode)
    SELECT v_period_name, v_start, v_end, v_pay_date, 'Monthly', 'draft', v_month, p_year, v_month, p_regcode, p_divcode
    WHERE NOT EXISTS (
      SELECT 1 FROM pay_periods
      WHERE year = p_year
        AND month = v_month
        AND regcode IS NOT DISTINCT FROM p_regcode
        AND divcode IS NOT DISTINCT FROM p_divcode
    );

    v_count := v_count + (ROW_COUNT() > 0)::int;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. RPC: get_payroll_history_by_month(p_year, p_regcode, p_divcode)
DROP FUNCTION IF EXISTS get_payroll_history_by_month(int);
CREATE OR REPLACE FUNCTION get_payroll_history_by_month(p_year int, p_regcode text DEFAULT NULL, p_divcode text DEFAULT NULL)
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
    AND (p_regcode IS NULL OR pp.regcode = p_regcode)
    AND (p_divcode IS NULL OR pp.divcode = p_divcode)
  GROUP BY pp.id, pp.month, pp.year, pp.period_name, pp.status, pp.pay_date
  ORDER BY pp.month ASC;
END;
$$;
