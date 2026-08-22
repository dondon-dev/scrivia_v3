-- ============================================================
-- PAYROLL RUN BULK: MAKE THE FULL-SIZE RUN FAST AND TIMEOUT-PROOF
--
-- run_payroll_bulk already does the whole run in one statement
-- per table, but at full size (≈2,700 employees) the row-level
-- audit triggers still write ~8,000 audit_log rows per run and
-- the statement-level dashboard triggers recompute the dashboard
-- on every statement. Under load that accumulated trigger work
-- can still push a statement past the 120s statement_timeout.
--
-- Fix: a transaction-scoped GUC (app.skip_audit) checked by
--   * log_table_change()            → skips the per-row audit rows
--   * _trig_refresh_dashboard_cache() → skips the per-statement
--     dashboard recompute
-- run_payroll_bulk sets the GUC for its whole transaction, then
--   * refreshes the dashboard exactly once at the end, and
--   * writes one summary audit row per run (the existing
--     payroll_generate entry — counts included).
--
-- Outside a bulk run the GUC is unset, so every other operation
-- (smart imports, manual edits, posting) keeps full per-row
-- auditing and live dashboard refreshes exactly as before.
-- ============================================================

-- 1) Skip per-row audit rows when the bulk-run flag is set
CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_user_email text;
  v_record_id text;
BEGIN
  -- Bulk payroll runs (run_payroll_bulk) suppress per-row audit
  -- rows and write one summary row instead; see the migration
  -- 20260818_optimize_payroll_run_bulk_audit.sql.
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_action := TG_ARGV[0];
  v_record_id := COALESCE(NEW.id::text, OLD.id::text);

  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    v_user_email,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new', CASE WHEN TG_OP IN ('Insert','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2) Skip statement-level dashboard refreshes during a bulk run;
--    run_payroll_bulk refreshes the dashboard itself at the end.
CREATE OR REPLACE FUNCTION public._trig_refresh_dashboard_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM refresh_dashboard_cache();
  RETURN NULL;
END;
$fn$;

-- 3) run_payroll_bulk: set the GUC for the transaction, refresh the
--    dashboard once at the end, and keep the single summary audit row.
CREATE OR REPLACE FUNCTION public.run_payroll_bulk(
  p_pay_period_id uuid,
  p_entries jsonb,          -- computed payroll_entries rows (client-computed)
  p_employee_updates jsonb, -- employee summary-field updates
  p_undeducted jsonb        -- undeducted obligations
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_employee_ids uuid[];
  v_inserted int;
  v_updated int;
  v_unded int;
  v_deleted int;
BEGIN
  SELECT lower(btrim(role)) INTO v_caller_role
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'payroll_officer', 'hr_administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'No payroll entries to save';
  END IF;

  -- Reject crafted payloads that try to insert posted entries directly
  -- (clear error before any write; enforce_posted_entry_invariants also
  -- guards the INSERT itself).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_entries) r
    WHERE r->>'status' = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot insert posted entries via payroll run';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is closed';
  END IF;

  -- Scope: employee ids are derived from the payload, then clamped to the
  -- caller's division (defense in depth against crafted payloads).
  SELECT array_agg(DISTINCT (r->>'employee_id')::uuid) INTO v_employee_ids
  FROM jsonb_array_elements(p_entries) r
  WHERE (r->>'employee_id') IS NOT NULL;

  IF v_caller_role <> 'super_admin' THEN
    SELECT array_agg(e.id) INTO v_employee_ids
    FROM employees e
    JOIN profiles p ON p.id = auth.uid()
    LEFT JOIN divisions d ON d.id = p.division_id
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE e.id = ANY(v_employee_ids)
      AND (
        e.division_id = p.division_id
        OR (
          r.region_code IS NOT NULL AND d.division_code IS NOT NULL
          AND e.regcode = r.region_code AND e.divcode = d.division_code
        )
      );
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No payroll entries to save';
  END IF;

  -- Never clear already-posted entries (same guard as
  -- trg_protect_posted_entries, checked up front for a clear error).
  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries; reverse the posted pay period first';
  END IF;

  -- Suppress per-row audit rows + statement-level dashboard refreshes
  -- for the rest of this transaction (transaction-scoped GUC).
  PERFORM set_config('app.skip_audit', 'on', true);

  -- 1) Clear this division's previous computed entries + undeducted rows
  DELETE FROM undeducted_obligations
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);

  DELETE FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2) Insert computed entries (one multi-row statement)
  INSERT INTO payroll_entries (
    id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
    status, processed_at, dedlnr, dedmed, dedpag, dedtax,
    govtlnr, govtecc, govtmed, govtpag,
    other_deductions, nthp_status, undeducted_amount, actual_loan_deductions,
    available_balance, mandatory_deductions, loan_deduction_capacity
  )
  SELECT
    (r->>'id')::uuid,
    (r->>'employee_id')::uuid,
    p_pay_period_id,
    (r->>'gross_pay')::numeric,
    (r->>'total_deductions')::numeric,
    (r->>'net_pay')::numeric,
    'Computed',
    COALESCE((r->>'processed_at')::timestamptz, now()),
    (r->>'dedlnr')::numeric, (r->>'dedmed')::numeric,
    (r->>'dedpag')::numeric, (r->>'dedtax')::numeric,
    (r->>'govtlnr')::numeric, (r->>'govtecc')::numeric,
    (r->>'govtmed')::numeric, (r->>'govtpag')::numeric,
    COALESCE((r->>'other_deductions')::numeric, 0),
    COALESCE(r->>'nthp_status', 'PASS'),
    COALESCE((r->>'undeducted_amount')::numeric, 0),
    COALESCE((r->>'actual_loan_deductions')::numeric, 0),
    (r->>'available_balance')::numeric,
    COALESCE((r->>'mandatory_deductions')::numeric, 0),
    COALESCE((r->>'loan_deduction_capacity')::numeric, 0)
  FROM jsonb_array_elements(p_entries) r
  WHERE (r->>'employee_id')::uuid = ANY(v_employee_ids);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 3) Sync employee summary fields (net pay, govt totals, pay date)
  IF jsonb_typeof(p_employee_updates) = 'array'
     AND jsonb_array_length(p_employee_updates) > 0 THEN
    UPDATE employees e
    SET dedlnr = (u->>'dedlnr')::numeric,
        dedmed = (u->>'dedmed')::numeric,
        dedpag = (u->>'dedpag')::numeric,
        dedtax = (u->>'dedtax')::numeric,
        govtlnr = (u->>'govtlnr')::numeric,
        govtecc = (u->>'govtecc')::numeric,
        govtmed = (u->>'govtmed')::numeric,
        govtpag = (u->>'govtpag')::numeric,
        netpay = (u->>'netpay')::numeric,
        paydate = (u->>'paydate')::timestamptz
    FROM jsonb_array_elements(p_employee_updates) u
    WHERE e.id = (u->>'id')::uuid;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  -- 4) Undeducted obligations (only for entries that were actually
  --    inserted, so the payroll_entry_id FK can never dangle)
  IF jsonb_typeof(p_undeducted) = 'array'
     AND jsonb_array_length(p_undeducted) > 0 THEN
    INSERT INTO undeducted_obligations (
      payroll_entry_id, employee_id, pay_period_id,
      deduction_code, deduction_description,
      undeducted_amount, scheduled_amount, station_code, reason
    )
    SELECT
      (r->>'payroll_entry_id')::uuid,
      (r->>'employee_id')::uuid,
      p_pay_period_id,
      r->>'deduction_code',
      r->>'deduction_description',
      (r->>'undeducted_amount')::numeric,
      COALESCE((r->>'scheduled_amount')::numeric, 0),
      r->>'station_code',
      r->>'reason'
    FROM jsonb_array_elements(p_undeducted) r
    JOIN payroll_entries pe ON pe.id = (r->>'payroll_entry_id')::uuid
      AND pe.pay_period_id = p_pay_period_id
      AND pe.employee_id = ANY(v_employee_ids)
    WHERE (r->>'employee_id')::uuid = ANY(v_employee_ids);
    GET DIAGNOSTICS v_unded = ROW_COUNT;
  END IF;

  -- 5) Open the period (closed periods were rejected above; the
  --    trg_protect_closed_periods trigger stays active as a backstop)
  UPDATE pay_periods SET status = 'open' WHERE id = p_pay_period_id;

  -- 6) Refresh the dashboard once (replaces the suppressed per-statement
  --    refreshes) and write the single summary audit row for this run.
  PERFORM refresh_dashboard_cache();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_generate', 'pay_period', p_pay_period_id::text,
         jsonb_build_object(
           'entries', v_inserted,
           'employees_updated', v_updated,
           'undeducted', v_unded,
           'deleted', v_deleted
         )
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_updated', v_updated,
    'undeducted', v_unded,
    'deleted', v_deleted
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.run_payroll_bulk(uuid, jsonb, jsonb, jsonb) TO authenticated;
