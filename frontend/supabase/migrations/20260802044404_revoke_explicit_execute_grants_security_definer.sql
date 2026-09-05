/*
# Revoke Explicit EXECUTE Grants on SECURITY DEFINER Functions

## Summary
The previous migration revoked EXECUTE from PUBLIC, but `anon` and
`authenticated` had DIRECT grants (not inherited via PUBLIC) that
were not removed. This migration explicitly revokes those direct
grants and re-grants only the minimum needed.

## Why
`information_schema.routine_privileges` showed that `anon` and/or
`authenticated` still held explicit EXECUTE on every SECURITY DEFINER
function. The Supabase linter still reports them as publicly callable
because it checks the actual grants, not just PUBLIC membership.

## Changes
For every SECURITY DEFINER function, REVOKE EXECUTE from both `anon`
and `authenticated`, then re-GRANT only the roles that need Data API
access per the table in the previous migration.
*/

-- Revoke ALL direct grants from anon and authenticated on every SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role_level(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_otp(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_table_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_email_verified() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payroll(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_closed_period_reopen() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_posted_entry_modification() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_columns() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_successful_login() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_mfa(uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_user_account(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_otp(text, text) FROM anon, authenticated;

-- Re-grant ONLY what the frontend needs via .rpc()
-- anon: only record_failed_login (pre-login, no session yet)
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon;

-- authenticated: functions called from the frontend after sign-in
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_successful_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hash_otp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payroll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_mfa(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_user_account(uuid) TO authenticated;

-- RLS policy helpers: authenticated needs EXECUTE so policies can call them
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_level(text) TO authenticated;
