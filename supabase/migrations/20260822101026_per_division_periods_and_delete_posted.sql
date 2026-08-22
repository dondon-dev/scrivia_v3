/*
# Per-Division Monthly Periods + Super-Admin Posted-Payroll Delete

Fixes three payroll issues:

1. "Generate monthly payroll period per Division by regcode and divcode" —
   generate_monthly_periods() already scopes by REGCODE/DIVCODE, but
   pay_periods carried a GLOBAL UNIQUE(period_name) constraint, so two
   divisions could never both have a period named "August 2026". The global
   constraint is replaced with a per-division unique index
   (period_name, regcode, divcode), plus a legacy unique index for
   pre-scoping rows (NULL codes).

2. "restrict 1 payroll only for month" — one period per (year, month) per
   division is already enforced by pay_periods_year_month_div_unique; the new
   period_name indexes complement it so the same month can exist once per
   division (and once for legacy NULL-code rows).

3. "delete the posted payroll" — trg_protect_posted_entries rejected ALL
   deletes of Posted entries, even for super_admin. The trigger function now
   lets super_admin delete posted entries outright (the AFTER DELETE audit
   trigger still records the removal); every other role keeps the lock.

## Security
- The posted-delete path is gated inside the SECURITY DEFINER trigger function
  by the caller's profile role (super_admin only). RLS for payroll_entries
  DELETE (is_data_writer) is unchanged.
- The existing audit trigger on payroll_entries logs the deletion as before.
- No new tables, no new policies.
*/

-- 1. Per-division period-name uniqueness (replaces the global one).
--    Same period name may exist once per division; legacy NULL-code rows keep
--    the old global one-period-per-name rule.
ALTER TABLE pay_periods DROP CONSTRAINT IF EXISTS pay_periods_period_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_period_name_div_unique
  ON pay_periods (period_name, regcode, divcode)
  WHERE regcode IS NOT NULL AND divcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_period_name_legacy_unique
  ON pay_periods (period_name)
  WHERE regcode IS NULL AND divcode IS NULL;

-- 2. Super admins may delete posted payroll entries (audit trigger still logs
--    the removal). Updates on posted financial data remain locked for everyone.
CREATE OR REPLACE FUNCTION prevent_posted_entry_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF v_caller_role = 'super_admin' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
         OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
         OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
         OR NEW.dedlnr IS DISTINCT FROM OLD.dedlnr
         OR NEW.dedmed IS DISTINCT FROM OLD.dedmed
         OR NEW.dedpag IS DISTINCT FROM OLD.dedpag
         OR NEW.dedtax IS DISTINCT FROM OLD.dedtax
         OR NEW.actual_loan_deductions IS DISTINCT FROM OLD.actual_loan_deductions
         OR NEW.undeducted_amount IS DISTINCT FROM OLD.undeducted_amount
         OR NEW.nthp_status IS DISTINCT FROM OLD.nthp_status THEN
        RAISE EXCEPTION 'Cannot modify financial data on a posted entry';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot modify a posted payroll entry without changing status';
  END IF;

  RAISE EXCEPTION 'Posted payroll entries are locked';
END;
$$;
