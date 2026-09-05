/*
 * _pd_compute — NTHP compliance engine (SQL port of src/lib/nthp.ts)
 *
 * Receives:
 *   p_available   — Net Pay Before Loans (gross - mandatory)
 *   p_sorted      — JSONB array of deduction records sorted by priority
 *                   [{dedcode, dedamt, agency, type, dedname}, ...]
 *   p_mandatory_loans — sum of mandatory loan deductions already applied
 *   p_stacode     — employee station code
 *
 * Returns JSONB:
 *   { actualLoanDeductions, mandatoryLoanDeductions, undeductedObligations,
 *     nthpStatus, finalNetPay, availableBalance, loanDeductionCapacity }
 */
DROP FUNCTION IF EXISTS public._pd_compute(
    numeric,
    jsonb,
    numeric,
    text
);
CREATE FUNCTION public._pd_compute(
  p_available numeric,
  p_sorted    jsonb,
  p_mandatory_loans numeric DEFAULT 0,
  p_stacode   text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_capacity numeric := p_available - 5000.00;
  v_remaining numeric := v_capacity;
  v_applied  numeric := 0;
  v_undedected jsonb := '[]'::jsonb;
  v_status   text;
  v_final    numeric;
  v_rec      jsonb;
  v_amount   numeric;
  v_code     text;
  v_desc     text;
  v_priority int;
  v_deducted_log jsonb := '[]'::jsonb;
  v_entry    jsonb;
BEGIN
  -- If capacity <= 0, ALL deductions become undeducted
  IF v_capacity <= 0 THEN
    FOR v_rec IN SELECT jsonb_array_elements(p_sorted)
    LOOP
      v_amount := round(COALESCE((v_rec->>'dedamt')::numeric, 0), 2);
      IF v_amount <= 0 THEN CONTINUE; END IF;
      v_code := v_rec->>'dedcode';
      v_desc := COALESCE(v_rec->>'dedname', v_code);
      v_undedected := v_undedected || jsonb_build_object(
        'deduction_code', v_code,
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', p_stacode,
        'reason', 'NTHP Threshold Reached'
      );
    END LOOP;
    v_final := p_available;
    v_status := CASE WHEN v_final >= 5000.00 THEN 'PASS' ELSE 'FAIL' END;
    RETURN jsonb_build_object(
      'actualLoanDeductions', 0,
      'mandatoryLoanDeductions', p_mandatory_loans,
      'undeductedObligations', v_undedected,
      'nthpStatus', v_status,
      'finalNetPay', v_final,
      'availableBalance', p_available,
      'loanDeductionCapacity', v_capacity
    );
  END IF;

  -- Process deductions in order (already sorted by priority)
  FOR v_rec IN SELECT jsonb_array_elements(p_sorted)
  LOOP
    v_amount := round(COALESCE((v_rec->>'dedamt')::numeric, 0), 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_code := v_rec->>'dedcode';
    v_desc := COALESCE(v_rec->>'dedname', v_code);

    IF v_remaining >= v_amount THEN
      -- Deduct full amount
      v_remaining := v_remaining - v_amount;
      v_applied := v_applied + v_amount;
      v_deducted_log := v_deducted_log || jsonb_build_object(
        'code', v_code, 'desc', v_desc, 'amount', v_amount
      );
    ELSE
      -- Move to undeducted
      v_undedected := v_undedected || jsonb_build_object(
        'deduction_code', v_code,
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', p_stacode,
        'reason', 'NTHP Threshold Reached'
      );
    END IF;
  END LOOP;

  -- Step 7 — reversal: if net pay < 5000, reverse last applied deductions
  v_final := p_available - v_applied;
  WHILE v_final < 5000.00 AND jsonb_array_length(v_deducted_log) > 0
  LOOP
    v_entry := v_deducted_log->>(jsonb_array_length(v_deducted_log) - 1);
    v_deducted_log := v_deducted_log - (jsonb_array_length(v_deducted_log) - 1);
    v_amount := (v_entry->>'amount')::numeric;
    v_applied := v_applied - v_amount;
    v_undedected := v_undedected || jsonb_build_object(
      'deduction_code', v_entry->>'code',
      'deduction_description', v_entry->>'desc',
      'scheduled_amount', v_amount,
      'undeducted_amount', v_amount,
      'station_code', p_stacode,
      'reason', 'NTHP Threshold Reached'
    );
    v_final := p_available - v_applied;
  END LOOP;

  v_final := round(v_final, 2);
  v_status := CASE WHEN v_final >= 5000.00 THEN 'PASS' ELSE 'FAIL' END;

  RETURN jsonb_build_object(
    'actualLoanDeductions', round(v_applied, 2),
    'mandatoryLoanDeductions', p_mandatory_loans,
    'undeductedObligations', v_undedected,
    'nthpStatus', v_status,
    'finalNetPay', v_final,
    'availableBalance', p_available,
    'loanDeductionCapacity', v_capacity
  );
END;
$fn$;

-- Grant access
GRANT EXECUTE ON FUNCTION public._pd_compute(numeric, jsonb, numeric, text) TO authenticated;
