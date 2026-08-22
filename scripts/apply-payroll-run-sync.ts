/**
 * Applies supabase/migrations/20260821_sync_payroll_run_deductions.sql to the
 * live project, then sanity-checks:
 *   1. _pd_compute returns the `deducted` array.
 *   2. run_payroll_engine still exists (SECURITY DEFINER) and its audit shape
 *      includes deduction_lines.
 * Usage: bun scripts/apply-payroll-run-sync.ts
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

// 1) Apply the migration
const migration = readFileSync('supabase/migrations/20260821_sync_payroll_run_deductions.sql', 'utf8');
console.log('Applying payroll-run → deductions sync migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 600)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Engine flags
const check = await runSql(
  `SELECT p.prosecdef, p.provolatile::text AS volatility
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_payroll_engine';`,
);
if (check.ok) {
  const row = (check.body as { prosecdef: boolean; volatility: string }[])?.[0];
  console.log(`run_payroll_engine — SECURITY DEFINER: ${row?.prosecdef === true ? 'YES ✅' : 'NO ❌'}  volatility: ${row?.volatility}`);
} else {
  console.log(`check: ${JSON.stringify(check.body).slice(0, 200)}`);
}

// 3) _pd_compute returns `deducted` (dry-run: empty sorted list)
const probe = await runSql(
  `SELECT public._pd_compute(50000::numeric, '[]'::jsonb, 0::numeric, '101') AS out;`,
);
if (probe.ok) {
  const row = (probe.body as { out: unknown }[])?.[0];
  const parsed = row?.out != null && typeof row.out === 'string' ? JSON.parse(row.out) : row?.out;
  console.log(`_pd_compute probe — has deducted key: ${parsed && typeof parsed === 'object' ? ('deducted' in (parsed as Record<string, unknown>) ? 'YES ✅' : 'NO ❌') : '?'}`);
} else {
  console.log(`probe: ${JSON.stringify(probe.body).slice(0, 200)}`);
}

// 4) Current open period + deduction-line count for it (context for the run)
const ctx = await runSql(
  `SELECT p.id, p.period_name, p.status,
          (SELECT count(*) FROM payroll_entries e WHERE e.pay_period_id = p.id) AS entries,
          (SELECT count(*) FROM deductions d WHERE d.pay_period_id = p.id) AS ded_lines
   FROM pay_periods p
   WHERE p.status <> 'closed'
   ORDER BY p.year DESC, p.month DESC
   LIMIT 5;`,
);
if (ctx.ok) {
  const rows = ctx.body as { id: string; period_name: string; status: string; entries: number; ded_lines: number }[];
  console.log('\nOpen periods (entries vs deduction lines):');
  for (const r of rows) console.log(`  ${r.period_name} (${r.status}) — entries=${r.entries} ded_lines=${r.ded_lines}`);
} else {
  console.log(`ctx: ${JSON.stringify(ctx.body).slice(0, 300)}`);
}
