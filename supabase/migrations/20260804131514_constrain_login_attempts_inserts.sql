-- F16: the INSERT policy accepted anything from anon whenever user_id was NULL,
-- so the security log could be flooded with arbitrary rows.
-- F23 (server side): failure_reason is bounded to a fixed set of reason codes so
-- attacker-chosen text can no longer be stored and shown to administrators.

DROP POLICY IF EXISTS insert_login_attempts ON login_attempts;

CREATE POLICY insert_login_attempts_anon ON login_attempts
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND success = false
    AND (failure_reason IS NULL OR failure_reason IN ('invalid_credentials', 'account_locked', 'email_unverified', 'unexpected_error'))
  );

CREATE POLICY insert_login_attempts_authenticated ON login_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid())
    OR (
      user_id IS NULL
      AND success = false
      AND (failure_reason IS NULL OR failure_reason IN ('invalid_credentials', 'account_locked', 'email_unverified', 'unexpected_error'))
    )
  );
