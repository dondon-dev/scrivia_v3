$token = (Invoke-RestMethod -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -ContentType 'application/json' -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}').token
$headers = @{ 'Authorization' = $token; 'Content-Type' = 'application/json' }

# Set public read access for all DBF collections (empty string = anyone can read)
$collections = @('dbf_stntable', 'dbf_divtable', 'dbf_mastfile', 'payroll_deductions', 'dbf_included', 'dbf_excluded', 'dbf_pyent', 'dbf_pyent1', 'dbf_pyent2', 'payent', 'deductions', 'undeducted_obligations', 'dbf_sync_sessions', 'pay_periods')
foreach ($c in $collections) {
    try {
        $body = @{ rules = @{ list = ""; view = ""; create = ""; update = ""; delete = "" } } | ConvertTo-Json -Depth 3
        Invoke-RestMethod -Uri "http://localhost:8090/api/collections/$c" -Method PATCH -Headers $headers -Body $body | Out-Null
        Write-Output "$c : rules updated to public"
    } catch {
        Write-Output "$c : FAILED - $($_.Exception.Message)"
    }
}
