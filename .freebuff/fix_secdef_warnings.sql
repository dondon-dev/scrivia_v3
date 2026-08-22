-- ============================================================
-- FIX: SECURITY DEFINER warnings
-- Two strategies:
--   1. Convert to SECURITY INVOKER (functions that only read public schema)
--   2. Revoke EXECUTE (trigger-only functions, not called via API)
-- ============================================================

-- ── Strategy 1: Convert to SECURITY INVOKER ──
-- These functions only read from the public schema and don't need
-- elevated privileges. Switching to INVOKER removes the warning
-- while keeping them callable by authenticated users.

DO $$
DECLARE
  func_record RECORD;
  func_args TEXT;
  sql_cmd TEXT;
BEGIN
  -- Role-checking functions: only read profiles table
  FOR func_record IN
    SELECT p.proname, oidvectortypes(p.proargtypes) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'is_super_admin', 'is_data_admin', 'is_data_writer',
        'has_role_level', 'get_user_role', 'get_current_user_role',
        'get_current_user_division_id', 'get_current_user_regcode',
        'get_current_user_divcode'
      )
  LOOP
    sql_cmd := format(
      'ALTER FUNCTION public.%I(%s) SECURITY INVOKER',
      func_record.proname, func_record.args
    );
    BEGIN
      EXECUTE sql_cmd;
      RAISE NOTICE 'Converted to INVOKER: %(%)', func_record.proname, func_record.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %: %', func_record.proname, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ── Strategy 2: Revoke EXECUTE on trigger-only functions ──
-- These are called by PostgreSQL triggers/events, not via HTTP API.
-- Revoking EXECUTE removes the warning without breaking functionality.

DO $$
DECLARE
  func_record RECORD;
  func_args TEXT;
  sql_cmd TEXT;
BEGIN
  FOR func_record IN
    SELECT p.proname, oidvectortypes(p.proargtypes) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'handle_new_user', 'protect_profile_columns',
        'log_table_change', 'prevent_closed_period_reopen',
        'prevent_posted_entry_modification', 'sync_email_verified_from_auth',
        'touch_updated_at', 'set_payroll_def_updated_at',
        'update_schools_updated_at', 'stamp_division_codes',
        'record_failed_login', 'update_login_timestamp'
      )
  LOOP
    sql_cmd := format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated',
      func_record.proname, func_record.args
    );
    BEGIN
      EXECUTE sql_cmd;
      RAISE NOTICE 'Revoked EXECUTE on trigger function: %(%)', func_record.proname, func_record.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %: %', func_record.proname, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ── Remaining SECURITY DEFINER functions ──
-- These legitimately need SECURITY DEFINER (cross-schema access, 
-- RLS bypass for admin queries). Keep them but ensure they're
-- only callable by authenticated (not anon).

DO $$
DECLARE
  func_record RECORD;
  func_args TEXT;
  sql_cmd TEXT;
BEGIN
  FOR func_record IN
    SELECT p.proname, oidvectortypes(p.proargtypes) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT IN (
        'is_super_admin', 'is_data_admin', 'is_data_writer',
        'has_role_level', 'get_user_role', 'get_current_user_role',
        'get_current_user_division_id', 'get_current_user_regcode',
        'get_current_user_divcode',
        'handle_new_user', 'protect_profile_columns',
        'log_table_change', 'prevent_closed_period_reopen',
        'prevent_posted_entry_modification', 'sync_email_verified_from_auth',
        'touch_updated_at', 'set_payroll_def_updated_at',
        'update_schools_updated_at', 'stamp_division_codes',
        'record_failed_login', 'update_login_timestamp'
      )
  LOOP
    -- Ensure authenticated has EXECUTE (may already have it)
    sql_cmd := format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
      func_record.proname, func_record.args
    );
    BEGIN
      EXECUTE sql_cmd;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    
    -- Revoke from anon (defense in depth)
    sql_cmd := format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      func_record.proname, func_record.args
    );
    BEGIN
      EXECUTE sql_cmd;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END
$$;

-- ============================================================
-- VERIFY: Count remaining SECURITY DEFINER functions
-- ============================================================
SELECT 
  p.proname,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security,
  pg_has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
  pg_has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;
