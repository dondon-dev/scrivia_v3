Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmdLine -match 'sync-watcher') {
            Stop-Process -Id $_.Id -Force
            Write-Output "Killed sync watcher PID $($_.Id)"
        }
    } catch {}
}
