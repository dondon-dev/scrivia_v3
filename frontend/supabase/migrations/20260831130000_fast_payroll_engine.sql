-- FAST PAYROLL ENGINE — set-based bulk computation
-- Processes ALL employees in ONE statement instead of row-by-row loop.
-- 10-100x faster than the PL/pgSQL loop version.

DROP FUNCTION IF EXISTS run_payroll_engine(uuid);

CREATE OR REPLACE FUNCTION run_payroll_engine(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_inserted int;
  v_unded_written int;
  v_deleted int;
  v_unded_total numeric;
  v_actual_loans_total numeric;
BEGIN
  SET LOCAL statement_timeout = '15 min';

  -- Auth check
  SELECT lower(btrim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','payroll_admin','payroll_processor','payroll_officer','hr_administrator') THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN RAISE EXCEPTION 'Pay period not found'; END IF;
  IF v_period.status = 'closed' THEN RAISE EXCEPTION 'Pay period is closed'; END IF;

  -- Division scope
  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees;
  ELSE
    SELECT array_agg(e.id) INTO v_employee_ids FROM employees e
      JOIN profiles p ON p.id = auth.uid()
      LEFT JOIN divisions d ON d.id = p.division_id
      LEFT JOIN regions r ON r.id = d.region_id
      WHERE (e.division_id = p.division_id
        OR (r.region_code IS NOT NULL AND d.division_code IS NOT NULL
            AND e.regcode = r.region_code AND e.divcode = d.division_code));
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees found in your division scope';
  END IF;

  -- Block if any entries are already posted
  IF EXISTS (
    SELECT 1 FROM payroll_entries pe
    WHERE pe.pay_period_id = p_pay_period_id
      AND pe.employee_id = ANY(v_employee_ids)
      AND pe.status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries. Reverse the period first.';
  END IF;

  -- Clear previous computed data (bulk delete)
  DELETE FROM deductions
    WHERE employee_id = ANY(v_employee_ids)
      AND pay_period_id = p_pay_period_id
      AND source = 'Payroll Run';

  DELETE FROM undeducted_obligations
    WHERE employee_id = ANY(v_employee_ids)
      AND pay_period_id = p_pay_period_id;

  v_deleted := (
    SELECT count(*) FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status <> 'Posted'
  );
  DELETE FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status <> 'Posted';

  -- ── STEP 1: Compute all mandatory deductions in one CTE ──
  CREATE TEMPORARY TABLE _emp_calc ON COMMIT DROP AS
  WITH active_emps AS (
    SELECT e.id as employee_id,
           e.empno,
           COALESCE(e.basic, e.basic_salary, 0) as basic,
           COALESCE(e.pera, 0) as pera,
           COALESCE(e.long, 0) as long_val,
           COALESCE(e.stacode, '') as stacode
    FROM employees e
    WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
  ),
  with_mandatory AS (
    SELECT *,
           basic + pera + long_val as gross,
           -- GSIS Life & Retirement: 9% employee, 12% government
           round(basic * 0.09, 2) as dedlnr,
           round(basic * 0.12, 2) as govtlnr,
           100::numeric as govtecc,
           -- PhilHealth: 5% total, ceiling P100,000
           CASE WHEN basic >= 100000
                THEN floor(5000.0 * 100 / 2) / 100
                ELSE round(basic * 0.025, 2)
           END as dedmed,
           CASE WHEN basic >= 100000
                THEN round(5000.0 - floor(5000.0 * 100 / 2) / 100, 2)
                ELSE round(basic * 0.025, 2)
           END as govtmed,
           -- Pag-IBIG: fixed P200
           200::numeric as dedpag,
           200::numeric as govtpag
    FROM active_emps
  ),
  with_tax AS (
    SELECT *,
           round((basic - dedlnr - dedmed - dedpag - 20833) * 0.15, 2) as dedtax_raw
    FROM with_mandatory
  ),
  with_totals AS (
    SELECT *,
           CASE WHEN (basic - dedlnr - dedmed - dedpag) > 20833
                THEN dedtax_raw ELSE 0 END as dedtax,
           dedlnr + dedmed + dedpag + CASE WHEN (basic - dedlnr - dedmed - dedpag) > 20833 THEN dedtax_raw ELSE 0 END as mandatory,
           basic + pera + long_val - (dedlnr + dedmed + dedpag + CASE WHEN (basic - dedlnr - dedmed - dedpag) > 20833 THEN dedtax_raw ELSE 0 END) as available,
           GREATEST(0, basic + pera + long_val - (dedlnr + dedmed + dedpag + CASE WHEN (basic - dedlnr - dedmed - dedpag) > 20833 THEN dedtax_raw ELSE 0 END) - 5000) as cap
    FROM with_tax
  )
  SELECT * FROM with_totals;

  -- ── STEP 2: Insert mandatory deductions in bulk ──
  INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
  SELECT ec.employee_id, p_pay_period_id, code, name, 'Mandatory', amt, 'Payroll Run', ec.employee_id::text
  FROM _emp_calc ec
  CROSS JOIN (VALUES
    ('0003', 'GSIS PERSONAL SHARE', ec.dedlnr),
    ('0111', 'PHILHEALTH', ec.dedmed),
    ('0222', 'PAGIBIG FUND', ec.dedpag),
    ('0036', 'WITHHOLDING TAX', ec.dedtax)
  ) v(code, name, amt)
  WHERE v.amt > 0;

  -- ── STEP 3: Loan deductions with NTHP — process per employee using LATERAL ──
  -- First, compute loan deductions per employee in order of priority
  CREATE TEMPORARY TABLE _loan_results ON COMMIT DROP AS
  WITH loan_ranked AS (
    SELECT
      pd.employee_id,
      pd.dedcode,
      pd.dedamt,
      COALESCE(dc.dedname, pd.dedcode) as dedname,
      COALESCE(pd.effyy, '') as effyy,
      COALESCE(pd.effmm, '') as effmm,
      pd.policyno,
      pd.agency,
      COALESCE(dc.type, 'Loan') as ded_type,
      -- Priority ordering
      CASE
        WHEN upper(pd.agency) = 'BIR' THEN 1
        WHEN upper(pd.agency) IN ('PHIC','PHILHEALTH') THEN 2
        WHEN upper(pd.agency) = 'GSIS' AND upper(COALESCE(dc.type,'')) NOT IN ('L','LOAN') THEN 3
        WHEN upper(pd.agency) = 'GSIS' THEN 4
        WHEN upper(pd.agency) IN ('HDMF','PAGIBIG','PAG-IBIG') AND upper(COALESCE(dc.type,'')) NOT IN ('L','LOAN') THEN 5
        WHEN upper(pd.agency) IN ('HDMF','PAGIBIG','PAG-IBIG') THEN 6
        WHEN upper(COALESCE(dc.type,'')) IN ('C','COOPERATIVE') THEN 7
        WHEN upper(COALESCE(dc.type,'')) = 'MBA' THEN 8
        WHEN upper(COALESCE(dc.type,'')) IN ('P','PROVIDENT','SAVINGS') THEN 9
        WHEN upper(COALESCE(dc.type,'')) = 'INSURANCE' THEN 11
        ELSE 13
      END as priority,
      ROW_NUMBER() OVER (
        PARTITION BY pd.employee_id
        ORDER BY
          CASE
            WHEN upper(pd.agency) = 'BIR' THEN 1
            WHEN upper(pd.agency) IN ('PHIC','PHILHEALTH') THEN 2
            WHEN upper(pd.agency) = 'GSIS' AND upper(COALESCE(dc.type,'')) NOT IN ('L','LOAN') THEN 3
            WHEN upper(pd.agency) = 'GSIS' THEN 4
            WHEN upper(pd.agency) IN ('HDMF','PAGIBIG','PAG-IBIG') AND upper(COALESCE(dc.type,'')) NOT IN ('L','LOAN') THEN 5
            WHEN upper(pd.agency) IN ('HDMF','PAGIBIG','PAG-IBIG') THEN 6
            WHEN upper(COALESCE(dc.type,'')) IN ('C','COOPERATIVE') THEN 7
            WHEN upper(COALESCE(dc.type,'')) = 'MBA' THEN 8
            WHEN upper(COALESCE(dc.type,'')) IN ('P','PROVIDENT','SAVINGS') THEN 9
            WHEN upper(COALESCE(dc.type,'')) = 'INSURANCE' THEN 11
            ELSE 13
          END,
          COALESCE(pd.effyy, ''),
          COALESCE(pd.effmm, '')
      ) as rn
    FROM payroll_deductions pd
    LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
    INNER JOIN _emp_calc ec ON ec.employee_id = pd.employee_id
    WHERE pd.status = 'Active'
      AND pd.dedamt > 0
      AND pd.dedcode NOT IN ('0003', '0036', '0111', '0222')
  ),
  -- Running total of deductions per employee to determine capacity
  running AS (
    SELECT lr.*,
           ec.cap,
           ec.gross,
           ec.mandatory,
           ec.stacode,
           -- Running sum of deductions before this row
           COALESCE(SUM(lr.dedamt) OVER (
             PARTITION BY lr.employee_id ORDER BY lr.rn
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) as cum_before,
           -- Running sum including this row
           SUM(lr.dedamt) OVER (
             PARTITION BY lr.employee_id ORDER BY lr.rn
           ) as cum_after
    FROM loan_ranked lr
    JOIN _emp_calc ec ON ec.employee_id = lr.employee_id
  )
  SELECT *,
    -- Can deduct this row?
    CASE
      WHEN cum_before < cap AND cum_after <= cap THEN 'DEDUCT'
      WHEN cum_before < cap AND cum_after > cap THEN 'PARTIAL'  -- would exceed
      ELSE 'UNDEDUCTED'
    END as action,
    -- Actual amount to deduct (respecting NTHP cap)
    CASE
      WHEN cum_before < cap THEN
        LEAST(dedamt, GREATEST(0, cap - cum_before))
      ELSE 0
    END as deduct_amount,
    -- Amount that becomes undeducted
    CASE
      WHEN cum_before >= cap THEN dedamt
      WHEN cum_before < cap AND cum_after > cap THEN dedamt - GREATEST(0, cap - cum_before)
      ELSE 0
    END as undeduct_amount
  FROM running;

  -- ── STEP 4: Insert deducted loans ──
  INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
  SELECT employee_id, p_pay_period_id, dedcode, dedname, 'Loan', deduct_amount, 'Payroll Run', employee_id::text
  FROM _loan_results
  WHERE deduct_amount > 0;

  -- ── STEP 5: Insert undeducted obligations ──
  INSERT INTO undeducted_obligations (
    employee_id, pay_period_id, deduction_code, deduction_description,
    undeducted_amount, scheduled_amount, station_code, reason
  )
  SELECT employee_id, p_pay_period_id, dedcode, dedname,
         undeduct_amount, dedamt, stacode, 'NTHP Threshold Reached'
  FROM _loan_results
  WHERE undeduct_amount > 0;

  -- ── STEP 6: Compute totals and insert payroll entries in bulk ──
  WITH ded_totals AS (
    SELECT employee_id, SUM(amount) as total_loan_deductions
    FROM deductions
    WHERE pay_period_id = p_pay_period_id AND source = 'Payroll Run'
      AND employee_id IN (SELECT employee_id FROM _emp_calc)
    GROUP BY employee_id
  ),
  unded_totals AS (
    SELECT employee_id, SUM(undeducted_amount) as total_undeducted
    FROM undeducted_obligations
    WHERE pay_period_id = p_pay_period_id
      AND employee_id IN (SELECT employee_id FROM _emp_calc)
    GROUP BY employee_id
  ),
  final_entries AS (
    SELECT
      gen_random_uuid() as id,
      ec.employee_id,
      p_pay_period_id as pay_period_id,
      ec.gross as gross_pay,
      ec.mandatory + COALESCE(dt.total_loan_deductions, 0) as total_deductions,
      ec.gross - ec.mandatory - COALESCE(dt.total_loan_deductions, 0) as net_pay,
      'Computed' as status,
      now() as processed_at,
      ec.dedlnr, ec.dedmed, ec.dedpag, ec.dedtax,
      ec.govtlnr, ec.govtecc, ec.govtmed, ec.govtpag,
      COALESCE(dt.total_loan_deductions, 0) as other_deductions,
      CASE WHEN ec.gross - ec.mandatory - COALESCE(dt.total_loan_deductions, 0) >= 5000
           THEN 'PASS' ELSE 'FAIL' END as nthp_status,
      COALESCE(ut.total_undeducted, 0) as undeducted_amount,
      COALESCE(dt.total_loan_deductions, 0) as actual_loan_deductions,
      ec.available as available_balance,
      ec.mandatory as mandatory_deductions,
      ec.cap as loan_deduction_capacity
    FROM _emp_calc ec
    LEFT JOIN ded_totals dt ON dt.employee_id = ec.employee_id
    LEFT JOIN unded_totals ut ON ut.employee_id = ec.employee_id
  )
  INSERT INTO payroll_entries (
    id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
    status, processed_at, dedlnr, dedmed, dedpag, dedtax,
    govtlnr, govtecc, govtmed, govtpag, other_deductions, nthp_status,
    undeducted_amount, actual_loan_deductions, available_balance,
    mandatory_deductions, loan_deduction_capacity
  )
  SELECT * FROM final_entries;

  -- Get counts
  v_inserted := (SELECT count(*) FROM _emp_calc);
  v_unded_written := (SELECT count(*) FROM _loan_results WHERE undeduct_amount > 0);
  v_unded_total := (SELECT COALESCE(SUM(undeduct_amount), 0) FROM _loan_results WHERE undeduct_amount > 0);
  v_actual_loans_total := (SELECT COALESCE(SUM(deduct_amount), 0) FROM _loan_results WHERE deduct_amount > 0);

  -- Upsert run summary
  INSERT INTO payroll_run_summaries (
    pay_period_id, employee_count, total_gross, total_deductions, total_net,
    nthp_pass_count, nthp_fail_count, total_undeducted, processed_at
  )
  SELECT
    p_pay_period_id,
    count(*),
    COALESCE(SUM(gross_pay), 0),
    COALESCE(SUM(total_deductions), 0),
    COALESCE(SUM(net_pay), 0),
    count(*) FILTER (WHERE nthp_status = 'PASS'),
    count(*) FILTER (WHERE nthp_status = 'FAIL'),
    v_unded_total,
    now()
  FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id
    AND employee_id IN (SELECT employee_id FROM _emp_calc)
  ON CONFLICT (pay_period_id) DO UPDATE SET
    employee_count = EXCLUDED.employee_count,
    total_gross = EXCLUDED.total_gross,
    total_deductions = EXCLUDED.total_deductions,
    total_net = EXCLUDED.total_net,
    nthp_pass_count = EXCLUDED.nthp_pass_count,
    nthp_fail_count = EXCLUDED.nthp_fail_count,
    total_undeducted = EXCLUDED.total_undeducted,
    processed_at = EXCLUDED.processed_at;

  -- Cleanup
  DROP TABLE IF EXISTS _emp_calc;
  DROP TABLE IF EXISTS _loan_results;

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_processed', v_inserted,
    'employees_updated', v_inserted,
    'total_undeducted', v_unded_total,
    'unducted_written', v_unded_written,
    'undeducted_amount', v_unded_total,
    'undeducted', v_unded_written,
    'actual_loans_total', v_actual_loans_total,
    'deleted', v_deleted
  );
END;
$$;

-- Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
