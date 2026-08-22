-- ============================================================
-- Migration: Security Advisor fixes + payroll timeout fix
-- Captures all changes made on 2026-08-21
-- ============================================================

-- ── 1. Function search_path fixes ──
-- Set search_path = 'public' on functions that were missing it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hash_otp') THEN
    EXECUTE 'ALTER FUNCTION public.hash_otp(text) SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_otp') THEN
    EXECUTE 'ALTER FUNCTION public.verify_otp(text, text) SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.touch_updated_at() SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_payroll_def_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.set_payroll_def_updated_at() SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_schools_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.update_schools_updated_at() SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_monthly_periods') THEN
    EXECUTE 'ALTER FUNCTION public.generate_monthly_periods(integer, text, text) SET search_path = ''public''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_super_admin') THEN
    EXECUTE 'ALTER FUNCTION public.is_super_admin() SET search_path = ''public''';
  END IF;
END
$$;

-- ── 2. RLS Policy hardening ──
-- Replace always-true (USING (true)) policies with role-based checks

-- Read-only lookup tables: allow anon + authenticated
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename, cmd as pcmd
    FROM pg_policies WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
      AND tablename IN ('regions','divisions','deduction_codes','division_office',
                        'salary_schedule','payroll_groups','schools','role_permissions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    IF r.pcmd = 'SELECT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() IN (''anon'',''authenticated'',''service_role''))', r.policyname, r.tablename);
    ELSIF r.pcmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    ELSIF r.pcmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    ELSIF r.pcmd = 'DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    END IF;
  END LOOP;
END
$$;

-- All other tables: require authenticated
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename, cmd as pcmd
    FROM pg_policies WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
      AND tablename NOT IN ('regions','divisions','deduction_codes','division_office',
                            'salary_schedule','payroll_groups','schools','role_permissions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    IF r.pcmd = 'SELECT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    ELSIF r.pcmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    ELSIF r.pcmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    ELSIF r.pcmd = 'DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.role() = ''authenticated'')', r.policyname, r.tablename);
    END IF;
  END LOOP;
END
$$;

-- ── 3. SECURITY DEFINER function grants ──
-- Revoke from PUBLIC/anon, grant only to authenticated
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, oidvectortypes(p.proargtypes) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END
$$;

-- ── 4. Trigger-only functions: revoke all EXECUTE ──
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, oidvectortypes(p.proargtypes) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND p.proname IN ('handle_new_user','protect_profile_columns','log_table_change',
                        'prevent_closed_period_reopen','prevent_posted_entry_modification',
                        'sync_email_verified_from_auth','stamp_division_codes',
                        'record_failed_login','_trig_refresh_dashboard_cache',
                        'cleanup_expired_otps','enforce_posted_entry_invariants')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, anon, service_role', r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END
$$;

-- ── 5. FORCE RLS on sensitive tables ──
ALTER TABLE IF EXISTS profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS employees FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_deductions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deductions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS login_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS otp_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS password_reset_tokens FORCE ROW LEVEL SECURITY;

-- ── 6. Statement timeout for payroll ──
ALTER DATABASE postgres SET statement_timeout = '10min';
ALTER ROLE authenticator SET statement_timeout = '10min';
ALTER ROLE authenticated SET statement_timeout = '10min';
