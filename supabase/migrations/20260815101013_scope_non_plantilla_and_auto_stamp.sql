/*
# Scope non-plantilla items by REGCODE / DIVCODE + auto-stamp on create/upload

`non_plantilla_employees` had no division reference at all, so every division
saw (and could edit) the same global list — a data leak. REGCODE + DIVCODE are
the unique reference for one division's payroll, so this migration:

1. Adds `regcode` / `divcode` columns to `non_plantilla_employees` + an index.
2. Reuses the existing `stamp_division_codes()` trigger on INSERT **and**
   UPDATE, so records created or uploaded while signed in to a division are
   automatically assigned that division's codes. The UPDATE trigger also heals
   rows that predate this migration whenever their owning division edits them
   (the trigger only fills codes when they are still empty).
3. Extends the same INSERT-only stamping on `initial_payroll_records` and
   `signatories` to also fire on UPDATE, for the same self-healing reason.
4. Backfills existing non-plantilla rows where the owning division can be
   determined:
   a. by unique identifier match (TIN / PAG-IBIG / PhilHealth / Land Bank)
      against `employees` rows that already carry codes;
   b. by exact school/office name match against `employees.department`.
   Rows that still carry no codes afterwards are treated as system-level rows:
   they stay visible only in the super administrator's "All Divisions" view
   until re-uploaded under a division (division-scoped views never show them).

Idempotent — safe to re-run.
*/

-- ── 1. Division columns on non_plantilla_employees ──────────────────────────

ALTER TABLE non_plantilla_employees
  ADD COLUMN IF NOT EXISTS regcode text,
  ADD COLUMN IF NOT EXISTS divcode text;

CREATE INDEX IF NOT EXISTS idx_non_plantilla_division
  ON non_plantilla_employees (regcode, divcode);

-- ── 2. Stamping triggers ────────────────────────────────────────────────────
-- Reuses public.stamp_division_codes() (created in the earlier scope migration):
-- it reads the acting user's profile division and fills NEW.regcode/NEW.divcode
-- only when they are empty (COALESCE), so explicit frontend codes always win.
-- NOTE: Function may not exist yet if earlier migrations failed; create it here.
CREATE OR REPLACE FUNCTION public.stamp_division_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_division_id uuid;
  v_regcode text;
  v_divcode text;
BEGIN
  SELECT division_id INTO v_division_id
    FROM profiles WHERE id = auth.uid() LIMIT 1;
  IF v_division_id IS NOT NULL THEN
    SELECT r.region_code, d.division_code
      INTO v_regcode, v_divcode
      FROM divisions d
      LEFT JOIN regions r ON r.id = d.region_id
     WHERE d.id = v_division_id LIMIT 1;
    IF v_regcode IS NOT NULL THEN
      NEW.regcode := COALESCE(NEW.regcode, v_regcode);
      NEW.divcode := COALESCE(NEW.divcode, v_divcode);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_non_plantilla_division_insert ON non_plantilla_employees;
CREATE TRIGGER trg_non_plantilla_division_insert
  BEFORE INSERT ON non_plantilla_employees
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

DROP TRIGGER IF EXISTS trg_non_plantilla_division_update ON non_plantilla_employees;
CREATE TRIGGER trg_non_plantilla_division_update
  BEFORE UPDATE ON non_plantilla_employees
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

-- Extend initial_payroll_records / signatories stamping to UPDATE as well
-- (previously INSERT-only), so legacy null-code rows get healed on edit.
DROP TRIGGER IF EXISTS trg_initial_payroll_records_division ON initial_payroll_records;
CREATE TRIGGER trg_initial_payroll_records_division
  BEFORE INSERT OR UPDATE ON initial_payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

DROP TRIGGER IF EXISTS trg_signatories_division ON signatories;
CREATE TRIGGER trg_signatories_division
  BEFORE INSERT OR UPDATE ON signatories
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

-- ── 3. Backfill non-plantilla rows ──────────────────────────────────────────

-- 3a. Unique identifier match (TIN / PAG-IBIG / PhilHealth / Land Bank),
--     compared as normalized digits (legacy rows store numbers with/without
--     dashes, e.g. "352-463-922" vs "352463922", and even as spreadsheet
--     artifacts like "NO DEDUCTION" or scientific notation). Only rows whose
--     employee-side record already carries codes qualify, and each non-plantilla
--     row is stamped from a single (deduplicated) employee.
WITH norm AS (
  SELECT np2.id AS np_id,
         NULLIF(regexp_replace(np2.tin, '[^0-9]', '', 'g'), '') AS tin,
         NULLIF(regexp_replace(np2.pagibig_number, '[^0-9]', '', 'g'), '') AS pagibig,
         NULLIF(regexp_replace(np2.philhealth, '[^0-9]', '', 'g'), '') AS philhealth,
         NULLIF(regexp_replace(np2.landbank, '[^0-9]', '', 'g'), '') AS landbank
    FROM non_plantilla_employees np2
   WHERE np2.regcode IS NULL AND np2.divcode IS NULL
)
UPDATE non_plantilla_employees np
   SET regcode = m.regcode,
       divcode = m.divcode
  FROM (
    SELECT DISTINCT ON (n.np_id) n.np_id, e.regcode, e.divcode
      FROM norm n
      JOIN employees e
        ON e.regcode IS NOT NULL AND e.regcode <> ''
       AND e.divcode IS NOT NULL AND e.divcode <> ''
       AND (
            (n.tin IS NOT NULL AND n.tin = regexp_replace(e.tin, '[^0-9]', '', 'g'))
         OR (n.pagibig IS NOT NULL AND n.pagibig = regexp_replace(e.pagibig_number, '[^0-9]', '', 'g'))
         OR (n.philhealth IS NOT NULL AND n.philhealth = regexp_replace(e.philhealth_number, '[^0-9]', '', 'g'))
         OR (n.landbank IS NOT NULL AND n.landbank = regexp_replace(e.bank_account, '[^0-9]', '', 'g'))
       )
    ORDER BY n.np_id
  ) m
 WHERE np.id = m.np_id;

-- 3b. Exact school / office name match against employees.department.
UPDATE non_plantilla_employees np
   SET regcode = m.regcode,
       divcode = m.divcode
  FROM (
    SELECT DISTINCT ON (np2.id) np2.id, e.regcode, e.divcode
      FROM non_plantilla_employees np2
      JOIN employees e
        ON e.regcode IS NOT NULL AND e.regcode <> ''
       AND e.divcode IS NOT NULL AND e.divcode <> ''
       AND e.department IS NOT NULL AND e.department <> ''
       AND e.department = np2.school
     WHERE np2.regcode IS NULL AND np2.divcode IS NULL
     ORDER BY np2.id
  ) m
 WHERE np.id = m.id;

-- 3c. Schools-directory bridge: non-plantilla rows usually name their school
--     with an abbreviated form ("PRINZA ES", "KAY-ANLOG ES", "JRMS" vs the
--     directory's "PRINZA ELEM SCHOOL", "KAY ANLOG ELEM SCHOOL", "J RIZAL
--     MEMORIAL SCHOOL"). Resolve the school to its STACODE via the Organization
--     directory, then to the division that owns that STACODE in the employees
--     masterfile. Tolerant name rules, each guarded so tiny tokens ("ES",
--     "IN") can never match by accident:
--       • first-word equality ("PRINZA ES" ↔ "PRINZA ELEM SCHOOL");
--       • normalized prefix, all non-alphanumerics stripped ("BUNTOGES" is a
--         prefix of "BUNTOGELEMSCHOOL"), minimum length 4;
--       • stem equality: strip common school-type suffixes ("ES", "IS", "HS",
--         "NHS", "ELEM SCHOOL", …) so "KAYANLOGES" ↔ "KAYANLOGELEMSCHOOL"
--         both stem to "KAYANLOG";
--       • initials equality for acronyms ("JRMS" ↔ "J RIZAL MEMORIAL
--         SCHOOL" initials "JRMS"), acronym length 3–6;
--       • contains-token: the row's school name embeds a directory school's
--         first word ("JRMS (PARIAN ES)" ⊃ "PARIAN").
--     A row is stamped only when every matched school STACODE resolves to the
--     SAME division, so an ambiguous name can never be mis-assigned.
WITH np_norm AS (
  SELECT np2.id AS np_id,
         upper(regexp_replace(np2.school, '[^A-Za-z0-9 ]', '', 'g')) AS spaced,
         upper(regexp_replace(np2.school, '[^A-Za-z0-9]', '', 'g')) AS tight,
         regexp_replace(
           regexp_replace(upper(regexp_replace(np2.school, '[^A-Za-z0-9]', '', 'g')),
             '(ELEMSCHOOL|ELEMENTARYSCHOOL|INTEGRATEDSCHOOL|NATIONALSCHOOL|HIGHSCHOOL|NHS|ELEM|SCHOOL|ES|IS|HS|NATIONAL|INTEGRATED|MEMORIAL|ELEMENTARY|HIGH)$', '', 'g'),
           '\s+', '', 'g') AS stem
    FROM non_plantilla_employees np2
   WHERE np2.regcode IS NULL AND np2.divcode IS NULL
),
school_norm AS (
  SELECT s.school_code,
         upper(regexp_replace(s.school_name, '[^A-Za-z0-9 ]', '', 'g')) AS spaced,
         upper(regexp_replace(s.school_name, '[^A-Za-z0-9]', '', 'g')) AS tight,
         regexp_replace(
           regexp_replace(upper(regexp_replace(s.school_name, '[^A-Za-z0-9]', '', 'g')),
             '(ELEMSCHOOL|ELEMENTARYSCHOOL|INTEGRATEDSCHOOL|NATIONALSCHOOL|HIGHSCHOOL|NHS|ELEM|SCHOOL|ES|IS|HS|NATIONAL|INTEGRATED|MEMORIAL|ELEMENTARY|HIGH)$', '', 'g'),
           '\s+', '', 'g') AS stem,
         regexp_replace(
           regexp_replace(upper(regexp_replace(s.school_name, '[^A-Za-z0-9 ]', '', 'g')),
             '(^| )([A-Z0-9])[^ ]*', '\2', 'g'),
           ' ', '', 'g') AS initials
    FROM schools s
)
UPDATE non_plantilla_employees np
   SET regcode = m.regcode,
       divcode = m.divcode
  FROM (
    SELECT b.np_id,
           min(b.regcode) AS regcode,
           min(b.divcode) AS divcode
      FROM (
        SELECT n.np_id, e.regcode, e.divcode
          FROM np_norm n
          JOIN school_norm s
            ON split_part(n.spaced, ' ', 1) = split_part(s.spaced, ' ', 1)
            OR (length(n.tight) >= 4 AND starts_with(s.tight, n.tight))
            OR (length(n.stem) >= 4 AND n.stem = s.stem)
            OR (length(n.tight) BETWEEN 3 AND 6 AND n.tight = s.initials)
            OR (length(n.tight) >= 4 AND n.tight LIKE '%' || split_part(s.spaced, ' ', 1) || '%')
          JOIN employees e
            ON e.stacode IS NOT NULL AND e.stacode <> ''
           AND e.stacode = s.school_code
           AND e.regcode IS NOT NULL AND e.regcode <> ''
           AND e.divcode IS NOT NULL AND e.divcode <> ''
      ) b
     GROUP BY b.np_id
    HAVING count(DISTINCT b.regcode || '|' || b.divcode) = 1
  ) m
 WHERE np.id = m.np_id;
