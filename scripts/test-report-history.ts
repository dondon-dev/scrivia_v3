/**
 * Tests the live get_payroll_history_by_month RPC (Report Center's Payroll
 * History tab) — timing, output, and RLS behavior for global vs scoped calls.
 * Usage: bun scripts/test-report-history.ts
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

// 1) Global scope, super_admin — same as the frontend's no-scope call
const g = await runSql(`${SESSION(SUPER)} SELECT * FROM get_payroll_history_by_month(2026);`);
console.log(`global (super_admin) 2026: ${g.ms}ms ${g.ok ? '✅' : `❌ ${JSON.stringify(g.body).slice(0, 300)}`}`);
if (g.ok) {
  const rows = g.body as { period_name?: string; status?: string; employee_count?: number }[];
  console.log(`  months returned: ${rows.length}`);
  rows.filter((r) => (r.employee_count ?? 0) > 0).slice(0, 5).forEach((r) =>
    console.log(`  ${r.period_name} status=${r.status} employees=${r.employee_count}`));
}

// 2) Division-scoped, payroll_admin — frontend passes regcode/divcode for scoped users
const d = await runSql(`${SESSION(ADMIN)} SELECT * FROM get_payroll_history_by_month(2026, '04A', '252');`);
console.log(`\ndiv-scoped (payroll_admin 04A/252) 2026: ${d.ms}ms ${d.ok ? '✅' : `❌ ${JSON.stringify(d.body).slice(0, 300)}`}`);
if (d.ok) {
  const rows = d.body as { employee_count?: number }[];
  console.log(`  months with data: ${rows.filter((r) => (r.employee_count ?? 0) > 0).length} / ${rows.length}`);
}

// 3) Timing detail for the global call (server-side)
const ex = await runSql(`${SESSION(SUPER)} EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM get_payroll_history_by_month(2026);`);
if (ex.ok) {
  const row = (ex.body as { 'QUERY PLAN': unknown }[])?.[0];
  const raw = row?.['QUERY PLAN'];
  const planArr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const top = (planArr as { 'Execution Time'?: number }[])?.[0];
  console.log(`\nserver-side execution: ${top?.['Execution Time']?.toFixed(1)}ms`);
} else {
  console.log(`\nexplain: ${JSON.stringify(ex.body).slice(0, 200)}`);
}
