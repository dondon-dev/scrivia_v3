/*
# Fix Import Log RLS — Allow Admins to See All Uploads

## Problem
The gsis_import_logs and pli_import_logs SELECT policies only allow
users to see their own uploads (auth.uid() = uploaded_by_id). This means
super_admin and other admin roles cannot see import logs uploaded by
other users on the Dashboard.

## Fix
Update SELECT policies to use is_data_admin() — admins see all logs,
non-admins see only their own.

## Security
No new tables or columns. Only SELECT policies are modified.
DELETE, INSERT, UPDATE policies remain unchanged (still ownership-scoped).
*/

DROP POLICY IF EXISTS "select_own_gsis_import_logs" ON gsis_import_logs;
CREATE POLICY "select_gsis_import_logs" ON gsis_import_logs FOR SELECT
  TO authenticated USING (is_data_admin() OR auth.uid() = uploaded_by_id);

DROP POLICY IF EXISTS "select_own_pli_import_logs" ON pli_import_logs;
CREATE POLICY "select_pli_import_logs" ON pli_import_logs FOR SELECT
  TO authenticated USING (is_data_admin() OR auth.uid() = uploaded_by_id);