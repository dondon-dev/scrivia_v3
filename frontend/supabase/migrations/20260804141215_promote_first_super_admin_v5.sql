ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'super_admin'::text, 'payroll_admin'::text, 'hr_administrator'::text,
    'school_coordinator'::text, 'school_head'::text, 'loan_verifier'::text,
    'payroll_officer'::text, 'payroll_processor'::text, 'accounting_officer'::text,
    'division_finance'::text, 'treasury_disbursement'::text, 'auditor'::text,
    'ess'::text, 'read_only'::text
  ]));

ALTER TABLE profiles DISABLE TRIGGER trg_protect_profile_columns;
UPDATE profiles SET role = 'super_admin', status = 'approved', updated_at = now()
WHERE email = 'adonaimagno@gmail.com';
ALTER TABLE profiles ENABLE TRIGGER trg_protect_profile_columns;