-- F11: MFA was verified entirely in the browser, on a session that had already
-- been issued, and the plaintext code was handed back to the caller. These two
-- functions move issuance and verification server-side so the client never sees
-- the code and the claim of a code is atomic and attempt-limited.

CREATE OR REPLACE FUNCTION public.issue_mfa_code(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_code text;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    -- Do not reveal whether the account exists.
    RETURN true;
  END IF;

  -- Invalidate any outstanding code, then issue exactly one new one.
  UPDATE otp_codes SET used = true
  WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false;

  v_code := lpad(((floor(random() * 900000) + 100000))::bigint::text, 6, '0');

  INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
  VALUES (v_user_id, crypt(v_code, gen_salt('bf')), 'mfa', now() + interval '5 minutes');

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_mfa_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_otp record;
  v_claimed integer;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT * INTO v_otp
  FROM otp_codes
  WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_otp.id IS NULL OR v_otp.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_otp.attempts >= v_otp.max_attempts THEN
    UPDATE otp_codes SET used = true WHERE id = v_otp.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  END IF;

  IF crypt(p_code, v_otp.code_hash) <> v_otp.code_hash THEN
    UPDATE otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_code',
      'remaining', v_otp.max_attempts - (v_otp.attempts + 1)
    );
  END IF;

  -- Atomic single-use claim: only the first concurrent caller wins.
  UPDATE otp_codes SET used = true WHERE id = v_otp.id AND used = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_mfa_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_mfa_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_mfa_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mfa_code(text,text) TO anon, authenticated;
