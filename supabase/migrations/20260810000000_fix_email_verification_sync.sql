-- ============================================================================
-- Fix: users locked out with "Your email has not been verified yet" even after
-- clicking the verification link.
--
-- Why this happens:
--   profiles.email_verified is a DERIVED copy of the authoritative flag
--   auth.users.email_confirmed_at (set by Supabase's auth provider when the
--   user clicks the confirmation link). The two can drift apart when the
--   mark_email_verified RPC is missing on this project (migrations never fully
--   pushed), leaving verified users permanently locked out at the login gate.
--
-- What this migration does (all idempotent — safe to run repeatedly):
--   A. Recreate public.mark_email_verified() + its grants.
--   B. protect_profile_columns(): permit email_verified false -> true whenever
--      the target auth user's email is confirmed. This covers BOTH the RPC's
--      self-update AND the sync trigger below (which runs with no JWT, so
--      auth.uid() is NULL and would otherwise be rejected).
--   C. One-time backfill: every account already confirmed at the auth level
--      gets its derived flag synced immediately.
--   D. Self-healing trigger: whenever the auth provider confirms an email
--      (link click, admin verify, …), profiles.email_verified flips true
--      automatically — no client call required.
-- ============================================================================

-- ── A. mark_email_verified (SECURITY INVOKER — caller may only update their
--      own row, and only when auth.users.email_confirmed_at is set) ──────────
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

REVOKE EXECUTE ON FUNCTION public.mark_email_verified() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_email_verified() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_email_verified() TO authenticated;

-- ── B. protect_profile_columns — confirmed-email carve-out ──────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_self_update boolean;
BEGIN
  SELECT p.role INTO v_role
  FROM profiles p
  WHERE p.id = auth.uid() AND p.status = 'approved';

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  v_is_self_update := (auth.uid() = NEW.id AND auth.uid() = OLD.id);

  -- Columns nobody except an approved super_admin may change, on any row.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
    RAISE EXCEPTION 'Not authorized to change assigned STACODE';
  END IF;
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Not authorized to change employee number';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not authorized to change account status';
  END IF;
  IF NEW.division_code IS DISTINCT FROM OLD.division_code THEN
    RAISE EXCEPTION 'Not authorized to change division code';
  END IF;

  IF v_is_self_update THEN
    -- Login tracking, email_verified and mfa_enabled remain self-writable so
    -- record_successful_login / mark_email_verified keep working.
    RETURN NEW;
  END IF;

  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    RAISE EXCEPTION 'Not authorized to change MFA settings';
  END IF;
  -- Email verification: false -> true is allowed for ANY row whose auth user
  -- has actually confirmed the email (auth.users.email_confirmed_at). This
  -- lets the sync trigger below (no JWT in context) and the RPC both work,
  -- without allowing anyone to flip verification for an unconfirmed account.
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified
     AND NOT (OLD.email_verified = false AND NEW.email_verified = true
              AND EXISTS (
                SELECT 1 FROM auth.users u
                WHERE u.id = NEW.id AND u.email_confirmed_at IS NOT NULL
              )) THEN
    RAISE EXCEPTION 'Not authorized to change email verification status';
  END IF;
  IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
    RAISE EXCEPTION 'Not authorized to change login attempt count';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'Not authorized to unlock accounts';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'Not authorized to change login timestamp';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'Not authorized to change login IP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

-- ── C. One-time backfill: accounts already confirmed by the auth provider ───
UPDATE public.profiles
   SET email_verified = true
 WHERE email_verified = false
   AND id IN (SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL);

-- ── D. Self-healing trigger: auth confirmation => derived profiles flag ─────
CREATE OR REPLACE FUNCTION public.sync_email_verified_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
       SET email_verified = true
     WHERE id = NEW.id AND email_verified = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_email_verified_from_auth ON auth.users;
CREATE TRIGGER trg_sync_email_verified_from_auth
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_verified_from_auth();
