-- IUS Payroll Group (Implementing Unit Schools)
-- Run this in PocketBase SQL console or via migration.
--
-- Adds the "IUS" payroll group so it appears under "Specific Groups" in the
-- Payroll Group filter (Smart Import, Employees, Payroll, Deduction Masterfile,
-- etc.). No STACODE range is set (stacode_min/max NULL) — employees in this
-- group are assigned manually by STACODE.
--
-- Idempotent: safe to re-run; it will not duplicate the group.

INSERT INTO payroll_groups (id, group_code, group_name, description, status, stacode_min, stacode_max, created_by)
SELECT lower(hex(randomblob(16))), 'IUS', 'Implementing Unit Schools (IUS)', 'Implementing Unit Schools payroll group', 'Active', NULL, NULL, 'admin'
WHERE NOT EXISTS (SELECT 1 FROM payroll_groups WHERE group_code = 'IUS');

-- Verify:
-- SELECT id, group_code, group_name, status, stacode_min, stacode_max FROM payroll_groups WHERE group_code = 'IUS';