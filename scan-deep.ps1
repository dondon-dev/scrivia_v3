# Scan for all supabase.xxx.yyy patterns
$patterns = @(
    'supabase\.from\(',
    'supabase\.rpc\(',
    'supabase\.auth\.',
    'supabase\.send\(',
    '\.select\(',
    '\.insert\(',
    '\.update\(',
    '\.upsert\(',
    '\.delete\(\)',
    '\.eq\(',
    '\.neq\(',
    '\.in\(',
    '\.gte\(',
    '\.lte\(',
    '\.single\(',
    '\.maybeSingle\(',
    '\.order\(',
    '\.limit\(',
    '\.range\(',
    '\.filter\(',
    '\.is\(',
    '\.ilike\(',
    '\.like\(',
    '\.or\('
)

Write-Output "=== Unique supabase.xxx.yyy method combinations ==="
Get-ChildItem -Recurse 'C:\scriviacloudV2\frontend\src' -Include '*.tsx','*.ts' -ErrorAction SilentlyContinue | Select-String -Pattern 'supabase\.\w+\.\w+' | ForEach-Object {
    if ($_.Line -match 'supabase\.(\w+)\.(\w+)') {
        "$($matches[1]).$($matches[2])"
    }
} | Sort-Object -Unique | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "=== rpc() calls (PostgreSQL functions) ==="
Get-ChildItem -Recurse 'C:\scriviacloudV2\frontend\src' -Include '*.tsx','*.ts' -ErrorAction SilentlyContinue | Select-String -Pattern "supabase\.rpc\(['""]" | ForEach-Object {
    if ($_.Line -match "supabase\.rpc\(['""]([^'""]+)['""]") {
        $matches[1]
    }
} | Sort-Object -Unique | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "=== from() collection names ==="
Get-ChildItem -Recurse 'C:\scriviacloudV2\frontend\src' -Include '*.tsx','*.ts' -ErrorAction SilentlyContinue | Select-String -Pattern "supabase\.from\(['""]" | ForEach-Object {
    if ($_.Line -match "supabase\.from\(['""]([^'""]+)['""]") {
        $matches[1]
    }
} | Sort-Object -Unique | ForEach-Object { Write-Output "  $_" }
