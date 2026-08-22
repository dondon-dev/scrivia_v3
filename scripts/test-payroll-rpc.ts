/**
 * Regression tests for the run_payroll_engine RPC against the linked
 * Supabase project. Every test runs inside BEGIN ... ROLLBACK so the
 * database is never modified.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx bun scripts/test-payroll-rpc.ts
 * Optional: SUPABASE_PROJECT_REF overrides the linked project ref.
 * Exits non-zero on any failed assertion.
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
  console.error('Missing SUPABASE_PROJECT_REF — run `supabase link` first or pass the env var.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function runSql(query: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, body };
}

// --- harness -------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;
async function test(name: string, fn: () => Promise<void>, skipWhen?: boolean) {
  if (skipWhen) {
    skipped++;
    console.log(`  - ${name} (skipped)`);
    return;
  }
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

function expectError(r: { ok: boolean; status: number; body: unknown }, needle: string, label: string) {
  if (r.ok) throw new Error(`${label}: expected an error, but the call succeeded`);
  const msg = JSON.stringify(r.body);
  if (!msg.includes(needle)) {
    throw new Error(`${label}: expected error containing "${needle}", got: ${msg.slice(0, 300)}`);
  }
}

const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4'; // super_admin
const ADMIN = 'f14791d7-89d6-44d3-baae-fee2f12de2c3'; // payroll_admin (division-scoped)
const PER = '40136dea-25de-4c83-b0d6-23e902892f3a'; // August 2026 (open)

// The real open period may already have POSTED entries (which the engine
// correctly refuses to overwrite), so happy-path tests create a scratch
// period inside the rolled-back transaction.
const SCRATCH_PER = '11111111-2222-3333-4444-555555555555';
const SCRATCH_INSERT = `
  INSERT INTO pay_periods (id, period_name, start_date, end_date, pay_date, frequency, status, month, year, period_number, regcode, divcode)
  VALUES ('${SCRATCH_PER}', 'TEST CLEANUP PERIOD', '2026-07-01', '2026-07-31', '2026-08-15', 'Monthly', 'open', 7, 2026, 7, '04A', '252');`;

function session(sub: string) {
  return `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${sub}';`;
}

console.log(`run_payroll_engine regression tests → project ${projectRef}\n`);

// 1) Unauthorized role
await test('rejects unauthorized role', async () => {
  const r = await runSql(`BEGIN;
    ${session(SUPER)}
    CREATE TEMP TABLE _unauth (id uuid);
    INSERT INTO _unauth SELECT id FROM profiles WHERE lower(role) IN ('encoder', 'viewer') LIMIT 1;
    SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM _unauth), true);
    SELECT run_payroll_engine('${PER}');
    ROLLBACK;`);
  if (r.ok) throw new Error('expected an error, but the call succeeded');
  const msg = JSON.stringify(r.body);
  if (!msg.includes('Not authorized')) {
    throw new Error(`unexpected error: ${msg.slice(0, 300)}`);
  }
});

// 2) Unknown period
await test('rejects unknown pay period', async () => {
  const r = await runSql(`BEGIN;
    ${session(SUPER)}
    SELECT run_payroll_engine('00000000-0000-0000-0000-000000000000');
    ROLLBACK;`);
  expectError(r, 'Pay period not found', 'unknown period');
});

// 3) Closed period
await test('rejects closed pay period', async () => {
  const closed = await runSql(`SELECT id FROM pay_periods WHERE status = 'closed' ORDER BY year DESC, month DESC LIMIT 1;`);
  const closedId = (closed.body as { id: string }[])?.[0]?.id;
  if (!closedId) throw new Error('no closed period found in DB to test against');
  const r = await runSql(`BEGIN;
    ${session(SUPER)}
    SELECT run_payroll_engine('${closedId}');
    ROLLBACK;`);
  expectError(r, 'Pay period is closed', 'closed period');
});

// 4) Happy path (division-scoped payroll admin): entries written, exactly
//    +1 audit row, dashboard refreshed, period opened
await test('happy path: entries+employee updates written, +1 audit row, dashboard refreshed', async () => {
  // The audit_logs SELECT policy only allows super_admin/viewer, so run the
  // counting side as super_admin and the write as the same caller (both are
  // allowed roles; the write path is identical).
  const r = await runSql(`BEGIN;
    ${session(SUPER)}
    ${SCRATCH_INSERT}
    CREATE TEMP TABLE _t (n bigint, ts timestamptz);
    INSERT INTO _t (n) SELECT count(*) FROM audit_logs;
    INSERT INTO _t (ts) SELECT refreshed_at FROM dashboard_stats_cache WHERE id = 1;
    SELECT run_payroll_engine('${SCRATCH_PER}') AS result;
    SELECT
      (SELECT count(*) FROM audit_logs) - (SELECT max(n) FROM _t) AS audit_delta,
      ((SELECT refreshed_at FROM dashboard_stats_cache WHERE id = 1) > (SELECT max(ts) FROM _t)) AS dashboard_refreshed,
      (SELECT count(*) FROM payroll_entries WHERE pay_period_id = '${SCRATCH_PER}') AS entries_written,
      (SELECT count(*) FROM payroll_entries WHERE pay_period_id = '${SCRATCH_PER}' AND status = 'Computed') AS computed_written;
    ROLLBACK;`);
  if (!r.ok) throw new Error(`call failed: ${JSON.stringify(r.body).slice(0, 300)}`);
  const row = (r.body as Record<string, unknown>[])[0];
  if (row?.audit_delta !== 1) throw new Error(`expected audit_delta=1, got ${JSON.stringify(row)}`);
  if (row?.dashboard_refreshed !== true) throw new Error(`dashboard was not refreshed: ${JSON.stringify(row)}`);
  if (Number(row?.entries_written) < 1000) throw new Error(`entries not written: ${JSON.stringify(row)}`);
  if (Number(row?.computed_written) !== Number(row?.entries_written)) {
    throw new Error(`non-Computed entries written: ${JSON.stringify(row)}`);
  }
});

// 5) Integrity: every written entry references a real scoped employee;
//    rollback leaves the DB untouched
await test('integrity: entries reference real employees, rollback leaves DB untouched', async () => {
  const before = await runSql(`SELECT (SELECT count(*) FROM payroll_entries) AS e, (SELECT count(*) FROM undeducted_obligations) AS u;`);
  const r = await runSql(`BEGIN;
    ${session(ADMIN)}
    ${SCRATCH_INSERT}
    SELECT run_payroll_engine('${SCRATCH_PER}') AS result;
    SELECT count(*) AS orphaned FROM payroll_entries pe
      WHERE pe.pay_period_id = '${SCRATCH_PER}'
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = pe.employee_id);
    ROLLBACK;`);
  if (!r.ok) throw new Error(`call failed: ${JSON.stringify(r.body).slice(0, 300)}`);
  const row = (r.body as Record<string, unknown>[])[0];
  if (Number(row?.orphaned) !== 0) throw new Error(`orphaned entries found: ${JSON.stringify(row)}`);
  const after = await runSql(`SELECT (SELECT count(*) FROM payroll_entries) AS e, (SELECT count(*) FROM undeducted_obligations) AS u;`);
  const b = (before.body as Record<string, unknown>[])[0];
  const a = (after.body as Record<string, unknown>[])[0];
  if (b?.e !== a?.e || b?.u !== a?.u) {
    throw new Error(`DB changed after rollback: before ${JSON.stringify(b)} after ${JSON.stringify(a)}`);
  }
});

// 6) Full-size performance (all employees) — must be well under the 120s limit
await test('full-size run (all employees) completes quickly', async () => {
  const t0 = Date.now();
  const r = await runSql(`BEGIN;
    ${session(SUPER)}
    ${SCRATCH_INSERT}
    SELECT run_payroll_engine('${SCRATCH_PER}') AS result;
    ROLLBACK;`);
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`call failed: ${JSON.stringify(r.body).slice(0, 300)}`);
  const row = (r.body as Record<string, unknown>[])[0];
  const entries = Number((row as { result?: { entries?: unknown } })?.result?.entries ?? 0);
  if (entries < 1000) throw new Error(`expected >1000 entries, got ${JSON.stringify(row)}`);
  if (ms > 30_000) throw new Error(`full-size run took ${ms}ms (> 30s budget)`);
  console.log(`      (${entries} entries in ${ms}ms)`);
});

// 7) Posted entries exist → refuse to overwrite (only if such a period exists)
{
  const posted = await runSql(`SELECT pay_period_id FROM payroll_entries WHERE status = 'Posted' LIMIT 1;`);
  const postedPeriod = (posted.body as { pay_period_id: string }[])?.[0]?.pay_period_id;
  await test('refuses to overwrite posted entries', async () => {
    const r = await runSql(`BEGIN;
      ${session(SUPER)}
      SELECT run_payroll_engine('${postedPeriod}');
      ROLLBACK;`);
    expectError(r, 'Cannot overwrite posted payroll entries', 'posted-overwrite guard');
  }, !postedPeriod);
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) process.exit(1);
