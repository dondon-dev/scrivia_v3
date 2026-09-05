-- reverse_payroll: un-post a closed pay period so entries can be edited/deleted again.
-- Only super_admin can reverse. Entries flip Posted -> Computed, period closed -> draft.
CREATE OR REPLACE FUNCTION reverse_payroll(p_pay_period_id uuid)
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
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status <> 'closed' THEN
    RAISE EXCEPTION 'Pay period is not posted — nothing to reverse';
  END IF;

  SELECT count(*) INTO v_entry_count
    FROM payroll_entries WHERE pay_period_id = p_pay_period_id;

  UPDATE payroll_entries
    SET status = 'Computed'
    WHERE pay_period_id = p_pay_period_id;

  UPDATE pay_periods
    SET status = 'draft'
    WHERE id = p_pay_period_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_entry_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION reverse_payroll(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION reverse_payroll(uuid) TO authenticated;
