/*
# Add auth guard to record_failed_login

## Summary
Adds an authorization guard to `record_failed_login()` so an authenticated
user cannot call it with a different user's email to lock their account.

## Context
`record_failed_login` is called during the login flow — before a session
exists — so it needs EXECUTE for `anon`. It increments a failed-login
counter and locks the account after 5 failures. Without a guard, an
authenticated user could call it via the Data API with someone else's
email to lock them out (a denial-of-service against another user).

## Change
- If `auth.uid()` returns non-null (the caller is authenticated), the
  function verifies that the supplied email matches the caller's own
  profile email before proceeding. If it doesn't match, raise an exception.
- If `auth.uid()` is null (the pre-login anonymous case), the function
  proceeds as before.
*/

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile record;
  v_attempts integer;
  v_caller_email text;
BEGIN
  -- If the caller is authenticated, they may only record failed logins
  -- for their own email. This prevents an authenticated user from
  -- locking out another user's account by calling this RPC with a
  -- different email.
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_caller_email FROM profiles WHERE id = auth.uid();
    IF v_caller_email IS NOT NULL AND v_caller_email != lower(p_email) THEN
      RAISE EXCEPTION 'Not authorized to record login attempts for another user';
    END IF;
  END IF;

  SELECT id, failed_login_attempts INTO v_profile
  FROM profiles WHERE email = lower(p_email);
  IF v_profile IS NULL THEN RETURN; END IF;

  v_attempts := COALESCE(v_profile.failed_login_attempts, 0) + 1;

  IF v_attempts >= 5 THEN
    UPDATE profiles
    SET failed_login_attempts = v_attempts,
        locked_until = now() + interval '30 minutes'
    WHERE id = v_profile.id;
  ELSE
    UPDATE profiles
    SET failed_login_attempts = v_attempts
    WHERE id = v_profile.id;
  END IF;
END;
$function$;
