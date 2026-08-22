/**
 * Diagnoses the live DB state behind the Scrivia Report Center.
 * Checks: RPC existence + signatures, report tables, row counts, freshness.
 * Usage: bun scripts/check-report-center-db.ts
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

const q = (label: string, query: string) =>
  runSql(query).then((r) => {
    console.log(`\n── ${label}`);
    if (!r.ok) { console.log(`  ❌ ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`); return; }
    const rows = r.body as Record<string, unknown>[];
    if (!rows || rows.length === 0) { console.log('  (no rows)'); return; }
    rows.forEach((row) => console.log('  ' + JSON.stringify(row)));
  });

// 1) RPC existence + signatures
await q('get_payroll_history_by_month signatures',
  `SELECT p.oid::regprocedure AS signature, p.prosecdef, p.provolatile::text AS volatility
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_payroll_history_by_month';`);

// 2) All RPCs referenced by Reports.tsx
await q('report-related RPCs',
  `SELECT p.proname, pg_get_function_arguments(p.oid) AS args
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_payroll_history_by_month', 'get_dashboard_summary', 'run_payroll')
   ORDER BY p.proname;`);

// 3) Tables the Report Center reads
await q('report tables present?',
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('employees','pay_periods','payroll_entries','deductions','payroll_deductions',
                     'undeducted_obligations','deduction_codes','payroll_groups','report_history','reports')
   ORDER BY tablename;`);

// 4) Row counts + freshness
await q('row counts & last write',
  `SELECT 'employees' AS t, count(*) AS rows, max(updated_at) AS last_write FROM employees
   UNION ALL SELECT 'payroll_deductions', count(*), max(updated_at) FROM payroll_deductions
   UNION ALL SELECT 'payroll_entries', count(*), max(updated_at) FROM payroll_entries
   UNION ALL SELECT 'deductions', count(*), max(updated_at) FROM deductions
   UNION ALL SELECT 'undeducted_obligations', count(*), max(updated_at) FROM undeducted_obligations
   UNION ALL SELECT 'pay_periods', count(*), max(updated_at) FROM pay_periods;`);

// 5) Pay periods by status (what the history view summarizes)
await q('pay_periods summary',
  `SELECT year, month, status, count(*) AS cnt, count(*) FILTER (WHERE updated_at IS NOT NULL) AS touched
   FROM pay_periods GROUP BY year, month, status ORDER BY year DESC, month DESC LIMIT 20;`);
