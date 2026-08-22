# Background watcher: periodically diff DB and auto-capture Studio changes
# Runs until manually stopped or the project is closed
$projectDir = 'C:\scriviacloud'
$logFile = Join-Path $projectDir '.freebuff\sync-watcher.log'
$intervalSeconds = 300  # Check every 5 minutes
$tempStderr = Join-Path $projectDir '.freebuff\diff-stderr.tmp'

Set-Location $projectDir

Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync watcher started (interval: ${intervalSeconds}s)" | Out-File $logFile

while ($true) {
    Start-Sleep -Seconds $intervalSeconds

    try {
        # Redirect stderr to temp file so only SQL diff goes to stdout
        $diffOutput = supabase db diff --use-migra --schema public 2> $tempStderr | Out-String
        $stderrContent = Get-Content $tempStderr -Raw -ErrorAction SilentlyContinue

        if ($diffOutput -match 'No schema changes found' -or [string]::IsNullOrWhiteSpace($diffOutput.Trim())) {
            "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] No changes." | Out-File $logFile -Append
        } else {
            # Verify the output is actual SQL (starts with CREATE, ALTER, DO, etc.)
            $trimmed = $diffOutput.Trim()
            if ($trimmed -match '^(CREATE|ALTER|DO|DROP|REVOKE|GRANT|INSERT|UPDATE|DELETE|SET|COMMENT)') {
                $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
                $migFile = Join-Path $projectDir "supabase\migrations\${timestamp}_studio_sync.sql"

                $diffContent = @"
-- Auto-synced from Supabase Studio
-- Detected at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

$trimmed
"@
                $diffContent | Out-File $migFile -Encoding UTF8

                "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Changes captured: $migFile" | Out-File $logFile -Append

                # Apply immediately
                supabase migration up --local 2>&1 | Out-File $logFile -Append
            } else {
                "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Diff output is not valid SQL, skipping." | Out-File $logFile -Append
                "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Output preview: $($trimmed.Substring(0, [Math]::Min(200, $trimmed.Length)))" | Out-File $logFile -Append
            }
        }
    } catch {
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Error: $_" | Out-File $logFile -Append
    }
}
