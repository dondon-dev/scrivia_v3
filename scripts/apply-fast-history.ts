/**
 * Applies supabase/migrations/20260820_fast_payroll_history_engine.sql to the
 * live project, then re-benchmarks get_payroll_history_by_month.
 * Usage: bun scripts/apply-fast-history.ts
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
const migration = readFileSync('supabase/migrations/20260820_fast_payroll_history_engine.sql', 'utf8');
console.log('Applying fast payroll history engine…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 400)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Confirm SECURITY DEFINER + STABLE
const check = await runSql(
  `SELECT p.prosecdef, p.provolatile::text AS volatility, p.proconfig
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_payroll_history_by_month';`,
);
if (check.ok) {
  const row = (check.body as { prosecdef: boolean; volatility: string; proconfig: string[] | null }[])?.[0];
  const searchPath = (row?.proconfig ?? []).find((c) => c.startsWith('search_path'));
  console.log(`SECURITY DEFINER: ${row?.prosecdef === true ? 'YES ✅' : 'NO ❌'}  STABLE: ${row?.volatility === 's' ? 'YES ✅' : `NO ❌ (${row?.volatility})`}  ${searchPath ? 'search_path ✅' : 'search_path ❌'}`);
} else {
  console.log(`check: ${JSON.stringify(check.body).slice(0, 200)}`);
}

// 3) Re-benchmark
console.log('\nBenchmarks (after fix):');
const cases: [string, string, string][] = [
  ['super_admin, global scope', SUPER, 'SELECT * FROM get_payroll_history_by_month(2026);'],
  ['super_admin, div 04A/252', SUPER, `SELECT * FROM get_payroll_history_by_month(2026, '04A', '252');`],
  ['payroll_admin (own division)', ADMIN, 'SELECT * FROM get_payroll_history_by_month(2026);'],
];
for (const [label, sub, call] of cases) {
  const r = await runSql(`${SESSION(sub)} ${call}`);
  const rows = (r.body as unknown[] | null) ?? [];
  console.log(`  ${label}: ${r.ms}ms ${r.ok ? `✅ (${rows.length} months)` : `❌ ${JSON.stringify(r.body).slice(0, 200)}`}`);
}
