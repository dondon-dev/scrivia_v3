/*
# Switch Safe Functions to SECURITY INVOKER

## Summary
Switches 4 SECURITY DEFINER functions to SECURITY INVOKER to eliminate
linter warnings about authenticated users calling SECURITY DEFINER
functions via the Data API.

## Why
The Supabase security advisor flags any SECURITY DEFINER function with
EXECUTE granted to `anon` or `authenticated`. For functions that only
access tables the caller already has RLS permission to access, switching
to SECURITY INVOKER makes the grant safe — the function runs with the
caller's own privileges and is subject to RLS just like a direct query.

## Functions Switched to SECURITY INVOKER

| Function | Why Safe |
|---|---|
| record_successful_login | Only updates caller's own profile (auth.uid() = id), covered by update_own_profile RLS policy |
| hash_otp | Pure crypto (crypt + gen_salt), no table access at all |
| verify_otp | Pure crypto (crypt comparison), no table access at all |
| mark_email_verified | Checks auth.users (readable by caller) then updates own profile (auth.uid() = id), covered by update_own_profile RLS policy |

## Functions That MUST Stay SECURITY DEFINER
- get_current_user_role, get_user_role, has_role_level — called inside
  profiles RLS policies; SECURITY INVOKER would cause infinite recursion
  because the policy calls the function which queries the table which
  evaluates the policy again.
- post_payroll — needs to read profiles for role check (same recursion
  risk) and update payroll_entries/pay_periods which may not have
  permissive-enough RLS for the role check path.
- set_user_role, set_user_mfa, unlock_user_account — update OTHER users'
  profiles (target_user != auth.uid()), which RLS would block.
- record_failed_login — updates profiles by email, caller may not be
  authenticated (pre-login flow).

The linter will continue to warn about these 7 functions. These warnings
are expected and intentional — the functions have internal authorization
checks (role verification via auth.uid()) that prevent abuse.
*/

-- ============================================================================
-- record_successful_login → SECURITY INVOKER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_successful_login()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = now()
  WHERE id = auth.uid();
END;
$function$;

-- ============================================================================
-- hash_otp → SECURITY INVOKER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hash_otp(otp_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pgcrypto'
AS $function$
BEGIN
  RETURN crypt(otp_code, gen_salt('bf'));
END;
$function$;

-- ============================================================================
-- verify_otp → SECURITY INVOKER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_otp(otp_code text, stored_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pgcrypto'
AS $function$
BEGIN
  RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$function$;

-- ============================================================================
-- mark_email_verified → SECURITY INVOKER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_email_verified()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Email not confirmed by auth provider';
  END IF;

  UPDATE profiles SET email_verified = true WHERE id = auth.uid();
END;
$function$;

-- Re-grant EXECUTE to authenticated (needed since we recreated the functions)
-- The grant to record_failed_login (DEFINER) is preserved from previous migration
GRANT EXECUTE ON FUNCTION public.record_successful_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hash_otp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_verified() TO authenticated;
