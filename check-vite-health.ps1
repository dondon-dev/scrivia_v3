try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 5
  Write-Host "Vite OK: $($r.StatusCode)"
} catch {
  Write-Host "Vite not ready: $($_.Exception.Message)"
}
