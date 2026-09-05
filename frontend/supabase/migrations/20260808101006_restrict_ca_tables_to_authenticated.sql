/*
# Security Hardening: Restrict CA Payroll Tables to Authenticated Users
# Idempotent — skips if tables do not exist.
*/
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ca_employees','ca_payroll_headers','ca_payroll_details','ca_payroll_signatories']) LOOP
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = t) THEN
      -- Drop leaky anon+authenticated policies
      EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);
      -- Authenticated-only policies
      EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
      EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated USING (true)', t, t);
      -- Revoke anon, grant authenticated
      EXECUTE format('REVOKE ALL ON %I FROM anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
