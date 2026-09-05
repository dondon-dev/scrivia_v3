-- Login tracking functions — needed because the protect_profile_columns trigger
-- now blocks direct updates to failed_login_attempts, locked_until, last_login_at.

-- Record a failed login attempt (callable by anon — user isn't authenticated when login fails)
CREATE OR REPLACE FUNCTION record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_attempts integer;
BEGIN
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
$$;

REVOKE EXECUTE ON FUNCTION record_failed_login(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_failed_login(text) TO anon, authenticated;

-- Record a successful login (callable by authenticated — user just logged in)
CREATE OR REPLACE FUNCTION record_successful_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = now()
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION record_successful_login() FROM anon;
GRANT EXECUTE ON FUNCTION record_successful_login() TO authenticated;
