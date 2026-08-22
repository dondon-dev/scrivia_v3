-- F19: the dashboard cache refresh RPCs were EXECUTE-able by anon, letting anyone
-- force repeated full aggregation over the payroll tables.

REVOKE ALL ON FUNCTION public.refresh_dashboard_cache() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_dashboard_refresh() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_cache() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_dashboard_refresh() TO authenticated;
