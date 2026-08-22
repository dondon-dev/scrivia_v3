-- Fix the remaining search_path function
ALTER FUNCTION public.generate_monthly_periods(integer, text, text) SET search_path = 'public';

-- ============================================================
-- FIX 2: Replace always-true RLS policies with proper role checks
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  sql_cmd TEXT;
BEGIN
  FOR rec IN 
    SELECT 
      p.schemaname, 
      p.tablename, 
      p.policyname, 
      p.cmd as pcmd, 
      p.qual, 
      p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public' 
      AND (p.qual = 'true' OR p.with_check = 'true')
    ORDER BY p.tablename, p.policyname
  LOOP
    -- Drop the always-true policy
    sql_cmd := format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
    EXECUTE sql_cmd;

    -- Read-only lookup tables: allow anon + authenticated for SELECT
    IF rec.tablename IN ('regions', 'divisions', 'deduction_codes', 'division_office',
                          'salary_schedule', 'payroll_groups', 'schools')
       AND rec.pcmd = 'SELECT' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() IN (''anon'', ''authenticated'', ''service_role''))',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;

    -- All other policies: require authenticated role
    ELSIF rec.pcmd = 'SELECT' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() = ''authenticated'')',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;
    ELSIF rec.pcmd = 'INSERT' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.role() = ''authenticated'')',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;
    ELSIF rec.pcmd = 'UPDATE' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;
    ELSIF rec.pcmd = 'DELETE' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.role() = ''authenticated'')',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;
    ELSIF rec.pcmd = 'ALL' THEN
      sql_cmd := format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
        rec.policyname, rec.tablename);
      EXECUTE sql_cmd;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'All RLS policies fixed.';
END
$$;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'search_path mutable' as issue, count(*) as remaining
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND (p.proconfig IS NULL OR NOT (p.proconfig @> ARRAY['search_path=public']))

UNION ALL

SELECT 'always-true RLS', count(*)
FROM pg_policies 
WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true');
