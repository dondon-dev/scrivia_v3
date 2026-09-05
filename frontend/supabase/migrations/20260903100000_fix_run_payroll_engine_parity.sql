-- FIX: Make run_payroll_engine match client-side computation (payroll.ts + nthp.ts)
-- This ensures parity between server RPC and client syncPayrollForEmployees
-- Key fixes:
-- 1. Use full TRAIN law tax brackets (not simplified 15% only)
-- 2. Include all earnings in gross pay (hazard, salary diff, other compensation)
-- 3. Apply INCLUDED/EXCLUDED priority bands (GAA order)
-- 4. Proper mandatory loan detection (GSIS/Pag-IBIG loans, not just overpayment codes)
-- 5. Match NTHP reversal logic (last-deducted-first)

-- Helper function for tax calculation (TRAIN law brackets)
-- Mirrors computeWithholdingTax in payroll.ts
CREATE OR REPLACE FUNCTION _compute_withholding_tax(p_taxable numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_ti numeric := GREATEST(0, p_taxable);
  v_tax numeric := 0;
BEGIN
  IF v_ti <= 20833 THEN
    v_tax := 0;
  ELSIF v_ti <= 33333 THEN
    v_tax := (v_ti - 20833) * 0.15;
  ELSIF v_ti <= 66667 THEN
    v_tax := 1875 + (v_ti - 33333) * 0.20;
  ELSIF v_ti <= 166667 THEN
    v_tax := 8541.67 + (v_ti - 66667) * 0.25;
  ELSIF v_ti <= 666667 THEN
    v_tax := 33541.67 + (v_ti - 166667) * 0.30;
  ELSE
    v_tax := 183541.67 + (v_ti - 666667) * 0.35;
  END IF;
  RETURN round(v_tax, 2);
END;
$$;

-- Helper function for deduction priority (mirrors getDeductionPriority in nthp.ts)
CREATE OR REPLACE FUNCTION _get_deduction_priority(p_agency text, p_type text, p_dedcode text) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_a text := upper(p_agency);
  v_t text := upper(p_type);
  v_dc text := upper(p_dedcode);
BEGIN
  -- Mandatory (Step 2)
  IF v_a = 'BIR' THEN RETURN 1; END IF;
  IF v_a IN ('PHIC','PHILHEALTH') THEN RETURN 2; END IF;
  IF v_a = 'GSIS' AND v_t NOT IN ('L','LOAN') THEN RETURN 3; END IF;
  IF v_a = 'GSIS' AND v_t IN ('L','LOAN') THEN RETURN 4; END IF;
  IF v_a IN ('HDMF','PAGIBIG','PAG-IBIG') AND v_t NOT IN ('L','LOAN') THEN RETURN 5; END IF;
  IF v_a IN ('HDMF','PAGIBIG','PAG-IBIG') AND v_t IN ('L','LOAN') THEN RETURN 6; END IF;

  -- APDS (Step 5)
  IF v_t IN ('C','COOPERATIVE') THEN RETURN 7; END IF;
  IF v_dc LIKE '%MBA%' THEN RETURN 8; END IF;
  IF v_t IN ('PROVIDENT','SAVINGS') OR v_dc LIKE '%PROVIDENT%' OR v_dc LIKE '%PF%' THEN RETURN 9; END IF;
  IF v_a = 'DEPED' AND v_t IN ('L','LOAN') THEN RETURN 9; END IF;
  IF v_t = 'INSURANCE' OR (v_t IN ('PROVIDENT','SAVINGS') AND v_a = 'OTHER') THEN RETURN 11; END IF;
  IF v_t IN ('L','LOAN') AND v_a = 'OTHER' THEN RETURN 13; END IF;
  IF v_t IN ('PROVIDENT','SAVINGS') THEN RETURN 11; END IF;
  IF v_t IN ('L','LOAN') THEN RETURN 13; END IF;
  RETURN 13;
END;
$$;

-- Helper function for effective priority with INCLUDED/EXCLUDED bands (mirrors getEffectiveDeductionPriority)
CREATE OR REPLACE FUNCTION _get_effective_priority(p_agency text, p_type text, p_dedcode text, p_row_priority int) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_base int := _get_deduction_priority(p_agency, p_type, p_dedcode);
BEGIN
  IF p_row_priority = 2 THEN RETURN 1000 + v_base; END IF;  -- EXCLUDED
  IF p_row_priority = 1 THEN RETURN -1000 + v_base; END IF; -- INCLUDED
  RETURN v_base;
END;
$$;

-- Helper function to check if mandatory loan deduction (mirrors isMandatoryDeduction)
CREATE OR REPLACE FUNCTION _is_mandatory_deduction(p_agency text, p_type text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_a text := upper(p_agency);
  v_t text := upper(p_type);
BEGIN
  RETURN v_a = 'BIR' OR v_a IN ('PHIC','PHILHEALTH') OR v_a = 'GSIS'
    OR (v_a IN ('HDMF','PAGIBIG','PAG-IBIG') AND (v_t IN ('L','LOAN','MANDATORY','PROVIDENT','SAVINGS')));
END;
$$;

DROP FUNCTION IF EXISTS public.run_payroll_engine(uuid);

CREATE OR REPLACE FUNCTION public.run_payroll_engine(p_pay_period_id uuid)
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
  v_chunk_size int := 500;
  v_offset int := 0;
  v_total_emps int;
  r_emp employees%ROWTYPE;
  r_ded RECORD;
  v_basic numeric;
  v_pera numeric;
  v_aca numeric;
  v_rata numeric;
  v_ontop numeric;
  v_long numeric;
  v_hazard numeric;
  v_sal_diff numeric;
  v_other_comp numeric;
  v_other_earn numeric;
  v_gross numeric;
  v_taxable numeric;
  v_dedtax numeric;
  v_dedmed numeric;
  v_dedlnr numeric;
  v_dedpag numeric;
  v_govtlnr numeric;
  v_govtecc numeric;
  v_govtmed numeric;
  v_govtpag numeric;
  v_mandatory_loans_total numeric := 0;
  v_mandatory_deductions numeric;
  v_available numeric;
  v_cap numeric;
  v_entry_id uuid;
  v_ded_amount numeric;
  v_deducted_this numeric;
  v_netsalary numeric;
  v_ded_name text;
  v_ref text;
  v_emp_empno text;
  v_priority int;
  v_eff_ym int;
  v_last_idx int;
  v_last jsonb;
  v_last_code text;
  v_last_name text;
  v_last_amount numeric;
BEGIN
  SET LOCAL statement_timeout = '15 min';

  -- Authorization
  SELECT lower(btrim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin','payroll_admin','payroll_processor','payroll_officer','hr_administrator') THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  -- Get period
  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN RAISE EXCEPTION 'Pay period not found'; END IF;
  IF v_period.status = 'closed' THEN RAISE EXCEPTION 'Pay period is closed'; END IF;

  -- Scope employees
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

  -- Guard against overwriting posted entries
  IF EXISTS (
    SELECT 1 FROM payroll_entries pe
    WHERE pe.pay_period_id = p_pay_period_id
      AND pe.employee_id = ANY(v_employee_ids)
      AND pe.status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries. Reverse the period first.';
  END IF;

  -- Clear previous run data for scoped employees
  DELETE FROM deductions WHERE employee_id = ANY(v_employee_ids)
    AND pay_period_id = p_pay_period_id AND source = 'Payroll Run';
  DELETE FROM undeducted_obligations WHERE employee_id = ANY(v_employee_ids)
    AND pay_period_id = p_pay_period_id;
  v_deleted := (SELECT count(*) FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND status <> 'Posted');
  DELETE FROM payroll_entries WHERE pay_period_id = p_pay_period_id
    AND employee_id = ANY(v_employee_ids) AND status <> 'Posted';

  SELECT count(*) INTO v_total_emps FROM employees
    WHERE id = ANY(v_employee_ids) AND status = 'Active';

  LOOP
    FOR r_emp IN
      SELECT e.* FROM employees e
      WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
      ORDER BY e.id
      LIMIT v_chunk_size OFFSET v_offset
    LOOP
      -- Employee compensation
      v_basic := COALESCE(r_emp.basic, r_emp.basic_salary, 0);
      v_pera  := COALESCE(r_emp.pera, 0);
      v_aca   := COALESCE(r_emp.aca, 0);
      v_rata  := COALESCE(r_emp.rata, 0);
      v_ontop := COALESCE(r_emp.ontop, 0);
      v_long  := COALESCE(r_emp.long, 0);
      v_hazard := COALESCE(r_emp.hazard_pay, 0);
      v_sal_diff := COALESCE(r_emp.salary_differential, 0);
      v_other_comp := COALESCE(r_emp.other_compensation, 0);
      v_other_earn := COALESCE(r_emp.other_earnings, 0);
      v_emp_empno := COALESCE(r_emp.empno, r_emp.employee_number, '');

      -- STEP 1: Gross Pay (matches computeGrossPay)
      v_gross := v_basic + v_pera + v_long + v_hazard + v_sal_diff + v_other_comp + v_other_earn;

      -- STEP 2: Mandatory Deductions (statutory premiums)
      v_dedlnr := round(v_basic * 0.09, 2);

      -- PhilHealth: total = basic * 5% (capped at 5000), employee = floor(total/2)
      IF v_basic >= 100000 THEN
        v_dedmed := floor(5000.0 * 100 / 2) / 100;  -- 2500.00
        v_govtmed := round(5000.0 - floor(5000.0 * 100 / 2) / 100, 2); -- 2500.00
      ELSE
        v_dedmed := round(v_basic * 0.025, 2);
        v_govtmed := round(v_basic * 0.025, 2);
      END IF;

      v_dedpag := 200.00;
      v_govtpag := 200.00;
      v_govtlnr := round(v_basic * 0.12, 2);
      v_govtecc := 100.00;

      -- STEP 2b: Mandatory loan deductions (GSIS policy/emergency, Pag-IBIG MPL/calamity)
      v_mandatory_loans_total := 0;
      FOR r_ded IN
        SELECT pd.dedcode, pd.dedamt, COALESCE(dc.dedname, pd.dedcode) as dedname,
               COALESCE(dc.agency, '') as agency, COALESCE(dc.type, '') as type
        FROM payroll_deductions pd
        LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
        WHERE pd.empno = v_emp_empno AND pd.status = 'Active' AND pd.dedamt > 0
          AND _is_mandatory_deduction(COALESCE(dc.agency, ''), COALESCE(dc.type, ''))
          AND upper(COALESCE(dc.type, '')) IN ('L','LOAN')
      LOOP
        v_mandatory_loans_total := v_mandatory_loans_total + round(COALESCE(r_ded.dedamt, 0), 2);
      END LOOP;

      -- Taxable income = basic - GSIS premium - PhilHealth - Pag-IBIG
      v_taxable := GREATEST(0, v_basic - v_dedlnr - v_dedmed - v_dedpag);
      v_dedtax := _compute_withholding_tax(v_taxable);

      v_mandatory_deductions := v_dedlnr + v_dedmed + v_dedpag + v_dedtax + v_mandatory_loans_total;

      -- STEP 3: Available Balance
      v_available := v_gross - v_mandatory_deductions;
      v_cap := GREATEST(0, v_available - 5000);

      v_entry_id := gen_random_uuid();
      v_ref := v_entry_id::text;
      v_deducted_this := 0;

      -- Insert mandatory deductions (statutory)
      INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
      SELECT r_emp.id, p_pay_period_id, code, name, 'Mandatory', amt, 'Payroll Run', v_ref
      FROM (VALUES
        ('0036', 'WITHHOLDING TAX', v_dedtax),
        ('0111', 'PHILHEALTH', v_dedmed),
        ('0003', 'GSIS PERSONAL SHARE', v_dedlnr),
        ('0222', 'PAGIBIG FUND', v_dedpag)
      ) AS t(code, name, amt)
      WHERE t.amt > 0;

      -- Insert mandatory loan deductions
      FOR r_ded IN
        SELECT pd.dedcode, pd.dedamt, COALESCE(dc.dedname, pd.dedcode) as dedname
        FROM payroll_deductions pd
        LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
        WHERE pd.empno = v_emp_empno AND pd.status = 'Active' AND pd.dedamt > 0
          AND _is_mandatory_deduction(COALESCE(dc.agency, ''), COALESCE(dc.type, ''))
          AND upper(COALESCE(dc.type, '')) IN ('L','LOAN')
      LOOP
        v_ded_amount := round(COALESCE(r_ded.dedamt, 0), 2);
        IF v_ded_amount > 0 THEN
          INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
          VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, r_ded.dedname, 'Loan', v_ded_amount, 'Payroll Run', v_ref);
          v_deducted_this := v_deducted_this + v_ded_amount;
        END IF;
      END LOOP;

      -- STEP 5: APDS deductions by priority
      FOR r_ded IN
        SELECT pd.dedcode, pd.dedamt, pd.priority, pd.effyy, pd.effmm,
               COALESCE(dc.dedname, pd.dedcode) as dedname,
               COALESCE(dc.agency, '') as agency,
               COALESCE(dc.type, '') as type
        FROM payroll_deductions pd
        LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
        WHERE pd.empno = v_emp_empno AND pd.status = 'Active' AND pd.dedamt > 0
          AND NOT _is_mandatory_deduction(COALESCE(dc.agency, ''), COALESCE(dc.type, ''))
        ORDER BY
          _get_effective_priority(COALESCE(dc.agency, ''), COALESCE(dc.type, ''), pd.dedcode, pd.priority),
          COALESCE(pd.effyy, 9999) * 100 + COALESCE(pd.effmm, 99),
          pd.dedcode
      LOOP
        v_ded_amount := round(COALESCE(r_ded.dedamt, 0), 2);
        IF v_ded_amount <= 0 THEN CONTINUE; END IF;
        v_ded_name := r_ded.dedname;
        v_priority := _get_effective_priority(r_ded.agency, r_ded.type, r_ded.dedcode, r_ded.priority);
        v_eff_ym := COALESCE(r_ded.effyy, 9999) * 100 + COALESCE(r_ded.effmm, 99);

        IF v_cap >= v_ded_amount THEN
          -- Deduct full amount
          v_cap := v_cap - v_ded_amount;
          v_deducted_this := v_deducted_this + v_ded_amount;
          v_actual_loans_total := v_actual_loans_total + v_ded_amount;

          INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference)
          VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, v_ded_name, 'Loan', v_ded_amount, 'Payroll Run', v_ref);

        ELSE
          -- Move to Undeducted Obligations
          v_unded_total := v_unded_total + v_ded_amount;
          v_unded_written := v_unded_written + 1;
          INSERT INTO undeducted_obligations (employee_id, pay_period_id, deduction_code, deduction_description, undeducted_amount, scheduled_amount, station_code, reason)
          VALUES (r_emp.id, p_pay_period_id, r_ded.dedcode, v_ded_name, v_ded_amount, v_ded_amount, COALESCE(r_emp.stacode, ''), 'NTHP Threshold Reached');
        END IF;
      END LOOP;

      -- STEP 7: NTHP Reversal - ensure NetPay >= 5000
      -- Reverse last deducted loan first (LIFO) by querying deductions table
      v_netsalary := v_gross - v_mandatory_deductions - v_deducted_this;
      WHILE v_netsalary < 5000 LOOP
        -- Get last deducted loan for this employee in this run
        SELECT d.deduction_code, d.deduction_name, d.amount
        INTO v_last_code, v_last_name, v_last_amount
        FROM deductions d
        WHERE d.employee_id = r_emp.id
          AND d.pay_period_id = p_pay_period_id
          AND d.source = 'Payroll Run'
          AND d.reference = v_ref
          AND d.category = 'Loan'
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 1;

        IF v_last_code IS NULL THEN
          EXIT; -- No more loans to reverse
        END IF;

        -- Remove from deductions table
        DELETE FROM deductions
        WHERE employee_id = r_emp.id
          AND pay_period_id = p_pay_period_id
          AND deduction_code = v_last_code
          AND source = 'Payroll Run'
          AND reference = v_ref
          AND amount = v_last_amount
          AND category = 'Loan';

        v_deducted_this := GREATEST(0, v_deducted_this - v_last_amount);
        v_actual_loans_total := GREATEST(0, v_actual_loans_total - v_last_amount);

        -- Add to undeducted if not already there
        IF NOT EXISTS (
          SELECT 1 FROM undeducted_obligations
          WHERE employee_id = r_emp.id AND pay_period_id = p_pay_period_id
            AND deduction_code = v_last_code
        ) THEN
          v_unded_total := v_unded_total + v_last_amount;
          v_unded_written := v_unded_written + 1;
          INSERT INTO undeducted_obligations (employee_id, pay_period_id, deduction_code, deduction_description, undeducted_amount, scheduled_amount, station_code, reason)
          VALUES (r_emp.id, p_pay_period_id, v_last_code, v_last_name, v_last_amount, v_last_amount, COALESCE(r_emp.stacode, ''), 'NTHP Threshold Reached');
        END IF;

        -- Recalculate net
        v_netsalary := v_gross - v_mandatory_deductions - v_deducted_this;
      END LOOP;

      -- Final net pay (ensure non-negative)
      v_netsalary := GREATEST(0, v_gross - v_mandatory_deductions - v_deducted_this);

      INSERT INTO payroll_entries (
        id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
        status, processed_at, dedlnr, dedmed, dedpag, dedtax,
        govtlnr, govtecc, govtmed, govtpag, other_deductions, nthp_status,
        undeducted_amount, actual_loan_deductions, available_balance,
        mandatory_deductions, loan_deduction_capacity
      ) VALUES (
        v_entry_id, r_emp.id, p_pay_period_id, v_gross,
        v_mandatory_deductions + v_deducted_this, v_netsalary,
        'Computed', now(),
        v_dedlnr, v_dedmed, v_dedpag, v_dedtax,
        v_govtlnr, v_govtecc, v_govtmed, v_govtpag,
        GREATEST(0, v_deducted_this),
        CASE WHEN v_netsalary >= 5000 THEN 'PASS' ELSE 'FAIL' END,
        (SELECT COALESCE(sum(undeducted_amount), 0) FROM undeducted_obligations WHERE employee_id = r_emp.id AND pay_period_id = p_pay_period_id),
        GREATEST(0, v_deducted_this), GREATEST(0, v_available),
        v_mandatory_deductions, GREATEST(0, v_available - 5000)
      );

      v_inserted := v_inserted + 1;
    END LOOP;

    v_offset := v_offset + v_chunk_size;
    EXIT WHEN v_offset >= v_total_emps;
  END LOOP;

  -- Update run summary
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

-- Grants
GRANT EXECUTE ON FUNCTION public.run_payroll_engine(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');