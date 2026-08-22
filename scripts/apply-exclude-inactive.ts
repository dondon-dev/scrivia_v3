/**
 * Applies supabase/migrations/20260822_exclude_inactive_from_payroll.sql to the
 * live project and verifies:
 *   1. run_payroll_engine now filters status = 'Active' in all scope branches.
 *   2. Stale Computed rows / run deduction lines for Inactive employees are gone.
 *   3. Dashboard pending count for the current open period is back to 0.
 * Usage: bun scripts/apply-exclude-inactive.ts
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

// 1) Apply the migration
const migration = readFileSync('supabase/migrations/20260822_exclude_inactive_from_payroll.sql', 'utf8');
console.log('Applying exclude-inactive migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 600)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Verify the engine definition
const def = await runSql(`SELECT pg_get_functiondef('public.run_payroll_engine(uuid)'::regprocedure) AS def;`);
if (def.ok) {
  const d = (def.body as { def: string }[])?.[0]?.def ?? '';
  const checks: [string, boolean][] = [
    ["super_admin branch filters Active", d.includes("FROM employees WHERE status = 'Active';")],
    ["division branch filters Active", d.includes("AND e.divcode = d.divcode AND e.status = 'Active'")],
    ["compute loop filters Active", d.includes('ANY(v_employee_ids) AND e.status = \'Active\'')],
  ];
  for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!checks.every(([, ok]) => ok)) process.exit(1);
} else {
  console.log(`def check: ${JSON.stringify(def.body).slice(0, 300)}`);
}

// 3) Verify the cleanup
const clean = await runSql(`
  SELECT pp.period_name, pp.status AS period_status,
         (SELECT count(*) FROM payroll_entries pe
          JOIN employees e ON e.id = pe.employee_id
          WHERE pe.pay_period_id = pp.id AND e.status = 'Inactive') AS entries_inactive,
         (SELECT count(*) FROM deductions d
          JOIN employees e ON e.id = d.employee_id
          WHERE d.pay_period_id = pp.id AND e.status = 'Inactive') AS ded_lines_inactive
  FROM pay_periods pp WHERE pp.status <> 'closed' ORDER BY pp.year DESC, pp.month DESC;
`);
if (clean.ok) {
  console.log('Non-closed periods after cleanup:');
  for (const row of (clean.body as Record<string, unknown>[]) ?? []) console.log('  ' + JSON.stringify(row));
} else {
  console.log(`clean check: ${JSON.stringify(clean.body).slice(0, 300)}`);
}

// 4) Dashboard pending count for the current period
const pend = await runSql(`
  SELECT p.period_name, count(*) FILTER (WHERE pe.status = 'Computed') AS pending
  FROM pay_periods p
  LEFT JOIN payroll_entries pe ON pe.pay_period_id = p.id
  WHERE p.status <> 'closed'
  GROUP BY p.id, p.period_name ORDER BY p.year DESC, p.month DESC LIMIT 3;
`);
if (pend.ok) {
  console.log('Pending (Computed) counts per open period:');
  for (const row of (pend.body as Record<string, unknown>[]) ?? []) console.log('  ' + JSON.stringify(row));
}
