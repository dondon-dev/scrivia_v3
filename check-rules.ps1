$token = (Invoke-RestMethod -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -ContentType 'application/json' -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}').token
$headers = @{ 'Authorization' = $token }

$collections = @('dbf_stntable', 'dbf_divtable', 'dbf_mastfile', 'payroll_deductions', 'dbf_included', 'dbf_excluded')
foreach ($c in $collections) {
    $res = Invoke-RestMethod -Uri "http://localhost:8090/api/collections/$c" -Headers $headers
    $rule = if ($res.rules) { $res.rules.list } else { 'null' }
    Write-Output "$c : listRule=[$rule]"
}
