/*
# Scope remaining sidebar menus by REGCODE / DIVCODE

Menus that were still reading system-wide rows are now division-scoped the
same way the masterfile/payroll menus already are. REGCODE + DIVCODE are the
unique reference for one division's payroll, so every menu that shows division
data must filter by them.

Changes:
1. `audit_logs`            — + regcode / divcode columns (stamped automatically)
2. `signatories`           — + regcode / divcode columns (stamped automatically)
3. `initial_payroll_records` — + regcode / divcode columns (stamped automatically)
4. `stamp_division_codes()`  — BEFORE INSERT trigger that stamps the acting
   user's division codes on those tables, so new rows are never cross-division.
5. Backfill existing rows from the acting user's profile where possible.
6. `get_deduction_engine_stats(p_regcode, p_divcodes)` — Deduction Codes menu
   stats now respect the division scope (default NULL = whole system, for the
   super administrator's "All Divisions" view).

Idempotent — safe to run even if already applied.
*/

-- ── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS regcode text,
  ADD COLUMN IF NOT EXISTS divcode text;

ALTER TABLE signatories
  ADD COLUMN IF NOT EXISTS regcode text,
  ADD COLUMN IF NOT EXISTS divcode text;

ALTER TABLE initial_payroll_records
  ADD COLUMN IF NOT EXISTS regcode text,
  ADD COLUMN IF NOT EXISTS divcode text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_division ON audit_logs (regcode, divcode);
CREATE INDEX IF NOT EXISTS idx_signatories_division ON signatories (regcode, divcode);
CREATE INDEX IF NOT EXISTS idx_initial_payroll_records_division ON initial_payroll_records (regcode, divcode);

-- ── 2. Stamping trigger ────────────────────────────────────────────────────

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
    FROM profiles
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_division_id IS NOT NULL THEN
    SELECT r.region_code, d.division_code
      INTO v_regcode, v_divcode
      FROM divisions d
      LEFT JOIN regions r ON r.id = d.region_id
     WHERE d.id = v_division_id
     LIMIT 1;

    IF v_regcode IS NOT NULL THEN
      NEW.regcode := COALESCE(NEW.regcode, v_regcode);
      NEW.divcode := COALESCE(NEW.divcode, v_divcode);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_division ON audit_logs;
CREATE TRIGGER trg_audit_logs_division
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

DROP TRIGGER IF EXISTS trg_signatories_division ON signatories;
CREATE TRIGGER trg_signatories_division
  BEFORE INSERT ON signatories
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

DROP TRIGGER IF EXISTS trg_initial_payroll_records_division ON initial_payroll_records;
CREATE TRIGGER trg_initial_payroll_records_division
  BEFORE INSERT ON initial_payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();

-- ── 3. Backfill existing rows (rows whose acting user has a division) ──────

UPDATE audit_logs al
   SET regcode = r.region_code,
       divcode = d.division_code
  FROM profiles p
  LEFT JOIN divisions d ON d.id = p.division_id
  LEFT JOIN regions  r ON r.id = d.region_id
 WHERE al.user_id = p.id
   AND al.regcode IS NULL
   AND al.divcode IS NULL
   AND d.id IS NOT NULL
   AND r.region_code IS NOT NULL
   AND d.division_code IS NOT NULL;

UPDATE initial_payroll_records ipr
   SET regcode = r.region_code,
       divcode = d.division_code
  FROM profiles p
  LEFT JOIN divisions d ON d.id = p.division_id
  LEFT JOIN regions  r ON r.id = d.region_id
 WHERE ipr.created_by = p.id
   AND ipr.regcode IS NULL
   AND ipr.divcode IS NULL
   AND d.id IS NOT NULL
   AND r.region_code IS NOT NULL
   AND d.division_code IS NOT NULL;

-- ── 4. Deduction engine stats — scoped ─────────────────────────────────────
-- Deduction Codes menu: totals now respect the selected division. NULL params
-- (super administrator, "All Divisions") return the whole-system figures.

CREATE OR REPLACE FUNCTION public.get_deduction_engine_stats(
  p_regcode text DEFAULT NULL,
  p_divcodes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scoped_emps AS (
    SELECT id, empno, status, basic, basic_salary, pera
      FROM employees
     WHERE (p_regcode IS NULL OR regcode = p_regcode)
       AND (p_divcodes IS NULL OR divcode = ANY(p_divcodes))
  ),
  scoped_deds AS (
    SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status,
           dc.type, dc.agency, dc.active AS code_active
      FROM payroll_deductions pd
      LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
     WHERE p_regcode IS NULL AND p_divcodes IS NULL
        OR pd.employee_id IN (SELECT id FROM scoped_emps)
        OR pd.empno IN (SELECT empno FROM scoped_emps WHERE empno IS NOT NULL AND empno <> '')
  ),
  active_deds AS (
    SELECT * FROM scoped_deds
  ),
  emp_gross AS (
    SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
      FROM scoped_emps
     WHERE status = 'Active'
  )
  SELECT jsonb_build_object(
    'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'grossPay', (SELECT total FROM emp_gross),
    'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'groupTotals', (
      SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT
          CASE
            WHEN agency = 'GSIS' THEN 'gsis'
            WHEN agency = 'BIR' THEN 'bir'
            WHEN agency = 'PHILHEALTH' THEN 'philhealth'
            WHEN agency = 'PAGIBIG' THEN 'pagibig'
            WHEN agency = 'DEPED' THEN 'deped'
            WHEN agency = 'INSURANCE' THEN 'insurance'
            WHEN agency = 'BANK' THEN 'banks'
            WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
            WHEN agency = 'ASSOCIATION' THEN 'associations'
            WHEN type = 'Loan' THEN 'loans'
            ELSE 'others'
          END AS group_id,
          COUNT(*) AS count,
          SUM(dedamt) AS amount
        FROM active_deds
        WHERE ded_status = 'Active' AND code_active = true
        GROUP BY 1
      ) g
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_deduction_engine_stats(text, text[]) TO authenticated;
