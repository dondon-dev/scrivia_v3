try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 5
    Write-Output ("VITE5173_OK_" + $resp.StatusCode)
} catch {
    Write-Output 'VITE5173_DOWN'
}
