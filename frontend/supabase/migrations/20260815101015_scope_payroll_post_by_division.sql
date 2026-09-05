-- Scope payroll posting / reversal to a division's employees.
--
-- Before: post_payroll() / reverse_payroll() operated on EVERY entry in the
-- pay period and flipped the shared period's status. One division posting its
-- payroll marked all divisions' entries as 'Posted' and locked the period for
-- everyone else — payroll leaked across divisions.
--
-- Now the RPCs accept the employee ids of the selected division (the frontend
-- passes the employees that carry that division's REGCODE/DIVCODE). The
-- scoped path only posts/reverses those employees' entries and leaves the
-- shared pay period open so each division posts independently. The legacy
-- whole-period behavior is kept (as a fallback) when no employee ids are
-- passed; the old single-argument functions are dropped so that path can only
-- be triggered explicitly.

DROP FUNCTION IF EXISTS public.post_payroll(uuid);
DROP FUNCTION IF EXISTS public.reverse_payroll(uuid);

CREATE OR REPLACE FUNCTION public.post_payroll(
  p_pay_period_id uuid,
  p_employee_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_violation_count integer;
  v_entry_count integer;
  v_employee_ids uuid[];
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized to post payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is already closed';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period posting (closes the shared period).
    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries SET status = 'Posted' WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'closed' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped posting: only the given employees' entries are posted.
    -- The shared pay period is left open so other divisions post independently.
    v_employee_ids := p_employee_ids;
    IF v_caller_role <> 'super_admin' THEN
      -- Server-enforced clamp: non-super-admins can only post their own
      -- division's employees (defense in depth against crafted ids). Matches
      -- by division_id first, then by REGCODE + DIVCODE for legacy rows.
      SELECT array_agg(e.id) INTO v_employee_ids
        FROM employees e
        JOIN profiles p ON p.id = auth.uid()
        LEFT JOIN divisions d ON d.id = p.division_id
        LEFT JOIN regions r ON r.id = d.region_id
        WHERE e.id = ANY(p_employee_ids)
          AND (
            e.division_id = p.division_id
            OR (
              r.region_code IS NOT NULL AND d.division_code IS NOT NULL
              AND e.regcode = r.region_code AND e.divcode = d.division_code
            )
          );
    END IF;
    IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids)
        AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries
      SET status = 'Posted'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_approve', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_posted', v_entry_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_payroll(
  p_pay_period_id uuid,
  p_employee_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_entry_count integer;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period reversal (requires a closed period).
    IF v_period_status <> 'closed' THEN
      RAISE EXCEPTION 'Pay period is not posted — nothing to reverse';
    END IF;
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped reversal: un-post only the given employees' entries and
    -- leave the shared period status untouched (other divisions may still be
    -- working on the same period).
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No posted entries to reverse for the selected division';
    END IF;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_entry_count);
END;
$$;

REVOKE ALL ON FUNCTION public.post_payroll(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payroll(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.reverse_payroll(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payroll(uuid, uuid[]) TO authenticated;
