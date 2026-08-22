-- ============================================================
-- Sync EXCLUDED DBF records into undeducted_obligations
--
-- The EXCLUDED.DBF file contains employees that the external
-- payroll system flagged as "excluded" (undeducted obligations).
-- After run_payroll_engine computes all entries, this syncs
-- those excluded records into undeducted_obligations so they
-- appear in the payroll register and Undeducted Obligations Report.
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_payroll_engine(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_payyy int;
  v_paymm int;
  v_unassigned int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_unded_total numeric := 0;
  v_rowcount int;
  r_emp record;
  v_basic numeric; v_pera numeric; v_long numeric;
  v_gross numeric; v_dedlnr numeric; v_dedmed numeric; v_dedpag numeric; v_dedtax numeric;
  v_govtlnr numeric; v_govtecc numeric; v_govtmed numeric; v_govtpag numeric;
  v_taxable numeric; v_mandatory numeric; v_available numeric;
  v_deds jsonb;
  v_sorted jsonb;
  v_mandatory_loans numeric;
  v_nthp jsonb;
  v_entry_id uuid;
  v_actual_total numeric;
  v_unded_amount numeric;
  v_paydate timestamptz;
  v_period_name text;
  r_excluded record;
  v_exc_emp_id uuid;
  v_exc_entry_id uuid;
  v_exc_count int := 0;
BEGIN
  SELECT lower(btrim(role)) INTO v_caller_role
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'payroll_officer', 'hr_administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period.status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is closed';
  END IF;

  -- Division scope
  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees;
  ELSE
    SELECT array_agg(e.id) INTO v_employee_ids
    FROM employees e
    JOIN profiles p ON p.id = auth.uid()
    LEFT JOIN divisions d ON d.id = p.division_id
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE (
      e.division_id = p.division_id
      OR (
        r.region_code IS NOT NULL AND d.division_code IS NOT NULL
        AND e.regcode = r.region_code AND e.divcode = d.division_code
      )
    );
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees found in your division scope';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries; reverse the posted pay period first';
  END IF;

  -- STACODE validation
  SELECT count(*) INTO v_unassigned
  FROM employees e
  WHERE e.id = ANY(v_employee_ids)
    AND (
      e.stacode IS NULL
      OR btrim(e.stacode) = ''
      OR e.stacode !~ '^[0-9]+$'
      OR NOT EXISTS (
        SELECT 1 FROM payroll_groups g
        WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
          AND (CASE WHEN e.stacode ~ '^[0-9]+$' THEN e.stacode::int BETWEEN g.stacode_min AND g.stacode_max ELSE false END)
      )
    );
  IF v_unassigned > 0 THEN
    RAISE EXCEPTION 'Cannot generate payroll: % employee(s) have invalid or unassigned STACODE. Please fix their STACODE or review the Unassigned STACODE Report before running payroll.', v_unassigned;
  END IF;

  v_payyy := v_period.year;
  v_paymm := v_period.month;
  v_paydate := v_period.pay_date;
  v_period_name := COALESCE(v_period.period_name, '');

  -- Suppress per-row audit + per-statement dashboard refreshes
  PERFORM set_config('app.skip_audit', 'on', true);

  -- 1) Clear previous computed entries + undeducted rows
  DELETE FROM undeducted_obligations
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  DELETE FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2) Compute every employee's entry
  FOR r_emp IN
    SELECT e.id,
           btrim(COALESCE(e.empno, e.employee_number, '')) AS empno,
           round(COALESCE(COALESCE(e.basic, e.basic_salary), 0), 2) AS basic,
           round(COALESCE(e.pera, 0), 2) AS pera,
           round(COALESCE(e.long, 0), 2) AS long,
           COALESCE(e.stacode, '') AS stacode
    FROM employees e
    WHERE e.id = ANY(v_employee_ids)
    ORDER BY e.id
  LOOP
    v_basic := r_emp.basic;
    v_pera := r_emp.pera;
    v_long := r_emp.long;

    -- STEP 1 — gross
    v_gross := round(v_basic + v_pera + v_long, 2);

    -- STEP 2 — statutory mandatory deductions
    v_dedlnr := round(v_basic * 0.09, 2);
    v_dedmed := round(v_basic * 0.0249998422961678, 2);
    v_dedpag := 200;
    v_govtlnr := round(v_basic * 0.12, 2);
    v_govtecc := 100;
    v_govtmed := round(v_basic * 0.0250001577038322, 2);
    v_govtpag := 200;
    v_taxable := greatest(0, v_basic - v_dedlnr - v_dedmed - v_dedpag);
    -- withholding tax brackets
    v_dedtax := round(CASE
      WHEN v_taxable <= 20833 THEN 0
      WHEN v_taxable <= 33333 THEN (v_taxable - 20833) * 0.15
      WHEN v_taxable <= 66667 THEN 1875 + (v_taxable - 33333) * 0.20
      WHEN v_taxable <= 166667 THEN 8541.67 + (v_taxable - 66667) * 0.25
      WHEN v_taxable <= 666667 THEN 33541.67 + (v_taxable - 166667) * 0.30
      ELSE 183541.67 + (v_taxable - 666667) * 0.35
    END, 2);
    v_mandatory := round(v_dedlnr + v_dedmed + v_dedpag + v_dedtax, 2);
    v_available := round(v_gross - v_mandatory, 2);

    -- active deductions for this employee
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', round(COALESCE(d.dedamt, 0), 2),
             'effyy', COALESCE(d.effyy, 0),
             'effmm', COALESCE(d.effmm, 0),
             'agency', COALESCE(c.agency, ''),
             'type', COALESCE(c.type, ''),
             'dedname', COALESCE(c.dedname, d.dedcode)
           )), '[]'::jsonb)
    INTO v_deds
    FROM payroll_deductions d
    LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
    WHERE (d.employee_id = r_emp.id OR (d.employee_id IS NULL AND btrim(COALESCE(d.empno, '')) = r_emp.empno AND r_emp.empno <> ''))
      AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
      AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      AND NOT (
        COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
        AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      );

    -- mandatory loans total
    SELECT COALESCE(sum(round(COALESCE((x->>'dedamt')::numeric, 0), 2)), 0)
    INTO v_mandatory_loans
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    -- APDS deductions sorted by priority
    SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_sorted
    FROM (
      SELECT jsonb_build_object(
        'dedcode', x.dedcode,
        'dedamt', x.dedamt,
        'agency', x.agency,
        'type', x.type,
        'dedname', x.dedname
      ) AS j
      FROM jsonb_to_recordset(v_deds) AS x(
        dedcode text, dedamt numeric, effyy int, effmm int,
        agency text, type text, dedname text
      )
      WHERE NOT _pd_mandatory(x.agency, x.type)
        AND NOT _pd_mandatory_loan(x.agency, x.type)
      ORDER BY
        _pd_priority(x.agency, x.type, x.dedcode),
        ((CASE WHEN x.effyy < 100 THEN 2000 + x.effyy ELSE x.effyy END) * 100 + x.effmm),
        x.dedcode
    ) s;

    v_nthp := public._pd_compute(v_available, v_sorted, v_mandatory_loans, r_emp.stacode);

    v_entry_id := gen_random_uuid();
    v_actual_total := round(
      COALESCE((v_nthp->>'actualLoanDeductions')::numeric, 0)
      + COALESCE((v_nthp->>'mandatoryLoanDeductions')::numeric, 0), 2);
    v_unded_amount := 0;
    SELECT COALESCE(sum(round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2)), 0)
    INTO v_unded_amount
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    v_unded_total := round(v_unded_total + v_unded_amount, 2);

    -- entry row
    INSERT INTO payroll_entries (
      id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
      status, processed_at, dedlnr, dedmed, dedpag, dedtax,
      govtlnr, govtecc, govtmed, govtpag,
      other_deductions, nthp_status, undeducted_amount, actual_loan_deductions,
      available_balance, mandatory_deductions, loan_deduction_capacity
    ) VALUES (
      v_entry_id, r_emp.id, p_pay_period_id,
      v_gross,
      round(v_mandatory + v_actual_total, 2),
      round((v_nthp->>'finalNetPay')::numeric, 2),
      'Computed', now(),
      v_dedlnr, v_dedmed, v_dedpag, v_dedtax,
      v_govtlnr, v_govtecc, v_govtmed, v_govtpag,
      v_actual_total,
      v_nthp->>'nthpStatus',
      v_unded_amount,
      v_actual_total,
      round((v_nthp->>'availableBalance')::numeric, 2),
      v_mandatory,
      round((v_nthp->>'loanDeductionCapacity')::numeric, 2)
    );
    v_inserted := v_inserted + 1;

    -- undeducted obligations from NTHP calculation
    INSERT INTO undeducted_obligations (
      payroll_entry_id, employee_id, pay_period_id,
      deduction_code, deduction_description,
      undeducted_amount, scheduled_amount, station_code, reason
    )
    SELECT
      v_entry_id, r_emp.id, p_pay_period_id,
      u->>'deduction_code',
      u->>'deduction_description',
      round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2),
      round(COALESCE((u->>'scheduled_amount')::numeric, 0), 2),
      COALESCE(u->>'station_code', ''),
      u->>'reason'
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_unded_written := v_unded_written + v_rowcount;

    -- employee summary fields
    UPDATE employees e SET
      dedlnr = v_dedlnr, dedmed = v_dedmed, dedpag = v_dedpag, dedtax = v_dedtax,
      govtlnr = v_govtlnr, govtecc = v_govtecc, govtmed = v_govtmed, govtpag = v_govtpag,
      netpay = round((v_nthp->>'finalNetPay')::numeric, 2),
      paydate = v_paydate
    WHERE e.id = r_emp.id;
    v_updated := v_updated + 1;
  END LOOP;

  -- 3) Sync EXCLUDED DBF records into undeducted_obligations
  --    For each excluded employee:
  --    a) Look up their actual deductions from payroll_deductions
  --    b) Calculate NTHP capacity (gross - mandatory - mandatory_loans - 5000)
  --    c) Walk deductions by priority; deduct while capacity allows
  --    d) When capacity exhausted, remaining deductions → undeducted (NTHP floor)
  --    e) If employee has NO payroll entry (not in scope), all deductions → undeducted
  FOR r_excluded IN
    SELECT ex.empno, ex.stacode, ex.reason, ex.remarks, ex.id AS dbf_id
    FROM dbf_excluded ex
    WHERE btrim(COALESCE(ex.payperiod, '')) = btrim(COALESCE(v_period_name, ''))
       OR ex.payperiod ~ ('^' || v_paymm || '.*' || v_payyy || '$')
       OR ex.payperiod ~ ('^' || v_payyy || '-' || lpad(v_paymm::text, 2, '0') || '-')
    ORDER BY ex.empno
  LOOP
    -- Find the employee by empno
    SELECT e.id INTO v_exc_emp_id
    FROM employees e
    WHERE btrim(COALESCE(e.empno, e.employee_number, '')) = r_excluded.empno
      AND e.id = ANY(v_employee_ids)
    LIMIT 1;

    IF v_exc_emp_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Find the payroll entry for this employee (if any)
    SELECT pe.id INTO v_exc_entry_id
    FROM payroll_entries pe
    WHERE pe.employee_id = v_exc_emp_id
      AND pe.pay_period_id = p_pay_period_id
    LIMIT 1;

    -- Get employee's gross and mandatory from entry (or compute)
    DECLARE
      v_exc_gross numeric := 0;
      v_exc_mandatory numeric := 0;
      v_exc_mand_loans numeric := 0;
      v_exc_capacity numeric := 0;
      v_exc_remaining numeric := 0;
      v_exc_ded record;
      v_exc_ded_amt numeric;
      v_exc_ded_applied numeric := 0;
      v_exc_ded_skipped numeric := 0;
    BEGIN
      IF v_exc_entry_id IS NOT NULL THEN
        SELECT gross_pay, mandatory_deductions INTO v_exc_gross, v_exc_mandatory
        FROM payroll_entries WHERE id = v_exc_entry_id;
      ELSE
        -- Compute from employee record
        SELECT round(COALESCE(COALESCE(e.basic, e.basic_salary), 0) + COALESCE(e.pera, 0) + COALESCE(e.long, 0), 2)
        INTO v_exc_gross FROM employees e WHERE e.id = v_exc_emp_id;
        v_exc_mandatory := round(v_exc_gross * 0.09 + v_exc_gross * 0.0249998422961678 + 200 +
          CASE WHEN greatest(0, COALESCE(v_exc_gross,0) - v_exc_gross*0.09 - v_exc_gross*0.0249998422961678 - 200) <= 20833 THEN 0
               WHEN greatest(0, COALESCE(v_exc_gross,0) - v_exc_gross*0.09 - v_exc_gross*0.0249998422961678 - 200) <= 33333 THEN (greatest(0, v_exc_gross - v_exc_gross*0.09 - v_exc_gross*0.0249998422961678 - 200) - 20833) * 0.15
               ELSE 0 END, 2);
      END IF;

      -- Capacity = gross - mandatory - 5000 (NTHP floor)
      v_exc_capacity := round(v_exc_gross - v_exc_mandatory - 5000, 2);
      v_exc_remaining := v_exc_capacity;

      -- Walk actual non-mandatory deductions by priority/FIFO.
      -- UNIQUE KEY = empno + dedcode + policyno + dedamt
      -- Only mark as undeducted if:
      --   a) Not already handled by the NTHP engine (no existing undeducted entry), AND
      --   b) Would breach the ₱5,000 NTHP floor
      FOR v_exc_ded IN
        SELECT d.dedcode, round(COALESCE(d.dedamt, 0), 2) AS dedamt,
               COALESCE(d.policyno, '') AS policyno,
               COALESCE(c.agency, '') AS agency, COALESCE(c.type, '') AS dtype,
               COALESCE(c.dedname, d.dedcode) AS dedname
        FROM payroll_deductions d
        LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
        WHERE (d.employee_id = v_exc_emp_id
               OR (d.employee_id IS NULL AND btrim(COALESCE(d.empno, '')) = r_excluded.empno AND r_excluded.empno <> ''))
          AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
          AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
          AND NOT (
            COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
            AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
          )
          AND NOT _pd_mandatory(d.agency, c.type)
          AND NOT _pd_mandatory_loan(d.agency, c.type)
        ORDER BY
          _pd_priority(c.agency, c.type, d.dedcode),
          ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)),
          d.dedcode
      LOOP
        v_exc_ded_amt := v_exc_ded.dedamt;
        IF v_exc_ded_amt <= 0 THEN CONTINUE; END IF;

        -- Check for duplicate: skip if NTHP engine already created an undeducted entry
        -- for this employee + dedcode + policyno + amount
        IF EXISTS (
          SELECT 1 FROM undeducted_obligations u
          WHERE u.employee_id = v_exc_emp_id
            AND u.pay_period_id = p_pay_period_id
            AND u.deduction_code = v_exc_ded.dedcode
            AND round(u.scheduled_amount, 2) = v_exc_ded_amt
        ) THEN
          CONTINUE;  -- Already handled by NTHP engine
        END IF;

        IF v_exc_remaining >= v_exc_ded_amt THEN
          -- Can deduct — employee has enough capacity
          v_exc_remaining := round(v_exc_remaining - v_exc_ded_amt, 2);
          v_exc_ded_applied := v_exc_ded_applied + v_exc_ded_amt;
        ELSE
          -- Cannot deduct — NTHP would drop below 5000
          INSERT INTO undeducted_obligations (
            payroll_entry_id, employee_id, pay_period_id,
            deduction_code, deduction_description,
            undeducted_amount, scheduled_amount, station_code, reason
          ) VALUES (
            v_exc_entry_id, v_exc_emp_id, p_pay_period_id,
            v_exc_ded.dedcode, v_exc_ded.dedname,
            v_exc_ded_amt, v_exc_ded_amt,
            r_excluded.stacode,
            'NTHP BELOW ₱5,000.00 (EXCLUDED)'
          );
          v_unded_written := v_unded_written + 1;
          v_exc_ded_skipped := v_exc_ded_skipped + 1;
        END IF;
      END LOOP;

      v_exc_count := v_exc_count + 1;
    END;
  END LOOP;

  -- 4) Open the period
  UPDATE pay_periods SET status = 'open' WHERE id = p_pay_period_id;

  -- 5) Refresh the dashboard + audit
  PERFORM refresh_dashboard_cache();
  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_generate', 'pay_period', p_pay_period_id::text,
         jsonb_build_object(
           'entries', v_inserted,
           'employees_updated', v_updated,
           'undeducted', v_unded_written,
           'excluded_synced', v_exc_count,
           'deleted', v_deleted,
           'engine', 'run_payroll_engine'
         )
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_updated', v_updated,
    'undeducted', v_unded_written,
    'excluded_synced', v_exc_count,
    'deleted', v_deleted,
    'undeducted_amount', v_unded_total
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.run_payroll_engine(uuid) TO authenticated;
