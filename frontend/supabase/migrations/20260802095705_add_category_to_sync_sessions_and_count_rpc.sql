/*
# Separate Elementary vs High School Smart Import

## Goal
The Smart Import view is shared between Elementary Payroll (STACODE 1-499)
and High School Payroll (STACODE 500-701). Previously both imports wrote
into the same raw DBF mirror tables and the same dbf_sync_sessions history,
so the Supported Tables Status grid, Import History, and table-delete actions
mixed both categories together. This migration makes them fully separable.

## Changes

### 1. New column on dbf_sync_sessions
- `category` (text, nullable) — 'elementary', 'highschool', or NULL for
  legacy/all-payroll sessions. Existing rows default to NULL (unchanged).

### 2. New RPC: get_dbf_table_counts_by_category
Returns one row per DBF mirror table with separate counts for elementary,
highschool, and total records. Uses the stacode column where present.
Tables without a stacode column (dbf_divtable) report NULL per-category
counts since they are shared infrastructure and not category-specific.

For MASTFILE (employees) and DEDFILE (payroll_deductions) the stacode lives
on the employees table, so payroll_deductions is joined to employees.

### 3. Index
- dbf_sync_sessions_category_idx for filtering history by category.

## Security
- No RLS policy changes (existing authenticated CRUD policies remain).
- The RPC is SECURITY INVOKER (runs as the calling authenticated user, so
  existing RLS policies on the underlying tables apply).
*/

-- 1. Add category column to dbf_sync_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dbf_sync_sessions' AND column_name = 'category'
  ) THEN
    ALTER TABLE dbf_sync_sessions ADD COLUMN category text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dbf_sync_sessions_category_idx
  ON dbf_sync_sessions (category);

-- 2. RPC for category-scoped counts across all DBF mirror tables
CREATE OR REPLACE FUNCTION get_dbf_table_counts_by_category()
RETURNS TABLE (
  table_name text,
  total bigint,
  elementary bigint,
  highschool bigint
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  -- Tables with a direct stacode column (text, numeric-only codes)
  SELECT 'dbf_stntable'::text AS table_name,
    count(*)::bigint AS total,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint AS elementary,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint AS highschool
  FROM dbf_stntable
  UNION ALL
  SELECT 'dbf_divtable',
    count(*)::bigint, NULL::bigint, NULL::bigint
  FROM dbf_divtable
  UNION ALL
  SELECT 'dbf_included',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_included
  UNION ALL
  SELECT 'dbf_excluded',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_excluded
  UNION ALL
  SELECT 'dbf_payrolls',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_payrolls
  UNION ALL
  SELECT 'dbf_pyent',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent
  UNION ALL
  SELECT 'dbf_pyent1',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent1
  UNION ALL
  SELECT 'dbf_pyent2',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent2
  -- MASTFILE: employees.stacode
  UNION ALL
  SELECT 'employees',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM employees
  -- DEDFILE: payroll_deductions joined to employees for stacode
  UNION ALL
  SELECT 'payroll_deductions',
    count(*)::bigint,
    count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 500 AND 701)::bigint
  FROM payroll_deductions pd
  LEFT JOIN employees e ON e.id = pd.employee_id
$$;
