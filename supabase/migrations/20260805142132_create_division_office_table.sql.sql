/*
# Create Division Office table

1. Purpose
   The Division Office page stores the central organizational profile of the
   Schools Division Office: contact details, official identifiers (TIN, Agency
   Code, UACS Code), and the officials who sign payroll registers, remittances,
   certifications, and reports (SDS, ASDS, HRMO, Payroll Officer). It also holds
   document display settings (which logos / signatures / fields appear on
   generated documents) and an optional division logo.

2. New Table: division_office
   - id (uuid, primary key)
   - division_name (text, not null) — official name of the SDO
   - region (text) — e.g. "Region IV-A CALABARZON"
   - division_code (text) — numeric division code
   - address (text) — office address
   - zip_code (text)
   - contact_number (text)
   - official_email (text)
   - website (text)
   - tin_number (text) — Tax Identification Number
   - agency_code (text)
   - uacs_code (text) — Unified Accounts Code Structure
   - sds_name, sds_position, sds_email, sds_contact, sds_signature, sds_effective_date
   - asds_name, asds_position, asds_email, asds_contact, asds_signature, asds_effective_date
   - hrmo_name, hrmo_position, hrmo_contact, hrmo_email, hrmo_signature
   - payroll_officer_name, payroll_officer_position, payroll_officer_contact,
     payroll_officer_email, payroll_officer_signature
   - division_logo (text) — URL or base64 data URL
   - show_division_logo, show_deped_logo, show_sds_name, show_payroll_signature,
     show_hrmo_signature, show_address, show_tin (booleans, default true)
   - created_at, updated_at (timestamptz)

   A single row is the intended usage (the master division profile).

3. Security (RLS)
   - RLS enabled.
   - SELECT: any authenticated user can read the shared division profile.
   - INSERT/UPDATE/DELETE: restricted to super_admin, payroll_admin, and
     hr_administrator roles (matched against the profiles table role column).
   - The shared SELECT policy is intentionally open to authenticated users
     because the division profile is reference data used across all modules.

4. Notes
   - updated_at auto-maintained by a trigger.
   - Idempotent: uses CREATE TABLE IF NOT EXISTS and drops policies first.
*/

CREATE TABLE IF NOT EXISTS division_office (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_name text NOT NULL DEFAULT '',
  region text DEFAULT '',
  division_code text DEFAULT '',
  address text DEFAULT '',
  zip_code text DEFAULT '',
  contact_number text DEFAULT '',
  official_email text DEFAULT '',
  website text DEFAULT '',
  tin_number text DEFAULT '',
  agency_code text DEFAULT '',
  uacs_code text DEFAULT '',
  sds_name text DEFAULT '',
  sds_position text DEFAULT '',
  sds_email text DEFAULT '',
  sds_contact text DEFAULT '',
  sds_signature text DEFAULT '',
  sds_effective_date date,
  asds_name text DEFAULT '',
  asds_position text DEFAULT '',
  asds_email text DEFAULT '',
  asds_contact text DEFAULT '',
  asds_signature text DEFAULT '',
  asds_effective_date date,
  hrmo_name text DEFAULT '',
  hrmo_position text DEFAULT '',
  hrmo_contact text DEFAULT '',
  hrmo_email text DEFAULT '',
  hrmo_signature text DEFAULT '',
  payroll_officer_name text DEFAULT '',
  payroll_officer_position text DEFAULT '',
  payroll_officer_contact text DEFAULT '',
  payroll_officer_email text DEFAULT '',
  payroll_officer_signature text DEFAULT '',
  division_logo text DEFAULT '',
  show_division_logo boolean NOT NULL DEFAULT true,
  show_deped_logo boolean NOT NULL DEFAULT true,
  show_sds_name boolean NOT NULL DEFAULT true,
  show_payroll_signature boolean NOT NULL DEFAULT true,
  show_hrmo_signature boolean NOT NULL DEFAULT true,
  show_address boolean NOT NULL DEFAULT true,
  show_tin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE division_office ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_division_office" ON division_office;
CREATE POLICY "select_division_office"
  ON division_office FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_division_office_admin" ON division_office;
CREATE POLICY "insert_division_office_admin"
  ON division_office FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'payroll_admin', 'hr_administrator')
        AND p.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "update_division_office_admin" ON division_office;
CREATE POLICY "update_division_office_admin"
  ON division_office FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'payroll_admin', 'hr_administrator')
        AND p.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'payroll_admin', 'hr_administrator')
        AND p.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "delete_division_office_admin" ON division_office;
CREATE POLICY "delete_division_office_admin"
  ON division_office FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
        AND p.status = 'approved'
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS division_office_touch_updated_at ON division_office;
CREATE TRIGGER division_office_touch_updated_at
  BEFORE UPDATE ON division_office
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
