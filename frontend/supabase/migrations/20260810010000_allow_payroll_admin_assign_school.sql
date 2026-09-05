-- ============================================================================
-- Allow Payroll Administrators to assign a school (STACODE) to School Head and
-- School Payroll Coordinator accounts.
--
-- set_assigned_stacode was previously restricted to super_admin only. This
-- recreates it to also accept payroll_admin callers, but ONLY when the target
-- account holds a school-scoped role (school_coordinator / school_head).
-- Super Admins keep unrestricted assignment. Idempotent — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_assigned_stacode(p_target_user uuid, p_stacode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Payroll Administrators may only assign schools to school-scoped accounts
  -- (School Head / School Payroll Coordinator).
  IF v_caller_role = 'payroll_admin'
     AND v_target_role NOT IN ('school_coordinator', 'school_head') THEN
    RAISE EXCEPTION 'Payroll Administrators can only assign a school to School Head and School Payroll Coordinator accounts';
  END IF;

  UPDATE profiles SET assigned_stacode = NULLIF(btrim(p_stacode), '') WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_stacode_assignment', 'profile', p_target_user,
  jsonb_build_object('assigned_stacode', p_stacode)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_assigned_stacode(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION set_assigned_stacode(uuid, text) TO authenticated;
