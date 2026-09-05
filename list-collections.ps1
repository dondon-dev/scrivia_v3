$token = (Invoke-WebRequest -Uri 'http://localhost:8090/api/admins/auth-with-password' -Method POST -Body '{"identity":"admin@scrivia.local","password":"Admin123456!"}' -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -ExpandProperty token
$collections = (Invoke-WebRequest -Uri 'http://localhost:8090/api/collections?perPage=200' -Headers @{"Authorization"=$token} -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Total collections: $($collections.totalItems)"
$collections.items | ForEach-Object { Write-Host "$($_.name) [$($_.type)] fields=$($_.fields.Count)" } | Out-Null
$collections.items | ForEach-Object { "$($_.name)|$($_.type)|$($_.fields.Count)" }
