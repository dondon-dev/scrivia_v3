/**
 * Applies supabase/migrations/20260822_fast_payroll_engine.sql and verifies:
 *   1. The live function contains the timeout guard + temp table + lookup.
 *   2. Parity: scripts/test-payroll-engine-parity.ts (engine vs TS client).
 *   3. Timing: full run for August 2026 inside a rolled-back transaction.
 * Usage: bun scripts/apply-fast-engine.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
const migration = readFileSync('supabase/migrations/20260822_fast_payroll_engine.sql', 'utf8');
console.log('Applying fast payroll engine migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 700)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Markers in the live function
const def = await runSql(`SELECT pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure) AS def;`);
if (def.ok) {
  const d = (def.body as { def: string }[])?.[0]?.def ?? '';
  const checks: [string, boolean][] = [
    ['statement_timeout guard', d.includes("SET LOCAL statement_timeout = '10 min'")],
    ['temp table preload', d.includes('CREATE TEMP TABLE _active_deds')],
    ['temp table index', d.includes('CREATE INDEX _active_deds_emp_idx')],
    ['loop uses temp lookup', d.includes('WHERE d.emp_id = r_emp.id')],
    ['old loop query removed', (d.match(/FROM payroll_deductions d/g) ?? []).length === 1],
  ];
  for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!checks.every(([, ok]) => ok)) process.exit(1);
} else {
  console.log(`def check: ${JSON.stringify(def.body).slice(0, 300)}`);
}

// 3) Parity (engine vs TypeScript client computation)
console.log('\nRunning parity test…');
const parity = spawnSync('bun', ['scripts/test-payroll-engine-parity.ts'], { encoding: 'utf8', timeout: 150_000 });
console.log(parity.stdout?.slice(-1200) ?? '');
if (parity.status !== 0) {
  console.error(`❌ parity failed (exit ${parity.status}): ${parity.stderr?.slice(-500) ?? ''}`);
  process.exit(1);
}
console.log('✅ Parity OK');

// 4) Timing: full run for the period inside a rolled-back transaction
console.log('\nTiming full run (rolled back, no data touched)…');
const t0 = Date.now();
const timing = await runSql(`BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';
SELECT run_payroll_engine('40136dea-25de-4c83-b0d6-23e902892f3a'::uuid) AS out;
ROLLBACK;`);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
if (timing.ok) {
  const batches = timing.body as unknown[];
  const out = batches?.find((b) => Array.isArray(b) && (b as unknown[]).length > 0 && typeof (b as unknown[])[0] === 'object' && (b as Record<string, unknown>[])[0]?.out) as Record<string, unknown>[] | undefined;
  console.log(`  full run completed in ${elapsed}s`);
  if (out?.[0]?.out) console.log(`  ${JSON.stringify(out[0].out).slice(0, 300)}`);
} else {
  console.log(`  ❌ full run failed: ${JSON.stringify(timing.body).slice(0, 400)}`);
}
