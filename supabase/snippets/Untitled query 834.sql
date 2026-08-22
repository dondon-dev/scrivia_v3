SELECT
  position(
    'SET LOCAL statement_timeout'
    IN pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)
  ) > 0 AS has_timeout,
  position(
    'CREATE TEMP TABLE _active_deds'
    IN pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)
  ) > 0 AS has_temp_table,
  position(
    'WHERE d.emp_id = r_emp.id'
    IN pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure)
  ) > 0 AS has_lookup;