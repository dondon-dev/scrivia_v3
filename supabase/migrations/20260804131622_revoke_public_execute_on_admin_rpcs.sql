-- F18: administrator-only RPCs were EXECUTE-able by PUBLIC/anon. They fail closed
-- internally today, but the entry point should not be open to the internet.

REVOKE ALL ON FUNCTION public.approve_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_user(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disable_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enable_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_assigned_stacode(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_employee_number(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_payroll(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_assigned_stacode(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_number(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payroll(uuid) TO authenticated;
