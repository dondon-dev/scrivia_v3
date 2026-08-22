-- ============================================================
-- SERVER-SIDE PAYROLL ENGINE (run_payroll_engine)
--
-- The client previously fetched all deductions (paginated), computed
-- entries in the browser, and POSTed a multi-MB payload to an RPC —
-- dozens of sequential statements that could each trip the 120s
-- statement_timeout under load, plus a heavy network round-trip.
--
-- run_payroll_engine does the ENTIRE run in ONE database call and
-- ONE statement: it resolves the caller's division scope, validates
-- STACODEs, computes every employee's entry with the exact DepEd
-- formulas the client used (ported 1:1 from src/lib/payroll.ts and
-- src/lib/nthp.ts), and writes entries + employee summaries +
-- undeducted obligations atomically. Nothing is left to the client.
--
-- Per-row audit + statement-level dashboard refreshes are suppressed
-- for the run (transaction-scoped GUC), the dashboard is refreshed
-- exactly once at the end, and one summary audit row is written.
-- ============================================================

-- ── helper: deduction priority (port of getDeductionPriority) ──
CREATE OR REPLACE FUNCTION public._pd_priority(p_agency text, p_type text, p_dedcode text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN upper(COALESCE(p_agency, '')) = 'BIR' THEN 1
    WHEN upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH') THEN 2
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 3
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 4
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 5
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 6
    WHEN upper(COALESCE(p_dedcode, '')) = '0068' THEN 7
    WHEN upper(COALESCE(p_dedcode, '')) = '0216' THEN 8
    WHEN upper(COALESCE(p_dedcode, '')) = '0136' THEN 9
    WHEN upper(COALESCE(p_type, '')) IN ('C', 'COOPERATIVE') THEN 10
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%MBA%' THEN 11
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%PROVIDENT%'
      OR upper(COALESCE(p_dedcode, '')) LIKE '%PF%'
      OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 12
    WHEN upper(COALESCE(p_type, '')) = 'INSURANCE' THEN 13
    WHEN upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 14
    ELSE 15
  END;
$fn$;

-- ── helper: is a deduction a MANDATORY LOAN? (port of isMandatoryDeduction
--    AND type in L/LOAN, as used by separateMandatoryLoans) ──
CREATE OR REPLACE FUNCTION public._pd_mandatory_loan(p_agency text, p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT
    upper(COALESCE(p_type, '')) IN ('L', 'LOAN')
    AND (
      upper(COALESCE(p_agency, '')) = 'BIR'
      OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
      OR upper(COALESCE(p_agency, '')) = 'GSIS'
      OR (
        upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
        AND (
          upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
          OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
        )
      )
    );
$fn$;

-- ── helper: is a deduction MANDATORY at all (port of isMandatoryDeduction) ──
CREATE OR REPLACE FUNCTION public._pd_mandatory(p_agency text, p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT
    upper(COALESCE(p_agency, '')) = 'BIR'
    OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
    OR upper(COALESCE(p_agency, '')) = 'GSIS'
    OR (
      upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND (
        upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
        OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
      )
    );
$fn$;

-- ── helper: NTHP compliance (port of applyNthpCompliance).
--    p_available       = net before loans (after statutory mandatory deductions)
--    p_sorted          = jsonb array of APDS deductions, already filtered
--                        active + non-mandatory-loan, sorted by
--                        priority/effective-date/dedcode (FIFO)
--    p_mandatory_loans = total of mandatory loans (deducted unconditionally)
--    p_station         = employee's stacode (for undeducted obligations)
--    Returns { availableBalance, loanDeductionCapacity, actualLoanDeductions,
--              mandatoryLoanDeductions, finalNetPay, nthpStatus, undeducted[] } ──
CREATE OR REPLACE FUNCTION public._pd_compute(
  p_available numeric,
  p_sorted jsonb,
  p_mandatory_loans numeric,
  p_station text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_after numeric;          -- available balance after mandatory loans
  v_capacity numeric;
  v_remaining numeric;
  v_actual numeric := 0;
  v_net numeric;
  v_status text;
  v_elem jsonb;
  v_amount numeric;
  v_unded jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;   -- deducted loans in processing order (FIFO)
  v_last jsonb;
  v_desc text;
BEGIN
  v_after := round(p_available - COALESCE(p_mandatory_loans, 0), 2);
  v_capacity := round(v_after - 5000, 2);

  -- capacity <= 0 → ALL non-mandatory deductions become undeducted
  IF v_capacity <= 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
    LOOP
      v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
      IF v_amount <= 0 THEN CONTINUE; END IF;
      v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END LOOP;
    v_net := v_after;
    v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
    RETURN jsonb_build_object(
      'availableBalance', v_after,
      'loanDeductionCapacity', v_capacity,
      'actualLoanDeductions', 0,
      'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
      'finalNetPay', v_net,
      'nthpStatus', v_status,
      'undeducted', v_unded
    );
  END IF;

  -- Step 5 — process by priority/FIFO
  v_remaining := v_capacity;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
  LOOP
    v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
    IF v_remaining >= v_amount THEN
      v_remaining := round(v_remaining - v_amount, 2);
      v_actual := round(v_actual + v_amount, 2);
      v_log := v_log || v_elem;
    ELSE
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END IF;
  END LOOP;

  -- Step 7 — NTHP reversal: while net < 5000, move the LAST deducted loan
  -- (lowest priority, latest in line) into undeducted.
  v_net := round(v_after - v_actual, 2);
  WHILE v_net < 5000 AND jsonb_array_length(v_log) > 0 LOOP
    v_last := v_log->-1;
    v_log := v_log - jsonb_array_length(v_log) - 1;
    v_amount := round(COALESCE((v_last->>'dedamt')::numeric, 0), 2);
    v_actual := round(v_actual - v_amount, 2);
    v_unded := v_unded || jsonb_build_object(
      'deduction_code', v_last->>'dedcode',
      'deduction_description', COALESCE(v_last->>'dedname', v_last->>'dedcode'),
      'scheduled_amount', v_amount,
      'undeducted_amount', v_amount,
      'station_code', COALESCE(p_station, ''),
      'reason', 'NTHP Threshold Reached'
    );
    v_net := round(v_after - v_actual, 2);
  END LOOP;

  v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
  RETURN jsonb_build_object(
    'availableBalance', v_after,
    'loanDeductionCapacity', v_capacity,
    'actualLoanDeductions', v_actual,
    'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
    'finalNetPay', v_net,
    'nthpStatus', v_status,
    'undeducted', v_unded
  );
END;
$fn$;

-- ── the engine ──
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

  -- Division scope (same clamp as run_payroll_bulk / post_payroll)
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

  -- Never clear already-posted entries for this period
  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries; reverse the posted pay period first';
  END IF;

  -- STACODE validation (same gate as the client's Unassigned STACODE check)
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

  -- Suppress per-row audit + per-statement dashboard refreshes for this run
  PERFORM set_config('app.skip_audit', 'on', true);

  -- 1) Clear this division's previous computed entries + undeducted rows
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

    -- STEP 1 — gross (client passes only basic/pera/aca/rata/ontop/long;
    --           aca/rata/ontop are not part of monthly gross)
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
    -- withholding tax brackets (port of computeWithholdingTax)
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

    -- active deductions for this employee (empno fallback like the client)
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

    -- APDS deductions sorted by priority, then FIFO (effective date), then code
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

    -- undeducted obligations for this employee
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

  -- 3) Open the period (closed periods were rejected above; the
  --    trg_protect_closed_periods trigger stays active as a backstop)
  UPDATE pay_periods SET status = 'open' WHERE id = p_pay_period_id;

  -- 4) Refresh the dashboard once + single summary audit row
  PERFORM refresh_dashboard_cache();
  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_generate', 'pay_period', p_pay_period_id::text,
         jsonb_build_object(
           'entries', v_inserted,
           'employees_updated', v_updated,
           'undeducted', v_unded_written,
           'deleted', v_deleted,
           'engine', 'run_payroll_engine'
         )
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_updated', v_updated,
    'undeducted', v_unded_written,
    'deleted', v_deleted,
    'undeducted_amount', v_unded_total
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.run_payroll_engine(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._pd_priority(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._pd_mandatory_loan(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._pd_mandatory(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._pd_compute(numeric, jsonb, numeric, text) TO authenticated;
