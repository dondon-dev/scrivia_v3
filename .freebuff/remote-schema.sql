


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_pd_compute"("p_available" numeric, "p_sorted" "jsonb", "p_mandatory_loans" numeric, "p_station" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_after numeric;
  v_capacity numeric;
  v_remaining numeric;
  v_actual numeric := 0;
  v_net numeric;
  v_status text;
  v_elem jsonb;
  v_amount numeric;
  v_unded jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;
  v_last jsonb;
  v_desc text;
BEGIN
  v_after := round(p_available - COALESCE(p_mandatory_loans, 0), 2);
  v_capacity := round(v_after - 5000, 2);

  IF v_capacity <= 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
    LOOP
      v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
      IF v_amount <= 0 THEN CONTINUE; END IF;
      v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END LOOP;
    v_net := v_after;
    v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
    RETURN jsonb_build_object(
      'availableBalance', v_after,
      'loanDeductionCapacity', v_capacity,
      'actualLoanDeductions', 0,
      'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
      'finalNetPay', v_net,
      'nthpStatus', v_status,
      'undeducted', v_unded,
      'deducted', '[]'::jsonb
    );
  END IF;

  -- Step 5 — process by priority/FIFO
  v_remaining := v_capacity;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
  LOOP
    v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
    IF v_remaining >= v_amount THEN
      v_remaining := round(v_remaining - v_amount, 2);
      v_actual := round(v_actual + v_amount, 2);
      v_log := v_log || v_elem;
    ELSE
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END IF;
  END LOOP;

  -- Step 7 — NTHP reversal
  v_net := round(v_after - v_actual, 2);
  WHILE v_net < 5000 AND jsonb_array_length(v_log) > 0 LOOP
    v_last := v_log->-1;
    v_log := v_log - jsonb_array_length(v_log) - 1;
    v_amount := round(COALESCE((v_last->>'dedamt')::numeric, 0), 2);
    v_actual := round(v_actual - v_amount, 2);
    v_unded := v_unded || jsonb_build_object(
      'deduction_code', v_last->>'dedcode',
      'deduction_description', COALESCE(v_last->>'dedname', v_last->>'dedcode'),
      'scheduled_amount', v_amount,
      'undeducted_amount', v_amount,
      'station_code', COALESCE(p_station, ''),
      'reason', 'NTHP Threshold Reached'
    );
    v_net := round(v_after - v_actual, 2);
  END LOOP;

  v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
  RETURN jsonb_build_object(
    'availableBalance', v_after,
    'loanDeductionCapacity', v_capacity,
    'actualLoanDeductions', v_actual,
    'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
    'finalNetPay', v_net,
    'nthpStatus', v_status,
    'undeducted', v_unded,
    'deducted', v_log
  );
END;
$$;


ALTER FUNCTION "public"."_pd_compute"("p_available" numeric, "p_sorted" "jsonb", "p_mandatory_loans" numeric, "p_station" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pd_mandatory"("p_agency" "text", "p_type" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    upper(COALESCE(p_agency, '')) = 'BIR'
    OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
    OR upper(COALESCE(p_agency, '')) = 'GSIS'
    OR (
      upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND (
        upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
        OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
      )
    );
$$;


ALTER FUNCTION "public"."_pd_mandatory"("p_agency" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pd_mandatory_loan"("p_agency" "text", "p_type" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    upper(COALESCE(p_type, '')) IN ('L', 'LOAN')
    AND (
      upper(COALESCE(p_agency, '')) = 'BIR'
      OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
      OR upper(COALESCE(p_agency, '')) = 'GSIS'
      OR (
        upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
        AND (
          upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
          OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
        )
      )
    );
$$;


ALTER FUNCTION "public"."_pd_mandatory_loan"("p_agency" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pd_priority"("p_agency" "text", "p_type" "text", "p_dedcode" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN upper(COALESCE(p_agency, '')) = 'BIR' THEN 1
    WHEN upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH') THEN 2
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 3
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 4
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 5
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 6
    WHEN upper(COALESCE(p_type, '')) IN ('C', 'COOPERATIVE') THEN 7
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%MBA%' THEN 8
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%PROVIDENT%'
      OR upper(COALESCE(p_dedcode, '')) LIKE '%PF%'
      OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 9
    WHEN upper(COALESCE(p_agency, '')) = 'DEPED'
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 9
    WHEN upper(COALESCE(p_type, '')) = 'INSURANCE'
      OR (upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
          AND upper(COALESCE(p_agency, '')) = 'OTHER') THEN 11
    WHEN upper(COALESCE(p_type, '')) IN ('L', 'LOAN')
      AND upper(COALESCE(p_agency, '')) = 'OTHER' THEN 13
    WHEN upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 11
    ELSE 13
  END;
$$;


ALTER FUNCTION "public"."_pd_priority"("p_agency" "text", "p_type" "text", "p_dedcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trig_refresh_dashboard_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM refresh_dashboard_cache();
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."_trig_refresh_dashboard_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text" DEFAULT NULL::"text", "p_signature_phrase" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_period record; v_role text; v_user_id uuid; v_user_name text;
v_steps jsonb; v_current_order int; v_next_step text; v_expected_role text;
v_signature_hash text; v_existing_action_count int;
BEGIN
v_role := get_current_user_role();
v_user_id := auth.uid();
IF v_role IS NULL OR v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Payroll period not found'; END IF;
IF v_period.status IN ('locked','completed') THEN RAISE EXCEPTION 'Payroll period is locked or completed'; END IF;
SELECT first_name || ' ' || last_name INTO v_user_name FROM profiles WHERE id = v_user_id;
v_steps := public.get_workflow_steps()->'steps';
SELECT (s->>'order')::int INTO v_current_order FROM jsonb_array_elements(v_steps) s WHERE s->>'step' = v_period.current_step;
IF v_current_order IS NULL THEN RAISE EXCEPTION 'Invalid workflow step: %', v_period.current_step; END IF;
SELECT s->>'role' INTO v_expected_role FROM jsonb_array_elements(v_steps) s WHERE s->>'step' = v_period.current_step;
IF v_role <> v_expected_role AND v_role <> 'payroll_admin' THEN
RAISE EXCEPTION 'Your role (%) is not the actor for step % (expected %)', v_role, v_period.current_step, v_expected_role;
END IF;
SELECT count(*) INTO v_existing_action_count FROM workflow_actions
WHERE payroll_period_id = p_period_id AND actor_id = v_user_id AND step <> v_period.current_step;
IF v_existing_action_count > 0 AND v_role <> 'payroll_admin' THEN
RAISE EXCEPTION 'Segregation of duties violation: you have already acted on a different step of this payroll';
END IF;
IF p_signature_phrase IS NOT NULL AND p_signature_phrase <> '' THEN
v_signature_hash := encode(digest(p_signature_phrase || v_user_id::text || p_period_id::text, 'sha256'), 'hex');
END IF;
INSERT INTO workflow_actions (payroll_period_id, step, action, actor_id, actor_name, actor_role, remarks, signature_hash, is_maker, is_checker)
VALUES (p_period_id, v_period.current_step, p_action, v_user_id, v_user_name, v_role, p_remarks, v_signature_hash,
v_period.current_step IN ('coordinator','hr','loan_verifier','payroll_officer'),
v_period.current_step IN ('school_head','payroll_processor','accounting','finance','treasury','auditor'));
INSERT INTO payroll_approvals (payroll_period_id, step, role, approver_id, approver_name, approver_role, signature_phrase, signature_hash, status, remarks, approved_at)
VALUES (p_period_id, v_period.current_step, v_role, v_user_id, v_user_name, v_role, p_signature_phrase, v_signature_hash, 'approved', p_remarks, now());
SELECT s->>'step' INTO v_next_step FROM jsonb_array_elements(v_steps) s WHERE (s->>'order')::int = v_current_order + 1;
IF v_next_step IS NULL THEN
UPDATE payroll_periods SET status = 'completed', current_step = 'done', updated_at = now() WHERE id = p_period_id;
ELSE
UPDATE payroll_periods SET current_step = v_next_step, updated_at = now() WHERE id = p_period_id;
END IF;
RETURN jsonb_build_object('success', true, 'previous_step', v_period.current_step, 'next_step', COALESCE(v_next_step, 'done'),
'period_status', CASE WHEN v_next_step IS NULL THEN 'completed' ELSE 'in_progress' END);
END;
$$;


ALTER FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text", "p_signature_phrase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_user"("p_target_user" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
caller_role text;
caller_id uuid;
target_email text;
BEGIN
SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
RAISE EXCEPTION 'Only super administrators can approve users';
END IF;

caller_id := auth.uid();

UPDATE profiles
SET status = 'approved',
approved_by = caller_id,
approved_at = now(),
rejection_reason = NULL,
rejected_by = NULL,
rejected_at = NULL,
disabled_by = NULL,
disabled_at = NULL
WHERE id = p_target_user
AND status IN ('pending_approval', 'rejected', 'disabled')
RETURNING email INTO target_email;

IF target_email IS NULL THEN
RAISE EXCEPTION 'User not found or not in an approvable state';
END IF;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
'user_approved', 'profiles', p_target_user::text,
jsonb_build_object('approved_email', target_email));

RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


ALTER FUNCTION "public"."approve_user"("p_target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_schools_to_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_assigned int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = p_division_id, updated_at = now()
  WHERE id = ANY(p_school_ids);
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_assigned', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_assigned));

  RETURN jsonb_build_object('success', true, 'assigned', v_assigned);
END;
$$;


ALTER FUNCTION "public"."assign_schools_to_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_employee_row"("p_stacode" "text", "p_empno" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
WITH caller AS (
SELECT role, assigned_stacode, employee_number
FROM profiles
WHERE id = auth.uid()
)
SELECT
EXISTS (SELECT 1 FROM caller WHERE role IN (
'super_admin', 'payroll_admin', 'payroll_processor',
'accounting_officer', 'hr_administrator',
'division_finance', 'auditor', 'read_only'
))
OR EXISTS (
SELECT 1 FROM caller
WHERE role IN ('school_head', 'school_coordinator')
AND assigned_stacode IS NOT NULL
AND assigned_stacode = p_stacode
)
OR EXISTS (
SELECT 1 FROM caller
WHERE role = 'ess'
AND employee_number IS NOT NULL
AND employee_number = p_empno
)
$$;


ALTER FUNCTION "public"."can_view_employee_row"("p_stacode" "text", "p_empno" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_otps"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
DELETE FROM otp_codes WHERE expires_at < now() OR used = true;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_otps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_schools_from_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_cleared int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = NULL, updated_at = now()
  WHERE id = ANY(p_school_ids) AND division_id = p_division_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_cleared', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_cleared));

  RETURN jsonb_build_object('success', true, 'cleared', v_cleared);
END;
$$;


ALTER FUNCTION "public"."clear_schools_from_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_division"("p_division_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_emp_count int;
  v_school_count int;
  v_user_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;

  SELECT count(*) INTO v_emp_count FROM employees WHERE division_id = p_division_id;
  SELECT count(*) INTO v_school_count FROM schools WHERE division_id = p_division_id;
  SELECT count(*) INTO v_user_count FROM profiles WHERE division_id = p_division_id;
  IF v_emp_count + v_school_count + v_user_count > 0 THEN
    RAISE EXCEPTION 'Division still has data assigned (% employees, % schools, % users). Reassign or remove it first.',
      v_emp_count, v_school_count, v_user_count;
  END IF;

  DELETE FROM divisions WHERE id = p_division_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_delete', 'divisions', p_division_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."delete_division"("p_division_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_region"("p_region_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_division_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  SELECT count(*) INTO v_division_count FROM divisions WHERE region_id = p_region_id;
  IF v_division_count > 0 THEN
    RAISE EXCEPTION 'Region has % division(s). Remove them first.', v_division_count;
  END IF;

  DELETE FROM regions WHERE id = p_region_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'region_delete', 'regions', p_region_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."delete_region"("p_region_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_removed boolean;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.role_permissions
  WHERE role = p_role AND permission = p_permission
  RETURNING true INTO v_removed;

  IF v_removed THEN
    INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
    SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
           jsonb_build_object('role', p_role, 'permission', p_permission, 'restored_default', true)
    FROM profiles u WHERE u.id = auth.uid();
  END IF;
END;
$$;


ALTER FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_user"("p_target_user" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
caller_role text;
caller_id uuid;
target_email text;
BEGIN
SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
RAISE EXCEPTION 'Only super administrators can disable users';
END IF;

caller_id := auth.uid();

UPDATE profiles
SET status = 'disabled',
disabled_by = caller_id,
disabled_at = now()
WHERE id = p_target_user
AND status IN ('approved', 'rejected', 'pending_approval')
RETURNING email INTO target_email;

IF target_email IS NULL THEN
RAISE EXCEPTION 'User not found or already disabled';
END IF;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
'user_disabled', 'profiles', p_target_user::text,
jsonb_build_object('disabled_email', target_email));

RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


ALTER FUNCTION "public"."disable_user"("p_target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_user"("p_target_user" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
caller_role text;
caller_id uuid;
target_email text;
BEGIN
SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
RAISE EXCEPTION 'Only super administrators can enable users';
END IF;

caller_id := auth.uid();

UPDATE profiles
SET status = 'approved',
disabled_by = NULL,
disabled_at = NULL
WHERE id = p_target_user
AND status = 'disabled'
RETURNING email INTO target_email;

IF target_email IS NULL THEN
RAISE EXCEPTION 'User not found or not disabled';
END IF;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
'user_enabled', 'profiles', p_target_user::text,
jsonb_build_object('enabled_email', target_email));

RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


ALTER FUNCTION "public"."enable_user"("p_target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_posted_entry_invariants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."enforce_posted_entry_invariants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_non_plantilla_before_upsert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
NEW.complete_name = trim(
coalesce(NEW.surname, '') || ', ' ||
coalesce(NEW.first_name, '') ||
CASE WHEN coalesce(NEW.middle_name, '') <> '' THEN ' ' || NEW.middle_name ELSE '' END
);

NEW.tin = nullif(trim(coalesce(NEW.tin, '')), '');
NEW.pagibig_number = nullif(trim(coalesce(NEW.pagibig_number, '')), '');
NEW.philhealth = nullif(trim(coalesce(NEW.philhealth, '')), '');
NEW.landbank = nullif(trim(coalesce(NEW.landbank, '')), '');

NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_non_plantilla_before_upsert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_monthly_periods"("p_year" integer, "p_regcode" "text" DEFAULT NULL::"text", "p_divcode" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count int := 0;
  v_month int;
  v_start date;
  v_end date;
  v_pay_date date;
  v_period_name text;
BEGIN
  FOR v_month IN 1..12 LOOP
    v_start := make_date(p_year, v_month, 1);
    v_end := (make_date(p_year, v_month, 1) + interval '1 month' - interval '1 day')::date;
    v_pay_date := (make_date(p_year, v_month, 1) + interval '1 month' + interval '14 days')::date;
    v_period_name := to_char(v_start, 'Month') || ' ' || p_year::text;

    INSERT INTO pay_periods (period_name, start_date, end_date, pay_date, frequency, status, month, year, period_number, regcode, divcode)
    SELECT v_period_name, v_start, v_end, v_pay_date, 'Monthly', 'draft', v_month, p_year, v_month, p_regcode, p_divcode
    WHERE NOT EXISTS (
      SELECT 1 FROM pay_periods
      WHERE year = p_year
        AND month = v_month
        AND regcode IS NOT DISTINCT FROM p_regcode
        AND divcode IS NOT DISTINCT FROM p_divcode
    );

    v_count := v_count + (ROW_COUNT() > 0)::int;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."generate_monthly_periods"("p_year" integer, "p_regcode" "text", "p_divcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_empno"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT employee_number FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_empno"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_stacode"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_stacode"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_divcode"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT division_code FROM profiles WHERE id = auth.uid() AND status = 'approved';
$$;


ALTER FUNCTION "public"."get_current_user_divcode"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_division_codes"() RETURNS "text"[]
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ARRAY[r.region_code, d.division_code]
  FROM profiles p
  JOIN divisions d ON d.id = p.division_id
  JOIN regions r ON r.id = d.region_id
  WHERE p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_user_division_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_empno"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid() AND status = 'approved';
$$;


ALTER FUNCTION "public"."get_current_user_empno"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT lower(btrim(role)) FROM profiles
  WHERE id = auth.uid() AND status = 'approved';
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_stacode"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid() AND status = 'approved';
$$;


ALTER FUNCTION "public"."get_current_user_stacode"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_summary"("category" "text" DEFAULT NULL::"text", "p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[]) RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
WITH caller AS MATERIALIZED (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS MATERIALIZED (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
scope_div_ids AS MATERIALIZED (
  -- division uuid(s) implied by the selected REGCODE/DIVCODE scope
  SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
),
scoped_emps AS MATERIALIZED (
  SELECT id, stacode, status, empno, employee_number, regcode, divcode, created_at,
         fname, first_name, lname, last_name, poscode, position, basic, basic_salary,
         (CASE WHEN stacode ~ '^[0-9]+$' THEN NULLIF(stacode, '')::int END) AS stacode_num
  FROM employees
  WHERE
    CASE
      WHEN category = 'elementary' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 1 AND 499
      WHEN category = 'highschool' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 500 AND 701
      ELSE true
    END
    AND (
      -- super_admin: follow the selected REGCODE/DIVCODE scope (or division ids)
      ((SELECT role FROM caller) = 'super_admin' AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
        OR division_id IN (SELECT id FROM scope_div_ids)
        OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
      ))
      OR
      -- everyone else: clamped to their own division (if assigned) — by id OR
      -- by REGCODE/DIVCODE so imported legacy rows stay visible
      ((SELECT role FROM caller) <> 'super_admin' AND (
        (SELECT division_id FROM caller) IS NULL
        OR division_id = (SELECT division_id FROM caller)
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE employees.regcode = cc.region_code AND employees.divcode = cc.division_code
        )
      ))
    )
),
active_emps AS MATERIALIZED (
  SELECT * FROM scoped_emps WHERE status = 'Active'
),
entry_agg AS MATERIALIZED (
  SELECT
    COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
    COALESCE(SUM(pe.net_pay), 0) AS total_net,
    COALESCE(SUM(pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax), 0) AS total_mandatory,
    COALESCE(SUM(pe.other_deductions), 0) AS total_loan_deds,
    COUNT(*) FILTER (WHERE pe.status = 'Posted') AS processed_count,
    COUNT(*) FILTER (WHERE pe.status = 'Computed') AS pending_count
  FROM payroll_entries pe
  WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
current_period AS MATERIALIZED (
  SELECT * FROM pay_periods
  WHERE (
    ((SELECT role FROM caller) = 'super_admin' AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
      OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
    ))
    OR
    ((SELECT role FROM caller) <> 'super_admin' AND (
      (SELECT division_id FROM caller) IS NULL
      OR (regcode IS NULL AND divcode IS NULL)
      OR EXISTS (
        SELECT 1 FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = pay_periods.regcode
          AND d.division_code = pay_periods.divcode
          AND d.id = (SELECT division_id FROM caller)
      )
    ))
  )
  ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
  LIMIT 1
),
group_counts AS MATERIALIZED (
  SELECT g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max,
    COUNT(e.id) AS emp_count
  FROM payroll_groups g
  LEFT JOIN active_emps e ON
    g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
    AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL
  GROUP BY g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max
),
unassigned AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM active_emps e
  WHERE e.stacode_num IS NULL
     OR NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
    )
),
ded_totals AS MATERIALIZED (
  SELECT pd.dedcode, COALESCE(dc.dedname, pd.dedcode) AS dedname,
    COUNT(*) AS cnt, SUM(pd.dedamt) AS total
  FROM payroll_deductions pd
  LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  WHERE pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
  GROUP BY pd.dedcode, dc.dedname
  ORDER BY total DESC
  LIMIT 8
),
loan_accounts AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM payroll_deductions pd
  WHERE pd.type = 'Loan' AND pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
recent_emps AS MATERIALIZED (
  SELECT e.id, e.empno, e.employee_number, e.fname, e.first_name, e.lname, e.last_name,
         e.poscode, e.position, e.regcode, e.basic, e.basic_salary
  FROM scoped_emps e
  ORDER BY e.created_at DESC
  LIMIT 5
)
SELECT json_build_object(
  'totalRecords', (SELECT COUNT(*) FROM scoped_emps),
  'activeEmployees', (SELECT COUNT(*) FROM active_emps),
  'totalGross', (SELECT total_gross FROM entry_agg),
  'totalNet', (SELECT total_net FROM entry_agg),
  'totalMandatory', (SELECT total_mandatory FROM entry_agg),
  'totalLoanDeds', (SELECT total_loan_deds FROM entry_agg),
  'processedCount', (SELECT processed_count FROM entry_agg),
  'pendingCount', (SELECT pending_count FROM entry_agg),
  'currentPeriod', (SELECT to_json(cp) FROM current_period cp),
  'periodNet', COALESCE((SELECT SUM(pe.net_pay)
    FROM payroll_entries pe
    WHERE pe.pay_period_id = (SELECT id FROM current_period)
      AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))), 0),
  'groupStats', COALESCE((SELECT json_agg(json_build_object(
    'id', gc.id, 'group_code', gc.group_code, 'group_name', gc.group_name,
    'stacode_min', gc.stacode_min, 'stacode_max', gc.stacode_max, 'count', gc.emp_count
  ) ORDER BY gc.stacode_min) FROM group_counts gc), '[]'::json),
  'unassignedCount', (SELECT cnt FROM unassigned),
  'activeLoanAccounts', (SELECT cnt FROM loan_accounts),
  'dedTotalsByCode', COALESCE((SELECT json_agg(json_build_object(
    'code', dt.dedcode, 'name', dt.dedname, 'count', dt.cnt, 'total', dt.total
  )) FROM ded_totals dt), '[]'::json),
  'recentEmployees', COALESCE((SELECT json_agg(json_build_object(
    'id', re.id, 'empno', re.empno, 'employee_number', re.employee_number,
    'fname', re.fname, 'first_name', re.first_name,
    'lname', re.lname, 'last_name', re.last_name,
    'poscode', re.poscode, 'position', re.position,
    'regcode', re.regcode, 'basic', re.basic, 'basic_salary', re.basic_salary
  )) FROM recent_emps re), '[]'::json)
);
$_$;


ALTER FUNCTION "public"."get_dashboard_summary"("category" "text", "p_regcode" "text", "p_divcodes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dbf_table_counts_by_category"() RETURNS TABLE("table_name" "text", "total" bigint, "elementary" bigint, "highschool" bigint)
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $_$
SELECT 'dbf_stntable'::text AS table_name,
count(*)::bigint AS total,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint AS elementary,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint AS highschool
FROM dbf_stntable
UNION ALL
SELECT 'dbf_divtable',
count(*)::bigint, NULL::bigint, NULL::bigint
FROM dbf_divtable
UNION ALL
SELECT 'dbf_included',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_included
UNION ALL
SELECT 'dbf_excluded',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_excluded
UNION ALL
SELECT 'dbf_payrolls',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_payrolls
UNION ALL
SELECT 'dbf_pyent',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_pyent
UNION ALL
SELECT 'dbf_pyent1',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_pyent1
UNION ALL
SELECT 'dbf_pyent2',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM dbf_pyent2
UNION ALL
SELECT 'employees',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM employees
UNION ALL
SELECT 'payroll_deductions',
count(*)::bigint,
count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 500 AND 701)::bigint
FROM payroll_deductions pd
LEFT JOIN employees e ON e.id = pd.employee_id
$_$;


ALTER FUNCTION "public"."get_dbf_table_counts_by_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deduction_engine_stats"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
WITH active_deds AS (
SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status, dc.type, dc.agency, dc.active AS code_active
FROM payroll_deductions pd
LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
),
emp_gross AS (
SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
FROM employees WHERE status = 'Active'
)
SELECT jsonb_build_object(
'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
'grossPay', (SELECT total FROM emp_gross),
'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
'groupTotals', (
SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
SELECT
CASE
WHEN agency = 'GSIS' THEN 'gsis'
WHEN agency = 'BIR' THEN 'bir'
WHEN agency = 'PHILHEALTH' THEN 'philhealth'
WHEN agency = 'PAGIBIG' THEN 'pagibig'
WHEN agency = 'DEPED' THEN 'deped'
WHEN agency = 'INSURANCE' THEN 'insurance'
WHEN agency = 'BANK' THEN 'banks'
WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
WHEN agency = 'ASSOCIATION' THEN 'associations'
WHEN type = 'Loan' THEN 'loans'
ELSE 'others'
END AS group_id,
COUNT(*) AS count,
SUM(dedamt) AS amount
FROM active_deds
WHERE ded_status = 'Active' AND code_active = true
GROUP BY 1
) g
)
);
$$;


ALTER FUNCTION "public"."get_deduction_engine_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deduction_engine_stats"("p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH scoped_emps AS (
    SELECT id, empno, status, basic, basic_salary, pera
      FROM employees
     WHERE (p_regcode IS NULL OR regcode = p_regcode)
       AND (p_divcodes IS NULL OR divcode = ANY(p_divcodes))
  ),
  scoped_deds AS (
    SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status,
           dc.type, dc.agency, dc.active AS code_active
      FROM payroll_deductions pd
      LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
     WHERE p_regcode IS NULL AND p_divcodes IS NULL
        OR pd.employee_id IN (SELECT id FROM scoped_emps)
        OR pd.empno IN (SELECT empno FROM scoped_emps WHERE empno IS NOT NULL AND empno <> '')
  ),
  active_deds AS (
    SELECT * FROM scoped_deds
  ),
  emp_gross AS (
    SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
      FROM scoped_emps
     WHERE status = 'Active'
  )
  SELECT jsonb_build_object(
    'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'grossPay', (SELECT total FROM emp_gross),
    'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'groupTotals', (
      SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT
          CASE
            WHEN agency = 'GSIS' THEN 'gsis'
            WHEN agency = 'BIR' THEN 'bir'
            WHEN agency = 'PHILHEALTH' THEN 'philhealth'
            WHEN agency = 'PAGIBIG' THEN 'pagibig'
            WHEN agency = 'DEPED' THEN 'deped'
            WHEN agency = 'INSURANCE' THEN 'insurance'
            WHEN agency = 'BANK' THEN 'banks'
            WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
            WHEN agency = 'ASSOCIATION' THEN 'associations'
            WHEN type = 'Loan' THEN 'loans'
            ELSE 'others'
          END AS group_id,
          COUNT(*) AS count,
          SUM(dedamt) AS amount
        FROM active_deds
        WHERE ded_status = 'Active' AND code_active = true
        GROUP BY 1
      ) g
    )
  );
$$;


ALTER FUNCTION "public"."get_deduction_engine_stats"("p_regcode" "text", "p_divcodes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
SELECT jsonb_build_object(
'totalCount', COUNT(*),
'totalAmount', COALESCE(SUM(amount), 0),
'codeCount', COUNT(DISTINCT deduction_code),
'empCount', COUNT(DISTINCT employee_id)
)
FROM deductions
WHERE pay_period_id = p_period_id
AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;


ALTER FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payroll_group_counts"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
FROM (
SELECT payroll_group_id AS group_id, COUNT(*) AS count
FROM employees
WHERE status = 'Active' AND payroll_group_id IS NOT NULL
GROUP BY payroll_group_id
) row;
$$;


ALTER FUNCTION "public"."get_payroll_group_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payroll_history_by_month"("p_year" integer, "p_regcode" "text" DEFAULT NULL::"text", "p_divcode" "text" DEFAULT NULL::"text") RETURNS TABLE("period_id" "uuid", "month" integer, "year" integer, "period_name" "text", "status" "text", "pay_date" "date", "employee_count" bigint, "total_gross" numeric, "total_deductions" numeric, "total_net" numeric, "total_undeducted" numeric, "nthp_pass_count" bigint, "nthp_fail_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
WITH caller AS MATERIALIZED (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS MATERIALIZED (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
is_super AS MATERIALIZED (
  SELECT (SELECT role FROM caller) = 'super_admin' AS v
),
scoped_emps AS MATERIALIZED (
  SELECT e.id FROM employees e
  WHERE
    ((SELECT v FROM is_super) AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
      OR e.regcode = p_regcode AND e.divcode = p_divcode
      OR e.division_id IN (
        SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = p_regcode AND d.division_code = p_divcode
      )
    ))
    OR
    (NOT (SELECT v FROM is_super) AND (
      (SELECT division_id FROM caller) IS NULL
      OR e.division_id = (SELECT division_id FROM caller)
      OR EXISTS (
        SELECT 1 FROM caller_codes cc
        WHERE e.regcode = cc.region_code AND e.divcode = cc.division_code
      )
    ))
),
scoped_periods AS MATERIALIZED (
  SELECT pp.id, pp.month, pp.year, pp.period_name, pp.status, pp.pay_date
  FROM pay_periods pp
  WHERE pp.year = p_year
    AND (
      ((SELECT v FROM is_super) AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
        OR pp.regcode = p_regcode AND pp.divcode = p_divcode
      ))
      OR
      (NOT (SELECT v FROM is_super) AND (
        (SELECT division_id FROM caller) IS NULL
        OR pp.regcode IS NULL OR pp.divcode IS NULL
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE pp.regcode = cc.region_code AND pp.divcode = cc.division_code
        )
      ))
    )
)
SELECT
  p.id, p.month, p.year, p.period_name, p.status, p.pay_date,
  COUNT(pe.id) AS employee_count,
  COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
  COALESCE(SUM(pe.total_deductions), 0) AS total_deductions,
  COALESCE(SUM(pe.net_pay), 0) AS total_net,
  COALESCE(SUM(pe.undeducted_amount), 0) AS total_undeducted,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'PASS') AS nthp_pass_count,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'FAIL') AS nthp_fail_count
FROM scoped_periods p
LEFT JOIN payroll_entries pe
  ON pe.pay_period_id = p.id
 AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
GROUP BY p.id, p.month, p.year, p.period_name, p.status, p.pay_date
ORDER BY p.month ASC;
$$;


ALTER FUNCTION "public"."get_payroll_history_by_month"("p_year" integer, "p_regcode" "text", "p_divcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid" DEFAULT NULL::"uuid", "p_emp_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
SELECT jsonb_build_object(
'totalGross', COALESCE(SUM(gross_pay), 0),
'totalDedlnr', COALESCE(SUM(dedlnr), 0),
'totalDedmed', COALESCE(SUM(dedmed), 0),
'totalDedpag', COALESCE(SUM(dedpag), 0),
'totalDedtax', COALESCE(SUM(dedtax), 0),
'totalOtherDeds', COALESCE(SUM(COALESCE(actual_loan_deductions, other_deductions, 0)), 0),
'totalDeductions', COALESCE(SUM(total_deductions), 0),
'totalNet', COALESCE(SUM(net_pay), 0),
'totalUndeducted', COALESCE(SUM(COALESCE(undeducted_amount, 0)), 0),
'nthpFails', COUNT(*) FILTER (WHERE nthp_status = 'FAIL'),
'entryCount', COUNT(*)
)
FROM payroll_entries
WHERE (p_period_id IS NULL OR pay_period_id = p_period_id)
AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;


ALTER FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role" "text" NOT NULL,
    "permission" "text" NOT NULL,
    "granted" boolean NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "role_permissions_permission_check" CHECK (("permission" = ANY (ARRAY['dashboard'::"text", 'employees'::"text", 'groups'::"text", 'salary'::"text", 'deductions'::"text", 'dedmaster'::"text", 'dedengine'::"text", 'payroll'::"text", 'taxcalc'::"text", 'reports'::"text", 'stacode'::"text", 'user_management'::"text", 'audit_logs'::"text", 'system_settings'::"text", 'dbf_restore'::"text", 'comm_allowance'::"text"]))),
    CONSTRAINT "role_permissions_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text", 'payroll_processor'::"text", 'accounting_officer'::"text", 'hr_administrator'::"text", 'school_coordinator'::"text", 'division_finance'::"text", 'auditor'::"text", 'school_head'::"text", 'ess'::"text", 'read_only'::"text"])))
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_role_permissions"() RETURNS SETOF "public"."role_permissions"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.role_permissions;
$$;


ALTER FUNCTION "public"."get_role_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
user_role text;
BEGIN
SELECT role INTO user_role FROM profiles WHERE id = user_uuid;
RETURN COALESCE(user_role, 'viewer');
END;
$$;


ALTER FUNCTION "public"."get_user_role"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workflow_steps"() RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
SELECT jsonb_build_object('steps', jsonb_build_array(
jsonb_build_object('step','coordinator','role','school_coordinator','label','School Coordinator','order',1),
jsonb_build_object('step','school_head','role','school_head','label','School Head','order',2),
jsonb_build_object('step','hr','role','hr_administrator','label','HR Administrator','order',3),
jsonb_build_object('step','loan_verifier','role','loan_verifier','label','Loan Verifier','order',4),
jsonb_build_object('step','payroll_officer','role','payroll_officer','label','Payroll Officer (Maker)','order',5),
jsonb_build_object('step','payroll_processor','role','payroll_processor','label','Payroll Processor (Checker)','order',6),
jsonb_build_object('step','accounting','role','accounting_officer','label','Accounting Officer','order',7),
jsonb_build_object('step','finance','role','division_finance','label','Division Finance Officer','order',8),
jsonb_build_object('step','treasury','role','treasury_disbursement','label','Treasury Disbursement','order',9),
jsonb_build_object('step','auditor','role','auditor','label','Auditor','order',10)
));
$$;


ALTER FUNCTION "public"."get_workflow_steps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
user_count int;
assigned_role text;
assigned_status text;
BEGIN
SELECT count(*) INTO user_count FROM profiles;
IF user_count = 0 THEN
assigned_role := 'super_admin';
assigned_status := 'approved';
ELSE
assigned_role := 'read_only';
assigned_status := 'pending_approval';
END IF;

INSERT INTO public.profiles (
id, email, first_name, last_name, mobile_number, username,
role, email_verified, status,
office_assignment, position_designation, employee_number
)
VALUES (
NEW.id,
NEW.email,
COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
NULLIF(NEW.raw_user_meta_data->>'username', ''),
assigned_role,
false,
assigned_status,
NULLIF(NEW.raw_user_meta_data->>'office_assignment', ''),
NULLIF(NEW.raw_user_meta_data->>'position_designation', ''),
NULLIF(NEW.raw_user_meta_data->>'employee_number', '')
);
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role_level"("p_min_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH role_rank(rn, role_name) AS (
    VALUES
      (1, 'read_only'),
      (2, 'ess'),
      (3, 'school_head'),
      (4, 'school_coordinator'),
      (5, 'auditor'),
      (6, 'division_finance'),
      (7, 'hr_administrator'),
      (8, 'accounting_officer'),
      (9, 'payroll_processor'),
      (10, 'payroll_admin'),
      (11, 'super_admin')
  )
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_rank caller ON caller.role_name = lower(btrim(p.role))
    JOIN role_rank minimum ON minimum.role_name = lower(btrim(p_min_role))
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND caller.rn >= minimum.rn
  );
$$;


ALTER FUNCTION "public"."has_role_level"("p_min_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hash_otp"("otp_code" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pgcrypto'
    AS $$
BEGIN
RETURN crypt(otp_code, gen_salt('bf'));
END;
$$;


ALTER FUNCTION "public"."hash_otp"("otp_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_data_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT get_current_user_role() IN (
'super_admin', 'payroll_admin', 'payroll_processor',
'accounting_officer', 'hr_administrator',
'division_finance', 'auditor', 'read_only'
);
$$;


ALTER FUNCTION "public"."is_data_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_data_writer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT get_current_user_role() IN (
'super_admin',
'payroll_admin',
'payroll_processor',
'payroll_officer',
'hr_administrator'
);
$$;


ALTER FUNCTION "public"."is_data_writer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(btrim(role)) = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workflow_participant"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT get_current_user_role() IN (
'school_coordinator','school_head','hr_administrator','loan_verifier',
'payroll_officer','payroll_processor','accounting_officer',
'division_finance','treasury_disbursement','auditor','payroll_admin'
);
$$;


ALTER FUNCTION "public"."is_workflow_participant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_mfa_code"("p_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_user_id uuid;
v_code text;
BEGIN
SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
IF v_user_id IS NULL THEN
RETURN true;
END IF;

UPDATE otp_codes SET used = true
WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false;

v_code := lpad(((floor(random() * 900000) + 100000))::bigint::text, 6, '0');

INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
VALUES (v_user_id, crypt(v_code, gen_salt('bf')), 'mfa', now() + interval '5 minutes');

RETURN true;
END;
$$;


ALTER FUNCTION "public"."issue_mfa_code"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_role text; v_user_id uuid; v_user_name text;
BEGIN
v_role := get_current_user_role(); v_user_id := auth.uid();
IF v_role IS NULL OR v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
IF v_role NOT IN ('payroll_admin','payroll_processor','accounting_officer') THEN RAISE EXCEPTION 'Not authorized to lock payroll'; END IF;
SELECT first_name || ' ' || last_name INTO v_user_name FROM profiles WHERE id = v_user_id;
UPDATE payroll_periods SET status = 'locked', locked_by = v_user_id, locked_at = now(), updated_at = now()
WHERE id = p_period_id AND status NOT IN ('locked','completed');
IF NOT FOUND THEN RAISE EXCEPTION 'Payroll period not found or already locked'; END IF;
INSERT INTO workflow_actions (payroll_period_id, step, action, actor_id, actor_name, actor_role, remarks)
VALUES (p_period_id, 'lock', 'lock', v_user_id, v_user_name, v_role, 'Payroll locked');
RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_table_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action text;
  v_user_email text;
  v_record_id text;
BEGIN
  -- Bulk payroll runs (run_payroll_bulk) suppress per-row audit
  -- rows and write one summary row instead; see the migration
  -- 20260818_optimize_payroll_run_bulk_audit.sql.
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_action := TG_ARGV[0];
  v_record_id := COALESCE(NEW.id::text, OLD.id::text);

  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    v_user_email,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new', CASE WHEN TG_OP IN ('Insert','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_table_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_email_verified"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Email not confirmed by auth provider';
  END IF;

  UPDATE profiles SET email_verified = true WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."mark_email_verified"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_violation_count integer;
  v_entry_count integer;
  v_employee_ids uuid[];
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized to post payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is already closed';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period posting (closes the shared period).
    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries SET status = 'Posted' WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'closed' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped posting: only the given employees' entries are posted.
    -- The shared pay period is left open so other divisions post independently.
    v_employee_ids := p_employee_ids;
    IF v_caller_role <> 'super_admin' THEN
      -- Server-enforced clamp: non-super-admins can only post their own
      -- division's employees (defense in depth against crafted ids). Matches
      -- by division_id first, then by REGCODE + DIVCODE for legacy rows.
      SELECT array_agg(e.id) INTO v_employee_ids
        FROM employees e
        JOIN profiles p ON p.id = auth.uid()
        LEFT JOIN divisions d ON d.id = p.division_id
        LEFT JOIN regions r ON r.id = d.region_id
        WHERE e.id = ANY(p_employee_ids)
          AND (
            e.division_id = p.division_id
            OR (
              r.region_code IS NOT NULL AND d.division_code IS NOT NULL
              AND e.regcode = r.region_code AND e.divcode = d.division_code
            )
          );
    END IF;
    IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids)
        AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries
      SET status = 'Posted'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_approve', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_posted', v_entry_count);
END;
$$;


ALTER FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_closed_period_reopen"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_caller_role text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

IF v_caller_role = 'super_admin' AND NEW.status = 'draft' THEN
RETURN NEW;
END IF;

RAISE EXCEPTION 'Cannot reopen a closed pay period';
END;
$$;


ALTER FUNCTION "public"."prevent_closed_period_reopen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_posted_entry_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."prevent_posted_entry_modification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_is_self_update boolean;
BEGIN
  SELECT p.role INTO v_role
  FROM profiles p
  WHERE p.id = auth.uid() AND p.status = 'approved';

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  v_is_self_update := (auth.uid() = NEW.id AND auth.uid() = OLD.id);

  -- Columns nobody except an approved super_admin may change, on any row.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
    RAISE EXCEPTION 'Not authorized to change assigned STACODE';
  END IF;
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Not authorized to change employee number';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not authorized to change account status';
  END IF;
  IF NEW.division_code IS DISTINCT FROM OLD.division_code THEN
    RAISE EXCEPTION 'Not authorized to change division code';
  END IF;

  IF v_is_self_update THEN
    -- Login tracking, email_verified and mfa_enabled remain self-writable so
    -- record_successful_login / mark_email_verified keep working.
    RETURN NEW;
  END IF;

  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    RAISE EXCEPTION 'Not authorized to change MFA settings';
  END IF;
  -- Email verification: false -> true is allowed for ANY row whose auth user
  -- has actually confirmed the email (auth.users.email_confirmed_at). This
  -- lets the sync trigger below (no JWT in context) and the RPC both work,
  -- without allowing anyone to flip verification for an unconfirmed account.
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified
     AND NOT (OLD.email_verified = false AND NEW.email_verified = true
              AND EXISTS (
                SELECT 1 FROM auth.users u
                WHERE u.id = NEW.id AND u.email_confirmed_at IS NOT NULL
              )) THEN
    RAISE EXCEPTION 'Not authorized to change email verification status';
  END IF;
  IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
    RAISE EXCEPTION 'Not authorized to change login attempt count';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'Not authorized to unlock accounts';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'Not authorized to change login timestamp';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'Not authorized to change login IP';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_dedfile"("p_search" "text" DEFAULT NULL::"text", "p_stacode" "text" DEFAULT NULL::"text", "p_dedcode" "text" DEFAULT NULL::"text", "p_empno" "text" DEFAULT NULL::"text", "p_period" "text" DEFAULT NULL::"text", "p_stacode_min" integer DEFAULT NULL::integer, "p_stacode_max" integer DEFAULT NULL::integer, "p_sort_key" "text" DEFAULT 'empno'::"text", "p_sort_dir" "text" DEFAULT 'asc'::"text", "p_page" integer DEFAULT 0, "p_page_size" integer DEFAULT 50, "p_count_only" boolean DEFAULT false, "p_division_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_sort_col text;
  v_sort_dir_clause text;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));

  -- Build WHERE clause
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L OR e.stacode ILIKE %L OR e.regcode ILIKE %L OR e.divcode ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows (super_admins pass the selected scope).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(' AND e.division_id = %L', v_my_division::text);
  END IF;

  IF p_stacode IS NOT NULL AND p_stacode != 'All' AND p_stacode != '' THEN
    v_where := v_where || format(' AND e.stacode = %L', p_stacode);
  END IF;

  IF p_dedcode IS NOT NULL AND p_dedcode != 'All' AND p_dedcode != '' THEN
    v_where := v_where || format(' AND pd.dedcode = %L', p_dedcode);
  END IF;

  IF p_empno IS NOT NULL AND trim(p_empno) != '' THEN
    v_where := v_where || format(' AND pd.empno ILIKE %L', '%'||trim(p_empno)||'%');
  END IF;

  IF p_period IS NOT NULL AND trim(p_period) != '' THEN
    v_where := v_where || format(' AND lpad(pd.effyy::text, 4, ''0'') || lpad(pd.effmm::text, 2, ''0'') ILIKE %L', '%'||trim(p_period)||'%');
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND e.stacode_num >= %s AND e.stacode_num <= %s', p_stacode_min, p_stacode_max);
  END IF;

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
    v_where := v_where || format(' AND e.division_id = ANY(%L::uuid[])', p_division_ids);
  END IF;

  -- Determine sort column
  v_sort_col := CASE lower(coalesce(p_sort_key, 'empno'))
    WHEN 'empno' THEN 'pd.empno'
    WHEN 'dedcode' THEN 'pd.dedcode'
    WHEN 'dedamt' THEN 'pd.dedamt'
    WHEN 'policyno' THEN 'pd.policyno'
    WHEN 'agency' THEN 'pd.agency'
    WHEN 'status' THEN 'pd.status'
    WHEN 'type' THEN 'pd.type'
    WHEN 'lname' THEN 'e.lname'
    WHEN 'stacode' THEN 'e.stacode'
    WHEN 'effyy' THEN 'pd.effyy'
    WHEN 'effmm' THEN 'pd.effmm'
    WHEN 'principal' THEN 'pd.principal'
    WHEN 'netpay' THEN 'e.netpay'
    ELSE 'pd.empno'
  END;

  v_sort_dir_clause := CASE lower(coalesce(p_sort_dir, 'asc'))
    WHEN 'desc' THEN 'DESC'
    ELSE 'ASC'
  END;

  -- Count total
  EXECUTE format(
    'SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s',
    v_where
  ) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno,
             pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             pd.agency, pd.status, pd.type,
             pd.created_by, pd.created_at, pd.updated_by, pd.updated_at,
             e.lname, e.last_name, e.fname, e.first_name, e.mi, e.appel,
             e.stacode, e.regcode, e.divcode, e.netpay, e.updcode, e.update,
             e.paydate, e.editor, e.hiredate, e.hire_date, e.birthdate, e.gsis_pn
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY %s %s, pd.dedcode ASC
      LIMIT %s OFFSET %s
    ) r',
    v_where, v_sort_col, v_sort_dir_clause, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;


ALTER FUNCTION "public"."query_dedfile"("p_search" "text", "p_stacode" "text", "p_dedcode" "text", "p_empno" "text", "p_period" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_sort_key" "text", "p_sort_dir" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_employees"("p_search" "text" DEFAULT NULL::"text", "p_stacode_min" integer DEFAULT NULL::integer, "p_stacode_max" integer DEFAULT NULL::integer, "p_status" "text" DEFAULT NULL::"text", "p_group_id" "uuid" DEFAULT NULL::"uuid", "p_stacode" "text" DEFAULT NULL::"text", "p_page" integer DEFAULT 0, "p_page_size" integer DEFAULT 10, "p_count_only" boolean DEFAULT false, "p_scope_column" "text" DEFAULT NULL::"text", "p_scope_value" "text" DEFAULT NULL::"text", "p_division_id" "uuid" DEFAULT NULL::"uuid", "p_division_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (empno ILIKE %L OR employee_number ILIKE %L OR lname ILIKE %L OR last_name ILIKE %L OR fname ILIKE %L OR first_name ILIKE %L OR mi ILIKE %L OR middle_name ILIKE %L OR poscode ILIKE %L OR department ILIKE %L OR stacode ILIKE %L OR empname ILIKE %L OR account ILIKE %L OR banker ILIKE %L OR tin ILIKE %L OR gsis_id ILIKE %L OR gsis_pn ILIKE %L OR hdmf_id ILIKE %L OR phic_id ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  -- Division scoping (server-enforced): super_admin may filter by the selected
  -- division(s). REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes. Everyone else is clamped to
  -- their own division, if they have one.
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
      v_where := v_where || format(
        ' AND (division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (regcode = %L AND divcode = ANY(%L::text[])))',
        p_regcode, p_divcodes, p_regcode, p_divcodes
      );
    ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
      v_where := v_where || format(' AND division_id = ANY(%L::uuid[])', p_division_ids);
    ELSIF p_division_id IS NOT NULL THEN
      v_where := v_where || format(' AND division_id = %L', p_division_id::text);
    END IF;
  ELSIF v_my_division IS NOT NULL THEN
    v_where := v_where || format(' AND division_id = %L', v_my_division::text);
  END IF;

  -- Scope filter for role-based data segregation
  IF p_scope_column IS NOT NULL AND p_scope_value IS NOT NULL AND p_scope_column != '' THEN
    IF p_scope_column = 'stacode' THEN
      v_where := v_where || format(' AND stacode = %L', p_scope_value);
    ELSIF p_scope_column = 'empno' THEN
      v_where := v_where || format(' AND (empno = %L OR employee_number = %L)', p_scope_value, p_scope_value);
    END IF;
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND stacode_num >= %s AND stacode_num <= %s', p_stacode_min, p_stacode_max);
  ELSIF p_stacode IS NOT NULL AND p_stacode != '' THEN
    v_where := v_where || format(' AND stacode = %L', p_stacode);
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    v_where := v_where || format(' AND status = %L', p_status);
  END IF;

  IF p_group_id IS NOT NULL THEN
    v_where := v_where || format(' AND payroll_group_id = %L', p_group_id::text);
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM employees WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(e)), ''[]''::jsonb) FROM (SELECT * FROM employees WHERE true %s ORDER BY lname, fname LIMIT %s OFFSET %s) e',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;


ALTER FUNCTION "public"."query_employees"("p_search" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_status" "text", "p_group_id" "uuid", "p_stacode" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_scope_column" "text", "p_scope_value" "text", "p_division_id" "uuid", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_payroll_deductions"("p_search" "text" DEFAULT NULL::"text", "p_status_filter" "text" DEFAULT NULL::"text", "p_type_filter" "text" DEFAULT NULL::"text", "p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[], "p_stacode_min" integer DEFAULT NULL::integer, "p_stacode_max" integer DEFAULT NULL::integer, "p_page" integer DEFAULT 0, "p_page_size" integer DEFAULT 10, "p_count_only" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != 'All' THEN
    v_where := v_where || format(' AND pd.status = %L', p_status_filter);
  END IF;

  IF p_type_filter IS NOT NULL AND p_type_filter != 'All' THEN
    v_where := v_where || format(' AND pd.type = %L', p_type_filter);
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(
      ' AND e.stacode IS NOT NULL AND e.stacode ~ %L AND substring(e.stacode from %s)::int BETWEEN %s AND %s',
      '^[0-9]+$', '1', p_stacode_min, p_stacode_max
    );
  END IF;

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows (super_admins pass the selected scope).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(' AND e.division_id = %L', v_my_division::text);
  END IF;

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows
  -- that were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno, pd.agency,
             pd.type, pd.status, pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             e.lname, e.last_name, e.fname, e.first_name, e.mi
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY pd.empno, pd.dedcode
      LIMIT %s OFFSET %s
    ) r',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$_$;


ALTER FUNCTION "public"."query_payroll_deductions"("p_search" "text", "p_status_filter" "text", "p_type_filter" "text", "p_regcode" "text", "p_divcodes" "text"[], "p_stacode_min" integer, "p_stacode_max" integer, "p_page" integer, "p_page_size" integer, "p_count_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_schools_with_stats"("p_school_type" "text" DEFAULT NULL::"text", "p_division_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_regcode" "text" DEFAULT NULL::"text", "p_divcodes" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("id" "uuid", "school_code" "text", "school_name" "text", "school_type" "text", "cluster" "text", "address" "text", "school_head" "text", "contact_number" "text", "email" "text", "status" "text", "total_employees" bigint, "teaching_personnel" bigint, "non_teaching_personnel" bigint, "active_payroll_employees" bigint)
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  SELECT
    s.id,
    s.school_code,
    s.school_name,
    s.school_type,
    s.cluster,
    s.address,
    s.school_head,
    s.contact_number,
    s.email,
    s.status,
    COALESCE(st.total, 0) AS total_employees,
    COALESCE(st.teaching, 0) AS teaching_personnel,
    COALESCE(st.non_teaching, 0) AS non_teaching_personnel,
    COALESCE(st.active, 0) AS active_payroll_employees
  FROM schools s
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE e.poscode ~ '^[12]') AS teaching,
      COUNT(*) FILTER (WHERE e.poscode IS NOT NULL AND e.poscode <> '' AND e.poscode !~ '^[12]') AS non_teaching,
      COUNT(*) FILTER (WHERE e.status = 'Active') AS active
    FROM employees e
    WHERE e.stacode = s.school_code
  ) st ON true
  WHERE (p_school_type IS NULL OR s.school_type = p_school_type)
    AND (
      -- Unscoped
      (p_division_ids IS NULL OR cardinality(p_division_ids) = 0)
      AND (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
      OR
      -- Scoped: school mapped to the selected division(s)…
      s.division_id = ANY(p_division_ids)
      OR s.division_id IN (
        SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
      )
      OR
      -- …or its employees carry the selected REGCODE/DIVCODE (STACODE = school code)
      EXISTS (
        SELECT 1 FROM employees e
        WHERE e.stacode = s.school_code
          AND e.regcode = p_regcode
          AND e.divcode = ANY(p_divcodes)
      )
    )
  ORDER BY s.school_code;
$$;


ALTER FUNCTION "public"."query_schools_with_stats"("p_school_type" "text", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_failed_login"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_profile record;
v_attempts integer;
v_caller_email text;
BEGIN
IF auth.uid() IS NOT NULL THEN
SELECT email INTO v_caller_email FROM profiles WHERE id = auth.uid();
IF v_caller_email IS NOT NULL AND v_caller_email != lower(p_email) THEN
RAISE EXCEPTION 'Not authorized to record login attempts for another user';
END IF;
END IF;

SELECT id, failed_login_attempts INTO v_profile
FROM profiles WHERE email = lower(p_email);
IF v_profile IS NULL THEN RETURN; END IF;

v_attempts := COALESCE(v_profile.failed_login_attempts, 0) + 1;

IF v_attempts >= 5 THEN
UPDATE profiles
SET failed_login_attempts = v_attempts,
locked_until = now() + interval '30 minutes'
WHERE id = v_profile.id;
ELSE
UPDATE profiles
SET failed_login_attempts = v_attempts
WHERE id = v_profile.id;
END IF;
END;
$$;


ALTER FUNCTION "public"."record_failed_login"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text" DEFAULT NULL::"text", "p_device_fingerprint" "text" DEFAULT NULL::"text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_user_id uuid;
BEGIN
SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
INSERT INTO login_logs (email, user_id, success, failure_reason, device_fingerprint, ip_address, user_agent)
VALUES (p_email, v_user_id, p_success, p_failure_reason, p_device_fingerprint, p_ip_address, p_user_agent);
END;
$$;


ALTER FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text", "p_device_fingerprint" "text", "p_ip_address" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text" DEFAULT 'info'::"text", "p_description" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_user_id uuid; v_user_email text;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NOT NULL THEN SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id; END IF;
INSERT INTO security_events (event_type, severity, user_id, user_email, description, metadata)
VALUES (p_event_type, p_severity, v_user_id, v_user_email, p_description, p_metadata);
END;
$$;


ALTER FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text", "p_description" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_successful_login"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
UPDATE profiles
SET failed_login_attempts = 0,
locked_until = NULL,
last_login_at = now()
WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."record_successful_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_dashboard_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
v_total_records        int;
v_active_employees     int;
v_total_gross          numeric;
v_total_net            numeric;
v_total_mandatory      numeric;
v_total_loan_deds      numeric;
v_processed_count      int;
v_pending_count        int;
v_period_net           numeric;
v_active_loan_accounts int;
v_unassigned_count     int;
v_group_stats          jsonb;
v_ded_totals           jsonb;
v_recent_employees     jsonb;
v_current_period       jsonb;
v_current_period_id    uuid;
BEGIN
SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Active')
INTO v_total_records, v_active_employees
FROM employees;

SELECT
COALESCE(SUM(gross_pay), 0),
COALESCE(SUM(net_pay), 0),
COALESCE(SUM(dedlnr + dedmed + dedpag + dedtax), 0),
COALESCE(SUM(other_deductions), 0),
COUNT(*) FILTER (WHERE status = 'Posted'),
COUNT(*) FILTER (WHERE status = 'Computed')
INTO v_total_gross, v_total_net, v_total_mandatory, v_total_loan_deds,
v_processed_count, v_pending_count
FROM payroll_entries;

SELECT id, to_jsonb(p)
INTO v_current_period_id, v_current_period
FROM pay_periods p
ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
LIMIT 1;

SELECT COALESCE(SUM(net_pay), 0)
INTO v_period_net
FROM payroll_entries
WHERE pay_period_id = v_current_period_id;

SELECT COUNT(*)
INTO v_active_loan_accounts
FROM payroll_deductions
WHERE type = 'Loan' AND status = 'Active';

SELECT COALESCE(json_agg(json_build_object(
'id', g.id, 'group_code', g.group_code, 'group_name', g.group_name,
'stacode_min', g.stacode_min, 'stacode_max', g.stacode_max,
'count', (
SELECT COUNT(*) FROM employees e
WHERE e.status = 'Active'
AND e.stacode ~ '^[0-9]+$'
AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
)
) ORDER BY g.stacode_min)::jsonb, '[]')
INTO v_group_stats
FROM payroll_groups g
WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL;

SELECT COUNT(*)
INTO v_unassigned_count
FROM employees e
WHERE e.status = 'Active'
AND NOT EXISTS (
SELECT 1 FROM payroll_groups g
WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
AND e.stacode ~ '^[0-9]+$'
AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
);

SELECT COALESCE(jsonb_agg(row ORDER BY row->>'total' DESC), '[]')
INTO v_ded_totals
FROM (
SELECT jsonb_build_object(
'code', pd.dedcode,
'name', COALESCE(dc.dedname, pd.dedcode),
'count', COUNT(*),
'total', SUM(pd.dedamt)
) AS row
FROM payroll_deductions pd
LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
WHERE pd.status = 'Active'
GROUP BY pd.dedcode, dc.dedname
ORDER BY SUM(pd.dedamt) DESC
LIMIT 8
) sub;

SELECT COALESCE(jsonb_agg(jsonb_build_object(
'id', e.id, 'empno', e.empno, 'employee_number', e.employee_number,
'fname', e.fname, 'first_name', e.first_name,
'lname', e.lname, 'last_name', e.last_name,
'poscode', e.poscode, 'position', e.position,
'regcode', e.regcode, 'basic', e.basic, 'basic_salary', e.basic_salary
)), '[]')
INTO v_recent_employees
FROM (SELECT * FROM employees ORDER BY created_at DESC LIMIT 5) e;

INSERT INTO dashboard_stats_cache (
id, total_records, active_employees, total_gross, total_net,
total_mandatory, total_loan_deds, processed_count, pending_count,
period_net, active_loan_accounts, unassigned_count,
group_stats, ded_totals_by_code, recent_employees, current_period, refreshed_at
) VALUES (
1, v_total_records, v_active_employees, v_total_gross, v_total_net,
v_total_mandatory, v_total_loan_deds, v_processed_count, v_pending_count,
v_period_net, v_active_loan_accounts, v_unassigned_count,
v_group_stats, v_ded_totals, v_recent_employees, v_current_period, now()
)
ON CONFLICT (id) DO UPDATE SET
total_records        = EXCLUDED.total_records,
active_employees     = EXCLUDED.active_employees,
total_gross          = EXCLUDED.total_gross,
total_net            = EXCLUDED.total_net,
total_mandatory      = EXCLUDED.total_mandatory,
total_loan_deds      = EXCLUDED.total_loan_deds,
processed_count      = EXCLUDED.processed_count,
pending_count        = EXCLUDED.pending_count,
period_net           = EXCLUDED.period_net,
active_loan_accounts = EXCLUDED.active_loan_accounts,
unassigned_count     = EXCLUDED.unassigned_count,
group_stats          = EXCLUDED.group_stats,
ded_totals_by_code   = EXCLUDED.ded_totals_by_code,
recent_employees     = EXCLUDED.recent_employees,
current_period       = EXCLUDED.current_period,
refreshed_at         = EXCLUDED.refreshed_at;
END;
$_$;


ALTER FUNCTION "public"."refresh_dashboard_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
caller_role text;
caller_id uuid;
target_email text;
BEGIN
SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
RAISE EXCEPTION 'Only super administrators can reject users';
END IF;
IF p_reason IS NULL OR btrim(p_reason) = '' THEN
RAISE EXCEPTION 'Rejection reason is required';
END IF;

caller_id := auth.uid();

UPDATE profiles
SET status = 'rejected',
rejection_reason = p_reason,
rejected_by = caller_id,
rejected_at = now()
WHERE id = p_target_user
AND status IN ('pending_approval', 'approved')
RETURNING email INTO target_email;

IF target_email IS NULL THEN
RAISE EXCEPTION 'User not found or not in a rejectable state';
END IF;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
'user_rejected', 'profiles', p_target_user::text,
jsonb_build_object('rejected_email', target_email, 'reason', p_reason));

RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


ALTER FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_dashboard_refresh"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT refresh_dashboard_cache(); $$;


ALTER FUNCTION "public"."request_dashboard_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_entry_count integer;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period reversal (requires a closed period).
    IF v_period_status <> 'closed' THEN
      RAISE EXCEPTION 'Pay period is not posted — nothing to reverse';
    END IF;
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped reversal: un-post only the given employees' entries and
    -- leave the shared period status untouched (other divisions may still be
    -- working on the same period).
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No posted entries to reverse for the selected division';
    END IF;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_entry_count);
END;
$$;


ALTER FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_reversed int;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  UPDATE payroll_entries
    SET status = 'Computed'
    WHERE pay_period_id = p_pay_period_id AND status = 'Posted';
  GET DIAGNOSTICS v_reversed = ROW_COUNT;

  -- A closed (fully posted) period is reopened so it can be edited/run again.
  IF v_period_status = 'closed' THEN
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_reversed, 'whole_period', true)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_reversed);
END;
$$;


ALTER FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_payroll_engine"("p_pay_period_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_payyy int;
  v_paymm int;
  v_payym int;
  v_unassigned int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_ded_lines_written int := 0;
  v_unded_total numeric := 0;
  v_rowcount int;
  r_emp record;
  v_basic numeric; v_pera numeric; v_long numeric;
  v_gross numeric; v_dedlnr numeric; v_dedmed numeric; v_dedpag numeric; v_dedtax numeric;
  v_govtlnr numeric; v_govtecc numeric; v_govtmed numeric; v_govtpag numeric;
  v_taxable numeric; v_mandatory numeric; v_available numeric;
  v_deds jsonb;
  v_sorted jsonb;
  v_mandatory_loans numeric;
  v_loan_lines jsonb;
  v_nthp jsonb;
  v_entry_id uuid;
  v_actual_total numeric;
  v_unded_amount numeric;
  v_paydate timestamptz;
BEGIN
  -- Large runs exceed the caller's (30s) statement_timeout — give this engine
  -- room to finish. Bounded so a genuinely stuck run still aborts.
  SET LOCAL statement_timeout = '10 min';

  SELECT lower(btrim(role)) INTO v_caller_role
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'payroll_officer', 'hr_administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period.status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is closed';
  END IF;

  -- Division scope (same clamp as run_payroll_bulk / post_payroll)
  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees WHERE status = 'Active';
  ELSE
    SELECT array_agg(e.id) INTO v_employee_ids
    FROM employees e
    JOIN profiles p ON p.id = auth.uid()
    LEFT JOIN divisions d ON d.id = p.division_id
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE (
      e.division_id = p.division_id
      OR (
        r.region_code IS NOT NULL AND d.division_code IS NOT NULL
        AND e.regcode = r.region_code AND e.divcode = d.division_code AND e.status = 'Active'
      )
    );
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees found in your division scope';
  END IF;

  -- Never clear already-posted entries for this period
  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries; reverse the posted pay period first';
  END IF;

  -- STACODE validation (same gate as the client's Unassigned STACODE check)
  SELECT count(*) INTO v_unassigned
  FROM employees e
  WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
    AND (
      e.stacode IS NULL
      OR btrim(e.stacode) = ''
      OR e.stacode !~ '^[0-9]+$'
      OR NOT EXISTS (
        SELECT 1 FROM payroll_groups g
        WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
          AND (CASE WHEN e.stacode ~ '^[0-9]+$' THEN e.stacode::int BETWEEN g.stacode_min AND g.stacode_max ELSE false END)
      )
    );
  IF v_unassigned > 0 THEN
    RAISE EXCEPTION 'Cannot generate payroll: % employee(s) have invalid or unassigned STACODE. Please fix their STACODE or review the Unassigned STACODE Report before running payroll.', v_unassigned;
  END IF;

  v_payyy := v_period.year;
  v_paymm := v_period.month;
  v_paydate := v_period.pay_date;

  -- Pay period key for deduction effectivity filtering
  v_payym := (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm;

  -- Pre-load active deductions once (effectivity depends only on the pay
  -- period), so the per-employee loop is an indexed temp-table probe instead
  -- of a correlated payroll_deductions query per employee.
  CREATE TEMP TABLE _active_deds ON COMMIT DROP AS
  SELECT
    e.id AS emp_id,
    d.dedcode,
    round(COALESCE(d.dedamt, 0), 2) AS dedamt,
    COALESCE(d.effyy, 0) AS effyy,
    COALESCE(d.effmm, 0) AS effmm,
    COALESCE(c.agency, '') AS agency,
    COALESCE(c.type, '') AS type,
    COALESCE(c.dedname, d.dedcode) AS dedname
  FROM payroll_deductions d
  LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
  JOIN employees e ON (d.employee_id IS NOT NULL AND e.id = d.employee_id)
                   OR (d.employee_id IS NULL
                       AND btrim(COALESCE(d.empno, '')) = btrim(COALESCE(e.empno, e.employee_number, ''))
                       AND btrim(COALESCE(e.empno, e.employee_number, '')) <> '')
  WHERE e.id = ANY(v_employee_ids)
    AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
    AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= v_payym
    AND NOT (
      COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
      AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < v_payym
    );
  CREATE INDEX _active_deds_emp_idx ON _active_deds (emp_id);

  -- Suppress per-row audit + per-statement dashboard refreshes for this run
  PERFORM set_config('app.skip_audit', 'on', true);

  -- 1) Clear this division's previous computed entries, undeducted rows and
  --    run/INCLUDED-derived itemized deduction lines (manual lines are kept)
  DELETE FROM undeducted_obligations
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  DELETE FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM deductions
  WHERE pay_period_id = p_pay_period_id
    AND employee_id = ANY(v_employee_ids)
    AND source IN ('Payroll Run', 'INCLUDED');

  -- 2) Compute every employee's entry
  FOR r_emp IN
    SELECT e.id,
           btrim(COALESCE(e.empno, e.employee_number, '')) AS empno,
           round(COALESCE(COALESCE(e.basic, e.basic_salary), 0), 2) AS basic,
           round(COALESCE(e.pera, 0), 2) AS pera,
           round(COALESCE(e.long, 0), 2) AS long,
           COALESCE(e.stacode, '') AS stacode
    FROM employees e
    WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
    ORDER BY e.id
  LOOP
    v_basic := r_emp.basic;
    v_pera := r_emp.pera;
    v_long := r_emp.long;

    -- STEP 1 — gross
    v_gross := round(v_basic + v_pera + v_long, 2);

    -- STEP 2 — statutory mandatory deductions
    v_dedlnr := round(v_basic * 0.09, 2);
    v_dedmed := round(v_basic * 0.0249998422961678, 2);
    v_dedpag := 200;
    v_govtlnr := round(v_basic * 0.12, 2);
    v_govtecc := 100;
    v_govtmed := round(v_basic * 0.0250001577038322, 2);
    v_govtpag := 200;
    v_taxable := greatest(0, v_basic - v_dedlnr - v_dedmed - v_dedpag);
    v_dedtax := round(CASE
      WHEN v_taxable <= 20833 THEN 0
      WHEN v_taxable <= 33333 THEN (v_taxable - 20833) * 0.15
      WHEN v_taxable <= 66667 THEN 1875 + (v_taxable - 33333) * 0.20
      WHEN v_taxable <= 166667 THEN 8541.67 + (v_taxable - 66667) * 0.25
      WHEN v_taxable <= 666667 THEN 33541.67 + (v_taxable - 166667) * 0.30
      ELSE 183541.67 + (v_taxable - 666667) * 0.35
    END, 2);
    v_mandatory := round(v_dedlnr + v_dedmed + v_dedpag + v_dedtax, 2);
    v_available := round(v_gross - v_mandatory, 2);

    -- active deductions for this employee (pre-loaded temp-table lookup)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', d.dedamt,
             'effyy', d.effyy,
             'effmm', d.effmm,
             'agency', d.agency,
             'type', d.type,
             'dedname', d.dedname
           )), '[]'::jsonb)
    INTO v_deds
    FROM _active_deds d
    WHERE d.emp_id = r_emp.id;

    -- mandatory loans total + their lines (deducted unconditionally)
    SELECT COALESCE(sum(round(COALESCE((x->>'dedamt')::numeric, 0), 2)), 0)
    INTO v_mandatory_loans
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', x->>'dedcode',
             'dedname', COALESCE(x->>'dedname', x->>'dedcode'),
             'dedamt', round(COALESCE((x->>'dedamt')::numeric, 0), 2)
           )), '[]'::jsonb)
    INTO v_loan_lines
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    -- APDS deductions sorted by priority, then FIFO (effective date), then code
    SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_sorted
    FROM (
      SELECT jsonb_build_object(
        'dedcode', x.dedcode,
        'dedamt', x.dedamt,
        'agency', x.agency,
        'type', x.type,
        'dedname', x.dedname
      ) AS j
      FROM jsonb_to_recordset(v_deds) AS x(
        dedcode text, dedamt numeric, effyy int, effmm int,
        agency text, type text, dedname text
      )
      WHERE NOT _pd_mandatory(x.agency, x.type)
        AND NOT _pd_mandatory_loan(x.agency, x.type)
      ORDER BY
        _pd_priority(x.agency, x.type, x.dedcode),
        ((CASE WHEN x.effyy < 100 THEN 2000 + x.effyy ELSE x.effyy END) * 100 + x.effmm),
        x.dedcode
    ) s;

    v_nthp := public._pd_compute(v_available, v_sorted, v_mandatory_loans, r_emp.stacode);

    v_entry_id := gen_random_uuid();
    v_actual_total := round(
      COALESCE((v_nthp->>'actualLoanDeductions')::numeric, 0)
      + COALESCE((v_nthp->>'mandatoryLoanDeductions')::numeric, 0), 2);
    v_unded_amount := 0;
    SELECT COALESCE(sum(round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2)), 0)
    INTO v_unded_amount
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    v_unded_total := round(v_unded_total + v_unded_amount, 2);

    -- entry row
    INSERT INTO payroll_entries (
      id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
      status, processed_at, dedlnr, dedmed, dedpag, dedtax,
      govtlnr, govtecc, govtmed, govtpag,
      other_deductions, nthp_status, undeducted_amount, actual_loan_deductions,
      available_balance, mandatory_deductions, loan_deduction_capacity
    ) VALUES (
      v_entry_id, r_emp.id, p_pay_period_id,
      v_gross,
      round(v_mandatory + v_actual_total, 2),
      round((v_nthp->>'finalNetPay')::numeric, 2),
      'Computed', now(),
      v_dedlnr, v_dedmed, v_dedpag, v_dedtax,
      v_govtlnr, v_govtecc, v_govtmed, v_govtpag,
      v_actual_total,
      v_nthp->>'nthpStatus',
      v_unded_amount,
      v_actual_total,
      round((v_nthp->>'availableBalance')::numeric, 2),
      v_mandatory,
      round((v_nthp->>'loanDeductionCapacity')::numeric, 2)
    );
    v_inserted := v_inserted + 1;

    -- undeducted obligations for this employee
    INSERT INTO undeducted_obligations (
      payroll_entry_id, employee_id, pay_period_id,
      deduction_code, deduction_description,
      undeducted_amount, scheduled_amount, station_code, reason
    )
    SELECT
      v_entry_id, r_emp.id, p_pay_period_id,
      u->>'deduction_code',
      u->>'deduction_description',
      round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2),
      round(COALESCE((u->>'scheduled_amount')::numeric, 0), 2),
      COALESCE(u->>'station_code', ''),
      u->>'reason'
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_unded_written := v_unded_written + v_rowcount;

    -- 2b) Materialize the itemized deduction lines for this employee —
    --     statutory mandatory lines, mandatory loan lines, then the APDS
    --     loans actually deducted (FIFO stored order). created_at is
    --     stamped monotonically so the report engine renders them in
    --     exactly this sequence (FOXPRO: no sorting on render).
    INSERT INTO deductions (
      employee_id, pay_period_id, deduction_code, deduction_name, category,
      amount, source, reference, created_at
    )
    SELECT
      r_emp.id, p_pay_period_id, x.dedcode, x.dedname, x.category,
      round(x.amount, 2), 'Payroll Run', v_entry_id::text,
      now() + (x.ord * interval '1 microsecond')
    FROM (
      SELECT '0003' AS dedcode, 'GSIS PERSONAL SHARE' AS dedname, 'Mandatory' AS category, v_dedlnr AS amount, 1 AS ord
      UNION ALL SELECT '0036', 'WITHHOLDING TAX', 'Mandatory', v_dedtax, 2
      UNION ALL SELECT '0111', 'PHILHEALTH', 'Mandatory', v_dedmed, 3
      UNION ALL SELECT '0222', 'PAGIBIG FUND', 'Mandatory', v_dedpag, 4
      UNION ALL SELECT m->>'dedcode', COALESCE(m->>'dedname', m->>'dedcode'), 'Loan',
                    round(COALESCE((m->>'dedamt')::numeric, 0), 2), 5
               FROM jsonb_array_elements(v_loan_lines) m
      UNION ALL SELECT d->>'dedcode', COALESCE(d->>'dedname', d->>'dedcode'), 'Loan',
                    round(COALESCE((d->>'dedamt')::numeric, 0), 2), 6
               FROM jsonb_array_elements(COALESCE(v_nthp->'deducted', '[]'::jsonb)) d
    ) x
    WHERE x.amount > 0
    ORDER BY x.ord;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_ded_lines_written := v_ded_lines_written + v_rowcount;

    -- employee summary fields
    UPDATE employees e SET
      dedlnr = v_dedlnr, dedmed = v_dedmed, dedpag = v_dedpag, dedtax = v_dedtax,
      govtlnr = v_govtlnr, govtecc = v_govtecc, govtmed = v_govtmed, govtpag = v_govtpag,
      netpay = round((v_nthp->>'finalNetPay')::numeric, 2),
      paydate = v_paydate
    WHERE e.id = r_emp.id;
    v_updated := v_updated + 1;
  END LOOP;

  -- 3) Open the period
  UPDATE pay_periods SET status = 'open' WHERE id = p_pay_period_id;

  -- 4) Refresh the dashboard once + single summary audit row
  PERFORM refresh_dashboard_cache();
  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_generate', 'pay_period', p_pay_period_id::text,
         jsonb_build_object(
           'entries', v_inserted,
           'employees_updated', v_updated,
           'undeducted', v_unded_written,
           'deduction_lines', v_ded_lines_written,
           'deleted', v_deleted,
           'engine', 'run_payroll_engine'
         )
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_updated', v_updated,
    'undeducted', v_unded_written,
    'deduction_lines', v_ded_lines_written,
    'deleted', v_deleted,
    'undeducted_amount', v_unded_total
  );
END;
$_$;


ALTER FUNCTION "public"."run_payroll_engine"("p_pay_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Payroll Administrators may only assign schools to school-scoped accounts
  -- (School Head / School Payroll Coordinator).
  IF v_caller_role = 'payroll_admin'
     AND v_target_role NOT IN ('school_coordinator', 'school_head') THEN
    RAISE EXCEPTION 'Payroll Administrators can only assign a school to School Head and School Payroll Coordinator accounts';
  END IF;

  UPDATE profiles SET assigned_stacode = NULLIF(btrim(p_stacode), '') WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_stacode_assignment', 'profile', p_target_user,
  jsonb_build_object('assigned_stacode', p_stacode)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_user_id uuid; v_hash text;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
IF p_signature_phrase IS NULL OR length(p_signature_phrase) < 4 THEN RAISE EXCEPTION 'Signature phrase must be at least 4 characters'; END IF;
v_hash := encode(digest(p_signature_phrase || v_user_id::text, 'sha256'), 'hex');
UPDATE profiles SET digital_signature_hash = v_hash, signature_phrase = p_signature_phrase, signature_set_at = now() WHERE id = v_user_id;
RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_caller_role text;
v_old_emp_no text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
RAISE EXCEPTION 'Not authorized';
END IF;

SELECT employee_number INTO v_old_emp_no FROM profiles WHERE id = p_target_user;

UPDATE profiles
SET employee_number = NULLIF(btrim(p_employee_number), '')
WHERE id = p_target_user;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
SELECT auth.uid(), u.email, 'user_employee_number_change', 'profile', p_target_user,
jsonb_build_object('old_employee_number', v_old_emp_no, 'new_employee_number', NULLIF(btrim(p_employee_number), ''))
FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_payroll_def_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_payroll_def_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_division"("p_target_user" "uuid", "p_region_id" "uuid" DEFAULT NULL::"uuid", "p_division_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign regions and divisions';
  END IF;

  UPDATE profiles
    SET region_id = p_region_id,
        division_id = p_division_id,
        updated_at = now()
    WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'user_division_change', 'profiles', p_target_user::text,
    jsonb_build_object('region_id', p_region_id, 'division_id', p_division_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."set_user_division"("p_target_user" "uuid", "p_region_id" "uuid", "p_division_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_caller_role text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
RAISE EXCEPTION 'Not authorized';
END IF;

IF p_target_user = auth.uid() THEN
RAISE EXCEPTION 'Cannot toggle your own MFA';
END IF;

UPDATE profiles SET mfa_enabled = p_enabled WHERE id = p_target_user;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
SELECT auth.uid(), u.email, 'user_mfa_toggle', 'profile', p_target_user,
jsonb_build_object('mfa_enabled', p_enabled)
FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_caller_role text;
v_target_current_role text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
RAISE EXCEPTION 'Not authorized';
END IF;

IF p_new_role NOT IN (
'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
'school_head', 'ess', 'read_only'
) THEN
RAISE EXCEPTION 'Invalid role';
END IF;

SELECT role INTO v_target_current_role FROM profiles WHERE id = p_target_user;
IF v_target_current_role IS NULL THEN
RAISE EXCEPTION 'User not found';
END IF;

IF p_target_user = auth.uid() AND p_new_role != 'super_admin' THEN
RAISE EXCEPTION 'Cannot demote yourself';
END IF;

UPDATE profiles SET role = p_new_role WHERE id = p_target_user;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
SELECT auth.uid(), u.email, 'user_role_change', 'profile', p_target_user,
jsonb_build_object('old_role', v_target_current_role, 'new_role', p_new_role)
FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_division_codes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_division_id uuid;
  v_regcode text;
  v_divcode text;
BEGIN
  SELECT division_id INTO v_division_id
    FROM profiles
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_division_id IS NOT NULL THEN
    SELECT r.region_code, d.division_code
      INTO v_regcode, v_divcode
      FROM divisions d
      LEFT JOIN regions r ON r.id = d.region_id
     WHERE d.id = v_division_id
     LIMIT 1;

    IF v_regcode IS NOT NULL THEN
      NEW.regcode := COALESCE(NEW.regcode, v_regcode);
      NEW.divcode := COALESCE(NEW.divcode, v_divcode);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."stamp_division_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_email_verified_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
       SET email_verified = true
     WHERE id = NEW.id AND email_verified = false;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_email_verified_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_employees_to_division"("p_division_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_updated int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign employees';
  END IF;

  UPDATE employees e
    SET division_id = p_division_id
    FROM schools s
    WHERE s.division_id = p_division_id
      AND s.school_code = e.stacode
      AND (e.division_id IS DISTINCT FROM p_division_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_employees_synced', 'divisions', p_division_id::text,
    jsonb_build_object('employee_count', v_updated));

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;


ALTER FUNCTION "public"."sync_employees_to_division"("p_division_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
NEW.updated_at := now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_caller_role text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
RAISE EXCEPTION 'Not authorized';
END IF;

UPDATE profiles
SET failed_login_attempts = 0, locked_until = NULL
WHERE id = p_target_user;

INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
SELECT auth.uid(), u.email, 'user_account_unlock', 'profile', p_target_user, NULL
FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_schools_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_schools_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_division"("p_division_id" "uuid" DEFAULT NULL::"uuid", "p_region_id" "uuid" DEFAULT NULL::"uuid", "p_region_code" "text" DEFAULT NULL::"text", "p_division_code" "text" DEFAULT NULL::"text", "p_division_name" "text" DEFAULT NULL::"text", "p_features" "jsonb" DEFAULT NULL::"jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_id uuid;
  v_region_id uuid;
  v_region_code text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;

  -- ── Resolve the region ───────────────────────────────────────────────────
  -- 1. By id (fast path — the app normally holds the real id).
  IF p_region_id IS NOT NULL AND EXISTS (SELECT 1 FROM regions WHERE id = p_region_id) THEN
    v_region_id := p_region_id;
    SELECT region_code INTO v_region_code FROM regions WHERE id = v_region_id;
  ELSE
    -- 2. By code (heals id drift — e.g. migrations re-created the table and
    --    generated fresh UUIDs while the app still holds the old id).
    v_region_code := upper(trim(COALESCE(p_region_code, '')));
    IF v_region_code <> '' THEN
      SELECT id INTO v_region_id FROM regions
      WHERE region_code = v_region_code
      ORDER BY sort_order, created_at
      LIMIT 1;
    END IF;

    -- 3. If the code matches, adopt the canonical id so the app and DB agree
    --    from here on. If nothing matches, fail with a clear message.
    IF v_region_id IS NULL THEN
      RAISE EXCEPTION 'Region not found (id: %, code: %). Create the region first, or refresh the page to reload the regions list.',
        COALESCE(p_region_id::text, '-'), COALESCE(v_region_code, '-');
    END IF;
  END IF;

  IF v_region_id IS NULL THEN
    RAISE EXCEPTION 'Region is required';
  END IF;

  -- ── Insert / update the division under the resolved region ──────────────
  INSERT INTO divisions (id, region_id, division_code, division_name, features)
  VALUES (
    COALESCE(p_division_id, gen_random_uuid()),
    v_region_id,
    upper(trim(COALESCE(p_division_code, ''))),
    trim(COALESCE(p_division_name, '')),
    COALESCE(p_features, '{}'::jsonb)
  )
  ON CONFLICT (division_code) DO UPDATE SET
    region_id = EXCLUDED.region_id,
    division_name = EXCLUDED.division_name,
    features = EXCLUDED.features,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'division_upsert', 'divisions', v_id::text,
    jsonb_build_object(
      'code', upper(trim(COALESCE(p_division_code, ''))),
      'name', trim(COALESCE(p_division_name, '')),
      'region_id', v_region_id,
      'region_code', v_region_code
    )
  );

  RETURN jsonb_build_object('success', true, 'id', v_id, 'region_id', v_region_id);
END;
$$;


ALTER FUNCTION "public"."upsert_division"("p_division_id" "uuid", "p_region_id" "uuid", "p_region_code" "text", "p_division_code" "text", "p_division_name" "text", "p_features" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_region"("p_region_id" "uuid" DEFAULT NULL::"uuid", "p_region_code" "text" DEFAULT NULL::"text", "p_region_name" "text" DEFAULT NULL::"text", "p_sort_order" integer DEFAULT 0) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  INSERT INTO regions (id, region_code, region_name, sort_order)
  VALUES (
    COALESCE(p_region_id, gen_random_uuid()),
    upper(trim(COALESCE(p_region_code, ''))),
    trim(COALESCE(p_region_name, '')),
    COALESCE(p_sort_order, 0)
  )
  ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'region_upsert', 'regions', v_id::text,
    jsonb_build_object('code', upper(trim(COALESCE(p_region_code, ''))), 'name', trim(COALESCE(p_region_name, '')))
  );

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;


ALTER FUNCTION "public"."upsert_region"("p_region_id" "uuid", "p_region_code" "text", "p_region_name" "text", "p_sort_order" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Never allow locking the system out.
  IF p_role = 'super_admin' AND p_permission = 'user_management' AND p_granted = false THEN
    RAISE EXCEPTION 'The super_admin role must always have user_management access';
  END IF;

  INSERT INTO public.role_permissions (role, permission, granted, updated_by, updated_at)
  VALUES (p_role, p_permission, p_granted, auth.uid(), now())
  ON CONFLICT (role, permission)
  DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = now();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
         jsonb_build_object('role', p_role, 'permission', p_permission, 'granted', p_granted)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
emp_record record;
stacode_num int;
group_exists boolean;
BEGIN
IF p_employee_number IS NULL OR btrim(p_employee_number) = '' THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Employee number is required');
END IF;

SELECT employee_number, status, stacode, first_name, last_name
INTO emp_record
FROM employees
WHERE employee_number = btrim(p_employee_number)
LIMIT 1;

IF NOT FOUND THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Employee number not found in Masterfile');
END IF;

IF emp_record.status IS NULL OR emp_record.status <> 'Active' THEN
RETURN jsonb_build_object('valid', false, 'reason',
'Employee status is not Active (current: ' || COALESCE(emp_record.status, 'NULL') || ')');
END IF;

IF emp_record.stacode IS NULL OR btrim(emp_record.stacode) = '' OR NOT (btrim(emp_record.stacode) ~ '^[0-9]+$') THEN
RETURN jsonb_build_object('valid', false, 'reason', 'STACODE is missing or invalid');
END IF;

stacode_num := CAST(btrim(emp_record.stacode) AS int);

SELECT EXISTS(
SELECT 1 FROM payroll_groups
WHERE status = 'Active'
AND stacode_min IS NOT NULL
AND stacode_max IS NOT NULL
AND stacode_num >= stacode_min
AND stacode_num <= stacode_max
) INTO group_exists;

IF NOT group_exists THEN
RETURN jsonb_build_object('valid', false, 'reason',
'STACODE ' || stacode_num || ' does not belong to any active payroll group');
END IF;

RETURN jsonb_build_object(
'valid', true,
'employee_name', emp_record.first_name || ' ' || emp_record.last_name,
'stacode', emp_record.stacode,
'status', emp_record.status
);
END;
$_$;


ALTER FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_nthp_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
NEW.nthp_compliant := NEW.net_pay >= 5000;
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_nthp_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
v_user_id uuid;
v_otp record;
v_claimed integer;
BEGIN
SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
IF v_user_id IS NULL THEN
RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
END IF;

SELECT * INTO v_otp
FROM otp_codes
WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false
ORDER BY created_at DESC
LIMIT 1
FOR UPDATE;

IF v_otp.id IS NULL OR v_otp.expires_at < now() THEN
RETURN jsonb_build_object('ok', false, 'reason', 'expired');
END IF;

IF v_otp.attempts >= v_otp.max_attempts THEN
UPDATE otp_codes SET used = true WHERE id = v_otp.id;
RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
END IF;

IF crypt(p_code, v_otp.code_hash) <> v_otp.code_hash THEN
UPDATE otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
RETURN jsonb_build_object(
'ok', false,
'reason', 'invalid_code',
'remaining', v_otp.max_attempts - (v_otp.attempts + 1)
);
END IF;

UPDATE otp_codes SET used = true WHERE id = v_otp.id AND used = false;
GET DIAGNOSTICS v_claimed = ROW_COUNT;
IF v_claimed = 0 THEN
RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
END IF;

RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pgcrypto'
    AS $$
BEGIN
RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$$;


ALTER FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "employee_number" "text",
    "stacode" "text",
    "attendance_date" "date" NOT NULL,
    "time_in" timestamp with time zone,
    "time_out" timestamp with time zone,
    "hours_worked" numeric(5,2) DEFAULT 0,
    "overtime_hours" numeric(5,2) DEFAULT 0,
    "status" "text" DEFAULT 'present'::"text",
    "remarks" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "action" "text" NOT NULL,
    "record_type" "text",
    "record_id" "text",
    "details" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regcode" "text",
    "divcode" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ca_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_no" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_initial" "text" DEFAULT ''::"text",
    "position_title" "text" DEFAULT ''::"text",
    "school_name" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "ca_employees_category_check" CHECK (("category" = ANY (ARRAY[''::"text", 'Division Office'::"text", 'Elementary'::"text", 'Secondary'::"text", 'LBA & LSA Teachers'::"text", 'Utility Workers'::"text", 'Without ATM'::"text", 'Separated Employees'::"text", 'Non-Plantilla'::"text"]))),
    CONSTRAINT "ca_employees_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text"])))
);


ALTER TABLE "public"."ca_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ca_payroll_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "line_no" integer DEFAULT 0 NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "deduction" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_amount_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "signature_image" "text",
    "remarks" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ca_payroll_details_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "ca_payroll_details_deduction_check" CHECK (("deduction" >= (0)::numeric))
);


ALTER TABLE "public"."ca_payroll_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ca_payroll_headers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_no" "text" NOT NULL,
    "payroll_type" "text" DEFAULT 'Communication Allowance'::"text" NOT NULL,
    "payroll_title" "text" DEFAULT 'Communication Allowance'::"text" NOT NULL,
    "agency" "text" DEFAULT 'Department of Education'::"text" NOT NULL,
    "division" "text" DEFAULT 'Division of Calamba City'::"text" NOT NULL,
    "school_name" "text" DEFAULT ''::"text" NOT NULL,
    "covered_period" "text" DEFAULT ''::"text" NOT NULL,
    "total_employees" integer DEFAULT 0 NOT NULL,
    "gross_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "alobs_no" "text" DEFAULT ''::"text",
    "jev_no" "text" DEFAULT ''::"text",
    "date" "date",
    "payroll_ref_no" "text" DEFAULT ''::"text",
    "remarks" "text" DEFAULT ''::"text",
    "created_by" "text" DEFAULT ''::"text" NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eo_no" "text" DEFAULT ''::"text",
    CONSTRAINT "ca_payroll_headers_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Generated'::"text", 'Reviewed'::"text", 'Approved'::"text", 'Posted'::"text", 'Paid'::"text", 'Archived'::"text"])))
);


ALTER TABLE "public"."ca_payroll_headers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ca_payroll_signatories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_id" "uuid" NOT NULL,
    "signatory_type" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text",
    "position" "text" DEFAULT ''::"text",
    "sequence_no" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ca_payroll_signatories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_stats_cache" (
    "id" integer DEFAULT 1 NOT NULL,
    "total_records" integer DEFAULT 0 NOT NULL,
    "active_employees" integer DEFAULT 0 NOT NULL,
    "total_gross" numeric DEFAULT 0 NOT NULL,
    "total_net" numeric DEFAULT 0 NOT NULL,
    "total_mandatory" numeric DEFAULT 0 NOT NULL,
    "total_loan_deds" numeric DEFAULT 0 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "pending_count" integer DEFAULT 0 NOT NULL,
    "period_net" numeric DEFAULT 0 NOT NULL,
    "active_loan_accounts" integer DEFAULT 0 NOT NULL,
    "unassigned_count" integer DEFAULT 0 NOT NULL,
    "group_stats" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ded_totals_by_code" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recent_employees" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_period" "jsonb",
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dashboard_stats_cache_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."dashboard_stats_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_divtable" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "divcode" "text" NOT NULL,
    "divname" "text" DEFAULT ''::"text" NOT NULL,
    "regcode" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "chief" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_divtable" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_excluded" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_excluded" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_included" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_included" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_payrolls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "basic" numeric DEFAULT 0 NOT NULL,
    "trans" numeric DEFAULT 0 NOT NULL,
    "pera" numeric DEFAULT 0 NOT NULL,
    "gross" numeric DEFAULT 0 NOT NULL,
    "dedlnr" numeric DEFAULT 0 NOT NULL,
    "dedmed" numeric DEFAULT 0 NOT NULL,
    "dedtax" numeric DEFAULT 0 NOT NULL,
    "dedpag" numeric DEFAULT 0 NOT NULL,
    "totded" numeric DEFAULT 0 NOT NULL,
    "netpay" numeric DEFAULT 0 NOT NULL,
    "paydate" "date",
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_payrolls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_pyent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "itemcode" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_pyent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_pyent1" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "itemcode" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_pyent1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_pyent2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empno" "text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "itemcode" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_pyent2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_restore_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "checksum" "text",
    "dbf_version" smallint,
    "header_size" smallint,
    "record_size" smallint,
    "field_count" smallint,
    "record_count" integer DEFAULT 0 NOT NULL,
    "code_page" smallint,
    "sidecar_files" "jsonb" DEFAULT '[]'::"jsonb",
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "user_email" "text",
    "restored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text"
);


ALTER TABLE "public"."dbf_restore_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_stntable" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stacode" "text" NOT NULL,
    "staname" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "regcode" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "cluster" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "munic" "text" DEFAULT ''::"text" NOT NULL,
    "province" "text" DEFAULT ''::"text" NOT NULL,
    "zipcode" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbf_stntable" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbf_sync_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_label" "text" DEFAULT ''::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "files_uploaded" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "total_inserted" integer DEFAULT 0 NOT NULL,
    "total_updated" integer DEFAULT 0 NOT NULL,
    "total_skipped" integer DEFAULT 0 NOT NULL,
    "total_errors" integer DEFAULT 0 NOT NULL,
    "error_log" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "per_file" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "performed_by" "text",
    "user_id" "uuid",
    "rollback_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_rolled_back" boolean DEFAULT false NOT NULL,
    "category" "text",
    CONSTRAINT "dbf_sync_sessions_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'rolled_back'::"text"])))
);


ALTER TABLE "public"."dbf_sync_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deduction_codes" (
    "dedcode" "text" NOT NULL,
    "type" "text" DEFAULT 'Other'::"text" NOT NULL,
    "agency" "text" DEFAULT 'OTHER'::"text" NOT NULL,
    "dedname" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deduction_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deduction_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deduction_id" "uuid",
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "empno" "text" DEFAULT ''::"text" NOT NULL,
    "dedcode" "text" DEFAULT ''::"text" NOT NULL,
    "policyno" "text" DEFAULT ''::"text" NOT NULL,
    "action" "text" NOT NULL,
    "prev_dedamt" numeric(12,2),
    "new_dedamt" numeric(12,2),
    "prev_status" "text",
    "new_status" "text",
    "prev_principal" numeric(12,2),
    "new_principal" numeric(12,2),
    "prev_interest" numeric(12,2),
    "new_interest" numeric(12,2),
    "prev_charges" numeric(12,2),
    "new_charges" numeric(12,2),
    "changed_by" "text" DEFAULT ''::"text" NOT NULL,
    "payroll_period" "text",
    "source" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deduction_history_action_check" CHECK (("action" = ANY (ARRAY['ADD'::"text", 'UPDATE'::"text", 'TERMINATE'::"text"])))
);


ALTER TABLE "public"."deduction_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "pay_period_id" "uuid" NOT NULL,
    "deduction_code" "text" DEFAULT 'MISC'::"text" NOT NULL,
    "deduction_name" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'Mandatory'::"text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'Manual'::"text",
    "reference" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deductions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "device_fingerprint" "text" NOT NULL,
    "device_name" "text",
    "browser" "text",
    "os" "text",
    "ip_address" "text",
    "user_agent" "text",
    "trusted" boolean DEFAULT false,
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."device_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."division_office" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "division_name" "text" DEFAULT ''::"text" NOT NULL,
    "region" "text" DEFAULT ''::"text",
    "division_code" "text" DEFAULT ''::"text",
    "address" "text" DEFAULT ''::"text",
    "zip_code" "text" DEFAULT ''::"text",
    "contact_number" "text" DEFAULT ''::"text",
    "official_email" "text" DEFAULT ''::"text",
    "website" "text" DEFAULT ''::"text",
    "tin_number" "text" DEFAULT ''::"text",
    "agency_code" "text" DEFAULT ''::"text",
    "uacs_code" "text" DEFAULT ''::"text",
    "sds_name" "text" DEFAULT ''::"text",
    "sds_position" "text" DEFAULT ''::"text",
    "sds_email" "text" DEFAULT ''::"text",
    "sds_contact" "text" DEFAULT ''::"text",
    "sds_signature" "text" DEFAULT ''::"text",
    "sds_effective_date" "date",
    "asds_name" "text" DEFAULT ''::"text",
    "asds_position" "text" DEFAULT ''::"text",
    "asds_email" "text" DEFAULT ''::"text",
    "asds_contact" "text" DEFAULT ''::"text",
    "asds_signature" "text" DEFAULT ''::"text",
    "asds_effective_date" "date",
    "hrmo_name" "text" DEFAULT ''::"text",
    "hrmo_position" "text" DEFAULT ''::"text",
    "hrmo_contact" "text" DEFAULT ''::"text",
    "hrmo_email" "text" DEFAULT ''::"text",
    "hrmo_signature" "text" DEFAULT ''::"text",
    "payroll_officer_name" "text" DEFAULT ''::"text",
    "payroll_officer_position" "text" DEFAULT ''::"text",
    "payroll_officer_contact" "text" DEFAULT ''::"text",
    "payroll_officer_email" "text" DEFAULT ''::"text",
    "payroll_officer_signature" "text" DEFAULT ''::"text",
    "division_logo" "text" DEFAULT ''::"text",
    "show_division_logo" boolean DEFAULT true NOT NULL,
    "show_deped_logo" boolean DEFAULT true NOT NULL,
    "show_sds_name" boolean DEFAULT true NOT NULL,
    "show_payroll_signature" boolean DEFAULT true NOT NULL,
    "show_hrmo_signature" boolean DEFAULT true NOT NULL,
    "show_address" boolean DEFAULT true NOT NULL,
    "show_tin" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "division_id" "uuid"
);


ALTER TABLE "public"."division_office" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "region_id" "uuid" NOT NULL,
    "division_code" "text" NOT NULL,
    "division_name" "text" DEFAULT ''::"text" NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "divisions_division_code_check" CHECK (("division_code" <> ''::"text")),
    CONSTRAINT "divisions_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text"])))
);


ALTER TABLE "public"."divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "pay_period_id" "uuid" NOT NULL,
    "earning_type" "text" DEFAULT 'Basic'::"text" NOT NULL,
    "hours" numeric(8,2) DEFAULT 0,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."earnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_number" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text" DEFAULT ''::"text",
    "position" "text" DEFAULT ''::"text",
    "department" "text" DEFAULT ''::"text",
    "bank_name" "text" DEFAULT ''::"text",
    "bank_account" "text" DEFAULT ''::"text",
    "basic_salary" numeric(14,2) DEFAULT 0 NOT NULL,
    "hourly_rate" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax_status" "text" DEFAULT 'ME1'::"text",
    "sss_number" "text" DEFAULT ''::"text",
    "philhealth_number" "text" DEFAULT ''::"text",
    "pagibig_number" "text" DEFAULT ''::"text",
    "tin" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "hire_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "regcode" "text" DEFAULT ''::"text",
    "divcode" "text" DEFAULT ''::"text",
    "stacode" "text" DEFAULT ''::"text",
    "empno" "text" DEFAULT ''::"text",
    "account" "text" DEFAULT ''::"text",
    "empname" "text" DEFAULT ''::"text",
    "fname" "text" DEFAULT ''::"text",
    "mi" "text" DEFAULT ''::"text",
    "lname" "text" DEFAULT ''::"text",
    "appel" "text" DEFAULT ''::"text",
    "poscode" "text" DEFAULT ''::"text",
    "paymode" "text" DEFAULT 'ATM'::"text",
    "grade" integer DEFAULT 0,
    "step" integer DEFAULT 0,
    "basic" numeric(14,2) DEFAULT 0,
    "trans" numeric(14,2) DEFAULT 0,
    "pera" numeric(14,2) DEFAULT 0,
    "aca" numeric(14,2) DEFAULT 0,
    "rata" numeric(14,2) DEFAULT 0,
    "ontop" numeric(14,2) DEFAULT 0,
    "long" numeric(14,2) DEFAULT 0,
    "clothing" numeric(14,2) DEFAULT 0,
    "cashallow" numeric(14,2) DEFAULT 0,
    "dedlnr" numeric(14,2) DEFAULT 0,
    "dedmed" numeric(14,2) DEFAULT 0,
    "dedtax" numeric(14,2) DEFAULT 0,
    "dedpag" numeric(14,2) DEFAULT 0,
    "netpay" numeric(14,2) DEFAULT 0,
    "govtlnr" numeric(14,2) DEFAULT 0,
    "govtecc" numeric(14,2) DEFAULT 0,
    "govtmed" numeric(14,2) DEFAULT 0,
    "govtpag" numeric(14,2) DEFAULT 0,
    "pagcode" "text" DEFAULT ''::"text",
    "taxcode" "text" DEFAULT 'ME1'::"text",
    "civilstat" "text" DEFAULT ''::"text",
    "attend" "text" DEFAULT ''::"text",
    "sex" "text" DEFAULT ''::"text",
    "exposcode" "text" DEFAULT ''::"text",
    "updcode" "text" DEFAULT ''::"text",
    "gsis_pn" "text" DEFAULT ''::"text",
    "gsis_id" "text" DEFAULT ''::"text",
    "hdmf_id" "text" DEFAULT ''::"text",
    "phic_id" "text" DEFAULT ''::"text",
    "pib" "text" DEFAULT ''::"text",
    "banker" "text" DEFAULT ''::"text",
    "birthdate" "date",
    "update" "date",
    "paydate" "date",
    "hiredate" "date",
    "mid_bonus" numeric(14,2) DEFAULT 0,
    "mid_cash" numeric(14,2) DEFAULT 0,
    "end_bonus" numeric(14,2) DEFAULT 0,
    "end_cash" numeric(14,2) DEFAULT 0,
    "add_bonus" numeric(14,2) DEFAULT 0,
    "taxref" numeric(14,2) DEFAULT 0,
    "special" numeric(14,2) DEFAULT 0,
    "over_wheld" numeric(14,2) DEFAULT 0,
    "exgrade" integer DEFAULT 0,
    "exstep" integer DEFAULT 0,
    "exbasic" numeric(14,2) DEFAULT 0,
    "exlnr" numeric(14,2) DEFAULT 0,
    "exmed" numeric(14,2) DEFAULT 0,
    "expag" numeric(14,2) DEFAULT 0,
    "extax" numeric(14,2) DEFAULT 0,
    "exglnr" numeric(14,2) DEFAULT 0,
    "exgmed" numeric(14,2) DEFAULT 0,
    "exgpag" numeric(14,2) DEFAULT 0,
    "exgecc" numeric(14,2) DEFAULT 0,
    "saldiff" numeric(14,2) DEFAULT 0,
    "lnrdiff" numeric(14,2) DEFAULT 0,
    "meddiff" numeric(14,2) DEFAULT 0,
    "pagdiff" numeric(14,2) DEFAULT 0,
    "taxdiff" numeric(14,2) DEFAULT 0,
    "glnrdiff" numeric(14,2) DEFAULT 0,
    "gmeddiff" numeric(14,2) DEFAULT 0,
    "gpagdiff" numeric(14,2) DEFAULT 0,
    "geccdiff" numeric(14,2) DEFAULT 0,
    "editor" "text" DEFAULT ''::"text",
    "payroll_group_id" "uuid",
    "distcode" "text" DEFAULT ''::"text" NOT NULL,
    "depname1" "text" DEFAULT ''::"text",
    "depname2" "text" DEFAULT ''::"text",
    "depname3" "text" DEFAULT ''::"text",
    "depname4" "text" DEFAULT ''::"text",
    "depdate1" "date",
    "depdate2" "date",
    "depdate3" "date",
    "depdate4" "date",
    "stacode_num" integer GENERATED ALWAYS AS (
CASE
    WHEN ("stacode" ~ '^[0-9]+$'::"text") THEN ("stacode")::integer
    ELSE NULL::integer
END) STORED,
    "payroll_status" "text" DEFAULT 'Regular Payroll'::"text" NOT NULL,
    "req_appointment_validated" boolean DEFAULT false NOT NULL,
    "req_tin_submitted" boolean DEFAULT false NOT NULL,
    "req_philhealth_submitted" boolean DEFAULT false NOT NULL,
    "req_pagibig_submitted" boolean DEFAULT false NOT NULL,
    "req_atm_submitted" boolean DEFAULT false NOT NULL,
    "division_id" "uuid",
    CONSTRAINT "chk_employees_basic" CHECK (("basic" >= (0)::numeric)),
    CONSTRAINT "chk_employees_netpay" CHECK (("netpay" >= (0)::numeric))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gsis_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "text" DEFAULT ''::"text" NOT NULL,
    "uploaded_by_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "filename" "text" DEFAULT ''::"text" NOT NULL,
    "total_records" integer DEFAULT 0 NOT NULL,
    "matched_records" integer DEFAULT 0 NOT NULL,
    "new_deductions" integer DEFAULT 0 NOT NULL,
    "updated_deductions" integer DEFAULT 0 NOT NULL,
    "failed_records" integer DEFAULT 0 NOT NULL,
    "processing_time_ms" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dbf_filename" "text",
    "file_content" "text",
    "remark" "text"
);


ALTER TABLE "public"."gsis_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."initial_payroll_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "date_of_absence" "date" NOT NULL,
    "number_of_days" integer DEFAULT 1 NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."initial_payroll_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."initial_payroll_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "item_no" "text",
    "employee_number" "text",
    "surname" "text",
    "first_name" "text",
    "middle_name" "text",
    "school" "text",
    "position_title" "text",
    "salary_grade" integer,
    "salary_step" integer,
    "monthly_salary" numeric(14,2),
    "days_worked" numeric(5,1) DEFAULT 0 NOT NULL,
    "daily_rate" numeric(14,2) DEFAULT 0 NOT NULL,
    "gross_salary" numeric(14,2) DEFAULT 0 NOT NULL,
    "basic_salary" numeric(14,2) DEFAULT 0 NOT NULL,
    "pera" numeric(14,2) DEFAULT 0 NOT NULL,
    "mid_year_bonus" numeric(14,2) DEFAULT 0 NOT NULL,
    "cash_gift" numeric(14,2) DEFAULT 0 NOT NULL,
    "clothing_allowance" numeric(14,2) DEFAULT 0 NOT NULL,
    "cna_incentive" numeric(14,2) DEFAULT 0 NOT NULL,
    "other_earnings" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_earnings" numeric(14,2) DEFAULT 0 NOT NULL,
    "gsis" numeric(14,2) DEFAULT 0 NOT NULL,
    "philhealth" numeric(14,2) DEFAULT 0 NOT NULL,
    "pagibig" numeric(14,2) DEFAULT 0 NOT NULL,
    "withholding_tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "loans" numeric(14,2) DEFAULT 0 NOT NULL,
    "other_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_pay" numeric(14,2) DEFAULT 0 NOT NULL,
    "tin" "text",
    "philhealth_no" "text",
    "hdmf_no" "text",
    "atm_account_no" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stacode" "text",
    "effectivity_date" "date",
    "calendar_days" numeric(5,1) DEFAULT 22 NOT NULL,
    "additional_adjustments" numeric(14,2) DEFAULT 0 NOT NULL,
    "adjustment_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "annual_income" numeric(14,2) DEFAULT 0 NOT NULL,
    "annual_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "taxable_income" numeric(14,2) DEFAULT 0 NOT NULL,
    "annual_tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "amount_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "school_group" "text",
    "absences" numeric DEFAULT 0 NOT NULL,
    "period_from" "date",
    "period_to" "date"
);


ALTER TABLE "public"."initial_payroll_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."initial_payroll_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_no" "text" NOT NULL,
    "payroll_date" "date",
    "period_from" "date",
    "period_to" "date",
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_gross" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_net" numeric(14,2) DEFAULT 0 NOT NULL,
    "employee_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regcode" "text",
    "divcode" "text"
);


ALTER TABLE "public"."initial_payroll_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."initial_payroll_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "employee_name" "text" NOT NULL,
    "employee_number" "text",
    "transferred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payroll_no" "text",
    "processed_by" "uuid",
    "processed_by_name" "text"
);


ALTER TABLE "public"."initial_payroll_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ips_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "date_of_absence" "date" NOT NULL,
    "number_of_days" integer DEFAULT 1 NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ips_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ips_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text",
    "action" "text" NOT NULL,
    "changed_by" "text",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ips_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ips_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "position" "text",
    "department" "text",
    "employment_status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "salary_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "date_hired" "date",
    "effectivity_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "tin" "text",
    "gsis_number" "text",
    "philhealth_number" "text",
    "pagibig_number" "text",
    "email" "text",
    "contact_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ips_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ips_payroll_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "period_id" "uuid",
    "effectivity_date" "date" NOT NULL,
    "actual_working_days" integer DEFAULT 0 NOT NULL,
    "adjustment" integer DEFAULT 0 NOT NULL,
    "csc_days_present" integer DEFAULT 0 NOT NULL,
    "calendar_days" integer DEFAULT 0 NOT NULL,
    "absences_deducted" integer DEFAULT 0 NOT NULL,
    "final_csc_days_present" integer DEFAULT 0 NOT NULL,
    "gross_salary" numeric(12,2) DEFAULT 0 NOT NULL,
    "pera" numeric(12,2) DEFAULT 0 NOT NULL,
    "gsis" numeric(12,2) DEFAULT 0 NOT NULL,
    "philhealth" numeric(12,2) DEFAULT 0 NOT NULL,
    "pagibig" numeric(12,2) DEFAULT 0 NOT NULL,
    "withholding_tax" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_pay" numeric(12,2) DEFAULT 0 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ips_payroll_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ips_payroll_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_name" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "period_type" "text" DEFAULT '1st'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ips_payroll_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "employee_number" "text",
    "stacode" "text",
    "leave_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "days_count" numeric(5,2) DEFAULT 1,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_by_name" "text",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leave_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "employee_number" "text",
    "stacode" "text",
    "loan_type" "text" NOT NULL,
    "lender_name" "text",
    "principal_amount" numeric(12,2) DEFAULT 0,
    "interest_rate" numeric(5,2) DEFAULT 0,
    "term_months" integer DEFAULT 0,
    "monthly_amortization" numeric(12,2) DEFAULT 0,
    "purpose" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "verified_by" "uuid",
    "verified_by_name" "text",
    "verified_at" timestamp with time zone,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."loan_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loan_request_id" "uuid",
    "employee_number" "text",
    "stacode" "text",
    "verified_by" "uuid",
    "verified_by_name" "text",
    "verification_status" "text" DEFAULT 'verified'::"text" NOT NULL,
    "outstanding_balance" numeric(12,2) DEFAULT 0,
    "monthly_amortization" numeric(12,2) DEFAULT 0,
    "verification_notes" "text",
    "verified_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."loan_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "user_id" "uuid",
    "success" boolean NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "user_id" "uuid",
    "success" boolean DEFAULT false NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "device_fingerprint" "text",
    "failure_reason" "text",
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."login_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."non_plantilla_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "surname" character varying(100) NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "middle_name" character varying(100) DEFAULT ''::character varying,
    "complete_name" character varying(255) DEFAULT ''::character varying,
    "school" character varying(255) NOT NULL,
    "designation" character varying(255) NOT NULL,
    "pagibig_number" character varying(50) DEFAULT ''::character varying,
    "philhealth" character varying(50) DEFAULT ''::character varying,
    "landbank" character varying(50) DEFAULT ''::character varying,
    "first_day_of_service" "date",
    "contact_number" character varying(30) DEFAULT ''::character varying,
    "birthday" "date",
    "sex" character varying(20) DEFAULT ''::character varying,
    "address" "text" DEFAULT ''::"text",
    "civil_status" character varying(50) DEFAULT ''::character varying,
    "tin" character varying(50) DEFAULT ''::character varying,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regcode" "text",
    "divcode" "text"
);


ALTER TABLE "public"."non_plantilla_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "purpose" "text" DEFAULT 'mfa'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "otp_codes_purpose_check" CHECK (("purpose" = ANY (ARRAY['mfa'::"text", 'email_verification'::"text"])))
);


ALTER TABLE "public"."otp_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."password_reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pay_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "cutoff_date" "date",
    "pay_date" "date",
    "frequency" "text" DEFAULT 'Semi-Monthly'::"text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "month" integer,
    "year" integer,
    "period_number" integer,
    "regcode" "text",
    "divcode" "text",
    CONSTRAINT "pay_periods_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."pay_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "empno" "text" NOT NULL,
    "pay_period_id" "uuid",
    "payperiod" "text" DEFAULT ''::"text" NOT NULL,
    "half" "text" DEFAULT 'full'::"text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "regcode" "text" DEFAULT ''::"text" NOT NULL,
    "acct_no" "text" DEFAULT ''::"text" NOT NULL,
    "acct_name" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "branch_cd" "text" DEFAULT ''::"text" NOT NULL,
    "batch_no" "text" DEFAULT ''::"text" NOT NULL,
    "itemcode" "text" DEFAULT ''::"text" NOT NULL,
    "paytype" "text" DEFAULT ''::"text" NOT NULL,
    "remarks" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payent_half_check" CHECK (("half" = ANY (ARRAY['full'::"text", 'first'::"text", 'second'::"text"]))),
    CONSTRAINT "payent_source_check" CHECK (("source" = ANY (ARRAY['PYENT'::"text", 'PYENT1'::"text", 'PYENT2'::"text", ''::"text"])))
);


ALTER TABLE "public"."payent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_allowances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_detail_id" "uuid",
    "employee_id" "uuid",
    "employee_number" "text",
    "allowance_code" "text" NOT NULL,
    "allowance_name" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "is_taxable" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_allowances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_period_id" "uuid",
    "step" "text" NOT NULL,
    "role" "text" NOT NULL,
    "approver_id" "uuid",
    "approver_name" "text",
    "approver_role" "text",
    "signature_phrase" "text",
    "signature_hash" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "remarks" "text",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_deductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "empno" "text" DEFAULT ''::"text" NOT NULL,
    "dedcode" "text" DEFAULT ''::"text" NOT NULL,
    "dedid" "text" DEFAULT ''::"text",
    "policyno" "text" DEFAULT ''::"text",
    "effmm" smallint DEFAULT 1 NOT NULL,
    "effyy" smallint DEFAULT 0 NOT NULL,
    "termm" smallint,
    "teryy" smallint,
    "dedamt" numeric(12,2) DEFAULT 0 NOT NULL,
    "principal" numeric(12,2) DEFAULT 0,
    "interest" numeric(12,2) DEFAULT 0,
    "charges" numeric(12,2) DEFAULT 0,
    "proceeds" numeric(12,2) DEFAULT 0,
    "agency" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "type" "text" DEFAULT 'Other'::"text" NOT NULL,
    "created_by" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text" DEFAULT ''::"text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stacode" "text" DEFAULT '0'::"text" NOT NULL,
    CONSTRAINT "payroll_deductions_dedamt_check" CHECK (("dedamt" >= (0)::numeric)),
    CONSTRAINT "payroll_deductions_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Suspended'::"text", 'Terminated'::"text"]))),
    CONSTRAINT "payroll_deductions_type_check" CHECK (("type" = ANY (ARRAY['Loan'::"text", 'Insurance'::"text", 'Membership'::"text", 'Savings'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."payroll_deductions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_deductions_new" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_detail_id" "uuid",
    "payroll_header_id" "uuid",
    "employee_id" "uuid",
    "employee_number" "text",
    "dedcode" "text" NOT NULL,
    "dedname" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "deduction_type" "text" DEFAULT 'other'::"text",
    "is_mandatory" boolean DEFAULT false,
    "is_loan" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_deductions_new" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_code" "text" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" DEFAULT 'currency'::"text" NOT NULL,
    "field_category" "text" DEFAULT 'earnings'::"text" NOT NULL,
    "description" "text",
    "default_value" numeric,
    "is_required" boolean DEFAULT false NOT NULL,
    "is_computed" boolean DEFAULT false NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    CONSTRAINT "payroll_definitions_field_category_check" CHECK (("field_category" = ANY (ARRAY['earnings'::"text", 'mandatory_deductions'::"text", 'voluntary_deductions'::"text", 'government_share'::"text", 'tax'::"text", 'net_pay'::"text", 'metadata'::"text", 'adjustments'::"text"]))),
    CONSTRAINT "payroll_definitions_field_type_check" CHECK (("field_type" = ANY (ARRAY['currency'::"text", 'number'::"text", 'text'::"text", 'date'::"text", 'percentage'::"text", 'computed'::"text"]))),
    CONSTRAINT "payroll_definitions_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text"])))
);


ALTER TABLE "public"."payroll_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_header_id" "uuid",
    "payroll_period_id" "uuid",
    "employee_id" "uuid",
    "employee_number" "text",
    "stacode" "text",
    "position_code" "text",
    "basic_salary" numeric(12,2) DEFAULT 0,
    "gross_pay" numeric(12,2) DEFAULT 0,
    "total_deductions" numeric(12,2) DEFAULT 0,
    "total_allowances" numeric(12,2) DEFAULT 0,
    "net_pay" numeric(12,2) DEFAULT 0,
    "mandatory_deductions" numeric(12,2) DEFAULT 0,
    "loan_deductions" numeric(12,2) DEFAULT 0,
    "other_deductions" numeric(12,2) DEFAULT 0,
    "tax_withheld" numeric(12,2) DEFAULT 0,
    "nthp_compliant" boolean DEFAULT true,
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "pay_period_id" "uuid" NOT NULL,
    "gross_pay" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_pay" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Computed'::"text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"(),
    "dedlnr" numeric(14,2) DEFAULT 0,
    "dedmed" numeric(14,2) DEFAULT 0,
    "dedpag" numeric(14,2) DEFAULT 0,
    "dedtax" numeric(14,2) DEFAULT 0,
    "govtlnr" numeric(14,2) DEFAULT 0,
    "govtecc" numeric(14,2) DEFAULT 0,
    "govtmed" numeric(14,2) DEFAULT 0,
    "govtpag" numeric(14,2) DEFAULT 0,
    "other_deductions" numeric(14,2) DEFAULT 0,
    "nthp_status" "text" DEFAULT 'PASS'::"text" NOT NULL,
    "undeducted_amount" numeric DEFAULT 0 NOT NULL,
    "actual_loan_deductions" numeric DEFAULT 0 NOT NULL,
    "gsis_policy_loan" numeric DEFAULT 0 NOT NULL,
    "gsis_emergency_loan" numeric DEFAULT 0 NOT NULL,
    "pagibig_mpl" numeric DEFAULT 0 NOT NULL,
    "pagibig_calamity_loan" numeric DEFAULT 0 NOT NULL,
    "hazard_pay" numeric DEFAULT 0 NOT NULL,
    "salary_differential" numeric DEFAULT 0 NOT NULL,
    "other_compensation" numeric DEFAULT 0 NOT NULL,
    "other_earnings" numeric DEFAULT 0 NOT NULL,
    "available_balance" numeric DEFAULT 0 NOT NULL,
    "mandatory_deductions" numeric DEFAULT 0 NOT NULL,
    "loan_deduction_capacity" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "chk_payroll_actual_loans" CHECK (("actual_loan_deductions" >= (0)::numeric)),
    CONSTRAINT "chk_payroll_gross" CHECK (("gross_pay" >= (0)::numeric)),
    CONSTRAINT "chk_payroll_net" CHECK (("net_pay" >= (0)::numeric)),
    CONSTRAINT "chk_payroll_total_ded" CHECK (("total_deductions" >= (0)::numeric)),
    CONSTRAINT "chk_payroll_undeducted" CHECK (("undeducted_amount" >= (0)::numeric)),
    CONSTRAINT "payroll_entries_status_check" CHECK (("status" = ANY (ARRAY['Computed'::"text", 'Posted'::"text", 'Reversed'::"text"])))
);


ALTER TABLE "public"."payroll_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_formulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "formula_name" "text" NOT NULL,
    "output_field_code" "text" NOT NULL,
    "expression" "text" NOT NULL,
    "description" "text",
    "computation_order" integer DEFAULT 0 NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text"
);


ALTER TABLE "public"."payroll_formulas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_code" "text" NOT NULL,
    "group_name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "stacode_min" integer,
    "stacode_max" integer
);


ALTER TABLE "public"."payroll_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_headers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_period_id" "uuid",
    "period_name" "text",
    "stacode" "text",
    "category" "text",
    "total_employees" integer DEFAULT 0,
    "total_gross" numeric(14,2) DEFAULT 0,
    "total_deductions" numeric(14,2) DEFAULT 0,
    "total_net" numeric(14,2) DEFAULT 0,
    "total_mandatory" numeric(14,2) DEFAULT 0,
    "total_loans" numeric(14,2) DEFAULT 0,
    "total_allowances" numeric(14,2) DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "nthp_violations" integer DEFAULT 0,
    "prepared_by" "uuid",
    "prepared_by_name" "text",
    "prepared_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_headers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_number_counter" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."payroll_number_counter" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_name" "text" NOT NULL,
    "period_type" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "pay_date" "date",
    "month" integer,
    "year" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_step" "text" DEFAULT 'coordinator'::"text" NOT NULL,
    "locked_by" "uuid",
    "locked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payrolls_dbf" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paycode" numeric(1,0) DEFAULT 0 NOT NULL,
    "regcode" "text" DEFAULT ''::"text" NOT NULL,
    "divcode" "text" DEFAULT ''::"text" NOT NULL,
    "stacode" "text" DEFAULT ''::"text" NOT NULL,
    "empno" "text" DEFAULT ''::"text" NOT NULL,
    "fname" "text" DEFAULT ''::"text" NOT NULL,
    "mi" "text" DEFAULT ''::"text" NOT NULL,
    "lname" "text" DEFAULT ''::"text" NOT NULL,
    "appel" "text" DEFAULT ''::"text" NOT NULL,
    "basic" numeric(8,2) DEFAULT 0 NOT NULL,
    "trans" numeric(8,2) DEFAULT 0 NOT NULL,
    "dedlnr" numeric(8,2) DEFAULT 0 NOT NULL,
    "dedmed" numeric(6,2) DEFAULT 0 NOT NULL,
    "dedpag" numeric(6,2) DEFAULT 0 NOT NULL,
    "dedtax" numeric(8,2) DEFAULT 0 NOT NULL,
    "otherded" numeric(8,2) DEFAULT 0 NOT NULL,
    "office" "text" DEFAULT ''::"text" NOT NULL,
    "ending" "text" DEFAULT ''::"text" NOT NULL,
    "issue" "text" DEFAULT ''::"text" NOT NULL,
    "chkno" bigint DEFAULT 0 NOT NULL,
    "ontop" numeric(7,2) DEFAULT 0 NOT NULL,
    "long" numeric(7,2) DEFAULT 0 NOT NULL,
    "rata" numeric(7,2) DEFAULT 0 NOT NULL,
    "pera" numeric(7,2) DEFAULT 0 NOT NULL,
    "aca" numeric(8,2) DEFAULT 0 NOT NULL,
    "takehome" numeric(8,2) DEFAULT 0 NOT NULL,
    "poscode" "text" DEFAULT ''::"text" NOT NULL,
    "grade" "text" DEFAULT ''::"text" NOT NULL,
    "step" "text" DEFAULT ''::"text" NOT NULL,
    "govtlnr" numeric(8,2) DEFAULT 0 NOT NULL,
    "govtecc" numeric(8,2) DEFAULT 0 NOT NULL,
    "govtpag" numeric(8,2) DEFAULT 0 NOT NULL,
    "govtmed" numeric(8,2) DEFAULT 0 NOT NULL,
    "taxcode" "text" DEFAULT ''::"text" NOT NULL,
    "paymode" "text" DEFAULT ''::"text" NOT NULL,
    "bank" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payrolls_dbf" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plantilla_headers" (
    "id" "text" NOT NULL,
    "fiscal_year" integer DEFAULT 2025 NOT NULL,
    "department" "text" DEFAULT 'Department of Education'::"text" NOT NULL,
    "bureau_agency" "text" DEFAULT 'Office of the Secretary'::"text" NOT NULL,
    "division_office" "text" DEFAULT 'Division of Calamba City'::"text" NOT NULL,
    "total_positions" integer DEFAULT 0 NOT NULL,
    "filled_positions" integer DEFAULT 0 NOT NULL,
    "unfilled_positions" integer DEFAULT 0 NOT NULL,
    "authorized_amount" numeric DEFAULT 0 NOT NULL,
    "actual_amount" numeric DEFAULT 0 NOT NULL,
    "source_pdf" "text",
    "imported_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plantilla_headers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plantilla_import_logs" (
    "id" "text" NOT NULL,
    "imported_by" "text" DEFAULT 'System'::"text" NOT NULL,
    "import_date" "text" NOT NULL,
    "pdf_filename" "text" NOT NULL,
    "fiscal_year" integer DEFAULT 2025,
    "positions_added" integer DEFAULT 0 NOT NULL,
    "positions_updated" integer DEFAULT 0 NOT NULL,
    "positions_vacated" integer DEFAULT 0 NOT NULL,
    "positions_filled" integer DEFAULT 0 NOT NULL,
    "total_records" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Completed'::"text" NOT NULL,
    "import_batch_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plantilla_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plantilla_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_code" "text" NOT NULL,
    "position_title" "text" NOT NULL,
    "salary_grade" integer NOT NULL,
    "monthly_salary" numeric(12,2) DEFAULT 0 NOT NULL,
    "level" "text",
    "category" "text",
    "stacode" "text",
    "item_number" "text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "salary_step" integer,
    "step" integer,
    "authorized_salary" numeric DEFAULT 0,
    "actual_salary" numeric DEFAULT 0,
    "annual_salary" numeric DEFAULT 0,
    "area" "text",
    "type" "text",
    "ppa_attribution" "text",
    "employee_name" "text",
    "sex" "text",
    "birth_date" "text",
    "date_of_birth" "text",
    "tin" "text",
    "appointment_date" "text",
    "original_appointment_date" "text",
    "last_promotion_date" "text",
    "civil_service_eligibility" "text",
    "employment_status" "text",
    "appointment_type" "text",
    "occupation_code" "text",
    "personnel_category" "text",
    "position_status" "text" DEFAULT 'Filled'::"text",
    "school_id" "text",
    "school_name" "text",
    "school_type" "text",
    "office_assignment" "text",
    "organizational_unit" "text",
    "department" "text",
    "bureau" "text",
    "fiscal_year" integer,
    "source_pdf" "text",
    "import_batch_id" "text",
    "approval_status" "text" DEFAULT 'Approved'::"text",
    "employee_id" "text",
    "header_id" "text",
    "imported_by" "text",
    "education" "text",
    "eligibility" "text"
);


ALTER TABLE "public"."plantilla_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pli_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "text" DEFAULT ''::"text" NOT NULL,
    "uploaded_by_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "add_filename" "text" DEFAULT ''::"text" NOT NULL,
    "del_filename" "text",
    "dbf_filename" "text",
    "total_records" integer DEFAULT 0 NOT NULL,
    "add_records" integer DEFAULT 0 NOT NULL,
    "del_records" integer DEFAULT 0 NOT NULL,
    "new_deductions" integer DEFAULT 0 NOT NULL,
    "updated_deductions" integer DEFAULT 0 NOT NULL,
    "terminated_deductions" integer DEFAULT 0 NOT NULL,
    "failed_records" integer DEFAULT 0 NOT NULL,
    "processing_time_ms" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "file_content" "text",
    "remark" "text"
);


ALTER TABLE "public"."pli_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "text" DEFAULT ''::"text" NOT NULL,
    "uploaded_by_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "filename" "text" DEFAULT ''::"text" NOT NULL,
    "import_mode" "text" DEFAULT 'add_new'::"text" NOT NULL,
    "total_records" integer DEFAULT 0 NOT NULL,
    "new_records" integer DEFAULT 0 NOT NULL,
    "updated_records" integer DEFAULT 0 NOT NULL,
    "skipped_records" integer DEFAULT 0 NOT NULL,
    "error_records" integer DEFAULT 0 NOT NULL,
    "processing_time_ms" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."position_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_management" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_code" "text" NOT NULL,
    "old_position_code" "text" DEFAULT ''::"text",
    "position_title" "text" DEFAULT ''::"text",
    "position_name" "text" DEFAULT ''::"text",
    "salary_grade" integer DEFAULT 0,
    "step1" numeric(14,2) DEFAULT 0,
    "step2" numeric(14,2) DEFAULT 0,
    "step3" numeric(14,2) DEFAULT 0,
    "step4" numeric(14,2) DEFAULT 0,
    "step5" numeric(14,2) DEFAULT 0,
    "step6" numeric(14,2) DEFAULT 0,
    "step7" numeric(14,2) DEFAULT 0,
    "step8" numeric(14,2) DEFAULT 0,
    "personnel_category" "text" DEFAULT 'Non-Teaching'::"text" NOT NULL,
    "position_category_code" "text" DEFAULT ''::"text",
    "remarks" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "last_imported_at" timestamp with time zone,
    "last_updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "position_management_personnel_category_check" CHECK (("personnel_category" = ANY (ARRAY['Teaching'::"text", 'Teaching Related'::"text", 'Non-Teaching'::"text"]))),
    CONSTRAINT "position_management_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text"])))
);


ALTER TABLE "public"."position_management" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" NOT NULL,
    "mobile_number" "text" DEFAULT ''::"text" NOT NULL,
    "username" "text",
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "mfa_enabled" boolean DEFAULT false NOT NULL,
    "failed_login_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "last_login_at" timestamp with time zone,
    "last_login_ip" "text",
    "email_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending_approval'::"text" NOT NULL,
    "office_assignment" "text",
    "position_designation" "text",
    "employee_number" "text",
    "rejection_reason" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "disabled_by" "uuid",
    "disabled_at" timestamp with time zone,
    "assigned_stacode" "text",
    "division_code" "text",
    "digital_signature_hash" "text",
    "signature_phrase" "text",
    "signature_set_at" timestamp with time zone,
    "region_id" "uuid",
    "division_id" "uuid",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text", 'hr_administrator'::"text", 'school_coordinator'::"text", 'school_head'::"text", 'loan_verifier'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text", 'accounting_officer'::"text", 'division_finance'::"text", 'treasury_disbursement'::"text", 'auditor'::"text", 'ess'::"text", 'read_only'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['pending_approval'::"text", 'approved'::"text", 'rejected'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "region_code" "text" NOT NULL,
    "region_name" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "regions_region_code_check" CHECK (("region_code" <> ''::"text")),
    CONSTRAINT "regions_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text"])))
);


ALTER TABLE "public"."regions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "employee_number" "text",
    "old_salary" numeric(12,2) DEFAULT 0,
    "new_salary" numeric(12,2) DEFAULT 0,
    "old_salary_grade" integer,
    "new_salary_grade" integer,
    "reason" "text",
    "effective_date" "date" NOT NULL,
    "approved_by" "uuid",
    "approved_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."salary_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tranche" "text" DEFAULT 'Third Tranche'::"text" NOT NULL,
    "circular_no" "text" DEFAULT 'NBC 601'::"text" NOT NULL,
    "effective_date" "date" DEFAULT '2026-01-01'::"date" NOT NULL,
    "grade" integer NOT NULL,
    "step" integer NOT NULL,
    "monthly_salary" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."salary_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_code" "text" NOT NULL,
    "school_name" "text" DEFAULT ''::"text" NOT NULL,
    "school_type" "text" DEFAULT 'Elementary'::"text" NOT NULL,
    "cluster" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "school_head" "text" DEFAULT ''::"text" NOT NULL,
    "contact_number" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "division_id" "uuid"
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "ip_address" "text",
    "device_fingerprint" "text",
    "description" "text",
    "metadata" "jsonb",
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "lockdown_enabled" boolean DEFAULT false NOT NULL,
    "lockdown_reason" "text",
    "lockdown_at" timestamp with time zone,
    "locked_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_settings_id_check" CHECK (("id" = 1)),
    CONSTRAINT "security_settings_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."security_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signatories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" NOT NULL,
    "name" "text" NOT NULL,
    "position" "text",
    "office" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regcode" "text",
    "divcode" "text"
);


ALTER TABLE "public"."signatories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stacode_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "employee_no" "text" DEFAULT ''::"text" NOT NULL,
    "old_stacode" "text" DEFAULT ''::"text" NOT NULL,
    "new_stacode" "text" DEFAULT ''::"text" NOT NULL,
    "old_group_code" "text" DEFAULT 'Unassigned'::"text" NOT NULL,
    "new_group_code" "text" DEFAULT 'Unassigned'::"text" NOT NULL,
    "changed_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "reason" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."stacode_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."undeducted_obligations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_entry_id" "uuid",
    "employee_id" "uuid",
    "pay_period_id" "uuid",
    "deduction_code" "text" DEFAULT ''::"text" NOT NULL,
    "deduction_description" "text" DEFAULT ''::"text" NOT NULL,
    "undeducted_amount" numeric DEFAULT 0 NOT NULL,
    "reason" "text" DEFAULT 'NTHP BELOW ₱5,000.00'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "station_code" "text",
    "scheduled_amount" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."undeducted_obligations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payroll_period_id" "uuid",
    "step" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text",
    "actor_role" "text",
    "remarks" "text",
    "signature_hash" "text",
    "is_maker" boolean DEFAULT true,
    "is_checker" boolean DEFAULT false,
    "maker_id" "uuid",
    "checker_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_actions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ca_employees"
    ADD CONSTRAINT "ca_employees_account_no_key" UNIQUE ("account_no");



ALTER TABLE ONLY "public"."ca_employees"
    ADD CONSTRAINT "ca_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ca_payroll_details"
    ADD CONSTRAINT "ca_payroll_details_payroll_id_employee_id_key" UNIQUE ("payroll_id", "employee_id");



ALTER TABLE ONLY "public"."ca_payroll_details"
    ADD CONSTRAINT "ca_payroll_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ca_payroll_headers"
    ADD CONSTRAINT "ca_payroll_headers_payroll_no_key" UNIQUE ("payroll_no");



ALTER TABLE ONLY "public"."ca_payroll_headers"
    ADD CONSTRAINT "ca_payroll_headers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ca_payroll_signatories"
    ADD CONSTRAINT "ca_payroll_signatories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_stats_cache"
    ADD CONSTRAINT "dashboard_stats_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_divtable"
    ADD CONSTRAINT "dbf_divtable_divcode_unique" UNIQUE ("divcode");



ALTER TABLE ONLY "public"."dbf_divtable"
    ADD CONSTRAINT "dbf_divtable_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_excluded"
    ADD CONSTRAINT "dbf_excluded_empno_payperiod_unique" UNIQUE ("empno", "payperiod");



ALTER TABLE ONLY "public"."dbf_excluded"
    ADD CONSTRAINT "dbf_excluded_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_included"
    ADD CONSTRAINT "dbf_included_empno_payperiod_unique" UNIQUE ("empno", "payperiod");



ALTER TABLE ONLY "public"."dbf_included"
    ADD CONSTRAINT "dbf_included_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_payrolls"
    ADD CONSTRAINT "dbf_payrolls_empno_payperiod_unique" UNIQUE ("empno", "payperiod");



ALTER TABLE ONLY "public"."dbf_payrolls"
    ADD CONSTRAINT "dbf_payrolls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_pyent1"
    ADD CONSTRAINT "dbf_pyent1_empno_payperiod_itemcode_unique" UNIQUE ("empno", "payperiod", "itemcode");



ALTER TABLE ONLY "public"."dbf_pyent1"
    ADD CONSTRAINT "dbf_pyent1_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_pyent2"
    ADD CONSTRAINT "dbf_pyent2_empno_payperiod_itemcode_unique" UNIQUE ("empno", "payperiod", "itemcode");



ALTER TABLE ONLY "public"."dbf_pyent2"
    ADD CONSTRAINT "dbf_pyent2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_pyent"
    ADD CONSTRAINT "dbf_pyent_empno_payperiod_itemcode_unique" UNIQUE ("empno", "payperiod", "itemcode");



ALTER TABLE ONLY "public"."dbf_pyent"
    ADD CONSTRAINT "dbf_pyent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_restore_history"
    ADD CONSTRAINT "dbf_restore_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_stntable"
    ADD CONSTRAINT "dbf_stntable_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbf_stntable"
    ADD CONSTRAINT "dbf_stntable_stacode_unique" UNIQUE ("stacode");



ALTER TABLE ONLY "public"."dbf_sync_sessions"
    ADD CONSTRAINT "dbf_sync_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deduction_codes"
    ADD CONSTRAINT "deduction_codes_pkey" PRIMARY KEY ("dedcode");



ALTER TABLE ONLY "public"."deduction_history"
    ADD CONSTRAINT "deduction_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deductions"
    ADD CONSTRAINT "deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_logs"
    ADD CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."division_office"
    ADD CONSTRAINT "division_office_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_division_code_key" UNIQUE ("division_code");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."earnings"
    ADD CONSTRAINT "earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_number_key" UNIQUE ("employee_number");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gsis_import_logs"
    ADD CONSTRAINT "gsis_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."initial_payroll_absences"
    ADD CONSTRAINT "initial_payroll_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."initial_payroll_entries"
    ADD CONSTRAINT "initial_payroll_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."initial_payroll_records"
    ADD CONSTRAINT "initial_payroll_records_payroll_no_key" UNIQUE ("payroll_no");



ALTER TABLE ONLY "public"."initial_payroll_records"
    ADD CONSTRAINT "initial_payroll_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."initial_payroll_transfers"
    ADD CONSTRAINT "initial_payroll_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ips_absences"
    ADD CONSTRAINT "ips_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ips_audit_logs"
    ADD CONSTRAINT "ips_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ips_employees"
    ADD CONSTRAINT "ips_employees_employee_id_key" UNIQUE ("employee_id");



ALTER TABLE ONLY "public"."ips_employees"
    ADD CONSTRAINT "ips_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ips_payroll_details"
    ADD CONSTRAINT "ips_payroll_details_employee_id_period_id_key" UNIQUE ("employee_id", "period_id");



ALTER TABLE ONLY "public"."ips_payroll_details"
    ADD CONSTRAINT "ips_payroll_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ips_payroll_periods"
    ADD CONSTRAINT "ips_payroll_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_records"
    ADD CONSTRAINT "leave_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_requests"
    ADD CONSTRAINT "loan_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_verifications"
    ADD CONSTRAINT "loan_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_attempts"
    ADD CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_logs"
    ADD CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."non_plantilla_employees"
    ADD CONSTRAINT "non_plantilla_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_codes"
    ADD CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pay_periods"
    ADD CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payent"
    ADD CONSTRAINT "payent_empno_payperiod_half_unique" UNIQUE ("empno", "payperiod", "half");



ALTER TABLE ONLY "public"."payent"
    ADD CONSTRAINT "payent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_allowances"
    ADD CONSTRAINT "payroll_allowances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_approvals"
    ADD CONSTRAINT "payroll_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_deductions_new"
    ADD CONSTRAINT "payroll_deductions_new_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_deductions"
    ADD CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_definitions"
    ADD CONSTRAINT "payroll_definitions_field_code_key" UNIQUE ("field_code");



ALTER TABLE ONLY "public"."payroll_definitions"
    ADD CONSTRAINT "payroll_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_details"
    ADD CONSTRAINT "payroll_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_employee_id_pay_period_id_key" UNIQUE ("employee_id", "pay_period_id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_formulas"
    ADD CONSTRAINT "payroll_formulas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_groups"
    ADD CONSTRAINT "payroll_groups_group_code_key" UNIQUE ("group_code");



ALTER TABLE ONLY "public"."payroll_groups"
    ADD CONSTRAINT "payroll_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_headers"
    ADD CONSTRAINT "payroll_headers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_number_counter"
    ADD CONSTRAINT "payroll_number_counter_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_number_counter"
    ADD CONSTRAINT "payroll_number_counter_year_month_key" UNIQUE ("year", "month");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_period_name_key" UNIQUE ("period_name");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payrolls_dbf"
    ADD CONSTRAINT "payrolls_dbf_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantilla_headers"
    ADD CONSTRAINT "plantilla_headers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantilla_import_logs"
    ADD CONSTRAINT "plantilla_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantilla_positions"
    ADD CONSTRAINT "plantilla_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantilla_positions"
    ADD CONSTRAINT "plantilla_positions_position_code_key" UNIQUE ("position_code");



ALTER TABLE ONLY "public"."pli_import_logs"
    ADD CONSTRAINT "pli_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_import_logs"
    ADD CONSTRAINT "position_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_management"
    ADD CONSTRAINT "position_management_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_management"
    ADD CONSTRAINT "position_management_position_code_key" UNIQUE ("position_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_region_code_key" UNIQUE ("region_code");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permission");



ALTER TABLE ONLY "public"."salary_history"
    ADD CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_schedule"
    ADD CONSTRAINT "salary_schedule_grade_step_tranche_key" UNIQUE ("grade", "step", "tranche");



ALTER TABLE ONLY "public"."salary_schedule"
    ADD CONSTRAINT "salary_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_school_code_key" UNIQUE ("school_code");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_settings"
    ADD CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signatories"
    ADD CONSTRAINT "signatories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stacode_audit"
    ADD CONSTRAINT "stacode_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."undeducted_obligations"
    ADD CONSTRAINT "undeducted_obligations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_deductions"
    ADD CONSTRAINT "uq_payroll_deductions_4key" UNIQUE ("stacode", "empno", "dedcode", "policyno");



ALTER TABLE ONLY "public"."workflow_actions"
    ADD CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id");



CREATE INDEX "dbf_sync_sessions_category_idx" ON "public"."dbf_sync_sessions" USING "btree" ("category");



CREATE INDEX "dbf_sync_sessions_started_at_idx" ON "public"."dbf_sync_sessions" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_ar_employee" ON "public"."attendance_records" USING "btree" ("employee_id");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_division" ON "public"."audit_logs" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_ca_det_emp" ON "public"."ca_payroll_details" USING "btree" ("employee_id");



CREATE INDEX "idx_ca_det_payroll" ON "public"."ca_payroll_details" USING "btree" ("payroll_id");



CREATE INDEX "idx_ca_emp_category" ON "public"."ca_employees" USING "btree" ("category");



CREATE INDEX "idx_ca_emp_name" ON "public"."ca_employees" USING "btree" ("last_name", "first_name");



CREATE INDEX "idx_ca_emp_school" ON "public"."ca_employees" USING "btree" ("school_name");



CREATE INDEX "idx_ca_emp_stacode" ON "public"."ca_employees" USING "btree" ("stacode");



CREATE INDEX "idx_ca_emp_status" ON "public"."ca_employees" USING "btree" ("status");



CREATE INDEX "idx_ca_hdr_created" ON "public"."ca_payroll_headers" USING "btree" ("created_date" DESC);



CREATE INDEX "idx_ca_hdr_school" ON "public"."ca_payroll_headers" USING "btree" ("school_name");



CREATE INDEX "idx_ca_hdr_status" ON "public"."ca_payroll_headers" USING "btree" ("status");



CREATE INDEX "idx_ca_sig_payroll" ON "public"."ca_payroll_signatories" USING "btree" ("payroll_id", "sequence_no");



CREATE INDEX "idx_dbf_restore_history_category" ON "public"."dbf_restore_history" USING "btree" ("category", "restored_at" DESC);



CREATE INDEX "idx_dbf_restore_history_restored" ON "public"."dbf_restore_history" USING "btree" ("restored_at" DESC);



CREATE INDEX "idx_dbf_restore_history_table" ON "public"."dbf_restore_history" USING "btree" ("table_name");



CREATE INDEX "idx_dbf_restore_history_user_id" ON "public"."dbf_restore_history" USING "btree" ("user_id");



CREATE INDEX "idx_dc_active" ON "public"."deduction_codes" USING "btree" ("active");



CREATE INDEX "idx_dc_agency" ON "public"."deduction_codes" USING "btree" ("agency");



CREATE INDEX "idx_dc_type" ON "public"."deduction_codes" USING "btree" ("type");



CREATE INDEX "idx_deduction_history_changed_at" ON "public"."deduction_history" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_deduction_history_deduction_id" ON "public"."deduction_history" USING "btree" ("deduction_id");



CREATE INDEX "idx_deduction_history_empno" ON "public"."deduction_history" USING "btree" ("empno");



CREATE INDEX "idx_deductions_deduction_code" ON "public"."deductions" USING "btree" ("deduction_code");



CREATE INDEX "idx_deductions_employee_id" ON "public"."deductions" USING "btree" ("employee_id");



CREATE INDEX "idx_deductions_pay_period_id" ON "public"."deductions" USING "btree" ("pay_period_id");



CREATE INDEX "idx_deductions_period_code" ON "public"."deductions" USING "btree" ("pay_period_id", "deduction_code");



CREATE UNIQUE INDEX "idx_division_office_division" ON "public"."division_office" USING "btree" ("division_id");



CREATE INDEX "idx_divisions_region" ON "public"."divisions" USING "btree" ("region_id");



CREATE INDEX "idx_dl_user" ON "public"."device_logs" USING "btree" ("user_id");



CREATE INDEX "idx_earnings_employee_id" ON "public"."earnings" USING "btree" ("employee_id");



CREATE INDEX "idx_earnings_pay_period_id" ON "public"."earnings" USING "btree" ("pay_period_id");



CREATE INDEX "idx_employees_department" ON "public"."employees" USING "btree" ("department");



CREATE INDEX "idx_employees_divcode" ON "public"."employees" USING "btree" ("divcode");



CREATE INDEX "idx_employees_division" ON "public"."employees" USING "btree" ("division_id");



CREATE INDEX "idx_employees_empno" ON "public"."employees" USING "btree" ("empno");



CREATE INDEX "idx_employees_lname" ON "public"."employees" USING "btree" ("lname");



CREATE INDEX "idx_employees_lname_fname" ON "public"."employees" USING "btree" ("lname", "fname");



CREATE INDEX "idx_employees_payroll_group_id" ON "public"."employees" USING "btree" ("payroll_group_id");



CREATE INDEX "idx_employees_payroll_status" ON "public"."employees" USING "btree" ("payroll_status");



CREATE INDEX "idx_employees_position" ON "public"."employees" USING "btree" ("position");



CREATE INDEX "idx_employees_regcode" ON "public"."employees" USING "btree" ("regcode");



CREATE INDEX "idx_employees_regcode_divcode" ON "public"."employees" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_employees_stacode" ON "public"."employees" USING "btree" ("stacode");



CREATE INDEX "idx_employees_stacode_num" ON "public"."employees" USING "btree" ("stacode_num");



CREATE INDEX "idx_employees_status" ON "public"."employees" USING "btree" ("status");



CREATE INDEX "idx_gsis_import_logs_created_at" ON "public"."gsis_import_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_gsis_import_logs_user_created" ON "public"."gsis_import_logs" USING "btree" ("uploaded_by_id", "created_at" DESC);



CREATE INDEX "idx_initial_payroll_records_division" ON "public"."initial_payroll_records" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_ip_entries_employee" ON "public"."initial_payroll_entries" USING "btree" ("employee_id");



CREATE INDEX "idx_ip_entries_record" ON "public"."initial_payroll_entries" USING "btree" ("record_id");



CREATE INDEX "idx_ip_entries_school_group" ON "public"."initial_payroll_entries" USING "btree" ("school_group");



CREATE INDEX "idx_ip_entries_stacode" ON "public"."initial_payroll_entries" USING "btree" ("stacode");



CREATE INDEX "idx_ipa_employee" ON "public"."initial_payroll_absences" USING "btree" ("employee_id");



CREATE INDEX "idx_ips_absences_employee" ON "public"."ips_absences" USING "btree" ("employee_id");



CREATE INDEX "idx_ips_audit_logs_changed_at" ON "public"."ips_audit_logs" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_ips_payroll_details_employee" ON "public"."ips_payroll_details" USING "btree" ("employee_id");



CREATE INDEX "idx_ips_payroll_details_period" ON "public"."ips_payroll_details" USING "btree" ("period_id");



CREATE INDEX "idx_ll_created" ON "public"."login_logs" USING "btree" ("created_at");



CREATE INDEX "idx_login_attempts_created" ON "public"."login_attempts" USING "btree" ("created_at");



CREATE INDEX "idx_login_attempts_email" ON "public"."login_attempts" USING "btree" ("email");



CREATE INDEX "idx_lr_employee" ON "public"."leave_records" USING "btree" ("employee_id");



CREATE INDEX "idx_lreq_employee" ON "public"."loan_requests" USING "btree" ("employee_id");



CREATE INDEX "idx_non_plantilla_complete_name" ON "public"."non_plantilla_employees" USING "btree" ("complete_name");



CREATE INDEX "idx_non_plantilla_designation" ON "public"."non_plantilla_employees" USING "btree" ("designation");



CREATE INDEX "idx_non_plantilla_division" ON "public"."non_plantilla_employees" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_non_plantilla_not_deleted" ON "public"."non_plantilla_employees" USING "btree" ("id") WHERE ("is_deleted" = false);



CREATE INDEX "idx_non_plantilla_school" ON "public"."non_plantilla_employees" USING "btree" ("school");



CREATE INDEX "idx_non_plantilla_surname" ON "public"."non_plantilla_employees" USING "btree" ("surname");



CREATE INDEX "idx_otp_expires" ON "public"."otp_codes" USING "btree" ("expires_at");



CREATE INDEX "idx_otp_user" ON "public"."otp_codes" USING "btree" ("user_id");



CREATE INDEX "idx_pa_period" ON "public"."payroll_approvals" USING "btree" ("payroll_period_id");



CREATE INDEX "idx_pay_periods_divcode" ON "public"."pay_periods" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_pay_periods_start_date" ON "public"."pay_periods" USING "btree" ("start_date" DESC);



CREATE INDEX "idx_pay_periods_status" ON "public"."pay_periods" USING "btree" ("status");



CREATE INDEX "idx_pay_periods_year_month" ON "public"."pay_periods" USING "btree" ("year", "month");



CREATE INDEX "idx_payent_employee_id" ON "public"."payent" USING "btree" ("employee_id");



CREATE INDEX "idx_payent_empno" ON "public"."payent" USING "btree" ("empno");



CREATE INDEX "idx_payent_pay_period_id" ON "public"."payent" USING "btree" ("pay_period_id");



CREATE INDEX "idx_payroll_deductions_dedcode" ON "public"."payroll_deductions" USING "btree" ("dedcode");



CREATE INDEX "idx_payroll_deductions_employee_id" ON "public"."payroll_deductions" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_deductions_empno" ON "public"."payroll_deductions" USING "btree" ("empno");



CREATE INDEX "idx_payroll_deductions_status" ON "public"."payroll_deductions" USING "btree" ("status");



CREATE INDEX "idx_payroll_deductions_type" ON "public"."payroll_deductions" USING "btree" ("type");



CREATE INDEX "idx_payroll_definitions_category_order" ON "public"."payroll_definitions" USING "btree" ("field_category", "sort_order");



CREATE INDEX "idx_payroll_entries_employee_id" ON "public"."payroll_entries" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_entries_nthp_status" ON "public"."payroll_entries" USING "btree" ("nthp_status");



CREATE INDEX "idx_payroll_entries_pay_period_id" ON "public"."payroll_entries" USING "btree" ("pay_period_id");



CREATE INDEX "idx_payroll_entries_period_status" ON "public"."payroll_entries" USING "btree" ("pay_period_id", "status");



CREATE INDEX "idx_payroll_entries_status" ON "public"."payroll_entries" USING "btree" ("status");



CREATE INDEX "idx_payroll_formulas_computation_order" ON "public"."payroll_formulas" USING "btree" ("computation_order") WHERE ("is_active" = true);



CREATE INDEX "idx_payroll_groups_stacode_range" ON "public"."payroll_groups" USING "btree" ("stacode_min", "stacode_max") WHERE (("stacode_min" IS NOT NULL) AND ("stacode_max" IS NOT NULL));



CREATE INDEX "idx_payroll_groups_status" ON "public"."payroll_groups" USING "btree" ("status");



CREATE INDEX "idx_payrolls_dbf_bank" ON "public"."payrolls_dbf" USING "btree" ("bank");



CREATE INDEX "idx_payrolls_dbf_empno" ON "public"."payrolls_dbf" USING "btree" ("empno");



CREATE INDEX "idx_payrolls_dbf_lname" ON "public"."payrolls_dbf" USING "btree" ("lname");



CREATE INDEX "idx_payrolls_dbf_stacode" ON "public"."payrolls_dbf" USING "btree" ("stacode");



CREATE UNIQUE INDEX "idx_pd_active_unique" ON "public"."payroll_deductions" USING "btree" ("empno", "dedcode", "policyno") WHERE ("status" = 'Active'::"text");



CREATE INDEX "idx_pd_employee" ON "public"."payroll_details" USING "btree" ("employee_id");



CREATE INDEX "idx_pd_header" ON "public"."payroll_details" USING "btree" ("payroll_header_id");



CREATE INDEX "idx_pdn_detail" ON "public"."payroll_deductions_new" USING "btree" ("payroll_detail_id");



CREATE INDEX "idx_plantilla_headers_fy" ON "public"."plantilla_headers" USING "btree" ("fiscal_year");



CREATE INDEX "idx_plantilla_pos_category" ON "public"."plantilla_positions" USING "btree" ("personnel_category");



CREATE INDEX "idx_plantilla_pos_fy" ON "public"."plantilla_positions" USING "btree" ("fiscal_year");



CREATE INDEX "idx_plantilla_pos_school" ON "public"."plantilla_positions" USING "btree" ("school_id");



CREATE INDEX "idx_plantilla_pos_status" ON "public"."plantilla_positions" USING "btree" ("position_status");



CREATE INDEX "idx_plantilla_positions_item_number" ON "public"."plantilla_positions" USING "btree" ("item_number");



CREATE INDEX "idx_pli_import_logs_created_at" ON "public"."pli_import_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pli_import_logs_user_created" ON "public"."pli_import_logs" USING "btree" ("uploaded_by_id", "created_at" DESC);



CREATE INDEX "idx_position_import_logs_user_created" ON "public"."position_import_logs" USING "btree" ("uploaded_by_id", "created_at" DESC);



CREATE INDEX "idx_position_management_category" ON "public"."position_management" USING "btree" ("personnel_category");



CREATE INDEX "idx_position_management_status" ON "public"."position_management" USING "btree" ("status");



CREATE INDEX "idx_pp_status" ON "public"."payroll_periods" USING "btree" ("status");



CREATE INDEX "idx_profiles_assigned_stacode" ON "public"."profiles" USING "btree" ("assigned_stacode");



CREATE INDEX "idx_profiles_division" ON "public"."profiles" USING "btree" ("division_id");



CREATE INDEX "idx_profiles_division_code" ON "public"."profiles" USING "btree" ("division_code");



CREATE INDEX "idx_profiles_region" ON "public"."profiles" USING "btree" ("region_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_status" ON "public"."profiles" USING "btree" ("status");



CREATE INDEX "idx_reset_expires" ON "public"."password_reset_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_reset_user" ON "public"."password_reset_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_salary_schedule_grade_step" ON "public"."salary_schedule" USING "btree" ("grade", "step") WHERE ("tranche" = 'Third Tranche'::"text");



CREATE INDEX "idx_schools_division" ON "public"."schools" USING "btree" ("division_id");



CREATE INDEX "idx_schools_status" ON "public"."schools" USING "btree" ("status");



CREATE INDEX "idx_schools_type" ON "public"."schools" USING "btree" ("school_type");



CREATE INDEX "idx_se_created" ON "public"."security_events" USING "btree" ("created_at");



CREATE INDEX "idx_sh_employee" ON "public"."salary_history" USING "btree" ("employee_id");



CREATE INDEX "idx_signatories_division" ON "public"."signatories" USING "btree" ("regcode", "divcode");



CREATE INDEX "idx_stacode_audit_changed_at" ON "public"."stacode_audit" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_stacode_audit_employee" ON "public"."stacode_audit" USING "btree" ("employee_id");



CREATE INDEX "idx_undeducted_obligations_employee_id" ON "public"."undeducted_obligations" USING "btree" ("employee_id");



CREATE INDEX "idx_undeducted_obligations_entry" ON "public"."undeducted_obligations" USING "btree" ("payroll_entry_id");



CREATE INDEX "idx_undeducted_obligations_pay_period_id" ON "public"."undeducted_obligations" USING "btree" ("pay_period_id");



CREATE INDEX "idx_wa_period" ON "public"."workflow_actions" USING "btree" ("payroll_period_id");



CREATE UNIQUE INDEX "pay_periods_period_name_div_unique" ON "public"."pay_periods" USING "btree" ("period_name", "regcode", "divcode") WHERE (("regcode" IS NOT NULL) AND ("divcode" IS NOT NULL));



CREATE UNIQUE INDEX "pay_periods_period_name_legacy_unique" ON "public"."pay_periods" USING "btree" ("period_name") WHERE (("regcode" IS NULL) AND ("divcode" IS NULL));



CREATE UNIQUE INDEX "pay_periods_year_month_div_unique" ON "public"."pay_periods" USING "btree" ("year", "month", "regcode", "divcode") WHERE (("year" IS NOT NULL) AND ("month" IS NOT NULL) AND ("regcode" IS NOT NULL) AND ("divcode" IS NOT NULL));



CREATE UNIQUE INDEX "pay_periods_year_month_legacy_unique" ON "public"."pay_periods" USING "btree" ("year", "month") WHERE (("year" IS NOT NULL) AND ("month" IS NOT NULL) AND ("regcode" IS NULL) AND ("divcode" IS NULL));



CREATE INDEX "security_events_created_at_idx" ON "public"."security_events" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "uq_non_plantilla_landbank" ON "public"."non_plantilla_employees" USING "btree" ("landbank") WHERE (("landbank" IS NOT NULL) AND (("landbank")::"text" <> ''::"text"));



CREATE UNIQUE INDEX "uq_non_plantilla_pagibig" ON "public"."non_plantilla_employees" USING "btree" ("pagibig_number") WHERE (("pagibig_number" IS NOT NULL) AND (("pagibig_number")::"text" <> ''::"text"));



CREATE UNIQUE INDEX "uq_non_plantilla_philhealth" ON "public"."non_plantilla_employees" USING "btree" ("philhealth") WHERE (("philhealth" IS NOT NULL) AND (("philhealth")::"text" <> ''::"text"));



CREATE UNIQUE INDEX "uq_non_plantilla_tin" ON "public"."non_plantilla_employees" USING "btree" ("tin") WHERE (("tin" IS NOT NULL) AND (("tin")::"text" <> ''::"text"));



CREATE OR REPLACE TRIGGER "division_office_touch_updated_at" BEFORE UPDATE ON "public"."division_office" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_deduction_codes" AFTER INSERT OR DELETE OR UPDATE ON "public"."deduction_codes" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('deduction_code_modify');



CREATE OR REPLACE TRIGGER "trg_audit_employees" AFTER INSERT OR DELETE OR UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('employee_modify');



CREATE OR REPLACE TRIGGER "trg_audit_logs_division" BEFORE INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_division_codes"();



CREATE OR REPLACE TRIGGER "trg_audit_pay_periods" AFTER INSERT OR DELETE OR UPDATE ON "public"."pay_periods" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('pay_period_modify');



CREATE OR REPLACE TRIGGER "trg_audit_payroll_deductions" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_deductions" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('payroll_deduction_modify');



CREATE OR REPLACE TRIGGER "trg_audit_payroll_entries" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_entries" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('payroll_entry_modify');



CREATE OR REPLACE TRIGGER "trg_audit_payroll_groups" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_groups" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('payroll_group_modify');



CREATE OR REPLACE TRIGGER "trg_audit_salary_schedule" AFTER INSERT OR DELETE OR UPDATE ON "public"."salary_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."log_table_change"('salary_schedule_modify');



CREATE OR REPLACE TRIGGER "trg_dash_cache_employees" AFTER INSERT OR DELETE OR UPDATE ON "public"."employees" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_trig_refresh_dashboard_cache"();



CREATE OR REPLACE TRIGGER "trg_dash_cache_payroll_deds" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_deductions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_trig_refresh_dashboard_cache"();



CREATE OR REPLACE TRIGGER "trg_dash_cache_payroll_entries" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_entries" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_trig_refresh_dashboard_cache"();



CREATE OR REPLACE TRIGGER "trg_enforce_posted_entry_invariants" BEFORE INSERT ON "public"."payroll_entries" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_posted_entry_invariants"();



CREATE OR REPLACE TRIGGER "trg_initial_payroll_records_division" BEFORE INSERT ON "public"."initial_payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_division_codes"();



CREATE OR REPLACE TRIGGER "trg_non_plantilla_before_insert" BEFORE INSERT ON "public"."non_plantilla_employees" FOR EACH ROW EXECUTE FUNCTION "public"."fn_non_plantilla_before_upsert"();



CREATE OR REPLACE TRIGGER "trg_non_plantilla_before_update" BEFORE UPDATE ON "public"."non_plantilla_employees" FOR EACH ROW EXECUTE FUNCTION "public"."fn_non_plantilla_before_upsert"();



CREATE OR REPLACE TRIGGER "trg_non_plantilla_division_insert" BEFORE INSERT ON "public"."non_plantilla_employees" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_division_codes"();



CREATE OR REPLACE TRIGGER "trg_non_plantilla_division_update" BEFORE UPDATE ON "public"."non_plantilla_employees" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_division_codes"();



CREATE OR REPLACE TRIGGER "trg_payroll_definitions_updated" BEFORE UPDATE ON "public"."payroll_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_payroll_def_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payroll_formulas_updated" BEFORE UPDATE ON "public"."payroll_formulas" FOR EACH ROW EXECUTE FUNCTION "public"."set_payroll_def_updated_at"();



CREATE OR REPLACE TRIGGER "trg_protect_closed_periods" BEFORE UPDATE ON "public"."pay_periods" FOR EACH ROW WHEN (("old"."status" = 'closed'::"text")) EXECUTE FUNCTION "public"."prevent_closed_period_reopen"();



CREATE OR REPLACE TRIGGER "trg_protect_posted_entries" BEFORE DELETE OR UPDATE ON "public"."payroll_entries" FOR EACH ROW WHEN (("old"."status" = 'Posted'::"text")) EXECUTE FUNCTION "public"."prevent_posted_entry_modification"();



CREATE OR REPLACE TRIGGER "trg_protect_profile_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_columns"();



CREATE OR REPLACE TRIGGER "trg_schools_updated_at" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."update_schools_updated_at"();



CREATE OR REPLACE TRIGGER "trg_signatories_division" BEFORE INSERT ON "public"."signatories" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_division_codes"();



CREATE OR REPLACE TRIGGER "trg_validate_nthp" BEFORE INSERT OR UPDATE OF "net_pay" ON "public"."payroll_details" FOR EACH ROW EXECUTE FUNCTION "public"."validate_nthp_on_insert"();



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ca_payroll_details"
    ADD CONSTRAINT "ca_payroll_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."ca_employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ca_payroll_details"
    ADD CONSTRAINT "ca_payroll_details_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "public"."ca_payroll_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ca_payroll_signatories"
    ADD CONSTRAINT "ca_payroll_signatories_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "public"."ca_payroll_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dbf_restore_history"
    ADD CONSTRAINT "dbf_restore_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dbf_sync_sessions"
    ADD CONSTRAINT "dbf_sync_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deduction_history"
    ADD CONSTRAINT "deduction_history_deduction_id_fkey" FOREIGN KEY ("deduction_id") REFERENCES "public"."payroll_deductions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deductions"
    ADD CONSTRAINT "deductions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deductions"
    ADD CONSTRAINT "deductions_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_office"
    ADD CONSTRAINT "division_office_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."earnings"
    ADD CONSTRAINT "earnings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."earnings"
    ADD CONSTRAINT "earnings_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_payroll_group_id_fkey" FOREIGN KEY ("payroll_group_id") REFERENCES "public"."payroll_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plantilla_positions"
    ADD CONSTRAINT "fk_plantilla_pos_header" FOREIGN KEY ("header_id") REFERENCES "public"."plantilla_headers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."initial_payroll_absences"
    ADD CONSTRAINT "initial_payroll_absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."initial_payroll_entries"
    ADD CONSTRAINT "initial_payroll_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."initial_payroll_entries"
    ADD CONSTRAINT "initial_payroll_entries_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."initial_payroll_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."initial_payroll_records"
    ADD CONSTRAINT "initial_payroll_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."initial_payroll_transfers"
    ADD CONSTRAINT "initial_payroll_transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."initial_payroll_transfers"
    ADD CONSTRAINT "initial_payroll_transfers_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ips_absences"
    ADD CONSTRAINT "ips_absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."ips_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ips_payroll_details"
    ADD CONSTRAINT "ips_payroll_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."ips_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ips_payroll_details"
    ADD CONSTRAINT "ips_payroll_details_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."ips_payroll_periods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leave_records"
    ADD CONSTRAINT "leave_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_requests"
    ADD CONSTRAINT "loan_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_verifications"
    ADD CONSTRAINT "loan_verifications_loan_request_id_fkey" FOREIGN KEY ("loan_request_id") REFERENCES "public"."loan_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_attempts"
    ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."otp_codes"
    ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payent"
    ADD CONSTRAINT "payent_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payent"
    ADD CONSTRAINT "payent_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_allowances"
    ADD CONSTRAINT "payroll_allowances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_allowances"
    ADD CONSTRAINT "payroll_allowances_payroll_detail_id_fkey" FOREIGN KEY ("payroll_detail_id") REFERENCES "public"."payroll_details"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_approvals"
    ADD CONSTRAINT "payroll_approvals_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_deductions"
    ADD CONSTRAINT "payroll_deductions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_deductions_new"
    ADD CONSTRAINT "payroll_deductions_new_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_deductions_new"
    ADD CONSTRAINT "payroll_deductions_new_payroll_detail_id_fkey" FOREIGN KEY ("payroll_detail_id") REFERENCES "public"."payroll_details"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_deductions_new"
    ADD CONSTRAINT "payroll_deductions_new_payroll_header_id_fkey" FOREIGN KEY ("payroll_header_id") REFERENCES "public"."payroll_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_details"
    ADD CONSTRAINT "payroll_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_details"
    ADD CONSTRAINT "payroll_details_payroll_header_id_fkey" FOREIGN KEY ("payroll_header_id") REFERENCES "public"."payroll_headers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_details"
    ADD CONSTRAINT "payroll_details_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_headers"
    ADD CONSTRAINT "payroll_headers_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_disabled_by_fkey" FOREIGN KEY ("disabled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."salary_history"
    ADD CONSTRAINT "salary_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stacode_audit"
    ADD CONSTRAINT "stacode_audit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."undeducted_obligations"
    ADD CONSTRAINT "undeducted_obligations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."undeducted_obligations"
    ADD CONSTRAINT "undeducted_obligations_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."undeducted_obligations"
    ADD CONSTRAINT "undeducted_obligations_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "public"."payroll_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_actions"
    ADD CONSTRAINT "workflow_actions_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE CASCADE;



ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ca_employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ca_employees_delete" ON "public"."ca_employees" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ca_employees_insert" ON "public"."ca_employees" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ca_employees_select" ON "public"."ca_employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ca_employees_update" ON "public"."ca_employees" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ca_payroll_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ca_payroll_details_delete" ON "public"."ca_payroll_details" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_details_insert" ON "public"."ca_payroll_details" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ca_payroll_details_select" ON "public"."ca_payroll_details" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_details_update" ON "public"."ca_payroll_details" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ca_payroll_headers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ca_payroll_headers_delete" ON "public"."ca_payroll_headers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_headers_insert" ON "public"."ca_payroll_headers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ca_payroll_headers_select" ON "public"."ca_payroll_headers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_headers_update" ON "public"."ca_payroll_headers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ca_payroll_signatories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ca_payroll_signatories_delete" ON "public"."ca_payroll_signatories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_signatories_insert" ON "public"."ca_payroll_signatories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ca_payroll_signatories_select" ON "public"."ca_payroll_signatories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ca_payroll_signatories_update" ON "public"."ca_payroll_signatories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cache_select" ON "public"."dashboard_stats_cache" FOR SELECT TO "authenticated" USING ("public"."is_data_admin"());



ALTER TABLE "public"."dashboard_stats_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_div_delete" ON "public"."dbf_divtable" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_div_insert" ON "public"."dbf_divtable" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_div_select" ON "public"."dbf_divtable" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_div_update" ON "public"."dbf_divtable" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_divtable" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_exc_delete" ON "public"."dbf_excluded" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_exc_insert" ON "public"."dbf_excluded" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_exc_select" ON "public"."dbf_excluded" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_exc_update" ON "public"."dbf_excluded" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_excluded" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_inc_delete" ON "public"."dbf_included" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_inc_insert" ON "public"."dbf_included" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_inc_select" ON "public"."dbf_included" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_inc_update" ON "public"."dbf_included" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_included" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_pay_delete" ON "public"."dbf_payrolls" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pay_insert" ON "public"."dbf_payrolls" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pay_select" ON "public"."dbf_payrolls" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pay_update" ON "public"."dbf_payrolls" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_payrolls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_pye1_delete" ON "public"."dbf_pyent1" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye1_insert" ON "public"."dbf_pyent1" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pye1_select" ON "public"."dbf_pyent1" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye1_update" ON "public"."dbf_pyent1" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pye2_delete" ON "public"."dbf_pyent2" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye2_insert" ON "public"."dbf_pyent2" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pye2_select" ON "public"."dbf_pyent2" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye2_update" ON "public"."dbf_pyent2" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pye_delete" ON "public"."dbf_pyent" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye_insert" ON "public"."dbf_pyent" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_pye_select" ON "public"."dbf_pyent" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_pye_update" ON "public"."dbf_pyent" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_pyent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbf_pyent1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbf_pyent2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbf_restore_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_stn_delete" ON "public"."dbf_stntable" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_stn_insert" ON "public"."dbf_stntable" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_stn_select" ON "public"."dbf_stntable" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_stn_update" ON "public"."dbf_stntable" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_stntable" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_sync_delete" ON "public"."dbf_sync_sessions" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "dbf_sync_insert" ON "public"."dbf_sync_sessions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "dbf_sync_select" ON "public"."dbf_sync_sessions" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



ALTER TABLE "public"."dbf_sync_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dbf_sync_update" ON "public"."dbf_sync_sessions" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."deduction_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deduction_codes_delete" ON "public"."deduction_codes" FOR DELETE TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "deduction_codes_insert" ON "public"."deduction_codes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "deduction_codes_select" ON "public"."deduction_codes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "deduction_codes_update" ON "public"."deduction_codes" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."deduction_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deductions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deductions_delete" ON "public"."deductions" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "deductions_insert" ON "public"."deductions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "deductions_select" ON "public"."deductions" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "deductions"."employee_id") AND ("e"."divcode" = "public"."get_current_user_divcode"()))))) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "deductions"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "deductions"."employee_id") AND (("e"."empno" = "public"."get_current_user_empno"()) OR ("e"."employee_number" = "public"."get_current_user_empno"()))))))));



CREATE POLICY "deductions_update" ON "public"."deductions" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "delete_division_office_admin" ON "public"."division_office" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text") AND ("p"."status" = 'approved'::"text")))));



CREATE POLICY "delete_initial_payroll_entries" ON "public"."initial_payroll_entries" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_initial_payroll_records" ON "public"."initial_payroll_records" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_initial_payroll_transfers" ON "public"."initial_payroll_transfers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_non_plantilla" ON "public"."non_plantilla_employees" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_own_gsis_import_logs" ON "public"."gsis_import_logs" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "delete_own_pli_import_logs" ON "public"."pli_import_logs" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "delete_own_position_import_logs" ON "public"."position_import_logs" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "delete_own_restores" ON "public"."dbf_restore_history" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_payroll_number_counter" ON "public"."payroll_number_counter" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_plantilla_headers" ON "public"."plantilla_headers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_plantilla_import_logs" ON "public"."plantilla_import_logs" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_position_management" ON "public"."position_management" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_schools" ON "public"."schools" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "delete_signatories" ON "public"."signatories" FOR DELETE TO "authenticated" USING (true);



ALTER TABLE "public"."device_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."division_office" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."divisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "divisions_delete" ON "public"."divisions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "divisions_insert" ON "public"."divisions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "divisions_select" ON "public"."divisions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "divisions_update" ON "public"."divisions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."earnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "earnings_delete" ON "public"."earnings" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "earnings_insert" ON "public"."earnings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "earnings_select" ON "public"."earnings" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "earnings"."employee_id") AND ("e"."divcode" = "public"."get_current_user_divcode"()))))) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "earnings"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "earnings"."employee_id") AND (("e"."empno" = "public"."get_current_user_empno"()) OR ("e"."employee_number" = "public"."get_current_user_empno"()))))))));



CREATE POLICY "earnings_update" ON "public"."earnings" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_delete" ON "public"."employees" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "employees_insert" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "employees_select" ON "public"."employees" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND ("divcode" = "public"."get_current_user_divcode"())) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (("empno" = "public"."get_current_user_empno"()) OR ("employee_number" = "public"."get_current_user_empno"())))));



CREATE POLICY "employees_update" ON "public"."employees" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."gsis_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."initial_payroll_absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."initial_payroll_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."initial_payroll_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."initial_payroll_transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_allowances" ON "public"."payroll_allowances" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['payroll_admin'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text", 'hr_administrator'::"text"])));



CREATE POLICY "insert_attendance" ON "public"."attendance_records" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'hr_administrator'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"])));



CREATE POLICY "insert_audit_logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_deduction_history" ON "public"."deduction_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "insert_device_logs" ON "public"."device_logs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "insert_division_office_admin" ON "public"."division_office" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text", 'hr_administrator'::"text"])) AND ("p"."status" = 'approved'::"text")))));



CREATE POLICY "insert_initial_payroll_entries" ON "public"."initial_payroll_entries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_initial_payroll_records" ON "public"."initial_payroll_records" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_initial_payroll_transfers" ON "public"."initial_payroll_transfers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_leave" ON "public"."leave_records" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['ess'::"text", 'school_coordinator'::"text", 'hr_administrator'::"text"])));



CREATE POLICY "insert_loan_requests" ON "public"."loan_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['ess'::"text", 'school_coordinator'::"text", 'hr_administrator'::"text", 'payroll_officer'::"text"])));



CREATE POLICY "insert_loan_verifications" ON "public"."loan_verifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = 'loan_verifier'::"text"));



CREATE POLICY "insert_login_attempts_anon" ON "public"."login_attempts" FOR INSERT TO "anon" WITH CHECK ((("user_id" IS NULL) AND ("success" = false) AND (("failure_reason" IS NULL) OR ("failure_reason" = ANY (ARRAY['invalid_credentials'::"text", 'account_locked'::"text", 'email_unverified'::"text", 'unexpected_error'::"text"])))));



CREATE POLICY "insert_login_attempts_authenticated" ON "public"."login_attempts" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (("user_id" IS NULL) AND ("success" = false) AND (("failure_reason" IS NULL) OR ("failure_reason" = ANY (ARRAY['invalid_credentials'::"text", 'account_locked'::"text", 'email_unverified'::"text", 'unexpected_error'::"text"]))))));



CREATE POLICY "insert_login_logs_anon" ON "public"."login_logs" FOR INSERT TO "anon" WITH CHECK ((("user_id" IS NULL) AND ("success" = false) AND (("failure_reason" IS NULL) OR ("failure_reason" = ANY (ARRAY['invalid_credentials'::"text", 'account_locked'::"text", 'email_unverified'::"text", 'unexpected_error'::"text"])))));



CREATE POLICY "insert_login_logs_auth" ON "public"."login_logs" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (("user_id" IS NULL) AND ("success" = false))));



CREATE POLICY "insert_non_plantilla" ON "public"."non_plantilla_employees" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_own_gsis_import_logs" ON "public"."gsis_import_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "insert_own_otp" ON "public"."otp_codes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_pli_import_logs" ON "public"."pli_import_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "insert_own_position_import_logs" ON "public"."position_import_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "insert_own_restores" ON "public"."dbf_restore_history" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_password_reset" ON "public"."password_reset_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_payroll_approvals" ON "public"."payroll_approvals" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_workflow_participant"());



CREATE POLICY "insert_payroll_details" ON "public"."payroll_details" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['payroll_admin'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"])));



CREATE POLICY "insert_payroll_headers" ON "public"."payroll_headers" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['payroll_admin'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"])));



CREATE POLICY "insert_payroll_number_counter" ON "public"."payroll_number_counter" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_payroll_periods" ON "public"."payroll_periods" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['payroll_admin'::"text", 'payroll_officer'::"text", 'hr_administrator'::"text"])));



CREATE POLICY "insert_pd_new" ON "public"."payroll_deductions_new" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['payroll_admin'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"])));



CREATE POLICY "insert_plantilla" ON "public"."plantilla_positions" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = 'hr_administrator'::"text"));



CREATE POLICY "insert_plantilla_headers" ON "public"."plantilla_headers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_plantilla_import_logs" ON "public"."plantilla_import_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_position_management" ON "public"."position_management" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_salary_history" ON "public"."salary_history" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = 'hr_administrator'::"text"));



CREATE POLICY "insert_schools" ON "public"."schools" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_signatories" ON "public"."signatories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_workflow_actions" ON "public"."workflow_actions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_workflow_participant"());



CREATE POLICY "ipa_delete" ON "public"."initial_payroll_absences" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ipa_insert" ON "public"."initial_payroll_absences" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ipa_select" ON "public"."initial_payroll_absences" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ipa_update" ON "public"."initial_payroll_absences" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "ips_abs_delete" ON "public"."ips_absences" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ips_abs_insert" ON "public"."ips_absences" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ips_abs_select" ON "public"."ips_absences" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ips_abs_update" ON "public"."ips_absences" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ips_absences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ips_audit_insert" ON "public"."ips_audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."ips_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ips_audit_select" ON "public"."ips_audit_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ips_emp_delete" ON "public"."ips_employees" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ips_emp_insert" ON "public"."ips_employees" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ips_emp_select" ON "public"."ips_employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ips_emp_update" ON "public"."ips_employees" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ips_employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ips_payroll_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ips_payroll_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ips_pd_delete" ON "public"."ips_payroll_details" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ips_pd_insert" ON "public"."ips_payroll_details" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ips_pd_select" ON "public"."ips_payroll_details" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ips_pd_update" ON "public"."ips_payroll_details" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "ips_pp_delete" ON "public"."ips_payroll_periods" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "ips_pp_insert" ON "public"."ips_payroll_periods" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ips_pp_select" ON "public"."ips_payroll_periods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ips_pp_update" ON "public"."ips_payroll_periods" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."leave_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."non_plantilla_employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pay_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pay_periods_delete" ON "public"."pay_periods" FOR DELETE TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "pay_periods_insert" ON "public"."pay_periods" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text"])));



CREATE POLICY "pay_periods_select" ON "public"."pay_periods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pay_periods_update" ON "public"."pay_periods" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text"]))) WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text"])));



ALTER TABLE "public"."payent" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payent_delete" ON "public"."payent" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "payent_insert" ON "public"."payent" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "payent_select" ON "public"."payent" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payent"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (("empno" = "public"."get_current_user_empno"()) OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payent"."employee_id") AND (("e"."empno" = "public"."get_current_user_empno"()) OR ("e"."employee_number" = "public"."get_current_user_empno"())))))))));



CREATE POLICY "payent_update" ON "public"."payent" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."payroll_allowances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_deductions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_deductions_delete" ON "public"."payroll_deductions" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "payroll_deductions_insert" ON "public"."payroll_deductions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."payroll_deductions_new" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_deductions_select" ON "public"."payroll_deductions" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_deductions"."employee_id") AND ("e"."divcode" = "public"."get_current_user_divcode"()))))) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (("empno" = "public"."get_current_user_empno"()) OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_deductions"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"())))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("empno" = "public"."get_current_user_empno"()))));



CREATE POLICY "payroll_deductions_update" ON "public"."payroll_deductions" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."payroll_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_entries_delete" ON "public"."payroll_entries" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "payroll_entries_insert" ON "public"."payroll_entries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "payroll_entries_select" ON "public"."payroll_entries" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_entries"."employee_id") AND ("e"."divcode" = "public"."get_current_user_divcode"()))))) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_entries"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_entries"."employee_id") AND (("e"."empno" = "public"."get_current_user_empno"()) OR ("e"."employee_number" = "public"."get_current_user_empno"()))))))));



CREATE POLICY "payroll_entries_update" ON "public"."payroll_entries" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."payroll_formulas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_groups_delete" ON "public"."payroll_groups" FOR DELETE TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "payroll_groups_insert" ON "public"."payroll_groups" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "payroll_groups_select" ON "public"."payroll_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payroll_groups_update" ON "public"."payroll_groups" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."payroll_headers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_number_counter" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payrolls_dbf" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pdbf_delete" ON "public"."payrolls_dbf" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "pdbf_insert" ON "public"."payrolls_dbf" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "pdbf_select" ON "public"."payrolls_dbf" FOR SELECT TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "pdbf_update" ON "public"."payrolls_dbf" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."plantilla_headers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plantilla_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plantilla_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pli_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."position_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."position_management" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."regions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "regions_delete" ON "public"."regions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "regions_insert" ON "public"."regions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "regions_select" ON "public"."regions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "regions_update" ON "public"."regions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salary_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salary_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salary_schedule_delete" ON "public"."salary_schedule" FOR DELETE TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "salary_schedule_insert" ON "public"."salary_schedule" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "salary_schedule_select" ON "public"."salary_schedule" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "salary_schedule_update" ON "public"."salary_schedule" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_events_insert" ON "public"."security_events" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "security_events_select" ON "public"."security_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."security_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_settings_select" ON "public"."security_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "security_settings_update" ON "public"."security_settings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "select_all_login_attempts_admin" ON "public"."login_attempts" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "select_all_profiles_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "select_allowances" ON "public"."payroll_allowances" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_allowances"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_attendance" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_audit_logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['super_admin'::"text", 'viewer'::"text"])));



CREATE POLICY "select_deduction_history" ON "public"."deduction_history" FOR SELECT TO "authenticated" USING ("public"."is_data_admin"());



CREATE POLICY "select_device_logs_admin" ON "public"."device_logs" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = 'payroll_admin'::"text"));



CREATE POLICY "select_division_office" ON "public"."division_office" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_gsis_import_logs" ON "public"."gsis_import_logs" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR ("auth"."uid"() = "uploaded_by_id")));



CREATE POLICY "select_initial_payroll_entries" ON "public"."initial_payroll_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_initial_payroll_records" ON "public"."initial_payroll_records" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_initial_payroll_transfers" ON "public"."initial_payroll_transfers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_leave" ON "public"."leave_records" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR ("public"."get_current_user_role"() = 'hr_administrator'::"text") OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_loan_requests" ON "public"."loan_requests" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR ("public"."get_current_user_role"() = ANY (ARRAY['loan_verifier'::"text", 'hr_administrator'::"text"])) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_loan_verifications" ON "public"."loan_verifications" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR ("public"."get_current_user_role"() = ANY (ARRAY['loan_verifier'::"text", 'hr_administrator'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"]))));



CREATE POLICY "select_login_logs_admin" ON "public"."login_logs" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = 'payroll_admin'::"text"));



CREATE POLICY "select_non_plantilla" ON "public"."non_plantilla_employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_own_device_logs" ON "public"."device_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_login_attempts" ON "public"."login_attempts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_login_logs" ON "public"."login_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_otp" ON "public"."otp_codes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_position_import_logs" ON "public"."position_import_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "select_own_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "select_own_reset_tokens" ON "public"."password_reset_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_restores" ON "public"."dbf_restore_history" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_payroll_approvals" ON "public"."payroll_approvals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_payroll_details" ON "public"."payroll_details" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_payroll_headers" ON "public"."payroll_headers" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"()))));



CREATE POLICY "select_payroll_number_counter" ON "public"."payroll_number_counter" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_payroll_periods" ON "public"."payroll_periods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_pd_new" ON "public"."payroll_deductions_new" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "payroll_deductions_new"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_plantilla" ON "public"."plantilla_positions" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND ("stacode" = "public"."get_current_user_stacode"())) OR ("public"."get_current_user_role"() = 'hr_administrator'::"text")));



CREATE POLICY "select_plantilla_headers" ON "public"."plantilla_headers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_plantilla_import_logs" ON "public"."plantilla_import_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_pli_import_logs" ON "public"."pli_import_logs" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR ("auth"."uid"() = "uploaded_by_id")));



CREATE POLICY "select_position_management" ON "public"."position_management" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_salary_history" ON "public"."salary_history" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "salary_history"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR ("public"."get_current_user_role"() = 'hr_administrator'::"text") OR (("public"."get_current_user_role"() = 'ess'::"text") AND ("employee_number" = "public"."get_current_user_empno"()))));



CREATE POLICY "select_schools" ON "public"."schools" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_signatories" ON "public"."signatories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_workflow_actions" ON "public"."workflow_actions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."signatories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stacode_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stacode_audit_insert" ON "public"."stacode_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "stacode_audit_select" ON "public"."stacode_audit" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['super_admin'::"text", 'auditor'::"text", 'division_finance'::"text"])));



CREATE POLICY "super_admin_manage_payroll_definitions" ON "public"."payroll_definitions" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "super_admin_manage_payroll_formulas" ON "public"."payroll_formulas" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."undeducted_obligations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "undeducted_obligations_delete" ON "public"."undeducted_obligations" FOR DELETE TO "authenticated" USING ("public"."is_data_writer"());



CREATE POLICY "undeducted_obligations_insert" ON "public"."undeducted_obligations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "undeducted_obligations_select" ON "public"."undeducted_obligations" FOR SELECT TO "authenticated" USING (("public"."is_data_admin"() OR (("public"."get_current_user_role"() = 'division_finance'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "undeducted_obligations"."employee_id") AND ("e"."divcode" = "public"."get_current_user_divcode"()))))) OR (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'school_head'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "undeducted_obligations"."employee_id") AND ("e"."stacode" = "public"."get_current_user_stacode"()))))) OR (("public"."get_current_user_role"() = 'ess'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "undeducted_obligations"."employee_id") AND (("e"."empno" = "public"."get_current_user_empno"()) OR ("e"."employee_number" = "public"."get_current_user_empno"()))))))));



CREATE POLICY "undeducted_obligations_update" ON "public"."undeducted_obligations" FOR UPDATE TO "authenticated" USING ("public"."is_data_writer"()) WITH CHECK ("public"."is_data_writer"());



CREATE POLICY "update_all_profiles_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = 'super_admin'::"text")) WITH CHECK (("public"."get_current_user_role"() = 'super_admin'::"text"));



CREATE POLICY "update_attendance" ON "public"."attendance_records" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'hr_administrator'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"]))) WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['school_coordinator'::"text", 'hr_administrator'::"text", 'payroll_officer'::"text", 'payroll_processor'::"text"])));



CREATE POLICY "update_division_office_admin" ON "public"."division_office" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text", 'hr_administrator'::"text"])) AND ("p"."status" = 'approved'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['super_admin'::"text", 'payroll_admin'::"text", 'hr_administrator'::"text"])) AND ("p"."status" = 'approved'::"text")))));



CREATE POLICY "update_initial_payroll_entries" ON "public"."initial_payroll_entries" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_initial_payroll_records" ON "public"."initial_payroll_records" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_initial_payroll_transfers" ON "public"."initial_payroll_transfers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_leave" ON "public"."leave_records" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['school_head'::"text", 'hr_administrator'::"text"]))) WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['school_head'::"text", 'hr_administrator'::"text"])));



CREATE POLICY "update_loan_requests" ON "public"."loan_requests" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = ANY (ARRAY['loan_verifier'::"text", 'hr_administrator'::"text"]))) WITH CHECK (("public"."get_current_user_role"() = ANY (ARRAY['loan_verifier'::"text", 'hr_administrator'::"text"])));



CREATE POLICY "update_non_plantilla" ON "public"."non_plantilla_employees" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_own_gsis_import_logs" ON "public"."gsis_import_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id")) WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "update_own_otp" ON "public"."otp_codes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_pli_import_logs" ON "public"."pli_import_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id")) WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "update_own_position_import_logs" ON "public"."position_import_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "uploaded_by_id")) WITH CHECK (("auth"."uid"() = "uploaded_by_id"));



CREATE POLICY "update_own_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "update_own_reset_tokens" ON "public"."password_reset_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_restores" ON "public"."dbf_restore_history" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_payroll_approvals" ON "public"."payroll_approvals" FOR UPDATE TO "authenticated" USING ("public"."is_workflow_participant"()) WITH CHECK ("public"."is_workflow_participant"());



CREATE POLICY "update_payroll_details" ON "public"."payroll_details" FOR UPDATE TO "authenticated" USING ("public"."is_workflow_participant"()) WITH CHECK ("public"."is_workflow_participant"());



CREATE POLICY "update_payroll_headers" ON "public"."payroll_headers" FOR UPDATE TO "authenticated" USING ("public"."is_workflow_participant"()) WITH CHECK ("public"."is_workflow_participant"());



CREATE POLICY "update_payroll_number_counter" ON "public"."payroll_number_counter" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_payroll_periods" ON "public"."payroll_periods" FOR UPDATE TO "authenticated" USING ("public"."is_workflow_participant"()) WITH CHECK (true);



CREATE POLICY "update_plantilla" ON "public"."plantilla_positions" FOR UPDATE TO "authenticated" USING (("public"."get_current_user_role"() = 'hr_administrator'::"text")) WITH CHECK (("public"."get_current_user_role"() = 'hr_administrator'::"text"));



CREATE POLICY "update_plantilla_headers" ON "public"."plantilla_headers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_plantilla_import_logs" ON "public"."plantilla_import_logs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_position_management" ON "public"."position_management" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_schools" ON "public"."schools" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update_signatories" ON "public"."signatories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."workflow_actions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



















































































































































GRANT ALL ON FUNCTION "public"."_pd_compute"("p_available" numeric, "p_sorted" "jsonb", "p_mandatory_loans" numeric, "p_station" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_pd_compute"("p_available" numeric, "p_sorted" "jsonb", "p_mandatory_loans" numeric, "p_station" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pd_compute"("p_available" numeric, "p_sorted" "jsonb", "p_mandatory_loans" numeric, "p_station" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pd_mandatory"("p_agency" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_pd_mandatory"("p_agency" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pd_mandatory"("p_agency" "text", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pd_mandatory_loan"("p_agency" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_pd_mandatory_loan"("p_agency" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pd_mandatory_loan"("p_agency" "text", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pd_priority"("p_agency" "text", "p_type" "text", "p_dedcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_pd_priority"("p_agency" "text", "p_type" "text", "p_dedcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pd_priority"("p_agency" "text", "p_type" "text", "p_dedcode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_trig_refresh_dashboard_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trig_refresh_dashboard_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trig_refresh_dashboard_cache"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text", "p_signature_phrase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text", "p_signature_phrase" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text", "p_signature_phrase" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_workflow_step"("p_period_id" "uuid", "p_action" "text", "p_remarks" "text", "p_signature_phrase" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_user"("p_target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_user"("p_target_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_user"("p_target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_user"("p_target_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_schools_to_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_schools_to_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_schools_to_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_employee_row"("p_stacode" "text", "p_empno" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_employee_row"("p_stacode" "text", "p_empno" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_employee_row"("p_stacode" "text", "p_empno" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_otps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_otps"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_otps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_otps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_schools_from_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."clear_schools_from_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_schools_from_division"("p_division_id" "uuid", "p_school_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_division"("p_division_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_division"("p_division_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_division"("p_division_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_region"("p_region_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_region"("p_region_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_region"("p_region_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_role_permission"("p_role" "text", "p_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."disable_user"("p_target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."disable_user"("p_target_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."disable_user"("p_target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_user"("p_target_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enable_user"("p_target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enable_user"("p_target_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enable_user"("p_target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_user"("p_target_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_posted_entry_invariants"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_posted_entry_invariants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_posted_entry_invariants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_non_plantilla_before_upsert"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_non_plantilla_before_upsert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_non_plantilla_before_upsert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_monthly_periods"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_monthly_periods"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_monthly_periods"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_empno"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_empno"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_empno"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_stacode"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_stacode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_stacode"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_divcode"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_divcode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_divcode"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_user_division_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_user_division_codes"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_division_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_division_codes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_empno"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_empno"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_empno"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_stacode"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_stacode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_stacode"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("category" "text", "p_regcode" "text", "p_divcodes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("category" "text", "p_regcode" "text", "p_divcodes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("category" "text", "p_regcode" "text", "p_divcodes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dbf_table_counts_by_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dbf_table_counts_by_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dbf_table_counts_by_category"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_deduction_engine_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"("p_regcode" "text", "p_divcodes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"("p_regcode" "text", "p_divcodes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deduction_engine_stats"("p_regcode" "text", "p_divcodes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deductions_summary"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payroll_group_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payroll_group_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_payroll_group_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payroll_group_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payroll_history_by_month"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payroll_history_by_month"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payroll_history_by_month"("p_year" integer, "p_regcode" "text", "p_divcode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payroll_register_totals"("p_period_id" "uuid", "p_emp_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_role_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_role_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_role_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_role_permissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_workflow_steps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_workflow_steps"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_workflow_steps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workflow_steps"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role_level"("p_min_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role_level"("p_min_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role_level"("p_min_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role_level"("p_min_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hash_otp"("otp_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hash_otp"("otp_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hash_otp"("otp_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hash_otp"("otp_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_data_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_data_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_data_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_data_writer"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_data_writer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_data_writer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workflow_participant"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_workflow_participant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workflow_participant"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_mfa_code"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_mfa_code"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_mfa_code"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_mfa_code"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_payroll_period"("p_period_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_table_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_table_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_table_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_table_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_email_verified"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_email_verified"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_email_verified"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_email_verified"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_closed_period_reopen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_closed_period_reopen"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_closed_period_reopen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_closed_period_reopen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_posted_entry_modification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_posted_entry_modification"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_posted_entry_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_posted_entry_modification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."query_dedfile"("p_search" "text", "p_stacode" "text", "p_dedcode" "text", "p_empno" "text", "p_period" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_sort_key" "text", "p_sort_dir" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."query_dedfile"("p_search" "text", "p_stacode" "text", "p_dedcode" "text", "p_empno" "text", "p_period" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_sort_key" "text", "p_sort_dir" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."query_dedfile"("p_search" "text", "p_stacode" "text", "p_dedcode" "text", "p_empno" "text", "p_period" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_sort_key" "text", "p_sort_dir" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_dedfile"("p_search" "text", "p_stacode" "text", "p_dedcode" "text", "p_empno" "text", "p_period" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_sort_key" "text", "p_sort_dir" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."query_employees"("p_search" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_status" "text", "p_group_id" "uuid", "p_stacode" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_scope_column" "text", "p_scope_value" "text", "p_division_id" "uuid", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."query_employees"("p_search" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_status" "text", "p_group_id" "uuid", "p_stacode" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_scope_column" "text", "p_scope_value" "text", "p_division_id" "uuid", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."query_employees"("p_search" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_status" "text", "p_group_id" "uuid", "p_stacode" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_scope_column" "text", "p_scope_value" "text", "p_division_id" "uuid", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_employees"("p_search" "text", "p_stacode_min" integer, "p_stacode_max" integer, "p_status" "text", "p_group_id" "uuid", "p_stacode" "text", "p_page" integer, "p_page_size" integer, "p_count_only" boolean, "p_scope_column" "text", "p_scope_value" "text", "p_division_id" "uuid", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."query_payroll_deductions"("p_search" "text", "p_status_filter" "text", "p_type_filter" "text", "p_regcode" "text", "p_divcodes" "text"[], "p_stacode_min" integer, "p_stacode_max" integer, "p_page" integer, "p_page_size" integer, "p_count_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."query_payroll_deductions"("p_search" "text", "p_status_filter" "text", "p_type_filter" "text", "p_regcode" "text", "p_divcodes" "text"[], "p_stacode_min" integer, "p_stacode_max" integer, "p_page" integer, "p_page_size" integer, "p_count_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."query_payroll_deductions"("p_search" "text", "p_status_filter" "text", "p_type_filter" "text", "p_regcode" "text", "p_divcodes" "text"[], "p_stacode_min" integer, "p_stacode_max" integer, "p_page" integer, "p_page_size" integer, "p_count_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_payroll_deductions"("p_search" "text", "p_status_filter" "text", "p_type_filter" "text", "p_regcode" "text", "p_divcodes" "text"[], "p_stacode_min" integer, "p_stacode_max" integer, "p_page" integer, "p_page_size" integer, "p_count_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."query_schools_with_stats"("p_school_type" "text", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."query_schools_with_stats"("p_school_type" "text", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."query_schools_with_stats"("p_school_type" "text", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_schools_with_stats"("p_school_type" "text", "p_division_ids" "uuid"[], "p_regcode" "text", "p_divcodes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_failed_login"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_failed_login"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_failed_login"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_failed_login"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text", "p_device_fingerprint" "text", "p_ip_address" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text", "p_device_fingerprint" "text", "p_ip_address" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text", "p_device_fingerprint" "text", "p_ip_address" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_login"("p_email" "text", "p_success" boolean, "p_failure_reason" "text", "p_device_fingerprint" "text", "p_ip_address" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text", "p_description" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text", "p_description" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text", "p_description" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_security_event"("p_event_type" "text", "p_severity" "text", "p_description" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_successful_login"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_successful_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_successful_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_successful_login"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_dashboard_cache"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_dashboard_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_dashboard_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_dashboard_cache"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_user"("p_target_user" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_dashboard_refresh"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_dashboard_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_dashboard_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_dashboard_refresh"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_payroll"("p_pay_period_id" "uuid", "p_employee_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_payroll_period"("p_pay_period_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_payroll_engine"("p_pay_period_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."run_payroll_engine"("p_pay_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_payroll_engine"("p_pay_period_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_assigned_stacode"("p_target_user" "uuid", "p_stacode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_digital_signature"("p_signature_phrase" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_employee_number"("p_target_user" "uuid", "p_employee_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_payroll_def_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_payroll_def_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_payroll_def_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_division"("p_target_user" "uuid", "p_region_id" "uuid", "p_division_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_division"("p_target_user" "uuid", "p_region_id" "uuid", "p_division_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_division"("p_target_user" "uuid", "p_region_id" "uuid", "p_division_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_mfa"("p_target_user" "uuid", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_role"("p_target_user" "uuid", "p_new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_division_codes"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_division_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_division_codes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_email_verified_from_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_email_verified_from_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_email_verified_from_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_employees_to_division"("p_division_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_employees_to_division"("p_division_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_employees_to_division"("p_division_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlock_user_account"("p_target_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_schools_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_schools_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_schools_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_division"("p_division_id" "uuid", "p_region_id" "uuid", "p_region_code" "text", "p_division_code" "text", "p_division_name" "text", "p_features" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_division"("p_division_id" "uuid", "p_region_id" "uuid", "p_region_code" "text", "p_division_code" "text", "p_division_name" "text", "p_features" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_division"("p_division_id" "uuid", "p_region_id" "uuid", "p_region_code" "text", "p_division_code" "text", "p_division_name" "text", "p_features" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_region"("p_region_id" "uuid", "p_region_code" "text", "p_region_name" "text", "p_sort_order" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_region"("p_region_id" "uuid", "p_region_code" "text", "p_region_name" "text", "p_sort_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_region"("p_region_id" "uuid", "p_region_code" "text", "p_region_name" "text", "p_sort_order" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_role_permission"("p_role" "text", "p_permission" "text", "p_granted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_employee_for_approval"("p_employee_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_nthp_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_nthp_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_nthp_on_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_mfa_code"("p_email" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_otp"("otp_code" "text", "stored_hash" "text") TO "service_role";












GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ca_employees" TO "anon";
GRANT ALL ON TABLE "public"."ca_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."ca_employees" TO "service_role";



GRANT ALL ON TABLE "public"."ca_payroll_details" TO "anon";
GRANT ALL ON TABLE "public"."ca_payroll_details" TO "authenticated";
GRANT ALL ON TABLE "public"."ca_payroll_details" TO "service_role";



GRANT ALL ON TABLE "public"."ca_payroll_headers" TO "anon";
GRANT ALL ON TABLE "public"."ca_payroll_headers" TO "authenticated";
GRANT ALL ON TABLE "public"."ca_payroll_headers" TO "service_role";



GRANT ALL ON TABLE "public"."ca_payroll_signatories" TO "anon";
GRANT ALL ON TABLE "public"."ca_payroll_signatories" TO "authenticated";
GRANT ALL ON TABLE "public"."ca_payroll_signatories" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_stats_cache" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_stats_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_stats_cache" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_divtable" TO "anon";
GRANT ALL ON TABLE "public"."dbf_divtable" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_divtable" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_excluded" TO "anon";
GRANT ALL ON TABLE "public"."dbf_excluded" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_excluded" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_included" TO "anon";
GRANT ALL ON TABLE "public"."dbf_included" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_included" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_payrolls" TO "anon";
GRANT ALL ON TABLE "public"."dbf_payrolls" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_payrolls" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_pyent" TO "anon";
GRANT ALL ON TABLE "public"."dbf_pyent" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_pyent" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_pyent1" TO "anon";
GRANT ALL ON TABLE "public"."dbf_pyent1" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_pyent1" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_pyent2" TO "anon";
GRANT ALL ON TABLE "public"."dbf_pyent2" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_pyent2" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_restore_history" TO "anon";
GRANT ALL ON TABLE "public"."dbf_restore_history" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_restore_history" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_stntable" TO "anon";
GRANT ALL ON TABLE "public"."dbf_stntable" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_stntable" TO "service_role";



GRANT ALL ON TABLE "public"."dbf_sync_sessions" TO "anon";
GRANT ALL ON TABLE "public"."dbf_sync_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."dbf_sync_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."deduction_codes" TO "anon";
GRANT ALL ON TABLE "public"."deduction_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."deduction_codes" TO "service_role";



GRANT ALL ON TABLE "public"."deduction_history" TO "anon";
GRANT ALL ON TABLE "public"."deduction_history" TO "authenticated";
GRANT ALL ON TABLE "public"."deduction_history" TO "service_role";



GRANT ALL ON TABLE "public"."deductions" TO "anon";
GRANT ALL ON TABLE "public"."deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."deductions" TO "service_role";



GRANT ALL ON TABLE "public"."device_logs" TO "anon";
GRANT ALL ON TABLE "public"."device_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."device_logs" TO "service_role";



GRANT ALL ON TABLE "public"."division_office" TO "anon";
GRANT ALL ON TABLE "public"."division_office" TO "authenticated";
GRANT ALL ON TABLE "public"."division_office" TO "service_role";



GRANT ALL ON TABLE "public"."divisions" TO "anon";
GRANT ALL ON TABLE "public"."divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."divisions" TO "service_role";



GRANT ALL ON TABLE "public"."earnings" TO "anon";
GRANT ALL ON TABLE "public"."earnings" TO "authenticated";
GRANT ALL ON TABLE "public"."earnings" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."gsis_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."gsis_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."gsis_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."initial_payroll_absences" TO "anon";
GRANT ALL ON TABLE "public"."initial_payroll_absences" TO "authenticated";
GRANT ALL ON TABLE "public"."initial_payroll_absences" TO "service_role";



GRANT ALL ON TABLE "public"."initial_payroll_entries" TO "anon";
GRANT ALL ON TABLE "public"."initial_payroll_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."initial_payroll_entries" TO "service_role";



GRANT ALL ON TABLE "public"."initial_payroll_records" TO "anon";
GRANT ALL ON TABLE "public"."initial_payroll_records" TO "authenticated";
GRANT ALL ON TABLE "public"."initial_payroll_records" TO "service_role";



GRANT ALL ON TABLE "public"."initial_payroll_transfers" TO "anon";
GRANT ALL ON TABLE "public"."initial_payroll_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."initial_payroll_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."ips_absences" TO "anon";
GRANT ALL ON TABLE "public"."ips_absences" TO "authenticated";
GRANT ALL ON TABLE "public"."ips_absences" TO "service_role";



GRANT ALL ON TABLE "public"."ips_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."ips_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ips_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ips_employees" TO "anon";
GRANT ALL ON TABLE "public"."ips_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."ips_employees" TO "service_role";



GRANT ALL ON TABLE "public"."ips_payroll_details" TO "anon";
GRANT ALL ON TABLE "public"."ips_payroll_details" TO "authenticated";
GRANT ALL ON TABLE "public"."ips_payroll_details" TO "service_role";



GRANT ALL ON TABLE "public"."ips_payroll_periods" TO "anon";
GRANT ALL ON TABLE "public"."ips_payroll_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."ips_payroll_periods" TO "service_role";



GRANT ALL ON TABLE "public"."leave_records" TO "anon";
GRANT ALL ON TABLE "public"."leave_records" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_records" TO "service_role";



GRANT ALL ON TABLE "public"."loan_requests" TO "anon";
GRANT ALL ON TABLE "public"."loan_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_requests" TO "service_role";



GRANT ALL ON TABLE "public"."loan_verifications" TO "anon";
GRANT ALL ON TABLE "public"."loan_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."login_attempts" TO "anon";
GRANT ALL ON TABLE "public"."login_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."login_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."login_logs" TO "anon";
GRANT ALL ON TABLE "public"."login_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."login_logs" TO "service_role";



GRANT ALL ON TABLE "public"."non_plantilla_employees" TO "anon";
GRANT ALL ON TABLE "public"."non_plantilla_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."non_plantilla_employees" TO "service_role";



GRANT ALL ON TABLE "public"."otp_codes" TO "anon";
GRANT ALL ON TABLE "public"."otp_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."otp_codes" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."pay_periods" TO "anon";
GRANT ALL ON TABLE "public"."pay_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."pay_periods" TO "service_role";



GRANT ALL ON TABLE "public"."payent" TO "anon";
GRANT ALL ON TABLE "public"."payent" TO "authenticated";
GRANT ALL ON TABLE "public"."payent" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_allowances" TO "anon";
GRANT ALL ON TABLE "public"."payroll_allowances" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_allowances" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_approvals" TO "anon";
GRANT ALL ON TABLE "public"."payroll_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_deductions" TO "anon";
GRANT ALL ON TABLE "public"."payroll_deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_deductions" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_deductions_new" TO "anon";
GRANT ALL ON TABLE "public"."payroll_deductions_new" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_deductions_new" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_definitions" TO "anon";
GRANT ALL ON TABLE "public"."payroll_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_details" TO "anon";
GRANT ALL ON TABLE "public"."payroll_details" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_details" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_entries" TO "anon";
GRANT ALL ON TABLE "public"."payroll_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_entries" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_formulas" TO "anon";
GRANT ALL ON TABLE "public"."payroll_formulas" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_formulas" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_groups" TO "anon";
GRANT ALL ON TABLE "public"."payroll_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_groups" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_headers" TO "anon";
GRANT ALL ON TABLE "public"."payroll_headers" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_headers" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_number_counter" TO "anon";
GRANT ALL ON TABLE "public"."payroll_number_counter" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_number_counter" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_periods" TO "anon";
GRANT ALL ON TABLE "public"."payroll_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_periods" TO "service_role";



GRANT ALL ON TABLE "public"."payrolls_dbf" TO "anon";
GRANT ALL ON TABLE "public"."payrolls_dbf" TO "authenticated";
GRANT ALL ON TABLE "public"."payrolls_dbf" TO "service_role";



GRANT ALL ON TABLE "public"."plantilla_headers" TO "anon";
GRANT ALL ON TABLE "public"."plantilla_headers" TO "authenticated";
GRANT ALL ON TABLE "public"."plantilla_headers" TO "service_role";



GRANT ALL ON TABLE "public"."plantilla_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."plantilla_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."plantilla_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plantilla_positions" TO "anon";
GRANT ALL ON TABLE "public"."plantilla_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."plantilla_positions" TO "service_role";



GRANT ALL ON TABLE "public"."pli_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."pli_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."pli_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."position_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."position_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."position_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."position_management" TO "anon";
GRANT ALL ON TABLE "public"."position_management" TO "authenticated";
GRANT ALL ON TABLE "public"."position_management" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."regions" TO "anon";
GRANT ALL ON TABLE "public"."regions" TO "authenticated";
GRANT ALL ON TABLE "public"."regions" TO "service_role";



GRANT ALL ON TABLE "public"."salary_history" TO "anon";
GRANT ALL ON TABLE "public"."salary_history" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_history" TO "service_role";



GRANT ALL ON TABLE "public"."salary_schedule" TO "anon";
GRANT ALL ON TABLE "public"."salary_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."security_settings" TO "anon";
GRANT ALL ON TABLE "public"."security_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."security_settings" TO "service_role";



GRANT ALL ON TABLE "public"."signatories" TO "anon";
GRANT ALL ON TABLE "public"."signatories" TO "authenticated";
GRANT ALL ON TABLE "public"."signatories" TO "service_role";



GRANT ALL ON TABLE "public"."stacode_audit" TO "anon";
GRANT ALL ON TABLE "public"."stacode_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."stacode_audit" TO "service_role";



GRANT ALL ON TABLE "public"."undeducted_obligations" TO "anon";
GRANT ALL ON TABLE "public"."undeducted_obligations" TO "authenticated";
GRANT ALL ON TABLE "public"."undeducted_obligations" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_actions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_actions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































