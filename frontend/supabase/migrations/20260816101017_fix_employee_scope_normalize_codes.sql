/*
# Normalize division codes + stamp division_id on existing rows

## Why
Employees imported before division scoping carry REGCODE/DIVCODE straight from
the legacy DBF files (often zero-padded, e.g. '01'/'001') and frequently no
division_id (uuid). The scoped query RPCs match non-super_admins by
`division_id = my_division OR (regcode = my_region_code AND divcode =
my_division_code)` — zero-padded codes never equal the directory codes, so a
division's payroll admin cannot see their own division's uploaded employees.

## Fix (idempotent, safe to re-run)
1. Employees: match REGCODE/DIVCODE to the divisions directory tolerantly
   (trim/uppercase/zero-strip) and rewrite the row to the directory's canonical
   codes + division_id.
2. Employees still without division_id: derive it from their school
   (STACODE → schools → division).
3. Schools: derive division_id from dbf_stntable codes (zero-strip tolerant).
4. pay_periods: canonicalize regcode/divcode the same way so the Payroll page
   (scoped by get_current_user_division_codes()) sees the division's periods.
   When two period rows for the same (year, month) map to the same division,
   the row already carrying the canonical codes wins and the other is un-coded
   (no unique-index violations).
*/

-- ============================================================================
-- 1. Employees: canonicalize codes + stamp division_id from REGCODE/DIVCODE
-- ============================================================================
UPDATE employees e
SET division_id = d.id,
    regcode = r.region_code,
    divcode = d.division_code,
    updated_at = now()
FROM divisions d
JOIN regions r ON r.id = d.region_id
WHERE trim(e.regcode) <> ''
  AND trim(e.divcode) <> ''
  AND (
    (trim(upper(e.regcode)) = trim(upper(r.region_code)) AND trim(upper(e.divcode)) = trim(upper(d.division_code)))
    OR (trim(upper(REGEXP_REPLACE(e.regcode, '^0+', ''))) = trim(upper(r.region_code)) AND trim(upper(REGEXP_REPLACE(e.divcode, '^0+', ''))) = trim(upper(d.division_code)))
  )
  AND (e.division_id IS DISTINCT FROM d.id OR e.regcode IS DISTINCT FROM r.region_code OR e.divcode IS DISTINCT FROM d.division_code);

-- ============================================================================
-- 2. Employees still without division_id: derive from their school
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

-- ============================================================================
-- 3. Schools: derive division_id from dbf_stntable codes (zero-strip tolerant)
-- ============================================================================
UPDATE schools s
SET division_id = sub.division_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (st.stacode)
    st.stacode,
    d.id AS division_id
  FROM dbf_stntable st
  JOIN divisions d
    ON trim(upper(d.division_code)) = trim(upper(st.divcode))
    OR trim(upper(d.division_code)) = trim(upper(REGEXP_REPLACE(st.divcode, '^0+', '')))
  JOIN regions r ON r.id = d.region_id
    AND (
      trim(upper(r.region_code)) = trim(upper(st.regcode))
      OR trim(upper(r.region_code)) = trim(upper(REGEXP_REPLACE(st.regcode, '^0+', '')))
    )
  WHERE st.stacode <> ''
    AND st.divcode <> ''
    AND st.regcode <> ''
  ORDER BY st.stacode, d.id
) sub
WHERE s.school_code = sub.stacode
  AND s.division_id IS NULL;

-- ============================================================================
-- 4. pay_periods: canonicalize division codes (only when no conflict)
-- ============================================================================
UPDATE pay_periods pp
SET regcode = r.region_code,
    divcode = d.division_code
FROM divisions d
JOIN regions r ON r.id = d.region_id
WHERE trim(pp.regcode) <> ''
  AND trim(pp.divcode) <> ''
  AND (
    (trim(upper(pp.regcode)) = trim(upper(r.region_code)) AND trim(upper(pp.divcode)) = trim(upper(d.division_code)))
    OR (trim(upper(REGEXP_REPLACE(pp.regcode, '^0+', ''))) = trim(upper(r.region_code)) AND trim(upper(REGEXP_REPLACE(pp.divcode, '^0+', ''))) = trim(upper(d.division_code)))
  )
  AND (pp.regcode IS DISTINCT FROM r.region_code OR pp.divcode IS DISTINCT FROM d.division_code)
  AND NOT EXISTS (
    SELECT 1 FROM pay_periods p2
    WHERE p2.id <> pp.id
      AND p2.year IS NOT DISTINCT FROM pp.year
      AND p2.month IS NOT DISTINCT FROM pp.month
      AND p2.regcode = r.region_code
      AND p2.divcode = d.division_code
  );

-- 4b. Periods that lost the canonical-codes race: un-code them so the unique
--     (year, month, regcode, divcode) index is never violated and the visible
--     period is the one carrying the canonical codes.
UPDATE pay_periods pp
SET regcode = NULL,
    divcode = NULL
FROM divisions d
JOIN regions r ON r.id = d.region_id
WHERE trim(pp.regcode) <> ''
  AND trim(pp.divcode) <> ''
  AND (
    (trim(upper(pp.regcode)) = trim(upper(r.region_code)) AND trim(upper(pp.divcode)) = trim(upper(d.division_code)))
    OR (trim(upper(REGEXP_REPLACE(pp.regcode, '^0+', ''))) = trim(upper(r.region_code)) AND trim(upper(REGEXP_REPLACE(pp.divcode, '^0+', ''))) = trim(upper(d.division_code)))
  )
  AND EXISTS (
    SELECT 1 FROM pay_periods p2
    WHERE p2.id <> pp.id
      AND p2.year IS NOT DISTINCT FROM pp.year
      AND p2.month IS NOT DISTINCT FROM pp.month
      AND p2.regcode = r.region_code
      AND p2.divcode = d.division_code
  );
