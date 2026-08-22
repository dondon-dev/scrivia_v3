SELECT
  position('SET LOCAL statement_timeout' in pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)) > 0 as has_timeout,
  position('CREATE TEMP TABLE _active_deds' in pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)) > 0 as has_temp_table,
  position('WHERE d.emp_id = r_emp.id' in pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)) > 0 as has_lookup;
