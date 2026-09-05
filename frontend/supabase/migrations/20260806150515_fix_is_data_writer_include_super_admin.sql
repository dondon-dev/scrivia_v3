/*
# Fix is_data_writer() to include super_admin

## Problem
The `employees` table INSERT and UPDATE RLS policies use `is_data_writer()`,
which only returns true for `payroll_admin`, `payroll_processor`,
`payroll_officer`, and `hr_administrator`. A `super_admin` (the top-level
administrator role) is NOT included in `is_data_writer()`, so any INSERT
attempt by a super_admin fails with:
  "new row violates row-level security policy for table employees"

This blocked the Initial Payroll CSV import (and any other employee insert)
for super_admin users.

## Fix
Update `is_data_writer()` to also return true for `super_admin`, matching
the intent that the top-level admin can write data across the system.

## Security
No new policies created. No tables altered. Only the helper function's
role list is expanded to include `super_admin`.
*/

CREATE OR REPLACE FUNCTION public.is_data_writer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin',
  'payroll_admin',
  'payroll_processor',
  'payroll_officer',
  'hr_administrator'
);
$function$;
