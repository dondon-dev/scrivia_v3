/*
# Initial Payroll — absences table linked to employees

Adds an absences table that references the existing `employees` table by
employee id, so absences integrate with the existing Initial Payroll roster
(not the standalone ips_employees table, which is being retired).

1. New Tables
   - `initial_payroll_absences`
     - employee_id (uuid, FK to employees.id, ON DELETE CASCADE)
     - date_of_absence (date)
     - number_of_days (integer, default 1)
     - remarks (text)
     - created_at (timestamptz)
2. Security
   - RLS enabled, authenticated CRUD (shared payroll data).
3. Index
   - on employee_id for fast lookup.
*/

CREATE TABLE IF NOT EXISTS initial_payroll_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date_of_absence date NOT NULL,
  number_of_days integer NOT NULL DEFAULT 1,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE initial_payroll_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ipa_select" ON initial_payroll_absences;
CREATE POLICY "ipa_select" ON initial_payroll_absences FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ipa_insert" ON initial_payroll_absences;
CREATE POLICY "ipa_insert" ON initial_payroll_absences FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ipa_update" ON initial_payroll_absences;
CREATE POLICY "ipa_update" ON initial_payroll_absences FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ipa_delete" ON initial_payroll_absences;
CREATE POLICY "ipa_delete" ON initial_payroll_absences FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ipa_employee ON initial_payroll_absences(employee_id);