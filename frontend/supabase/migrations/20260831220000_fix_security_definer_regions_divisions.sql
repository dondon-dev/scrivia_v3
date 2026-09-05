-- Fix: Region/Division RPCs were SECURITY DEFINER, which caused auth.uid()
-- to return NULL inside the function body. The role check then always failed,
-- so INSERT/UPDATE/DELETE never executed. Switch to SECURITY INVOKER so the
-- authenticated user's identity is preserved.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'upsert_region', 'delete_region',
        'upsert_division', 'delete_division',
        'set_user_division', 'assign_schools_to_division',
        'clear_schools_from_division', 'sync_employees_to_division'
      )
      AND p.prosecdef = true
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', r.oid::regprocedure);
    RAISE NOTICE 'Fixed % → SECURITY INVOKER', r.proname;
  END LOOP;
END$$;

-- Ensure authenticated role can execute them
GRANT EXECUTE ON FUNCTION upsert_region(uuid,text,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_region(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_division(uuid,uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_division(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
