/*
# Backfill NTHP Compliance for Existing Payroll Entries

## Purpose
Apply the NTHP ₱5,000 minimum net take-home pay rule to all existing
payroll entries. For each entry, process the employee's active loan deductions
in priority order, and if applying a loan would push net pay below ₱5,000,
skip it and record it as an undeducted obligation.

## What this does
1. For each payroll_entries row:
   - Compute netPayBeforeLoans = gross_pay - mandatory_deductions
   - Load the employee's active deductions sorted by priority
   - Apply each loan only if remaining - amount >= 5000
   - Skip loans that breach threshold → insert into undeducted_obligations
   - Update the payroll_entry with NTHP results
2. Update employees.netpay to match
*/
DO $$
DECLARE
  pe RECORD;
  ded RECORD;
  net_before_loans NUMERIC;
  remaining NUMERIC;
  actual_loans NUMERIC;
  undeducted_amt NUMERIC;
  ded_desc TEXT;
BEGIN
  FOR pe IN SELECT * FROM payroll_entries LOOP
    net_before_loans := pe.gross_pay - pe.dedlnr - pe.dedmed - pe.dedpag - pe.dedtax;
    remaining := net_before_loans;
    actual_loans := 0;
    undeducted_amt := 0;

    FOR ded IN 
      SELECT pd.*, dc.agency as dc_agency, dc.type as dc_type, dc.dedname as dc_dedname,
             CASE 
               WHEN dc.agency = 'BIR' THEN 1
               WHEN dc.agency = 'PHIC' THEN 2
               WHEN dc.agency = 'GSIS' AND dc.type <> 'L' THEN 3
               WHEN dc.agency = 'GSIS' AND dc.type = 'L' THEN 4
               WHEN dc.agency = 'HDMF' AND dc.type <> 'L' THEN 5
               WHEN dc.agency = 'HDMF' AND dc.type = 'L' THEN 6
               WHEN dc.type = 'C' THEN 7
               WHEN dc.agency = 'DEPED' AND dc.type = 'L' THEN 9
               WHEN dc.type = 'L' THEN 13
               WHEN dc.type = 'P' THEN 11
               ELSE 13
             END as priority
      FROM payroll_deductions pd
      LEFT JOIN deduction_codes dc ON dc.dedcode = pd.dedcode
      WHERE pd.employee_id = pe.employee_id
        AND pd.status <> 'Terminated'
      ORDER BY priority ASC, pd.dedcode ASC
    LOOP
      IF remaining - ded.dedamt >= 5000.00 THEN
        remaining := remaining - ded.dedamt;
        actual_loans := actual_loans + ded.dedamt;
      ELSE
        undeducted_amt := undeducted_amt + ded.dedamt;
        ded_desc := COALESCE(ded.dc_dedname, ded.dedcode);
        INSERT INTO undeducted_obligations (
          payroll_entry_id, employee_id, pay_period_id,
          deduction_code, deduction_description, undeducted_amount, reason
        ) VALUES (
          pe.id, pe.employee_id, pe.pay_period_id,
          ded.dedcode, ded_desc, ded.dedamt, 'NTHP BELOW ₱5,000.00'
        );
      END IF;
    END LOOP;

    UPDATE payroll_entries SET
      actual_loan_deductions = actual_loans,
      undeducted_amount = undeducted_amt,
      other_deductions = actual_loans,
      total_deductions = pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax + actual_loans,
      net_pay = remaining,
      nthp_status = CASE WHEN remaining >= 5000.00 THEN 'PASS' ELSE 'FAIL' END
    WHERE id = pe.id;

    UPDATE employees SET netpay = remaining WHERE id = pe.employee_id;
  END LOOP;
END $$;
