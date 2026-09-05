/*
# Communication Allowance Payroll — Department of Education, Division of Calamba City
# Tables created with IF NOT EXISTS so re-runs are safe.
*/
DO $$
BEGIN
  -- ca_employees (tblEmployee)
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_employees') THEN
    CREATE TABLE ca_employees (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_no text NOT NULL UNIQUE,
      last_name text NOT NULL,
      first_name text NOT NULL,
      middle_initial text DEFAULT '',
      position_title text DEFAULT '',
      school_name text DEFAULT '',
      status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ca_emp_school ON ca_employees (school_name);
    CREATE INDEX IF NOT EXISTS idx_ca_emp_status ON ca_employees (status);
    CREATE INDEX IF NOT EXISTS idx_ca_emp_name ON ca_employees (last_name, first_name);
  END IF;

  -- ca_payroll_headers
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_payroll_headers') THEN
    CREATE TABLE ca_payroll_headers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_no text NOT NULL UNIQUE,
      payroll_type text NOT NULL DEFAULT 'Communication Allowance',
      payroll_title text NOT NULL DEFAULT 'Communication Allowance',
      agency text NOT NULL DEFAULT 'Department of Education',
      division text NOT NULL DEFAULT 'Division of Calamba City',
      school_name text NOT NULL DEFAULT '',
      covered_period text NOT NULL DEFAULT '',
      total_employees integer NOT NULL DEFAULT 0,
      gross_amount numeric(14,2) NOT NULL DEFAULT 0,
      total_deductions numeric(14,2) NOT NULL DEFAULT 0,
      net_amount numeric(14,2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Generated', 'Reviewed', 'Approved', 'Posted', 'Paid', 'Archived')),
      alobs_no text DEFAULT '',
      jev_no text DEFAULT '',
      date date,
      payroll_ref_no text DEFAULT '',
      remarks text DEFAULT '',
      created_by text NOT NULL DEFAULT '',
      created_date timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ca_hdr_status ON ca_payroll_headers (status);
    CREATE INDEX IF NOT EXISTS idx_ca_hdr_school ON ca_payroll_headers (school_name);
    CREATE INDEX IF NOT EXISTS idx_ca_hdr_created ON ca_payroll_headers (created_date DESC);
  END IF;

  -- ca_payroll_details
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_payroll_details') THEN
    CREATE TABLE ca_payroll_details (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_id uuid NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
      employee_id uuid NOT NULL REFERENCES ca_employees(id) ON DELETE RESTRICT,
      line_no integer NOT NULL DEFAULT 0,
      amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
      net_amount_due numeric(14,2) NOT NULL DEFAULT 0,
      signature_image text DEFAULT NULL,
      remarks text DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (payroll_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ca_det_payroll ON ca_payroll_details (payroll_id);
    CREATE INDEX IF NOT EXISTS idx_ca_det_emp ON ca_payroll_details (employee_id);
  END IF;

  -- ca_payroll_signatories
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_payroll_signatories') THEN
    CREATE TABLE ca_payroll_signatories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_id uuid NOT NULL REFERENCES ca_payroll_headers(id) ON DELETE CASCADE,
      signatory_type text NOT NULL,
      name text DEFAULT '',
      position text DEFAULT '',
      sequence_no integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ca_sig_payroll ON ca_payroll_signatories (payroll_id, sequence_no);
  END IF;
END$$;

-- RLS (safe to re-run)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ca_employees','ca_payroll_headers','ca_payroll_details','ca_payroll_signatories']) LOOP
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
      EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
      EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
      EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);
      EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated USING (true)', t, t);
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
