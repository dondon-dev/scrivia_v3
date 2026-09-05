-- F15: dashboard_stats_cache SELECT was USING (true), exposing organisation-wide
-- gross/net/deduction totals to every signed-in role, including ess and the
-- school-scoped roles. Restrict it to the roles that are already allowed to see
-- organisation-wide payroll data.

DROP POLICY IF EXISTS cache_select ON dashboard_stats_cache;

CREATE POLICY cache_select ON dashboard_stats_cache
  FOR SELECT TO authenticated
  USING (is_data_admin());
