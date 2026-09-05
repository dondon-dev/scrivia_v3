/*
# Expand Role System to 11 DepEd Payroll Roles

## Overview
Expands the user role system from 4 roles to 11 role types matching the DepEd
Payroll System specification. Adds an `assigned_stacode` column for
school-scoped roles.

## Changes to `profiles` table
- `role` CHECK constraint updated to allow 11 values:
    super_admin | payroll_admin | payroll_processor | accounting_officer |
    hr_administrator | school_coordinator | division_finance | auditor |
    school_head | ess | read_only
- `assigned_stacode` (text, nullable) — STACODE for school-scoped roles.

## Order of operations
1. Disable protect_profile_columns trigger (blocks direct role updates)
2. Drop old CHECK constraint
3. Backfill old role names (encoder->payroll_processor, viewer->read_only)
4. Add new CHECK constraint with 11 roles
5. Re-enable trigger
6. Add assigned_stacode column
7. Update set_user_role RPC
8. Update handle_new_user trigger
9. Update protect_profile_columns to guard assigned_stacode
10. Add set_assigned_stacode RPC

## RPC changes
- `set_user_role` accepts all 11 role values.
- `handle_new_user` default role changed to 'read_only'.
- `protect_profile_columns` now also guards `assigned_stacode`.
- New `set_assigned_stacode` RPC for super_admin.
*/

-- ── Step 1: Disable trigger that blocks direct role updates ──
ALTER TABLE profiles DISABLE TRIGGER trg_protect_profile_columns;

-- ── Step 2: Drop old CHECK constraint ──
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check1;

-- ── Step 3: Backfill old role names ──
UPDATE profiles SET role = 'payroll_processor' WHERE role = 'encoder';
UPDATE profiles SET role = 'read_only' WHERE role = 'viewer';

-- ── Step 4: Add new CHECK constraint with 11 roles ──
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
    'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
    'school_head', 'ess', 'read_only'
  ));

-- ── Step 5: Re-enable trigger ──
ALTER TABLE profiles ENABLE TRIGGER trg_protect_profile_columns;

-- ── Step 6: Add assigned_stacode column ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_stacode text;

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_stacode ON profiles(assigned_stacode);

-- ── Step 7: Update set_user_role RPC ──
CREATE OR REPLACE FUNCTION public.set_user_role(p_target_user uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_current_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_new_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
    'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
    'school_head', 'ess', 'read_only'
  ) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role INTO v_target_current_role FROM profiles WHERE id = p_target_user;
  IF v_target_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_target_user = auth.uid() AND p_new_role != 'super_admin' THEN
    RAISE EXCEPTION 'Cannot demote yourself';
  END IF;

  UPDATE profiles SET role = p_new_role WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_role_change', 'profile', p_target_user,
  jsonb_build_object('old_role', v_target_current_role, 'new_role', p_new_role)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

-- ── Step 8: Update handle_new_user trigger ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count int;
  assigned_role text;
  assigned_status text;
BEGIN
  SELECT count(*) INTO user_count FROM profiles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
    assigned_status := 'approved';
  ELSE
    assigned_role := 'read_only';
    assigned_status := 'pending_approval';
  END IF;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, mobile_number, username,
    role, email_verified, status,
    office_assignment, position_designation, employee_number
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    assigned_role,
    false,
    assigned_status,
    NULLIF(NEW.raw_user_meta_data->>'office_assignment', ''),
    NULLIF(NEW.raw_user_meta_data->>'position_designation', ''),
    NULLIF(NEW.raw_user_meta_data->>'employee_number', '')
  );
  RETURN NEW;
END;
$$;

-- ── Step 9: Update protect_profile_columns to also guard assigned_stacode ──
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

-- ── Step 10: Add set_assigned_stacode RPC ──
CREATE OR REPLACE FUNCTION public.set_assigned_stacode(p_target_user uuid, p_stacode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
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

-- ── Step 11: Re-grant execute on updated functions ──
REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;
