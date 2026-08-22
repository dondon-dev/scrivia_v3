-- Fix auth triggers and grants after supabase db reset
-- The db reset disables the auth triggers; this re-enables them.

-- 1. Grant permissions on profiles to auth roles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticator;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- 2. Make trigger functions SECURITY DEFINER (bypass FORCE RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count int;
  assigned_role text;
  assigned_status text;
BEGIN
  SELECT count(*) INTO user_count FROM profiles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
    assigned_status := 'approved';
  ELSE
    assigned_role := 'read_only';
    assigned_status := 'pending_approval';
  END IF;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, mobile_number, username,
    role, email_verified, status,
    office_assignment, position_designation, employee_number
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    assigned_role,
    false,
    assigned_status,
    NULLIF(NEW.raw_user_meta_data->>'office_assignment', ''),
    NULLIF(NEW.raw_user_meta_data->>'position_designation', ''),
    NULLIF(NEW.raw_user_meta_data->>'employee_number', '')
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_email_verified_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
       SET email_verified = true
     WHERE id = NEW.id AND email_verified = false;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Enable the auth triggers (runs as postgres via supabase_admin on container)
-- These must be run via docker exec since auth.users is owned by supabase_auth_admin
-- See fix-auth-triggers.ps1 for the docker exec commands
