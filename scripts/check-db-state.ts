/** Read-only diagnostic — DB constraints/RPCs/triggers relevant to per-division periods and deletes. */
import { existsSync, readFileSync } from 'node:fs';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!TOKEN || !projectRef) { console.error('Missing token/ref'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
async function runSql(query: string) {
  const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const text = await res.text();
  let body: unknown = text; try { body = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, body };
}
const q = (label: string, query: string) => runSql(query).then((r) => {
  console.log(`\n── ${label}`);
  if (!r.ok) { console.log(`  ❌ ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`); return; }
  const rows = r.body as Record<string, unknown>[];
  if (!rows || rows.length === 0) { console.log('  (no rows)'); return; }
  rows.forEach((row) => console.log('  ' + JSON.stringify(row)));
});
await q('pay_periods indexes/constraints',
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'pay_periods' ORDER BY indexname;`);
await q('pay_periods constraints',
  `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid = 'pay_periods'::regclass ORDER BY conname;`);
await q('generate_monthly_periods signatures',
  `SELECT p.oid::regprocedure AS signature, p.prosecdef, p.provolatile::text AS volatility
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'generate_monthly_periods';`);
await q('payroll_entries triggers',
  `SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
   WHERE tgrelid = 'payroll_entries'::regclass AND NOT tgisinternal ORDER BY tgname;`);
await q('payroll_entries RLS policies',
  `SELECT policyname, cmd, roles::text, qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'payroll_entries' ORDER BY policyname;`);
await q('current pay_periods',
  `SELECT period_name, status, year, month, regcode, divcode,
          (SELECT count(*) FROM payroll_entries e WHERE e.pay_period_id = p.id) AS entries,
          (SELECT count(*) FROM payroll_entries e WHERE e.pay_period_id = p.id AND e.status = 'Posted') AS posted
   FROM pay_periods p ORDER BY year DESC, month DESC, created_at DESC;`);
await q('payroll_entries status split for August 2026',
  `SELECT status, count(*) FROM payroll_entries WHERE pay_period_id = '40136dea-25de-4c83-b0d6-23e902892f3a' GROUP BY status;`);
