-- Auto-synced from Supabase Studio
-- Detected at: 2026-08-22 17:33:06

drop trigger if exists "trg_validate_nthp" on "public"."payroll_details";

drop policy "insert_attendance" on "public"."attendance_records";

drop policy "select_attendance" on "public"."attendance_records";

drop policy "update_attendance" on "public"."attendance_records";

drop policy "insert_device_logs" on "public"."device_logs";

drop policy "select_device_logs_admin" on "public"."device_logs";

drop policy "select_own_device_logs" on "public"."device_logs";

drop policy "insert_leave" on "public"."leave_records";

drop policy "select_leave" on "public"."leave_records";

drop policy "update_leave" on "public"."leave_records";

drop policy "insert_loan_requests" on "public"."loan_requests";

drop policy "select_loan_requests" on "public"."loan_requests";

drop policy "update_loan_requests" on "public"."loan_requests";

drop policy "insert_loan_verifications" on "public"."loan_verifications";

drop policy "select_loan_verifications" on "public"."loan_verifications";

drop policy "insert_login_logs_anon" on "public"."login_logs";

drop policy "insert_login_logs_auth" on "public"."login_logs";

drop policy "select_login_logs_admin" on "public"."login_logs";

drop policy "select_own_login_logs" on "public"."login_logs";

drop policy "insert_allowances" on "public"."payroll_allowances";

drop policy "select_allowances" on "public"."payroll_allowances";

drop policy "insert_payroll_approvals" on "public"."payroll_approvals";

drop policy "select_payroll_approvals" on "public"."payroll_approvals";

drop policy "update_payroll_approvals" on "public"."payroll_approvals";

drop policy "insert_pd_new" on "public"."payroll_deductions_new";

drop policy "select_pd_new" on "public"."payroll_deductions_new";

drop policy "insert_payroll_details" on "public"."payroll_details";

drop policy "select_payroll_details" on "public"."payroll_details";

drop policy "update_payroll_details" on "public"."payroll_details";

drop policy "insert_payroll_headers" on "public"."payroll_headers";

drop policy "select_payroll_headers" on "public"."payroll_headers";

drop policy "update_payroll_headers" on "public"."payroll_headers";

drop policy "insert_payroll_periods" on "public"."payroll_periods";

drop policy "select_payroll_periods" on "public"."payroll_periods";

drop policy "update_payroll_periods" on "public"."payroll_periods";

drop policy "insert_plantilla" on "public"."plantilla_positions";

drop policy "select_plantilla" on "public"."plantilla_positions";

drop policy "update_plantilla" on "public"."plantilla_positions";

drop policy "insert_salary_history" on "public"."salary_history";

drop policy "select_salary_history" on "public"."salary_history";

drop policy "insert_workflow_actions" on "public"."workflow_actions";

drop policy "select_workflow_actions" on "public"."workflow_actions";

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

drop policy "deduction_codes_select" on "public"."deduction_codes";

drop policy "deductions_select" on "public"."deductions";

drop policy "select_division_office" on "public"."division_office";

drop policy "divisions_select" on "public"."divisions";

drop policy "earnings_select" on "public"."earnings";

drop policy "employees_select" on "public"."employees";

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

drop policy "pay_periods_select" on "public"."pay_periods";

drop policy "payroll_deductions_select" on "public"."payroll_deductions";

drop policy "payroll_entries_select" on "public"."payroll_entries";

drop policy "payroll_groups_select" on "public"."payroll_groups";

drop policy "delete_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "insert_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "select_payroll_number_counter" on "public"."payroll_number_counter";

drop policy "update_payroll_number_counter" on "public"."payroll_number_counter";

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

drop policy "undeducted_obligations_select" on "public"."undeducted_obligations";

revoke delete on table "public"."attendance_records" from "anon";

revoke insert on table "public"."attendance_records" from "anon";

revoke references on table "public"."attendance_records" from "anon";

revoke select on table "public"."attendance_records" from "anon";

revoke trigger on table "public"."attendance_records" from "anon";

revoke truncate on table "public"."attendance_records" from "anon";

revoke update on table "public"."attendance_records" from "anon";

revoke delete on table "public"."attendance_records" from "authenticated";

revoke insert on table "public"."attendance_records" from "authenticated";

revoke references on table "public"."attendance_records" from "authenticated";

revoke select on table "public"."attendance_records" from "authenticated";

revoke trigger on table "public"."attendance_records" from "authenticated";

revoke truncate on table "public"."attendance_records" from "authenticated";

revoke update on table "public"."attendance_records" from "authenticated";

revoke delete on table "public"."attendance_records" from "service_role";

revoke insert on table "public"."attendance_records" from "service_role";

revoke references on table "public"."attendance_records" from "service_role";

revoke select on table "public"."attendance_records" from "service_role";

revoke trigger on table "public"."attendance_records" from "service_role";

revoke truncate on table "public"."attendance_records" from "service_role";

revoke update on table "public"."attendance_records" from "service_role";

revoke delete on table "public"."audit_logs" from "anon";

revoke insert on table "public"."audit_logs" from "anon";

revoke references on table "public"."audit_logs" from "anon";

revoke trigger on table "public"."audit_logs" from "anon";

revoke truncate on table "public"."audit_logs" from "anon";

revoke update on table "public"."audit_logs" from "anon";

revoke delete on table "public"."audit_logs" from "service_role";

revoke insert on table "public"."audit_logs" from "service_role";

revoke references on table "public"."audit_logs" from "service_role";

revoke select on table "public"."audit_logs" from "service_role";

revoke trigger on table "public"."audit_logs" from "service_role";

revoke truncate on table "public"."audit_logs" from "service_role";

revoke update on table "public"."audit_logs" from "service_role";

revoke delete on table "public"."ca_employees" from "anon";

revoke insert on table "public"."ca_employees" from "anon";

revoke references on table "public"."ca_employees" from "anon";

revoke trigger on table "public"."ca_employees" from "anon";

revoke truncate on table "public"."ca_employees" from "anon";

revoke update on table "public"."ca_employees" from "anon";

revoke delete on table "public"."ca_employees" from "service_role";

revoke insert on table "public"."ca_employees" from "service_role";

revoke references on table "public"."ca_employees" from "service_role";

revoke select on table "public"."ca_employees" from "service_role";

revoke trigger on table "public"."ca_employees" from "service_role";

revoke truncate on table "public"."ca_employees" from "service_role";

revoke update on table "public"."ca_employees" from "service_role";

revoke delete on table "public"."ca_payroll_details" from "anon";

revoke insert on table "public"."ca_payroll_details" from "anon";

revoke references on table "public"."ca_payroll_details" from "anon";

revoke trigger on table "public"."ca_payroll_details" from "anon";

revoke truncate on table "public"."ca_payroll_details" from "anon";

revoke update on table "public"."ca_payroll_details" from "anon";

revoke delete on table "public"."ca_payroll_details" from "service_role";

revoke insert on table "public"."ca_payroll_details" from "service_role";

revoke references on table "public"."ca_payroll_details" from "service_role";

revoke select on table "public"."ca_payroll_details" from "service_role";

revoke trigger on table "public"."ca_payroll_details" from "service_role";

revoke truncate on table "public"."ca_payroll_details" from "service_role";

revoke update on table "public"."ca_payroll_details" from "service_role";

revoke delete on table "public"."ca_payroll_headers" from "anon";

revoke insert on table "public"."ca_payroll_headers" from "anon";

revoke references on table "public"."ca_payroll_headers" from "anon";

revoke trigger on table "public"."ca_payroll_headers" from "anon";

revoke truncate on table "public"."ca_payroll_headers" from "anon";

revoke update on table "public"."ca_payroll_headers" from "anon";

revoke delete on table "public"."ca_payroll_headers" from "service_role";

revoke insert on table "public"."ca_payroll_headers" from "service_role";

revoke references on table "public"."ca_payroll_headers" from "service_role";

revoke select on table "public"."ca_payroll_headers" from "service_role";

revoke trigger on table "public"."ca_payroll_headers" from "service_role";

revoke truncate on table "public"."ca_payroll_headers" from "service_role";

revoke update on table "public"."ca_payroll_headers" from "service_role";

revoke delete on table "public"."ca_payroll_signatories" from "anon";

revoke insert on table "public"."ca_payroll_signatories" from "anon";

revoke references on table "public"."ca_payroll_signatories" from "anon";

revoke trigger on table "public"."ca_payroll_signatories" from "anon";

revoke truncate on table "public"."ca_payroll_signatories" from "anon";

revoke update on table "public"."ca_payroll_signatories" from "anon";

revoke delete on table "public"."ca_payroll_signatories" from "service_role";

revoke insert on table "public"."ca_payroll_signatories" from "service_role";

revoke references on table "public"."ca_payroll_signatories" from "service_role";

revoke select on table "public"."ca_payroll_signatories" from "service_role";

revoke trigger on table "public"."ca_payroll_signatories" from "service_role";

revoke truncate on table "public"."ca_payroll_signatories" from "service_role";

revoke update on table "public"."ca_payroll_signatories" from "service_role";

revoke delete on table "public"."dashboard_stats_cache" from "anon";

revoke insert on table "public"."dashboard_stats_cache" from "anon";

revoke references on table "public"."dashboard_stats_cache" from "anon";

revoke trigger on table "public"."dashboard_stats_cache" from "anon";

revoke truncate on table "public"."dashboard_stats_cache" from "anon";

revoke update on table "public"."dashboard_stats_cache" from "anon";

revoke delete on table "public"."dashboard_stats_cache" from "service_role";

revoke insert on table "public"."dashboard_stats_cache" from "service_role";

revoke references on table "public"."dashboard_stats_cache" from "service_role";

revoke select on table "public"."dashboard_stats_cache" from "service_role";

revoke trigger on table "public"."dashboard_stats_cache" from "service_role";

revoke truncate on table "public"."dashboard_stats_cache" from "service_role";

revoke update on table "public"."dashboard_stats_cache" from "service_role";

revoke delete on table "public"."dbf_divtable" from "anon";

revoke insert on table "public"."dbf_divtable" from "anon";

revoke references on table "public"."dbf_divtable" from "anon";

revoke trigger on table "public"."dbf_divtable" from "anon";

revoke truncate on table "public"."dbf_divtable" from "anon";

revoke update on table "public"."dbf_divtable" from "anon";

revoke delete on table "public"."dbf_divtable" from "service_role";

revoke insert on table "public"."dbf_divtable" from "service_role";

revoke references on table "public"."dbf_divtable" from "service_role";

revoke select on table "public"."dbf_divtable" from "service_role";

revoke trigger on table "public"."dbf_divtable" from "service_role";

revoke truncate on table "public"."dbf_divtable" from "service_role";

revoke update on table "public"."dbf_divtable" from "service_role";

revoke delete on table "public"."dbf_excluded" from "anon";

revoke insert on table "public"."dbf_excluded" from "anon";

revoke references on table "public"."dbf_excluded" from "anon";

revoke trigger on table "public"."dbf_excluded" from "anon";

revoke truncate on table "public"."dbf_excluded" from "anon";

revoke update on table "public"."dbf_excluded" from "anon";

revoke delete on table "public"."dbf_excluded" from "service_role";

revoke insert on table "public"."dbf_excluded" from "service_role";

revoke references on table "public"."dbf_excluded" from "service_role";

revoke select on table "public"."dbf_excluded" from "service_role";

revoke trigger on table "public"."dbf_excluded" from "service_role";

revoke truncate on table "public"."dbf_excluded" from "service_role";

revoke update on table "public"."dbf_excluded" from "service_role";

revoke delete on table "public"."dbf_included" from "anon";

revoke insert on table "public"."dbf_included" from "anon";

revoke references on table "public"."dbf_included" from "anon";

revoke trigger on table "public"."dbf_included" from "anon";

revoke truncate on table "public"."dbf_included" from "anon";

revoke update on table "public"."dbf_included" from "anon";

revoke delete on table "public"."dbf_included" from "service_role";

revoke insert on table "public"."dbf_included" from "service_role";

revoke references on table "public"."dbf_included" from "service_role";

revoke select on table "public"."dbf_included" from "service_role";

revoke trigger on table "public"."dbf_included" from "service_role";

revoke truncate on table "public"."dbf_included" from "service_role";

revoke update on table "public"."dbf_included" from "service_role";

revoke delete on table "public"."dbf_payrolls" from "anon";

revoke insert on table "public"."dbf_payrolls" from "anon";

revoke references on table "public"."dbf_payrolls" from "anon";

revoke trigger on table "public"."dbf_payrolls" from "anon";

revoke truncate on table "public"."dbf_payrolls" from "anon";

revoke update on table "public"."dbf_payrolls" from "anon";

revoke delete on table "public"."dbf_payrolls" from "service_role";

revoke insert on table "public"."dbf_payrolls" from "service_role";

revoke references on table "public"."dbf_payrolls" from "service_role";

revoke select on table "public"."dbf_payrolls" from "service_role";

revoke trigger on table "public"."dbf_payrolls" from "service_role";

revoke truncate on table "public"."dbf_payrolls" from "service_role";

revoke update on table "public"."dbf_payrolls" from "service_role";

revoke delete on table "public"."dbf_pyent" from "anon";

revoke insert on table "public"."dbf_pyent" from "anon";

revoke references on table "public"."dbf_pyent" from "anon";

revoke trigger on table "public"."dbf_pyent" from "anon";

revoke truncate on table "public"."dbf_pyent" from "anon";

revoke update on table "public"."dbf_pyent" from "anon";

revoke delete on table "public"."dbf_pyent" from "service_role";

revoke insert on table "public"."dbf_pyent" from "service_role";

revoke references on table "public"."dbf_pyent" from "service_role";

revoke select on table "public"."dbf_pyent" from "service_role";

revoke trigger on table "public"."dbf_pyent" from "service_role";

revoke truncate on table "public"."dbf_pyent" from "service_role";

revoke update on table "public"."dbf_pyent" from "service_role";

revoke delete on table "public"."dbf_pyent1" from "anon";

revoke insert on table "public"."dbf_pyent1" from "anon";

revoke references on table "public"."dbf_pyent1" from "anon";

revoke trigger on table "public"."dbf_pyent1" from "anon";

revoke truncate on table "public"."dbf_pyent1" from "anon";

revoke update on table "public"."dbf_pyent1" from "anon";

revoke delete on table "public"."dbf_pyent1" from "service_role";

revoke insert on table "public"."dbf_pyent1" from "service_role";

revoke references on table "public"."dbf_pyent1" from "service_role";

revoke select on table "public"."dbf_pyent1" from "service_role";

revoke trigger on table "public"."dbf_pyent1" from "service_role";

revoke truncate on table "public"."dbf_pyent1" from "service_role";

revoke update on table "public"."dbf_pyent1" from "service_role";

revoke delete on table "public"."dbf_pyent2" from "anon";

revoke insert on table "public"."dbf_pyent2" from "anon";

revoke references on table "public"."dbf_pyent2" from "anon";

revoke trigger on table "public"."dbf_pyent2" from "anon";

revoke truncate on table "public"."dbf_pyent2" from "anon";

revoke update on table "public"."dbf_pyent2" from "anon";

revoke delete on table "public"."dbf_pyent2" from "service_role";

revoke insert on table "public"."dbf_pyent2" from "service_role";

revoke references on table "public"."dbf_pyent2" from "service_role";

revoke select on table "public"."dbf_pyent2" from "service_role";

revoke trigger on table "public"."dbf_pyent2" from "service_role";

revoke truncate on table "public"."dbf_pyent2" from "service_role";

revoke update on table "public"."dbf_pyent2" from "service_role";

revoke delete on table "public"."dbf_restore_history" from "anon";

revoke insert on table "public"."dbf_restore_history" from "anon";

revoke references on table "public"."dbf_restore_history" from "anon";

revoke trigger on table "public"."dbf_restore_history" from "anon";

revoke truncate on table "public"."dbf_restore_history" from "anon";

revoke update on table "public"."dbf_restore_history" from "anon";

revoke delete on table "public"."dbf_restore_history" from "service_role";

revoke insert on table "public"."dbf_restore_history" from "service_role";

revoke references on table "public"."dbf_restore_history" from "service_role";

revoke select on table "public"."dbf_restore_history" from "service_role";

revoke trigger on table "public"."dbf_restore_history" from "service_role";

revoke truncate on table "public"."dbf_restore_history" from "service_role";

revoke update on table "public"."dbf_restore_history" from "service_role";

revoke delete on table "public"."dbf_stntable" from "anon";

revoke insert on table "public"."dbf_stntable" from "anon";

revoke references on table "public"."dbf_stntable" from "anon";

revoke trigger on table "public"."dbf_stntable" from "anon";

revoke truncate on table "public"."dbf_stntable" from "anon";

revoke update on table "public"."dbf_stntable" from "anon";

revoke delete on table "public"."dbf_stntable" from "service_role";

revoke insert on table "public"."dbf_stntable" from "service_role";

revoke references on table "public"."dbf_stntable" from "service_role";

revoke select on table "public"."dbf_stntable" from "service_role";

revoke trigger on table "public"."dbf_stntable" from "service_role";

revoke truncate on table "public"."dbf_stntable" from "service_role";

revoke update on table "public"."dbf_stntable" from "service_role";

revoke delete on table "public"."dbf_sync_sessions" from "anon";

revoke insert on table "public"."dbf_sync_sessions" from "anon";

revoke references on table "public"."dbf_sync_sessions" from "anon";

revoke trigger on table "public"."dbf_sync_sessions" from "anon";

revoke truncate on table "public"."dbf_sync_sessions" from "anon";

revoke update on table "public"."dbf_sync_sessions" from "anon";

revoke delete on table "public"."dbf_sync_sessions" from "service_role";

revoke insert on table "public"."dbf_sync_sessions" from "service_role";

revoke references on table "public"."dbf_sync_sessions" from "service_role";

revoke select on table "public"."dbf_sync_sessions" from "service_role";

revoke trigger on table "public"."dbf_sync_sessions" from "service_role";

revoke truncate on table "public"."dbf_sync_sessions" from "service_role";

revoke update on table "public"."dbf_sync_sessions" from "service_role";

revoke delete on table "public"."deduction_codes" from "anon";

revoke insert on table "public"."deduction_codes" from "anon";

revoke references on table "public"."deduction_codes" from "anon";

revoke trigger on table "public"."deduction_codes" from "anon";

revoke truncate on table "public"."deduction_codes" from "anon";

revoke update on table "public"."deduction_codes" from "anon";

revoke delete on table "public"."deduction_codes" from "service_role";

revoke insert on table "public"."deduction_codes" from "service_role";

revoke references on table "public"."deduction_codes" from "service_role";

revoke select on table "public"."deduction_codes" from "service_role";

revoke trigger on table "public"."deduction_codes" from "service_role";

revoke truncate on table "public"."deduction_codes" from "service_role";

revoke update on table "public"."deduction_codes" from "service_role";

revoke delete on table "public"."deduction_history" from "anon";

revoke insert on table "public"."deduction_history" from "anon";

revoke references on table "public"."deduction_history" from "anon";

revoke trigger on table "public"."deduction_history" from "anon";

revoke truncate on table "public"."deduction_history" from "anon";

revoke update on table "public"."deduction_history" from "anon";

revoke delete on table "public"."deduction_history" from "service_role";

revoke insert on table "public"."deduction_history" from "service_role";

revoke references on table "public"."deduction_history" from "service_role";

revoke select on table "public"."deduction_history" from "service_role";

revoke trigger on table "public"."deduction_history" from "service_role";

revoke truncate on table "public"."deduction_history" from "service_role";

revoke update on table "public"."deduction_history" from "service_role";

revoke delete on table "public"."deductions" from "anon";

revoke insert on table "public"."deductions" from "anon";

revoke references on table "public"."deductions" from "anon";

revoke trigger on table "public"."deductions" from "anon";

revoke truncate on table "public"."deductions" from "anon";

revoke update on table "public"."deductions" from "anon";

revoke delete on table "public"."deductions" from "service_role";

revoke insert on table "public"."deductions" from "service_role";

revoke references on table "public"."deductions" from "service_role";

revoke select on table "public"."deductions" from "service_role";

revoke trigger on table "public"."deductions" from "service_role";

revoke truncate on table "public"."deductions" from "service_role";

revoke update on table "public"."deductions" from "service_role";

revoke delete on table "public"."device_logs" from "anon";

revoke insert on table "public"."device_logs" from "anon";

revoke references on table "public"."device_logs" from "anon";

revoke select on table "public"."device_logs" from "anon";

revoke trigger on table "public"."device_logs" from "anon";

revoke truncate on table "public"."device_logs" from "anon";

revoke update on table "public"."device_logs" from "anon";

revoke delete on table "public"."device_logs" from "authenticated";

revoke insert on table "public"."device_logs" from "authenticated";

revoke references on table "public"."device_logs" from "authenticated";

revoke select on table "public"."device_logs" from "authenticated";

revoke trigger on table "public"."device_logs" from "authenticated";

revoke truncate on table "public"."device_logs" from "authenticated";

revoke update on table "public"."device_logs" from "authenticated";

revoke delete on table "public"."device_logs" from "service_role";

revoke insert on table "public"."device_logs" from "service_role";

revoke references on table "public"."device_logs" from "service_role";

revoke select on table "public"."device_logs" from "service_role";

revoke trigger on table "public"."device_logs" from "service_role";

revoke truncate on table "public"."device_logs" from "service_role";

revoke update on table "public"."device_logs" from "service_role";

revoke delete on table "public"."division_office" from "anon";

revoke insert on table "public"."division_office" from "anon";

revoke references on table "public"."division_office" from "anon";

revoke trigger on table "public"."division_office" from "anon";

revoke truncate on table "public"."division_office" from "anon";

revoke update on table "public"."division_office" from "anon";

revoke delete on table "public"."division_office" from "service_role";

revoke insert on table "public"."division_office" from "service_role";

revoke references on table "public"."division_office" from "service_role";

revoke select on table "public"."division_office" from "service_role";

revoke trigger on table "public"."division_office" from "service_role";

revoke truncate on table "public"."division_office" from "service_role";

revoke update on table "public"."division_office" from "service_role";

revoke delete on table "public"."divisions" from "anon";

revoke insert on table "public"."divisions" from "anon";

revoke references on table "public"."divisions" from "anon";

revoke trigger on table "public"."divisions" from "anon";

revoke truncate on table "public"."divisions" from "anon";

revoke update on table "public"."divisions" from "anon";

revoke delete on table "public"."divisions" from "service_role";

revoke insert on table "public"."divisions" from "service_role";

revoke references on table "public"."divisions" from "service_role";

revoke select on table "public"."divisions" from "service_role";

revoke trigger on table "public"."divisions" from "service_role";

revoke truncate on table "public"."divisions" from "service_role";

revoke update on table "public"."divisions" from "service_role";

revoke delete on table "public"."earnings" from "anon";

revoke insert on table "public"."earnings" from "anon";

revoke references on table "public"."earnings" from "anon";

revoke trigger on table "public"."earnings" from "anon";

revoke truncate on table "public"."earnings" from "anon";

revoke update on table "public"."earnings" from "anon";

revoke delete on table "public"."earnings" from "service_role";

revoke insert on table "public"."earnings" from "service_role";

revoke references on table "public"."earnings" from "service_role";

revoke select on table "public"."earnings" from "service_role";

revoke trigger on table "public"."earnings" from "service_role";

revoke truncate on table "public"."earnings" from "service_role";

revoke update on table "public"."earnings" from "service_role";

revoke delete on table "public"."employees" from "anon";

revoke insert on table "public"."employees" from "anon";

revoke references on table "public"."employees" from "anon";

revoke trigger on table "public"."employees" from "anon";

revoke truncate on table "public"."employees" from "anon";

revoke update on table "public"."employees" from "anon";

revoke delete on table "public"."employees" from "service_role";

revoke insert on table "public"."employees" from "service_role";

revoke references on table "public"."employees" from "service_role";

revoke select on table "public"."employees" from "service_role";

revoke trigger on table "public"."employees" from "service_role";

revoke truncate on table "public"."employees" from "service_role";

revoke update on table "public"."employees" from "service_role";

revoke delete on table "public"."gsis_import_logs" from "anon";

revoke insert on table "public"."gsis_import_logs" from "anon";

revoke references on table "public"."gsis_import_logs" from "anon";

revoke trigger on table "public"."gsis_import_logs" from "anon";

revoke truncate on table "public"."gsis_import_logs" from "anon";

revoke update on table "public"."gsis_import_logs" from "anon";

revoke delete on table "public"."gsis_import_logs" from "service_role";

revoke insert on table "public"."gsis_import_logs" from "service_role";

revoke references on table "public"."gsis_import_logs" from "service_role";

revoke select on table "public"."gsis_import_logs" from "service_role";

revoke trigger on table "public"."gsis_import_logs" from "service_role";

revoke truncate on table "public"."gsis_import_logs" from "service_role";

revoke update on table "public"."gsis_import_logs" from "service_role";

revoke delete on table "public"."initial_payroll_absences" from "anon";

revoke insert on table "public"."initial_payroll_absences" from "anon";

revoke references on table "public"."initial_payroll_absences" from "anon";

revoke trigger on table "public"."initial_payroll_absences" from "anon";

revoke truncate on table "public"."initial_payroll_absences" from "anon";

revoke update on table "public"."initial_payroll_absences" from "anon";

revoke delete on table "public"."initial_payroll_absences" from "service_role";

revoke insert on table "public"."initial_payroll_absences" from "service_role";

revoke references on table "public"."initial_payroll_absences" from "service_role";

revoke select on table "public"."initial_payroll_absences" from "service_role";

revoke trigger on table "public"."initial_payroll_absences" from "service_role";

revoke truncate on table "public"."initial_payroll_absences" from "service_role";

revoke update on table "public"."initial_payroll_absences" from "service_role";

revoke delete on table "public"."initial_payroll_entries" from "anon";

revoke insert on table "public"."initial_payroll_entries" from "anon";

revoke references on table "public"."initial_payroll_entries" from "anon";

revoke trigger on table "public"."initial_payroll_entries" from "anon";

revoke truncate on table "public"."initial_payroll_entries" from "anon";

revoke update on table "public"."initial_payroll_entries" from "anon";

revoke delete on table "public"."initial_payroll_entries" from "service_role";

revoke insert on table "public"."initial_payroll_entries" from "service_role";

revoke references on table "public"."initial_payroll_entries" from "service_role";

revoke select on table "public"."initial_payroll_entries" from "service_role";

revoke trigger on table "public"."initial_payroll_entries" from "service_role";

revoke truncate on table "public"."initial_payroll_entries" from "service_role";

revoke update on table "public"."initial_payroll_entries" from "service_role";

revoke delete on table "public"."initial_payroll_records" from "anon";

revoke insert on table "public"."initial_payroll_records" from "anon";

revoke references on table "public"."initial_payroll_records" from "anon";

revoke trigger on table "public"."initial_payroll_records" from "anon";

revoke truncate on table "public"."initial_payroll_records" from "anon";

revoke update on table "public"."initial_payroll_records" from "anon";

revoke delete on table "public"."initial_payroll_records" from "service_role";

revoke insert on table "public"."initial_payroll_records" from "service_role";

revoke references on table "public"."initial_payroll_records" from "service_role";

revoke select on table "public"."initial_payroll_records" from "service_role";

revoke trigger on table "public"."initial_payroll_records" from "service_role";

revoke truncate on table "public"."initial_payroll_records" from "service_role";

revoke update on table "public"."initial_payroll_records" from "service_role";

revoke delete on table "public"."initial_payroll_transfers" from "anon";

revoke insert on table "public"."initial_payroll_transfers" from "anon";

revoke references on table "public"."initial_payroll_transfers" from "anon";

revoke trigger on table "public"."initial_payroll_transfers" from "anon";

revoke truncate on table "public"."initial_payroll_transfers" from "anon";

revoke update on table "public"."initial_payroll_transfers" from "anon";

revoke delete on table "public"."initial_payroll_transfers" from "service_role";

revoke insert on table "public"."initial_payroll_transfers" from "service_role";

revoke references on table "public"."initial_payroll_transfers" from "service_role";

revoke select on table "public"."initial_payroll_transfers" from "service_role";

revoke trigger on table "public"."initial_payroll_transfers" from "service_role";

revoke truncate on table "public"."initial_payroll_transfers" from "service_role";

revoke update on table "public"."initial_payroll_transfers" from "service_role";

revoke delete on table "public"."ips_absences" from "anon";

revoke insert on table "public"."ips_absences" from "anon";

revoke references on table "public"."ips_absences" from "anon";

revoke trigger on table "public"."ips_absences" from "anon";

revoke truncate on table "public"."ips_absences" from "anon";

revoke update on table "public"."ips_absences" from "anon";

revoke delete on table "public"."ips_absences" from "service_role";

revoke insert on table "public"."ips_absences" from "service_role";

revoke references on table "public"."ips_absences" from "service_role";

revoke select on table "public"."ips_absences" from "service_role";

revoke trigger on table "public"."ips_absences" from "service_role";

revoke truncate on table "public"."ips_absences" from "service_role";

revoke update on table "public"."ips_absences" from "service_role";

revoke delete on table "public"."ips_audit_logs" from "anon";

revoke insert on table "public"."ips_audit_logs" from "anon";

revoke references on table "public"."ips_audit_logs" from "anon";

revoke trigger on table "public"."ips_audit_logs" from "anon";

revoke truncate on table "public"."ips_audit_logs" from "anon";

revoke update on table "public"."ips_audit_logs" from "anon";

revoke delete on table "public"."ips_audit_logs" from "service_role";

revoke insert on table "public"."ips_audit_logs" from "service_role";

revoke references on table "public"."ips_audit_logs" from "service_role";

revoke select on table "public"."ips_audit_logs" from "service_role";

revoke trigger on table "public"."ips_audit_logs" from "service_role";

revoke truncate on table "public"."ips_audit_logs" from "service_role";

revoke update on table "public"."ips_audit_logs" from "service_role";

revoke delete on table "public"."ips_employees" from "anon";

revoke insert on table "public"."ips_employees" from "anon";

revoke references on table "public"."ips_employees" from "anon";

revoke trigger on table "public"."ips_employees" from "anon";

revoke truncate on table "public"."ips_employees" from "anon";

revoke update on table "public"."ips_employees" from "anon";

revoke delete on table "public"."ips_employees" from "service_role";

revoke insert on table "public"."ips_employees" from "service_role";

revoke references on table "public"."ips_employees" from "service_role";

revoke select on table "public"."ips_employees" from "service_role";

revoke trigger on table "public"."ips_employees" from "service_role";

revoke truncate on table "public"."ips_employees" from "service_role";

revoke update on table "public"."ips_employees" from "service_role";

revoke delete on table "public"."ips_payroll_details" from "anon";

revoke insert on table "public"."ips_payroll_details" from "anon";

revoke references on table "public"."ips_payroll_details" from "anon";

revoke trigger on table "public"."ips_payroll_details" from "anon";

revoke truncate on table "public"."ips_payroll_details" from "anon";

revoke update on table "public"."ips_payroll_details" from "anon";

revoke delete on table "public"."ips_payroll_details" from "service_role";

revoke insert on table "public"."ips_payroll_details" from "service_role";

revoke references on table "public"."ips_payroll_details" from "service_role";

revoke select on table "public"."ips_payroll_details" from "service_role";

revoke trigger on table "public"."ips_payroll_details" from "service_role";

revoke truncate on table "public"."ips_payroll_details" from "service_role";

revoke update on table "public"."ips_payroll_details" from "service_role";

revoke delete on table "public"."ips_payroll_periods" from "anon";

revoke insert on table "public"."ips_payroll_periods" from "anon";

revoke references on table "public"."ips_payroll_periods" from "anon";

revoke trigger on table "public"."ips_payroll_periods" from "anon";

revoke truncate on table "public"."ips_payroll_periods" from "anon";

revoke update on table "public"."ips_payroll_periods" from "anon";

revoke delete on table "public"."ips_payroll_periods" from "service_role";

revoke insert on table "public"."ips_payroll_periods" from "service_role";

revoke references on table "public"."ips_payroll_periods" from "service_role";

revoke select on table "public"."ips_payroll_periods" from "service_role";

revoke trigger on table "public"."ips_payroll_periods" from "service_role";

revoke truncate on table "public"."ips_payroll_periods" from "service_role";

revoke update on table "public"."ips_payroll_periods" from "service_role";

revoke delete on table "public"."leave_records" from "anon";

revoke insert on table "public"."leave_records" from "anon";

revoke references on table "public"."leave_records" from "anon";

revoke select on table "public"."leave_records" from "anon";

revoke trigger on table "public"."leave_records" from "anon";

revoke truncate on table "public"."leave_records" from "anon";

revoke update on table "public"."leave_records" from "anon";

revoke delete on table "public"."leave_records" from "authenticated";

revoke insert on table "public"."leave_records" from "authenticated";

revoke references on table "public"."leave_records" from "authenticated";

revoke select on table "public"."leave_records" from "authenticated";

revoke trigger on table "public"."leave_records" from "authenticated";

revoke truncate on table "public"."leave_records" from "authenticated";

revoke update on table "public"."leave_records" from "authenticated";

revoke delete on table "public"."leave_records" from "service_role";

revoke insert on table "public"."leave_records" from "service_role";

revoke references on table "public"."leave_records" from "service_role";

revoke select on table "public"."leave_records" from "service_role";

revoke trigger on table "public"."leave_records" from "service_role";

revoke truncate on table "public"."leave_records" from "service_role";

revoke update on table "public"."leave_records" from "service_role";

revoke delete on table "public"."loan_requests" from "anon";

revoke insert on table "public"."loan_requests" from "anon";

revoke references on table "public"."loan_requests" from "anon";

revoke select on table "public"."loan_requests" from "anon";

revoke trigger on table "public"."loan_requests" from "anon";

revoke truncate on table "public"."loan_requests" from "anon";

revoke update on table "public"."loan_requests" from "anon";

revoke delete on table "public"."loan_requests" from "authenticated";

revoke insert on table "public"."loan_requests" from "authenticated";

revoke references on table "public"."loan_requests" from "authenticated";

revoke select on table "public"."loan_requests" from "authenticated";

revoke trigger on table "public"."loan_requests" from "authenticated";

revoke truncate on table "public"."loan_requests" from "authenticated";

revoke update on table "public"."loan_requests" from "authenticated";

revoke delete on table "public"."loan_requests" from "service_role";

revoke insert on table "public"."loan_requests" from "service_role";

revoke references on table "public"."loan_requests" from "service_role";

revoke select on table "public"."loan_requests" from "service_role";

revoke trigger on table "public"."loan_requests" from "service_role";

revoke truncate on table "public"."loan_requests" from "service_role";

revoke update on table "public"."loan_requests" from "service_role";

revoke delete on table "public"."loan_verifications" from "anon";

revoke insert on table "public"."loan_verifications" from "anon";

revoke references on table "public"."loan_verifications" from "anon";

revoke select on table "public"."loan_verifications" from "anon";

revoke trigger on table "public"."loan_verifications" from "anon";

revoke truncate on table "public"."loan_verifications" from "anon";

revoke update on table "public"."loan_verifications" from "anon";

revoke delete on table "public"."loan_verifications" from "authenticated";

revoke insert on table "public"."loan_verifications" from "authenticated";

revoke references on table "public"."loan_verifications" from "authenticated";

revoke select on table "public"."loan_verifications" from "authenticated";

revoke trigger on table "public"."loan_verifications" from "authenticated";

revoke truncate on table "public"."loan_verifications" from "authenticated";

revoke update on table "public"."loan_verifications" from "authenticated";

revoke delete on table "public"."loan_verifications" from "service_role";

revoke insert on table "public"."loan_verifications" from "service_role";

revoke references on table "public"."loan_verifications" from "service_role";

revoke select on table "public"."loan_verifications" from "service_role";

revoke trigger on table "public"."loan_verifications" from "service_role";

revoke truncate on table "public"."loan_verifications" from "service_role";

revoke update on table "public"."loan_verifications" from "service_role";

revoke delete on table "public"."login_attempts" from "anon";

revoke insert on table "public"."login_attempts" from "anon";

revoke references on table "public"."login_attempts" from "anon";

revoke trigger on table "public"."login_attempts" from "anon";

revoke truncate on table "public"."login_attempts" from "anon";

revoke update on table "public"."login_attempts" from "anon";

revoke delete on table "public"."login_attempts" from "service_role";

revoke insert on table "public"."login_attempts" from "service_role";

revoke references on table "public"."login_attempts" from "service_role";

revoke select on table "public"."login_attempts" from "service_role";

revoke trigger on table "public"."login_attempts" from "service_role";

revoke truncate on table "public"."login_attempts" from "service_role";

revoke update on table "public"."login_attempts" from "service_role";

revoke delete on table "public"."login_logs" from "anon";

revoke insert on table "public"."login_logs" from "anon";

revoke references on table "public"."login_logs" from "anon";

revoke select on table "public"."login_logs" from "anon";

revoke trigger on table "public"."login_logs" from "anon";

revoke truncate on table "public"."login_logs" from "anon";

revoke update on table "public"."login_logs" from "anon";

revoke delete on table "public"."login_logs" from "authenticated";

revoke insert on table "public"."login_logs" from "authenticated";

revoke references on table "public"."login_logs" from "authenticated";

revoke select on table "public"."login_logs" from "authenticated";

revoke trigger on table "public"."login_logs" from "authenticated";

revoke truncate on table "public"."login_logs" from "authenticated";

revoke update on table "public"."login_logs" from "authenticated";

revoke delete on table "public"."login_logs" from "service_role";

revoke insert on table "public"."login_logs" from "service_role";

revoke references on table "public"."login_logs" from "service_role";

revoke select on table "public"."login_logs" from "service_role";

revoke trigger on table "public"."login_logs" from "service_role";

revoke truncate on table "public"."login_logs" from "service_role";

revoke update on table "public"."login_logs" from "service_role";

revoke delete on table "public"."non_plantilla_employees" from "anon";

revoke insert on table "public"."non_plantilla_employees" from "anon";

revoke references on table "public"."non_plantilla_employees" from "anon";

revoke trigger on table "public"."non_plantilla_employees" from "anon";

revoke truncate on table "public"."non_plantilla_employees" from "anon";

revoke update on table "public"."non_plantilla_employees" from "anon";

revoke delete on table "public"."non_plantilla_employees" from "service_role";

revoke insert on table "public"."non_plantilla_employees" from "service_role";

revoke references on table "public"."non_plantilla_employees" from "service_role";

revoke select on table "public"."non_plantilla_employees" from "service_role";

revoke trigger on table "public"."non_plantilla_employees" from "service_role";

revoke truncate on table "public"."non_plantilla_employees" from "service_role";

revoke update on table "public"."non_plantilla_employees" from "service_role";

revoke delete on table "public"."otp_codes" from "anon";

revoke insert on table "public"."otp_codes" from "anon";

revoke references on table "public"."otp_codes" from "anon";

revoke trigger on table "public"."otp_codes" from "anon";

revoke truncate on table "public"."otp_codes" from "anon";

revoke update on table "public"."otp_codes" from "anon";

revoke delete on table "public"."otp_codes" from "service_role";

revoke insert on table "public"."otp_codes" from "service_role";

revoke references on table "public"."otp_codes" from "service_role";

revoke select on table "public"."otp_codes" from "service_role";

revoke trigger on table "public"."otp_codes" from "service_role";

revoke truncate on table "public"."otp_codes" from "service_role";

revoke update on table "public"."otp_codes" from "service_role";

revoke delete on table "public"."password_reset_tokens" from "anon";

revoke insert on table "public"."password_reset_tokens" from "anon";

revoke references on table "public"."password_reset_tokens" from "anon";

revoke trigger on table "public"."password_reset_tokens" from "anon";

revoke truncate on table "public"."password_reset_tokens" from "anon";

revoke update on table "public"."password_reset_tokens" from "anon";

revoke delete on table "public"."password_reset_tokens" from "service_role";

revoke insert on table "public"."password_reset_tokens" from "service_role";

revoke references on table "public"."password_reset_tokens" from "service_role";

revoke select on table "public"."password_reset_tokens" from "service_role";

revoke trigger on table "public"."password_reset_tokens" from "service_role";

revoke truncate on table "public"."password_reset_tokens" from "service_role";

revoke update on table "public"."password_reset_tokens" from "service_role";

revoke delete on table "public"."pay_periods" from "anon";

revoke insert on table "public"."pay_periods" from "anon";

revoke references on table "public"."pay_periods" from "anon";

revoke trigger on table "public"."pay_periods" from "anon";

revoke truncate on table "public"."pay_periods" from "anon";

revoke update on table "public"."pay_periods" from "anon";

revoke delete on table "public"."pay_periods" from "service_role";

revoke insert on table "public"."pay_periods" from "service_role";

revoke references on table "public"."pay_periods" from "service_role";

revoke select on table "public"."pay_periods" from "service_role";

revoke trigger on table "public"."pay_periods" from "service_role";

revoke truncate on table "public"."pay_periods" from "service_role";

revoke update on table "public"."pay_periods" from "service_role";

revoke delete on table "public"."payent" from "anon";

revoke insert on table "public"."payent" from "anon";

revoke references on table "public"."payent" from "anon";

revoke trigger on table "public"."payent" from "anon";

revoke truncate on table "public"."payent" from "anon";

revoke update on table "public"."payent" from "anon";

revoke delete on table "public"."payent" from "service_role";

revoke insert on table "public"."payent" from "service_role";

revoke references on table "public"."payent" from "service_role";

revoke select on table "public"."payent" from "service_role";

revoke trigger on table "public"."payent" from "service_role";

revoke truncate on table "public"."payent" from "service_role";

revoke update on table "public"."payent" from "service_role";

revoke delete on table "public"."payroll_allowances" from "anon";

revoke insert on table "public"."payroll_allowances" from "anon";

revoke references on table "public"."payroll_allowances" from "anon";

revoke select on table "public"."payroll_allowances" from "anon";

revoke trigger on table "public"."payroll_allowances" from "anon";

revoke truncate on table "public"."payroll_allowances" from "anon";

revoke update on table "public"."payroll_allowances" from "anon";

revoke delete on table "public"."payroll_allowances" from "authenticated";

revoke insert on table "public"."payroll_allowances" from "authenticated";

revoke references on table "public"."payroll_allowances" from "authenticated";

revoke select on table "public"."payroll_allowances" from "authenticated";

revoke trigger on table "public"."payroll_allowances" from "authenticated";

revoke truncate on table "public"."payroll_allowances" from "authenticated";

revoke update on table "public"."payroll_allowances" from "authenticated";

revoke delete on table "public"."payroll_allowances" from "service_role";

revoke insert on table "public"."payroll_allowances" from "service_role";

revoke references on table "public"."payroll_allowances" from "service_role";

revoke select on table "public"."payroll_allowances" from "service_role";

revoke trigger on table "public"."payroll_allowances" from "service_role";

revoke truncate on table "public"."payroll_allowances" from "service_role";

revoke update on table "public"."payroll_allowances" from "service_role";

revoke delete on table "public"."payroll_approvals" from "anon";

revoke insert on table "public"."payroll_approvals" from "anon";

revoke references on table "public"."payroll_approvals" from "anon";

revoke select on table "public"."payroll_approvals" from "anon";

revoke trigger on table "public"."payroll_approvals" from "anon";

revoke truncate on table "public"."payroll_approvals" from "anon";

revoke update on table "public"."payroll_approvals" from "anon";

revoke delete on table "public"."payroll_approvals" from "authenticated";

revoke insert on table "public"."payroll_approvals" from "authenticated";

revoke references on table "public"."payroll_approvals" from "authenticated";

revoke select on table "public"."payroll_approvals" from "authenticated";

revoke trigger on table "public"."payroll_approvals" from "authenticated";

revoke truncate on table "public"."payroll_approvals" from "authenticated";

revoke update on table "public"."payroll_approvals" from "authenticated";

revoke delete on table "public"."payroll_approvals" from "service_role";

revoke insert on table "public"."payroll_approvals" from "service_role";

revoke references on table "public"."payroll_approvals" from "service_role";

revoke select on table "public"."payroll_approvals" from "service_role";

revoke trigger on table "public"."payroll_approvals" from "service_role";

revoke truncate on table "public"."payroll_approvals" from "service_role";

revoke update on table "public"."payroll_approvals" from "service_role";

revoke delete on table "public"."payroll_deductions" from "anon";

revoke insert on table "public"."payroll_deductions" from "anon";

revoke references on table "public"."payroll_deductions" from "anon";

revoke trigger on table "public"."payroll_deductions" from "anon";

revoke truncate on table "public"."payroll_deductions" from "anon";

revoke update on table "public"."payroll_deductions" from "anon";

revoke delete on table "public"."payroll_deductions" from "service_role";

revoke insert on table "public"."payroll_deductions" from "service_role";

revoke references on table "public"."payroll_deductions" from "service_role";

revoke select on table "public"."payroll_deductions" from "service_role";

revoke trigger on table "public"."payroll_deductions" from "service_role";

revoke truncate on table "public"."payroll_deductions" from "service_role";

revoke update on table "public"."payroll_deductions" from "service_role";

revoke delete on table "public"."payroll_deductions_new" from "anon";

revoke insert on table "public"."payroll_deductions_new" from "anon";

revoke references on table "public"."payroll_deductions_new" from "anon";

revoke select on table "public"."payroll_deductions_new" from "anon";

revoke trigger on table "public"."payroll_deductions_new" from "anon";

revoke truncate on table "public"."payroll_deductions_new" from "anon";

revoke update on table "public"."payroll_deductions_new" from "anon";

revoke delete on table "public"."payroll_deductions_new" from "authenticated";

revoke insert on table "public"."payroll_deductions_new" from "authenticated";

revoke references on table "public"."payroll_deductions_new" from "authenticated";

revoke select on table "public"."payroll_deductions_new" from "authenticated";

revoke trigger on table "public"."payroll_deductions_new" from "authenticated";

revoke truncate on table "public"."payroll_deductions_new" from "authenticated";

revoke update on table "public"."payroll_deductions_new" from "authenticated";

revoke delete on table "public"."payroll_deductions_new" from "service_role";

revoke insert on table "public"."payroll_deductions_new" from "service_role";

revoke references on table "public"."payroll_deductions_new" from "service_role";

revoke select on table "public"."payroll_deductions_new" from "service_role";

revoke trigger on table "public"."payroll_deductions_new" from "service_role";

revoke truncate on table "public"."payroll_deductions_new" from "service_role";

revoke update on table "public"."payroll_deductions_new" from "service_role";

revoke delete on table "public"."payroll_definitions" from "anon";

revoke insert on table "public"."payroll_definitions" from "anon";

revoke references on table "public"."payroll_definitions" from "anon";

revoke trigger on table "public"."payroll_definitions" from "anon";

revoke truncate on table "public"."payroll_definitions" from "anon";

revoke update on table "public"."payroll_definitions" from "anon";

revoke delete on table "public"."payroll_definitions" from "service_role";

revoke insert on table "public"."payroll_definitions" from "service_role";

revoke references on table "public"."payroll_definitions" from "service_role";

revoke select on table "public"."payroll_definitions" from "service_role";

revoke trigger on table "public"."payroll_definitions" from "service_role";

revoke truncate on table "public"."payroll_definitions" from "service_role";

revoke update on table "public"."payroll_definitions" from "service_role";

revoke delete on table "public"."payroll_details" from "anon";

revoke insert on table "public"."payroll_details" from "anon";

revoke references on table "public"."payroll_details" from "anon";

revoke select on table "public"."payroll_details" from "anon";

revoke trigger on table "public"."payroll_details" from "anon";

revoke truncate on table "public"."payroll_details" from "anon";

revoke update on table "public"."payroll_details" from "anon";

revoke delete on table "public"."payroll_details" from "authenticated";

revoke insert on table "public"."payroll_details" from "authenticated";

revoke references on table "public"."payroll_details" from "authenticated";

revoke select on table "public"."payroll_details" from "authenticated";

revoke trigger on table "public"."payroll_details" from "authenticated";

revoke truncate on table "public"."payroll_details" from "authenticated";

revoke update on table "public"."payroll_details" from "authenticated";

revoke delete on table "public"."payroll_details" from "service_role";

revoke insert on table "public"."payroll_details" from "service_role";

revoke references on table "public"."payroll_details" from "service_role";

revoke select on table "public"."payroll_details" from "service_role";

revoke trigger on table "public"."payroll_details" from "service_role";

revoke truncate on table "public"."payroll_details" from "service_role";

revoke update on table "public"."payroll_details" from "service_role";

revoke delete on table "public"."payroll_entries" from "anon";

revoke insert on table "public"."payroll_entries" from "anon";

revoke references on table "public"."payroll_entries" from "anon";

revoke trigger on table "public"."payroll_entries" from "anon";

revoke truncate on table "public"."payroll_entries" from "anon";

revoke update on table "public"."payroll_entries" from "anon";

revoke delete on table "public"."payroll_entries" from "service_role";

revoke insert on table "public"."payroll_entries" from "service_role";

revoke references on table "public"."payroll_entries" from "service_role";

revoke select on table "public"."payroll_entries" from "service_role";

revoke trigger on table "public"."payroll_entries" from "service_role";

revoke truncate on table "public"."payroll_entries" from "service_role";

revoke update on table "public"."payroll_entries" from "service_role";

revoke delete on table "public"."payroll_entry_deductions" from "anon";

revoke insert on table "public"."payroll_entry_deductions" from "anon";

revoke references on table "public"."payroll_entry_deductions" from "anon";

revoke trigger on table "public"."payroll_entry_deductions" from "anon";

revoke truncate on table "public"."payroll_entry_deductions" from "anon";

revoke update on table "public"."payroll_entry_deductions" from "anon";

revoke delete on table "public"."payroll_entry_deductions" from "service_role";

revoke insert on table "public"."payroll_entry_deductions" from "service_role";

revoke references on table "public"."payroll_entry_deductions" from "service_role";

revoke select on table "public"."payroll_entry_deductions" from "service_role";

revoke trigger on table "public"."payroll_entry_deductions" from "service_role";

revoke truncate on table "public"."payroll_entry_deductions" from "service_role";

revoke update on table "public"."payroll_entry_deductions" from "service_role";

revoke delete on table "public"."payroll_formulas" from "anon";

revoke insert on table "public"."payroll_formulas" from "anon";

revoke references on table "public"."payroll_formulas" from "anon";

revoke trigger on table "public"."payroll_formulas" from "anon";

revoke truncate on table "public"."payroll_formulas" from "anon";

revoke update on table "public"."payroll_formulas" from "anon";

revoke delete on table "public"."payroll_formulas" from "service_role";

revoke insert on table "public"."payroll_formulas" from "service_role";

revoke references on table "public"."payroll_formulas" from "service_role";

revoke select on table "public"."payroll_formulas" from "service_role";

revoke trigger on table "public"."payroll_formulas" from "service_role";

revoke truncate on table "public"."payroll_formulas" from "service_role";

revoke update on table "public"."payroll_formulas" from "service_role";

revoke delete on table "public"."payroll_groups" from "anon";

revoke insert on table "public"."payroll_groups" from "anon";

revoke references on table "public"."payroll_groups" from "anon";

revoke trigger on table "public"."payroll_groups" from "anon";

revoke truncate on table "public"."payroll_groups" from "anon";

revoke update on table "public"."payroll_groups" from "anon";

revoke delete on table "public"."payroll_groups" from "service_role";

revoke insert on table "public"."payroll_groups" from "service_role";

revoke references on table "public"."payroll_groups" from "service_role";

revoke select on table "public"."payroll_groups" from "service_role";

revoke trigger on table "public"."payroll_groups" from "service_role";

revoke truncate on table "public"."payroll_groups" from "service_role";

revoke update on table "public"."payroll_groups" from "service_role";

revoke delete on table "public"."payroll_headers" from "anon";

revoke insert on table "public"."payroll_headers" from "anon";

revoke references on table "public"."payroll_headers" from "anon";

revoke select on table "public"."payroll_headers" from "anon";

revoke trigger on table "public"."payroll_headers" from "anon";

revoke truncate on table "public"."payroll_headers" from "anon";

revoke update on table "public"."payroll_headers" from "anon";

revoke delete on table "public"."payroll_headers" from "authenticated";

revoke insert on table "public"."payroll_headers" from "authenticated";

revoke references on table "public"."payroll_headers" from "authenticated";

revoke select on table "public"."payroll_headers" from "authenticated";

revoke trigger on table "public"."payroll_headers" from "authenticated";

revoke truncate on table "public"."payroll_headers" from "authenticated";

revoke update on table "public"."payroll_headers" from "authenticated";

revoke delete on table "public"."payroll_headers" from "service_role";

revoke insert on table "public"."payroll_headers" from "service_role";

revoke references on table "public"."payroll_headers" from "service_role";

revoke select on table "public"."payroll_headers" from "service_role";

revoke trigger on table "public"."payroll_headers" from "service_role";

revoke truncate on table "public"."payroll_headers" from "service_role";

revoke update on table "public"."payroll_headers" from "service_role";

revoke delete on table "public"."payroll_number_counter" from "anon";

revoke insert on table "public"."payroll_number_counter" from "anon";

revoke references on table "public"."payroll_number_counter" from "anon";

revoke trigger on table "public"."payroll_number_counter" from "anon";

revoke truncate on table "public"."payroll_number_counter" from "anon";

revoke update on table "public"."payroll_number_counter" from "anon";

revoke delete on table "public"."payroll_number_counter" from "service_role";

revoke insert on table "public"."payroll_number_counter" from "service_role";

revoke references on table "public"."payroll_number_counter" from "service_role";

revoke select on table "public"."payroll_number_counter" from "service_role";

revoke trigger on table "public"."payroll_number_counter" from "service_role";

revoke truncate on table "public"."payroll_number_counter" from "service_role";

revoke update on table "public"."payroll_number_counter" from "service_role";

revoke delete on table "public"."payroll_periods" from "anon";

revoke insert on table "public"."payroll_periods" from "anon";

revoke references on table "public"."payroll_periods" from "anon";

revoke select on table "public"."payroll_periods" from "anon";

revoke trigger on table "public"."payroll_periods" from "anon";

revoke truncate on table "public"."payroll_periods" from "anon";

revoke update on table "public"."payroll_periods" from "anon";

revoke delete on table "public"."payroll_periods" from "authenticated";

revoke insert on table "public"."payroll_periods" from "authenticated";

revoke references on table "public"."payroll_periods" from "authenticated";

revoke select on table "public"."payroll_periods" from "authenticated";

revoke trigger on table "public"."payroll_periods" from "authenticated";

revoke truncate on table "public"."payroll_periods" from "authenticated";

revoke update on table "public"."payroll_periods" from "authenticated";

revoke delete on table "public"."payroll_periods" from "service_role";

revoke insert on table "public"."payroll_periods" from "service_role";

revoke references on table "public"."payroll_periods" from "service_role";

revoke select on table "public"."payroll_periods" from "service_role";

revoke trigger on table "public"."payroll_periods" from "service_role";

revoke truncate on table "public"."payroll_periods" from "service_role";

revoke update on table "public"."payroll_periods" from "service_role";

revoke delete on table "public"."payroll_run_summaries" from "anon";

revoke insert on table "public"."payroll_run_summaries" from "anon";

revoke references on table "public"."payroll_run_summaries" from "anon";

revoke trigger on table "public"."payroll_run_summaries" from "anon";

revoke truncate on table "public"."payroll_run_summaries" from "anon";

revoke update on table "public"."payroll_run_summaries" from "anon";

revoke delete on table "public"."payroll_run_summaries" from "service_role";

revoke insert on table "public"."payroll_run_summaries" from "service_role";

revoke references on table "public"."payroll_run_summaries" from "service_role";

revoke select on table "public"."payroll_run_summaries" from "service_role";

revoke trigger on table "public"."payroll_run_summaries" from "service_role";

revoke truncate on table "public"."payroll_run_summaries" from "service_role";

revoke update on table "public"."payroll_run_summaries" from "service_role";

revoke delete on table "public"."payrolls_dbf" from "anon";

revoke insert on table "public"."payrolls_dbf" from "anon";

revoke references on table "public"."payrolls_dbf" from "anon";

revoke trigger on table "public"."payrolls_dbf" from "anon";

revoke truncate on table "public"."payrolls_dbf" from "anon";

revoke update on table "public"."payrolls_dbf" from "anon";

revoke delete on table "public"."payrolls_dbf" from "service_role";

revoke insert on table "public"."payrolls_dbf" from "service_role";

revoke references on table "public"."payrolls_dbf" from "service_role";

revoke select on table "public"."payrolls_dbf" from "service_role";

revoke trigger on table "public"."payrolls_dbf" from "service_role";

revoke truncate on table "public"."payrolls_dbf" from "service_role";

revoke update on table "public"."payrolls_dbf" from "service_role";

revoke delete on table "public"."plantilla_headers" from "anon";

revoke insert on table "public"."plantilla_headers" from "anon";

revoke references on table "public"."plantilla_headers" from "anon";

revoke trigger on table "public"."plantilla_headers" from "anon";

revoke truncate on table "public"."plantilla_headers" from "anon";

revoke update on table "public"."plantilla_headers" from "anon";

revoke delete on table "public"."plantilla_headers" from "service_role";

revoke insert on table "public"."plantilla_headers" from "service_role";

revoke references on table "public"."plantilla_headers" from "service_role";

revoke select on table "public"."plantilla_headers" from "service_role";

revoke trigger on table "public"."plantilla_headers" from "service_role";

revoke truncate on table "public"."plantilla_headers" from "service_role";

revoke update on table "public"."plantilla_headers" from "service_role";

revoke delete on table "public"."plantilla_import_logs" from "anon";

revoke insert on table "public"."plantilla_import_logs" from "anon";

revoke references on table "public"."plantilla_import_logs" from "anon";

revoke trigger on table "public"."plantilla_import_logs" from "anon";

revoke truncate on table "public"."plantilla_import_logs" from "anon";

revoke update on table "public"."plantilla_import_logs" from "anon";

revoke delete on table "public"."plantilla_import_logs" from "service_role";

revoke insert on table "public"."plantilla_import_logs" from "service_role";

revoke references on table "public"."plantilla_import_logs" from "service_role";

revoke select on table "public"."plantilla_import_logs" from "service_role";

revoke trigger on table "public"."plantilla_import_logs" from "service_role";

revoke truncate on table "public"."plantilla_import_logs" from "service_role";

revoke update on table "public"."plantilla_import_logs" from "service_role";

revoke delete on table "public"."plantilla_positions" from "anon";

revoke insert on table "public"."plantilla_positions" from "anon";

revoke references on table "public"."plantilla_positions" from "anon";

revoke trigger on table "public"."plantilla_positions" from "anon";

revoke truncate on table "public"."plantilla_positions" from "anon";

revoke update on table "public"."plantilla_positions" from "anon";

revoke delete on table "public"."plantilla_positions" from "service_role";

revoke insert on table "public"."plantilla_positions" from "service_role";

revoke references on table "public"."plantilla_positions" from "service_role";

revoke select on table "public"."plantilla_positions" from "service_role";

revoke trigger on table "public"."plantilla_positions" from "service_role";

revoke truncate on table "public"."plantilla_positions" from "service_role";

revoke update on table "public"."plantilla_positions" from "service_role";

revoke delete on table "public"."pli_import_logs" from "anon";

revoke insert on table "public"."pli_import_logs" from "anon";

revoke references on table "public"."pli_import_logs" from "anon";

revoke trigger on table "public"."pli_import_logs" from "anon";

revoke truncate on table "public"."pli_import_logs" from "anon";

revoke update on table "public"."pli_import_logs" from "anon";

revoke delete on table "public"."pli_import_logs" from "service_role";

revoke insert on table "public"."pli_import_logs" from "service_role";

revoke references on table "public"."pli_import_logs" from "service_role";

revoke select on table "public"."pli_import_logs" from "service_role";

revoke trigger on table "public"."pli_import_logs" from "service_role";

revoke truncate on table "public"."pli_import_logs" from "service_role";

revoke update on table "public"."pli_import_logs" from "service_role";

revoke delete on table "public"."position_import_logs" from "anon";

revoke insert on table "public"."position_import_logs" from "anon";

revoke references on table "public"."position_import_logs" from "anon";

revoke trigger on table "public"."position_import_logs" from "anon";

revoke truncate on table "public"."position_import_logs" from "anon";

revoke update on table "public"."position_import_logs" from "anon";

revoke delete on table "public"."position_import_logs" from "service_role";

revoke insert on table "public"."position_import_logs" from "service_role";

revoke references on table "public"."position_import_logs" from "service_role";

revoke select on table "public"."position_import_logs" from "service_role";

revoke trigger on table "public"."position_import_logs" from "service_role";

revoke truncate on table "public"."position_import_logs" from "service_role";

revoke update on table "public"."position_import_logs" from "service_role";

revoke delete on table "public"."position_management" from "anon";

revoke insert on table "public"."position_management" from "anon";

revoke references on table "public"."position_management" from "anon";

revoke trigger on table "public"."position_management" from "anon";

revoke truncate on table "public"."position_management" from "anon";

revoke update on table "public"."position_management" from "anon";

revoke delete on table "public"."position_management" from "service_role";

revoke insert on table "public"."position_management" from "service_role";

revoke references on table "public"."position_management" from "service_role";

revoke select on table "public"."position_management" from "service_role";

revoke trigger on table "public"."position_management" from "service_role";

revoke truncate on table "public"."position_management" from "service_role";

revoke update on table "public"."position_management" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."regions" from "anon";

revoke insert on table "public"."regions" from "anon";

revoke references on table "public"."regions" from "anon";

revoke trigger on table "public"."regions" from "anon";

revoke truncate on table "public"."regions" from "anon";

revoke update on table "public"."regions" from "anon";

revoke delete on table "public"."regions" from "service_role";

revoke insert on table "public"."regions" from "service_role";

revoke references on table "public"."regions" from "service_role";

revoke select on table "public"."regions" from "service_role";

revoke trigger on table "public"."regions" from "service_role";

revoke truncate on table "public"."regions" from "service_role";

revoke update on table "public"."regions" from "service_role";

revoke delete on table "public"."role_permissions" from "anon";

revoke insert on table "public"."role_permissions" from "anon";

revoke references on table "public"."role_permissions" from "anon";

revoke trigger on table "public"."role_permissions" from "anon";

revoke truncate on table "public"."role_permissions" from "anon";

revoke update on table "public"."role_permissions" from "anon";

revoke delete on table "public"."role_permissions" from "service_role";

revoke insert on table "public"."role_permissions" from "service_role";

revoke references on table "public"."role_permissions" from "service_role";

revoke select on table "public"."role_permissions" from "service_role";

revoke trigger on table "public"."role_permissions" from "service_role";

revoke truncate on table "public"."role_permissions" from "service_role";

revoke update on table "public"."role_permissions" from "service_role";

revoke delete on table "public"."salary_history" from "anon";

revoke insert on table "public"."salary_history" from "anon";

revoke references on table "public"."salary_history" from "anon";

revoke select on table "public"."salary_history" from "anon";

revoke trigger on table "public"."salary_history" from "anon";

revoke truncate on table "public"."salary_history" from "anon";

revoke update on table "public"."salary_history" from "anon";

revoke delete on table "public"."salary_history" from "authenticated";

revoke insert on table "public"."salary_history" from "authenticated";

revoke references on table "public"."salary_history" from "authenticated";

revoke select on table "public"."salary_history" from "authenticated";

revoke trigger on table "public"."salary_history" from "authenticated";

revoke truncate on table "public"."salary_history" from "authenticated";

revoke update on table "public"."salary_history" from "authenticated";

revoke delete on table "public"."salary_history" from "service_role";

revoke insert on table "public"."salary_history" from "service_role";

revoke references on table "public"."salary_history" from "service_role";

revoke select on table "public"."salary_history" from "service_role";

revoke trigger on table "public"."salary_history" from "service_role";

revoke truncate on table "public"."salary_history" from "service_role";

revoke update on table "public"."salary_history" from "service_role";

revoke delete on table "public"."salary_schedule" from "anon";

revoke insert on table "public"."salary_schedule" from "anon";

revoke references on table "public"."salary_schedule" from "anon";

revoke trigger on table "public"."salary_schedule" from "anon";

revoke truncate on table "public"."salary_schedule" from "anon";

revoke update on table "public"."salary_schedule" from "anon";

revoke delete on table "public"."salary_schedule" from "service_role";

revoke insert on table "public"."salary_schedule" from "service_role";

revoke references on table "public"."salary_schedule" from "service_role";

revoke select on table "public"."salary_schedule" from "service_role";

revoke trigger on table "public"."salary_schedule" from "service_role";

revoke truncate on table "public"."salary_schedule" from "service_role";

revoke update on table "public"."salary_schedule" from "service_role";

revoke delete on table "public"."schools" from "anon";

revoke insert on table "public"."schools" from "anon";

revoke references on table "public"."schools" from "anon";

revoke trigger on table "public"."schools" from "anon";

revoke truncate on table "public"."schools" from "anon";

revoke update on table "public"."schools" from "anon";

revoke delete on table "public"."schools" from "service_role";

revoke insert on table "public"."schools" from "service_role";

revoke references on table "public"."schools" from "service_role";

revoke select on table "public"."schools" from "service_role";

revoke trigger on table "public"."schools" from "service_role";

revoke truncate on table "public"."schools" from "service_role";

revoke update on table "public"."schools" from "service_role";

revoke delete on table "public"."security_events" from "anon";

revoke insert on table "public"."security_events" from "anon";

revoke references on table "public"."security_events" from "anon";

revoke trigger on table "public"."security_events" from "anon";

revoke truncate on table "public"."security_events" from "anon";

revoke update on table "public"."security_events" from "anon";

revoke delete on table "public"."security_events" from "service_role";

revoke insert on table "public"."security_events" from "service_role";

revoke references on table "public"."security_events" from "service_role";

revoke select on table "public"."security_events" from "service_role";

revoke trigger on table "public"."security_events" from "service_role";

revoke truncate on table "public"."security_events" from "service_role";

revoke update on table "public"."security_events" from "service_role";

revoke delete on table "public"."security_settings" from "anon";

revoke insert on table "public"."security_settings" from "anon";

revoke references on table "public"."security_settings" from "anon";

revoke trigger on table "public"."security_settings" from "anon";

revoke truncate on table "public"."security_settings" from "anon";

revoke update on table "public"."security_settings" from "anon";

revoke delete on table "public"."security_settings" from "service_role";

revoke insert on table "public"."security_settings" from "service_role";

revoke references on table "public"."security_settings" from "service_role";

revoke select on table "public"."security_settings" from "service_role";

revoke trigger on table "public"."security_settings" from "service_role";

revoke truncate on table "public"."security_settings" from "service_role";

revoke update on table "public"."security_settings" from "service_role";

revoke delete on table "public"."signatories" from "anon";

revoke insert on table "public"."signatories" from "anon";

revoke references on table "public"."signatories" from "anon";

revoke trigger on table "public"."signatories" from "anon";

revoke truncate on table "public"."signatories" from "anon";

revoke update on table "public"."signatories" from "anon";

revoke delete on table "public"."signatories" from "service_role";

revoke insert on table "public"."signatories" from "service_role";

revoke references on table "public"."signatories" from "service_role";

revoke select on table "public"."signatories" from "service_role";

revoke trigger on table "public"."signatories" from "service_role";

revoke truncate on table "public"."signatories" from "service_role";

revoke update on table "public"."signatories" from "service_role";

revoke delete on table "public"."stacode_audit" from "anon";

revoke insert on table "public"."stacode_audit" from "anon";

revoke references on table "public"."stacode_audit" from "anon";

revoke trigger on table "public"."stacode_audit" from "anon";

revoke truncate on table "public"."stacode_audit" from "anon";

revoke update on table "public"."stacode_audit" from "anon";

revoke delete on table "public"."stacode_audit" from "service_role";

revoke insert on table "public"."stacode_audit" from "service_role";

revoke references on table "public"."stacode_audit" from "service_role";

revoke select on table "public"."stacode_audit" from "service_role";

revoke trigger on table "public"."stacode_audit" from "service_role";

revoke truncate on table "public"."stacode_audit" from "service_role";

revoke update on table "public"."stacode_audit" from "service_role";

revoke delete on table "public"."undeducted_obligations" from "anon";

revoke insert on table "public"."undeducted_obligations" from "anon";

revoke references on table "public"."undeducted_obligations" from "anon";

revoke trigger on table "public"."undeducted_obligations" from "anon";

revoke truncate on table "public"."undeducted_obligations" from "anon";

revoke update on table "public"."undeducted_obligations" from "anon";

revoke delete on table "public"."undeducted_obligations" from "service_role";

revoke insert on table "public"."undeducted_obligations" from "service_role";

revoke references on table "public"."undeducted_obligations" from "service_role";

revoke select on table "public"."undeducted_obligations" from "service_role";

revoke trigger on table "public"."undeducted_obligations" from "service_role";

revoke truncate on table "public"."undeducted_obligations" from "service_role";

revoke update on table "public"."undeducted_obligations" from "service_role";

revoke delete on table "public"."workflow_actions" from "anon";

revoke insert on table "public"."workflow_actions" from "anon";

revoke references on table "public"."workflow_actions" from "anon";

revoke select on table "public"."workflow_actions" from "anon";

revoke trigger on table "public"."workflow_actions" from "anon";

revoke truncate on table "public"."workflow_actions" from "anon";

revoke update on table "public"."workflow_actions" from "anon";

revoke delete on table "public"."workflow_actions" from "authenticated";

revoke insert on table "public"."workflow_actions" from "authenticated";

revoke references on table "public"."workflow_actions" from "authenticated";

revoke select on table "public"."workflow_actions" from "authenticated";

revoke trigger on table "public"."workflow_actions" from "authenticated";

revoke truncate on table "public"."workflow_actions" from "authenticated";

revoke update on table "public"."workflow_actions" from "authenticated";

revoke delete on table "public"."workflow_actions" from "service_role";

revoke insert on table "public"."workflow_actions" from "service_role";

revoke references on table "public"."workflow_actions" from "service_role";

revoke select on table "public"."workflow_actions" from "service_role";

revoke trigger on table "public"."workflow_actions" from "service_role";

revoke truncate on table "public"."workflow_actions" from "service_role";

revoke update on table "public"."workflow_actions" from "service_role";

alter table "public"."attendance_records" drop constraint "attendance_records_employee_id_fkey";

alter table "public"."audit_logs" drop constraint "audit_logs_user_id_fkey";

alter table "public"."dbf_restore_history" drop constraint "dbf_restore_history_user_id_fkey";

alter table "public"."dbf_sync_sessions" drop constraint "dbf_sync_sessions_user_id_fkey";

alter table "public"."leave_records" drop constraint "leave_records_employee_id_fkey";

alter table "public"."loan_requests" drop constraint "loan_requests_employee_id_fkey";

alter table "public"."loan_verifications" drop constraint "loan_verifications_loan_request_id_fkey";

alter table "public"."login_attempts" drop constraint "login_attempts_user_id_fkey";

alter table "public"."payroll_allowances" drop constraint "payroll_allowances_employee_id_fkey";

alter table "public"."payroll_allowances" drop constraint "payroll_allowances_payroll_detail_id_fkey";

alter table "public"."payroll_approvals" drop constraint "payroll_approvals_payroll_period_id_fkey";

alter table "public"."payroll_deductions_new" drop constraint "payroll_deductions_new_employee_id_fkey";

alter table "public"."payroll_deductions_new" drop constraint "payroll_deductions_new_payroll_detail_id_fkey";

alter table "public"."payroll_deductions_new" drop constraint "payroll_deductions_new_payroll_header_id_fkey";

alter table "public"."payroll_details" drop constraint "payroll_details_employee_id_fkey";

alter table "public"."payroll_details" drop constraint "payroll_details_payroll_header_id_fkey";

alter table "public"."payroll_details" drop constraint "payroll_details_payroll_period_id_fkey";

alter table "public"."payroll_headers" drop constraint "payroll_headers_payroll_period_id_fkey";

alter table "public"."payroll_periods" drop constraint "payroll_periods_period_name_key";

alter table "public"."plantilla_positions" drop constraint "plantilla_positions_position_code_key";

alter table "public"."profiles" drop constraint "profiles_approved_by_fkey";

alter table "public"."profiles" drop constraint "profiles_id_fkey";

alter table "public"."salary_history" drop constraint "salary_history_employee_id_fkey";

alter table "public"."workflow_actions" drop constraint "workflow_actions_payroll_period_id_fkey";

drop function if exists "public"."advance_workflow_step"(p_period_id uuid, p_action text, p_remarks text, p_signature_phrase text);

drop function if exists "public"."can_view_employee_row"(p_stacode text, p_empno text);

drop function if exists "public"."get_current_empno"();

drop function if exists "public"."get_current_stacode"();

drop function if exists "public"."get_current_user_divcode"();

drop function if exists "public"."get_workflow_steps"();

drop function if exists "public"."is_workflow_participant"();

drop function if exists "public"."lock_payroll_period"(p_period_id uuid);

drop function if exists "public"."record_login"(p_email text, p_success boolean, p_failure_reason text, p_device_fingerprint text, p_ip_address text, p_user_agent text);

drop function if exists "public"."record_security_event"(p_event_type text, p_severity text, p_description text, p_metadata jsonb);

drop function if exists "public"."set_digital_signature"(p_signature_phrase text);

drop function if exists "public"."validate_nthp_on_insert"();

alter table "public"."attendance_records" drop constraint "attendance_records_pkey";

alter table "public"."device_logs" drop constraint "device_logs_pkey";

alter table "public"."leave_records" drop constraint "leave_records_pkey";

alter table "public"."loan_requests" drop constraint "loan_requests_pkey";

alter table "public"."loan_verifications" drop constraint "loan_verifications_pkey";

alter table "public"."login_logs" drop constraint "login_logs_pkey";

alter table "public"."payroll_allowances" drop constraint "payroll_allowances_pkey";

alter table "public"."payroll_approvals" drop constraint "payroll_approvals_pkey";

alter table "public"."payroll_deductions_new" drop constraint "payroll_deductions_new_pkey";

alter table "public"."payroll_details" drop constraint "payroll_details_pkey";

alter table "public"."payroll_headers" drop constraint "payroll_headers_pkey";

alter table "public"."payroll_periods" drop constraint "payroll_periods_pkey";

alter table "public"."salary_history" drop constraint "salary_history_pkey";

alter table "public"."workflow_actions" drop constraint "workflow_actions_pkey";

drop index if exists "public"."attendance_records_pkey";

drop index if exists "public"."device_logs_pkey";

drop index if exists "public"."idx_ar_employee";

drop index if exists "public"."idx_audit_logs_action";

drop index if exists "public"."idx_audit_logs_user_id";

drop index if exists "public"."idx_dbf_restore_history_user_id";

drop index if exists "public"."idx_deductions_deduction_code";

drop index if exists "public"."idx_deductions_employee_id";

drop index if exists "public"."idx_deductions_pay_period_id";

drop index if exists "public"."idx_dl_user";

drop index if exists "public"."idx_earnings_employee_id";

drop index if exists "public"."idx_earnings_pay_period_id";

drop index if exists "public"."idx_employees_department";

drop index if exists "public"."idx_employees_divcode";

drop index if exists "public"."idx_employees_lname_fname";

drop index if exists "public"."idx_employees_payroll_group_id";

drop index if exists "public"."idx_employees_position";

drop index if exists "public"."idx_employees_regcode";

drop index if exists "public"."idx_employees_stacode";

drop index if exists "public"."idx_ll_created";

drop index if exists "public"."idx_lr_employee";

drop index if exists "public"."idx_lreq_employee";

drop index if exists "public"."idx_pa_period";

drop index if exists "public"."idx_pay_periods_start_date";

drop index if exists "public"."idx_pay_periods_status";

drop index if exists "public"."idx_payroll_deductions_dedcode";

drop index if exists "public"."idx_payroll_deductions_employee_id";

drop index if exists "public"."idx_payroll_deductions_empno";

drop index if exists "public"."idx_payroll_deductions_status";

drop index if exists "public"."idx_payroll_deductions_type";

drop index if exists "public"."idx_payroll_entries_employee_id";

drop index if exists "public"."idx_payroll_entries_nthp_status";

drop index if exists "public"."idx_payroll_entries_pay_period_id";

drop index if exists "public"."idx_payroll_entries_status";

drop index if exists "public"."idx_payroll_groups_status";

drop index if exists "public"."idx_pd_employee";

drop index if exists "public"."idx_pd_header";

drop index if exists "public"."idx_pdn_detail";

drop index if exists "public"."idx_pp_status";

drop index if exists "public"."idx_profiles_division_code";

drop index if exists "public"."idx_profiles_role";

drop index if exists "public"."idx_se_created";

drop index if exists "public"."idx_sh_employee";

drop index if exists "public"."idx_undeducted_obligations_employee_id";

drop index if exists "public"."idx_undeducted_obligations_pay_period_id";

drop index if exists "public"."idx_wa_period";

drop index if exists "public"."leave_records_pkey";

drop index if exists "public"."loan_requests_pkey";

drop index if exists "public"."loan_verifications_pkey";

drop index if exists "public"."login_logs_pkey";

drop index if exists "public"."payroll_allowances_pkey";

drop index if exists "public"."payroll_approvals_pkey";

drop index if exists "public"."payroll_deductions_new_pkey";

drop index if exists "public"."payroll_details_pkey";

drop index if exists "public"."payroll_headers_pkey";

drop index if exists "public"."payroll_periods_period_name_key";

drop index if exists "public"."payroll_periods_pkey";

drop index if exists "public"."plantilla_positions_position_code_key";

drop index if exists "public"."salary_history_pkey";

drop index if exists "public"."workflow_actions_pkey";

drop index if exists "public"."plantilla_positions_pkey";

drop table "public"."attendance_records";

drop table "public"."device_logs";

drop table "public"."leave_records";

drop table "public"."loan_requests";

drop table "public"."loan_verifications";

drop table "public"."login_logs";

drop table "public"."payroll_allowances";

drop table "public"."payroll_approvals";

drop table "public"."payroll_deductions_new";

drop table "public"."payroll_details";

drop table "public"."payroll_headers";

drop table "public"."payroll_periods";

drop table "public"."salary_history";

drop table "public"."workflow_actions";

alter table "public"."dbf_excluded" add column "regcode" text default ''::text;

alter table "public"."dbf_included" add column "regcode" text default ''::text;

alter table "public"."dbf_payrolls" add column "aca" numeric default 0;

alter table "public"."dbf_payrolls" add column "cashallow" numeric default 0;

alter table "public"."dbf_payrolls" add column "clothing" numeric default 0;

alter table "public"."dbf_payrolls" add column "ontop" numeric default 0;

alter table "public"."dbf_payrolls" add column "rata" numeric default 0;

alter table "public"."dbf_payrolls" add column "regcode" text default ''::text;

alter table "public"."plantilla_positions" alter column "category" set default ''::text;

alter table "public"."plantilla_positions" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."plantilla_positions" alter column "id" set data type text using "id"::text;

alter table "public"."plantilla_positions" alter column "item_number" set default ''::text;

alter table "public"."plantilla_positions" alter column "level" set default ''::text;

alter table "public"."plantilla_positions" alter column "monthly_salary" drop not null;

alter table "public"."plantilla_positions" alter column "monthly_salary" set data type numeric using "monthly_salary"::numeric;

alter table "public"."plantilla_positions" alter column "position_code" set default ''::text;

alter table "public"."plantilla_positions" alter column "position_code" drop not null;

alter table "public"."plantilla_positions" alter column "position_title" set default ''::text;

alter table "public"."plantilla_positions" alter column "position_title" drop not null;

alter table "public"."plantilla_positions" alter column "salary_grade" set default 0;

alter table "public"."plantilla_positions" alter column "salary_grade" drop not null;

alter table "public"."plantilla_positions" alter column "stacode" set default ''::text;

alter table "public"."plantilla_positions" alter column "status" drop not null;

alter table "public"."profiles" drop column "digital_signature_hash";

alter table "public"."profiles" drop column "signature_phrase";

alter table "public"."profiles" drop column "signature_set_at";

alter table "public"."security_events" drop column "description";

alter table "public"."security_events" drop column "device_fingerprint";

alter table "public"."security_events" drop column "ip_address";

alter table "public"."security_events" drop column "metadata";

alter table "public"."security_events" drop column "resolved";

alter table "public"."security_events" drop column "resolved_at";

alter table "public"."security_events" drop column "resolved_by";

alter table "public"."security_events" drop column "user_email";

alter table "public"."security_events" drop column "user_id";

alter table "public"."security_events" add column "created_by" uuid;

alter table "public"."security_events" add column "detail" text not null default ''::text;

alter table "public"."security_events" add column "source" text;

alter table "public"."security_events" alter column "created_at" set not null;

alter table "public"."security_events" alter column "severity" set default 'low'::text;

CREATE UNIQUE INDEX plantilla_positions_pkey ON public.plantilla_positions USING btree (id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ai_copilot(p_question text, p_org jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  q text := lower(trim(p_question));
  answer text := '';
  regcode text := p_org->>'regcode';
  divcode text := p_org->>'divcode';
  division_name text := p_org->>'divisionName';
  region_name text := p_org->>'regionName';
  is_scoped boolean := (p_org->>'scoped')::boolean;
  v_count bigint;
  v_total numeric;
  result jsonb;
BEGIN
  -- ΓöÇΓöÇ Greeting ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '^(hi|hello|hey|good (morning|afternoon|evening)|howdy|yo)%' THEN
    answer := 'Hello! I am **SCRIVIA CLOUD Payroll Copilot**. I can help you with:

- **Payroll workflow** ΓÇö running payroll, posting, locking periods
- **Employee masterfile** ΓÇö querying, adding, and managing employees
- **Deductions** ΓÇö GSIS, PhilHealth, Pag-IBIG, BIR Withholding Tax
- **Division scoping** ΓÇö REGCODE/DIVCODE, how data is partitioned
- **Reports** ΓÇö payroll registers, remittance summaries, analytics
- **Modules** ΓÇö Organization, Salary Schedule, Plantilla, Initial Payroll

Ask me anything about SCRIVIA CLOUD!';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ System overview ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(what|which) (modules|features|pages|sections|menus) (are|is) (there|available|in|under)?%' OR
     q SIMILAR TO '%(what|tell me about) (scrivia|this system|the system|the app)%' OR
     q = 'overview' OR q = 'help' OR q = 'what can you do' THEN
    answer := '## SCRIVIA CLOUD Modules

SCRIVIA CLOUD is the **Workforce Intelligence, Payroll, Plantilla, Remittance, Compliance and Analytics** platform for the Philippine education sector.

### Core Modules
| Module | Purpose |
|--------|---------|
| **Dashboard** | Real-time payroll stats, pending approvals, loan summary |
| **Employee Management** | Masterfile of employees with STACODE, division scoping |
| **Payroll** | Monthly payroll processing ΓÇö run, compute, post, lock |
| **Deductions & Loans** | GSIS, PhilHealth, Pag-IBIG, BIR W/Tax, loan deductions |
| **Initial Payroll** | Pre-regular-payroll processing and transfer |
| **Organization** | Regions, Divisions, Schools, Division Office settings |
| **Salary Schedule** | Salary grades, steps, NBC 601 (Third Tranche) |
| **Plantilla Positions** | PSIPOP PDF import, position management |
| **Reports** | Payroll registers, remittance, deduction summaries |
| **Audit & Monitoring** | Login tracking, security events, audit logs |
| **Administration** | Users & Roles, role permissions, MFA, system settings |
| **OmniDev AI** | This copilot ΓÇö ask questions in natural language |

All data is **division-scoped** via REGCODE/DIVCODE so divisions only see their own records.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ REGCODE / DIVCODE scoping ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(regcode|divcode|division.?code|region.?code|scoping|scoped|scope|partition|multi.?division|division.?filter|division.?access)%' OR
     q SIMILAR TO '%(how (does|do) (division|region|scope|scoping|access control|data.?separation))%' OR
     q SIMILAR TO '%explain.*(division|region|scope)' OR
     q LIKE '%how are divisions%' THEN
    answer := '## REGCODE / DIVCODE Scoping Model

SCRIVIA CLOUD uses a **two-level division scoping** system to partition data:

### Architecture
- **REGCODE** ΓÇö Region code (e.g., `IV-A` for CALABARZON)
- **DIVCODE** ΓÇö Division code (e.g., `1801` for Division of Calamba City)
- Every employee, payroll entry, deduction, and audit log carries `(regcode, divcode)` columns

### How it works
1. **Profile assignment**: Each user profile has a `division_id` and `region_id` linking to the Organization module
2. **Automatic stamping**: The `stamp_division_codes()` trigger fires on INSERT/UPDATE and fills `regcode`/`divcode` from the acting user profile
3. **Query scoping**: RPC functions like `query_employees()`, `get_dashboard_summary()`, and `get_payroll_history_by_month()` accept `p_regcode` and `p_divcodes` parameters
4. **Super Admin override**: Users with `role = super_admin` see ALL divisions; others see only their assigned division

### Tables with REGCODE/DIVCODE columns
`employees`, `pay_periods`, `payroll_entries`, `payroll_deductions`, `audit_logs`, `signatories`, `initial_payroll_records`, `non_plantilla_employees`

### Key rule
> A division user can NEVER see another division''s data. The super administrator can filter by division using the sidebar dropdown.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Payroll workflow ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(run|processing|process|computing|compute|execute) (the )?(regular )?payroll%' OR
     q SIMILAR TO '%(payroll )?(workflow|flow|steps|procedure|how to)' OR
     q SIMILAR TO '%(how do i|how to) (run|start|begin|process) (the )?(payroll|monthly payroll|payroll run)' OR
     q LIKE '%monthly payroll workflow%' OR
     q LIKE '%payroll cycle%' THEN
    answer := '## Monthly Payroll Workflow

### Step-by-step process
1. **Generate Pay Periods** ΓÇö Go to Payroll ΓåÆ Pay Periods and click "Generate" for the fiscal year (scoped to your division)
2. **Import Employee Data** ΓÇö Upload DBF files via Smart Import or manually add employees in the Masterfile
3. **Manage Deductions** ΓÇö Go to Deductions & Loans to assign GSIS, PhilHealth, Pag-IBIG, and loan deductions to employees
4. **Run Payroll** ΓÇö Click "Run Payroll" on the Dashboard or Payroll page. The engine computes gross pay, deductions, and net pay for each employee
5. **Review Entries** ΓÇö Check the computed payroll entries for accuracy (gross, deductions, net pay)
6. **Post Payroll** ΓÇö Once verified, post the payroll period. This locks the entries and prevents further edits
7. **Lock Period** ΓÇö After posting, the period status changes to "closed" and cannot be reopened without a reverse operation

### Important rules
- Only **one payroll cycle** can be active at a time per division
- **Posting is final** for the period ΓÇö reverse if corrections are needed
- The payroll engine respects **division scoping** ΓÇö only your division''s employees are processed
- Posted entries trigger **NTHP validation** (Non-Taxable Highest Pay check)

### Quick actions from Dashboard
- **Run Payroll** ΓåÆ Opens the payroll processing workspace
- **Employees** ΓåÆ Opens the Masterfile for data management
- **Reports** ΓåÆ Generate payroll registers and remittance summaries';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Posting / locking ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(post|lock|close|finalize) (the )?(payroll|period|pay period)' OR
     q SIMILAR TO '%(how do i|how to) (post|lock|close)' THEN
    answer := '## Posting & Locking a Pay Period

### Posting
Posting finalizes the payroll entries for a period. After posting:
- Entry status changes to **Posted**
- No further edits are allowed on posted entries
- The `prevent_posted_entry_modification()` trigger enforces this
- Posted entries are included in reports and remittance summaries

### Locking (Closing)
After posting, the period can be locked (status ΓåÆ `closed`):
- A locked period **cannot be reopened** without admin intervention
- The `prevent_closed_period_reopen()` trigger blocks reopen attempts
- Only a super admin can reverse a posted period

### How to post
1. Open **Payroll** ΓåÆ select the pay period
2. Review all entries (verify gross, deductions, net)
3. Click **Post** ΓÇö this is irreversible for the period
4. The period status updates and entries are frozen

### Reversing a posted period
If mistakes are found after posting:
- Go to **Payroll** ΓåÆ select the locked period
- Click **Reverse** (requires super admin privileges)
- The period reopens and entries become editable again
- All changes are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ GSIS / PhilHealth / Pag-IBIG / BIR Tax ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(gsis|philhealth|pag.?ibig|bir|w/?tax|withholding tax|mandatory deduction|contribution)%' OR
     q SIMILAR TO '%(how (are|is)) (gsis|philhealth|pag.?ibig|bir|tax|contribution|deduction)s? (computed|calculated|computed)%' OR
     q LIKE '%computation%' OR q LIKE '%how are deductions%' THEN
    answer := '## Mandatory Deductions Computation

### GSIS (Government Service Insurance System)
- **Contribution**: Based on monthly salary credit (MSC) using the GSIS contribution table
- **Employee share**: ~9% of MSC
- **Employer share**: ~12% of MSC
- **Premium**: Computed on the gross basic salary
- **Loan deductions**: GSIS salary loan, policy loan, emergency loan (if applicable)
- Deduction code: `GSIS` (premium) + `GSISLN` (loan)

### PhilHealth
- **Contribution**: 5% of basic monthly salary (split 50/50 employee-employer)
- Floor: Γé▒10,000 | Ceiling: Γé▒100,000 monthly salary credit
- Employee share: 2.25% of MSC
- Employer share: 2.75% of MSC
- Deduction code: `PHIL`

### Pag-IBIG (HDMF)
- **Employee share**: 2% of monthly salary (capped at Γé▒2,000 for high earners)
- **Employer share**: 2% of monthly salary (capped at Γé▒2,000)
- Members earning Γé▒5,000 and below: mandatory 1% employee share
- Deduction code: `PAGIBIG` (regular) + `HDMF` (MP2 if applicable)

### BIR Withholding Tax
- Computed using the **TRAIN Law** tax table ( graduated rates)
- Taxable income = Gross pay ΓêÆ (GSIS + PhilHealth + Pag-IBIG)
- Applied per pay period based on the employee''s tax status (ME, ME1, ME2, S, S1, etc.)
- Deduction code: `TAX`

### Where to manage
- **Deduction Codes** menu: View/edit deduction codes and rates
- **Payroll ΓåÆ Run Payroll**: Engine auto-computes all deductions
- **Deduction Masterfile**: Assign specific deduction amounts per employee';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Employees / Masterfile ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(employee|masterfile|worker|personnel|staff|teacher)s?%' OR
     q SIMILAR TO '%(how (many|much)|count|list|show|find|search).*(employee|masterfile)' OR
     q LIKE '%employee management%' THEN
    -- Return live data
    SELECT count(*) INTO v_count FROM employees WHERE status = 'Active';
    answer := format('## Employee Masterfile

### Current Statistics
- **Active employees**: %s
- **Total employee records**: (query the Masterfile for full count)

### Key fields per employee
| Field | Description |
|-------|-------------|
| `empno` | Unique employee number |
| `stacode` | Station code (school/office identifier) |
| `regcode` / `divcode` | Division scope codes |
| `basic` / `basic_salary` | Monthly basic salary |
| `grade` / `step` | Salary grade and step |
| `status` | Active, Inactive, Resigned, Terminated |

### How to add employees
1. Go to **Employee Management** (Masterfile)
2. Click **+ Add Employee** or use **Smart Import** (DBF upload)
3. Fill in required fields: Empno, Last Name, First Name, STACODE
4. The employee is automatically stamped with your division codes

### STACODE validation
- STACODE must be numeric and fall within your division''s payroll group ranges
- Elementary: 001ΓÇô499 | Junior HS: 500ΓÇô699 | Senior HS: 700ΓÇô701
- Invalid STACODEs are flagged in the Dashboard''s validation widget', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Deduction codes / masterfile ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(deduction|deduction.?code|deduction.?masterfile|deduction.?list)%' THEN
    SELECT count(*) INTO v_count FROM deduction_codes WHERE active = true;
    answer := format('## Deduction Codes

### Active deduction codes: %s

### Common deduction codes
| Code | Type | Agency | Description |
|------|------|--------|-------------|
| GSIS | Mandatory | GSIS | GSIS premium contribution |
| GSISLN | Loan | GSIS | GSIS salary/policy loan |
| PHIL | Mandatory | PhilHealth | PhilHealth premium |
| PAGIBIG | Mandatory | PAGIBIG | Pag-IBIG regular contribution |
| HDMF | Mandatory | PAGIBIG | Pag-IBIG MP2 / Additional |
| TAX | Mandatory | BIR | Withholding tax |
| LIFE | Loan | INSURANCE | Life insurance |
| COOP | Loan | COOPERATIVE | Cooperative deduction |

### Managing deduction codes
- Go to **Deductions & Loans** ΓåÆ **Deduction Codes**
- You can add, edit, or deactivate deduction codes
- Each code has: `dedcode` (unique), `type` (Mandatory/Loan/Other), `agency`, `active` flag

### Assigning deductions to employees
- Go to **Deductions & Loans** ΓåÆ **Employee Deductions**
- Select employee ΓåÆ add deduction with amount and policy number
- Active deductions are automatically included in payroll runs', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Reports ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(report|analytics|summary|register|export|print)' OR
     q LIKE '%what reports%' OR q LIKE '%report center%' THEN
    answer := '## SCRIVIA Report Center

### Available Reports
| Report | Location | Description |
|--------|----------|-------------|
| **Payroll Register** | Reports ΓåÆ Payroll | Complete payroll breakdown per period |
| **Remittance Summary** | Reports ΓåÆ Remittance | GSIS/PhilHealth/Pag-IBIG/BIR totals |
| **Deduction Summary** | Reports ΓåÆ Deductions | All deductions by code and employee |
| **Employee List** | Reports ΓåÆ Employees | Masterfile export (Excel/PDF) |
| **NTHP Compliance** | Reports ΓåÆ Compliance | Non-Taxable Highest Pay validation |
| **Pay Slip** | Reports ΓåÆ Pay Slips | Individual employee pay slips |
| **Audit Trail** | Audit & Monitoring | System activity log |

### How to generate
1. Go to **SCRIVIA Report Center** in the sidebar
2. Select the report type
3. Choose the pay period and scope (division filter)
4. Click **Generate** ΓÇö download as PDF or Excel

### Export options
- **PDF**: For official documents and printing
- **Excel**: For data analysis and further processing
- **DBF**: For legacy system compatibility

All reports respect **division scoping** ΓÇö only your division''s data is included.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Regions & Divisions (Organization) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(region|division|organization|org chart|organizational)' OR
     q LIKE '%regions and divisions%' THEN
    answer := '## Organization Module

### Structure
```
Region (REGCODE)
  ΓööΓöÇΓöÇ Division (DIVCODE)
        ΓööΓöÇΓöÇ Schools / Offices (STACODE)
```

### Regions
- Each region has a unique `region_code` (e.g., `IV-A`)
- Regions group divisions geographically
- Managed under **Organization ΓåÆ Regions & Divisions**

### Divisions
- Each division belongs to a region and has a unique `division_code` (e.g., `1801`)
- Divisions are the primary scoping unit for all data
- Each user profile is assigned to a division

### Schools / Organization Directory
- Schools are linked to divisions via `division_id`
- Each school has a `school_code` (STACODE) and `school_name`
- Used for employee assignment and STACODE validation

### Division Office Settings
- Configure the division office details (name, address, TIN, signatories)
- Used in payroll reports and remittance summaries
- Upload division logo for official documents';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Salary Schedule ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(salary|salary.?schedule|salary.?grade|step|nbc|tranche|compensation)' THEN
    answer := '## Salary Schedule

### Overview
SCRIVIA CLOUD uses the **NBC 601 Third Tranche** salary standardization table effective **January 1, 2026**.

### Structure
| Grade | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 |
|-------|--------|--------|--------|--------|--------|--------|--------|--------|
| 1 | Γé▒13,000 | ... | ... | ... | ... | ... | ... | ... |
| 11 | Γé▒30,028 | ... | ... | ... | ... | ... | ... | ... |
| 33 | Γé▒103,592 | ... | ... | ... | ... | ... | ... | ... |

- **33 salary grades** with **8 steps** each = 258 total entries
- **Third Tranche** is the final step of the SSL (Salary Standardization Law)

### How it connects to payroll
- Each employee has a `grade` and `step`
- The payroll engine looks up the corresponding salary from the schedule
- Monthly basic salary = the grade-step value from the schedule

### Managing
- Go to **Organization ΓåÆ Salary Schedule**
- View/edit salary grades and steps
- Import from Excel if needed';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Post a pay period ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(posting|posted|post payroll|post the)' THEN
    answer := '## Posting Payroll Entries

### What happens when you post
1. All draft payroll entries for the period are marked as **Posted**
2. The `prevent_posted_entry_modification()` trigger prevents any UPDATE/DELETE on posted entries
3. The pay period status is updated to reflect the posting
4. Posted entries appear in reports and remittance summaries

### Can I undo a posting?
- Yes, but only via **Reverse Payroll Period** (requires super admin)
- Reversing changes all posted entries back to draft status
- The reversal is logged in the audit trail

### Safety checks
- NTHP (Non-Taxable Highest Pay) validation runs before posting
- Entries with validation errors are flagged and must be resolved first
- Only entries in "draft" status can be posted';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ DBF import ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(dbf|psi pop|psipop|smart import|import|upload|file import)' THEN
    answer := '## DBF Import & Smart Import

### Smart Import (DBF Files)
SCRIVIA CLOUD can import data from legacy DepEd DBF files:

| DBF File | Table | Purpose |
|----------|-------|---------|
| MASTERFILE.DBF | `employees` | Employee records |
| PYENT.DBF | `dbf_pyent` | Payroll entries |
| PAYROLLS.DBF | `payrolls_dbf` | Payroll master |
| DIVTABLE.DBF | `dbf_divtable` | Division table |
| STNTABLE.DBF | `dbf_stntable` | Station table |
| EXCLUDED.DBF | `dbf_excluded` | Excluded employees |
| INCLUDED.DBF | `dbf_included` | Included employees |

### How to import
1. Go to **Employee Management** ΓåÆ **Smart Import**
2. Select the DBF file
3. Preview the records
4. Click **Import** ΓÇö new employees are added, existing ones are updated

### PSIPOP PDF Import
- For plantilla positions from the PSIPOP PDF
- Go to **Plantilla Positions** ΓåÆ **Import PDF**
- The system extracts position data using OCR (Tesseract.js)

### Validation
- STACODE validation runs during import
- Invalid STACODEs are flagged for review
- Duplicate employee numbers are handled gracefully';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Current division stats (live data) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(dashboard|stats|statistics|summary|how (many|much) (employee|record|data))%' OR
     q LIKE '%current status%' OR q LIKE '%what is the current%' THEN
    SELECT count(*) INTO v_count FROM employees;
    SELECT COALESCE(sum(net_pay), 0) INTO v_total FROM payroll_entries WHERE status = 'Posted';
    answer := format('## Current System Status

### Database Summary
| Metric | Value |
|--------|-------|
| Total employees | %s |
| Active employees | (check Dashboard) |
| Posted payroll total | Γé▒%s |
| Pay periods | (check Payroll ΓåÆ Periods) |
| Deduction codes | (check Deduction Codes) |

### Quick health check
- Salary schedule: 258 entries (33 grades ├ù 8 steps)
- Payroll groups: 3 configured (Elementary 001ΓÇô499, Junior HS 500ΓÇô699, Senior HS 700ΓÇô701)
- Division scoping: %s

%s', v_count, to_char(v_total, 'FM999,999,999.00'),
  CASE WHEN is_scoped THEN format('Active ΓÇö scoped to %s (%s)', COALESCE(division_name, region_name), COALESCE(divcode, regcode))
       ELSE 'Super Admin ΓÇö full system access' END,
  CASE WHEN is_scoped THEN format('> Your division scope: **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, 'N/A'), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE '> You have full access to all divisions.' END);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Users & Roles ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  IF q SIMILAR TO '%(user|role|permission|access|admin|super.?admin|approval|sign.?up|register)' OR
     q LIKE '%user management%' THEN
    answer := '## Users & Roles

### Available Roles
| Role | Access Level |
|------|-------------|
| `super_admin` | Full system access, all divisions |
| `payroll_admin` | Payroll management, reports |
| `payroll_processor` | Run payroll, compute entries |
| `hr_administrator` | Employee management |
| `school_coordinator` | School-level operations |
| `school_head` | School-level read/approve |
| `accounting_officer` | Financial reports |
| `division_finance` | Division financial ops |
| `auditor` | Read-only audit access |
| `read_only` | Basic read access |

### User approval workflow
1. New users register via the Sign Up page
2. Account starts as `pending_approval`
3. Admin approves via **Administration ΓåÆ Users & Roles**
4. Approved users get their assigned role

### MFA (Multi-Factor Authentication)
- Can be enabled per user
- Uses TOTP (Time-based One-Time Password)
- Admin can force MFA for all users

### Security
- Failed login attempts are tracked
- Account locks after 5 failed attempts (30-minute cooldown)
- Session timeout: 15 minutes of inactivity
- All actions are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ΓöÇΓöÇ Default / fallback ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  answer := format('I can help you with SCRIVIA CLOUD! Here are some things you can ask:

### Quick examples
- *"How do I run payroll?"* ΓÇö Step-by-step payroll workflow
- *"How are GSIS deductions computed?"* ΓÇö Mandatory deduction formulas
- *"Explain REGCODE/DIVCODE scoping"* ΓÇö Division data partitioning
- *"What modules are in the system?"* ΓÇö Full module overview
- *"How do I post a pay period?"* ΓÇö Posting and locking workflow
- *"How many employees are there?"* ΓÇö Live system stats
- *"What reports are available?"* ΓÇö Report Center guide

### Your current scope
%s

> **Tip**: Be specific in your question for the best answer. For example, instead of "payroll", try "How do I run the monthly payroll for my division?"

> **Note**: This copilot has deep knowledge of SCRIVIA CLOUD''s modules, workflows, and data model. It can query live data when asked about counts, statuses, and summaries.',
  CASE WHEN is_scoped THEN format('Scoped to **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, region_name), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE 'You are logged in as **Super Admin** with access to all divisions.' END);

  RETURN jsonb_build_object('reply', answer);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_excluded_undeducted(p_pay_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period record;
  v_employee_ids uuid[];
  v_caller_role text;
  r_ex record;
  r_ded record;
  v_eid uuid;
  v_eeid uuid;
  v_unded_count int := 0;
  v_exc_deds jsonb;
  v_ded_item jsonb;
  v_has_ded_level boolean;
BEGIN
  SELECT lower(btrim(role)) INTO v_caller_role
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'payroll_officer', 'hr_administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN RAISE EXCEPTION 'Pay period not found'; END IF;

  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees;
  ELSE
    SELECT array_agg(e.id) INTO v_employee_ids
    FROM employees e
    JOIN profiles p ON p.id = auth.uid()
    LEFT JOIN divisions d ON d.id = p.division_id
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE (e.division_id = p.division_id
      OR (r.region_code IS NOT NULL AND d.division_code IS NOT NULL
          AND e.regcode = r.region_code AND e.divcode = d.division_code));
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees in scope';
  END IF;

  FOR r_ex IN
    SELECT ex.empno, ex.stacode, ex.reason
    FROM dbf_excluded ex
    WHERE btrim(COALESCE(ex.payperiod, '')) = btrim(v_period.period_name)
    ORDER BY ex.empno
  LOOP
    SELECT e.id INTO v_eid FROM employees e
    WHERE btrim(COALESCE(e.empno, e.employee_number, '')) = r_ex.empno
      AND e.id = ANY(v_employee_ids) LIMIT 1;
    IF v_eid IS NULL THEN CONTINUE; END IF;

    SELECT pe.id INTO v_eeid FROM payroll_entries pe
    WHERE pe.employee_id = v_eid AND pe.pay_period_id = p_pay_period_id LIMIT 1;

    -- Parse JSON reason to get deduction-level data
    v_has_ded_level := false;
    v_exc_deds := '[]'::jsonb;
    BEGIN
      v_exc_deds := (r_ex.reason)::jsonb->'deds';
      IF v_exc_deds IS NOT NULL AND jsonb_array_length(v_exc_deds) > 0 THEN
        v_has_ded_level := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_has_ded_level := false;
    END;

    IF v_has_ded_level THEN
      -- Deduction-level: only mark matching deductions
      FOR v_ded_item IN SELECT * FROM jsonb_array_elements(v_exc_deds)
      LOOP
        DECLARE
          v_dedcode text := v_ded_item->>'dedcode';
          v_dedamt numeric := (v_ded_item->>'dedamt')::numeric;
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM payroll_deductions pd
            WHERE pd.employee_id = v_eid AND pd.dedcode = v_dedcode
              AND round(COALESCE(pd.dedamt, 0), 2) = round(v_dedamt, 2)
              AND upper(COALESCE(pd.status, '')) NOT IN ('TERMINATED', 'T')
          ) THEN CONTINUE; END IF;

          IF EXISTS (
            SELECT 1 FROM undeducted_obligations uo
            WHERE uo.employee_id = v_eid AND uo.pay_period_id = p_pay_period_id
              AND uo.deduction_code = v_dedcode AND round(uo.scheduled_amount, 2) = round(v_dedamt, 2)
          ) THEN CONTINUE; END IF;

          INSERT INTO undeducted_obligations (
            payroll_entry_id, employee_id, pay_period_id,
            deduction_code, deduction_description,
            undeducted_amount, scheduled_amount, station_code, reason
          ) VALUES (
            v_eeid, v_eid, p_pay_period_id,
            v_dedcode, v_dedcode,
            v_dedamt, v_dedamt,
            r_ex.stacode, 'EXCLUDED - Undeducted Obligation'
          );
          v_unded_count := v_unded_count + 1;
        END;
      END LOOP;
    ELSE
      -- Employee-level: mark ALL active non-mandatory deductions
      FOR r_ded IN
        SELECT d.dedcode, round(COALESCE(d.dedamt, 0), 2) AS dedamt,
               COALESCE(c.dedname, d.dedcode) AS dedname
        FROM payroll_deductions d
        LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
        WHERE d.employee_id = v_eid
          AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
          AND NOT _pd_mandatory(c.agency, c.type)
          AND NOT _pd_mandatory_loan(c.agency, c.type)
      LOOP
        IF r_ded.dedamt <= 0 THEN CONTINUE; END IF;
        IF EXISTS (
          SELECT 1 FROM undeducted_obligations uo
          WHERE uo.employee_id = v_eid AND uo.pay_period_id = p_pay_period_id
            AND uo.deduction_code = r_ded.dedcode AND round(uo.scheduled_amount, 2) = r_ded.dedamt
        ) THEN CONTINUE; END IF;

        INSERT INTO undeducted_obligations (
          payroll_entry_id, employee_id, pay_period_id,
          deduction_code, deduction_description,
          undeducted_amount, scheduled_amount, station_code, reason
        ) VALUES (
          v_eeid, v_eid, p_pay_period_id,
          r_ded.dedcode, r_ded.dedname,
          r_ded.dedamt, r_ded.dedamt,
          r_ex.stacode, 'EXCLUDED - Undeducted Obligation'
        );
        v_unded_count := v_unded_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'excluded_synced', v_unded_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public._pd_compute(p_available numeric, p_sorted jsonb, p_mandatory_loans numeric, p_station text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_after numeric;          -- available balance after mandatory loans
  v_capacity numeric;
  v_remaining numeric;
  v_actual numeric := 0;
  v_net numeric;
  v_status text;
  v_elem jsonb;
  v_amount numeric;
  v_unded jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;   -- deducted loans in processing order (FIFO)
  v_last jsonb;
  v_desc text;
BEGIN
  v_after := round(p_available - COALESCE(p_mandatory_loans, 0), 2);
  v_capacity := round(v_after - 5000, 2);

  -- capacity <= 0 ΓåÆ ALL non-mandatory deductions become undeducted
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
      'undeducted', v_unded
    );
  END IF;

  -- Step 5 ΓÇö process by priority/FIFO
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

  -- Step 7 ΓÇö NTHP reversal: while net < 5000, move the LAST deducted loan
  -- (lowest priority, latest in line) into undeducted.
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
    'undeducted', v_unded
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public._pd_mandatory(p_agency text, p_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._pd_mandatory_loan(p_agency text, p_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._pd_priority(p_agency text, p_type text, p_dedcode text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
    WHEN upper(COALESCE(p_dedcode, '')) = '0068' THEN 7
    WHEN upper(COALESCE(p_dedcode, '')) = '0216' THEN 8
    WHEN upper(COALESCE(p_dedcode, '')) = '0136' THEN 9
    WHEN upper(COALESCE(p_type, '')) IN ('C', 'COOPERATIVE') THEN 10
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%MBA%' THEN 11
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%PROVIDENT%'
      OR upper(COALESCE(p_dedcode, '')) LIKE '%PF%'
      OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 12
    WHEN upper(COALESCE(p_type, '')) = 'INSURANCE' THEN 13
    WHEN upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 14
    ELSE 15
  END;
$function$
;

CREATE OR REPLACE FUNCTION public._trig_refresh_dashboard_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM refresh_dashboard_cache();
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_user(p_target_user uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.assign_schools_to_division(p_division_id uuid, p_school_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now() OR used = true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_schools_from_division(p_division_id uuid, p_school_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_division(p_division_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_region(p_region_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_role_permission(p_role text, p_permission text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.disable_user(p_target_user uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.enable_user(p_target_user uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_posted_entry_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only enforce NTHP floor for NEW manual entries (not bulk imports via sync)
  -- Imported data may have varied net pay depending on the legacy system
  IF NEW.status = 'Posted' AND NEW.net_pay < 5000 THEN
    -- Soft warning: log but don't block
    RAISE NOTICE 'NTHP note: entry has net pay below 5000 (%). Allowing for imported data.', NEW.net_pay;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_non_plantilla_before_upsert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_user_empno()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_user_stacode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(category text DEFAULT NULL::text, p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      -- everyone else: clamped to their own division (if assigned) ΓÇö by id OR
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
-- One pass over payroll_entries for all entry-based KPIs. Using
-- employee_id = ANY(<scoped ids>) instead of a JOIN forces the planner
-- to scan payroll_entries ONCE (index-accelerated) rather than once per
-- scoped employee.
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
-- The division's own current period: same scope rules as scoped_emps,
-- applied to pay_periods via REGCODE/DIVCODE (plus legacy uncoded
-- periods for callers with no assigned division).
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_dbf_table_counts_by_category()
 RETURNS TABLE(table_name text, total bigint, elementary bigint, highschool bigint)
 LANGUAGE sql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_deduction_engine_stats()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_deduction_engine_stats(p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_deductions_summary(p_period_id uuid, p_emp_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_payroll_group_counts()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT payroll_group_id AS group_id, COUNT(*) AS count
    FROM employees
    WHERE status = 'Active' AND payroll_group_id IS NOT NULL
    GROUP BY payroll_group_id
  ) row;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payroll_history_by_month(p_year integer, p_regcode text DEFAULT NULL::text, p_divcode text DEFAULT NULL::text)
 RETURNS TABLE(period_id uuid, month integer, year integer, period_name text, status text, pay_date date, employee_count bigint, total_gross numeric, total_deductions numeric, total_net numeric, total_undeducted numeric, nthp_pass_count bigint, nthp_fail_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
-- Employees in scope: super_admin follows the requested REGCODE/DIVCODE
-- (global when null); everyone else is clamped to their own division (by
-- id, by legacy codes, or all when no division is assigned).
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_payroll_register_totals(p_period_id uuid DEFAULT NULL::uuid, p_emp_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_role_permissions()
 RETURNS SETOF public.role_permissions
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.role_permissions;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_uuid;
  RETURN COALESCE(user_role, 'viewer');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.hash_otp(otp_code text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN crypt(otp_code, gen_salt('bf'));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_data_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin', 'payroll_admin', 'payroll_processor',
  'accounting_officer', 'hr_administrator',
  'division_finance', 'auditor', 'read_only'
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_data_writer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT get_current_user_role() IN (
  'super_admin',
  'payroll_admin',
  'payroll_processor',
  'payroll_officer',
  'hr_administrator'
);
$function$
;

CREATE OR REPLACE FUNCTION public.issue_mfa_code(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_table_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.post_payroll(p_pay_period_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_closed_period_reopen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_posted_entry_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.query_dedfile(p_search text DEFAULT NULL::text, p_stacode text DEFAULT NULL::text, p_dedcode text DEFAULT NULL::text, p_empno text DEFAULT NULL::text, p_period text DEFAULT NULL::text, p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_sort_key text DEFAULT 'empno'::text, p_sort_dir text DEFAULT 'asc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_count_only boolean DEFAULT false, p_division_ids uuid[] DEFAULT NULL::uuid[], p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  -- division's deduction rows ΓÇö by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
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
$function$
;

CREATE OR REPLACE FUNCTION public.query_employees(p_search text DEFAULT NULL::text, p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_group_id uuid DEFAULT NULL::uuid, p_stacode text DEFAULT NULL::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10, p_count_only boolean DEFAULT false, p_scope_column text DEFAULT NULL::text, p_scope_value text DEFAULT NULL::text, p_division_id uuid DEFAULT NULL::uuid, p_division_ids uuid[] DEFAULT NULL::uuid[], p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  -- their own division ΓÇö by id OR by the division's REGCODE/DIVCODE so
  -- imported legacy rows without a stamped division_id stay visible.
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
    v_where := v_where || format(
      ' AND (division_id = %L OR (regcode = (get_current_user_division_codes())[1] AND divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
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
$function$
;

CREATE OR REPLACE FUNCTION public.query_payroll_deductions(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_type_filter text DEFAULT NULL::text, p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[], p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10, p_count_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  -- division's deduction rows ΓÇö by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_successful_login()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = now()
  WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_dashboard_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.reject_user(p_target_user uuid, p_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_payroll(p_pay_period_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
      RAISE EXCEPTION 'Pay period is not posted ΓÇö nothing to reverse';
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
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_payroll_period(p_pay_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.run_payroll_engine(p_pay_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_payyy int;
  v_paymm int;
  v_unassigned int := 0;
  v_inserted int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_unded_total numeric := 0;
  r_emp record;
  v_basic numeric; v_pera numeric; v_long numeric;
  v_gross numeric; v_dedlnr numeric; v_dedmed numeric; v_dedpag numeric; v_dedtax numeric;
  v_govtlnr numeric; v_govtecc numeric; v_govtmed numeric; v_govtpag numeric;
  v_taxable numeric; v_mandatory numeric; v_available numeric;
  v_deds jsonb;
  v_sorted jsonb;
  v_mandatory_loans numeric;
  v_nthp jsonb;
  v_entry_id uuid;
  v_actual_total numeric;
  v_unded_amount numeric;
  v_is_excluded boolean;
  -- Bulk accumulators
  v_entry_ids uuid[];
  v_emp_ids uuid[];
  v_gross_arr numeric[];
  v_total_ded_arr numeric[];
  v_net_pay_arr numeric[];
  v_dedlnr_arr numeric[];
  v_dedmed_arr numeric[];
  v_dedpag_arr numeric[];
  v_dedtax_arr numeric[];
  v_govtlnr_arr numeric[];
  v_govtecc_arr numeric[];
  v_govtmed_arr numeric[];
  v_govtpag_arr numeric[];
  v_other_ded_arr numeric[];
  v_nthp_status_arr text[];
  v_unded_arr numeric[];
  v_actual_loans_arr numeric[];
  v_avail_arr numeric[];
  v_mandatory_arr numeric[];
  v_loan_cap_arr numeric[];
  v_deduction_rows jsonb;
  v_unded_rows jsonb;
BEGIN
  SET LOCAL statement_timeout = '10 min';
  SET LOCAL lock_timeout = '10 min';

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

  -- Division scope
  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees;
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
        AND e.regcode = r.region_code AND e.divcode = d.division_code
      )
    );
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees found in your division scope';
  END IF;

  -- Never clear already-posted entries
  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot re-run payroll: posted entries exist. Reverse first.';
  END IF;

  -- Bulk delete old computed data
  DELETE FROM undeducted_obligations
  WHERE payroll_entry_id IN (
    SELECT id FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status <> 'Posted'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id
    AND employee_id = ANY(v_employee_ids)
    AND status <> 'Posted';

  DELETE FROM payroll_entry_deductions
  WHERE payroll_entry_id NOT IN (
    SELECT id FROM payroll_entries WHERE status = 'Posted'
  );

  -- Validate stacode
  SELECT count(*) INTO v_unassigned FROM employees e
  WHERE e.id = ANY(v_employee_ids)
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
    RAISE EXCEPTION 'Cannot run payroll: % employee(s) have invalid STACODE.', v_unassigned;
  END IF;

  v_payyy := v_period.year;
  v_paymm := v_period.month;

  PERFORM set_config('app.skip_audit', 'on', true);

  -- Initialize bulk arrays
  v_entry_ids := '{}';
  v_emp_ids := '{}';
  v_gross_arr := '{}'; v_total_ded_arr := '{}'; v_net_pay_arr := '{}';
  v_dedlnr_arr := '{}'; v_dedmed_arr := '{}'; v_dedpag_arr := '{}'; v_dedtax_arr := '{}';
  v_govtlnr_arr := '{}'; v_govtecc_arr := '{}'; v_govtmed_arr := '{}'; v_govtpag_arr := '{}';
  v_other_ded_arr := '{}'; v_nthp_status_arr := '{}'; v_unded_arr := '{}';
  v_actual_loans_arr := '{}'; v_avail_arr := '{}'; v_mandatory_arr := '{}'; v_loan_cap_arr := '{}';
  v_deduction_rows := '[]'::jsonb;
  v_unded_rows := '[]'::jsonb;

  FOR r_emp IN
    SELECT id, empno, employee_number, basic, pera, long, stacode
    FROM employees
    WHERE id = ANY(v_employee_ids)
      AND upper(COALESCE(status, '')) NOT IN ('INACTIVE', 'RESIGNED', 'TERMINATED')
    ORDER BY empno
  LOOP
    v_basic := round(COALESCE(r_emp.basic, 0), 2);
    v_pera  := round(COALESCE(r_emp.pera, 0), 2);
    v_long  := round(COALESCE(r_emp.long, 0), 2);

    v_dedlnr := round(v_basic * 0.09, 2);
    v_dedmed := round(v_basic * 0.0249998422961678, 2);
    v_dedpag := 200.00;
    v_taxable := round(v_basic - v_dedlnr - v_dedmed - v_dedpag, 2);
    v_dedtax := round(CASE
      WHEN v_taxable <= 20833 THEN 0
      WHEN v_taxable <= 33333 THEN (v_taxable - 20833) * 0.15
      WHEN v_taxable <= 66667 THEN 1875 + (v_taxable - 33333) * 0.20
      WHEN v_taxable <= 166667 THEN 8541.67 + (v_taxable - 66667) * 0.25
      WHEN v_taxable <= 666667 THEN 33541.67 + (v_taxable - 166667) * 0.30
      ELSE 183541.67 + (v_taxable - 666667) * 0.35
    END, 2);
    v_govtlnr := round(v_basic * 0.09, 2);
    v_govtecc := round(v_basic * 0.02, 2);
    v_govtmed := round(v_basic * 0.0249998422961678, 2);
    v_govtpag := 200.00;
    v_gross := round(v_basic + v_pera + v_long, 2);
    v_mandatory := round(v_dedlnr + v_dedmed + v_dedpag + v_dedtax, 2);
    v_available := round(v_gross - v_mandatory, 2);

    -- Check EXCLUDED
    SELECT EXISTS (
      SELECT 1 FROM dbf_excluded ex
      WHERE ex.empno = r_emp.empno
        AND trim(ex.payperiod) = trim(v_period.period_name)
    ) INTO v_is_excluded;

    -- Active deductions
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', round(COALESCE(d.dedamt, 0), 2),
             'effyy', COALESCE(d.effyy, 0),
             'effmm', COALESCE(d.effmm, 0),
             'agency', COALESCE(c.agency, ''),
             'type', COALESCE(c.type, ''),
             'dedname', COALESCE(c.dedname, d.dedcode)
           )), '[]'::jsonb)
    INTO v_deds
    FROM payroll_deductions d
    LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
    WHERE (d.employee_id = r_emp.id OR (d.employee_id IS NULL AND btrim(COALESCE(d.empno, '')) = r_emp.empno AND r_emp.empno <> ''))
      AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
      AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      AND NOT (
        COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
        AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm
      );

    -- Mandatory loans
    SELECT COALESCE(sum(round(COALESCE((x->>'dedamt')::numeric, 0), 2)), 0)
    INTO v_mandatory_loans
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    -- Sort: EXCLUDED employees get priority 99
    SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_sorted
    FROM (
      SELECT jsonb_build_object(
        'dedcode', x.dedcode, 'dedamt', x.dedamt,
        'agency', x.agency, 'type', x.type, 'dedname', x.dedname
      ) AS j
      FROM jsonb_to_recordset(v_deds) AS x(
        dedcode text, dedamt numeric, effyy int, effmm int,
        agency text, type text, dedname text
      )
      WHERE NOT _pd_mandatory(x.agency, x.type)
        AND NOT _pd_mandatory_loan(x.agency, x.type)
      ORDER BY
        CASE WHEN v_is_excluded THEN 99 ELSE _pd_priority(x.agency, x.type, x.dedcode) END,
        CASE WHEN v_is_excluded THEN -((CASE WHEN x.effyy < 100 THEN 2000 + x.effyy ELSE x.effyy END) * 100 + x.effmm) ELSE ((CASE WHEN x.effyy < 100 THEN 2000 + x.effyy ELSE x.effyy END) * 100 + x.effmm) END,
        x.dedcode
    ) s;

    IF true THEN
      v_nthp := public._pd_compute(v_available, v_sorted, v_mandatory_loans, r_emp.stacode);
    END IF;

    v_entry_id := gen_random_uuid();
    v_actual_total := round(
      COALESCE((v_nthp->>'actualLoanDeductions')::numeric, 0)
      + COALESCE((v_nthp->>'mandatoryLoanDeductions')::numeric, 0), 2);
    v_unded_amount := 0;
    SELECT COALESCE(sum(round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2)), 0)
    INTO v_unded_amount
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    v_unded_total := round(v_unded_total + v_unded_amount, 2);

    -- Accumulate into bulk arrays
    v_entry_ids := array_append(v_entry_ids, v_entry_id);
    v_emp_ids := array_append(v_emp_ids, r_emp.id);
    v_gross_arr := array_append(v_gross_arr, v_gross);
    v_total_ded_arr := array_append(v_total_ded_arr, round(v_mandatory + v_actual_total, 2));
    v_net_pay_arr := array_append(v_net_pay_arr, round((v_nthp->>'finalNetPay')::numeric, 2));
    v_dedlnr_arr := array_append(v_dedlnr_arr, v_dedlnr);
    v_dedmed_arr := array_append(v_dedmed_arr, v_dedmed);
    v_dedpag_arr := array_append(v_dedpag_arr, v_dedpag);
    v_dedtax_arr := array_append(v_dedtax_arr, v_dedtax);
    v_govtlnr_arr := array_append(v_govtlnr_arr, v_govtlnr);
    v_govtecc_arr := array_append(v_govtecc_arr, v_govtecc);
    v_govtmed_arr := array_append(v_govtmed_arr, v_govtmed);
    v_govtpag_arr := array_append(v_govtpag_arr, v_govtpag);
    v_other_ded_arr := array_append(v_other_ded_arr, v_actual_total);
    v_nthp_status_arr := array_append(v_nthp_status_arr, (v_nthp->>'nthpStatus')::text);
    v_unded_arr := array_append(v_unded_arr, v_unded_amount);
    v_actual_loans_arr := array_append(v_actual_loans_arr, v_actual_total);
    v_avail_arr := array_append(v_avail_arr, v_available);
    v_mandatory_arr := array_append(v_mandatory_arr, v_mandatory);
    v_loan_cap_arr := array_append(v_loan_cap_arr, (v_nthp->>'loanDeductionCapacity')::numeric);

    -- Accumulate deduction detail rows
    v_deduction_rows := v_deduction_rows || (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'entry_id', v_entry_id,
        'dedcode', x.dedcode,
        'dedname', x.dedname,
        'dedamt', x.dedamt
      )), '[]'::jsonb)
      FROM jsonb_to_recordset(v_deds) AS x(dedcode text, dedamt numeric, dedname text)
    );

    -- Accumulate undeducted rows
    v_unded_rows := v_unded_rows || (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'entry_id', v_entry_id,
        'emp_id', r_emp.id,
        'code', u->>'deduction_code',
        'desc', u->>'deduction_description',
        'sched', round((u->>'scheduled_amount')::numeric, 2),
        'amount', round((u->>'undeducted_amount')::numeric, 2),
        'stacode', r_emp.stacode,
        'reason', COALESCE(u->>'reason', 'NTHP Below Threshold')
      )), '[]'::jsonb)
      FROM jsonb_array_elements(v_nthp->'undeducted') u
      WHERE (u->>'undeducted_amount')::numeric > 0
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  -- BULK INSERT: payroll_entries (single statement for all employees)
  IF v_inserted > 0 THEN
    INSERT INTO payroll_entries (
      id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
      status, processed_at, dedlnr, dedmed, dedpag, dedtax,
      govtlnr, govtecc, govtmed, govtpag,
      other_deductions, nthp_status, undeducted_amount, actual_loan_deductions,
      available_balance, mandatory_deductions, loan_deduction_capacity
    )
    SELECT
      unnest(v_entry_ids), unnest(v_emp_ids), p_pay_period_id,
      unnest(v_gross_arr), unnest(v_total_ded_arr), unnest(v_net_pay_arr),
      'Computed', now(),
      unnest(v_dedlnr_arr), unnest(v_dedmed_arr), unnest(v_dedpag_arr), unnest(v_dedtax_arr),
      unnest(v_govtlnr_arr), unnest(v_govtecc_arr), unnest(v_govtmed_arr), unnest(v_govtpag_arr),
      unnest(v_other_ded_arr),
      unnest(v_nthp_status_arr), unnest(v_unded_arr), unnest(v_actual_loans_arr),
      unnest(v_avail_arr), unnest(v_mandatory_arr), unnest(v_loan_cap_arr)
    ON CONFLICT (employee_id, pay_period_id)
    DO UPDATE SET
      gross_pay = EXCLUDED.gross_pay,
      total_deductions = EXCLUDED.total_deductions,
      net_pay = EXCLUDED.net_pay,
      status = 'Computed', processed_at = now(),
      dedlnr = EXCLUDED.dedlnr, dedmed = EXCLUDED.dedmed,
      dedpag = EXCLUDED.dedpag, dedtax = EXCLUDED.dedtax,
      govtlnr = EXCLUDED.govtlnr, govtecc = EXCLUDED.govtecc,
      govtmed = EXCLUDED.govtmed, govtpag = EXCLUDED.govtpag,
      other_deductions = EXCLUDED.other_deductions,
      nthp_status = EXCLUDED.nthp_status,
      undeducted_amount = EXCLUDED.undeducted_amount,
      actual_loan_deductions = EXCLUDED.actual_loan_deductions,
      available_balance = EXCLUDED.available_balance,
      mandatory_deductions = EXCLUDED.mandatory_deductions,
      loan_deduction_capacity = EXCLUDED.loan_deduction_capacity;

    -- BULK INSERT: payroll_entry_deductions
    INSERT INTO payroll_entry_deductions (payroll_entry_id, dedcode, dedname, dedamt, ded_status)
    SELECT
      (row->>'entry_id')::uuid, row->>'dedcode', row->>'dedname',
      (row->>'dedamt')::numeric, 'Active'
    FROM jsonb_array_elements(v_deduction_rows) row;

    -- BULK INSERT: undeducted_obligations
    INSERT INTO undeducted_obligations (
      payroll_entry_id, employee_id, pay_period_id,
      deduction_code, deduction_description, scheduled_amount, undeducted_amount,
      station_code, reason
    )
    SELECT
      (row->>'entry_id')::uuid, (row->>'emp_id')::uuid, p_pay_period_id,
      row->>'code', row->>'desc',
      (row->>'sched')::numeric, (row->>'amount')::numeric,
      row->>'stacode', row->>'reason'
    FROM jsonb_array_elements(v_unded_rows) row
    WHERE (row->>'amount')::numeric > 0;

    v_unded_written := (SELECT count(*) FROM jsonb_array_elements(v_unded_rows) row
                        WHERE (row->>'amount')::numeric > 0);
  END IF;

  -- Summary
  INSERT INTO payroll_run_summaries (
    pay_period_id, employee_count, total_gross, total_deductions, total_net,
    nthp_pass_count, nthp_fail_count, total_undeducted, processed_at
  ) VALUES (
    p_pay_period_id, v_inserted,
    (SELECT COALESCE(sum(gross_pay), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT COALESCE(sum(total_deductions), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT COALESCE(sum(net_pay), 0) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids)),
    (SELECT count(*) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND nthp_status = 'PASS'),
    (SELECT count(*) FROM payroll_entries WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids) AND nthp_status = 'FAIL'),
    v_unded_total, now()
  )
  ON CONFLICT (pay_period_id) DO UPDATE SET
    employee_count = EXCLUDED.employee_count,
    total_gross = EXCLUDED.total_gross,
    total_deductions = EXCLUDED.total_deductions,
    total_net = EXCLUDED.total_net,
    nthp_pass_count = EXCLUDED.nthp_pass_count,
    nthp_fail_count = EXCLUDED.nthp_fail_count,
    total_undeducted = EXCLUDED.total_undeducted,
    processed_at = EXCLUDED.processed_at;

  PERFORM set_config('app.skip_audit', 'off', true);

  RETURN jsonb_build_object(
    'success', true,
    'employees_processed', v_inserted,
    'total_undeducted', v_unded_total,
    'unducted_written', v_unded_written,
    'deleted', v_deleted
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_assigned_stacode(p_target_user uuid, p_stacode text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_employee_number(p_target_user uuid, p_employee_number text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_division(p_target_user uuid, p_region_id uuid DEFAULT NULL::uuid, p_division_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_mfa(p_target_user uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_role(p_target_user uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.stamp_division_codes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_employees_to_division(p_division_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unlock_user_account(p_target_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_schools_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_division(p_division_id uuid DEFAULT NULL::uuid, p_region_id uuid DEFAULT NULL::uuid, p_region_code text DEFAULT NULL::text, p_division_code text DEFAULT NULL::text, p_division_name text DEFAULT NULL::text, p_features jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- ΓöÇΓöÇ Resolve the region ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  -- 1. By id (fast path ΓÇö the app normally holds the real id).
  IF p_region_id IS NOT NULL AND EXISTS (SELECT 1 FROM regions WHERE id = p_region_id) THEN
    v_region_id := p_region_id;
    SELECT region_code INTO v_region_code FROM regions WHERE id = v_region_id;
  ELSE
    -- 2. By code (heals id drift ΓÇö e.g. migrations re-created the table and
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

  -- ΓöÇΓöÇ Insert / update the division under the resolved region ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_region(p_region_id uuid DEFAULT NULL::uuid, p_region_code text DEFAULT NULL::text, p_region_name text DEFAULT NULL::text, p_sort_order integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_role_permission(p_role text, p_permission text, p_granted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.validate_employee_for_approval(p_employee_number text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.verify_mfa_code(p_email text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
$function$
;

CREATE OR REPLACE FUNCTION public.verify_otp(otp_code text, stored_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$function$
;

grant insert on table "public"."profiles" to "authenticator";

grant select on table "public"."profiles" to "authenticator";

grant update on table "public"."profiles" to "authenticator";

grant insert on table "public"."profiles" to "supabase_auth_admin";

grant select on table "public"."profiles" to "supabase_auth_admin";

grant update on table "public"."profiles" to "supabase_auth_admin";


  create policy "delete_plantilla_positions"
  on "public"."plantilla_positions"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_plantilla_positions"
  on "public"."plantilla_positions"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_plantilla_positions"
  on "public"."plantilla_positions"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_plantilla_positions"
  on "public"."plantilla_positions"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_role_permissions_admin"
  on "public"."role_permissions"
  as permissive
  for delete
  to authenticated
using ((public.get_current_user_role() = 'super_admin'::text));



  create policy "insert_role_permissions_admin"
  on "public"."role_permissions"
  as permissive
  for insert
  to authenticated
with check ((public.get_current_user_role() = 'super_admin'::text));



  create policy "select_role_permissions_authenticated"
  on "public"."role_permissions"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_role_permissions_admin"
  on "public"."role_permissions"
  as permissive
  for update
  to authenticated
using ((public.get_current_user_role() = 'super_admin'::text))
with check ((public.get_current_user_role() = 'super_admin'::text));



  create policy "ca_employees_delete"
  on "public"."ca_employees"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_employees_insert"
  on "public"."ca_employees"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_employees_select"
  on "public"."ca_employees"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_employees_update"
  on "public"."ca_employees"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_details_delete"
  on "public"."ca_payroll_details"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_details_insert"
  on "public"."ca_payroll_details"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_details_select"
  on "public"."ca_payroll_details"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_details_update"
  on "public"."ca_payroll_details"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_headers_delete"
  on "public"."ca_payroll_headers"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_headers_insert"
  on "public"."ca_payroll_headers"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_headers_select"
  on "public"."ca_payroll_headers"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_headers_update"
  on "public"."ca_payroll_headers"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_signatories_delete"
  on "public"."ca_payroll_signatories"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_signatories_insert"
  on "public"."ca_payroll_signatories"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_signatories_select"
  on "public"."ca_payroll_signatories"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ca_payroll_signatories_update"
  on "public"."ca_payroll_signatories"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "deduction_codes_select"
  on "public"."deduction_codes"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "deductions_select"
  on "public"."deductions"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = deductions.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = deductions.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));



  create policy "select_division_office"
  on "public"."division_office"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "divisions_select"
  on "public"."divisions"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "earnings_select"
  on "public"."earnings"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = earnings.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = earnings.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));



  create policy "employees_select"
  on "public"."employees"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode())) OR ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) OR (employee_number = public.get_current_user_empno())))));



  create policy "ipa_delete"
  on "public"."initial_payroll_absences"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ipa_insert"
  on "public"."initial_payroll_absences"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ipa_select"
  on "public"."initial_payroll_absences"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ipa_update"
  on "public"."initial_payroll_absences"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_initial_payroll_entries"
  on "public"."initial_payroll_entries"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_initial_payroll_entries"
  on "public"."initial_payroll_entries"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_initial_payroll_entries"
  on "public"."initial_payroll_entries"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_initial_payroll_entries"
  on "public"."initial_payroll_entries"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_initial_payroll_records"
  on "public"."initial_payroll_records"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_initial_payroll_records"
  on "public"."initial_payroll_records"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_initial_payroll_records"
  on "public"."initial_payroll_records"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_initial_payroll_records"
  on "public"."initial_payroll_records"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_initial_payroll_transfers"
  on "public"."initial_payroll_transfers"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_initial_payroll_transfers"
  on "public"."initial_payroll_transfers"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_initial_payroll_transfers"
  on "public"."initial_payroll_transfers"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_initial_payroll_transfers"
  on "public"."initial_payroll_transfers"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_abs_delete"
  on "public"."ips_absences"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_abs_insert"
  on "public"."ips_absences"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_abs_select"
  on "public"."ips_absences"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_abs_update"
  on "public"."ips_absences"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_audit_insert"
  on "public"."ips_audit_logs"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_audit_select"
  on "public"."ips_audit_logs"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_emp_delete"
  on "public"."ips_employees"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_emp_insert"
  on "public"."ips_employees"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_emp_select"
  on "public"."ips_employees"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_emp_update"
  on "public"."ips_employees"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_pd_delete"
  on "public"."ips_payroll_details"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_pd_insert"
  on "public"."ips_payroll_details"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_pd_select"
  on "public"."ips_payroll_details"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_pd_update"
  on "public"."ips_payroll_details"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_pp_delete"
  on "public"."ips_payroll_periods"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_pp_insert"
  on "public"."ips_payroll_periods"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "ips_pp_select"
  on "public"."ips_payroll_periods"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "ips_pp_update"
  on "public"."ips_payroll_periods"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_non_plantilla"
  on "public"."non_plantilla_employees"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_non_plantilla"
  on "public"."non_plantilla_employees"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_non_plantilla"
  on "public"."non_plantilla_employees"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_non_plantilla"
  on "public"."non_plantilla_employees"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "pay_periods_select"
  on "public"."pay_periods"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "payroll_deductions_select"
  on "public"."payroll_deductions"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND ((empno = public.get_current_user_empno()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_deductions.employee_id) AND (e.stacode = public.get_current_user_stacode())))))) OR ((public.get_current_user_role() = 'ess'::text) AND (empno = public.get_current_user_empno()))));



  create policy "payroll_entries_select"
  on "public"."payroll_entries"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_entries.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_entries.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));



  create policy "payroll_groups_select"
  on "public"."payroll_groups"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "delete_payroll_number_counter"
  on "public"."payroll_number_counter"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_payroll_number_counter"
  on "public"."payroll_number_counter"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_payroll_number_counter"
  on "public"."payroll_number_counter"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_payroll_number_counter"
  on "public"."payroll_number_counter"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_plantilla_headers"
  on "public"."plantilla_headers"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_plantilla_headers"
  on "public"."plantilla_headers"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_plantilla_headers"
  on "public"."plantilla_headers"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_plantilla_headers"
  on "public"."plantilla_headers"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_plantilla_import_logs"
  on "public"."plantilla_import_logs"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_plantilla_import_logs"
  on "public"."plantilla_import_logs"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_plantilla_import_logs"
  on "public"."plantilla_import_logs"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_plantilla_import_logs"
  on "public"."plantilla_import_logs"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_position_management"
  on "public"."position_management"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_position_management"
  on "public"."position_management"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_position_management"
  on "public"."position_management"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_position_management"
  on "public"."position_management"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "regions_select"
  on "public"."regions"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "salary_schedule_select"
  on "public"."salary_schedule"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "delete_schools"
  on "public"."schools"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_schools"
  on "public"."schools"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_schools"
  on "public"."schools"
  as permissive
  for select
  to public
using ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));



  create policy "update_schools"
  on "public"."schools"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "security_events_insert"
  on "public"."security_events"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "security_events_select"
  on "public"."security_events"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "security_settings_select"
  on "public"."security_settings"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "security_settings_update"
  on "public"."security_settings"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "delete_signatories"
  on "public"."signatories"
  as permissive
  for delete
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "insert_signatories"
  on "public"."signatories"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "select_signatories"
  on "public"."signatories"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "update_signatories"
  on "public"."signatories"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "undeducted_obligations_select"
  on "public"."undeducted_obligations"
  as permissive
  for select
  to authenticated
using ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = undeducted_obligations.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = undeducted_obligations.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));
