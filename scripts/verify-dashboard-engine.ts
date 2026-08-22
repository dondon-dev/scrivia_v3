/**
 * Verifies the fast dashboard engine: server-side execution time (from
 * EXPLAIN ANALYZE) and output shape.
 * Usage: bun scripts/verify-dashboard-engine.ts
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

// 1) Server-side execution time
const ex = await runSql(`${SESSION} EXPLAIN (ANALYZE, FORMAT JSON) SELECT get_dashboard_summary();`);
if (ex.ok) {
  const row = (ex.body as { 'QUERY PLAN': unknown }[])?.[0];
  const raw = row?.['QUERY PLAN'];
  const planArr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const top = (planArr as { 'Execution Time'?: number }[])?.[0];
  console.log(`Server execution time: ${top?.['Execution Time']?.toFixed(1)}ms`);
} else {
  console.log(`explain: ${JSON.stringify(ex.body).slice(0, 200)}`);
}

// 2) Output shape + sample values (global scope)
const out = await runSql(`${SESSION} SELECT get_dashboard_summary() AS s;`);
if (out.ok) {
  const raw = (out.body as { s: string }[])?.[0]?.s;
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (s && typeof s === 'object') {
    const keys = Object.keys(s as Record<string, unknown>).sort();
    console.log(`\nOutput keys (${keys.length}): ${keys.join(', ')}`);
    const g = s as Record<string, unknown>;
    console.log(`  totalRecords=${g.totalRecords} activeEmployees=${g.activeEmployees} unassigned=${g.unassignedCount}`);
    console.log(`  activeLoans=${g.activeLoanAccounts} groups=${(g.groupStats as unknown[]).length} dedCodes=${(g.dedTotalsByCode as unknown[]).length}`);
    const cp = g.currentPeriod as { period_name?: string; status?: string } | null;
    console.log(`  currentPeriod=${cp?.period_name ?? '(none)'} status=${cp?.status ?? '—'} periodNet=${g.periodNet}`);
    console.log(`  recentEmployees=${(g.recentEmployees as unknown[]).length}`);
  } else {
    console.log(`unexpected output: ${JSON.stringify(out.body).slice(0, 300)}`);
  }
} else {
  console.log(`output: ${JSON.stringify(out.body).slice(0, 300)}`);
}
