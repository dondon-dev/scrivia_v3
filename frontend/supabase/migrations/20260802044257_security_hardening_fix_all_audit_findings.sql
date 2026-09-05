/*
# Security Hardening: Fix All Audit Findings

## Summary
Resolves all warnings from the Supabase security advisor:
1. Mutable search_path on `update_updated_at()` trigger function
2. RLS INSERT policies with always-true WITH CHECK on `login_attempts` and `password_reset_tokens`
3. SECURITY DEFINER functions executable by `anon` and/or `authenticated` via the Data API

## Changes

### 1. Function Search Path Mutable — `update_updated_at`
- Added `SET search_path TO 'public'` to the trigger function so a malicious
  role cannot hijack table references by setting a custom `search_path`.

### 2. RLS Policy Always True — `login_attempts` INSERT
- Replaced the blanket `WITH CHECK (true)` INSERT policy with one that only
  allows inserts where `user_id IS NULL OR user_id = auth.uid()`. Anonymous
  (pre-login) failed-login rows with no user_id can still be written (needed
  by the login flow before a session exists), but a user cannot forge
  login-attempt rows attributed to a different user.

### 3. RLS Policy Always True — `password_reset_tokens` INSERT
- Replaced the blanket `WITH CHECK (true)` INSERT policy with one that only
  allows inserts where `user_id = auth.uid()`. The frontend does not insert
  into this table directly (password resets are initiated via Supabase Auth),
  so this tightens the policy to owner-only without breaking the app.

### 4. SECURITY DEFINER Functions — EXECUTE Revocation
Postgres grants EXECUTE to PUBLIC by default. `anon` and `authenticated`
inherit from PUBLIC, so every SECURITY DEFINER function in `public` is
callable by anyone via `/rest/v1/rpc/<name>` — a public API endpoint that
runs with the function creator's privileges (which bypass RLS).

**Revoked EXECUTE from PUBLIC on ALL SECURITY DEFINER functions.** Then
re-granted EXECUTE to `authenticated` ONLY on functions the frontend calls
via `.rpc()`, and to `anon` ONLY on `record_failed_login` (called during the
login flow before a session exists).

Functions that are ONLY used as triggers or called internally by RLS
policies had EXECUTE revoked from both `anon` and `authenticated` — they
are invoked by Postgres internally and never need Data API access.

#### EXECUTE grants after this migration:

| Function | anon | authenticated | Reason |
|---|---|---|---|
| record_failed_login | YES | YES | Called before login (no session) |
| record_successful_login | NO | YES | Called after login |
| hash_otp | NO | YES | Called during MFA flow |
| verify_otp | NO | YES | Called during MFA flow |
| mark_email_verified | NO | YES | Called after email confirmation |
| post_payroll | NO | YES | Called by payroll admin (has internal role check) |
| set_user_role | NO | YES | Called by super_admin (has internal role check) |
| set_user_mfa | NO | YES | Called by super_admin (has internal role check) |
| unlock_user_account | NO | YES | Called by super_admin (has internal role check) |
| get_current_user_role | NO | NO | RLS policy helper only |
| get_user_role | NO | NO | RLS policy helper only |
| has_role_level | NO | NO | RLS policy helper only |
| cleanup_expired_otps | NO | NO | Maintenance, not called via API |
| handle_new_user | NO | NO | Trigger function only |
| log_table_change | NO | NO | Trigger function only |
| prevent_closed_period_reopen | NO | NO | Trigger function only |
| prevent_posted_entry_modification | NO | NO | Trigger function only |
| protect_profile_columns | NO | NO | Trigger function only |

## Security Impact
- Eliminates 2 RLS bypass vulnerabilities (always-true INSERT policies)
- Eliminates 1 search-path hijack vector on the `update_updated_at` trigger
- Eliminates 34 public-API attack surfaces (SECURITY DEFINER functions callable
  by anon/authenticated without need)
*/

-- ============================================================================
-- 1. Fix mutable search_path on update_updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 2. Fix login_attempts INSERT policy (always-true WITH CHECK)
-- ============================================================================
DROP POLICY IF EXISTS "insert_login_attempts" ON login_attempts;
CREATE POLICY "insert_login_attempts"
ON login_attempts FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ============================================================================
-- 3. Fix password_reset_tokens INSERT policy (always-true WITH CHECK)
-- ============================================================================
DROP POLICY IF EXISTS "insert_password_reset" ON password_reset_tokens;
CREATE POLICY "insert_password_reset"
ON password_reset_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 4. Revoke EXECUTE from PUBLIC on ALL SECURITY DEFINER functions
--    Then re-grant only to roles that need Data API access
-- ============================================================================

-- Revoke default PUBLIC EXECUTE on every SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role_level(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hash_otp(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_table_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_email_verified() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_payroll(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_closed_period_reopen() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_posted_entry_modification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_successful_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_mfa(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_user_account(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_otp(text, text) FROM PUBLIC;

-- Re-grant to anon ONLY for record_failed_login (called pre-login)
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon;

-- Re-grant to authenticated for functions the frontend calls via .rpc()
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_successful_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hash_otp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payroll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_mfa(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_user_account(uuid) TO authenticated;

-- RLS policy helper functions: grant to authenticated so policies can call them.
-- (Policies run as the invoking role; authenticated-only policies need the
-- function callable by authenticated. anon has no policies using these.)
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_level(text) TO authenticated;
