/*
# Fix Role-Level Function and Login Trigger Conflicts

## Problem
After expanding the role system from 4 roles to 11, three issues prevent
non-super-admin users from accessing the system:

1. `has_role_level(p_min_role text)` still references the OLD 4 role names
   (`encoder`, `viewer`) and does not recognize any of the 7 new roles
   (`payroll_processor`, `accounting_officer`, `hr_administrator`,
   `school_coordinator`, `division_finance`, `auditor`, `school_head`,
   `ess`, `read_only`). Every RLS INSERT/UPDATE/DELETE policy on payroll
   tables calls this function, so all write operations fail for users
   with any role other than super_admin or payroll_admin.

2. `record_successful_login()` was switched to SECURITY INVOKER but updates
   `failed_login_attempts`, `locked_until`, and `last_login_at` on the
   caller's own profile. The `protect_profile_columns` BEFORE UPDATE
   trigger blocks non-super_admin users from changing those columns,
   causing the login RPC to throw an exception — which crashes the
   signIn flow for every non-admin user.

3. `mark_email_verified()` has the same problem — it updates
   `email_verified` which the trigger also guards.

## Fix
1. Rewrite `has_role_level` to use the full 11-role hierarchy:
     read_only < ess < school_head < school_coordinator < auditor <
     division_finance < hr_administrator < accounting_officer <
     payroll_processor < payroll_admin < super_admin
   Any role at or above the minimum level passes.

2. Add an UPDATE exemption in `protect_profile_columns` so the two
   SECURITY INVOKER login functions can update the caller's own login
   tracking columns and email_verified flag. The trigger already allows
   super_admin through; for non-super_admin we now skip the column
   guards when the update is to the caller's OWN row (auth.uid() = NEW.id)
   AND only the login/email-verified columns are changing. Role,
   assigned_stacode, and employee_number remain protected.
*/

-- ============================================================================
-- 1. Rewrite has_role_level with the 11-role hierarchy
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_role_level(p_min_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_rank(rn, role_name) AS (
    VALUES
      (1, 'read_only'),
      (2, 'ess'),
      (3, 'school_head'),
      (4, 'school_coordinator'),
      (5, 'auditor'),
      (6, 'division_finance'),
      (7, 'hr_administrator'),
      (8, 'accounting_officer'),
      (9, 'payroll_processor'),
      (10, 'payroll_admin'),
      (11, 'super_admin')
  )
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_rank caller ON caller.role_name = p.role
    JOIN role_rank minimum ON minimum.role_name = p_min_role
    WHERE p.id = auth.uid()
      AND caller.rn >= minimum.rn
  );
$$;

-- ============================================================================
-- 2. Update protect_profile_columns to allow self-update of login columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_self_update boolean;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- Allow users to update their OWN login-tracking and email-verified columns
  -- via the SECURITY INVOKER functions (record_successful_login, mark_email_verified).
  -- Guarded columns (role, assigned_stacode, employee_number) remain protected.
  v_is_self_update := (auth.uid() = NEW.id AND auth.uid() = OLD.id);

  IF v_is_self_update THEN
    -- Block self-escalation of guarded columns
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not authorized to change role';
    END IF;
    IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
      RAISE EXCEPTION 'Not authorized to change assigned STACODE';
    END IF;
    IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
      RAISE EXCEPTION 'Not authorized to change employee number';
    END IF;
    -- Allow self-update of login tracking + email_verified + mfa_enabled
    RETURN NEW;
  END IF;

  -- Non-self updates by non-super_admin: block everything sensitive
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

-- Re-grant execute (recreating the function resets grants)
REVOKE EXECUTE ON FUNCTION public.has_role_level(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_level(text) TO authenticated;
