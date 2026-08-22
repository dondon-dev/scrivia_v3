/**
 * Applies supabase/migrations/20260822_reverse_payroll_period_rpc.sql and
 * verifies the RPC reverses an OPEN posted period inside a rolled-back
 * transaction (no data touched).
 * Usage: bun scripts/apply-reverse-period.ts
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

// 1) Apply
const migration = readFileSync('supabase/migrations/20260822_reverse_payroll_period_rpc.sql', 'utf8');
console.log('Applying reverse_payroll_period RPC…');
const apply = await runSql(migration);
if (!apply.ok) {
  console.error(`❌ Apply failed (HTTP ${apply.status}): ${JSON.stringify(apply.body).slice(0, 600)}`);
  process.exit(1);
}
console.log('✅ Migration applied');

// 2) Verify on the live OPEN period (rolled back)
const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';
const PERIOD = '40136dea-25de-4c83-b0d6-23e902892f3a';
const probe = await runSql(`BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${SUPER}';
SELECT reverse_payroll_period('${PERIOD}'::uuid) AS out;
SELECT count(*) FILTER (WHERE status = 'Posted') AS posted,
       count(*) FILTER (WHERE status = 'Computed') AS computed
FROM payroll_entries WHERE pay_period_id = '${PERIOD}';
ROLLBACK;`);
if (!probe.ok) {
  console.error(`❌ probe failed: ${JSON.stringify(probe.body).slice(0, 400)}`);
  process.exit(1);
}
const batches = probe.body as unknown[];
for (const b of batches) {
  if (Array.isArray(b) && b.length > 0) console.log('  ' + JSON.stringify(b[0]));
}
console.log('✅ RPC executed inside a rolled-back transaction (no data touched)');
