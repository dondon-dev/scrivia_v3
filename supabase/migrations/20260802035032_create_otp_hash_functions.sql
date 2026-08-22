/*
# OTP Hashing and Verification Functions

## Overview
Creates SECURITY DEFINER functions for hashing and verifying OTP codes server-side
using pgcrypto's crypt() and gen_salt(). This ensures OTP codes are never stored
in plaintext in the database.

## New Functions

### 1. hash_otp(otp_code text) RETURNS text
Hashes an OTP code using bcrypt-style hashing via pgcrypto.
Safe to call by any role — it's a pure function with no table access.

### 2. verify_otp(otp_code text, stored_hash text) RETURNS boolean
Verifies an OTP code against a stored hash.
Safe to call by any role — pure function.

### 3. cleanup_expired_otps() RETURNS void
Deletes expired or used OTP codes. Can be called by authenticated users.

### 4. get_user_role(user_uuid uuid) RETURNS text
Returns the role of a user from the profiles table. Used for RLS policy
checks where a subquery would cause recursion.

## Security
- All functions are SECURITY DEFINER with fixed search_path to prevent injection.
- hash_otp and verify_otp are executable by anon and authenticated (needed for
  both the MFA login flow and the email verification flow).
- get_user_role is executable by authenticated only.
*/

CREATE OR REPLACE FUNCTION public.hash_otp(otp_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgcrypto
AS $$
BEGIN
  RETURN crypt(otp_code, gen_salt('bf'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hash_otp(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_otp(otp_code text, stored_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgcrypto
AS $$
BEGIN
  RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_otp(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now() OR used = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO authenticated;

-- get_user_role: safe role lookup for RLS policy subqueries
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_uuid;
  RETURN COALESCE(user_role, 'viewer');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
