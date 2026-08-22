/*
# Security Hardening: Restrict CA Payroll Tables to Authenticated Users

## Overview
The Communication Allowance (CA) payroll tables store sensitive government
employee data (account numbers, names, amounts). They were created with
blanket `TO anon, authenticated USING (true)` policies, which lets ANY
anonymous visitor read every CA employee record, payroll header, detail,
and signatory via the PostgREST Data API.

This migration drops all 16 anon+authenticated policies and replaces them
with authenticated-only equivalents, matching the pattern already applied
to the core payroll tables (20260802035527_restrict_payroll_tables_to_authenticated.sql).

## Tables
- ca_employees
- ca_payroll_headers
- ca_payroll_details
- ca_payroll_signatories

## Security
- All policies now use `TO authenticated` instead of `TO anon, authenticated`.
- `USING (true)` is retained: within an authenticated session all
  authenticated payroll users share access (roles are enforced in the
  application layer via authz.ts).
- The `anon` role retains NO access to any CA table.
*/

-- ── 1. Drop the leaky anon+authenticated policies ──────────────────────────
DROP POLICY IF EXISTS "ca_employees_select" ON ca_employees;
DROP POLICY IF EXISTS "ca_employees_insert" ON ca_employees;
DROP POLICY IF EXISTS "ca_employees_update" ON ca_employees;
DROP POLICY IF EXISTS "ca_employees_delete" ON ca_employees;

DROP POLICY IF EXISTS "ca_payroll_headers_select" ON ca_payroll_headers;
DROP POLICY IF EXISTS "ca_payroll_headers_insert" ON ca_payroll_headers;
DROP POLICY IF EXISTS "ca_payroll_headers_update" ON ca_payroll_headers;
DROP POLICY IF EXISTS "ca_payroll_headers_delete" ON ca_payroll_headers;

DROP POLICY IF EXISTS "ca_payroll_details_select" ON ca_payroll_details;
DROP POLICY IF EXISTS "ca_payroll_details_insert" ON ca_payroll_details;
DROP POLICY IF EXISTS "ca_payroll_details_update" ON ca_payroll_details;
DROP POLICY IF EXISTS "ca_payroll_details_delete" ON ca_payroll_details;

DROP POLICY IF EXISTS "ca_payroll_signatories_select" ON ca_payroll_signatories;
DROP POLICY IF EXISTS "ca_payroll_signatories_insert" ON ca_payroll_signatories;
DROP POLICY IF EXISTS "ca_payroll_signatories_update" ON ca_payroll_signatories;
DROP POLICY IF EXISTS "ca_payroll_signatories_delete" ON ca_payroll_signatories;

-- ── 2. Authenticated-only policies ─────────────────────────────────────────
CREATE POLICY "ca_employees_select" ON ca_employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "ca_employees_insert" ON ca_employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ca_employees_update" ON ca_employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ca_employees_delete" ON ca_employees FOR DELETE TO authenticated USING (true);

CREATE POLICY "ca_payroll_headers_select" ON ca_payroll_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "ca_payroll_headers_insert" ON ca_payroll_headers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ca_payroll_headers_update" ON ca_payroll_headers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ca_payroll_headers_delete" ON ca_payroll_headers FOR DELETE TO authenticated USING (true);

CREATE POLICY "ca_payroll_details_select" ON ca_payroll_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "ca_payroll_details_insert" ON ca_payroll_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ca_payroll_details_update" ON ca_payroll_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ca_payroll_details_delete" ON ca_payroll_details FOR DELETE TO authenticated USING (true);

CREATE POLICY "ca_payroll_signatories_select" ON ca_payroll_signatories FOR SELECT TO authenticated USING (true);
CREATE POLICY "ca_payroll_signatories_insert" ON ca_payroll_signatories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ca_payroll_signatories_update" ON ca_payroll_signatories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ca_payroll_signatories_delete" ON ca_payroll_signatories FOR DELETE TO authenticated USING (true);

-- ── 3. Revoke anon privileges, grant to authenticated only ─────────────────
REVOKE ALL ON ca_employees FROM anon;
REVOKE ALL ON ca_payroll_headers FROM anon;
REVOKE ALL ON ca_payroll_details FROM anon;
REVOKE ALL ON ca_payroll_signatories FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ca_employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_headers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ca_payroll_signatories TO authenticated;

-- ── 4. Reload the PostgREST schema cache so the changes take effect now ────
NOTIFY pgrst, 'reload schema';
