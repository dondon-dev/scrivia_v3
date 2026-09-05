$token = (Invoke-RestMethod -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -ContentType 'application/json' -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}').token
$headers = @{ 'Authorization' = $token }
$collections = Invoke-RestMethod -Uri 'http://localhost:8090/api/collections' -Headers $headers
$names = $collections.items | ForEach-Object { $_.name } | Sort-Object
Write-Output ("PocketBase has " + $names.Count + " collections:")
$names | ForEach-Object { Write-Output ("  " + $_) }

# Check which frontend collections are missing
$frontendNeeded = @('audit_logs','ca_employees','ca_payroll_details','ca_payroll_headers','ca_payroll_signatories','dbf_restore_history','dbf_sync_sessions','deduction_codes','deduction_history','deductions','division_office','divisions','earnings','employees','gsis_import_logs','initial_payroll_entries','initial_payroll_records','initial_payroll_transfers','non_plantilla_employees','pay_periods','payent','payroll_deductions','payroll_definitions','payroll_entries','payroll_formulas','payroll_groups','payroll_number_counter','plantilla_import_logs','plantilla_positions','pli_import_logs','position_import_logs','position_management','profiles','regions','salary_schedule','schools','security_events','security_settings','signatories','stacode_audit','undeducted_obligations','notifications','otp_codes','dashboard_stats_cache','dbf_stntable','dbf_divtable','dbf_mastfile','dbf_included','dbf_excluded','dbf_pyent','dbf_pyent1','dbf_pyent2','payroll_run_summaries','role_permissions','system_settings','users','gsis_billing','gsis_remittance','comm_allowance_employees','comm_allowance_payroll')
$existing = $collections.items | ForEach-Object { $_.name }
$missing = $frontendNeeded | Where-Object { $_ -notin $existing }
Write-Output ""
Write-Output ("Missing collections (" + $missing.Count + "):")
$missing | ForEach-Object { Write-Output ("  " + $_) }
