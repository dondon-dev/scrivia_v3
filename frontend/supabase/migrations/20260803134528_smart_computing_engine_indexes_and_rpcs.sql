-- ============================================================
-- SMART COMPUTING ENGINE — server-side pagination + aggregation
-- ============================================================

-- 1. Numeric stacode column for fast category range filtering
ALTER TABLE employees ADD COLUMN IF NOT EXISTS stacode_num int
  GENERATED ALWAYS AS (
    CASE WHEN stacode ~ '^[0-9]+$' THEN stacode::int ELSE NULL END
  ) STORED;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_employees_stacode_num ON employees(stacode_num);
CREATE INDEX IF NOT EXISTS idx_employees_lname ON employees(lname);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_payroll_group ON employees(payroll_group_id);
CREATE INDEX IF NOT EXISTS idx_employees_empno ON employees(empno);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_emp ON payroll_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period_status ON payroll_entries(pay_period_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_deds_empno ON payroll_deductions(empno);
CREATE INDEX IF NOT EXISTS idx_payroll_deds_dedcode ON payroll_deductions(dedcode);
CREATE INDEX IF NOT EXISTS idx_payroll_deds_status ON payroll_deductions(status);
CREATE INDEX IF NOT EXISTS idx_payroll_deds_employee ON payroll_deductions(employee_id);

CREATE INDEX IF NOT EXISTS idx_deductions_period ON deductions(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_deductions_period_code ON deductions(pay_period_id, deduction_code);

CREATE INDEX IF NOT EXISTS idx_deduction_codes_dedcode ON deduction_codes(dedcode);

-- 3. Employee list RPC
CREATE OR REPLACE FUNCTION public.query_employees(
  p_search text DEFAULT NULL,
  p_stacode_min int DEFAULT NULL,
  p_stacode_max int DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_stacode text DEFAULT NULL,
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

GRANT EXECUTE ON FUNCTION public.query_employees(text, int, int, text, uuid, text, int, int, boolean) TO authenticated;

-- 4. Payroll deductions list RPC
CREATE OR REPLACE FUNCTION public.query_payroll_deductions(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_type_filter text DEFAULT NULL,
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

GRANT EXECUTE ON FUNCTION public.query_payroll_deductions(text, text, text, int, int, boolean) TO authenticated;

-- 5. Deduction engine stats RPC
CREATE OR REPLACE FUNCTION public.get_deduction_engine_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH active_deds AS (
    SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status, dc.type, dc.agency, dc.active AS code_active
    FROM payroll_deductions pd
    LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  ),
  emp_gross AS (
    SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
    FROM employees WHERE status = 'Active'
  )
  SELECT jsonb_build_object(
    'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'grossPay', (SELECT total FROM emp_gross),
    'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'groupTotals', (
      SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT
          CASE
            WHEN agency = 'GSIS' THEN 'gsis'
            WHEN agency = 'BIR' THEN 'bir'
            WHEN agency = 'PHILHEALTH' THEN 'philhealth'
            WHEN agency = 'PAGIBIG' THEN 'pagibig'
            WHEN agency = 'DEPED' THEN 'deped'
            WHEN agency = 'INSURANCE' THEN 'insurance'
            WHEN agency = 'BANK' THEN 'banks'
            WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
            WHEN agency = 'ASSOCIATION' THEN 'associations'
            WHEN type = 'Loan' THEN 'loans'
            ELSE 'others'
          END AS group_id,
          COUNT(*) AS count,
          SUM(dedamt) AS amount
        FROM active_deds
        WHERE ded_status = 'Active' AND code_active = true
        GROUP BY 1
      ) g
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_deduction_engine_stats() TO authenticated;

-- 6. Payroll register totals RPC
CREATE OR REPLACE FUNCTION public.get_payroll_register_totals(
  p_period_id uuid DEFAULT NULL,
  p_emp_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'totalGross', COALESCE(SUM(gross_pay), 0),
    'totalDedlnr', COALESCE(SUM(dedlnr), 0),
    'totalDedmed', COALESCE(SUM(dedmed), 0),
    'totalDedpag', COALESCE(SUM(dedpag), 0),
    'totalDedtax', COALESCE(SUM(dedtax), 0),
    'totalOtherDeds', COALESCE(SUM(COALESCE(actual_loan_deductions, other_deductions, 0)), 0),
    'totalDeductions', COALESCE(SUM(total_deductions), 0),
    'totalNet', COALESCE(SUM(net_pay), 0),
    'totalUndeducted', COALESCE(SUM(COALESCE(undeducted_amount, 0)), 0),
    'nthpFails', COUNT(*) FILTER (WHERE nthp_status = 'FAIL'),
    'entryCount', COUNT(*)
  )
  FROM payroll_entries
  WHERE (p_period_id IS NULL OR pay_period_id = p_period_id)
    AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;

GRANT EXECUTE ON FUNCTION public.get_payroll_register_totals(uuid, uuid[]) TO authenticated;

-- 7. Deductions summary RPC
CREATE OR REPLACE FUNCTION public.get_deductions_summary(
  p_period_id uuid,
  p_emp_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'totalCount', COUNT(*),
    'totalAmount', COALESCE(SUM(amount), 0),
    'codeCount', COUNT(DISTINCT deduction_code),
    'empCount', COUNT(DISTINCT employee_id)
  )
  FROM deductions
  WHERE pay_period_id = p_period_id
    AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;

GRANT EXECUTE ON FUNCTION public.get_deductions_summary(uuid, uuid[]) TO authenticated;

-- 8. Payroll group employee counts RPC
CREATE OR REPLACE FUNCTION public.get_payroll_group_counts()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT payroll_group_id AS group_id, COUNT(*) AS count
    FROM employees
    WHERE status = 'Active' AND payroll_group_id IS NOT NULL
    GROUP BY payroll_group_id
  ) row;
$$;

GRANT EXECUTE ON FUNCTION public.get_payroll_group_counts() TO authenticated;
