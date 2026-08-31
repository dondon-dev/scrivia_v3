@echo off

set BACKUPDIR=C:\SupabaseBackups

for /f %%i in ('powershell -command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

docker exec supabase_db_scriviacloud pg_dump -U postgres postgres > "%BACKUPDIR%\backup_%TS%.sql"

echo Backup created:
echo %BACKUPDIR%\backup_%TS%.sql

pause