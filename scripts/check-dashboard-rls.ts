/**
 * Inspects the RLS helper functions and policies that slow down the dashboard.
 * Usage: bun scripts/check-dashboard-rls.ts
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

const fn = await runSql(`
  SELECT p.proname, p.provolatile, p.prosecdef, l.lanname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname IN (
    'is_data_admin','get_current_user_role','get_current_user_divcode',
    'get_current_user_stacode','get_current_user_empno','get_current_user_division',
    'auth_scope_clause','get_dashboard_summary'
  ) ORDER BY p.proname;`);
if (fn.ok) {
  const rows = fn.body as { proname: string; provolatile: string; prosecdef: boolean; lanname: string }[];
  console.log('Helper function volatility (v=volatile, s=stable, i=immutable):');
  for (const r of rows) console.log(`  ${r.proname}: ${r.provolatile === 'v' ? 'VOLATILE' : r.provolatile === 's' ? 'STABLE' : 'IMMUTABLE'} (${r.lanname}, definer=${r.prosecdef})`);
} else {
  console.log(`functions: ${JSON.stringify(fn.body).slice(0, 200)}`);
}

const pol = await runSql(`
  SELECT tablename, policyname, cmd
  FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('employees','payroll_entries','payroll_deductions','pay_periods','payroll_groups','deduction_codes','divisions','regions','profiles')
  ORDER BY tablename;`);
if (pol.ok) {
  const rows = pol.body as { tablename: string; policyname: string; cmd: string }[];
  console.log(`\nRLS policies on dashboard tables (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.tablename}.${r.policyname} [${r.cmd}]`);
} else {
  console.log(`policies: ${JSON.stringify(pol.body).slice(0, 200)}`);
}
