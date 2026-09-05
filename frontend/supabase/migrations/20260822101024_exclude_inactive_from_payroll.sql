/*
# Exclude Inactive Employees from Payroll Computation

Employees with status = 'Inactive' must never be part of a payroll run. The
engine built its employee scope from ALL in-scope employees with no status
filter, while the UI only lists Active employees — so anyone marked Inactive
after a run kept stale Computed/Posted entries, and a new run would compute
pay for them (polluting the Payroll Register and the dashboard's "Pending
Approvals" count).

Changes:
1. run_payroll_engine(): the employee scope now excludes Inactive employees
   in both the super_admin and division-scoped branches, and the compute
   loop / STACODE validation re-check status as defense in depth.
2. Cleans up stale payroll rows for Inactive employees in non-closed periods
   (Computed entries + their run-derived itemized deduction lines), so the
   pending-approvals count is accurate. Posted entries are never touched.

## Security
- No new tables / policies. The engine's existing role checks are unchanged.
*/

-- 1. Patch run_payroll_engine to compute only Active employees.
--    The function body is regenerated from the live definition so it always
--    matches the deployed version exactly; the guard below fails loudly if any
--    expected pattern is missing (function drifted).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure) INTO v_def;

  -- super_admin branch: only Active employees
  v_def := replace(v_def,
    'SELECT array_agg(id) INTO v_employee_ids FROM employees;',
    'SELECT array_agg(id) INTO v_employee_ids FROM employees WHERE status = ''Active'';');

  -- division-scoped branch: only Active employees
  v_def := replace(v_def,
    'AND e.divcode = d.division_code',
    'AND e.divcode = d.division_code AND e.status = ''Active''');

  -- compute loop + STACODE validation: only Active employees (defense in depth)
  v_def := replace(v_def,
    'WHERE e.id = ANY(v_employee_ids)',
    'WHERE e.id = ANY(v_employee_ids) AND e.status = ''Active''');

  IF position('FROM employees WHERE status = ''Active'';' in v_def) = 0
     OR position('AND e.divcode = d.division_code AND e.status = ''Active''' in v_def) = 0
     OR position('ANY(v_employee_ids) AND e.status = ''Active''' in v_def) = 0 THEN
    RAISE EXCEPTION 'run_payroll_engine update failed: Active filter not applied as expected';
  END IF;

  EXECUTE v_def;
END $$;

-- 2. Clean up stale rows for Inactive employees in non-closed periods.
--    Computed entries only — posted payroll is never touched here.
DELETE FROM undeducted_obligations u
USING employees e
WHERE u.employee_id = e.id
  AND e.status = 'Inactive'
  AND u.pay_period_id IN (SELECT id FROM pay_periods WHERE status <> 'closed');

DELETE FROM deductions d
USING employees e
WHERE d.employee_id = e.id
  AND e.status = 'Inactive'
  AND d.pay_period_id IN (SELECT id FROM pay_periods WHERE status <> 'closed')
  AND d.source IN ('Payroll Run', 'INCLUDED');

DELETE FROM payroll_entries pe
USING employees e
WHERE pe.employee_id = e.id
  AND e.status = 'Inactive'
  AND pe.status = 'Computed'
  AND pe.pay_period_id IN (SELECT id FROM pay_periods WHERE status <> 'closed');
