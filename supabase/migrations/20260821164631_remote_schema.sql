set local check_function_bodies = off;

revoke all on table "public"."profiles" from "authenticator";

revoke all on table "public"."profiles" from "supabase_auth_admin";

drop policy "ca_employees_delete" on "public"."ca_employees";

drop policy "ca_employees_insert" on "public"."ca_employees";

drop policy "ca_employees_select" on "public"."ca_employees";

drop policy "ca_employees_update" on "public"."ca_employees";

drop policy "ca_payroll_details_delete" on "public"."ca_payroll_details";

drop policy "ca_payroll_details_insert" on "public"."ca_payroll_details";

drop policy "ca_payroll_details_select" on "public"."ca_payroll_details";

drop policy "ca_payroll_details_update" on "public"."ca_payroll_details";

drop policy "ca_payroll_headers_delete" on "public"."ca_payroll_headers";

drop policy "ca_payroll_headers_insert" on "public"."ca_payroll_headers";

drop policy "ca_payroll_headers_select" on "public"."ca_payroll_headers";

drop policy "ca_payroll_headers_update" on "public"."ca_payroll_headers";

drop policy "ca_payroll_signatories_delete" on "public"."ca_payroll_signatories";

drop policy "ca_payroll_signatories_insert" on "public"."ca_payroll_signatories";

drop policy "ca_payroll_signatories_select" on "public"."ca_payroll_signatories";

drop policy "ca_payroll_signatories_update" on "public"."ca_payroll_signatories";

drop policy "dsc_delete" on "public"."dashboard_stats_cache";

drop policy "dsc_insert" on "public"."dashboard_stats_cache";

drop policy "dsc_select" on "public"."dashboard_stats_cache";

drop policy "dsc_update" on "public"."dashboard_stats_cache";

drop policy "dbf_div_delete" on "public"."dbf_divtable";

drop policy "dbf_div_insert" on "public"."dbf_divtable";

drop policy "dbf_div_select" on "public"."dbf_divtable";

drop policy "dbf_div_update" on "public"."dbf_divtable";

drop policy "dbf_exc_delete" on "public"."dbf_excluded";

drop policy "dbf_exc_insert" on "public"."dbf_excluded";

drop policy "dbf_exc_select" on "public"."dbf_excluded";

drop policy "dbf_exc_update" on "public"."dbf_excluded";

drop policy "dbf_inc_delete" on "public"."dbf_included";

drop policy "dbf_inc_insert" on "public"."dbf_included";

drop policy "dbf_inc_select" on "public"."dbf_included";

drop policy "dbf_inc_update" on "public"."dbf_included";

drop policy "dbf_pay_delete" on "public"."dbf_payrolls";

drop policy "dbf_pay_insert" on "public"."dbf_payrolls";

drop policy "dbf_pay_select" on "public"."dbf_payrolls";

drop policy "dbf_pay_update" on "public"."dbf_payrolls";

drop policy "dbf_pye_delete" on "public"."dbf_pyent";

drop policy "dbf_pye_insert" on "public"."dbf_pyent";

drop policy "dbf_pye_select" on "public"."dbf_pyent";

drop policy "dbf_pye_update" on "public"."dbf_pyent";

drop policy "dbf_pye1_delete" on "public"."dbf_pyent1";

drop policy "dbf_pye1_insert" on "public"."dbf_pyent1";

drop policy "dbf_pye1_select" on "public"."dbf_pyent1";

drop policy "dbf_pye1_update" on "public"."dbf_pyent1";

drop policy "dbf_pye2_delete" on "public"."dbf_pyent2";

drop policy "dbf_pye2_insert" on "public"."dbf_pyent2";

drop policy "dbf_pye2_select" on "public"."dbf_pyent2";

drop policy "dbf_pye2_update" on "public"."dbf_pyent2";

drop policy "dbf_stn_delete" on "public"."dbf_stntable";

drop policy "dbf_stn_insert" on "public"."dbf_stntable";

drop policy "dbf_stn_select" on "public"."dbf_stntable";

drop policy "dbf_stn_update" on "public"."dbf_stntable";

drop policy "sync_sessions_delete" on "public"."dbf_sync_sessions";

drop policy "sync_sessions_insert" on "public"."dbf_sync_sessions";

drop policy "sync_sessions_select" on "public"."dbf_sync_sessions";

drop policy "deduction_codes_select" on "public"."deduction_codes";

drop policy "ded_delete" on "public"."deductions";

drop policy "ded_insert" on "public"."deductions";

drop policy "ded_select" on "public"."deductions";

drop policy "ded_update" on "public"."deductions";

drop policy "select_division_office" on "public"."division_office";

drop policy "divisions_select" on "public"."divisions";

drop policy "earn_delete" on "public"."earnings";

drop policy "earn_insert" on "public"."earnings";

drop policy "earn_select" on "public"."earnings";

drop policy "earn_update" on "public"."earnings";

drop policy "employees_delete" on "public"."employees";

drop policy "employees_insert" on "public"."employees";

drop policy "employees_select" on "public"."employees";

drop policy "employees_update" on "public"."employees";

drop policy "ipa_delete" on "public"."initial_payroll_absences";

drop policy "ipa_insert" on "public"."initial_payroll_absences";

drop policy "ipa_select" on "public"."initial_payroll_absences";

drop policy "ipa_update" on "public"."initial_payroll_absences";

drop policy "delete_initial_payroll_entries" on "public"."initial_payroll_entries";

drop policy "insert_initial_payroll_entries" on "public"."initial_payroll_entries";

drop policy "select_initial_payroll_entries" on "public"."initial_payroll_entries";

drop policy "update_initial_payroll_entries" on "public"."initial_payroll_entries";

drop policy "delete_initial_payroll_records" on "public"."initial_payroll_records";

drop policy "insert_initial_payroll_records" on "public"."initial_payroll_records";

drop policy "select_initial_payroll_records" on "public"."initial_payroll_records";

drop policy "update_initial_payroll_records" on "public"."initial_payroll_records";

drop policy "delete_initial_payroll_transfers" on "public"."initial_payroll_transfers";

drop policy "insert_initial_payroll_transfers" on "public"."initial_payroll_transfers";

drop policy "select_initial_payroll_transfers" on "public"."initial_payroll_transfers";

drop policy "update_initial_payroll_transfers" on "public"."initial_payroll_transfers";

drop policy "ips_abs_delete" on "public"."ips_absences";

drop policy "ips_abs_insert" on "public"."ips_absences";

drop policy "ips_abs_select" on "public"."ips_absences";

drop policy "ips_abs_update" on "public"."ips_absences";

drop policy "ips_audit_insert" on "public"."ips_audit_logs";

drop policy "ips_audit_select" on "public"."ips_audit_logs";

drop policy "ips_emp_delete" on "public"."ips_employees";

drop policy "ips_emp_insert" on "public"."ips_employees";

drop policy "ips_emp_select" on "public"."ips_employees";

drop policy "ips_emp_update" on "public"."ips_employees";

drop policy "ips_pd_delete" on "public"."ips_payroll_details";

drop policy "ips_pd_insert" on "public"."ips_payroll_details";

drop policy "ips_pd_select" on "public"."ips_payroll_details";

drop policy "ips_pd_update" on "public"."ips_payroll_details";

drop policy "ips_pp_delete" on "public"."ips_payroll_periods";

drop policy "ips_pp_insert" on "public"."ips_payroll_periods";

drop policy "ips_pp_select" on "public"."ips_payroll_periods";

drop policy "ips_pp_update" on "public"."ips_payroll_periods";

drop policy "delete_non_plantilla" on "public"."non_plantilla_employees";

drop policy "insert_non_plantilla" on "public"."non_plantilla_employees";

drop policy "select_non_plantilla" on "public"."non_plantilla_employees";

drop policy "update_non_plantilla" on "public"."non_plantilla_employees";

drop policy "pp_delete" on "public"."pay_periods";

drop policy "pp_insert" on "public"."pay_periods";

drop policy "pp_select" on "public"."pay_periods";

drop policy "pp_update" on "public"."pay_periods";

drop policy "payent_delete" on "public"."payent";

drop policy "payent_insert" on "public"."payent";

drop policy "payent_select" on "public"."payent";

drop policy "payent_update" on "public"."payent";

drop policy "select_payroll_approvals" on "public"."payroll_approvals";

drop policy "pd_delete" on "public"."payroll_deductions";

drop policy "pd_insert" on "public"."payroll_deductions";

drop policy "pd_select" on "public"."payroll_deductions";

drop policy "pd_update" on "public"."payroll_deductions";

drop policy "pe_delete" on "public"."payroll_entries";

drop policy "pe_insert" on "public"."payroll_entries";

drop policy "pe_select" on "public"."payroll_entries";

drop policy "pe_update" on "public"."payroll_entries";

drop policy "payroll_groups_select" on "public"."payroll_groups";

drop policy "delete_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "insert_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "select_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "update_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "select_payroll_periods" on "public"."payroll_periods";

drop policy "update_payroll_periods" on "public"."payroll_periods";

drop policy "pdbf_delete" on "public"."payrolls_dbf";

drop policy "pdbf_insert" on "public"."payrolls_dbf";

drop policy "pdbf_select" on "public"."payrolls_dbf";

drop policy "pdbf_update" on "public"."payrolls_dbf";

drop policy "delete_plantilla_headers" on "public"."plantilla_headers";

drop policy "insert_plantilla_headers" on "public"."plantilla_headers";

drop policy "select_plantilla_headers" on "public"."plantilla_headers";

drop policy "update_plantilla_headers" on "public"."plantilla_headers";

drop policy "delete_plantilla_import_logs" on "public"."plantilla_import_logs";

drop policy "insert_plantilla_import_logs" on "public"."plantilla_import_logs";

drop policy "select_plantilla_import_logs" on "public"."plantilla_import_logs";

drop policy "update_plantilla_import_logs" on "public"."plantilla_import_logs";

drop policy "delete_position_management" on "public"."position_management";

drop policy "insert_position_management" on "public"."position_management";

drop policy "select_position_management" on "public"."position_management";

drop policy "update_position_management" on "public"."position_management";

drop policy "regions_select" on "public"."regions";

drop policy "salary_schedule_select" on "public"."salary_schedule";

drop policy "delete_schools" on "public"."schools";

drop policy "insert_schools" on "public"."schools";

drop policy "select_schools" on "public"."schools";

drop policy "update_schools" on "public"."schools";

drop policy "security_events_insert" on "public"."security_events";

drop policy "security_events_select" on "public"."security_events";

drop policy "security_settings_select" on "public"."security_settings";

drop policy "security_settings_update" on "public"."security_settings";

drop policy "delete_signatories" on "public"."signatories";

drop policy "insert_signatories" on "public"."signatories";

drop policy "select_signatories" on "public"."signatories";

drop policy "update_signatories" on "public"."signatories";

drop policy "unded_delete" on "public"."undeducted_obligations";

drop policy "unded_insert" on "public"."undeducted_obligations";

drop policy "unded_select" on "public"."undeducted_obligations";

drop policy "unded_update" on "public"."undeducted_obligations";

drop policy "select_workflow_actions" on "public"."workflow_actions";

drop function "public"."get_current_user_regcode"();

drop function "public"."user_can_see_row"(text, text);

drop function "public"."user_can_write_row"(text, text);

alter table "public"."dashboard_stats_cache"
  drop column "divcode";

alter table "public"."dashboard_stats_cache"
  drop column "regcode";

alter table "public"."dbf_excluded"
  drop column "regcode";

alter table "public"."dbf_included"
  drop column "regcode";

alter table "public"."dbf_payrolls"
  drop column "regcode";

alter table "public"."dbf_pyent"
  drop column "divcode";

alter table "public"."dbf_pyent"
  drop column "regcode";

alter table "public"."dbf_pyent1"
  drop column "divcode";

alter table "public"."dbf_pyent1"
  drop column "regcode";

alter table "public"."dbf_pyent2"
  drop column "divcode";

alter table "public"."dbf_pyent2"
  drop column "regcode";

alter table "public"."dbf_sync_sessions"
  drop column "divcode";

alter table "public"."dbf_sync_sessions"
  drop column "regcode";

alter table "public"."deductions"
  drop column "divcode";

alter table "public"."deductions"
  drop column "regcode";

alter table "public"."earnings"
  drop column "divcode";

alter table "public"."earnings"
  drop column "regcode";

alter table "public"."payroll_deductions"
  drop column "divcode";

alter table "public"."payroll_deductions"
  drop column "regcode";

alter table "public"."payroll_entries"
  drop column "divcode";

alter table "public"."payroll_entries"
  drop column "regcode";

alter table "public"."profiles"
  drop column "divcode";

alter table "public"."profiles"
  drop column "regcode";

alter table "public"."undeducted_obligations"
  drop column "divcode";

alter table "public"."undeducted_obligations"
  drop column "regcode";

alter table "public"."audit_logs"
  no force row level security;

alter table "public"."dashboard_stats_cache"
  no force row level security;

alter table "public"."dbf_divtable"
  no force row level security;

alter table "public"."dbf_excluded"
  no force row level security;

alter table "public"."dbf_included"
  no force row level security;

alter table "public"."dbf_payrolls"
  no force row level security;

alter table "public"."dbf_pyent1"
  no force row level security;

alter table "public"."dbf_pyent2"
  no force row level security;

alter table "public"."dbf_pyent"
  no force row level security;

alter table "public"."dbf_stntable"
  no force row level security;

alter table "public"."dbf_sync_sessions"
  no force row level security;

alter table "public"."deductions"
  no force row level security;

alter table "public"."earnings"
  no force row level security;

alter table "public"."employees"
  no force row level security;

alter table "public"."login_attempts"
  no force row level security;

alter table "public"."otp_codes"
  no force row level security;

alter table "public"."password_reset_tokens"
  no force row level security;

alter table "public"."pay_periods"
  no force row level security;

alter table "public"."payent"
  no force row level security;

alter table "public"."payroll_deductions"
  no force row level security;

alter table "public"."payroll_entries"
  no force row level security;

alter table "public"."payrolls_dbf"
  no force row level security;

alter table "public"."profiles"
  no force row level security;

alter table "public"."undeducted_obligations"
  no force row level security;

create or replace function public.generate_monthly_periods (
  p_year    integer,
  p_regcode text    default null::text,
  p_divcode text    default null::text
)
  returns integer
  language plpgsql
  AS $function$
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

create or replace function public.is_super_admin()
  returns boolean
  language sql
  stable
  security definer
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(btrim(role)) = 'super_admin'
  );
$function$;

create or replace function public.set_payroll_def_updated_at()
  returns trigger
  language plpgsql
  AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
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

create or replace function public.update_schools_updated_at()
  returns trigger
  language plpgsql
  AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
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

create policy "ca_employees_delete" on "public"."ca_employees"
  for delete
  to "authenticated"
  using (true);

create policy "ca_employees_insert" on "public"."ca_employees"
  for insert
  to "authenticated"
  with check (true);

create policy "ca_employees_select" on "public"."ca_employees"
  for select
  to "authenticated"
  using (true);

create policy "ca_employees_update" on "public"."ca_employees"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ca_payroll_details_delete" on "public"."ca_payroll_details"
  for delete
  to "authenticated"
  using (true);

create policy "ca_payroll_details_insert" on "public"."ca_payroll_details"
  for insert
  to "authenticated"
  with check (true);

create policy "ca_payroll_details_select" on "public"."ca_payroll_details"
  for select
  to "authenticated"
  using (true);

create policy "ca_payroll_details_update" on "public"."ca_payroll_details"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ca_payroll_headers_delete" on "public"."ca_payroll_headers"
  for delete
  to "authenticated"
  using (true);

create policy "ca_payroll_headers_insert" on "public"."ca_payroll_headers"
  for insert
  to "authenticated"
  with check (true);

create policy "ca_payroll_headers_select" on "public"."ca_payroll_headers"
  for select
  to "authenticated"
  using (true);

create policy "ca_payroll_headers_update" on "public"."ca_payroll_headers"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ca_payroll_signatories_delete" on "public"."ca_payroll_signatories"
  for delete
  to "authenticated"
  using (true);

create policy "ca_payroll_signatories_insert" on "public"."ca_payroll_signatories"
  for insert
  to "authenticated"
  with check (true);

create policy "ca_payroll_signatories_select" on "public"."ca_payroll_signatories"
  for select
  to "authenticated"
  using (true);

create policy "ca_payroll_signatories_update" on "public"."ca_payroll_signatories"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "cache_select" on "public"."dashboard_stats_cache"
  for select
  to "authenticated"
  using (public.is_data_admin());

create policy "dbf_div_delete" on "public"."dbf_divtable"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_div_insert" on "public"."dbf_divtable"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_div_select" on "public"."dbf_divtable"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_div_update" on "public"."dbf_divtable"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_exc_delete" on "public"."dbf_excluded"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_exc_insert" on "public"."dbf_excluded"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_exc_select" on "public"."dbf_excluded"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_exc_update" on "public"."dbf_excluded"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_inc_delete" on "public"."dbf_included"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_inc_insert" on "public"."dbf_included"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_inc_select" on "public"."dbf_included"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_inc_update" on "public"."dbf_included"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_pay_delete" on "public"."dbf_payrolls"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pay_insert" on "public"."dbf_payrolls"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_pay_select" on "public"."dbf_payrolls"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pay_update" on "public"."dbf_payrolls"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_pye_delete" on "public"."dbf_pyent"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye_insert" on "public"."dbf_pyent"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_pye_select" on "public"."dbf_pyent"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye_update" on "public"."dbf_pyent"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_pye1_delete" on "public"."dbf_pyent1"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye1_insert" on "public"."dbf_pyent1"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_pye1_select" on "public"."dbf_pyent1"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye1_update" on "public"."dbf_pyent1"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_pye2_delete" on "public"."dbf_pyent2"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye2_insert" on "public"."dbf_pyent2"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_pye2_select" on "public"."dbf_pyent2"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_pye2_update" on "public"."dbf_pyent2"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_stn_delete" on "public"."dbf_stntable"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_stn_insert" on "public"."dbf_stntable"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_stn_select" on "public"."dbf_stntable"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_stn_update" on "public"."dbf_stntable"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "dbf_sync_delete" on "public"."dbf_sync_sessions"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_sync_insert" on "public"."dbf_sync_sessions"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "dbf_sync_select" on "public"."dbf_sync_sessions"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "dbf_sync_update" on "public"."dbf_sync_sessions"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "deduction_codes_select" on "public"."deduction_codes"
  for select
  to "authenticated"
  using (true);

create policy "deductions_delete" on "public"."deductions"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "deductions_insert" on "public"."deductions"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

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

create policy "deductions_update" on "public"."deductions"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "select_division_office" on "public"."division_office"
  for select
  to "authenticated"
  using (true);

create policy "divisions_select" on "public"."divisions"
  for select
  to "authenticated"
  using (true);

create policy "earnings_delete" on "public"."earnings"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "earnings_insert" on "public"."earnings"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

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

create policy "earnings_update" on "public"."earnings"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "employees_delete" on "public"."employees"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "employees_insert" on "public"."employees"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "employees_select" on "public"."employees"
  for select
  to "authenticated"
  using
    ((public.is_data_admin() or ((public.get_current_user_role() = 'division_finance'::text) AND (divcode = public.get_current_user_divcode())) or ((public.get_current_user_role()
    = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode())) or
    ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) or (employee_number = public.get_current_user_empno())))));

create policy "employees_update" on "public"."employees"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "ipa_delete" on "public"."initial_payroll_absences"
  for delete
  to "authenticated"
  using (true);

create policy "ipa_insert" on "public"."initial_payroll_absences"
  for insert
  to "authenticated"
  with check (true);

create policy "ipa_select" on "public"."initial_payroll_absences"
  for select
  to "authenticated"
  using (true);

create policy "ipa_update" on "public"."initial_payroll_absences"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_initial_payroll_entries" on "public"."initial_payroll_entries"
  for delete
  to "authenticated"
  using (true);

create policy "insert_initial_payroll_entries" on "public"."initial_payroll_entries"
  for insert
  to "authenticated"
  with check (true);

create policy "select_initial_payroll_entries" on "public"."initial_payroll_entries"
  for select
  to "authenticated"
  using (true);

create policy "update_initial_payroll_entries" on "public"."initial_payroll_entries"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_initial_payroll_records" on "public"."initial_payroll_records"
  for delete
  to "authenticated"
  using (true);

create policy "insert_initial_payroll_records" on "public"."initial_payroll_records"
  for insert
  to "authenticated"
  with check (true);

create policy "select_initial_payroll_records" on "public"."initial_payroll_records"
  for select
  to "authenticated"
  using (true);

create policy "update_initial_payroll_records" on "public"."initial_payroll_records"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_initial_payroll_transfers" on "public"."initial_payroll_transfers"
  for delete
  to "authenticated"
  using (true);

create policy "insert_initial_payroll_transfers" on "public"."initial_payroll_transfers"
  for insert
  to "authenticated"
  with check (true);

create policy "select_initial_payroll_transfers" on "public"."initial_payroll_transfers"
  for select
  to "authenticated"
  using (true);

create policy "update_initial_payroll_transfers" on "public"."initial_payroll_transfers"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ips_abs_delete" on "public"."ips_absences"
  for delete
  to "authenticated"
  using (true);

create policy "ips_abs_insert" on "public"."ips_absences"
  for insert
  to "authenticated"
  with check (true);

create policy "ips_abs_select" on "public"."ips_absences"
  for select
  to "authenticated"
  using (true);

create policy "ips_abs_update" on "public"."ips_absences"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ips_audit_insert" on "public"."ips_audit_logs"
  for insert
  to "authenticated"
  with check (true);

create policy "ips_audit_select" on "public"."ips_audit_logs"
  for select
  to "authenticated"
  using (true);

create policy "ips_emp_delete" on "public"."ips_employees"
  for delete
  to "authenticated"
  using (true);

create policy "ips_emp_insert" on "public"."ips_employees"
  for insert
  to "authenticated"
  with check (true);

create policy "ips_emp_select" on "public"."ips_employees"
  for select
  to "authenticated"
  using (true);

create policy "ips_emp_update" on "public"."ips_employees"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ips_pd_delete" on "public"."ips_payroll_details"
  for delete
  to "authenticated"
  using (true);

create policy "ips_pd_insert" on "public"."ips_payroll_details"
  for insert
  to "authenticated"
  with check (true);

create policy "ips_pd_select" on "public"."ips_payroll_details"
  for select
  to "authenticated"
  using (true);

create policy "ips_pd_update" on "public"."ips_payroll_details"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "ips_pp_delete" on "public"."ips_payroll_periods"
  for delete
  to "authenticated"
  using (true);

create policy "ips_pp_insert" on "public"."ips_payroll_periods"
  for insert
  to "authenticated"
  with check (true);

create policy "ips_pp_select" on "public"."ips_payroll_periods"
  for select
  to "authenticated"
  using (true);

create policy "ips_pp_update" on "public"."ips_payroll_periods"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_non_plantilla" on "public"."non_plantilla_employees"
  for delete
  to "authenticated"
  using (true);

create policy "insert_non_plantilla" on "public"."non_plantilla_employees"
  for insert
  to "authenticated"
  with check (true);

create policy "select_non_plantilla" on "public"."non_plantilla_employees"
  for select
  to "authenticated"
  using (true);

create policy "update_non_plantilla" on "public"."non_plantilla_employees"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "pay_periods_delete" on "public"."pay_periods"
  for delete
  to "authenticated"
  using ((public.get_current_user_role() = 'super_admin'::text));

create policy "pay_periods_insert" on "public"."pay_periods"
  for insert
  to "authenticated"
  with check ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text])));

create policy "pay_periods_select" on "public"."pay_periods"
  for select
  to "authenticated"
  using (true);

create policy "pay_periods_update" on "public"."pay_periods"
  for update
  to "authenticated"
  using ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text])))
  with check ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text])));

create policy "payent_delete" on "public"."payent"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "payent_insert" on "public"."payent"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "payent_select" on "public"."payent"
  for select
  to "authenticated"
  using ((public.is_data_admin() or ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (exists ( select 1
   from public.employees e
  where ((e.id = payent.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) or
    ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) or (exists ( select 1
   from public.employees e
  where ((e.id = payent.employee_id) AND ((e.empno = public.get_current_user_empno()) or (e.employee_number = public.get_current_user_empno())))))))));

create policy "payent_update" on "public"."payent"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "select_payroll_approvals" on "public"."payroll_approvals"
  for select
  to "authenticated"
  using (true);

create policy "payroll_deductions_delete" on "public"."payroll_deductions"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "payroll_deductions_insert" on "public"."payroll_deductions"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

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

create policy "payroll_deductions_update" on "public"."payroll_deductions"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "payroll_entries_delete" on "public"."payroll_entries"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "payroll_entries_insert" on "public"."payroll_entries"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

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

create policy "payroll_entries_update" on "public"."payroll_entries"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "payroll_groups_select" on "public"."payroll_groups"
  for select
  to "authenticated"
  using (true);

create policy "delete_payroll_number_counter" on "public"."payroll_number_counter"
  for delete
  to "authenticated"
  using (true);

create policy "insert_payroll_number_counter" on "public"."payroll_number_counter"
  for insert
  to "authenticated"
  with check (true);

create policy "select_payroll_number_counter" on "public"."payroll_number_counter"
  for select
  to "authenticated"
  using (true);

create policy "update_payroll_number_counter" on "public"."payroll_number_counter"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "select_payroll_periods" on "public"."payroll_periods"
  for select
  to "authenticated"
  using (true);

create policy "update_payroll_periods" on "public"."payroll_periods"
  for update
  to "authenticated"
  using (public.is_workflow_participant())
  with check (true);

create policy "pdbf_delete" on "public"."payrolls_dbf"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "pdbf_insert" on "public"."payrolls_dbf"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

create policy "pdbf_select" on "public"."payrolls_dbf"
  for select
  to "authenticated"
  using (public.is_data_writer());

create policy "pdbf_update" on "public"."payrolls_dbf"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "delete_plantilla_headers" on "public"."plantilla_headers"
  for delete
  to "authenticated"
  using (true);

create policy "insert_plantilla_headers" on "public"."plantilla_headers"
  for insert
  to "authenticated"
  with check (true);

create policy "select_plantilla_headers" on "public"."plantilla_headers"
  for select
  to "authenticated"
  using (true);

create policy "update_plantilla_headers" on "public"."plantilla_headers"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_plantilla_import_logs" on "public"."plantilla_import_logs"
  for delete
  to "authenticated"
  using (true);

create policy "insert_plantilla_import_logs" on "public"."plantilla_import_logs"
  for insert
  to "authenticated"
  with check (true);

create policy "select_plantilla_import_logs" on "public"."plantilla_import_logs"
  for select
  to "authenticated"
  using (true);

create policy "update_plantilla_import_logs" on "public"."plantilla_import_logs"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_position_management" on "public"."position_management"
  for delete
  to "authenticated"
  using (true);

create policy "insert_position_management" on "public"."position_management"
  for insert
  to "authenticated"
  with check (true);

create policy "select_position_management" on "public"."position_management"
  for select
  to "authenticated"
  using (true);

create policy "update_position_management" on "public"."position_management"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "regions_select" on "public"."regions"
  for select
  to "authenticated"
  using (true);

create policy "salary_schedule_select" on "public"."salary_schedule"
  for select
  to "authenticated"
  using (true);

create policy "delete_schools" on "public"."schools"
  for delete
  to "authenticated"
  using (true);

create policy "insert_schools" on "public"."schools"
  for insert
  to "authenticated"
  with check (true);

create policy "select_schools" on "public"."schools"
  for select
  to "authenticated"
  using (true);

create policy "update_schools" on "public"."schools"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "security_events_insert" on "public"."security_events"
  for insert
  to "authenticated"
  with check (true);

create policy "security_events_select" on "public"."security_events"
  for select
  to "authenticated"
  using (true);

create policy "security_settings_select" on "public"."security_settings"
  for select
  to "authenticated"
  using (true);

create policy "security_settings_update" on "public"."security_settings"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "delete_signatories" on "public"."signatories"
  for delete
  to "authenticated"
  using (true);

create policy "insert_signatories" on "public"."signatories"
  for insert
  to "authenticated"
  with check (true);

create policy "select_signatories" on "public"."signatories"
  for select
  to "authenticated"
  using (true);

create policy "update_signatories" on "public"."signatories"
  for update
  to "authenticated"
  using (true)
  with check (true);

create policy "undeducted_obligations_delete" on "public"."undeducted_obligations"
  for delete
  to "authenticated"
  using (public.is_data_writer());

create policy "undeducted_obligations_insert" on "public"."undeducted_obligations"
  for insert
  to "authenticated"
  with check (public.is_data_writer());

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

create policy "undeducted_obligations_update" on "public"."undeducted_obligations"
  for update
  to "authenticated"
  using (public.is_data_writer())
  with check (public.is_data_writer());

create policy "select_workflow_actions" on "public"."workflow_actions"
  for select
  to "authenticated"
  using (true);

revoke all on function "public"."_trig_refresh_dashboard_cache"() from public;

grant execute on function "public"."_trig_refresh_dashboard_cache"() to public;

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "anon";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "anon";

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "authenticated";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "authenticated";

revoke all on function "public"."_trig_refresh_dashboard_cache"() from "service_role";

grant execute on function "public"."_trig_refresh_dashboard_cache"() to "service_role";

revoke all on function "public"."advance_workflow_step"(uuid, text, text, text) from "anon";

grant execute on function "public"."advance_workflow_step"(uuid, text, text, text) to "anon";

revoke all on function "public"."approve_user"(uuid) from "anon";

grant execute on function "public"."approve_user"(uuid) to "anon";

revoke all on function "public"."assign_schools_to_division"(uuid, uuid[]) from public;

grant execute on function "public"."assign_schools_to_division"(uuid, uuid[]) to public;

revoke all on function "public"."assign_schools_to_division"(uuid, uuid[]) from "anon";

grant execute on function "public"."assign_schools_to_division"(uuid, uuid[]) to "anon";

revoke all on function "public"."can_view_employee_row"(text, text) from public;

grant execute on function "public"."can_view_employee_row"(text, text) to public;

revoke all on function "public"."can_view_employee_row"(text, text) from "anon";

grant execute on function "public"."can_view_employee_row"(text, text) to "anon";

revoke all on function "public"."cleanup_expired_otps"() from "anon";

grant execute on function "public"."cleanup_expired_otps"() to "anon";

revoke all on function "public"."cleanup_expired_otps"() from "authenticated";

grant execute on function "public"."cleanup_expired_otps"() to "authenticated";

revoke all on function "public"."cleanup_expired_otps"() from "service_role";

grant execute on function "public"."cleanup_expired_otps"() to "service_role";

revoke all on function "public"."clear_schools_from_division"(uuid, uuid[]) from public;

grant execute on function "public"."clear_schools_from_division"(uuid, uuid[]) to public;

revoke all on function "public"."clear_schools_from_division"(uuid, uuid[]) from "anon";

grant execute on function "public"."clear_schools_from_division"(uuid, uuid[]) to "anon";

revoke all on function "public"."delete_division"(uuid) from public;

grant execute on function "public"."delete_division"(uuid) to public;

revoke all on function "public"."delete_division"(uuid) from "anon";

grant execute on function "public"."delete_division"(uuid) to "anon";

revoke all on function "public"."delete_region"(uuid) from public;

grant execute on function "public"."delete_region"(uuid) to public;

revoke all on function "public"."delete_region"(uuid) from "anon";

grant execute on function "public"."delete_region"(uuid) to "anon";

revoke all on function "public"."delete_role_permission"(text, text) from "anon";

grant execute on function "public"."delete_role_permission"(text, text) to "anon";

revoke all on function "public"."disable_user"(uuid) from "anon";

grant execute on function "public"."disable_user"(uuid) to "anon";

revoke all on function "public"."enable_user"(uuid) from "anon";

grant execute on function "public"."enable_user"(uuid) to "anon";

revoke all on function "public"."enforce_posted_entry_invariants"() from public;

grant execute on function "public"."enforce_posted_entry_invariants"() to public;

revoke all on function "public"."enforce_posted_entry_invariants"() from "anon";

grant execute on function "public"."enforce_posted_entry_invariants"() to "anon";

revoke all on function "public"."enforce_posted_entry_invariants"() from "authenticated";

grant execute on function "public"."enforce_posted_entry_invariants"() to "authenticated";

revoke all on function "public"."enforce_posted_entry_invariants"() from "service_role";

grant execute on function "public"."enforce_posted_entry_invariants"() to "service_role";

revoke all on function "public"."get_current_empno"() from public;

grant execute on function "public"."get_current_empno"() to public;

revoke all on function "public"."get_current_empno"() from "anon";

grant execute on function "public"."get_current_empno"() to "anon";

revoke all on function "public"."get_current_stacode"() from public;

grant execute on function "public"."get_current_stacode"() to public;

revoke all on function "public"."get_current_stacode"() from "anon";

grant execute on function "public"."get_current_stacode"() to "anon";

revoke all on function "public"."get_current_user_divcode"() from public;

grant execute on function "public"."get_current_user_divcode"() to public;

revoke all on function "public"."get_current_user_divcode"() from "anon";

grant execute on function "public"."get_current_user_divcode"() to "anon";

revoke all on function "public"."get_current_user_division_codes"() from "anon";

grant execute on function "public"."get_current_user_division_codes"() to "anon";

revoke all on function "public"."get_current_user_empno"() from public;

grant execute on function "public"."get_current_user_empno"() to public;

revoke all on function "public"."get_current_user_empno"() from "anon";

grant execute on function "public"."get_current_user_empno"() to "anon";

revoke all on function "public"."get_current_user_role"() from "anon";

grant execute on function "public"."get_current_user_role"() to "anon";

revoke all on function "public"."get_current_user_stacode"() from public;

grant execute on function "public"."get_current_user_stacode"() to public;

revoke all on function "public"."get_current_user_stacode"() from "anon";

grant execute on function "public"."get_current_user_stacode"() to "anon";

revoke all on function "public"."get_dashboard_summary"(text, text, text[]) from public;

grant execute on function "public"."get_dashboard_summary"(text, text, text[]) to public;

revoke all on function "public"."get_dashboard_summary"(text, text, text[]) from "anon";

grant execute on function "public"."get_dashboard_summary"(text, text, text[]) to "anon";

revoke all on function "public"."get_deduction_engine_stats"(text, text[]) from public;

grant execute on function "public"."get_deduction_engine_stats"(text, text[]) to public;

revoke all on function "public"."get_deduction_engine_stats"(text, text[]) from "anon";

grant execute on function "public"."get_deduction_engine_stats"(text, text[]) to "anon";

revoke all on function "public"."get_payroll_history_by_month"(integer, text, text) from public;

grant execute on function "public"."get_payroll_history_by_month"(integer, text, text) to public;

revoke all on function "public"."get_payroll_history_by_month"(integer, text, text) from "anon";

grant execute on function "public"."get_payroll_history_by_month"(integer, text, text) to "anon";

revoke all on function "public"."get_role_permissions"() from "anon";

grant execute on function "public"."get_role_permissions"() to "anon";

revoke all on function "public"."get_user_role"(uuid) from "anon";

grant execute on function "public"."get_user_role"(uuid) to "anon";

revoke all on function "public"."handle_new_user"() from "anon";

grant execute on function "public"."handle_new_user"() to "anon";

revoke all on function "public"."handle_new_user"() from "authenticated";

grant execute on function "public"."handle_new_user"() to "authenticated";

revoke all on function "public"."handle_new_user"() from "service_role";

grant execute on function "public"."handle_new_user"() to "service_role";

revoke all on function "public"."has_role_level"(text) from "anon";

grant execute on function "public"."has_role_level"(text) to "anon";

revoke all on function "public"."is_data_admin"() from public;

grant execute on function "public"."is_data_admin"() to public;

revoke all on function "public"."is_data_admin"() from "anon";

grant execute on function "public"."is_data_admin"() to "anon";

revoke all on function "public"."is_data_writer"() from public;

grant execute on function "public"."is_data_writer"() to public;

revoke all on function "public"."is_data_writer"() from "anon";

grant execute on function "public"."is_data_writer"() to "anon";

revoke all on function "public"."is_super_admin"() from public;

grant execute on function "public"."is_super_admin"() to public;

revoke all on function "public"."is_super_admin"() from "anon";

grant execute on function "public"."is_super_admin"() to "anon";

revoke all on function "public"."is_workflow_participant"() from public;

grant execute on function "public"."is_workflow_participant"() to public;

revoke all on function "public"."is_workflow_participant"() from "anon";

grant execute on function "public"."is_workflow_participant"() to "anon";

revoke all on function "public"."issue_mfa_code"(text) from "anon";

grant execute on function "public"."issue_mfa_code"(text) to "anon";

revoke all on function "public"."lock_payroll_period"(uuid) from "anon";

grant execute on function "public"."lock_payroll_period"(uuid) to "anon";

revoke all on function "public"."log_table_change"() from "anon";

grant execute on function "public"."log_table_change"() to "anon";

revoke all on function "public"."log_table_change"() from "authenticated";

grant execute on function "public"."log_table_change"() to "authenticated";

revoke all on function "public"."log_table_change"() from "service_role";

grant execute on function "public"."log_table_change"() to "service_role";

revoke all on function "public"."post_payroll"(uuid, uuid[]) from "anon";

grant execute on function "public"."post_payroll"(uuid, uuid[]) to "anon";

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

revoke all on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) from "anon";

grant execute on function "public"."query_employees"(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]) to "anon";

revoke all on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) from "anon";

grant execute on function "public"."query_payroll_deductions"(text, text, text, text, text[], integer, integer, integer, integer, boolean) to "anon";

revoke all on function "public"."record_failed_login"(text) from "anon";

grant execute on function "public"."record_failed_login"(text) to "anon";

revoke all on function "public"."record_failed_login"(text) from "authenticated";

grant execute on function "public"."record_failed_login"(text) to "authenticated";

revoke all on function "public"."record_failed_login"(text) from "service_role";

grant execute on function "public"."record_failed_login"(text) to "service_role";

revoke all on function "public"."record_login"(text, boolean, text, text, text, text) from "anon";

grant execute on function "public"."record_login"(text, boolean, text, text, text, text) to "anon";

revoke all on function "public"."record_security_event"(text, text, text, jsonb) from "anon";

grant execute on function "public"."record_security_event"(text, text, text, jsonb) to "anon";

revoke all on function "public"."refresh_dashboard_cache"() from "anon";

grant execute on function "public"."refresh_dashboard_cache"() to "anon";

revoke all on function "public"."reject_user"(uuid, text) from "anon";

grant execute on function "public"."reject_user"(uuid, text) to "anon";

revoke all on function "public"."request_dashboard_refresh"() from "anon";

grant execute on function "public"."request_dashboard_refresh"() to "anon";

revoke all on function "public"."reverse_payroll"(uuid, uuid[]) from "anon";

grant execute on function "public"."reverse_payroll"(uuid, uuid[]) to "anon";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_payroll_period' AND proargtypes::text[] <@ '{uuid}'::text[]) THEN
    REVOKE ALL ON FUNCTION public.reverse_payroll_period(uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.reverse_payroll_period(uuid) TO anon;
  END IF;
END $$;

revoke all on function "public"."run_payroll_engine"(uuid) from public;

grant execute on function "public"."run_payroll_engine"(uuid) to public;

revoke all on function "public"."run_payroll_engine"(uuid) from "anon";

grant execute on function "public"."run_payroll_engine"(uuid) to "anon";

revoke all on function "public"."set_assigned_stacode"(uuid, text) from "anon";

grant execute on function "public"."set_assigned_stacode"(uuid, text) to "anon";

revoke all on function "public"."set_digital_signature"(text) from "anon";

grant execute on function "public"."set_digital_signature"(text) to "anon";

revoke all on function "public"."set_employee_number"(uuid, text) from "anon";

grant execute on function "public"."set_employee_number"(uuid, text) to "anon";

revoke all on function "public"."set_user_division"(uuid, uuid, uuid) from public;

grant execute on function "public"."set_user_division"(uuid, uuid, uuid) to public;

revoke all on function "public"."set_user_division"(uuid, uuid, uuid) from "anon";

grant execute on function "public"."set_user_division"(uuid, uuid, uuid) to "anon";

revoke all on function "public"."set_user_mfa"(uuid, boolean) from "anon";

grant execute on function "public"."set_user_mfa"(uuid, boolean) to "anon";

revoke all on function "public"."set_user_role"(uuid, text) from "anon";

grant execute on function "public"."set_user_role"(uuid, text) to "anon";

revoke all on function "public"."stamp_division_codes"() from public;

grant execute on function "public"."stamp_division_codes"() to public;

revoke all on function "public"."stamp_division_codes"() from "anon";

grant execute on function "public"."stamp_division_codes"() to "anon";

revoke all on function "public"."stamp_division_codes"() from "authenticated";

grant execute on function "public"."stamp_division_codes"() to "authenticated";

revoke all on function "public"."stamp_division_codes"() from "service_role";

grant execute on function "public"."stamp_division_codes"() to "service_role";

revoke all on function "public"."sync_email_verified_from_auth"() from public;

grant execute on function "public"."sync_email_verified_from_auth"() to public;

revoke all on function "public"."sync_email_verified_from_auth"() from "anon";

grant execute on function "public"."sync_email_verified_from_auth"() to "anon";

revoke all on function "public"."sync_email_verified_from_auth"() from "authenticated";

grant execute on function "public"."sync_email_verified_from_auth"() to "authenticated";

revoke all on function "public"."sync_email_verified_from_auth"() from "service_role";

grant execute on function "public"."sync_email_verified_from_auth"() to "service_role";

revoke all on function "public"."sync_employees_to_division"(uuid) from public;

grant execute on function "public"."sync_employees_to_division"(uuid) to public;

revoke all on function "public"."sync_employees_to_division"(uuid) from "anon";

grant execute on function "public"."sync_employees_to_division"(uuid) to "anon";

revoke all on function "public"."unlock_user_account"(uuid) from "anon";

grant execute on function "public"."unlock_user_account"(uuid) to "anon";

revoke all on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) from public;

grant execute on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) to public;

revoke all on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) from "anon";

grant execute on function "public"."upsert_division"(uuid, uuid, text, text, text, jsonb) to "anon";

revoke all on function "public"."upsert_region"(uuid, text, text, integer) from public;

grant execute on function "public"."upsert_region"(uuid, text, text, integer) to public;

revoke all on function "public"."upsert_region"(uuid, text, text, integer) from "anon";

grant execute on function "public"."upsert_region"(uuid, text, text, integer) to "anon";

revoke all on function "public"."upsert_role_permission"(text, text, boolean) from "anon";

grant execute on function "public"."upsert_role_permission"(text, text, boolean) to "anon";

revoke all on function "public"."validate_nthp_on_insert"() from public;

grant execute on function "public"."validate_nthp_on_insert"() to public;

revoke all on function "public"."validate_nthp_on_insert"() from "anon";

grant execute on function "public"."validate_nthp_on_insert"() to "anon";

revoke all on function "public"."verify_mfa_code"(text, text) from "anon";

grant execute on function "public"."verify_mfa_code"(text, text) to "anon";

