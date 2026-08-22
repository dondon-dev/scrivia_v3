IF position('SET LOCAL statement_timeout' in v_def) = 0
   OR position('CREATE TEMP TABLE _active_deds' in v_def) = 0
   OR position('WHERE d.emp_id = r_emp.id' in v_def) = 0
THEN
  RAISE EXCEPTION ...
END IF;