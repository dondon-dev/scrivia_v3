/*
# DB-backed editable role permissions

## Overview
Adds a `role_permissions` table that stores *overrides* on top of the code-defined
default permission matrix (`ROLE_PERMISSIONS` in src/types/auth.ts). The table is
empty by default — an empty table means "use the code defaults".

Effective permission for a role = override row if present, otherwise code default.

Only a `super_admin` can write overrides. Every authenticated user can read them
so the client can render the effective matrix (nav, route guards, My Access page).

## Guardrails
- `super_admin` can never have `user_management` revoked (prevents self lockout).
- Role / permission values are constrained to the known sets.
- All changes are written to `audit_logs`.
*/

-- ── 1. Overrides table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role       text      NOT NULL,
  permission text      NOT NULL,
  granted    boolean   NOT NULL,
  updated_by uuid      REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission),
  CONSTRAINT role_permissions_role_check CHECK (role IN (
    'super_admin','payroll_admin','payroll_processor','accounting_officer',
    'hr_administrator','school_coordinator','division_finance','auditor',
    'school_head','ess','read_only')),
  CONSTRAINT role_permissions_permission_check CHECK (permission IN (
    'dashboard','employees','groups','salary','deductions','dedmaster',
    'dedengine','payroll','taxcalc','reports','stacode','user_management',
    'audit_logs','system_settings','dbf_restore','comm_allowance'))
);

-- No direct table access from the client — reads and writes go through RPCs.
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated;

-- ── 2. Read RPC (any authenticated user) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_role_permissions()
RETURNS SETOF public.role_permissions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.role_permissions;
$$;

-- ── 3. Write RPC: upsert an override (super_admin only) ────────────────────
CREATE OR REPLACE FUNCTION public.upsert_role_permission(
  p_role text,
  p_permission text,
  p_granted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Never allow locking the system out.
  IF p_role = 'super_admin' AND p_permission = 'user_management' AND p_granted = false THEN
    RAISE EXCEPTION 'The super_admin role must always have user_management access';
  END IF;

  INSERT INTO public.role_permissions (role, permission, granted, updated_by, updated_at)
  VALUES (p_role, p_permission, p_granted, auth.uid(), now())
  ON CONFLICT (role, permission)
  DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = now();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
         jsonb_build_object('role', p_role, 'permission', p_permission, 'granted', p_granted)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

-- ── 4. Write RPC: delete an override, restoring the code default ───────────
CREATE OR REPLACE FUNCTION public.delete_role_permission(
  p_role text,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_removed boolean;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.role_permissions
  WHERE role = p_role AND permission = p_permission
  RETURNING true INTO v_removed;

  IF v_removed THEN
    INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
    SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
           jsonb_build_object('role', p_role, 'permission', p_permission, 'restored_default', true)
    FROM profiles u WHERE u.id = auth.uid();
  END IF;
END;
$$;

-- ── 5. Grants (the frontend calls these via .rpc()) ────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_role_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_role_permission(text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_role_permission(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_role_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_role_permission(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role_permission(text, text) TO authenticated;

-- Reload PostgREST's schema cache so the new functions are visible immediately.
NOTIFY pgrst, 'reload schema';
