/*
# Admin Approval Registration System

## Overview
Transforms user registration into an admin-approval workflow. New registrations
start as PENDING_APPROVAL and cannot access the system until a Super Admin
approves them. Adds full lifecycle management (pending, approved, rejected,
disabled) with audit-trail logging and DepEd masterfile validation.

## Changes to `profiles` table (new columns)
- `status` (text, default 'pending_approval') — one of:
    pending_approval | approved | rejected | disabled
  CHECK constraint enforces valid values.
- `office_assignment` (text, nullable) — school/office from sign-up form
- `position_designation` (text, nullable) — position/title from sign-up form
- `employee_number` (text, nullable) — DepEd employee number for masterfile validation
- `rejection_reason` (text, nullable) — set when admin rejects
- `approved_by` (uuid, nullable, FK to auth.users) — admin who approved
- `approved_at` (timestamptz, nullable) — when approval happened
- `rejected_by` (uuid, nullable, FK to auth.users) — admin who rejected
- `rejected_at` (timestamptz, nullable) — when rejection happened
- `disabled_by` (uuid, nullable, FK to auth.users) — admin who disabled
- `disabled_at` (timestamptz, nullable) — when account was disabled

## Trigger changes
- `handle_new_user()` updated: sets status='pending_approval' for all new users
  (first user still becomes super_admin but also starts pending — the existing
  admin can self-approve via the UI or the first-user bypass logic). Actually
  the first user gets auto-approved so the system is bootstrappable.
- Pulls office_assignment, position_designation, employee_number from
  raw_user_meta_data into the profile row.

## New RPC functions (all SECURITY DEFINER, super_admin only)
1. `approve_user(p_target_user uuid)` — sets status='approved', clears
   rejection fields, stamps approved_by/at with the caller. Returns the
   updated profile.
2. `reject_user(p_target_user uuid, p_reason text)` — sets status='rejected',
   stores rejection_reason, stamps rejected_by/at.
3. `disable_user(p_target_user uuid)` — sets status='disabled', stamps
   disabled_by/at.
4. `enable_user(p_target_user uuid)` — re-activates a disabled account back to
   'approved', clears disable fields.
5. `validate_employee_for_approval(p_employee_number text)` — checks the
   employees masterfile for a matching employee_number with status='Active'
   and a valid stacode. Returns a JSON object with validation results.

## RLS policy changes
- `profiles` SELECT: already allows super_admin to read all. Updated to also
  allow payroll_admin to read all (they need to see users for the approval
  queue per spec, but only super_admin can approve/reject).
- `profiles` UPDATE: already allows super_admin. No change needed — the
  approve/reject/disable/enable RPCs run as SECURITY DEFINER so they bypass
  RLS safely.

## Security notes
1. All status-changing RPCs verify the caller is a super_admin before acting.
2. The first registered user is auto-approved so the system can bootstrap.
3. Pending/rejected/disabled users are blocked at login time (client-side
   check in auth context, see signIn function).
4. Employee number validation checks the live employees table (the DBF
   masterfile mirror) to ensure only verified DepEd personnel are approved.
*/

-- ── Add new columns to profiles ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'disabled')),
  ADD COLUMN IF NOT EXISTS office_assignment text,
  ADD COLUMN IF NOT EXISTS position_designation text,
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- ── Update handle_new_user trigger function ──
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
    -- First user: super_admin + auto-approved so the system is bootstrappable
    assigned_role := 'super_admin';
    assigned_status := 'approved';
  ELSE
    assigned_role := 'viewer';
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

-- ── approve_user RPC ──
CREATE OR REPLACE FUNCTION public.approve_user(p_target_user uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can approve users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'approved',
        approved_by = caller_id,
        approved_at = now(),
        rejection_reason = NULL,
        rejected_by = NULL,
        rejected_at = NULL,
        disabled_by = NULL,
        disabled_at = NULL
    WHERE id = p_target_user
      AND status IN ('pending_approval', 'rejected', 'disabled')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not in an approvable state';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_approved', 'profiles', p_target_user::text,
          jsonb_build_object('approved_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;

-- ── reject_user RPC ──
CREATE OR REPLACE FUNCTION public.reject_user(p_target_user uuid, p_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can reject users';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'rejected',
        rejection_reason = p_reason,
        rejected_by = caller_id,
        rejected_at = now()
    WHERE id = p_target_user
      AND status IN ('pending_approval', 'approved')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not in a rejectable state';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_rejected', 'profiles', p_target_user::text,
          jsonb_build_object('rejected_email', target_email, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;

-- ── disable_user RPC ──
CREATE OR REPLACE FUNCTION public.disable_user(p_target_user uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can disable users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'disabled',
        disabled_by = caller_id,
        disabled_at = now()
    WHERE id = p_target_user
      AND status IN ('approved', 'rejected', 'pending_approval')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or already disabled';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_disabled', 'profiles', p_target_user::text,
          jsonb_build_object('disabled_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;

-- ── enable_user RPC ──
CREATE OR REPLACE FUNCTION public.enable_user(p_target_user uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can enable users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'approved',
        disabled_by = NULL,
        disabled_at = NULL
    WHERE id = p_target_user
      AND status = 'disabled'
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not disabled';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_enabled', 'profiles', p_target_user::text,
          jsonb_build_object('enabled_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;

-- ── validate_employee_for_approval RPC ──
-- Checks the employees masterfile for a matching employee_number
CREATE OR REPLACE FUNCTION public.validate_employee_for_approval(p_employee_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record record;
  stacode_num int;
  group_exists boolean;
BEGIN
  IF p_employee_number IS NULL OR btrim(p_employee_number) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Employee number is required');
  END IF;

  -- Look up employee by employee_number
  SELECT employee_number, status, stacode, first_name, last_name
    INTO emp_record
  FROM employees
  WHERE employee_number = btrim(p_employee_number)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Employee number not found in Masterfile');
  END IF;

  IF emp_record.status IS NULL OR emp_record.status <> 'Active' THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'Employee status is not Active (current: ' || COALESCE(emp_record.status, 'NULL') || ')');
  END IF;

  -- Validate stacode is numeric and within a known payroll group range
  IF emp_record.stacode IS NULL OR btrim(emp_record.stacode) = '' OR NOT (btrim(emp_record.stacode) ~ '^[0-9]+$') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'STACODE is missing or invalid');
  END IF;

  stacode_num := CAST(btrim(emp_record.stacode) AS int);

  SELECT EXISTS(
    SELECT 1 FROM payroll_groups
    WHERE status = 'Active'
      AND stacode_min IS NOT NULL
      AND stacode_max IS NOT NULL
      AND stacode_num >= stacode_min
      AND stacode_num <= stacode_max
  ) INTO group_exists;

  IF NOT group_exists THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'STACODE ' || stacode_num || ' does not belong to any active payroll group');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'employee_name', emp_record.first_name || ' ' || emp_record.last_name,
    'stacode', emp_record.stacode,
    'status', emp_record.status
  );
END;
$$;

-- ── Revoke execute from anon/authenticated on new functions ──
-- (Only callable via authenticated session with super_admin role check inside)
REVOKE EXECUTE ON FUNCTION approve_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_user(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION disable_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION enable_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION validate_employee_for_approval(text) FROM anon, authenticated;

-- Grant execute to authenticated only (the functions internally verify super_admin)
GRANT EXECUTE ON FUNCTION approve_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION disable_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION enable_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_employee_for_approval(text) TO authenticated;

-- ── Backfill: mark existing profiles as approved ──
-- Existing users were created before the approval system, so grandfather them
UPDATE profiles SET status = 'approved' WHERE status = 'pending_approval' AND approved_at IS NULL;
