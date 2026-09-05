-- FAST PAYROLL ENGINE v3 — chunked set-based, no window functions
-- Processes employees in batches to avoid lock timeout.

DROP FUNCTION IF EXISTS run_payroll_engine(uuid);

CREATE OR REPLACE FUNCTION run_payroll_engine(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_inserted int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_unded_total numeric := 0;
  v_actual_loans_total numeric := 0;
  v_chunk_size int := 200;
  v_offset int := 0;
  v_total_emps int;
  r_emp employees%ROWTYPE;
  r_ded RECORD;
  v_basic numeric;
  v_pera numeric;
  v_long numeric;
  v_gross numeric;
  v_dedlnr numeric;
  v_dedmed numeric;
  v_dedpag numeric;
  v_dedtax numeric;
  v_govtlnr numeric;
  v_govtecc numeric;
  v_govtmed numeric;
  v_govtpag numeric;
  v_taxable numeric;
  v_mandatory numeric;
  v_available numeric;
  v_cap numeric;
  v_entry_id uuid;
  v_ded_amount numeric;
  v_deducted_this numeric;
  v_netsalary numeric;
  v_ded_name text;
  v_ref text;
BEGIN
  SET LOCAL statement_timeout = '20 min';
  SET LOCAL lock_timeout = '30s';

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

  -- Clear previous computed data
  DELETE FROM deductions WHERE employee_id = ANY(v_employee_ids)
    AND pay_period_id = p_pay_period_id AND source = 'Payroll Run';
  DELETE FROM undeducted_obligations WHERE employee_id = ANY(v_employee_ids)
    AND pay_period_id = p_pay_period_id;
  v_deleted := (SELECT count(*) FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND status <> 'Posted');
  DELETE FROM payroll_entries WHERE pay_period_id = p_pay_period_id
    AND employee_id = ANY(v_employee_ids) AND status <> 'Posted';

  -- Count total active employees
  SELECT count(*) INTO v_total_emps FROM employees
    WHERE id = ANY(v_employee_ids) AND status = 'Active';

  -- ── CHUNKED PROCESSING ──
  LOOP
    FOR r_emp IN
      SELECT e.* FROM employees e
      WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
      ORDER BY e.id
      LIMIT v_chunk_size OFFSET v_offset
    LOOP
      v_basic := COALESCE(r_emp.basic, r_emp.basic_salary, 0);
      v_pera  := COALESCE(r_emp.pera, 0);
      v_long  := COALESCE(r_emp.long, 0);
      v_gross := v_basic + v_pera + v_long;

      v_dedlnr  := round(v_basic * 0.09, 2);
      v_govtlnr := round(v_basic * 0.12, 2);
      v_govtecc := 100;

      IF v_basic >= 100000 THEN
        v_dedmed  := floor(5000.0 * 100 / 2) / 100;
        v_govtmed := round(5000.0 - floor(5000.0 * 100 / 2) / 100, 2);
      ELSE
        v_dedmed  := round(v_basic * 0.025, 2);
        v_govtmed := round(v_basic * 0.025, 2);
      END IF;

      v_dedpag  := 200;
      v_govtpag := 200;

      v_taxable := v_basic - v_dedlnr - v_dedmed - v_dedpag;
      v_dedtax := CASE WHEN v_taxable > 20833 THEN round((v_taxable - 20833) * 0.15, 2) ELSE 0 END;

      v_mandatory := v_dedlnr + v_dedmed + v_dedpag + v_dedtax;
      v_available := v_gross - v_mandatory;
      v_cap := GREATEST(0, v_available - 5000);
      v_entry_id := gen_random_uuid();
      v_ref := v_entry_id::text;

      -- Mandatory deductions (inline batch inserts)
      INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
      SELECT r_emp.id, p_pay_period_id, code, name, 'Mandatory', amt, 'Payroll Run', v_ref
      FROM (VALUES
        ('0003', 'GSIS PERSONAL SHARE', v_dedlnr),
        ('0111', 'PHILHEALTH', v_dedmed),
        ('0222', 'PAGIBIG FUND', v_dedpag),
        ('0036', 'WITHHOLDING TAX', v_dedtax)
      ) AS t(code, name, amt)
      WHERE t.amt > 0;

      -- Loan deductions with NTHP
      v_deducted_this := 0;

      FOR r_ded IN
        SELECT pd.dedcode, pd.dedamt, pd.agency,
               COALESCE(dc.dedname, pd.dedcode) as dedname,
               COALESCE(dc.type, 'Loan') as ded_type
        FROM payroll_deductions pd
        LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
        WHERE pd.employee_id = r_emp.id
          AND pd.status = 'Active' AND pd.dedamt > 0
          AND pd.dedcode NOT IN ('0003', '0036', '0111', '0222')
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
          END
      LOOP
        v_ded_amount := round(COALESCE(r_ded.dedamt, 0), 2);
        IF v_ded_amount <= 0 THEN CONTINUE; END IF;
        v_ded_name := r_ded.dedname;

        IF v_cap >= v_ded_amount THEN
          v_cap := v_cap - v_ded_amount;
          v_deducted_this := v_deducted_this + v_ded_amount;
          v_actual_loans_total := v_actual_loans_total + v_ded_amount;
          INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
          VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, v_ded_name, 'Loan', v_ded_amount, 'Payroll Run', v_ref);
        ELSE
          v_unded_total := v_unded_total + v_ded_amount;
          v_unded_written := v_unded_written + 1;
          INSERT INTO undeducted_obligations (employee_id, pay_period_id, deduction_code, deduction_description, undeducted_amount, scheduled_amount, station_code, reason)
          VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, v_ded_name, v_ded_amount, v_ded_amount, COALESCE(r_emp.stacode, ''), 'NTHP Threshold Reached');
        END IF;

        IF (v_gross - v_mandatory - v_deducted_this) < 5000 THEN
          v_cap := 0;
          v_deducted_this := v_deducted_this - v_ded_amount;
          v_actual_loans_total := v_actual_loans_total - v_ded_amount;
          DELETE FROM deductions WHERE employee_id = r_emp.id AND pay_period_id = p_pay_period_id
            AND deduction_code = r_ded.dedcode AND source = 'Payroll Run' AND reference = v_ref;
          IF NOT EXISTS (SELECT 1 FROM undeducted_obligations WHERE employee_id = r_emp.id AND pay_period_id = p_pay_period_id AND deduction_code = r_ded.dedcode) THEN
            v_unded_total := v_unded_total + v_ded_amount;
            v_unded_written := v_unded_written + 1;
            INSERT INTO undeducted_obligations (employee_id, pay_period_id, deduction_code, deduction_description, undeducted_amount, scheduled_amount, station_code, reason)
            VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, v_ded_name, v_ded_amount, v_ded_amount, COALESCE(r_emp.stacode, ''), 'NTHP Threshold Reached');
          END IF;
          EXIT;
        END IF;
      END LOOP;

      -- Compute net pay and insert entry
      v_netsalary := v_gross - v_mandatory - v_deducted_this;

      INSERT INTO payroll_entries (
        id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
        status, processed_at, dedlnr, dedmed, dedpag, dedtax,
        govtlnr, govtecc, govtmed, govtpag, other_deductions, nthp_status,
        undeducted_amount, actual_loan_deductions, available_balance,
        mandatory_deductions, loan_deduction_capacity
      ) VALUES (
        v_entry_id, r_emp.id, p_pay_period_id, v_gross,
        v_mandatory + v_deducted_this, v_netsalary,
        'Computed', now(),
        v_dedlnr, v_dedmed, v_dedpag, v_dedtax,
        v_govtlnr, v_govtecc, v_govtmed, v_govtpag,
        v_deducted_this,
        CASE WHEN v_netsalary >= 5000 THEN 'PASS' ELSE 'FAIL' END,
        (SELECT COALESCE(sum(undeducted_amount), 0) FROM undeducted_obligations WHERE employee_id = r_emp.id AND pay_period_id = p_pay_period_id),
        v_deducted_this, v_available,
        v_mandatory, GREATEST(0, v_available - 5000)
      );

      v_inserted := v_inserted + 1;
    END LOOP;

    v_offset := v_offset + v_chunk_size;
    EXIT WHEN v_offset >= v_total_emps;
  END LOOP;

  -- Upsert run summary
  INSERT INTO payroll_run_summaries (
    pay_period_id, employee_count, total_gross, total_deductions, total_net,
    nthp_pass_count, nthp_fail_count, total_undeducted, processed_at
  )
  SELECT
    p_pay_period_id, count(*),
    COALESCE(SUM(gross_pay), 0), COALESCE(SUM(total_deductions), 0),
    COALESCE(SUM(net_pay), 0),
    count(*) FILTER (WHERE nthp_status = 'PASS'),
    count(*) FILTER (WHERE nthp_status = 'FAIL'),
    v_unded_total, now()
  FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)
  ON CONFLICT (pay_period_id) DO UPDATE SET
    employee_count = EXCLUDED.employee_count,
    total_gross = EXCLUDED.total_gross,
    total_deductions = EXCLUDED.total_deductions,
    total_net = EXCLUDED.total_net,
    nthp_pass_count = EXCLUDED.nthp_pass_count,
    nthp_fail_count = EXCLUDED.nthp_fail_count,
    total_undeducted = EXCLUDED.total_undeducted,
    processed_at = EXCLUDED.processed_at;

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

SELECT pg_notify('pgrst', 'reload schema');
