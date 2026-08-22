/*
# Create School Stats RPC

## Purpose
Create an RPC `query_schools_with_stats` that returns all schools with
auto-calculated employee statistics (total employees, teaching personnel,
non-teaching personnel, active payroll employees) by joining schools to
employees on stacode = school_code.

Teaching positions: poscode starting with '1' or '2' (teacher positions).
Non-teaching: everything else.

## Security
- SECURITY INVOKER, restricted to authenticated.
*/

CREATE OR REPLACE FUNCTION query_schools_with_stats(p_school_type text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  school_code text,
  school_name text,
  school_type text,
  district text,
  address text,
  school_head text,
  contact_number text,
  email text,
  status text,
  total_employees bigint,
  teaching_personnel bigint,
  non_teaching_personnel bigint,
  active_payroll_employees bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.school_code,
    s.school_name,
    s.school_type,
    s.district,
    s.address,
    s.school_head,
    s.contact_number,
    s.email,
    s.status,
    COALESCE(st.total, 0) AS total_employees,
    COALESCE(st.teaching, 0) AS teaching_personnel,
    COALESCE(st.non_teaching, 0) AS non_teaching_personnel,
    COALESCE(st.active, 0) AS active_payroll_employees
  FROM schools s
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE e.poscode ~ '^[12]') AS teaching,
      COUNT(*) FILTER (WHERE e.poscode IS NOT NULL AND e.poscode <> '' AND e.poscode !~ '^[12]') AS non_teaching,
      COUNT(*) FILTER (WHERE e.status = 'Active') AS active
    FROM employees e
    WHERE e.stacode = s.school_code
  ) st ON true
  WHERE p_school_type IS NULL OR s.school_type = p_school_type
  ORDER BY s.school_code;
$$;

REVOKE ALL ON FUNCTION query_schools_with_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION query_schools_with_stats(text) TO authenticated;
