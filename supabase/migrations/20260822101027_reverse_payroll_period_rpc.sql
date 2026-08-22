/*
# reverse_payroll_period(uuid) — whole-period reversal for super admins

The existing reverse_payroll() has two paths:
- with employee ids (division-scoped): works on OPEN periods, but the caller
  must supply the exact employee ids — the UI derives them from the entries
  the client can see, so a stale/empty client view leaves no way to reverse.
- without employee ids (whole period): requires the period to be CLOSED
  ("Pay period is not posted — nothing to reverse" otherwise).

This adds a single RPC that reverses EVERY posted entry in a pay period
server-side — no employee ids needed, works on OPEN periods too, and reopens
CLOSED periods to draft. Restricted to super_admin. The payroll_entries
protect trigger already permits the Posted -> Computed status flip for
super_admin with no financial-field changes, and the audit trigger records
the reversal.

## Security
- super_admin only (same gate as reverse_payroll).
- No new tables / policies.
*/

CREATE OR REPLACE FUNCTION public.reverse_payroll_period(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_reversed int;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  UPDATE payroll_entries
    SET status = 'Computed'
    WHERE pay_period_id = p_pay_period_id AND status = 'Posted';
  GET DIAGNOSTICS v_reversed = ROW_COUNT;

  -- A closed (fully posted) period is reopened so it can be edited/run again.
  IF v_period_status = 'closed' THEN
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_reversed, 'whole_period', true)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_reversed);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reverse_payroll_period(uuid) TO authenticated;
