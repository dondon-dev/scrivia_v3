# Enable auth triggers that get disabled by supabase db reset
# Must run as supabase_admin inside the docker container

$ErrorActionPreference = "SilentlyContinue"

# Wait for DB to be ready
Start-Sleep -Seconds 5

# Enable triggers
docker exec supabase_db_scriviacloud psql -U supabase_admin -d postgres -c "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;" 2>$null
docker exec supabase_db_scriviacloud psql -U supabase_admin -d postgres -c "ALTER TABLE auth.users ENABLE TRIGGER trg_sync_email_verified_from_auth;" 2>$null

# Also run the SQL grants and function fixes
$env:PGPASSWORD = "postgres"
& psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f "C:\scriviacloud\.freebuff\fix-signup.sql" 2>$null
