/*
# Authentication, User Profiles, and Audit Trail Schema

## Overview
Creates the database infrastructure for a role-based payroll management system with secure authentication,
multi-factor OTP, account lockout tracking, and a comprehensive audit trail.

## New Tables

### 1. profiles
Extends Supabase auth.users with application-level user data.
- `id` (uuid, PK, FK to auth.users) — links to the auth account
- `first_name` (text) — user's first name
- `last_name` (text) — user's last name
- `email` (text, unique) — must match auth.users email
- `mobile_number` (text) — contact number
- `username` (text, nullable, unique) — optional display name
- `role` (text, not null) — one of: super_admin, payroll_admin, encoder, viewer
- `mfa_enabled` (boolean, default false) — whether email OTP is required at login
- `failed_login_attempts` (int, default 0) — tracks consecutive failed logins
- `locked_until` (timestamptz, nullable) — timestamp until which account is locked
- `last_login_at` (timestamptz, nullable) — last successful login time
- `last_login_ip` (text, nullable) — last successful login IP
- `email_verified` (boolean, default false) — whether email has been verified
- `created_at` / `updated_at` (timestamptz)

### 2. otp_codes
Stores one-time passwords for MFA and email verification.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users)
- `code_hash` (text) — hashed OTP code (never store plaintext)
- `purpose` (text) — 'mfa' or 'email_verification'
- `expires_at` (timestamptz) — 5 minutes for MFA, 30 minutes for email verification
- `attempts` (int, default 0) — verification attempts made
- `max_attempts` (int, default 5) — lock after this many tries
- `used` (boolean, default false) — single-use enforcement
- `created_at` (timestamptz)

### 3. login_attempts
Tracks all login attempts for security monitoring and lockout enforcement.
- `id` (uuid, PK)
- `email` (text) — the email attempted
- `user_id` (uuid, nullable, FK to auth.users) — matched user if any
- `success` (boolean) — whether login succeeded
- `ip_address` (text, nullable)
- `user_agent` (text, nullable)
- `failure_reason` (text, nullable)
- `created_at` (timestamptz)

### 4. audit_logs
Permanent, append-only audit trail for all sensitive actions.
- `id` (uuid, PK)
- `user_id` (uuid, nullable, FK to auth.users)
- `user_email` (text, nullable) — denormalized for permanence
- `action` (text) — e.g. 'login', 'logout', 'payroll_generate', 'employee_update'
- `record_type` (text, nullable) — e.g. 'employee', 'payroll_entry'
- `record_id` (text, nullable) — affected record's ID
- `details` (jsonb, nullable) — additional context
- `ip_address` (text, nullable)
- `created_at` (timestamptz, default now())

### 5. password_reset_tokens
Single-use, expiring password reset tokens.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users)
- `token_hash` (text) — hashed reset token
- `expires_at` (timestamptz) — 30 minutes
- `used` (boolean, default false)
- `created_at` (timestamptz)

## Security Changes (RLS)
- profiles: users can read/update their own profile; super_admin can read all
- otp_codes: users can read/insert only their own OTPs
- login_attempts: insert-only for anon (to record attempts); select for authenticated on own attempts
- audit_logs: insert-only for authenticated; select for super_admin and viewer roles
- password_reset_tokens: insert-only for anon; select/update for authenticated on own tokens

## Important Notes
1. A trigger auto-creates a profile row when a new auth.users row is inserted.
2. Profiles default to the 'viewer' role until a super_admin upgrades them.
3. The first registered user is automatically assigned 'super_admin' role via trigger.
4. audit_logs is designed to be append-only — no UPDATE or DELETE policies.
5. OTP codes are hashed using pgcrypto's crypt() function before storage.
*/

-- ── profiles table ──
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text UNIQUE NOT NULL,
  mobile_number text NOT NULL DEFAULT '',
  username text UNIQUE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('super_admin', 'payroll_admin', 'encoder', 'viewer')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  failed_login_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_login_ip text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ── otp_codes table ──
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'mfa' CHECK (purpose IN ('mfa', 'email_verification')),
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_otp" ON otp_codes;
CREATE POLICY "select_own_otp" ON otp_codes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_otp" ON otp_codes;
CREATE POLICY "insert_own_otp" ON otp_codes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_otp" ON otp_codes;
CREATE POLICY "update_own_otp" ON otp_codes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── login_attempts table ──
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  success boolean NOT NULL,
  ip_address text,
  user_agent text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a login attempt (even anon, to record failed logins)
DROP POLICY IF EXISTS "insert_login_attempts" ON login_attempts;
CREATE POLICY "insert_login_attempts" ON login_attempts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Authenticated users can view their own login attempts
DROP POLICY IF EXISTS "select_own_login_attempts" ON login_attempts;
CREATE POLICY "select_own_login_attempts" ON login_attempts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Super admins can view all login attempts
DROP POLICY IF EXISTS "select_all_login_attempts_admin" ON login_attempts;
CREATE POLICY "select_all_login_attempts_admin" ON login_attempts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ── audit_logs table ──
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  record_type text,
  record_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert audit logs
DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- Super admins and viewers can read all audit logs
DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'viewer'))
  );

-- ── password_reset_tokens table ──
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_expires ON password_reset_tokens(expires_at);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Anon can insert reset token requests (password reset flow starts unauthenticated)
DROP POLICY IF EXISTS "insert_password_reset" ON password_reset_tokens;
CREATE POLICY "insert_password_reset" ON password_reset_tokens FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Authenticated users can read/update their own reset tokens
DROP POLICY IF EXISTS "select_own_reset_tokens" ON password_reset_tokens;
CREATE POLICY "select_own_reset_tokens" ON password_reset_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reset_tokens" ON password_reset_tokens;
CREATE POLICY "update_own_reset_tokens" ON password_reset_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Trigger: auto-create profile on user signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count int;
  assigned_role text;
BEGIN
  -- First user becomes super_admin, rest default to viewer
  SELECT count(*) INTO user_count FROM profiles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := 'viewer';
  END IF;

  INSERT INTO public.profiles (id, email, first_name, last_name, mobile_number, username, role, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    assigned_role,
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Trigger: update updated_at on profiles ──
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Enable pgcrypto for crypt() / gen_salt() ──
CREATE EXTENSION IF NOT EXISTS pgcrypto;
