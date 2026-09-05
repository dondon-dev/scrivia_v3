# Start PocketBase
Start-Process -FilePath 'pocketbase.exe' -ArgumentList 'serve','--http=0.0.0.0:8090','--dir=C:\scriviacloudV2\pocketbase_bin\pb_data','--dev' -WorkingDirectory 'C:\scriviacloudV2\pocketbase_bin' -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8090/api/health' -UseBasicParsing -TimeoutSec 5
    Write-Output "PB_OK: $($r.Content)"
} catch {
    Write-Output "PB_FAILED"
}
