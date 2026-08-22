Set WshShell = CreateObject("WScript.Shell")

' 1. Start Supabase
WshShell.Run "cmd /c cd /d C:\scriviacloud && supabase start --hostname 127.0.0.1 2>&1 >> C:\scriviacloud\.freebuff\supabase-start.log", 0, False
WScript.Sleep 30000

' 2. Reset DB to match local migrations
WshShell.Run "cmd /c cd /d C:\scriviacloud && supabase db reset --local 2>&1 >> C:\scriviacloud\.freebuff\db-reset.log", 0, False
WScript.Sleep 10000

' 3. Fix auth triggers and grants (signup was broken by FORCE RLS + disabled triggers)
WshShell.Run "cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File C:\scriviacloud\.freebuff\fix-auth-triggers.ps1 2>&1 >> C:\scriviacloud\.freebuff\auth-fix.log", 0, False
WScript.Sleep 5000

' 4. Set statement timeout at DB and role level
WshShell.Run "cmd /c cd /d C:\scriviacloud && psql ""postgresql://postgres:postgres@127.0.0.1:54322/postgres"" -f .freebuff/ensure-timeout.sql 2>&1 >> C:\scriviacloud\.freebuff\timeout.log", 0, False
WScript.Sleep 3000

' 5. Recreate PostgREST with 10-minute statement timeout (PGRST_DB_STATEMENT_TIMEOUT)
WshShell.Run "cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File C:\scriviacloud\.freebuff\fix-rest-timeout.ps1 2>&1 >> C:\scriviacloud\.freebuff\rest-fix.log", 0, False
WScript.Sleep 5000

' 6. Start background sync watcher
WshShell.Run "cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File C:\scriviacloud\.freebuff\sync-watcher.ps1 >> C:\scriviacloud\.freebuff\sync-watcher.log", 0, False

' 6. Start Vite dev server
WshShell.Run "cmd /c cd /d C:\scriviacloud && node node_modules\vite\bin\vite.js --host --port 5173 2>&1 >> C:\scriviacloud\.freebuff\vite.log", 0, False
