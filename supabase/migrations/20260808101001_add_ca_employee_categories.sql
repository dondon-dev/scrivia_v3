-- CA Payroll: expand payroll-breakdown categories for payroll generation.
-- Each employee belongs to exactly one category:
--   Division Office     = non-school STACODE
--   Elementary          = STACODE 001–499
--   Secondary           = STACODE 500–701
--   LBA & LSA Teachers  = position contains LBA / LSA
--   Utility Workers     = position contains Utility
--   Without ATM         = no bank account / non-ATM paymode
--   Separated Employees = status Resigned / Terminated
--   Non-Plantilla       = non-plantilla items fallback (same classification rules apply)
ALTER TABLE ca_employees DROP CONSTRAINT IF EXISTS ca_employees_category_check;
ALTER TABLE ca_employees ADD CONSTRAINT ca_employees_category_check
  CHECK (category IN (
    '', 'Division Office', 'Elementary', 'Secondary',
    'LBA & LSA Teachers', 'Utility Workers', 'Without ATM',
    'Separated Employees', 'Non-Plantilla'
  ));
