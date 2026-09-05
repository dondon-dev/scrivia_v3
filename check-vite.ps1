# Check Vite status
Start-Sleep 5
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5174/' -UseBasicParsing -TimeoutSec 5
    Write-Output ("VITE_OK_" + $resp.StatusCode)
} catch {
    Write-Output "VITE_DOWN"
}
