$token = (Invoke-WebRequest -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}' -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -ExpandProperty token
$headers = @{"Authorization"=$token}

# Check employees collection
$col = (Invoke-WebRequest -Uri 'http://localhost:8090/api/collections/employees' -Headers $headers -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "employees: fields=$($col.fields.Count)"
$col.fields | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.name) [$($_.type)]" }

# Check profiles
$col2 = (Invoke-WebRequest -Uri 'http://localhost:8090/api/collections/profiles' -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue)
if ($col2) {
  $p = $col2.Content | ConvertFrom-Json
  Write-Host "profiles: fields=$($p.Count) type=$($p.type)"
} else {
  Write-Host "profiles: NOT FOUND"
}

# Check divisions
$col3 = (Invoke-WebRequest -Uri 'http://localhost:8090/api/collections/divisions' -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue)
if ($col3) {
  $d = $col3.Content | ConvertFrom-Json
  Write-Host "divisions: fields=$($d.fields.Count) type=$($d.type)"
} else {
  Write-Host "divisions: NOT FOUND"
}
