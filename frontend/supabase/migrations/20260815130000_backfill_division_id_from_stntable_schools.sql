/*
# Backfill division scoping for previously imported DBF rows

## Why
Rows imported before the division-scoping fixes (STNTABLE → schools and
MASTFILE → employees) may carry REGCODE/DIVCODE codes but no `division_id`
(uuid), or no codes at all. Division-scoped users (e.g. a payroll admin with an
assigned division) were therefore unable to see them.

This backfill repairs the existing data, idempotently:

1. Schools: derive `division_id` from their STNTABLE row's REGCODE/DIVCODE
   (only for schools that still have no division assigned).
2. Employees: derive `division_id` — and canonical REGCODE/DIVCODE when blank —
   from the employee's school (STACODE → schools.division_id).

Nothing is overwritten: employees with an existing division_id, and non-blank
codes, are left untouched. Rows that do not resolve (no STNTABLE, unassigned
school, unknown codes) are skipped.
*/

-- ============================================================================
-- 1. Schools ← dbf_stntable REGCODE/DIVCODE
-- ============================================================================
UPDATE schools s
SET division_id = sub.division_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (st.stacode)
    st.stacode,
    d.id AS division_id
  FROM dbf_stntable st
  JOIN divisions d ON trim(upper(d.division_code)) = trim(upper(st.divcode))
  JOIN regions r ON r.id = d.region_id
    AND trim(upper(r.region_code)) = trim(upper(st.regcode))
  WHERE st.stacode <> ''
    AND st.divcode <> ''
    AND st.regcode <> ''
  ORDER BY st.stacode, d.id
) sub
WHERE s.school_code = sub.stacode
  AND s.division_id IS NULL;

-- ============================================================================
-- 2. Employees ← their school's division (STACODE → schools)
-- ============================================================================
UPDATE employees e
SET division_id = s.division_id,
    regcode = COALESCE(NULLIF(btrim(e.regcode), ''), r.region_code, e.regcode),
    divcode = COALESCE(NULLIF(btrim(e.divcode), ''), d.division_code, e.divcode),
    updated_at = now()
FROM schools s
LEFT JOIN divisions d ON d.id = s.division_id
LEFT JOIN regions r ON r.id = d.region_id
WHERE e.division_id IS NULL
  AND s.division_id IS NOT NULL
  AND e.stacode = s.school_code;
