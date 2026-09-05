/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  // ─── employees ───
  const employees = dao.findCollectionByNameOrId("vl57ay30r5ghesy");
  employees.indexes = [
    "CREATE INDEX idx_employees_stacode ON employees (stacode)",
    "CREATE INDEX idx_employees_divcode ON employees (divcode)",
    "CREATE INDEX idx_employees_regcode ON employees (regcode)",
    "CREATE INDEX idx_employees_empno ON employees (empno)",
    "CREATE INDEX idx_employees_employee_number ON employees (employee_number)",
    "CREATE INDEX idx_employees_status ON employees (status)",
    "CREATE INDEX idx_employees_payroll_group_id ON employees (payroll_group_id)",
    "CREATE INDEX idx_employees_name ON employees (last_name, first_name)",
    "CREATE INDEX idx_employees_stacode_status ON employees (stacode, status)",
    "CREATE INDEX idx_employees_divcode_status ON employees (divcode, status)",
  ];
  dao.saveCollection(employees);

  // ─── profiles ───
  const profiles = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy");
  profiles.indexes = [
    "CREATE INDEX idx_profiles_email ON profiles (email)",
    "CREATE INDEX idx_profiles_role ON profiles (role)",
    "CREATE INDEX idx_profiles_status ON profiles (status)",
    "CREATE INDEX idx_profiles_region_id ON profiles (region_id)",
    "CREATE INDEX idx_profiles_division_id ON profiles (division_id)",
    "CREATE INDEX idx_profiles_assigned_stacode ON profiles (assigned_stacode)",
    "CREATE INDEX idx_profiles_employee_number ON profiles (employee_number)",
    "CREATE INDEX idx_profiles_username ON profiles (username)",
    "CREATE INDEX idx_profiles_status_role ON profiles (status, role)",
  ];
  dao.saveCollection(profiles);

  // ─── payroll_entries ───
  const payrollEntries = dao.findCollectionByNameOrId("lslr92t6qsjw54j");
  payrollEntries.indexes = [
    "CREATE INDEX idx_payroll_entries_employee_id ON payroll_entries (employee_id)",
    "CREATE INDEX idx_payroll_entries_pay_period_id ON payroll_entries (pay_period_id)",
    "CREATE INDEX idx_payroll_entries_status ON payroll_entries (status)",
    "CREATE INDEX idx_payroll_entries_employee_period ON payroll_entries (employee_id, pay_period_id)",
    "CREATE INDEX idx_payroll_entries_period_status ON payroll_entries (pay_period_id, status)",
  ];
  dao.saveCollection(payrollEntries);

  // ─── payroll_deductions ───
  const payrollDeductions = dao.findCollectionByNameOrId("kiwdyrkdmy16frv");
  payrollDeductions.indexes = [
    "CREATE INDEX idx_payroll_deductions_employee_id ON payroll_deductions (employee_id)",
    "CREATE INDEX idx_payroll_deductions_empno ON payroll_deductions (empno)",
    "CREATE INDEX idx_payroll_deductions_dedcode ON payroll_deductions (dedcode)",
    "CREATE INDEX idx_payroll_deductions_status ON payroll_deductions (status)",
    "CREATE INDEX idx_payroll_deductions_eff_dates ON payroll_deductions (effyy, effmm)",
    "CREATE INDEX idx_payroll_deductions_employee_status ON payroll_deductions (employee_id, status)",
    "CREATE INDEX idx_payroll_deductions_empno_status ON payroll_deductions (empno, status)",
  ];
  dao.saveCollection(payrollDeductions);

  // ─── pay_periods ───
  const payPeriods = dao.findCollectionByNameOrId("1xl0p724e4995sh");
  payPeriods.indexes = [
    "CREATE INDEX idx_pay_periods_division_id ON pay_periods (division_id)",
    "CREATE INDEX idx_pay_periods_status ON pay_periods (status)",
    "CREATE INDEX idx_pay_periods_dates ON pay_periods (start_date, end_date)",
    "CREATE INDEX idx_pay_periods_division_status ON pay_periods (division_id, status)",
    "CREATE INDEX idx_pay_periods_year_month ON pay_periods (pay_year, pay_month)",
  ];
  dao.saveCollection(payPeriods);

  // ─── payroll_groups ───
  const payrollGroups = dao.findCollectionByNameOrId("acchgj5r79ufe8q");
  payrollGroups.indexes = [
    "CREATE INDEX idx_payroll_groups_stacode_range ON payroll_groups (stacode_min, stacode_max)",
    "CREATE INDEX idx_payroll_groups_status ON payroll_groups (status)",
  ];
  dao.saveCollection(payrollGroups);

  // ─── deduction_codes ───
  const deductionCodes = dao.findCollectionByNameOrId("caoee6lrodu2a08");
  deductionCodes.indexes = [
    "CREATE INDEX idx_deduction_codes_dedcode ON deduction_codes (dedcode)",
    "CREATE INDEX idx_deduction_codes_agency ON deduction_codes (agency)",
    "CREATE INDEX idx_deduction_codes_type ON deduction_codes (type)",
    "CREATE INDEX idx_deduction_codes_status ON deduction_codes (status)",
  ];
  dao.saveCollection(deductionCodes);

  // ─── schools ───
  const schools = dao.findCollectionByNameOrId("cmsk36htwio37ir");
  schools.indexes = [
    "CREATE INDEX idx_schools_school_code ON schools (school_code)",
    "CREATE INDEX idx_schools_division_id ON schools (division_id)",
    "CREATE INDEX idx_schools_status ON schools (status)",
    "CREATE INDEX idx_schools_division_status ON schools (division_id, status)",
  ];
  dao.saveCollection(schools);

  // ─── divisions ───
  const divisions = dao.findCollectionByNameOrId("cmps62yxo0n46hm");
  divisions.indexes = [
    "CREATE INDEX idx_divisions_division_code ON divisions (division_code)",
    "CREATE INDEX idx_divisions_region_id ON divisions (region_id)",
    "CREATE INDEX idx_divisions_status ON divisions (status)",
  ];
  dao.saveCollection(divisions);

  // ─── regions ───
  const regions = dao.findCollectionByNameOrId("un4yjy6pwxq32ot");
  regions.indexes = [
    "CREATE INDEX idx_regions_region_code ON regions (region_code)",
    "CREATE INDEX idx_regions_status ON regions (status)",
  ];
  dao.saveCollection(regions);

  // ─── non_plantilla_employees ───
  const nonPlantilla = dao.findCollectionByNameOrId("ase0x53zo2nje67");
  nonPlantilla.indexes = [
    "CREATE INDEX idx_non_plantilla_stacode ON non_plantilla_employees (stacode)",
    "CREATE INDEX idx_non_plantilla_divcode ON non_plantilla_employees (divcode)",
    "CREATE INDEX idx_non_plantilla_regcode ON non_plantilla_employees (regcode)",
    "CREATE INDEX idx_non_plantilla_status ON non_plantilla_employees (status)",
    "CREATE INDEX idx_non_plantilla_is_deleted ON non_plantilla_employees (is_deleted)",
    "CREATE INDEX idx_non_plantilla_school ON non_plantilla_employees (school)",
  ];
  dao.saveCollection(nonPlantilla);

  // ─── audit_logs ───
  const auditLogs = dao.findCollectionByNameOrId("1kgqqgc06lp78gf");
  auditLogs.indexes = [
    "CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id)",
    "CREATE INDEX idx_audit_logs_action ON audit_logs (action)",
    "CREATE INDEX idx_audit_logs_record_type_id ON audit_logs (record_type, record_id)",
    "CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at)",
    "CREATE INDEX idx_audit_logs_user_created ON audit_logs (user_id, created_at)",
  ];
  dao.saveCollection(auditLogs);

  // ─── login_attempts ───
  const loginAttempts = dao.findCollectionByNameOrId("xor0q7ubqwl7fbf");
  loginAttempts.indexes = [
    "CREATE INDEX idx_login_attempts_email ON login_attempts (email)",
    "CREATE INDEX idx_login_attempts_user_id ON login_attempts (user_id)",
    "CREATE INDEX idx_login_attempts_success ON login_attempts (success)",
    "CREATE INDEX idx_login_attempts_created_at ON login_attempts (created_at)",
    "CREATE INDEX idx_login_attempts_email_created ON login_attempts (email, created_at)",
  ];
  dao.saveCollection(loginAttempts);

  // ─── otp_codes ───
  const otpCodes = dao.findCollectionByNameOrId("clz1yyu3y16nkul");
  otpCodes.indexes = [
    "CREATE INDEX idx_otp_codes_email ON otp_codes (email)",
    "CREATE INDEX idx_otp_codes_expires_at ON otp_codes (expires_at)",
    "CREATE INDEX idx_otp_codes_used ON otp_codes (used)",
    "CREATE INDEX idx_otp_codes_email_used ON otp_codes (email, used)",
  ];
  dao.saveCollection(otpCodes);

  // ─── password_reset_tokens ───
  const passwordReset = dao.findCollectionByNameOrId("nfo0a34cokj8h53");
  passwordReset.indexes = [
    "CREATE INDEX idx_password_reset_user_id ON password_reset_tokens (user_id)",
    "CREATE INDEX idx_password_reset_token_hash ON password_reset_tokens (token_hash)",
    "CREATE INDEX idx_password_reset_expires_at ON password_reset_tokens (expires_at)",
    "CREATE INDEX idx_password_reset_used ON password_reset_tokens (used)",
  ];
  dao.saveCollection(passwordReset);

  // ─── security_events ───
  const securityEvents = dao.findCollectionByNameOrId("25wmxc5x6lg60g2");
  securityEvents.indexes = [
    "CREATE INDEX idx_security_events_type ON security_events (event_type)",
    "CREATE INDEX idx_security_events_severity ON security_events (severity)",
    "CREATE INDEX idx_security_events_created_at ON security_events (created_at)",
    "CREATE INDEX idx_security_events_source ON security_events (source)",
  ];
  dao.saveCollection(securityEvents);

  // ─── role_permissions ───
  const rolePermissions = dao.findCollectionByNameOrId("wqu2du590ok244h");
  rolePermissions.indexes = [
    "CREATE UNIQUE INDEX idx_role_permissions_unique ON role_permissions (role, permission)",
    "CREATE INDEX idx_role_permissions_role ON role_permissions (role)",
    "CREATE INDEX idx_role_permissions_permission ON role_permissions (permission)",
  ];
  dao.saveCollection(rolePermissions);

  // ─── ca_employees ───
  const caEmployees = dao.findCollectionByNameOrId("c20t7zqamup8of4");
  caEmployees.indexes = [
    "CREATE UNIQUE INDEX idx_ca_employees_account_no ON ca_employees (account_no)",
    "CREATE INDEX idx_ca_employees_stacode ON ca_employees (stacode)",
    "CREATE INDEX idx_ca_employees_category ON ca_employees (category)",
    "CREATE INDEX idx_ca_employees_status ON ca_employees (status)",
    "CREATE INDEX idx_ca_employees_school_name ON ca_employees (school_name)",
  ];
  dao.saveCollection(caEmployees);

  // ─── ca_payroll_headers ───
  const caHeaders = dao.findCollectionByNameOrId("atksk8drfvi9z3j");
  caHeaders.indexes = [
    "CREATE INDEX idx_ca_payroll_headers_status ON ca_payroll_headers (status)",
    "CREATE INDEX idx_ca_payroll_headers_created_date ON ca_payroll_headers (created_date)",
    "CREATE INDEX idx_ca_payroll_headers_payroll_no ON ca_payroll_headers (payroll_no)",
  ];
  dao.saveCollection(caHeaders);

  // ─── ca_payroll_details ───
  const caDetails = dao.findCollectionByNameOrId("wgssfh47af2z7xu");
  caDetails.indexes = [
    "CREATE INDEX idx_ca_payroll_details_payroll_id ON ca_payroll_details (payroll_id)",
    "CREATE INDEX idx_ca_payroll_details_employee_id ON ca_payroll_details (employee_id)",
    "CREATE INDEX idx_ca_payroll_details_line_no ON ca_payroll_details (line_no)",
  ];
  dao.saveCollection(caDetails);

  // ─── ca_payroll_signatories ───
  const caSignatories = dao.findCollectionByNameOrId("yr2b73qy6pgnc3y");
  caSignatories.indexes = [
    "CREATE INDEX idx_ca_payroll_signatories_payroll_id ON ca_payroll_signatories (payroll_id)",
    "CREATE INDEX idx_ca_payroll_signatories_sequence ON ca_payroll_signatories (sequence_no)",
  ];
  dao.saveCollection(caSignatories);

  // ─── position_management ───
  const positionMgmt = dao.findCollectionByNameOrId("gv43qq5nkgwhp20");
  positionMgmt.indexes = [
    "CREATE UNIQUE INDEX idx_position_management_code ON position_management (position_code)",
    "CREATE INDEX idx_position_management_status ON position_management (status)",
    "CREATE INDEX idx_position_management_category ON position_management (personnel_category)",
  ];
  dao.saveCollection(positionMgmt);

  // ─── salary_schedule ───
  const salarySchedule = dao.findCollectionByNameOrId("s7jyhlq9ucozzda");
  salarySchedule.indexes = [
    "CREATE UNIQUE INDEX idx_salary_schedule_grade_step ON salary_schedule (grade, step)",
    "CREATE INDEX idx_salary_schedule_grade ON salary_schedule (grade)",
  ];
  dao.saveCollection(salarySchedule);

  // ─── deductions ───
  const deductions = dao.findCollectionByNameOrId("9dabnyqv695rl4j");
  deductions.indexes = [
    "CREATE INDEX idx_deductions_employee_id ON deductions (employee_id)",
    "CREATE INDEX idx_deductions_pay_period_id ON deductions (pay_period_id)",
    "CREATE INDEX idx_deductions_deduction_code ON deductions (deduction_code)",
    "CREATE INDEX idx_deductions_source ON deductions (source)",
    "CREATE INDEX idx_deductions_employee_period ON deductions (employee_id, pay_period_id)",
  ];
  dao.saveCollection(deductions);

  // ─── undeducted_obligations ───
  const undeducted = dao.findCollectionByNameOrId("hp3uf68huzgwak0");
  undeducted.indexes = [
    "CREATE INDEX idx_undeducted_employee_id ON undeducted_obligations (employee_id)",
    "CREATE INDEX idx_undeducted_pay_period_id ON undeducted_obligations (pay_period_id)",
    "CREATE INDEX idx_undeducted_deduction_code ON undeducted_obligations (deduction_code)",
    "CREATE INDEX idx_undeducted_employee_period ON undeducted_obligations (employee_id, pay_period_id)",
  ];
  dao.saveCollection(undeducted);

  // ─── plantilla_positions ───
  const plantillaPositions = dao.findCollectionByNameOrId("wtbx8mli93m0nln");
  plantillaPositions.indexes = [
    "CREATE INDEX idx_plantilla_positions_item_number ON plantilla_positions (item_number)",
    "CREATE INDEX idx_plantilla_positions_school_id ON plantilla_positions (school_id)",
    "CREATE INDEX idx_plantilla_positions_employee_id ON plantilla_positions (employee_id)",
    "CREATE INDEX idx_plantilla_positions_fiscal_year ON plantilla_positions (fiscal_year)",
    "CREATE INDEX idx_plantilla_positions_status ON plantilla_positions (position_status)",
    "CREATE INDEX idx_plantilla_positions_category ON plantilla_positions (personnel_category)",
  ];
  dao.saveCollection(plantillaPositions);

  // ─── plantilla_import_logs ───
  const plantillaLogs = dao.findCollectionByNameOrId("xmhoulghme7nc28");
  plantillaLogs.indexes = [
    "CREATE INDEX idx_plantilla_import_logs_import_date ON plantilla_import_logs (import_date)",
    "CREATE INDEX idx_plantilla_import_logs_imported_by ON plantilla_import_logs (imported_by)",
    "CREATE INDEX idx_plantilla_import_logs_batch ON plantilla_import_logs (import_batch_id)",
  ];
  dao.saveCollection(plantillaLogs);

  // ─── position_import_logs ───
  const positionLogs = dao.findCollectionByNameOrId("czo5bs0zcr36bad");
  positionLogs.indexes = [
    "CREATE INDEX idx_position_import_logs_created_at ON position_import_logs (created_at)",
    "CREATE INDEX idx_position_import_logs_uploaded_by ON position_import_logs (uploaded_by)",
  ];
  dao.saveCollection(positionLogs);

  // ─── gsis_import_logs ───
  const gsisLogs = dao.findCollectionByNameOrId("5gyhulz0um65y1q");
  gsisLogs.indexes = [
    "CREATE INDEX idx_gsis_import_logs_created_at ON gsis_import_logs (created_at)",
    "CREATE INDEX idx_gsis_import_logs_uploaded_by ON gsis_import_logs (uploaded_by)",
  ];
  dao.saveCollection(gsisLogs);

  // ─── pli_import_logs ───
  const pliLogs = dao.findCollectionByNameOrId("w701vlybnaoni6k");
  pliLogs.indexes = [
    "CREATE INDEX idx_pli_import_logs_created_at ON pli_import_logs (created_at)",
    "CREATE INDEX idx_pli_import_logs_uploaded_by ON pli_import_logs (uploaded_by)",
  ];
  dao.saveCollection(pliLogs);

  // ─── dbf_sync_sessions ───
  const dbfSessions = dao.findCollectionByNameOrId("65o1znjj2a65nuw");
  dbfSessions.indexes = [
    "CREATE INDEX idx_dbf_sync_sessions_created_at ON dbf_sync_sessions (created_at)",
    "CREATE INDEX idx_dbf_sync_sessions_status ON dbf_sync_sessions (status)",
    "CREATE INDEX idx_dbf_sync_sessions_division_id ON dbf_sync_sessions (division_id)",
  ];
  dao.saveCollection(dbfSessions);

  // ─── notifications ───
  const notifications = dao.findCollectionByNameOrId("wgt4am6k9qvcfex");
  notifications.indexes = [
    "CREATE INDEX idx_notifications_user_id ON notifications (user_id)",
    "CREATE INDEX idx_notifications_read ON notifications (read)",
    "CREATE INDEX idx_notifications_created_at ON notifications (created_at)",
  ];
  dao.saveCollection(notifications);

  // ─── system_settings ───
  const systemSettings = dao.findCollectionByNameOrId("o6dx1kcfukk5yfb");
  systemSettings.indexes = [
    "CREATE UNIQUE INDEX idx_system_settings_id ON system_settings (id)",
  ];
  dao.saveCollection(systemSettings);

  // ─── security_settings ───
  const securitySettings = dao.findCollectionByNameOrId("6iv9m2tm17q0x74");
  securitySettings.indexes = [
    "CREATE UNIQUE INDEX idx_security_settings_id ON security_settings (id)",
  ];
  dao.saveCollection(securitySettings);

  // ─── dashboard_stats_cache ───
  const dashboardCache = dao.findCollectionByNameOrId("d21t4y7a5gl4bss");
  dashboardCache.indexes = [
    "CREATE INDEX idx_dashboard_cache_key ON dashboard_stats_cache (key)",
    "CREATE INDEX idx_dashboard_cache_expires ON dashboard_stats_cache (expires_at)",
  ];
  dao.saveCollection(dashboardCache);

  // ─── initial_payroll_entries ───
  const initialEntries = dao.findCollectionByNameOrId("b1qxwr0qki4nxl1");
  initialEntries.indexes = [
    "CREATE INDEX idx_initial_payroll_entries_employee_id ON initial_payroll_entries (employee_id)",
    "CREATE INDEX idx_initial_payroll_entries_pay_period_id ON initial_payroll_entries (pay_period_id)",
    "CREATE INDEX idx_initial_payroll_entries_status ON initial_payroll_entries (status)",
  ];
  dao.saveCollection(initialEntries);

  // ─── payroll_definitions ───
  const payrollDefs = dao.findCollectionByNameOrId("c3w3lkg0szsfxzb");
  payrollDefs.indexes = [
    "CREATE INDEX idx_payroll_definitions_field ON payroll_definitions (field_name)",
    "CREATE INDEX idx_payroll_definitions_type ON payroll_definitions (field_type)",
  ];
  dao.saveCollection(payrollDefs);

  // ─── payroll_formulas ───
  const payrollFormulas = dao.findCollectionByNameOrId("98vwx7gpi20k86n");
  payrollFormulas.indexes = [
    "CREATE INDEX idx_payroll_formulas_field ON payroll_formulas (field_name)",
    "CREATE INDEX idx_payroll_formulas_active ON payroll_formulas (is_active)",
  ];
  dao.saveCollection(payrollFormulas);

  // ─── ips_employees ───
  const ipsEmployees = dao.findCollectionByNameOrId("589nah3kirzsflt");
  ipsEmployees.indexes = [
    "CREATE INDEX idx_ips_employees_empno ON ips_employees (empno)",
    "CREATE INDEX idx_ips_employees_stacode ON ips_employees (stacode)",
  ];
  dao.saveCollection(ipsEmployees);

  // ─── ips_payroll_details ───
  const ipsDetails = dao.findCollectionByNameOrId("w13atdd1276x6mb");
  ipsDetails.indexes = [
    "CREATE INDEX idx_ips_payroll_details_period ON ips_payroll_details (payroll_period_id)",
    "CREATE INDEX idx_ips_payroll_details_employee ON ips_payroll_details (employee_id)",
  ];
  dao.saveCollection(ipsDetails);

  // ─── notifications (already done) ───

  // ─── earnings ───
  const earnings = dao.findCollectionByNameOrId("yumeaqyypcsk8nn");
  earnings.indexes = [
    "CREATE INDEX idx_earnings_employee_id ON earnings (employee_id)",
    "CREATE INDEX idx_earnings_pay_period_id ON earnings (pay_period_id)",
  ];
  dao.saveCollection(earnings);

  // ─── deduction_history ───
  const deductionHistory = dao.findCollectionByNameOrId("m25rc270ev4lwok");
  deductionHistory.indexes = [
    "CREATE INDEX idx_deduction_history_employee ON deduction_history (employee_id)",
    "CREATE INDEX idx_deduction_history_dedcode ON deduction_history (dedcode)",
    "CREATE INDEX idx_deduction_history_date ON deduction_history (created_at)",
  ];
  dao.saveCollection(deductionHistory);

  // ─── payroll_entry_deductions ───
  const entryDeductions = dao.findCollectionByNameOrId("m2fv688a804i7bx");
  entryDeductions.indexes = [
    "CREATE INDEX idx_payroll_entry_deductions_entry ON payroll_entry_deductions (payroll_entry_id)",
    "CREATE INDEX idx_payroll_entry_deductions_code ON payroll_entry_deductions (deduction_code)",
  ];
  dao.saveCollection(entryDeductions);

  // ─── payroll_run_summaries ───
  const runSummaries = dao.findCollectionByNameOrId("lralh7k7hj04ser");
  runSummaries.indexes = [
    "CREATE INDEX idx_payroll_run_summaries_period ON payroll_run_summaries (pay_period_id)",
    "CREATE INDEX idx_payroll_run_summaries_status ON payroll_run_summaries (status)",
  ];
  dao.saveCollection(runSummaries);

}, (db) => {
  // Down migration - drop all indexes (SQLite doesn't support DROP INDEX IF EXISTS easily)
  // Just return without error - indexes will be recreated on up
  return true;
});