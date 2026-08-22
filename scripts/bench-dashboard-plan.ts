/**
 * Compares server-side execution of the dashboard's entry aggregate under
 * three join styles, plus the full function, via EXPLAIN (ANALYZE, FORMAT JSON).
 *
 * Usage:
 *   bun scripts/bench-dashboard-plan.ts
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

const SESSION = `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${SUPER}';`;
const EXPLAIN = `EXPLAIN (ANALYZE, FORMAT JSON) `;

// 1) Raw shape dump for one query
const probe = await runSql(`${SESSION} ${EXPLAIN} SELECT count(*) FROM payroll_entries pe WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM employees));`);
console.log('RAW EXPLAIN response:', JSON.stringify(probe.body).slice(0, 2500), '\n');

async function bench(label: string, query: string) {
  const r = await runSql(query);
  if (!r.ok) { console.log(`${label}: ❌ ${JSON.stringify(r.body).slice(0, 200)}`); return; }
  const raw = r.body as { 'QUERY PLAN'?: string | Record<string, unknown> }[] | { message?: string };
  if (Array.isArray(raw) && raw[0]) {
    const plan = raw[0]['QUERY PLAN'];
    console.log(`${label}: ${typeof plan === 'string' ? plan.slice(0, 600) : JSON.stringify(plan).slice(0, 600)}`);
  } else {
    console.log(`${label}: ${JSON.stringify(raw).slice(0, 300)}`);
  }
}

console.log('---');
await bench('A: ANY(ARRAY(subquery))', `${SESSION} ${EXPLAIN} SELECT count(*) FROM payroll_entries pe WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM employees));`);
await bench('B: JOIN employees', `${SESSION} ${EXPLAIN} SELECT count(*) FROM payroll_entries pe JOIN employees e ON pe.employee_id = e.id;`);
await bench('C: IN (SELECT id)', `${SESSION} ${EXPLAIN} SELECT count(*) FROM payroll_entries pe WHERE pe.employee_id IN (SELECT id FROM employees);`);
await bench('D: get_dashboard_summary() full', `${SESSION} ${EXPLAIN} SELECT get_dashboard_summary();`);
