-- Fix: run_payroll_engine must return all field names the frontend reads.
-- Engine previously returned 'employees_processed' / 'total_undeducted' but
-- the frontend reads 'entries' / 'employees_updated' / 'undeducted_amount' /
-- 'undeducted'. Include both old and new keys for compatibility.

CREATE OR REPLACE FUNCTION run_payroll_engine(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_inserted int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_unded_total numeric := 0;
  r_emp record;
  v_basic numeric; v_pera numeric; v_long numeric;
  v_gross numeric; v_dedlnr numeric; v_dedmed numeric; v_dedpag numeric; v_dedtax numeric;
  v_govtlnr numeric; v_govtecc numeric; v_govtmed numeric; v_govtpag numeric;
  v_taxable numeric; v_mandatory numeric; v_available numeric;
  v_entry_id uuid;
  v_entry_ids uuid[];
  v_emp_ids uuid[];
  v_gross_arr numeric[];
  v_total_ded_arr numeric[];
  v_net_pay_arr numeric[];
  v_dedlnr_arr numeric[];
  v_dedmed_arr numeric[];
  v_dedpag_arr numeric[];
  v_dedtax_arr numeric[];
  v_govtlnr_arr numeric[];
  v_govtecc_arr numeric[];
  v_govtmed_arr numeric[];
  v_govtpag_arr numeric[];
  v_other_ded_arr numeric[];
  v_nthp_status_arr text[];
  v_unded_arr numeric[];
  v_actual_loans_arr numeric[];
  v_avail_arr numeric[];
  v_mandatory_arr numeric[];
  v_loan_cap_arr numeric[];
BEGIN
  SET LOCAL statement_timeout = '10 min';
  SET LOCAL lock_timeout = '10 min';

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

  -- Clear previous computed entries
  DELETE FROM undeducted_obligations
    WHERE payroll_entry_id IN (
      SELECT id FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids)
        AND status <> 'Posted'
    );
  DELETE FROM payroll_entry_deductions
    WHERE payroll_entry_id IN (
      SELECT id FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids)
        AND status <> 'Posted'
    );
  v_deleted := (
    SELECT count(*) FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = Any(v_employee_ids)
      AND status <> 'Posted'
  );
  DELETE FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status <> 'Posted';

  -- Process each active employee
  FOR r_emp IN
    SELECT e.* FROM employees e
    WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
  LOOP
    v_basic := COALESCE(r_emp.basic, r_emp.basic_salary, 0);
    v_pera  := COALESCE(r_emp.pera, 0);
    v_long  := COALESCE(r_emp.long, 0);
    v_gross := v_basic + v_pera + v_long;

    -- GSIS Life & Retirement: 9% employee, 12% government
    v_dedlnr  := round(v_basic * 0.09, 2);
    v_govtlnr := round(v_basic * 0.12, 2);
    v_govtecc := 100;

    -- PhilHealth: 5% total, ceiling ₱100,000 → ₱5,000
    IF v_basic >= 100000 THEN
      v_dedmed  := floor(5000.0 * 100 / 2) / 100;
      v_govtmed := round(5000.0 - floor(5000.0 * 100 / 2) / 100, 2);
    ELSE
      v_dedmed  := round(v_basic * 0.025, 2);
      v_govtmed := round(v_basic * 0.025, 2);
    END IF;

    -- Pag-IBIG: fixed ₱200 employee, ₱200 government
    v_dedpag  := 200;
    v_govtpag := 200;

    -- BIR Withholding Tax (TRAIN Law)
    v_taxable := v_basic - v_dedlnr - v_dedmed - v_dedpag;
    v_dedtax  := CASE WHEN v_taxable > 20833
                   THEN round((v_taxable - 20833) * 0.15, 2)
                   ELSE 0 END;

    v_mandatory := v_dedlnr + v_dedmed + v_dedpag + v_dedtax;
    v_available := v_gross - v_mandatory;

    -- Accumulate bulk arrays
    v_entry_id    := gen_random_uuid();
    v_entry_ids   := array_append(v_entry_ids, v_entry_id);
    v_emp_ids     := array_append(v_emp_ids, r_emp.id);
    v_gross_arr   := array_append(v_gross_arr, v_gross);
    v_total_ded_arr := array_append(v_total_ded_arr, v_mandatory);
    v_net_pay_arr := array_append(v_net_pay_arr, v_gross - v_mandatory);
    v_dedlnr_arr  := array_append(v_dedlnr_arr, v_dedlnr);
    v_dedmed_arr  := array_append(v_dedmed_arr, v_dedmed);
    v_dedpag_arr  := array_append(v_dedpag_arr, v_dedpag);
    v_dedtax_arr  := array_append(v_dedtax_arr, v_dedtax);
    v_govtlnr_arr := array_append(v_govtlnr_arr, v_govtlnr);
    v_govtecc_arr := array_append(v_govtecc_arr, v_govtecc);
    v_govtmed_arr := array_append(v_govtmed_arr, v_govtmed);
    v_govtpag_arr := array_append(v_govtpag_arr, v_govtpag);
    v_other_ded_arr := array_append(v_other_ded_arr, 0);
    v_nthp_status_arr := array_append(v_nthp_status_arr,
      CASE WHEN (v_gross - v_mandatory) >= 5000 THEN 'PASS' ELSE 'FAIL' END);
    v_unded_arr   := array_append(v_unded_arr, 0);
    v_actual_loans_arr := array_append(v_actual_loans_arr, 0);
    v_avail_arr   := array_append(v_avail_arr, v_available);
    v_mandatory_arr := array_append(v_mandatory_arr, v_mandatory);
    v_loan_cap_arr := array_append(v_loan_cap_arr, v_available - 5000);
    v_inserted    := v_inserted + 1;
  END LOOP;

  -- Bulk insert payroll_entries
  IF v_inserted > 0 THEN
    INSERT INTO payroll_entries (
      id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
      status, processed_at, dedlnr, dedmed, dedpag, dedtax,
      govtlnr, govtecc, govtmed, govtpag, other_deductions, nthp_status,
      undeducted_amount, actual_loan_deductions, available_balance,
      mandatory_deductions, loan_deduction_capacity
    )
    SELECT
      unnest(v_entry_ids), unnest(v_emp_ids), p_pay_period_id,
      unnest(v_gross_arr), unnest(v_total_ded_arr), unnest(v_net_pay_arr),
      'Computed', now(),
      unnest(v_dedlnr_arr), unnest(v_dedmed_arr), unnest(v_dedpag_arr), unnest(v_dedtax_arr),
      unnest(v_govtlnr_arr), unnest(v_govtecc_arr), unnest(v_govtmed_arr), unnest(v_govtpag_arr),
      unnest(v_other_ded_arr), unnest(v_nthp_status_arr),
      unnest(v_unded_arr), unnest(v_actual_loans_arr),
      unnest(v_avail_arr), unnest(v_mandatory_arr), unnest(v_loan_cap_arr);
  END IF;

  -- Upsert run summary
  INSERT INTO payroll_run_summaries (
    pay_period_id, employee_count, total_gross, total_deductions, total_net,
    nthp_pass_count, nthp_fail_count, total_undeducted, processed_at
  )
  VALUES (
    p_pay_period_id, v_inserted,
    (SELECT COALESCE(sum(gross_pay), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT COALESCE(sum(total_deductions), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT COALESCE(sum(net_pay), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT count(*) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND nthp_status = 'PASS'),
    (SELECT count(*) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND nthp_status = 'FAIL'),
    v_unded_total, now()
  )
  ON CONFLICT (pay_period_id) DO UPDATE SET
    employee_count = EXCLUDED.employee_count,
    total_gross = EXCLUDED.total_gross,
    total_deductions = EXCLUDED.total_deductions,
    total_net = EXCLUDED.total_net,
    nthp_pass_count = EXCLUDED.nthp_pass_count,
    nthp_fail_count = EXCLUDED.nthp_fail_count,
    total_undeducted = EXCLUDED.total_undeducted,
    processed_at = EXCLUDED.processed_at;

  -- Return both old and new field names for frontend compatibility
  RETURN jsonb_build_object(
    'success', true,
    'entries', v_inserted,
    'employees_processed', v_inserted,
    'employees_updated', v_inserted,
    'total_undeducted', v_unded_total,
    'unducted_written', v_unded_written,
    'undeducted_amount', v_unded_total,
    'undeducted', v_unded_written,
    'deleted', v_deleted
  );
END;
$$;
