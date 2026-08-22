set local check_function_bodies = off;

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "service_role";

drop policy "deductions_select" on "public"."deductions";

drop policy "earnings_select" on "public"."earnings";

drop policy "employees_select" on "public"."employees";

drop policy "payroll_deductions_select" on "public"."payroll_deductions";

drop policy "payroll_entries_select" on "public"."payroll_entries";

drop policy "delete_plantilla_positions" on "public"."plantilla_positions";

drop policy "insert_plantilla_positions" on "public"."plantilla_positions";

drop policy "select_plantilla_positions" on "public"."plantilla_positions";

drop policy "update_plantilla_positions" on "public"."plantilla_positions";

drop policy "undeducted_obligations_select" on "public"."undeducted_obligations";

alter table "public"."plantilla_positions"
  alter column "category" drop default;

alter table "public"."plantilla_positions"
  alter column "item_number" drop default;

alter table "public"."plantilla_positions"
  alter column "level" drop default;

alter table "public"."plantilla_positions"
  alter column "position_code" drop default;

alter table "public"."plantilla_positions"
  alter column "position_title" drop default;

alter table "public"."plantilla_positions"
  alter column "salary_grade" drop default;

alter table "public"."plantilla_positions"
  alter column "stacode" drop default;

alter table "public"."security_events"
  drop column "created_by";

alter table "public"."security_events"
  drop column "detail";

alter table "public"."security_events"
  drop column "source";

create table "public"."attendance_records" (
  "id"              uuid                     not null default gen_random_uuid(),
  "employee_id"     uuid,
  "employee_number" text,
  "stacode"         text,
  "attendance_date" date                     not null,
  "time_in"         timestamp with time zone,
  "time_out"        timestamp with time zone,
  "hours_worked"    numeric(5,2)             default 0,
  "overtime_hours"  numeric(5,2)             default 0,
  "status"          text                     default 'present'::text,
  "remarks"         text,
  "recorded_by"     uuid,
  "created_at"      timestamp with time zone default now(),
  constraint "attendance_records_pkey" primary key (id)
);

alter table "public"."attendance_records"
  enable row level security;

create table "public"."device_logs" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "user_id"            uuid,
  "device_fingerprint" text                     not null,
  "device_name"        text,
  "browser"            text,
  "os"                 text,
  "ip_address"         text,
  "user_agent"         text,
  "trusted"            boolean                  default false,
  "last_seen"          timestamp with time zone default now(),
  "created_at"         timestamp with time zone default now(),
  constraint "device_logs_pkey" primary key (id)
);

alter table "public"."device_logs"
  enable row level security;

create table "public"."leave_records" (
  "id"               uuid                     not null default gen_random_uuid(),
  "employee_id"      uuid,
  "employee_number"  text,
  "stacode"          text,
  "leave_type"       text                     not null,
  "start_date"       date                     not null,
  "end_date"         date                     not null,
  "days_count"       numeric(5,2)             default 1,
  "reason"           text,
  "status"           text                     not null default 'pending'::text,
  "approved_by"      uuid,
  "approved_by_name" text,
  "approved_at"      timestamp with time zone,
  "created_at"       timestamp with time zone default now(),
  constraint "leave_records_pkey" primary key (id)
);

alter table "public"."leave_records"
  enable row level security;

create table "public"."loan_requests" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "employee_id"          uuid,
  "employee_number"      text,
  "stacode"              text,
  "loan_type"            text                     not null,
  "lender_name"          text,
  "principal_amount"     numeric(12,2)            default 0,
  "interest_rate"        numeric(5,2)             default 0,
  "term_months"          integer                  default 0,
  "monthly_amortization" numeric(12,2)            default 0,
  "purpose"              text,
  "status"               text                     not null default 'pending'::text,
  "requested_at"         timestamp with time zone default now(),
  "verified_by"          uuid,
  "verified_by_name"     text,
  "verified_at"          timestamp with time zone,
  "remarks"              text,
  "created_at"           timestamp with time zone default now(),
  constraint "loan_requests_pkey" primary key (id)
);

alter table "public"."loan_requests"
  enable row level security;

create table "public"."loan_verifications" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "loan_request_id"      uuid,
  "employee_number"      text,
  "stacode"              text,
  "verified_by"          uuid,
  "verified_by_name"     text,
  "verification_status"  text                     not null default 'verified'::text,
  "outstanding_balance"  numeric(12,2)            default 0,
  "monthly_amortization" numeric(12,2)            default 0,
  "verification_notes"   text,
  "verified_at"          timestamp with time zone default now(),
  "created_at"           timestamp with time zone default now(),
  constraint "loan_verifications_pkey" primary key (id)
);

alter table "public"."loan_verifications"
  enable row level security;

create table "public"."login_logs" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "email"              text,
  "user_id"            uuid,
  "success"            boolean                  not null default false,
  "ip_address"         text,
  "user_agent"         text,
  "device_fingerprint" text,
  "failure_reason"     text,
  "session_id"         text,
  "created_at"         timestamp with time zone default now(),
  constraint "login_logs_pkey" primary key (id)
);

alter table "public"."login_logs"
  enable row level security;

create table "public"."payroll_allowances" (
  "id"                uuid                     not null default gen_random_uuid(),
  "payroll_detail_id" uuid,
  "employee_id"       uuid,
  "employee_number"   text,
  "allowance_code"    text                     not null,
  "allowance_name"    text,
  "amount"            numeric(12,2)            default 0,
  "is_taxable"        boolean                  default true,
  "created_at"        timestamp with time zone default now(),
  constraint "payroll_allowances_pkey" primary key (id)
);

alter table "public"."payroll_allowances"
  enable row level security;

create table "public"."payroll_approvals" (
  "id"                uuid                     not null default gen_random_uuid(),
  "payroll_period_id" uuid,
  "step"              text                     not null,
  "role"              text                     not null,
  "approver_id"       uuid,
  "approver_name"     text,
  "approver_role"     text,
  "signature_phrase"  text,
  "signature_hash"    text,
  "status"            text                     not null default 'pending'::text,
  "remarks"           text,
  "approved_at"       timestamp with time zone,
  "created_at"        timestamp with time zone default now(),
  constraint "payroll_approvals_pkey" primary key (id)
);

alter table "public"."payroll_approvals"
  enable row level security;

create table "public"."payroll_deductions_new" (
  "id"                uuid                     not null default gen_random_uuid(),
  "payroll_detail_id" uuid,
  "payroll_header_id" uuid,
  "employee_id"       uuid,
  "employee_number"   text,
  "dedcode"           text                     not null,
  "dedname"           text,
  "amount"            numeric(12,2)            default 0,
  "deduction_type"    text                     default 'other'::text,
  "is_mandatory"      boolean                  default false,
  "is_loan"           boolean                  default false,
  "created_at"        timestamp with time zone default now(),
  constraint "payroll_deductions_new_pkey" primary key (id)
);

alter table "public"."payroll_deductions_new"
  enable row level security;

create table "public"."payroll_details" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "payroll_header_id"    uuid,
  "payroll_period_id"    uuid,
  "employee_id"          uuid,
  "employee_number"      text,
  "stacode"              text,
  "position_code"        text,
  "basic_salary"         numeric(12,2)            default 0,
  "gross_pay"            numeric(12,2)            default 0,
  "total_deductions"     numeric(12,2)            default 0,
  "total_allowances"     numeric(12,2)            default 0,
  "net_pay"              numeric(12,2)            default 0,
  "mandatory_deductions" numeric(12,2)            default 0,
  "loan_deductions"      numeric(12,2)            default 0,
  "other_deductions"     numeric(12,2)            default 0,
  "tax_withheld"         numeric(12,2)            default 0,
  "nthp_compliant"       boolean                  default true,
  "status"               text                     default 'draft'::text,
  "created_at"           timestamp with time zone default now(),
  "updated_at"           timestamp with time zone default now(),
  constraint "payroll_details_pkey" primary key (id)
);

alter table "public"."payroll_details"
  enable row level security;

create table "public"."payroll_headers" (
  "id"                uuid                     not null default gen_random_uuid(),
  "payroll_period_id" uuid,
  "period_name"       text,
  "stacode"           text,
  "category"          text,
  "total_employees"   integer                  default 0,
  "total_gross"       numeric(14,2)            default 0,
  "total_deductions"  numeric(14,2)            default 0,
  "total_net"         numeric(14,2)            default 0,
  "total_mandatory"   numeric(14,2)            default 0,
  "total_loans"       numeric(14,2)            default 0,
  "total_allowances"  numeric(14,2)            default 0,
  "status"            text                     not null default 'draft'::text,
  "nthp_violations"   integer                  default 0,
  "prepared_by"       uuid,
  "prepared_by_name"  text,
  "prepared_at"       timestamp with time zone,
  "created_at"        timestamp with time zone default now(),
  "updated_at"        timestamp with time zone default now(),
  constraint "payroll_headers_pkey" primary key (id)
);

alter table "public"."payroll_headers"
  enable row level security;

create table "public"."payroll_periods" (
  "id"              uuid                     not null default gen_random_uuid(),
  "period_name"     text                     not null,
  "period_type"     text                     not null default 'monthly'::text,
  "start_date"      date                     not null,
  "end_date"        date                     not null,
  "pay_date"        date,
  "month"           integer,
  "year"            integer,
  "status"          text                     not null default 'draft'::text,
  "current_step"    text                     not null default 'coordinator'::text,
  "locked_by"       uuid,
  "locked_at"       timestamp with time zone,
  "created_by"      uuid,
  "created_by_name" text,
  "created_at"      timestamp with time zone default now(),
  "updated_at"      timestamp with time zone default now(),
  constraint "payroll_periods_period_name_key" unique (period_name),
  constraint "payroll_periods_pkey" primary key (id)
);

alter table "public"."payroll_periods"
  enable row level security;

create table "public"."salary_history" (
  "id"               uuid                     not null default gen_random_uuid(),
  "employee_id"      uuid,
  "employee_number"  text,
  "old_salary"       numeric(12,2)            default 0,
  "new_salary"       numeric(12,2)            default 0,
  "old_salary_grade" integer,
  "new_salary_grade" integer,
  "reason"           text,
  "effective_date"   date                     not null,
  "approved_by"      uuid,
  "approved_by_name" text,
  "created_at"       timestamp with time zone default now(),
  constraint "salary_history_pkey" primary key (id)
);

alter table "public"."salary_history"
  enable row level security;

create table "public"."workflow_actions" (
  "id"                uuid                     not null default gen_random_uuid(),
  "payroll_period_id" uuid,
  "step"              text                     not null,
  "action"            text                     not null,
  "actor_id"          uuid,
  "actor_name"        text,
  "actor_role"        text,
  "remarks"           text,
  "signature_hash"    text,
  "is_maker"          boolean                  default true,
  "is_checker"        boolean                  default false,
  "maker_id"          uuid,
  "checker_id"        uuid,
  "created_at"        timestamp with time zone default now(),
  constraint "workflow_actions_pkey" primary key (id)
);

alter table "public"."workflow_actions"
  enable row level security;

alter table "public"."plantilla_positions"
  add column "created_at" timestamp with time zone default now();

alter table "public"."profiles"
  add column "division_code" text;

alter table "public"."profiles"
  add column "digital_signature_hash" text;

alter table "public"."profiles"
  add column "signature_phrase" text;

alter table "public"."profiles"
  add column "signature_set_at" timestamp with time zone;

alter table "public"."security_events"
  add column "user_id" uuid;

alter table "public"."security_events"
  add column "user_email" text;

alter table "public"."security_events"
  add column "ip_address" text;

alter table "public"."security_events"
  add column "device_fingerprint" text;

alter table "public"."security_events"
  add column "description" text;

alter table "public"."security_events"
  add column "metadata" jsonb;

alter table "public"."security_events"
  add column "resolved" boolean default false;

alter table "public"."security_events"
  add column "resolved_by" uuid;

alter table "public"."security_events"
  add column "resolved_at" timestamp with time zone;

alter table "public"."plantilla_positions"
  alter column "id" drop default;

alter table "public"."plantilla_positions"
  alter column "id" type uuid using "id"::uuid;

alter table "public"."plantilla_positions"
  alter column "id" set default gen_random_uuid();

alter table "public"."plantilla_positions"
  alter column "monthly_salary" set not null;

alter table "public"."plantilla_positions"
  alter column "monthly_salary" drop default;

alter table "public"."plantilla_positions"
  alter column "monthly_salary" type numeric(12,2) using "monthly_salary"::numeric(12,2);

alter table "public"."plantilla_positions"
  alter column "monthly_salary" set default 0;

alter table "public"."plantilla_positions"
  alter column "position_code" set not null;

alter table "public"."plantilla_positions"
  alter column "position_title" set not null;

alter table "public"."plantilla_positions"
  alter column "salary_grade" set not null;

alter table "public"."plantilla_positions"
  alter column "status" set not null;

alter table "public"."security_events"
  alter column "created_at" drop not null;

alter table "public"."plantilla_positions"
  alter column "id" set default gen_random_uuid();

alter table "public"."security_events"
  alter column "severity" set default 'info'::text;

create or replace function public.advance_workflow_step (
  p_period_id        uuid,
  p_action           text,
  p_remarks          text default null::text,
  p_signature_phrase text default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.approve_user (
  p_target_user uuid
)
  returns json
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.can_view_employee_row (
  p_stacode text,
  p_empno   text
)
  returns boolean
  language sql
  security definer
  set search_path to 'public'
  AS $function$
WITH caller AS (
SELECT role, assigned_stacode, employee_number
FROM profiles
WHERE id = auth.uid()
)
SELECT
-- Full-access roles see everything
EXISTS (SELECT 1 FROM caller WHERE role IN (
'super_admin', 'payroll_admin', 'payroll_processor',
'accounting_officer', 'hr_administrator',
'division_finance', 'auditor', 'read_only'
))
-- School-scoped roles see only their assigned stacode
OR EXISTS (
SELECT 1 FROM caller
WHERE role IN ('school_head', 'school_coordinator')
AND assigned_stacode IS NOT NULL
AND assigned_stacode = p_stacode
)
-- ESS sees only their own employee number
OR EXISTS (
SELECT 1 FROM caller
WHERE role = 'ess'
AND employee_number IS NOT NULL
AND employee_number = p_empno
)
$function$;

create or replace function public.cleanup_expired_otps()
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
BEGIN
DELETE FROM otp_codes WHERE expires_at < now() OR used = true;
END;
$function$;

create or replace function public.disable_user (
  p_target_user uuid
)
  returns json
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.enable_user (
  p_target_user uuid
)
  returns json
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.enforce_posted_entry_invariants()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.fn_non_plantilla_before_upsert()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
BEGIN
-- Auto-generate complete_name: "SURNAME, FIRST_NAME MIDDLE_NAME"
NEW.complete_name = trim(
coalesce(NEW.surname, '') || ', ' ||
coalesce(NEW.first_name, '') ||
CASE WHEN coalesce(NEW.middle_name, '') <> '' THEN ' ' || NEW.middle_name ELSE '' END
);

-- Normalize empty strings for unique-constrained optional fields
NEW.tin = nullif(trim(coalesce(NEW.tin, '')), '');
NEW.pagibig_number = nullif(trim(coalesce(NEW.pagibig_number, '')), '');
NEW.philhealth = nullif(trim(coalesce(NEW.philhealth, '')), '');
NEW.landbank = nullif(trim(coalesce(NEW.landbank, '')), '');

NEW.updated_at = now();
RETURN NEW;
END;
$function$;

create or replace function public.get_current_empno()
  returns text
  language sql
  security definer
  set search_path to 'public'
  AS $function$
SELECT employee_number FROM profiles WHERE id = auth.uid();
$function$;

create or replace function public.get_current_stacode()
  returns text
  language sql
  security definer
  set search_path to 'public'
  AS $function$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$function$;

create or replace function public.get_current_user_divcode()
  returns text
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT division_code FROM profiles WHERE id = auth.uid() AND status = 'approved';
$function$;

create or replace function public.get_current_user_empno()
  returns text
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid() AND status = 'approved';
$function$;

create or replace function public.get_current_user_stacode()
  returns text
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid() AND status = 'approved';
$function$;

create or replace function public.get_dbf_table_counts_by_category()
  returns table (
    table_name text,
    total      bigint,
    elementary bigint,
    highschool bigint
  )
  language sql
  set search_path to 'public'
  AS $function$
-- Tables with a direct stacode column (text, numeric-only codes)
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
-- MASTFILE: employees.stacode
UNION ALL
SELECT 'employees',
count(*)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
FROM employees
-- DEDFILE: payroll_deductions joined to employees for stacode
UNION ALL
SELECT 'payroll_deductions',
count(*)::bigint,
count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 1 AND 499)::bigint,
count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 500 AND 701)::bigint
FROM payroll_deductions pd
LEFT JOIN employees e ON e.id = pd.employee_id
$function$;

create or replace function public.get_deduction_engine_stats()
  returns jsonb
  language sql
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.get_deductions_summary (
  p_period_id uuid,
  p_emp_ids   uuid[] default null::uuid[]
)
  returns jsonb
  language sql
  set search_path to 'public'
  AS $function$
SELECT jsonb_build_object(
'totalCount', COUNT(*),
'totalAmount', COALESCE(SUM(amount), 0),
'codeCount', COUNT(DISTINCT deduction_code),
'empCount', COUNT(DISTINCT employee_id)
)
FROM deductions
WHERE pay_period_id = p_period_id
AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$function$;

create or replace function public.get_payroll_group_counts()
  returns jsonb
  language sql
  set search_path to 'public'
  AS $function$
SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
FROM (
SELECT payroll_group_id AS group_id, COUNT(*) AS count
FROM employees
WHERE status = 'Active' AND payroll_group_id IS NOT NULL
GROUP BY payroll_group_id
) row;
$function$;

create or replace function public.get_payroll_register_totals (
  p_period_id uuid   default null::uuid,
  p_emp_ids   uuid[] default null::uuid[]
)
  returns jsonb
  language sql
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.get_user_role (
  user_uuid uuid default auth.uid()
)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
user_role text;
BEGIN
SELECT role INTO user_role FROM profiles WHERE id = user_uuid;
RETURN COALESCE(user_role, 'viewer');
END;
$function$;

create or replace function public.get_workflow_steps()
  returns jsonb
  language sql
  immutable
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.hash_otp (
  otp_code text
)
  returns text
  language plpgsql
  set search_path to 'public', 'pgcrypto'
  AS $function$
BEGIN
RETURN crypt(otp_code, gen_salt('bf'));
END;
$function$;

create or replace function public.is_data_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT get_current_user_role() IN (
'super_admin', 'payroll_admin', 'payroll_processor',
'accounting_officer', 'hr_administrator',
'division_finance', 'auditor', 'read_only'
);
$function$;

create or replace function public.is_data_writer()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT get_current_user_role() IN (
'super_admin',
'payroll_admin',
'payroll_processor',
'payroll_officer',
'hr_administrator'
);
$function$;

create or replace function public.is_workflow_participant()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
SELECT get_current_user_role() IN (
'school_coordinator','school_head','hr_administrator','loan_verifier',
'payroll_officer','payroll_processor','accounting_officer',
'division_finance','treasury_disbursement','auditor','payroll_admin'
);
$function$;

create or replace function public.issue_mfa_code (
  p_email text
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
v_user_id uuid;
v_code text;
BEGIN
SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
IF v_user_id IS NULL THEN
-- Do not reveal whether the account exists.
RETURN true;
END IF;

-- Invalidate any outstanding code, then issue exactly one new one.
UPDATE otp_codes SET used = true
WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false;

v_code := lpad(((floor(random() * 900000) + 100000))::bigint::text, 6, '0');

INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
VALUES (v_user_id, crypt(v_code, gen_salt('bf')), 'mfa', now() + interval '5 minutes');

RETURN true;
END;
$function$;

create or replace function public.lock_payroll_period (
  p_period_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.prevent_closed_period_reopen()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
v_caller_role text;
BEGIN
SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

IF v_caller_role = 'super_admin' AND NEW.status = 'draft' THEN
RETURN NEW;
END IF;

RAISE EXCEPTION 'Cannot reopen a closed pay period';
END;
$function$;

create or replace function public.query_dedfile (
  p_search       text    default null::text,
  p_stacode      text    default null::text,
  p_dedcode      text    default null::text,
  p_empno        text    default null::text,
  p_period       text    default null::text,
  p_stacode_min  integer default null::integer,
  p_stacode_max  integer default null::integer,
  p_sort_key     text    default 'empno'::text,
  p_sort_dir     text    default 'asc'::text,
  p_page         integer default 0,
  p_page_size    integer default 50,
  p_count_only   boolean default false,
  p_division_ids uuid[]  default null::uuid[],
  p_regcode      text    default null::text,
  p_divcodes     text[]  default null::text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.query_employees (
  p_search       text    default null::text,
  p_stacode_min  integer default null::integer,
  p_stacode_max  integer default null::integer,
  p_status       text    default null::text,
  p_group_id     uuid    default null::uuid,
  p_stacode      text    default null::text,
  p_page         integer default 0,
  p_page_size    integer default 10,
  p_count_only   boolean default false,
  p_scope_column text    default null::text,
  p_scope_value  text    default null::text,
  p_division_id  uuid    default null::uuid,
  p_division_ids uuid[]  default null::uuid[],
  p_regcode      text    default null::text,
  p_divcodes     text[]  default null::text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.query_payroll_deductions (
  p_search        text    default null::text,
  p_status_filter text    default null::text,
  p_type_filter   text    default null::text,
  p_regcode       text    default null::text,
  p_divcodes      text[]  default null::text[],
  p_stacode_min   integer default null::integer,
  p_stacode_max   integer default null::integer,
  p_page          integer default 0,
  p_page_size     integer default 10,
  p_count_only    boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.record_failed_login (
  p_email text
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
v_profile record;
v_attempts integer;
v_caller_email text;
BEGIN
-- If the caller is authenticated, they may only record failed logins
-- for their own email. This prevents an authenticated user from
-- locking out another user's account by calling this RPC with a
-- different email.
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
$function$;

create or replace function public.record_login (
  p_email              text,
  p_success            boolean,
  p_failure_reason     text    default null::text,
  p_device_fingerprint text    default null::text,
  p_ip_address         text    default null::text,
  p_user_agent         text    default null::text
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE v_user_id uuid;
BEGIN
SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
INSERT INTO login_logs (email, user_id, success, failure_reason, device_fingerprint, ip_address, user_agent)
VALUES (p_email, v_user_id, p_success, p_failure_reason, p_device_fingerprint, p_ip_address, p_user_agent);
END;
$function$;

create or replace function public.record_security_event (
  p_event_type  text,
  p_severity    text  default 'info'::text,
  p_description text  default null::text,
  p_metadata    jsonb default null::jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE v_user_id uuid; v_user_email text;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NOT NULL THEN SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id; END IF;
INSERT INTO security_events (event_type, severity, user_id, user_email, description, metadata)
VALUES (p_event_type, p_severity, v_user_id, v_user_email, p_description, p_metadata);
END;
$function$;

create or replace function public.record_successful_login()
  returns void
  language plpgsql
  set search_path to 'public'
  AS $function$
BEGIN
UPDATE profiles
SET failed_login_attempts = 0,
locked_until = NULL,
last_login_at = now()
WHERE id = auth.uid();
END;
$function$;

create or replace function public.refresh_dashboard_cache()
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
-- Employee counts
SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Active')
INTO v_total_records, v_active_employees
FROM employees;

-- Payroll entry aggregates
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

-- Current period
SELECT id, to_jsonb(p)
INTO v_current_period_id, v_current_period
FROM pay_periods p
ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
LIMIT 1;

-- Net pay for current period
SELECT COALESCE(SUM(net_pay), 0)
INTO v_period_net
FROM payroll_entries
WHERE pay_period_id = v_current_period_id;

-- Active loan accounts
SELECT COUNT(*)
INTO v_active_loan_accounts
FROM payroll_deductions
WHERE type = 'Loan' AND status = 'Active';

-- Payroll group counts
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

-- Unassigned count
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

-- Top 8 deduction codes by total
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

-- 5 most recently added employees
SELECT COALESCE(jsonb_agg(jsonb_build_object(
'id', e.id, 'empno', e.empno, 'employee_number', e.employee_number,
'fname', e.fname, 'first_name', e.first_name,
'lname', e.lname, 'last_name', e.last_name,
'poscode', e.poscode, 'position', e.position,
'regcode', e.regcode, 'basic', e.basic, 'basic_salary', e.basic_salary
)), '[]')
INTO v_recent_employees
FROM (SELECT * FROM employees ORDER BY created_at DESC LIMIT 5) e;

-- Write to cache (upsert the singleton row)
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
$function$;

create or replace function public.reject_user (
  p_target_user uuid,
  p_reason      text
)
  returns json
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.set_digital_signature (
  p_signature_phrase text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
DECLARE v_user_id uuid; v_hash text;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
IF p_signature_phrase IS NULL OR length(p_signature_phrase) < 4 THEN RAISE EXCEPTION 'Signature phrase must be at least 4 characters'; END IF;
v_hash := encode(digest(p_signature_phrase || v_user_id::text, 'sha256'), 'hex');
UPDATE profiles SET digital_signature_hash = v_hash, signature_phrase = p_signature_phrase, signature_set_at = now() WHERE id = v_user_id;
RETURN jsonb_build_object('success', true);
END;
$function$;

create or replace function public.set_employee_number (
  p_target_user     uuid,
  p_employee_number text
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.set_user_mfa (
  p_target_user uuid,
  p_enabled     boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.set_user_role (
  p_target_user uuid,
  p_new_role    text
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
  AS $function$
BEGIN
NEW.updated_at := now();
RETURN NEW;
END;
$function$;

create or replace function public.unlock_user_account (
  p_target_user uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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
$function$;

create or replace function public.update_schools_updated_at()
  returns trigger
  language plpgsql
  AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$;

create or replace function public.update_updated_at()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$;

create or replace function public.validate_employee_for_approval (
  p_employee_number text
)
  returns json
  language plpgsql
  set search_path to 'public'
  AS $function$
DECLARE
emp_record record;
stacode_num int;
group_exists boolean;
BEGIN
IF p_employee_number IS NULL OR btrim(p_employee_number) = '' THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Employee number is required');
END IF;

-- Look up employee by employee_number
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

-- Validate stacode is numeric and within a known payroll group range
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
$function$;

create or replace function public.validate_nthp_on_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
BEGIN
NEW.nthp_compliant := NEW.net_pay >= 5000;
RETURN NEW;
END;
$function$;

create or replace function public.verify_mfa_code (
  p_email text,
  p_code  text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
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

-- Atomic single-use claim: only the first concurrent caller wins.
UPDATE otp_codes SET used = true WHERE id = v_otp.id AND used = false;
GET DIAGNOSTICS v_claimed = ROW_COUNT;
IF v_claimed = 0 THEN
RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
END IF;

RETURN jsonb_build_object('ok', true);
END;
$function$;

create or replace function public.verify_otp (
  otp_code    text,
  stored_hash text
)
  returns boolean
  language plpgsql
  set search_path to 'public', 'pgcrypto'
  AS $function$
BEGIN
RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$function$;

alter table "public"."attendance_records"
  add constraint "attendance_records_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."leave_records"
  add constraint "leave_records_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."loan_requests"
  add constraint "loan_requests_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."loan_verifications"
  add constraint "loan_verifications_loan_request_id_fkey" foreign key (loan_request_id) references public.loan_requests(id) on delete cascade;

alter table "public"."payroll_allowances"
  add constraint "payroll_allowances_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."payroll_deductions_new"
  add constraint "payroll_deductions_new_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."payroll_details"
  add constraint "payroll_details_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."payroll_allowances"
  add constraint "payroll_allowances_payroll_detail_id_fkey" foreign key (payroll_detail_id) references public.payroll_details(id) on delete cascade;

alter table "public"."payroll_deductions_new"
  add constraint "payroll_deductions_new_payroll_detail_id_fkey" foreign key (payroll_detail_id) references public.payroll_details(id) on delete cascade;

alter table "public"."payroll_deductions_new"
  add constraint "payroll_deductions_new_payroll_header_id_fkey" foreign key (payroll_header_id) references public.payroll_headers(id) on delete cascade;

alter table "public"."payroll_details"
  add constraint "payroll_details_payroll_header_id_fkey" foreign key (payroll_header_id) references public.payroll_headers(id) on delete cascade;

alter table "public"."payroll_approvals"
  add constraint "payroll_approvals_payroll_period_id_fkey" foreign key (payroll_period_id) references public.payroll_periods(id) on delete cascade;

alter table "public"."payroll_details"
  add constraint "payroll_details_payroll_period_id_fkey" foreign key (payroll_period_id) references public.payroll_periods(id) on delete cascade;

alter table "public"."payroll_headers"
  add constraint "payroll_headers_payroll_period_id_fkey" foreign key (payroll_period_id) references public.payroll_periods(id) on delete cascade;

alter table "public"."plantilla_positions"
  add constraint "plantilla_positions_position_code_key" unique (position_code);

alter table "public"."salary_history"
  add constraint "salary_history_employee_id_fkey" foreign key (employee_id) references public.employees(id) on delete cascade;

alter table "public"."workflow_actions"
  add constraint "workflow_actions_payroll_period_id_fkey" foreign key (payroll_period_id) references public.payroll_periods(id) on delete cascade;

create index idx_ar_employee on public.attendance_records using btree (employee_id);

create index idx_audit_logs_action on public.audit_logs using btree (action);

create index idx_audit_logs_user_id on public.audit_logs using btree (user_id);

create index idx_dbf_restore_history_user_id on public.dbf_restore_history using btree (user_id);

create index idx_deductions_deduction_code on public.deductions using btree (deduction_code);

create index idx_deductions_employee_id on public.deductions using btree (employee_id);

create index idx_deductions_pay_period_id on public.deductions using btree (pay_period_id);

create index idx_dl_user on public.device_logs using btree (user_id);

create index idx_earnings_employee_id on public.earnings using btree (employee_id);

create index idx_earnings_pay_period_id on public.earnings using btree (pay_period_id);

create index idx_employees_divcode on public.employees using btree (divcode);

create index idx_employees_lname_fname on public.employees using btree (lname, fname);

create index idx_employees_payroll_group_id on public.employees using btree (payroll_group_id);

create index idx_employees_position on public.employees using btree ("position");

create index idx_employees_regcode on public.employees using btree (regcode);

create index idx_employees_stacode on public.employees using btree (stacode);

create index idx_ll_created on public.login_logs using btree (created_at);

create index idx_lr_employee on public.leave_records using btree (employee_id);

create index idx_lreq_employee on public.loan_requests using btree (employee_id);

create index idx_pa_period on public.payroll_approvals using btree (payroll_period_id);

create index idx_pay_periods_start_date on public.pay_periods using btree (start_date desc);

create index idx_pay_periods_status on public.pay_periods using btree (status);

create index idx_payroll_deductions_dedcode on public.payroll_deductions using btree (dedcode);

create index idx_payroll_deductions_employee_id on public.payroll_deductions using btree (employee_id);

create index idx_payroll_deductions_empno on public.payroll_deductions using btree (empno);

create index idx_payroll_deductions_status on public.payroll_deductions using btree (status);

create index idx_payroll_deductions_type on public.payroll_deductions using btree (type);

create index idx_payroll_entries_employee_id on public.payroll_entries using btree (employee_id);

create index idx_payroll_entries_nthp_status on public.payroll_entries using btree (nthp_status);

create index idx_payroll_entries_pay_period_id on public.payroll_entries using btree (pay_period_id);

create index idx_payroll_entries_status on public.payroll_entries using btree (status);

create index idx_payroll_groups_status on public.payroll_groups using btree (status);

create index idx_pd_employee on public.payroll_details using btree (employee_id);

create index idx_pd_header on public.payroll_details using btree (payroll_header_id);

create index idx_pdn_detail on public.payroll_deductions_new using btree (payroll_detail_id);

create index idx_pp_status on public.payroll_periods using btree (status);

create index idx_profiles_division_code on public.profiles using btree (division_code);

create index idx_profiles_role on public.profiles using btree (role);

create index idx_se_created on public.security_events using btree (created_at);

create index idx_sh_employee on public.salary_history using btree (employee_id);

create index idx_undeducted_obligations_employee_id on public.undeducted_obligations using btree (employee_id);

create index idx_undeducted_obligations_pay_period_id on public.undeducted_obligations using btree (pay_period_id);

create index idx_wa_period on public.workflow_actions using btree (payroll_period_id);

create trigger trg_validate_nthp
  before insert or update of net_pay on public.payroll_details
  for each row
  execute function public.validate_nthp_on_insert();

create policy "insert_attendance" on "public"."attendance_records"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'hr_administrator'::text, 'payroll_officer'::text, 'payroll_processor'::text])));

create policy "select_attendance" on "public"."attendance_records"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode()))
    or ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "update_attendance" on "public"."attendance_records"
  for update
  to "authenticated"
  using ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'hr_administrator'::text, 'payroll_officer'::text, 'payroll_processor'::text])))
  with check ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'hr_administrator'::text, 'payroll_officer'::text, 'payroll_processor'::text])));

create policy "deductions_select" on "public"."deductions"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = deductions.employee_id) AND (e.divcode = public.get_current_user_divcode()))))) or
    ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = deductions.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or ((public.get_current_user_role() = 'ess'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = deductions.employee_id) AND ((e.empno = public.get_current_user_empno()) or (e.employee_number = public.get_current_user_empno()))))))));

create policy "insert_device_logs" on "public"."device_logs"
  for insert
  to "authenticated"
  with check ((user_id = auth.uid()));

create policy "select_device_logs_admin" on "public"."device_logs"
  for select
  to "authenticated"
  using ((public.get_current_user_role() = 'payroll_admin'::text));

create policy "select_own_device_logs" on "public"."device_logs"
  for select
  to "authenticated"
  using ((auth.uid() = user_id));

create policy "earnings_select" on "public"."earnings"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = earnings.employee_id) AND (e.divcode = public.get_current_user_divcode()))))) or
    ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = earnings.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or ((public.get_current_user_role() = 'ess'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = earnings.employee_id) AND ((e.empno = public.get_current_user_empno()) or (e.employee_number = public.get_current_user_empno()))))))));

create policy "employees_select" on "public"."employees"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (divcode = public.get_current_user_divcode())) or ((public.get_current_user_role()
    = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode())) or
    ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) or (employee_number = public.get_current_user_empno())))));

create policy "insert_leave" on "public"."leave_records"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['ess'::text, 'school_coordinator'::text, 'hr_administrator'::text])));

create policy "select_leave" on "public"."leave_records"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode()))
    or (public.get_current_user_role() = 'hr_administrator'::text) or ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "update_leave" on "public"."leave_records"
  for update
  to "authenticated"
  using ((public.get_current_user_role() = ANY (ARRAY['school_head'::text, 'hr_administrator'::text])))
  with check ((public.get_current_user_role() = ANY (ARRAY['school_head'::text, 'hr_administrator'::text])));

create policy "insert_loan_requests" on "public"."loan_requests"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['ess'::text, 'school_coordinator'::text, 'hr_administrator'::text, 'payroll_officer'::text])));

create policy "select_loan_requests" on "public"."loan_requests"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode()))
    or (public.get_current_user_role() = ANY (ARRAY['loan_verifier'::text, 'hr_administrator'::text])) or
    ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "update_loan_requests" on "public"."loan_requests"
  for update
  to "authenticated"
  using ((public.get_current_user_role() = ANY (ARRAY['loan_verifier'::text, 'hr_administrator'::text])))
  with check ((public.get_current_user_role() = ANY (ARRAY['loan_verifier'::text, 'hr_administrator'::text])));

create policy "insert_loan_verifications" on "public"."loan_verifications"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = 'loan_verifier'::text));

create policy "select_loan_verifications" on "public"."loan_verifications"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or (public.get_current_user_role() = ANY (ARRAY['loan_verifier'::text, 'hr_administrator'::text, 'payroll_officer'::text,
    'payroll_processor'::text]))));

create policy "insert_login_logs_anon" on "public"."login_logs"
  for insert
  to "anon"
  with
    check
    (((user_id IS NULL) AND (success = false) AND ((failure_reason IS NULL) OR (failure_reason = ANY (ARRAY['invalid_credentials'::text, 'account_locked'::text,
    'email_unverified'::text, 'unexpected_error'::text])))));

create policy "insert_login_logs_auth" on "public"."login_logs"
  for insert
  to "authenticated"
  with check (((user_id = auth.uid()) OR ((user_id IS NULL) AND (success = false))));

create policy "select_login_logs_admin" on "public"."login_logs"
  for select
  to "authenticated"
  using ((public.get_current_user_role() = 'payroll_admin'::text));

create policy "select_own_login_logs" on "public"."login_logs"
  for select
  to "authenticated"
  using ((auth.uid() = user_id));

create policy "insert_allowances" on "public"."payroll_allowances"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['payroll_admin'::text, 'payroll_officer'::text, 'payroll_processor'::text, 'hr_administrator'::text])));

create policy "select_allowances" on "public"."payroll_allowances"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_allowances.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or
    ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "insert_payroll_approvals" on "public"."payroll_approvals"
  for insert
  to "authenticated"
  with check (public.is_workflow_participant());

create policy "select_payroll_approvals" on "public"."payroll_approvals"
  for select
  to "authenticated"
  using (true);

create policy "update_payroll_approvals" on "public"."payroll_approvals"
  for update
  to "authenticated"
  using (public.is_workflow_participant())
  with check (public.is_workflow_participant());

create policy "payroll_deductions_select" on "public"."payroll_deductions"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_deductions.employee_id) AND (e.divcode = public.get_current_user_divcode()))))) or
    ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND ((empno = public.get_current_user_empno()) or (exists ( select 1
   from public.employees e
  where ((e.id = payroll_deductions.employee_id) AND (e.stacode = public.get_current_user_stacode())))))) or
    ((public.get_current_user_role() = 'ess'::text) AND (empno = public.get_current_user_empno()))));

create policy "insert_pd_new" on "public"."payroll_deductions_new"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['payroll_admin'::text, 'payroll_officer'::text, 'payroll_processor'::text])));

create policy "select_pd_new" on "public"."payroll_deductions_new"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_deductions_new.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or
    ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "insert_payroll_details" on "public"."payroll_details"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['payroll_admin'::text, 'payroll_officer'::text, 'payroll_processor'::text])));

create policy "select_payroll_details" on "public"."payroll_details"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode()))
    or ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "update_payroll_details" on "public"."payroll_details"
  for update
  to "authenticated"
  using (public.is_workflow_participant())
  with check (public.is_workflow_participant());

create policy "payroll_entries_select" on "public"."payroll_entries"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_entries.employee_id) AND (e.divcode = public.get_current_user_divcode()))))) or
    ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_entries.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or ((public.get_current_user_role() = 'ess'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = payroll_entries.employee_id) AND ((e.empno = public.get_current_user_empno()) or (e.employee_number = public.get_current_user_empno()))))))));

create policy "insert_payroll_headers" on "public"."payroll_headers"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['payroll_admin'::text, 'payroll_officer'::text, 'payroll_processor'::text])));

create policy "select_payroll_headers" on "public"."payroll_headers"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode =
    public.get_current_user_stacode()))));

create policy "update_payroll_headers" on "public"."payroll_headers"
  for update
  to "authenticated"
  using (public.is_workflow_participant())
  with check (public.is_workflow_participant());

create policy "insert_payroll_periods" on "public"."payroll_periods"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['payroll_admin'::text, 'payroll_officer'::text, 'hr_administrator'::text])));

create policy "select_payroll_periods" on "public"."payroll_periods"
  for select
  to "authenticated"
  using (true);

create policy "update_payroll_periods" on "public"."payroll_periods"
  for update
  to "authenticated"
  using (public.is_workflow_participant())
  with check (true);

create policy "insert_plantilla" on "public"."plantilla_positions"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = 'hr_administrator'::text));

create policy "select_plantilla" on "public"."plantilla_positions"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode()))
    or (public.get_current_user_role() = 'hr_administrator'::text)));

create policy "update_plantilla" on "public"."plantilla_positions"
  for update
  to "authenticated"
  using ((public.get_current_user_role() = 'hr_administrator'::text))
  with check ((public.get_current_user_role() = 'hr_administrator'::text));

create policy "insert_salary_history" on "public"."salary_history"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = 'hr_administrator'::text));

create policy "select_salary_history" on "public"."salary_history"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = salary_history.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or (public.get_current_user_role() = 'hr_administrator'::text) or
    ((public.get_current_user_role() = 'ess'::text) AND (employee_number = public.get_current_user_empno()))));

create policy "undeducted_obligations_select" on "public"."undeducted_obligations"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = undeducted_obligations.employee_id) AND (e.divcode = public.get_current_user_divcode()))))) or
    ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = undeducted_obligations.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or
    ((public.get_current_user_role() = 'ess'::text) AND (exists ( select 1
   from public.employees e
  where ((e.id = undeducted_obligations.employee_id) AND ((e.empno = public.get_current_user_empno()) or (e.employee_number = public.get_current_user_empno()))))))));

create policy "insert_workflow_actions" on "public"."workflow_actions"
  for insert
  to "authenticated"
  with check (public.is_workflow_participant());

create policy "select_workflow_actions" on "public"."workflow_actions"
  for select
  to "authenticated"
  using (true);

revoke all on function "public"."_pd_compute"(numeric, jsonb, numeric, text) from "anon";

grant execute on function "public"."_pd_compute"(numeric, jsonb, numeric, text) to "anon";

revoke all on function "public"."_pd_compute"(numeric, jsonb, numeric, text) from "service_role";

grant execute on function "public"."_pd_compute"(numeric, jsonb, numeric, text) to "service_role";

revoke all on function "public"."_pd_mandatory"(text, text) from "anon";

grant execute on function "public"."_pd_mandatory"(text, text) to "anon";

revoke all on function "public"."_pd_mandatory"(text, text) from "service_role";

grant execute on function "public"."_pd_mandatory"(text, text) to "service_role";

revoke all on function "public"."_pd_mandatory_loan"(text, text) from "anon";

grant execute on function "public"."_pd_mandatory_loan"(text, text) to "anon";

revoke all on function "public"."_pd_mandatory_loan"(text, text) from "service_role";

grant execute on function "public"."_pd_mandatory_loan"(text, text) to "service_role";

revoke all on function "public"."_pd_priority"(text, text, text) from "anon";

grant execute on function "public"."_pd_priority"(text, text, text) to "anon";

revoke all on function "public"."_pd_priority"(text, text, text) from "service_role";

grant execute on function "public"."_pd_priority"(text, text, text) to "service_role";

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "anon";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "anon";

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "authenticated";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "authenticated";

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "service_role";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "service_role";

revoke all on function "public"."advance_workflow_step"(uuid, text, text, text) from public;

grant execute on function "public"."advance_workflow_step"(uuid, text, text, text) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."approve_user"(uuid) from "anon";

grant execute on function "public"."approve_user"(uuid) to "anon";

revoke all on function "public"."approve_user"(uuid) from "service_role";

grant execute on function "public"."approve_user"(uuid) to "service_role";

revoke all on function "public"."assign_schools_to_division"(uuid, uuid[]) from "anon";

grant execute on function "public"."assign_schools_to_division"(uuid, uuid[]) to "anon";

revoke all on function "public"."assign_schools_to_division"(uuid, uuid[]) from "service_role";

grant execute on function "public"."assign_schools_to_division"(uuid, uuid[]) to "service_role";

grant execute on function "public"."can_view_employee_row"(text, text) to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."cleanup_expired_otps"() from "anon";

grant execute on function "public"."cleanup_expired_otps"() to "anon";

revoke all on function "public"."cleanup_expired_otps"() from "authenticated";

grant execute on function "public"."cleanup_expired_otps"() to "authenticated";

revoke all on function "public"."cleanup_expired_otps"() from "service_role";

grant execute on function "public"."cleanup_expired_otps"() to "service_role";

revoke all on function "public"."clear_schools_from_division"(uuid, uuid[]) from "anon";

grant execute on function "public"."clear_schools_from_division"(uuid, uuid[]) to "anon";

revoke all on function "public"."clear_schools_from_division"(uuid, uuid[]) from "service_role";

grant execute on function "public"."clear_schools_from_division"(uuid, uuid[]) to "service_role";

revoke all on function "public"."delete_division"(uuid) from "anon";

grant execute on function "public"."delete_division"(uuid) to "anon";

revoke all on function "public"."delete_division"(uuid) from "service_role";

grant execute on function "public"."delete_division"(uuid) to "service_role";

revoke all on function "public"."delete_region"(uuid) from "anon";

grant execute on function "public"."delete_region"(uuid) to "anon";

revoke all on function "public"."delete_region"(uuid) from "service_role";

grant execute on function "public"."delete_region"(uuid) to "service_role";

revoke all on function "public"."delete_role_permission"(text, text) from "anon";

grant execute on function "public"."delete_role_permission"(text, text) to "anon";

revoke all on function "public"."delete_role_permission"(text, text) from "service_role";

grant execute on function "public"."delete_role_permission"(text, text) to "service_role";

revoke all on function "public"."disable_user"(uuid) from "anon";

grant execute on function "public"."disable_user"(uuid) to "anon";

revoke all on function "public"."disable_user"(uuid) from "service_role";

grant execute on function "public"."disable_user"(uuid) to "service_role";

revoke all on function "public"."enable_user"(uuid) from "anon";

grant execute on function "public"."enable_user"(uuid) to "anon";

revoke all on function "public"."enable_user"(uuid) from "service_role";

grant execute on function "public"."enable_user"(uuid) to "service_role";

revoke all on function "public"."enforce_posted_entry_invariants"() from "anon";

grant execute on function "public"."enforce_posted_entry_invariants"() to "anon";

revoke all on function "public"."enforce_posted_entry_invariants"() from "authenticated";

grant execute on function "public"."enforce_posted_entry_invariants"() to "authenticated";

revoke all on function "public"."enforce_posted_entry_invariants"() from "service_role";

grant execute on function "public"."enforce_posted_entry_invariants"() to "service_role";

revoke all on function "public"."fn_non_plantilla_before_upsert"() from "anon";

grant execute on function "public"."fn_non_plantilla_before_upsert"() to "anon";

revoke all on function "public"."fn_non_plantilla_before_upsert"() from "authenticated";

grant execute on function "public"."fn_non_plantilla_before_upsert"() to "authenticated";

revoke all on function "public"."fn_non_plantilla_before_upsert"() from "service_role";

grant execute on function "public"."fn_non_plantilla_before_upsert"() to "service_role";

revoke all on function "public"."generate_monthly_periods"(integer, text, text) from "anon";

grant execute on function "public"."generate_monthly_periods"(integer, text, text) to "anon";

revoke all on function "public"."generate_monthly_periods"(integer, text, text) from "authenticated";

grant execute on function "public"."generate_monthly_periods"(integer, text, text) to "authenticated";

revoke all on function "public"."generate_monthly_periods"(integer, text, text) from "service_role";

grant execute on function "public"."generate_monthly_periods"(integer, text, text) to "service_role";

grant execute on function "public"."get_current_empno"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."get_current_stacode"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."get_current_user_divcode"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."get_current_user_division_codes"() from "anon";

grant execute on function "public"."get_current_user_division_codes"() to "anon";

revoke all on function "public"."get_current_user_division_codes"() from "service_role";

grant execute on function "public"."get_current_user_division_codes"() to "service_role";

revoke all on function "public"."get_current_user_empno"() from "anon";

grant execute on function "public"."get_current_user_empno"() to "anon";

revoke all on function "public"."get_current_user_empno"() from "authenticated";

grant execute on function "public"."get_current_user_empno"() to "authenticated";

revoke all on function "public"."get_current_user_empno"() from "service_role";

grant execute on function "public"."get_current_user_empno"() to "service_role";

revoke all on function "public"."get_current_user_role"() from "anon";

grant execute on function "public"."get_current_user_role"() to "anon";

revoke all on function "public"."get_current_user_role"() from "service_role";

grant execute on function "public"."get_current_user_role"() to "service_role";

revoke all on function "public"."get_current_user_stacode"() from "anon";

grant execute on function "public"."get_current_user_stacode"() to "anon";

revoke all on function "public"."get_current_user_stacode"() from "authenticated";

grant execute on function "public"."get_current_user_stacode"() to "authenticated";

revoke all on function "public"."get_current_user_stacode"() from "service_role";

grant execute on function "public"."get_current_user_stacode"() to "service_role";

revoke all on function "public"."get_dashboard_summary"(text, text, text[]) from "anon";

grant execute on function "public"."get_dashboard_summary"(text, text, text[]) to "anon";

revoke all on function "public"."get_dashboard_summary"(text, text, text[]) from "service_role";

grant execute on function "public"."get_dashboard_summary"(text, text, text[]) to "service_role";

revoke all on function "public"."get_dbf_table_counts_by_category"() from "anon";

grant execute on function "public"."get_dbf_table_counts_by_category"() to "anon";

revoke all on function "public"."get_dbf_table_counts_by_category"() from "authenticated";

grant execute on function "public"."get_dbf_table_counts_by_category"() to "authenticated";

revoke all on function "public"."get_dbf_table_counts_by_category"() from "service_role";

grant execute on function "public"."get_dbf_table_counts_by_category"() to "service_role";

revoke all on function "public"."get_deduction_engine_stats"() from "anon";

grant execute on function "public"."get_deduction_engine_stats"() to "anon";

revoke all on function "public"."get_deduction_engine_stats"() from "service_role";

grant execute on function "public"."get_deduction_engine_stats"() to "service_role";

revoke all on function "public"."get_deduction_engine_stats"(text, text[]) from "anon";

grant execute on function "public"."get_deduction_engine_stats"(text, text[]) to "anon";

revoke all on function "public"."get_deduction_engine_stats"(text, text[]) from "service_role";

grant execute on function "public"."get_deduction_engine_stats"(text, text[]) to "service_role";

revoke all on function "public"."get_deductions_summary"(uuid, uuid[]) from "anon";

grant execute on function "public"."get_deductions_summary"(uuid, uuid[]) to "anon";

revoke all on function "public"."get_deductions_summary"(uuid, uuid[]) from "service_role";

grant execute on function "public"."get_deductions_summary"(uuid, uuid[]) to "service_role";

revoke all on function "public"."get_payroll_group_counts"() from "anon";

grant execute on function "public"."get_payroll_group_counts"() to "anon";

revoke all on function "public"."get_payroll_group_counts"() from "service_role";

grant execute on function "public"."get_payroll_group_counts"() to "service_role";

revoke all on function "public"."get_payroll_history_by_month"(integer, text, text) from "anon";

grant execute on function "public"."get_payroll_history_by_month"(integer, text, text) to "anon";

revoke all on function "public"."get_payroll_history_by_month"(integer, text, text) from "service_role";

grant execute on function "public"."get_payroll_history_by_month"(integer, text, text) to "service_role";

revoke all on function "public"."get_payroll_register_totals"(uuid, uuid[]) from "anon";

grant execute on function "public"."get_payroll_register_totals"(uuid, uuid[]) to "anon";

revoke all on function "public"."get_payroll_register_totals"(uuid, uuid[]) from "service_role";

grant execute on function "public"."get_payroll_register_totals"(uuid, uuid[]) to "service_role";

revoke all on function "public"."get_role_permissions"() from "anon";

grant execute on function "public"."get_role_permissions"() to "anon";

revoke all on function "public"."get_role_permissions"() from "service_role";

grant execute on function "public"."get_role_permissions"() to "service_role";

revoke all on function "public"."get_user_role"(uuid) from "anon";

grant execute on function "public"."get_user_role"(uuid) to "anon";

revoke all on function "public"."get_user_role"(uuid) from "service_role";

grant execute on function "public"."get_user_role"(uuid) to "service_role";

revoke all on function "public"."get_workflow_steps"() from public;

grant execute on function "public"."get_workflow_steps"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."handle_new_user"() from "anon";

grant execute on function "public"."handle_new_user"() to "anon";

revoke all on function "public"."handle_new_user"() from "authenticated";

grant execute on function "public"."handle_new_user"() to "authenticated";

revoke all on function "public"."handle_new_user"() from "service_role";

grant execute on function "public"."handle_new_user"() to "service_role";

revoke all on function "public"."has_role_level"(text) from "anon";

grant execute on function "public"."has_role_level"(text) to "anon";

revoke all on function "public"."has_role_level"(text) from "service_role";

grant execute on function "public"."has_role_level"(text) to "service_role";

revoke all on function "public"."hash_otp"(text) from "anon";

grant execute on function "public"."hash_otp"(text) to "anon";

revoke all on function "public"."hash_otp"(text) from "service_role";

grant execute on function "public"."hash_otp"(text) to "service_role";

revoke all on function "public"."is_data_admin"() from "anon";

grant execute on function "public"."is_data_admin"() to "anon";

revoke all on function "public"."is_data_admin"() from "authenticated";

grant execute on function "public"."is_data_admin"() to "authenticated";

revoke all on function "public"."is_data_admin"() from "service_role";

grant execute on function "public"."is_data_admin"() to "service_role";

revoke all on function "public"."is_data_writer"() from "anon";

grant execute on function "public"."is_data_writer"() to "anon";

revoke all on function "public"."is_data_writer"() from "authenticated";

grant execute on function "public"."is_data_writer"() to "authenticated";

revoke all on function "public"."is_data_writer"() from "service_role";

grant execute on function "public"."is_data_writer"() to "service_role";

revoke all on function "public"."is_super_admin"() from "anon";

grant execute on function "public"."is_super_admin"() to "anon";

revoke all on function "public"."is_super_admin"() from "authenticated";

grant execute on function "public"."is_super_admin"() to "authenticated";

revoke all on function "public"."is_super_admin"() from "service_role";

grant execute on function "public"."is_super_admin"() to "service_role";

grant execute on function "public"."is_workflow_participant"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."issue_mfa_code"(text) from "service_role";

grant execute on function "public"."issue_mfa_code"(text) to "service_role";

revoke all on function "public"."lock_payroll_period"(uuid) from public;

grant execute on function "public"."lock_payroll_period"(uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."log_table_change"() from "anon";

grant execute on function "public"."log_table_change"() to "anon";

revoke all on function "public"."log_table_change"() from "authenticated";

grant execute on function "public"."log_table_change"() to "authenticated";

revoke all on function "public"."log_table_change"() from "service_role";

grant execute on function "public"."log_table_change"() to "service_role";

revoke all on function "public"."mark_email_verified"() from "anon";

grant execute on function "public"."mark_email_verified"() to "anon";

revoke all on function "public"."mark_email_verified"() from "service_role";

grant execute on function "public"."mark_email_verified"() to "service_role";

revoke all on function "public"."post_payroll"(uuid, uuid[]) from "anon";

grant execute on function "public"."post_payroll"(uuid, uuid[]) to "anon";

revoke all on function "public"."post_payroll"(uuid, uuid[]) from "service_role";

grant execute on function "public"."post_payroll"(uuid, uuid[]) to "service_role";

revoke all on function "public"."prevent_closed_period_reopen"() from "anon";

grant execute on function "public"."prevent_closed_period_reopen"() to "anon";

revoke all on function "public"."prevent_closed_period_reopen"() from "authenticated";

grant execute on function "public"."prevent_closed_period_reopen"() to "authenticated";

revoke all on function "public"."prevent_closed_period_reopen"() from "service_role";

grant execute on function "public"."prevent_closed_period_reopen"() to "service_role";

revoke all on function "public"."prevent_posted_entry_modification"() from "anon";

grant execute on function "public"."prevent_posted_entry_modification"() to "anon";

revoke all on function "public"."prevent_posted_entry_modification"() from "authenticated";

grant execute on function "public"."prevent_posted_entry_modification"() to "authenticated";

revoke all on function "public"."prevent_posted_entry_modification"() from "service_role";

grant execute on function "public"."prevent_posted_entry_modification"() to "service_role";

revoke all on function "public"."protect_profile_columns"() from "anon";

grant execute on function "public"."protect_profile_columns"() to "anon";

revoke all on function "public"."protect_profile_columns"() from "authenticated";

grant execute on function "public"."protect_profile_columns"() to "authenticated";

revoke all on function "public"."protect_profile_columns"() from "service_role";

grant execute on function "public"."protect_profile_columns"() to "service_role";

revoke all on function "public"."query_dedfile"(text, text, text, text, text, integer, integer, text, text, integer, integer, boolean, uuid[], text, text[]) from "anon";

grant execute on function "public"."query_dedfile"(text, text, text, text, text, integer, integer, text, text, integer, integer, boolean, uuid[], text, text[]) to "anon";

revoke all on function "public"."query_dedfile"(text, text, text, text, text, integer, integer, text, text, integer, integer, boolean, uuid[], text, text[]) from "service_role";

grant execute on function "public"."query_dedfile"(text, text, text, text, text, integer, integer, text, text, integer, integer, boolean, uuid[], text, text[]) to "service_role";

revoke all on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) from "anon";

grant execute on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) to "anon";

revoke all on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) from "service_role";

grant execute on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) to "service_role";

revoke all on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) from "anon";

grant execute on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) to "anon";

revoke all on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) from "service_role";

grant execute on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) to "service_role";

revoke all on function "public"."query_schools_with_stats"(text, uuid[], text, text[]) from "anon";

grant execute on function "public"."query_schools_with_stats"(text, uuid[], text, text[]) to "anon";

revoke all on function "public"."query_schools_with_stats"(text, uuid[], text, text[]) from "service_role";

grant execute on function "public"."query_schools_with_stats"(text, uuid[], text, text[]) to "service_role";

revoke all on function "public"."record_failed_login"(text) from "service_role";

grant execute on function "public"."record_failed_login"(text) to "service_role";

revoke all on function "public"."record_login"(text, boolean, text, text, text, text) from public;

grant execute on function "public"."record_login"(text, boolean, text, text, text, text) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."record_security_event"(text, text, text, jsonb) from public;

grant execute on function "public"."record_security_event"(text, text, text, jsonb) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."record_successful_login"() from "anon";

grant execute on function "public"."record_successful_login"() to "anon";

revoke all on function "public"."record_successful_login"() from "service_role";

grant execute on function "public"."record_successful_login"() to "service_role";

revoke all on function "public"."refresh_dashboard_cache"() from "anon";

grant execute on function "public"."refresh_dashboard_cache"() to "anon";

revoke all on function "public"."refresh_dashboard_cache"() from "service_role";

grant execute on function "public"."refresh_dashboard_cache"() to "service_role";

revoke all on function "public"."reject_user"(uuid, text) from "anon";

grant execute on function "public"."reject_user"(uuid, text) to "anon";

revoke all on function "public"."reject_user"(uuid, text) from "service_role";

grant execute on function "public"."reject_user"(uuid, text) to "service_role";

revoke all on function "public"."request_dashboard_refresh"() from "anon";

grant execute on function "public"."request_dashboard_refresh"() to "anon";

revoke all on function "public"."request_dashboard_refresh"() from "service_role";

grant execute on function "public"."request_dashboard_refresh"() to "service_role";

revoke all on function "public"."reverse_payroll"(uuid, uuid[]) from "anon";

grant execute on function "public"."reverse_payroll"(uuid, uuid[]) to "anon";

revoke all on function "public"."reverse_payroll"(uuid, uuid[]) from "service_role";

grant execute on function "public"."reverse_payroll"(uuid, uuid[]) to "service_role";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_payroll_period' AND proargtypes::text[] <@ '{uuid}'::text[]) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reverse_payroll_period(uuid) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reverse_payroll_period(uuid) TO anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.reverse_payroll_period(uuid) FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reverse_payroll_period(uuid) TO service_role';
  END IF;
END
$$;

revoke all on function "public"."run_payroll_engine"(uuid) from "anon";

grant execute on function "public"."run_payroll_engine"(uuid) to "anon";

revoke all on function "public"."run_payroll_engine"(uuid) from "service_role";

grant execute on function "public"."run_payroll_engine"(uuid) to "service_role";

revoke all on function "public"."set_assigned_stacode"(uuid, text) from "anon";

grant execute on function "public"."set_assigned_stacode"(uuid, text) to "anon";

revoke all on function "public"."set_assigned_stacode"(uuid, text) from "service_role";

grant execute on function "public"."set_assigned_stacode"(uuid, text) to "service_role";

revoke all on function "public"."set_digital_signature"(text) from public;

grant execute on function "public"."set_digital_signature"(text) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."set_employee_number"(uuid, text) from "anon";

grant execute on function "public"."set_employee_number"(uuid, text) to "anon";

revoke all on function "public"."set_employee_number"(uuid, text) from "service_role";

grant execute on function "public"."set_employee_number"(uuid, text) to "service_role";

revoke all on function "public"."set_payroll_def_updated_at"() from "anon";

grant execute on function "public"."set_payroll_def_updated_at"() to "anon";

revoke all on function "public"."set_payroll_def_updated_at"() from "authenticated";

grant execute on function "public"."set_payroll_def_updated_at"() to "authenticated";

revoke all on function "public"."set_payroll_def_updated_at"() from "service_role";

grant execute on function "public"."set_payroll_def_updated_at"() to "service_role";

revoke all on function "public"."set_user_division"(uuid, uuid, uuid) from "anon";

grant execute on function "public"."set_user_division"(uuid, uuid, uuid) to "anon";

revoke all on function "public"."set_user_division"(uuid, uuid, uuid) from "service_role";

grant execute on function "public"."set_user_division"(uuid, uuid, uuid) to "service_role";

revoke all on function "public"."set_user_mfa"(uuid, boolean) from "anon";

grant execute on function "public"."set_user_mfa"(uuid, boolean) to "anon";

revoke all on function "public"."set_user_mfa"(uuid, boolean) from "service_role";

grant execute on function "public"."set_user_mfa"(uuid, boolean) to "service_role";

revoke all on function "public"."set_user_role"(uuid, text) from "anon";

grant execute on function "public"."set_user_role"(uuid, text) to "anon";

revoke all on function "public"."set_user_role"(uuid, text) from "service_role";

grant execute on function "public"."set_user_role"(uuid, text) to "service_role";

revoke all on function "public"."stamp_division_codes"() from "anon";

grant execute on function "public"."stamp_division_codes"() to "anon";

revoke all on function "public"."stamp_division_codes"() from "authenticated";

grant execute on function "public"."stamp_division_codes"() to "authenticated";

revoke all on function "public"."stamp_division_codes"() from "service_role";

grant execute on function "public"."stamp_division_codes"() to "service_role";

revoke all on function "public"."sync_email_verified_from_auth"() from "anon";

grant execute on function "public"."sync_email_verified_from_auth"() to "anon";

revoke all on function "public"."sync_email_verified_from_auth"() from "authenticated";

grant execute on function "public"."sync_email_verified_from_auth"() to "authenticated";

revoke all on function "public"."sync_email_verified_from_auth"() from "service_role";

grant execute on function "public"."sync_email_verified_from_auth"() to "service_role";

revoke all on function "public"."sync_employees_to_division"(uuid) from "anon";

grant execute on function "public"."sync_employees_to_division"(uuid) to "anon";

revoke all on function "public"."sync_employees_to_division"(uuid) from "service_role";

grant execute on function "public"."sync_employees_to_division"(uuid) to "service_role";

revoke all on function "public"."touch_updated_at"() from "anon";

grant execute on function "public"."touch_updated_at"() to "anon";

revoke all on function "public"."touch_updated_at"() from "authenticated";

grant execute on function "public"."touch_updated_at"() to "authenticated";

revoke all on function "public"."touch_updated_at"() from "service_role";

grant execute on function "public"."touch_updated_at"() to "service_role";

revoke all on function "public"."unlock_user_account"(uuid) from "anon";

grant execute on function "public"."unlock_user_account"(uuid) to "anon";

revoke all on function "public"."unlock_user_account"(uuid) from "service_role";

grant execute on function "public"."unlock_user_account"(uuid) to "service_role";

revoke all on function "public"."update_schools_updated_at"() from "anon";

grant execute on function "public"."update_schools_updated_at"() to "anon";

revoke all on function "public"."update_schools_updated_at"() from "authenticated";

grant execute on function "public"."update_schools_updated_at"() to "authenticated";

revoke all on function "public"."update_schools_updated_at"() from "service_role";

grant execute on function "public"."update_schools_updated_at"() to "service_role";

revoke all on function "public"."update_updated_at"() from "anon";

grant execute on function "public"."update_updated_at"() to "anon";

revoke all on function "public"."update_updated_at"() from "authenticated";

grant execute on function "public"."update_updated_at"() to "authenticated";

revoke all on function "public"."update_updated_at"() from "service_role";

grant execute on function "public"."update_updated_at"() to "service_role";

revoke all on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) from "anon";

grant execute on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) to "anon";

revoke all on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) from "service_role";

grant execute on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) to "service_role";

revoke all on function "public"."upsert_region"(uuid, text, text, integer) from "anon";

grant execute on function "public"."upsert_region"(uuid, text, text, integer) to "anon";

revoke all on function "public"."upsert_region"(uuid, text, text, integer) from "service_role";

grant execute on function "public"."upsert_region"(uuid, text, text, integer) to "service_role";

revoke all on function "public"."upsert_role_permission"(text, text, boolean) from "anon";

grant execute on function "public"."upsert_role_permission"(text, text, boolean) to "anon";

revoke all on function "public"."upsert_role_permission"(text, text, boolean) from "service_role";

grant execute on function "public"."upsert_role_permission"(text, text, boolean) to "service_role";

revoke all on function "public"."validate_employee_for_approval"(text) from "anon";

grant execute on function "public"."validate_employee_for_approval"(text) to "anon";

revoke all on function "public"."validate_employee_for_approval"(text) from "service_role";

grant execute on function "public"."validate_employee_for_approval"(text) to "service_role";

grant execute on function "public"."validate_nthp_on_insert"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."verify_mfa_code"(text, text) from "service_role";

grant execute on function "public"."verify_mfa_code"(text, text) to "service_role";

revoke all on function "public"."verify_otp"(text, text) from "anon";

grant execute on function "public"."verify_otp"(text, text) to "anon";

revoke all on function "public"."verify_otp"(text, text) from "service_role";

grant execute on function "public"."verify_otp"(text, text) to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."attendance_records" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."audit_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."audit_logs" to "anon";

revoke all on table "public"."audit_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."audit_logs" to "authenticated";

revoke all on table "public"."audit_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."audit_logs" to "service_role";

revoke all on table "public"."ca_employees" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_employees" to "anon";

revoke all on table "public"."ca_employees" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_employees" to "service_role";

revoke all on table "public"."ca_payroll_details" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_details" to "anon";

revoke all on table "public"."ca_payroll_details" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_details" to "service_role";

revoke all on table "public"."ca_payroll_headers" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_headers" to "anon";

revoke all on table "public"."ca_payroll_headers" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_headers" to "service_role";

revoke all on table "public"."ca_payroll_signatories" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_signatories" to "anon";

revoke all on table "public"."ca_payroll_signatories" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ca_payroll_signatories" to "service_role";

revoke all on table "public"."dashboard_stats_cache" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dashboard_stats_cache" to "anon";

revoke all on table "public"."dashboard_stats_cache" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dashboard_stats_cache" to "authenticated";

revoke all on table "public"."dashboard_stats_cache" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dashboard_stats_cache" to "service_role";

revoke all on table "public"."dbf_divtable" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_divtable" to "anon";

revoke all on table "public"."dbf_divtable" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_divtable" to "authenticated";

revoke all on table "public"."dbf_divtable" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_divtable" to "service_role";

revoke all on table "public"."dbf_excluded" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_excluded" to "anon";

revoke all on table "public"."dbf_excluded" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_excluded" to "authenticated";

revoke all on table "public"."dbf_excluded" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_excluded" to "service_role";

revoke all on table "public"."dbf_included" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_included" to "anon";

revoke all on table "public"."dbf_included" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_included" to "authenticated";

revoke all on table "public"."dbf_included" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_included" to "service_role";

revoke all on table "public"."dbf_payrolls" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_payrolls" to "anon";

revoke all on table "public"."dbf_payrolls" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_payrolls" to "authenticated";

revoke all on table "public"."dbf_payrolls" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_payrolls" to "service_role";

revoke all on table "public"."dbf_pyent" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent" to "anon";

revoke all on table "public"."dbf_pyent" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent" to "authenticated";

revoke all on table "public"."dbf_pyent" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent" to "service_role";

revoke all on table "public"."dbf_pyent1" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent1" to "anon";

revoke all on table "public"."dbf_pyent1" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent1" to "authenticated";

revoke all on table "public"."dbf_pyent1" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent1" to "service_role";

revoke all on table "public"."dbf_pyent2" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent2" to "anon";

revoke all on table "public"."dbf_pyent2" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent2" to "authenticated";

revoke all on table "public"."dbf_pyent2" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_pyent2" to "service_role";

revoke all on table "public"."dbf_restore_history" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_restore_history" to "anon";

revoke all on table "public"."dbf_restore_history" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_restore_history" to "authenticated";

revoke all on table "public"."dbf_restore_history" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_restore_history" to "service_role";

revoke all on table "public"."dbf_stntable" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_stntable" to "anon";

revoke all on table "public"."dbf_stntable" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_stntable" to "authenticated";

revoke all on table "public"."dbf_stntable" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_stntable" to "service_role";

revoke all on table "public"."dbf_sync_sessions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_sync_sessions" to "anon";

revoke all on table "public"."dbf_sync_sessions" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_sync_sessions" to "authenticated";

revoke all on table "public"."dbf_sync_sessions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dbf_sync_sessions" to "service_role";

revoke all on table "public"."deduction_codes" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deduction_codes" to "anon";

revoke all on table "public"."deduction_codes" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deduction_codes" to "service_role";

revoke all on table "public"."deduction_history" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deduction_history" to "anon";

revoke all on table "public"."deduction_history" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deduction_history" to "authenticated";

revoke all on table "public"."deduction_history" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deduction_history" to "service_role";

revoke all on table "public"."deductions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deductions" to "anon";

revoke all on table "public"."deductions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."deductions" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."device_logs" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."division_office" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."division_office" to "anon";

revoke all on table "public"."division_office" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."division_office" to "authenticated";

revoke all on table "public"."division_office" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."division_office" to "service_role";

revoke all on table "public"."divisions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."divisions" to "anon";

revoke all on table "public"."divisions" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."divisions" to "authenticated";

revoke all on table "public"."divisions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."divisions" to "service_role";

revoke all on table "public"."earnings" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."earnings" to "anon";

revoke all on table "public"."earnings" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."earnings" to "service_role";

revoke all on table "public"."employees" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."employees" to "anon";

revoke all on table "public"."employees" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."employees" to "service_role";

revoke all on table "public"."gsis_import_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."gsis_import_logs" to "anon";

revoke all on table "public"."gsis_import_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."gsis_import_logs" to "authenticated";

revoke all on table "public"."gsis_import_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."gsis_import_logs" to "service_role";

revoke all on table "public"."initial_payroll_absences" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_absences" to "anon";

revoke all on table "public"."initial_payroll_absences" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_absences" to "authenticated";

revoke all on table "public"."initial_payroll_absences" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_absences" to "service_role";

revoke all on table "public"."initial_payroll_entries" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_entries" to "anon";

revoke all on table "public"."initial_payroll_entries" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_entries" to "authenticated";

revoke all on table "public"."initial_payroll_entries" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_entries" to "service_role";

revoke all on table "public"."initial_payroll_records" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_records" to "anon";

revoke all on table "public"."initial_payroll_records" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_records" to "authenticated";

revoke all on table "public"."initial_payroll_records" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_records" to "service_role";

revoke all on table "public"."initial_payroll_transfers" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_transfers" to "anon";

revoke all on table "public"."initial_payroll_transfers" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_transfers" to "authenticated";

revoke all on table "public"."initial_payroll_transfers" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."initial_payroll_transfers" to "service_role";

revoke all on table "public"."ips_absences" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_absences" to "anon";

revoke all on table "public"."ips_absences" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_absences" to "authenticated";

revoke all on table "public"."ips_absences" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_absences" to "service_role";

revoke all on table "public"."ips_audit_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_audit_logs" to "anon";

revoke all on table "public"."ips_audit_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_audit_logs" to "authenticated";

revoke all on table "public"."ips_audit_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_audit_logs" to "service_role";

revoke all on table "public"."ips_employees" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_employees" to "anon";

revoke all on table "public"."ips_employees" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_employees" to "authenticated";

revoke all on table "public"."ips_employees" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_employees" to "service_role";

revoke all on table "public"."ips_payroll_details" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_details" to "anon";

revoke all on table "public"."ips_payroll_details" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_details" to "authenticated";

revoke all on table "public"."ips_payroll_details" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_details" to "service_role";

revoke all on table "public"."ips_payroll_periods" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_periods" to "anon";

revoke all on table "public"."ips_payroll_periods" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_periods" to "authenticated";

revoke all on table "public"."ips_payroll_periods" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ips_payroll_periods" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."leave_records" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."loan_requests" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."loan_verifications" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."login_attempts" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."login_attempts" to "anon";

revoke all on table "public"."login_attempts" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."login_attempts" to "authenticated";

revoke all on table "public"."login_attempts" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."login_attempts" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."login_logs" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."non_plantilla_employees" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."non_plantilla_employees" to "anon";

revoke all on table "public"."non_plantilla_employees" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."non_plantilla_employees" to "authenticated";

revoke all on table "public"."non_plantilla_employees" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."non_plantilla_employees" to "service_role";

revoke all on table "public"."otp_codes" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."otp_codes" to "anon";

revoke all on table "public"."otp_codes" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."otp_codes" to "authenticated";

revoke all on table "public"."otp_codes" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."otp_codes" to "service_role";

revoke all on table "public"."password_reset_tokens" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."password_reset_tokens" to "anon";

revoke all on table "public"."password_reset_tokens" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."password_reset_tokens" to "authenticated";

revoke all on table "public"."password_reset_tokens" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."password_reset_tokens" to "service_role";

revoke all on table "public"."pay_periods" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pay_periods" to "anon";

revoke all on table "public"."pay_periods" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pay_periods" to "service_role";

revoke all on table "public"."payent" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payent" to "anon";

revoke all on table "public"."payent" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payent" to "authenticated";

revoke all on table "public"."payent" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payent" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_allowances" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_approvals" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."payroll_deductions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_deductions" to "anon";

revoke all on table "public"."payroll_deductions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_deductions" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_deductions_new" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."payroll_definitions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_definitions" to "anon";

revoke all on table "public"."payroll_definitions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_definitions" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_details" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."payroll_entries" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_entries" to "anon";

revoke all on table "public"."payroll_entries" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_entries" to "service_role";

revoke all on table "public"."payroll_formulas" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_formulas" to "anon";

revoke all on table "public"."payroll_formulas" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_formulas" to "service_role";

revoke all on table "public"."payroll_groups" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_groups" to "anon";

revoke all on table "public"."payroll_groups" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_groups" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_headers" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."payroll_number_counter" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_number_counter" to "anon";

revoke all on table "public"."payroll_number_counter" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_number_counter" to "authenticated";

revoke all on table "public"."payroll_number_counter" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_number_counter" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payroll_periods" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."payrolls_dbf" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payrolls_dbf" to "anon";

revoke all on table "public"."payrolls_dbf" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payrolls_dbf" to "authenticated";

revoke all on table "public"."payrolls_dbf" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payrolls_dbf" to "service_role";

revoke all on table "public"."plantilla_headers" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_headers" to "anon";

revoke all on table "public"."plantilla_headers" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_headers" to "authenticated";

revoke all on table "public"."plantilla_headers" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_headers" to "service_role";

revoke all on table "public"."plantilla_import_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_import_logs" to "anon";

revoke all on table "public"."plantilla_import_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_import_logs" to "authenticated";

revoke all on table "public"."plantilla_import_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_import_logs" to "service_role";

revoke all on table "public"."plantilla_positions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_positions" to "anon";

revoke all on table "public"."plantilla_positions" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_positions" to "authenticated";

revoke all on table "public"."plantilla_positions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plantilla_positions" to "service_role";

revoke all on table "public"."pli_import_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pli_import_logs" to "anon";

revoke all on table "public"."pli_import_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pli_import_logs" to "authenticated";

revoke all on table "public"."pli_import_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pli_import_logs" to "service_role";

revoke all on table "public"."position_import_logs" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_import_logs" to "anon";

revoke all on table "public"."position_import_logs" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_import_logs" to "authenticated";

revoke all on table "public"."position_import_logs" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_import_logs" to "service_role";

revoke all on table "public"."position_management" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_management" to "anon";

revoke all on table "public"."position_management" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_management" to "authenticated";

revoke all on table "public"."position_management" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."position_management" to "service_role";

revoke all on table "public"."profiles" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "anon";

revoke all on table "public"."profiles" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "authenticated";

revoke all on table "public"."profiles" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "service_role";

revoke all on table "public"."regions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."regions" to "anon";

revoke all on table "public"."regions" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."regions" to "authenticated";

revoke all on table "public"."regions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."regions" to "service_role";

revoke all on table "public"."role_permissions" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."role_permissions" to "anon";

revoke all on table "public"."role_permissions" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."role_permissions" to "authenticated";

revoke all on table "public"."role_permissions" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."role_permissions" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."salary_history" to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."salary_schedule" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."salary_schedule" to "anon";

revoke all on table "public"."salary_schedule" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."salary_schedule" to "service_role";

revoke all on table "public"."schools" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."schools" to "anon";

revoke all on table "public"."schools" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."schools" to "authenticated";

revoke all on table "public"."schools" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."schools" to "service_role";

revoke all on table "public"."security_events" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_events" to "anon";

revoke all on table "public"."security_events" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_events" to "authenticated";

revoke all on table "public"."security_events" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_events" to "service_role";

revoke all on table "public"."security_settings" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_settings" to "anon";

revoke all on table "public"."security_settings" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_settings" to "authenticated";

revoke all on table "public"."security_settings" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."security_settings" to "service_role";

revoke all on table "public"."signatories" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."signatories" to "anon";

revoke all on table "public"."signatories" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."signatories" to "authenticated";

revoke all on table "public"."signatories" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."signatories" to "service_role";

revoke all on table "public"."stacode_audit" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."stacode_audit" to "anon";

revoke all on table "public"."stacode_audit" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."stacode_audit" to "service_role";

revoke all on table "public"."undeducted_obligations" from "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."undeducted_obligations" to "anon";

revoke all on table "public"."undeducted_obligations" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."undeducted_obligations" to "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."workflow_actions" to "anon", "authenticated", "postgres", "service_role";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "anon";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "authenticated";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "service_role";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "anon";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "authenticated";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "service_role";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "anon";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "authenticated";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "service_role";

