-- F20: three functions had a mutable search_path.

ALTER FUNCTION public.get_dbf_table_counts_by_category() SET search_path = public;
ALTER FUNCTION public.generate_monthly_periods(integer) SET search_path = public;
ALTER FUNCTION public.get_payroll_history_by_month(integer) SET search_path = public;
