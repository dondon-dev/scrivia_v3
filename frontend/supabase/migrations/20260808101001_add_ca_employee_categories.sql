-- CA Payroll: expand payroll-breakdown categories for payroll generation.
-- Idempotent — skips if ca_employees table does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ca_employees') THEN
    ALTER TABLE ca_employees DROP CONSTRAINT IF EXISTS ca_employees_category_check;
    ALTER TABLE ca_employees ADD CONSTRAINT ca_employees_category_check
      CHECK (category IN (
        '', 'Division Office', 'Elementary', 'Secondary',
        'LBA & LSA Teachers', 'Utility Workers', 'Without ATM',
        'Separated Employees', 'Non-Plantilla'
      ));
  END IF;
END$$;
