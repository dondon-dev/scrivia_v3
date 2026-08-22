-- Backfill payroll_group_id for employees with valid STACODEs that were imported
-- before the automatic STACODE synchronization logic existed.
-- All 2,104 Elementary-range (001-499) employees currently have NULL payroll_group_id.

UPDATE employees e
SET payroll_group_id = pg.id,
    updated_at = now()
FROM payroll_groups pg
WHERE pg.status = 'Active'
  AND pg.stacode_min IS NOT NULL
  AND pg.stacode_max IS NOT NULL
  AND e.stacode ~ '^\d+$'
  AND e.stacode::int >= pg.stacode_min
  AND e.stacode::int <= pg.stacode_max
  AND e.payroll_group_id IS NULL;
