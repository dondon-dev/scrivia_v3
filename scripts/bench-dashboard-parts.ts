/**
 * Per-part timing of the get_dashboard_summary engine (read-only).
 * Runs the same CTEs the function uses, individually timed, to find
 * which part is slow.
 *
 * Usage:
 *   bun scripts/bench-dashboard-parts.ts
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
const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';

async function runSql(query: string): Promise<{ ok: boolean; status: number; body: unknown; ms: number }> {
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

const SESSION = `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${SUPER}';`;

// The scope predicate the function uses for the global (NULL args) case.
const scopedWhere = `(
  (role = 'super_admin' AND (
    (NULL IS NULL OR '' = '' OR NULL IS NULL OR cardinality(NULL) = 0)
    OR division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = NULL AND d.division_code = ANY(NULL))
    OR (regcode = NULL AND divcode = ANY(NULL))
  ))
  OR (role <> 'super_admin' AND (division_id IS NULL OR division_id = division_id))
)`;

async function bench(name: string, body: string) {
  const r = await runSql(`${SESSION} ${body}`);
  console.log(`  ${name}: ${r.ms}ms ${r.ok ? '' : `❌ ${JSON.stringify(r.body).slice(0, 160)}`}`);
}

console.log('Per-part timing (global scope, super_admin):\n');

await bench('scoped_emps (employee filter + regex)',
  `SELECT count(*) FROM employees e JOIN profiles p ON p.id = (SELECT request.jwt.claim.sub::uuid) WHERE ${scopedWhere.replace('role', 'p.role')} AND true;`);

await bench('group_counts (range join on stacode)',
  `WITH active_emps AS (
     SELECT id, (CASE WHEN stacode ~ '^[0-9]+$' THEN NULLIF(stacode,'')::int END) AS stacode_num
     FROM employees WHERE status='Active'
   )
   SELECT count(*) FROM payroll_groups g LEFT JOIN active_emps e ON
     g.status='Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
     AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
   WHERE g.status='Active' AND g.stacode_min IS NOT NULL;`);

await bench('unassigned (NOT EXISTS)',
  `WITH active_emps AS (
     SELECT id, (CASE WHEN stacode ~ '^[0-9]+$' THEN NULLIF(stacode,'')::int END) AS stacode_num
     FROM employees WHERE status='Active'
   )
   SELECT count(*) FROM active_emps e
   WHERE e.stacode_num IS NULL OR NOT EXISTS (
     SELECT 1 FROM payroll_groups g
     WHERE g.status='Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
       AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
   );`);

await bench('entry_agg (payroll_entries ANY-scan)',
  `SELECT COALESCE(SUM(pe.gross_pay),0), COUNT(*) FROM payroll_entries pe
   WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM employees));`);

await bench('ded_totals (payroll_deductions)',
  `SELECT pd.dedcode, COUNT(*), SUM(pd.dedamt) FROM payroll_deductions pd
   LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
   WHERE pd.status='Active' AND pd.employee_id = ANY(ARRAY(SELECT id FROM employees))
   GROUP BY pd.dedcode, dc.dedname ORDER BY SUM(pd.dedamt) DESC LIMIT 8;`);

await bench('current_period (pay_periods, 2 rows)',
  `SELECT * FROM pay_periods ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC LIMIT 1;`);

await bench('periodNet',
  `SELECT COALESCE(SUM(pe.net_pay),0) FROM payroll_entries pe
   WHERE pe.pay_period_id = (SELECT id FROM pay_periods ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC LIMIT 1)
     AND pe.employee_id = ANY(ARRAY(SELECT id FROM employees));`);

await bench('recent_emps (order by created_at desc)',
  `SELECT id FROM employees ORDER BY created_at DESC LIMIT 5;`);

// EXPLAIN the whole function to see the dominant cost (timing ON)
console.log('\nEXPLAIN ANALYZE of the full function:');
const ex = await runSql(
  `${SESSION} EXPLAIN (ANALYZE, BUFFERS) SELECT get_dashboard_summary();`,
);
if (ex.ok) {
  const rows = ex.body as { 'QUERY PLAN': string }[];
  console.log(rows.map((r) => r['QUERY PLAN']).join('\n'));
} else {
  console.log(`explain: HTTP ${ex.status} ${JSON.stringify(ex.body).slice(0, 200)}`);
}
