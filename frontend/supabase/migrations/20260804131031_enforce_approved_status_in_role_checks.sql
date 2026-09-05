-- F8: server-side role helpers ignored profiles.status, so pending_approval,
-- rejected and disabled accounts kept full data access through the Data API.
-- Gate the role lookup on an approved account; every RLS policy that uses
-- get_current_user_role()/is_data_admin()/is_data_writer()/has_role_level()
-- inherits the check.

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles
  WHERE id = auth.uid() AND status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.has_role_level(p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_rank(rn, role_name) AS (
    VALUES
      (1, 'read_only'),
      (2, 'ess'),
      (3, 'school_head'),
      (4, 'school_coordinator'),
      (5, 'auditor'),
      (6, 'division_finance'),
      (7, 'hr_administrator'),
      (8, 'accounting_officer'),
      (9, 'payroll_processor'),
      (10, 'payroll_admin'),
      (11, 'super_admin')
  )
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_rank caller ON caller.role_name = p.role
    JOIN role_rank minimum ON minimum.role_name = p_min_role
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND caller.rn >= minimum.rn
  );
$$;
