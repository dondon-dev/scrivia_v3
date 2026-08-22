# Stop and remove the old PostgREST container
docker stop supabase_rest_scriviacloud 2>$null
docker rm supabase_rest_scriviacloud 2>$null

# Get the network name from another Supabase container
$network = docker inspect supabase_kong_scriviacloud --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>$null
if (-not $network) { $network = "scriviacloud_default" }

# Recreate with PGRST_DB_STATEMENT_TIMEOUT=600000 (10 min in ms)
docker run -d `
  --name supabase_rest_scriviacloud `
  --network $network `
  -e PGRST_DB_SCHEMAS=public,graphql_public `
  -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions `
  -e PGRST_DB_MAX_ROWS=1000 `
  -e PGRST_DB_ANON_ROLE=anon `
  -e PGRST_DB_URI=postgresql://authenticator:postgres@supabase_db_scriviacloud:5432/postgres `
  -e PGRST_DB_STATEMENT_TIMEOUT=600000 `
  -e PGRST_JWT_SECRET="{""keys"":[{""kty"":""EC"",""kid"":""b81269f1-21d8-4f2e-b719-c2240a840d90"",""use"":""sig"",""key_ops"":[""verify""],""alg"":""ES256"",""ext"":true,""crv"":""P-256"",""x"":""M5Sjqn5zwC9Kl1zVfUUGvv9boQjCGd45G8sdopBExB4"",""y"":""P6IXMvA2WYXSHSOMTBH2jsw_9rrzGy89FjPf6oOsIxQ""},{""kty"":""oct"",""k"":""c3VwZXItc2VjcmV0LWp3dC10b2tlbi13aXRoLWF0LWxlYXN0LTMyLWNoYXJhY3RlcnMtbG9uZw""}]}" `
  -e PGRST_ADMIN_SERVER_PORT=3001 `
  public.ecr.aws/supabase/postgrest:v16.1

Write-Output "PostgREST recreated with 10-minute statement timeout"
