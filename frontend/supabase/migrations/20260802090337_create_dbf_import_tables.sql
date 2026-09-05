/*
# Create DBF Import Tables for Smart Sync

Creates raw mirror tables for all 10 FoxPro DBF files not yet covered:
  - dbf_stntable   (STNTABLE.DBF — station/school assignments)
  - dbf_divtable   (DIVTABLE.DBF — division information)
  - dbf_included   (INCLUDED.DBF — employees included in payroll run)
  - dbf_excluded   (EXCLUDED.DBF — employees excluded from payroll run)
  - dbf_payrolls   (PAYROLLS.DBF — payroll run header records)
  - dbf_pyent      (PYENT.DBF  — payroll entries set 1)
  - dbf_pyent1     (PYENT1.DBF — payroll entries set 2)
  - dbf_pyent2     (PYENT2.DBF — payroll entries set 3)
  - dbf_sync_sessions  (tracks each multi-file import for rollback)

Each raw table stores the DBF fields verbatim so rollback can diff/restore.
All tables have RLS enabled, scoped to authenticated users only.
*/

-- ── STNTABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_stntable (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stacode     text NOT NULL,
  staname     text NOT NULL DEFAULT '',
  divcode     text NOT NULL DEFAULT '',
  regcode     text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  district    text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT '',
  munic       text NOT NULL DEFAULT '',
  province    text NOT NULL DEFAULT '',
  zipcode     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_stntable_stacode_unique UNIQUE (stacode)
);
ALTER TABLE dbf_stntable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_stntable" ON dbf_stntable;
DROP POLICY IF EXISTS "auth_insert_stntable" ON dbf_stntable;
DROP POLICY IF EXISTS "auth_update_stntable" ON dbf_stntable;
DROP POLICY IF EXISTS "auth_delete_stntable" ON dbf_stntable;
CREATE POLICY "auth_select_stntable" ON dbf_stntable FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_stntable" ON dbf_stntable FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_stntable" ON dbf_stntable FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_stntable" ON dbf_stntable FOR DELETE TO authenticated USING (true);

-- ── DIVTABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_divtable (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divcode     text NOT NULL,
  divname     text NOT NULL DEFAULT '',
  regcode     text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  chief       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_divtable_divcode_unique UNIQUE (divcode)
);
ALTER TABLE dbf_divtable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_divtable" ON dbf_divtable;
DROP POLICY IF EXISTS "auth_insert_divtable" ON dbf_divtable;
DROP POLICY IF EXISTS "auth_update_divtable" ON dbf_divtable;
DROP POLICY IF EXISTS "auth_delete_divtable" ON dbf_divtable;
CREATE POLICY "auth_select_divtable" ON dbf_divtable FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_divtable" ON dbf_divtable FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_divtable" ON dbf_divtable FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_divtable" ON dbf_divtable FOR DELETE TO authenticated USING (true);

-- ── INCLUDED ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_included (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  divcode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  paytype     text NOT NULL DEFAULT '',
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_included_empno_payperiod_unique UNIQUE (empno, payperiod)
);
ALTER TABLE dbf_included ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_included" ON dbf_included;
DROP POLICY IF EXISTS "auth_insert_included" ON dbf_included;
DROP POLICY IF EXISTS "auth_update_included" ON dbf_included;
DROP POLICY IF EXISTS "auth_delete_included" ON dbf_included;
CREATE POLICY "auth_select_included" ON dbf_included FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_included" ON dbf_included FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_included" ON dbf_included FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_included" ON dbf_included FOR DELETE TO authenticated USING (true);

-- ── EXCLUDED ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_excluded (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  divcode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  reason      text NOT NULL DEFAULT '',
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_excluded_empno_payperiod_unique UNIQUE (empno, payperiod)
);
ALTER TABLE dbf_excluded ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_excluded" ON dbf_excluded;
DROP POLICY IF EXISTS "auth_insert_excluded" ON dbf_excluded;
DROP POLICY IF EXISTS "auth_update_excluded" ON dbf_excluded;
DROP POLICY IF EXISTS "auth_delete_excluded" ON dbf_excluded;
CREATE POLICY "auth_select_excluded" ON dbf_excluded FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_excluded" ON dbf_excluded FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_excluded" ON dbf_excluded FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_excluded" ON dbf_excluded FOR DELETE TO authenticated USING (true);

-- ── PAYROLLS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_payrolls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  divcode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  paytype     text NOT NULL DEFAULT '',
  basic       numeric NOT NULL DEFAULT 0,
  trans       numeric NOT NULL DEFAULT 0,
  pera        numeric NOT NULL DEFAULT 0,
  gross       numeric NOT NULL DEFAULT 0,
  dedlnr      numeric NOT NULL DEFAULT 0,
  dedmed      numeric NOT NULL DEFAULT 0,
  dedtax      numeric NOT NULL DEFAULT 0,
  dedpag      numeric NOT NULL DEFAULT 0,
  totded      numeric NOT NULL DEFAULT 0,
  netpay      numeric NOT NULL DEFAULT 0,
  paydate     date,
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_payrolls_empno_payperiod_unique UNIQUE (empno, payperiod)
);
ALTER TABLE dbf_payrolls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_payrolls" ON dbf_payrolls;
DROP POLICY IF EXISTS "auth_insert_payrolls" ON dbf_payrolls;
DROP POLICY IF EXISTS "auth_update_payrolls" ON dbf_payrolls;
DROP POLICY IF EXISTS "auth_delete_payrolls" ON dbf_payrolls;
CREATE POLICY "auth_select_payrolls" ON dbf_payrolls FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_payrolls" ON dbf_payrolls FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_payrolls" ON dbf_payrolls FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_payrolls" ON dbf_payrolls FOR DELETE TO authenticated USING (true);

-- ── PYENT ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_pyent (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  paytype     text NOT NULL DEFAULT '',
  itemcode    text NOT NULL DEFAULT '',
  amount      numeric NOT NULL DEFAULT 0,
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_pyent_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode)
);
ALTER TABLE dbf_pyent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_pyent" ON dbf_pyent;
DROP POLICY IF EXISTS "auth_insert_pyent" ON dbf_pyent;
DROP POLICY IF EXISTS "auth_update_pyent" ON dbf_pyent;
DROP POLICY IF EXISTS "auth_delete_pyent" ON dbf_pyent;
CREATE POLICY "auth_select_pyent" ON dbf_pyent FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_pyent" ON dbf_pyent FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_pyent" ON dbf_pyent FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_pyent" ON dbf_pyent FOR DELETE TO authenticated USING (true);

-- ── PYENT1 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_pyent1 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  paytype     text NOT NULL DEFAULT '',
  itemcode    text NOT NULL DEFAULT '',
  amount      numeric NOT NULL DEFAULT 0,
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_pyent1_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode)
);
ALTER TABLE dbf_pyent1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_pyent1" ON dbf_pyent1;
DROP POLICY IF EXISTS "auth_insert_pyent1" ON dbf_pyent1;
DROP POLICY IF EXISTS "auth_update_pyent1" ON dbf_pyent1;
DROP POLICY IF EXISTS "auth_delete_pyent1" ON dbf_pyent1;
CREATE POLICY "auth_select_pyent1" ON dbf_pyent1 FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_pyent1" ON dbf_pyent1 FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_pyent1" ON dbf_pyent1 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_pyent1" ON dbf_pyent1 FOR DELETE TO authenticated USING (true);

-- ── PYENT2 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_pyent2 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empno       text NOT NULL,
  stacode     text NOT NULL DEFAULT '',
  payperiod   text NOT NULL DEFAULT '',
  paytype     text NOT NULL DEFAULT '',
  itemcode    text NOT NULL DEFAULT '',
  amount      numeric NOT NULL DEFAULT 0,
  remarks     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbf_pyent2_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode)
);
ALTER TABLE dbf_pyent2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_pyent2" ON dbf_pyent2;
DROP POLICY IF EXISTS "auth_insert_pyent2" ON dbf_pyent2;
DROP POLICY IF EXISTS "auth_update_pyent2" ON dbf_pyent2;
DROP POLICY IF EXISTS "auth_delete_pyent2" ON dbf_pyent2;
CREATE POLICY "auth_select_pyent2" ON dbf_pyent2 FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_pyent2" ON dbf_pyent2 FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_pyent2" ON dbf_pyent2 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_pyent2" ON dbf_pyent2 FOR DELETE TO authenticated USING (true);

-- ── SYNC SESSIONS (import batches + rollback support) ────────────────────────
CREATE TABLE IF NOT EXISTS dbf_sync_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_label   text NOT NULL DEFAULT '',
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','rolled_back')),
  files_uploaded  text[] NOT NULL DEFAULT '{}',
  total_inserted  integer NOT NULL DEFAULT 0,
  total_updated   integer NOT NULL DEFAULT 0,
  total_skipped   integer NOT NULL DEFAULT 0,
  total_errors    integer NOT NULL DEFAULT 0,
  error_log       jsonb NOT NULL DEFAULT '[]',
  per_file        jsonb NOT NULL DEFAULT '{}',
  performed_by    text,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rollback_data   jsonb NOT NULL DEFAULT '{}',
  is_rolled_back  boolean NOT NULL DEFAULT false
);
ALTER TABLE dbf_sync_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_sync_sessions" ON dbf_sync_sessions;
DROP POLICY IF EXISTS "auth_insert_sync_sessions" ON dbf_sync_sessions;
DROP POLICY IF EXISTS "auth_update_sync_sessions" ON dbf_sync_sessions;
DROP POLICY IF EXISTS "auth_delete_sync_sessions" ON dbf_sync_sessions;
CREATE POLICY "auth_select_sync_sessions" ON dbf_sync_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_sync_sessions" ON dbf_sync_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_sync_sessions" ON dbf_sync_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_sync_sessions" ON dbf_sync_sessions FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS dbf_sync_sessions_started_at_idx ON dbf_sync_sessions (started_at DESC);
