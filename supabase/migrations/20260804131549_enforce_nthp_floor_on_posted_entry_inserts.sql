-- F17: rows could be inserted straight into payroll_entries with status 'Posted',
-- which skipped post_payroll()'s NTHP (net take-home pay) floor and its
-- closed-period check. Enforce the same invariants at insert time.

CREATE OR REPLACE FUNCTION public.enforce_posted_entry_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status text;
BEGIN
  IF NEW.status = 'Posted' THEN
    IF COALESCE(NEW.net_pay, 0) < 5000 THEN
      RAISE EXCEPTION 'NTHP violation: an entry cannot be posted with net pay below 5000';
    END IF;

    IF NEW.pay_period_id IS NOT NULL THEN
      SELECT status INTO v_period_status FROM pay_periods WHERE id = NEW.pay_period_id;
      IF v_period_status = 'closed' THEN
        RAISE EXCEPTION 'Pay period is closed; entries cannot be posted into it';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_posted_entry_invariants ON payroll_entries;
CREATE TRIGGER trg_enforce_posted_entry_invariants
  BEFORE INSERT ON payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_posted_entry_invariants();
