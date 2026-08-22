/**
 * Verifies the fast payroll history engine: server-side execution time
 * (EXPLAIN ANALYZE) and output parity vs the expected shape.
 * Usage: bun scripts/verify-history-engine.ts
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

const SESSION = `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${SUPER}'; `;

// Server-side execution time
const ex = await runSql(`${SESSION} EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM get_payroll_history_by_month(2026);`);
if (ex.ok) {
  const row = (ex.body as { 'QUERY PLAN': unknown }[])?.[0];
  const raw = row?.['QUERY PLAN'];
  const planArr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const top = (planArr as { 'Execution Time'?: number }[])?.[0];
  console.log(`Server execution time: ${top?.['Execution Time']?.toFixed(1)}ms`);
} else {
  console.log(`explain: ${JSON.stringify(ex.body).slice(0, 300)}`);
}

// Output parity — every column the frontend reads
const out = await runSql(`${SESSION} SELECT * FROM get_payroll_history_by_month(2026);`);
if (out.ok) {
  const rows = out.body as Record<string, unknown>[];
  console.log(`\nMonths: ${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.period_name} | status=${r.status} | employees=${r.employee_count} | gross=${r.total_gross} | ded=${r.total_deductions} | net=${r.total_net} | unded=${r.total_undeducted} | nthp ${r.nthp_pass_count}/${r.nthp_fail_count}`);
  }
  const keys = Object.keys(rows[0] ?? {}).sort();
  console.log(`\nColumns: ${keys.join(', ')}`);
} else {
  console.log(`output: ${JSON.stringify(out.body).slice(0, 300)}`);
}
