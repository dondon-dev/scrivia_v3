/**
 * Applies supabase/migrations/20260822_drop_run_payroll_bulk.sql and verifies:
 *   1. run_payroll_bulk is gone.
 *   2. run_payroll_engine still exists and is the fast version.
 *   3. A full engine run still completes quickly (rolled back).
 * Usage: bun scripts/apply-drop-bulk.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!projectRef) { console.error('Missing SUPABASE_PROJECT_REF.'); process.exit(1); }

const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function runSql(query: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, body };
}

// 1) Apply
const migration = readFileSync('supabase/migrations/20260822_drop_run_payroll_bulk.sql', 'utf8');
console.log('Applying drop run_payroll_bulk migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 600)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Verify functions
const fns = await runSql(`
  SELECT p.proname, p.oid::regprocedure AS sig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('run_payroll_engine', 'run_payroll_bulk')
  ORDER BY p.proname;
`);
if (fns.ok) {
  const rows = (fns.body as { proname: string; sig: string }[] ?? []);
  console.log('Live engine functions:', rows.map((r) => r.proname).join(', ') || '(none)');
  console.log(`  run_payroll_bulk removed: ${!rows.some((r) => r.proname === 'run_payroll_bulk') ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  run_payroll_engine present: ${rows.some((r) => r.proname === 'run_payroll_engine') ? 'YES ✅' : 'NO ❌'}`);
} else {
  console.log(`fn check: ${JSON.stringify(fns.body).slice(0, 300)}`);
}

// 3) Full engine run timing (rolled back, current Computed state)
const t0 = Date.now();
const timing = await runSql(`BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';
SELECT run_payroll_engine('40136dea-25de-4c83-b0d6-23e902892f3a'::uuid) AS out;
ROLLBACK;`);
console.log(`  full engine run: ${timing.ok ? `✅ ${((Date.now() - t0) / 1000).toFixed(1)}s (under 30s pre-set timeout)` : `❌ ${JSON.stringify(timing.body).slice(0, 300)}`}`);
