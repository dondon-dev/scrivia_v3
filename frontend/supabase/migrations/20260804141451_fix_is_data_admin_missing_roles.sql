-- Fix: is_data_admin() was missing super_admin, payroll_processor,
-- accounting_officer, and hr_administrator, causing dashboard load
-- failures for those roles (including super_admin).

CREATE OR REPLACE FUNCTION public.is_data_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin', 'payroll_admin', 'payroll_processor',
  'accounting_officer', 'hr_administrator',
  'division_finance', 'auditor', 'read_only'
);
$function$;