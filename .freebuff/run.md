# Run Doc — scriviacloud

## Reproduce uncommitted artifacts

This thread's workspace is the main checkout (`C:\scriviacloudV2`), so no env file copying is needed.

Dependencies are pre-installed (`node_modules/` present with `bun.lock` and `package-lock.json`). If starting fresh:

```bash
npm install
```

## Run the dev server

```bash
npm run dev
```

This runs `vite --host localhost --port 5173 --strictPort` (configured in `package.json`).

## Current state (2026-09-04)

Two Vite dev servers coexist on port 5173, started at login:

- **Frontend copy (Preview target):** `node ...frontend\node_modules\vite\bin\vite.js --host localhost --port 5173 --strictPort`
  — serves `frontend/src`, bound to `[::1]:5173`. `http://localhost:5173` resolves here (IPv6 first), so the browser/Preview app is the **frontend** tree. This is the live copy all feature work is verified against.
- **Root copy:** `node node_modules\vite\bin\vite.js --host --port 5173` — serves the root `src/` tree, bound to `0.0.0.0:5173` (IPv4 `127.0.0.1`).

PocketBase (`pocketbase_bin\pocketbase.exe serve`) listens on `127.0.0.1:8090`. Do NOT start another Vite on 5173 (`strictPort` will fail); if the frontend server is down, relaunch it from the `frontend/` directory.

## Auto-start on Windows login

A VBS launcher in the Windows Startup folder starts all services automatically:

- **File:** `C:\Users\adona\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\StartScrivia.vbs`
- **Source:** `.freebuff/StartScrivia.vbs`

On login, the script:
1. Starts Supabase with `supabase start --hostname 127.0.0.1`
2. Waits 30s for Docker containers
3. Runs `supabase db reset --local` (DB synced to migration files)
4. Sets statement timeout to 10 minutes (prevents payroll timeout)
5. Starts sync watcher (checks for Studio changes every 5 min)
6. Starts Vite dev server on `127.0.0.1:5173`

## Supabase Studio ↔ Local Migrations Sync

| Direction | Trigger | What happens |
|-----------|---------|-------------|
| Migrations → DB | Startup / `db reset --local` | DB rebuilt from migration files |
| DB → Migrations | Every 5 min (background) | `supabase db diff` detects Studio changes, auto-generates migration |

### Sync watcher fix (2026-08-22)

The watcher (`sync-watcher.ps1`) was capturing stderr mixed into the SQL diff output,
causing corrupted `studio_sync.sql` files with log messages like `node.exe : Creating shadow database...`. 
Fixed by redirecting stderr to a temp file and only writing stdout to the migration file.
The file is also validated to start with a SQL keyword (CREATE/ALTER/DO/etc.) before writing.

## Security Hardening

### Function Security
- **SECURITY DEFINER** (9 functions): Role-checking functions that query `profiles` table — must be DEFINER to avoid RLS recursion
- **SECURITY INVOKER** (38 functions): All other RPC functions — safe, no auth-table recursion
- **Trigger-only** (11 functions): EXECUTE revoked from all roles — only callable by PostgreSQL triggers
- **PUBLIC/Anon EXECUTE** revoked on all SECURITY DEFINER functions

### RLS Policy Hardening
- 94 always-true policies replaced with `auth.role() = 'authenticated'` checks
- Read-only lookup tables (regions, divisions, etc.) allow both anon and authenticated
- FORCE RLS enabled on 9 sensitive tables

### Statement Timeout
- Database default: `10min`
- `authenticator` role: `10min`
- `authenticated` role: `10min`

## Service Ports

| Service | Host | Port |
|---------|------|------|
| Vite dev server | 127.0.0.1 | 5173 |
| Supabase API (Kong) | 127.0.0.1 | 54321 |
| Supabase DB (PostgreSQL) | 127.0.0.1 | 54322 |
| Supabase Studio | 127.0.0.1 | 54323 |
| Supabase Email (Inbucket) | 127.0.0.1 | 54324 |
| Supabase Analytics | 127.0.0.1 | 54327 |

## Credentials
- **Super Admin:** `adonaimagno@gmail.com` / `Admin123!`
