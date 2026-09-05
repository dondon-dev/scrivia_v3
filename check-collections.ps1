# Check DBF collection schemas
$token = (Invoke-RestMethod -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -ContentType 'application/json' -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}').token
$headers = @{ 'Authorization' = $token }

$collections = @('dbf_stntable', 'dbf_divtable', 'dbf_mastfile', 'payroll_deductions', 'dbf_included', 'dbf_excluded')
foreach ($c in $collections) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8090/api/collections/$c" -Headers $headers
        $fields = ($res.schema | ForEach-Object { $_.name }) -join ', '
        Write-Output "$c : $($res.type) fields=[$fields]"
    } catch {
        Write-Output "$c : MISSING or ERROR"
    }
}
