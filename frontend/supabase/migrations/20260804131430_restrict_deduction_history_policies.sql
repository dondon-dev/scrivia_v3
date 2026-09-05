-- F13: INSERT policy was WITH CHECK (true): any authenticated user could forge
--      deduction history rows.
-- F14: SELECT policy was USING (true): ess/school-scoped users could read every
--      employee's deduction change history.

DROP POLICY IF EXISTS insert_deduction_history ON deduction_history;
DROP POLICY IF EXISTS select_deduction_history ON deduction_history;

CREATE POLICY insert_deduction_history ON deduction_history
  FOR INSERT TO authenticated
  WITH CHECK (is_data_writer());

CREATE POLICY select_deduction_history ON deduction_history
  FOR SELECT TO authenticated
  USING (is_data_admin());
