-- Fix signup: "Database error saving new user"
--
-- Root cause: profiles table has FORCE ROW LEVEL SECURITY enabled but:
--   1. No INSERT policy exists (only SELECT/UPDATE)
--   2. supabase_auth_admin (GoTrue's connection role) had no grants on profiles
--   3. Both auth.users triggers were disabled
--   4. Trigger functions were SECURITY INVOKER (couldn't bypass RLS)
--
-- Fix: grant permissions, enable triggers, make trigger functions SECURITY DEFINER

-- 1. Grant permissions to the roles that need to access profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticator;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- 2. Make handle_new_user() SECURITY DEFINER so it bypasses FORCE RLS
--    during signup (the trigger inserts the first profile row)
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

-- 3. Make sync_email_verified_from_auth() SECURITY DEFINER too
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

-- 4. Enable the triggers (they were disabled via ALTER TABLE ... DISABLE TRIGGER)
-- Note: These live on auth.users which is owned by supabase_auth_admin.
-- They need to be enabled via supabase_admin role in the container:
--   docker exec supabase_db_scriviacloud psql -U supabase_admin -d postgres \
--     -c "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;"
--   docker exec supabase_db_scriviacloud psql -U supabase_admin -d postgres \
--     -c "ALTER TABLE auth.users ENABLE TRIGGER trg_sync_email_verified_from_auth;"
-- This migration documents the procedure; the VBS startup script handles it on boot.
