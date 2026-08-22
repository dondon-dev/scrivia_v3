# Find and kill sync-watcher processes
$procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*sync-watcher*' }
if ($procs) {
    foreach ($p in $procs) {
        Write-Output "Killing PID $($p.ProcessId): $($p.CommandLine)"
        Stop-Process -Id $p.ProcessId -Force
    }
} else {
    Write-Output "No sync-watcher processes found."
}

# Also find processes running supabase db diff
$diffProcs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*db diff*' -and $_.CommandLine -notlike '*grep*' }
if ($diffProcs) {
    foreach ($p in $diffProcs) {
        Write-Output "Killing diff PID $($p.ProcessId): $($p.CommandLine)"
        Stop-Process -Id $p.ProcessId -Force
    }
}
