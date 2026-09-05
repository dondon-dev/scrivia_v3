-- Fix infinite recursion in profiles RLS policies.
--
-- The policies on profiles, login_attempts, and audit_logs all did:
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
-- But querying profiles from within a profiles RLS policy triggers infinite recursion.
--
-- Solution: a SECURITY DEFINER function that reads the role with RLS bypassed.

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ── profiles: replace the recursive admin policies ──

DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    public.get_current_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated USING (
    public.get_current_user_role() = 'super_admin'
  ) WITH CHECK (
    public.get_current_user_role() = 'super_admin'
  );

-- ── login_attempts: replace the recursive admin policy ──

DROP POLICY IF EXISTS "select_all_login_attempts_admin" ON login_attempts;
CREATE POLICY "select_all_login_attempts_admin" ON login_attempts FOR SELECT
  TO authenticated USING (
    public.get_current_user_role() = 'super_admin'
  );

-- ── audit_logs: replace the recursive admin/viewer policy ──

DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (
    public.get_current_user_role() IN ('super_admin', 'viewer')
  );
