/*
# Fix RLS Helper Function Volatility — Performance Critical

## Problem
The RLS helper functions (get_current_user_role, get_current_user_divcode,
get_current_user_stacode, get_current_user_empno, is_data_admin, is_data_writer)
were all declared VOLATILE (the default). This forces PostgreSQL to re-execute
each function call for every single row evaluated by an RLS policy.

With 2,710 employees and policies that call multiple functions per row,
each page load triggered tens of thousands of sub-queries to the profiles
table. pg_stat_user_tables confirmed 38.7M tuples read on a 2,710-row table.

## Fix
Recreate all six functions as STABLE. A STABLE function's result is cached
for the duration of the enclosing statement, so the profiles lookup happens
once per query instead of once per row. This reduces the RLS overhead from
O(rows × functions) to O(1) per query — a dramatic improvement.

## Security
No changes to RLS policies or table structure. Functions remain SECURITY
DEFINER with fixed search_path. Only the volatility category changes.
*/

-- get_current_user_role: VOLATILE → STABLE
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
SELECT role FROM profiles WHERE id = auth.uid();
$function$;

-- get_current_user_divcode: VOLATILE → STABLE
-- Guarded: divisions table is created in a later migration (20260809090100)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'divisions') THEN
    CREATE OR REPLACE FUNCTION public.get_current_user_divcode()
    RETURNS text
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path TO 'public'
    AS $function$
    SELECT d.divcode 
    FROM profiles p
    JOIN divisions d ON p.division_id = d.id
    WHERE p.id = auth.uid();
    $function$;
  END IF;
END $$;

-- get_current_user_stacode: VOLATILE → STABLE
CREATE OR REPLACE FUNCTION public.get_current_user_stacode()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$function$;

-- get_current_user_empno: VOLATILE → STABLE
CREATE OR REPLACE FUNCTION public.get_current_user_empno()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid();
$function$;

-- is_data_admin: VOLATILE → STABLE
CREATE OR REPLACE FUNCTION public.is_data_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin', 'payroll_admin', 'payroll_processor',
  'accounting_officer', 'hr_administrator',
  'division_finance', 'auditor', 'read_only'
);
$function$;

-- is_data_writer: VOLATILE → STABLE
CREATE OR REPLACE FUNCTION public.is_data_writer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin', 'payroll_admin', 'payroll_processor', 'hr_administrator'
);
$function$;