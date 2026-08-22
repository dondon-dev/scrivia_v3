/*
# Fast payroll engine — fix "canceling statement due to statement timeout"

run_payroll_engine() hit Postgres' statement_timeout on large divisions
(2,706 employees): the per-employee loop ran a correlated query against
payroll_deductions (joined to deduction_codes) for every employee, plus
four writes each — thousands of statements inside one RPC call.

Changes (applied to the LIVE function definition so nothing drifts):
1. SET LOCAL statement_timeout = '10 min' at the top of the function, so the
   caller's (often 30s) PostgREST/client timeout can no longer kill a big run.
2. Active deductions are pre-loaded ONCE into an indexed temp table
   (_active_deds) before the loop. Effectivity/termination filtering depends
   only on the pay period (year/month), so it is applied once in bulk instead
   of 2,706 times. The per-employee v_deds lookup becomes a single indexed
   probe (emp_id) with identical output shape.
3. The compute loop is otherwise untouched — formulas, NTHP processing, and
   the writes (entries, itemized deduction lines, undeducted obligations,
   employee summaries) are unchanged, so results are identical.

Parity is verified by scripts/test-payroll-engine-parity.ts (engine output vs
the client-side TypeScript computation, field by field).

## Security
- No new tables / policies. Same role gate, same SECURITY DEFINER.
*/

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure) INTO v_def;

  -- 1) Raise the statement timeout for this function's execution
  v_def := replace(v_def,
    $old$BEGIN
  SELECT lower(btrim(role)) INTO v_caller_role$old$,
    $new$BEGIN
  -- Large runs exceed the caller's (30s) statement_timeout — give this engine
  -- room to finish. Bounded so a genuinely stuck run still aborts.
  SET LOCAL statement_timeout = '10 min';

  SELECT lower(btrim(role)) INTO v_caller_role$new$);

  -- 2) DECLARE v_payym
  v_def := replace(v_def,
    $old$  v_payyy int;
  v_paymm int;$old$,
    $new$  v_payyy int;
  v_paymm int;
  v_payym int;$new$);

  -- 3) Precompute payym + build the indexed temp table of active deductions
  v_def := replace(v_def,
    $old$  v_paydate := v_period.pay_date;

  -- Suppress per-row audit$old$,
    $new$  v_paydate := v_period.pay_date;

  -- Pay period key for deduction effectivity filtering
  v_payym := (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm;

  -- Pre-load active deductions once (effectivity depends only on the pay
  -- period), so the per-employee loop is an indexed temp-table probe instead
  -- of a correlated payroll_deductions query per employee.
  CREATE TEMP TABLE _active_deds ON COMMIT DROP AS
  SELECT
    e.id AS emp_id,
    d.dedcode,
    round(COALESCE(d.dedamt, 0), 2) AS dedamt,
    COALESCE(d.effyy, 0) AS effyy,
    COALESCE(d.effmm, 0) AS effmm,
    COALESCE(c.agency, '') AS agency,
    COALESCE(c.type, '') AS type,
    COALESCE(c.dedname, d.dedcode) AS dedname
  FROM payroll_deductions d
  LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
  JOIN employees e ON (d.employee_id IS NOT NULL AND e.id = d.employee_id)
                   OR (d.employee_id IS NULL
                       AND btrim(COALESCE(d.empno, '')) = btrim(COALESCE(e.empno, e.employee_number, ''))
                       AND btrim(COALESCE(e.empno, e.employee_number, '')) <> '')
  WHERE e.id = ANY(v_employee_ids)
    AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
    AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= v_payym
    AND NOT (
      COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
      AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < v_payym
    );
  CREATE INDEX _active_deds_emp_idx ON _active_deds (emp_id);

  -- Suppress per-row audit$new$);

  -- 4) Replace the per-employee deduction query with the temp-table lookup
  v_def := replace(v_def,
    $old$    -- active deductions for this employee (empno fallback like the client)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', round(COALESCE(d.dedamt, 0), 2),
             'effyy', COALESCE(d.effyy, 0),
             'effmm', COALESCE(d.effmm, 0),
             'agency', COALESCE(c.agency, ''),
             'type', COALESCE(c.type, ''),
             'dedname', COALESCE(c.dedname, d.dedcode)
           )), '[]'::jsonb)
    INTO v_deds
    FROM payroll_deductions d
    LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
    WHERE (d.employee_id = r_emp.id OR (d.employee_id IS NULL AND btrim(COALESCE(d.empno, '')) = r_emp.empno AND r_emp.empno <> ''))
      AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
      AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      AND NOT (
        COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
        AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      );$old$,
    $new$    -- active deductions for this employee (pre-loaded temp-table lookup)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', d.dedamt,
             'effyy', d.effyy,
             'effmm', d.effmm,
             'agency', d.agency,
             'type', d.type,
             'dedname', d.dedname
           )), '[]'::jsonb)
    INTO v_deds
    FROM _active_deds d
    WHERE d.emp_id = r_emp.id;$new$);

  -- Guard: every change must have landed, otherwise fail loudly. The old loop
  -- query (INTO v_deds immediately followed by FROM payroll_deductions) must
  -- be gone — the only remaining payroll_deductions reference is the temp
  -- table build.
  IF position('SET LOCAL statement_timeout' in v_def) = 0
     OR position('CREATE TEMP TABLE _active_deds' in v_def) = 0
     OR position('WHERE d.emp_id = r_emp.id' in v_def) = 0
     OR position(E'INTO v_deds\n    FROM payroll_deductions d' in v_def) > 0 THEN
    RAISE EXCEPTION 'fast_payroll_engine patch failed: expected patterns not found';
  END IF;

  EXECUTE v_def;
END $$;
