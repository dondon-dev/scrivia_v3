Set-Location 'C:\scriviacloudV2\frontend'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WindowStyle Hidden
Start-Sleep -Seconds 10
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 5
    Write-Output ("VITE_OK_" + $resp.StatusCode)
} catch {
    Write-Output "VITE_DOWN"
}
$proc = Get-Process -Name 'node' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) { Write-Output ("PID=" + $proc.Id) } else { Write-Output "NO_NODE" }
