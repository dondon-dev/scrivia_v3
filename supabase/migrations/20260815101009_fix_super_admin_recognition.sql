/*
# Fix super-admin recognition (regions management + granting access)

## Problem
Every super-admin gate — the Regions & Divisions RPCs (upsert_region,
upsert_division, set_user_division, …), the role-permission RPCs
(upsert_role_permission / delete_role_permission), set_user_role, and the
shared RLS helpers (is_super_admin(), get_current_user_role()) — matches the
role with a STRICT equality on 'super_admin'. If an account's stored
`profiles.role` has any casing/whitespace variance, or the bootstrap promotion
never ran for the account, the account is treated as a non-super-admin and the
app reports "Only super administrators can manage regions / grant access" even
though it is the SuperAdmin account.

## Fix
1. Normalize existing `profiles.role` values (lowercase + trim) for every
   known role, so the existing strict checks pass against clean data.
2. Guarantee at least one approved super_admin exists: if none does, promote
   the owner's account (adonaimagno@gmail.com) if present and approved,
   otherwise the oldest approved account. This un-bricks systems where the
   bootstrap promotion never ran.
3. Harden the shared role helpers (`get_current_user_role()`, `is_super_admin()`,
   `has_role_level()`) to be case/whitespace tolerant, so every RLS policy that
   funnels through them (dashboard stats cache, payroll definitions, data
   segregation, profile protection) recognizes the super admin regardless of
   role-data quirks.

Idempotent and safe to re-run.
*/

-- ============================================================================
-- 1. Normalize existing role data (lowercase + trim) for known roles.
--    Rows whose normalized value is not a known role (e.g. legacy 'viewer')
--    are left untouched — they are not valid roles and must not be renamed.
-- ============================================================================
UPDATE public.profiles
SET role = lower(btrim(role)),
    updated_at = now()
WHERE role IS DISTINCT FROM lower(btrim(role))
  AND lower(btrim(role)) IN (
    'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
    'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
    'school_head', 'ess', 'read_only', 'loan_verifier', 'payroll_officer',
    'treasury_disbursement'
  );

-- ============================================================================
-- 2. Guarantee an approved super_admin exists (recovery bootstrap).
--    Runs only when there is NO approved super_admin — otherwise it does
--    nothing, so existing working setups are untouched.
-- ============================================================================
DO $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(btrim(role)) = 'super_admin' AND status = 'approved'
  ) THEN
    -- Prefer the repository owner's account, then the oldest approved account.
    SELECT id, email INTO v_id, v_email
    FROM public.profiles
    WHERE lower(email) = 'adonaimagno@gmail.com' AND status = 'approved'
    ORDER BY created_at
    LIMIT 1;

    IF v_id IS NULL THEN
      SELECT id, email INTO v_id, v_email
      FROM public.profiles
      WHERE status = 'approved'
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE public.profiles
      SET role = 'super_admin', status = 'approved', updated_at = now()
      WHERE id = v_id;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 3. Harden the shared role helpers (case/whitespace tolerant).
-- ============================================================================

-- get_current_user_role(): every RLS policy / helper that gates on the role
-- funnels through this function, so normalizing its output fixes them all.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(btrim(role)) FROM profiles
  WHERE id = auth.uid() AND status = 'approved';
$$;

-- is_super_admin(): tolerant of casing/whitespace in the stored role.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(btrim(role)) = 'super_admin'
  );
$$;

-- has_role_level(): the caller's stored role is normalized before the rank
-- lookup so odd casing can't silently drop a user out of the hierarchy.
CREATE OR REPLACE FUNCTION public.has_role_level(p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
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
    JOIN role_rank caller ON caller.role_name = lower(btrim(p.role))
    JOIN role_rank minimum ON minimum.role_name = lower(btrim(p_min_role))
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND caller.rn >= minimum.rn
  );
$$;

-- Reload PostgREST's schema cache so the updated helpers are visible immediately.
NOTIFY pgrst, 'reload schema';
