# Find all files that import from pb
$files = Get-ChildItem -Recurse 'C:\scriviacloudV2\frontend\src' -Include '*.tsx','*.ts' -ErrorAction SilentlyContinue | Select-String -Pattern 'from.*@/lib/pb' -List | Select-Object -ExpandProperty Path -Unique | Sort-Object
Write-Output "=== Files importing from pb ==="
$files | ForEach-Object { Write-Output $_ }
Write-Output ""
Write-Output "=== Total: $($files.Count) files ==="

# Find all unique supabase API patterns
Write-Output ""
Write-Output "=== API Patterns Used ==="
Get-ChildItem -Recurse 'C:\scriviacloudV2\frontend\src' -Include '*.tsx','*.ts' -ErrorAction SilentlyContinue | Select-String -Pattern 'supabase\.(from|rpc|auth|send)\.' | ForEach-Object {
    $line = $_.Line.Trim()
    if ($line -match 'supabase\.(\w+)\.(\w+)') {
        "$($matches[1]).$($matches[2])"
    }
} | Sort-Object | Group-Object | Sort-Object Count -Descending | ForEach-Object {
    Write-Output ("  {0,-30} {1}x" -f $_.Name, $_.Count)
}
