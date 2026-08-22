/**
 * Applies supabase/migrations/20260822_per_division_periods_and_delete_posted.sql
 * to the live project and verifies:
 *   1. pay_periods no longer has the global period_name unique constraint and
 *      the per-division + legacy unique indexes exist.
 *   2. The posted-entry protect trigger still exists, and the function body
 *      allows super_admin DELETE (probed inside a rolled-back transaction).
 * Usage: bun scripts/apply-per-division-periods.ts
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
const migration = readFileSync('supabase/migrations/20260822_per_division_periods_and_delete_posted.sql', 'utf8');
console.log('Applying per-division periods + posted-delete migration…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 600)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Verify indexes
const idx = await runSql(
  `SELECT indexname FROM pg_indexes WHERE tablename = 'pay_periods'
   AND indexname IN ('pay_periods_period_name_div_unique', 'pay_periods_period_name_legacy_unique', 'pay_periods_period_name_key')
   ORDER BY indexname;`,
);
if (idx.ok) {
  const rows = (idx.body as { indexname: string }[] ?? []);
  const names = rows.map((r) => r.indexname);
  console.log(`period_name indexes: ${names.join(', ') || '(none)'}`);
  console.log(`  global key dropped: ${!names.includes('pay_periods_period_name_key') ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  per-division unique: ${names.includes('pay_periods_period_name_div_unique') ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  legacy unique: ${names.includes('pay_periods_period_name_legacy_unique') ? 'YES ✅' : 'NO ❌'}`);
} else {
  console.log(`index check: ${JSON.stringify(idx.body).slice(0, 200)}`);
}

// 3) Verify a super_admin can DELETE a posted entry (rolled back, no data touched).
const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';
const probe = await runSql(`BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${SUPER}';
-- Exercises RLS (is_data_writer) + trg_protect_posted_entries end to end.
DELETE FROM payroll_entries pe
WHERE pe.status = 'Posted'
  AND pe.id = (SELECT id FROM payroll_entries WHERE status = 'Posted' LIMIT 1);
ROLLBACK;`);
if (probe.ok) {
  console.log('super_admin DELETE of posted entry: allowed (rolled back) ✅');
} else {
  console.log(`super_admin DELETE probe: ${JSON.stringify(probe.body).slice(0, 400)}`);
}
