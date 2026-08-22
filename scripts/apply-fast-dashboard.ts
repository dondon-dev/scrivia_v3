/**
 * Applies supabase/migrations/20260819990000_fast_dashboard_engine.sql to the
 * live project, then re-benchmarks get_dashboard_summary to confirm the speedup.
 *
 * Usage:
 *   bun scripts/apply-fast-dashboard.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!projectRef) { console.error('Missing SUPABASE_PROJECT_REF.'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';
const ADMIN = 'f14791d7-89d6-44d3-baae-fee2f12de2c3';

async function runSql(query: string) {
  const t0 = Date.now();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
}

const SESSION = (sub: string) => `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${sub}'; `;

// 1) Apply the migration
const migration = readFileSync('supabase/migrations/20260819990000_fast_dashboard_engine.sql', 'utf8');
console.log('Applying fast dashboard engine migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 400)}`);
  process.exit(1);
}
console.log(`✅ Migration applied (${apply.ms}ms)`);

// 2) Confirm SECURITY DEFINER is now set
const check = await runSql(
  `SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_summary';`,
);
if (check.ok) {
  const definer = (check.body as { prosecdef: boolean }[])?.[0]?.prosecdef;
  console.log(`get_dashboard_summary SECURITY DEFINER: ${definer === true ? 'YES' : 'NO'} ` +
    (definer === true ? '✅' : '❌ — expected true'));
} else {
  console.log(`check: ${JSON.stringify(check.body).slice(0, 200)}`);
}

// 3) Re-benchmark
console.log('\nBenchmarks (get_dashboard_summary, after fix):');
const cases: [string, string, string][] = [
  ['super_admin, global scope', SUPER, 'SELECT get_dashboard_summary();'],
  ['super_admin, div 04A/252', SUPER, `SELECT get_dashboard_summary(NULL, '04A', ARRAY['252']);`],
  ['payroll_admin (own division)', ADMIN, 'SELECT get_dashboard_summary();'],
];
for (const [label, sub, call] of cases) {
  const r = await runSql(`${SESSION(sub)} ${call}`);
  console.log(`  ${label}: ${r.ms}ms ${r.ok ? '' : `❌ ${JSON.stringify(r.body).slice(0, 200)}`}`);
}
