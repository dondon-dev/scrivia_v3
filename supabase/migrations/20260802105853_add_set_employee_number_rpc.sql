/*
# Add set_employee_number RPC for super_admin

1. Purpose
   Allows a super_admin to edit the employee_number field of any user's profile
   from the User Management screen. Previously employee_number was read-only
   after registration — this lets admins correct typos or assign numbers.

2. RPC changes
   - New `set_employee_number(p_target_user uuid, p_employee_number text)` function.
   - SECURITY DEFINER, scoped to public search_path.
   - Only super_admin callers may invoke it (matches set_assigned_stacode pattern).
   - Writes NULL if the trimmed value is empty (so admins can clear it).
   - Logs the change to audit_logs.

3. Trigger update
   - `protect_profile_columns()` now also guards `employee_number` so non-super_admin
     users cannot change it via direct table updates.
*/

-- ── Step 1: Update protect_profile_columns to guard employee_number ──
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
    RAISE EXCEPTION 'Not authorized to change assigned STACODE';
  END IF;
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Not authorized to change employee number';
  END IF;
  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    RAISE EXCEPTION 'Not authorized to change MFA settings';
  END IF;
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'Not authorized to change email verification status';
  END IF;
  IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
    RAISE EXCEPTION 'Not authorized to change login attempt count';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'Not authorized to unlock accounts';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'Not authorized to change login timestamp';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'Not authorized to change login IP';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Step 2: Create set_employee_number RPC ──
CREATE OR REPLACE FUNCTION public.set_employee_number(p_target_user uuid, p_employee_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_old_emp_no text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT employee_number INTO v_old_emp_no FROM profiles WHERE id = p_target_user;

  UPDATE profiles
  SET employee_number = NULLIF(btrim(p_employee_number), '')
  WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_employee_number_change', 'profile', p_target_user,
  jsonb_build_object('old_employee_number', v_old_emp_no, 'new_employee_number', NULLIF(btrim(p_employee_number), ''))
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_employee_number(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION set_employee_number(uuid, text) TO authenticated;
