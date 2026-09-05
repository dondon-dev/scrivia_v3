-- F1-F7, F12: these readers ran as owner (SECURITY DEFINER), performed no
-- authorization of their own, took the data scope from caller-supplied
-- parameters, and were EXECUTE-able by anon/PUBLIC. Running them as the invoker
-- makes the existing scoped RLS SELECT policies apply, and revoking anon/PUBLIC
-- removes the unauthenticated entry point.

ALTER FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text) SECURITY INVOKER;
ALTER FUNCTION public.query_dedfile(text,text,text,text,text,integer,integer,text,text,integer,integer,boolean) SECURITY INVOKER;
ALTER FUNCTION public.query_payroll_deductions(text,text,text,integer,integer,boolean) SECURITY INVOKER;
ALTER FUNCTION public.get_payroll_register_totals(uuid,uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.get_deductions_summary(uuid,uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.get_deduction_engine_stats() SECURITY INVOKER;
ALTER FUNCTION public.get_payroll_group_counts() SECURITY INVOKER;
ALTER FUNCTION public.validate_employee_for_approval(text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.query_dedfile(text,text,text,text,text,integer,integer,text,text,integer,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.query_payroll_deductions(text,text,text,integer,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payroll_register_totals(uuid,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_deductions_summary(uuid,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_deduction_engine_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payroll_group_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_employee_for_approval(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.query_employees(text,integer,integer,text,uuid,text,integer,integer,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.query_dedfile(text,text,text,text,text,integer,integer,text,text,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.query_payroll_deductions(text,text,text,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_register_totals(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deductions_summary(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deduction_engine_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_group_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_employee_for_approval(text) TO authenticated;
