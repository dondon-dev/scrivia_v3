/*
# Payent — Bank Crediting (PYENT) Store

## Purpose
PYENT.DBF / PYENT1.DBF / PYENT2.DBF are the bank-crediting hash files (net pay
credited to each employee's bank account). When those files are uploaded through
Smart Import / Smart Sync, the records are forwarded here so the Regular Payroll
page can show the Payent for the selected period:

- PYENT.DBF  → half = 'full'   (1 month payent)
- PYENT1.DBF → half = 'first'  (first half payent)
- PYENT2.DBF → half = 'second' (second half payent)

One row per employee per period per half. `amount` holds the net amount to
credit to the employee's bank account. Employee and pay-period ids are resolved
when the uploaded records match the masterfile / an existing pay period; the
raw keys (empno, payperiod) are always kept so unmatched rows stay visible.

## Security
Same role-aware RLS pattern as payroll_entries: data admins and payroll
processors can read/write; school coordinators/heads only their school's
employees; ESS only their own record.
*/

CREATE TABLE IF NOT EXISTS payent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid REFERENCES employees(id) ON DELETE CASCADE,
  empno           text NOT NULL,
  pay_period_id   uuid REFERENCES pay_periods(id) ON DELETE CASCADE,
  payperiod       text NOT NULL DEFAULT '',
  half            text NOT NULL DEFAULT 'full' CHECK (half IN ('full', 'first', 'second')),
  stacode         text NOT NULL DEFAULT '',
  divcode         text NOT NULL DEFAULT '',
  regcode         text NOT NULL DEFAULT '',
  acct_no         text NOT NULL DEFAULT '',
  acct_name       text NOT NULL DEFAULT '',
  amount          numeric NOT NULL DEFAULT 0,
  branch_cd       text NOT NULL DEFAULT '',
  batch_no        text NOT NULL DEFAULT '',
  itemcode        text NOT NULL DEFAULT '',
  paytype         text NOT NULL DEFAULT '',
  remarks         text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT '' CHECK (source IN ('PYENT', 'PYENT1', 'PYENT2', '')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payent_empno_payperiod_half_unique UNIQUE (empno, payperiod, half)
);

CREATE INDEX IF NOT EXISTS idx_payent_pay_period_id ON payent(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_payent_employee_id ON payent(employee_id);
CREATE INDEX IF NOT EXISTS idx_payent_empno ON payent(empno);

ALTER TABLE payent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payent_select" ON payent;
DROP POLICY IF EXISTS "payent_insert" ON payent;
DROP POLICY IF EXISTS "payent_update" ON payent;
DROP POLICY IF EXISTS "payent_delete" ON payent;

CREATE POLICY "payent_select" ON payent FOR SELECT
  TO authenticated USING (
    is_data_admin()
    OR (
      get_current_user_role() IN ('school_coordinator', 'school_head')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = payent.employee_id
        AND e.stacode = get_current_user_stacode()
      )
    )
    OR (
      get_current_user_role() = 'ess'
      AND (
        payent.empno = get_current_user_empno()
        OR EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = payent.employee_id
          AND (e.empno = get_current_user_empno() OR e.employee_number = get_current_user_empno())
        )
      )
    )
  );

CREATE POLICY "payent_insert" ON payent FOR INSERT
  TO authenticated WITH CHECK (is_data_writer());

CREATE POLICY "payent_update" ON payent FOR UPDATE
  TO authenticated USING (is_data_writer()) WITH CHECK (is_data_writer());

CREATE POLICY "payent_delete" ON payent FOR DELETE
  TO authenticated USING (is_data_writer());
