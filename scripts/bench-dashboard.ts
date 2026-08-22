/**
 * Dashboard engine diagnostic (read-only).
 *
 * 1. Lists applied migrations (supabase_migrations.schema_migrations).
 * 2. Checks the dashboard indexes exist.
 * 3. Checks which get_dashboard_summary implementation is deployed.
 * 4. Benchmarks get_dashboard_summary for the super_admin and a
 *    division-scoped payroll admin, timing each call.
 *
 * Usage:
 *   bun scripts/bench-dashboard.ts
 */
import { existsSync, readFileSync } from 'node:fs';

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
  console.error('Missing SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function runSql(query: string): Promise<{ ok: boolean; status: number; body: unknown }> {
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

const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4'; // super_admin
const ADMIN = 'f14791d7-89d6-44d3-baae-fee2f12de2c3'; // payroll_admin (division-scoped)

console.log(`Dashboard engine diagnostic → project ${projectRef}\n`);

// 1) Applied migrations
const mig = await runSql(
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`,
);
if (mig.ok) {
  const versions = (mig.body as { version: string }[] ?? []).map((r) => r.version);
  console.log(`Applied migrations (${versions.length}):`);
  for (const v of versions) console.log(`  ${v}`);
  const hasOpt = versions.some((v) => v.startsWith('20260819120000'));
  const hasScope = versions.some((v) => v.startsWith('20260815_scope_by_regcode'));
  const hasPeriod = versions.some((v) => v.startsWith('20260815_scope_dashboard_current_period'));
  console.log(
    `\nOptimize migration applied: ${hasOpt ? 'YES' : 'NO'}`,
    `| scope-by-regcode applied: ${hasScope ? 'YES' : 'NO'}`,
    `| scoped-current-period applied: ${hasPeriod ? 'YES' : 'NO'}`,
  );
} else {
  console.log(`migrations: HTTP ${mig.status} ${JSON.stringify(mig.body).slice(0, 150)}`);
}

// 2) Indexes
const idx = await runSql(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND indexname IN (
    'idx_employees_regcode_divcode', 'idx_audit_logs_created_at',
    'idx_payroll_entries_period', 'idx_payroll_entries_employee', 'idx_employees_status'
  ) ORDER BY indexname;`);
if (idx.ok) {
  const names = (idx.body as { indexname: string }[] ?? []).map((r) => r.indexname);
  console.log(`\nDashboard indexes present: ${names.join(', ') || '(none)'}`);
} else {
  console.log(`indexes: HTTP ${idx.status}`);
}

// 3) Deployed function implementation
const fn = await runSql(`
  SELECT p.prosecdef, p.provolatile,
         position('AS MATERIALIZED' in p.prosrc) > 0 AS has_materialized,
         position('employee_id = ANY' in p.prosrc) > 0 AS has_any_scan,
         position('stacode_num' in p.prosrc) > 0 AS has_stacode_num,
         length(p.prosrc) AS prosrc_len
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_summary';`);
if (fn.ok) {
  const rows = fn.body as { prosecdef: boolean; provolatile: string; has_materialized: boolean; has_any_scan: boolean; has_stacode_num: boolean; prosrc_len: number }[];
  if (rows.length === 0) {
    console.log('\nget_dashboard_summary: NOT FOUND in live DB');
  } else {
    const r = rows[0];
    console.log(`\nget_dashboard_summary deployed: security_definer=${r.prosecdef}, volatility=${r.provolatile}, len=${r.prosrc_len}`);
    console.log(`  optimized markers — AS MATERIALIZED: ${r.has_materialized}, ANY-scan: ${r.has_any_scan}, stacode_num: ${r.has_stacode_num}`);
    console.log(`  → deployed implementation is ${r.prosecdef && r.has_materialized ? 'THE FAST ENGINE (SECURITY DEFINER + MATERIALIZED)' : 'AN OLDER (slow) VERSION'}`);
  }
} else {
  console.log(`function: HTTP ${fn.status} ${JSON.stringify(fn.body).slice(0, 150)}`);
}

// 4) Table sizes
const sizes = await runSql(`
  SELECT 'employees' AS t, count(*) AS n FROM employees
  UNION ALL SELECT 'payroll_entries', count(*) FROM payroll_entries
  UNION ALL SELECT 'payroll_deductions', count(*) FROM payroll_deductions
  UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
  UNION ALL SELECT 'pay_periods', count(*) FROM pay_periods;`);
if (sizes.ok) {
  const rows = sizes.body as { t: string; n: number }[];
  console.log(`\nRow counts: ${rows.map((r) => `${r.t}=${r.n}`).join(', ')}`);
}

// 5) Benchmarks (read-only; the function is STABLE)
async function bench(label: string, sub: string, scope: string) {
  const t0 = Date.now();
  const r = await runSql(
    `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${sub}'; ${scope} SELECT get_dashboard_summary();`,
  );
  const ms = Date.now() - t0;
  if (r.ok) {
    console.log(`  ${label}: ${ms}ms`);
  } else {
    console.log(`  ${label}: FAILED after ${ms}ms — ${JSON.stringify(r.body).slice(0, 200)}`);
  }
}

console.log('\nBenchmarks (get_dashboard_summary):');
await bench('super_admin, global scope', SUPER, '');
await bench('super_admin, div 04A/252', SUPER, `SELECT set_config('request.jwt.claim.sub', '${SUPER}', false); `);
await bench('payroll_admin (own division)', ADMIN, '');
