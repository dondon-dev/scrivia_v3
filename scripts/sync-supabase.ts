/**
 * Syncs SQL migrations from supabase/migrations/ to the linked Supabase
 * project via the Management API — uses only a SUPABASE_ACCESS_TOKEN, so no
 * database password is required (unlike `supabase db push`).
 *
 * Only migrations whose version is not yet recorded in
 * supabase_migrations.schema_migrations are applied, in filename order.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx bun scripts/sync-supabase.ts
 *
 * Optional: SUPABASE_PROJECT_REF overrides the linked project ref (defaults
 * to supabase/.temp/project-ref).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN environment variable.');
  process.exit(1);
}

const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');

if (!projectRef) {
  console.error(
    'Missing SUPABASE_PROJECT_REF — run `supabase link` first or pass the env var.',
  );
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function runSql(query: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, body };
}

// Ensure the migration history table exists (matches the Supabase CLI layout).
const ensure = await runSql(
  'create table if not exists supabase_migrations.schema_migrations ' +
    '(version text primary key, name text, statements text[], executed_at timestamptz default now());',
);
if (!ensure.ok) {
  console.error('Could not ensure migration history table:');
  console.error(JSON.stringify(ensure.body, null, 2));
  process.exit(1);
}

const appliedRes = await runSql('select version from supabase_migrations.schema_migrations;');
if (!appliedRes.ok) {
  console.error('Could not read migration history:');
  console.error(JSON.stringify(appliedRes.body, null, 2));
  process.exit(1);
}
const applied = new Set((appliedRes.body as { version: string }[]).map((r) => r.version));

const dir = 'supabase/migrations';
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => {
    const m = file.match(/^(\d+)[_-](.+)\.sql$/);
    return {
      file,
      version: m ? m[1] : file,
      name: m ? m[2] : file,
      sql: readFileSync(join(dir, file), 'utf8'),
    };
  });

const pending = migrations.filter((m) => !applied.has(m.version));

if (pending.length === 0) {
  console.log(`All ${migrations.length} local migrations already applied — nothing to sync.`);
  process.exit(0);
}

console.log(`Project ${projectRef}: ${pending.length} pending migration(s) of ${migrations.length}:`);
for (const p of pending) console.log(`  ${p.file}`);

for (const p of pending) {
  process.stdout.write(`Applying ${p.file} ... `);
  const r = await runSql(p.sql);
  if (!r.ok) {
    console.log('FAILED');
    console.error(JSON.stringify(r.body, null, 2));
    process.exit(1);
  }
  // Record in migration history (duplicate versions — e.g. several 20260808_*
  // files — are tolerated with ON CONFLICT DO NOTHING, mirroring CLI behavior).
  const escapedName = p.name.replace(/'/g, "''");
  const rec = await runSql(
    `insert into supabase_migrations.schema_migrations (version, name) ` +
      `values ('${p.version}', '${escapedName}') on conflict (version) do nothing;`,
  );
  if (!rec.ok) {
    console.log('applied, but failed to record migration history:');
    console.error(JSON.stringify(rec.body, null, 2));
  } else {
    console.log('ok');
  }
}

console.log(`\nDone — ${pending.length} migration(s) synced to ${projectRef}.`);
