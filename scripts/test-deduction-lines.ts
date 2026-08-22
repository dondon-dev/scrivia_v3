/**
 * Validates the deduction-line INSERT block added to run_payroll_engine
 * against the live DB — inside a transaction that is ROLLED BACK, so no
 * production data is touched. Simulates one employee's lines with values
 * shaped exactly like the engine produces, then checks the resulting rows
 * are in stored order and sum to the expected total.
 *
 * Usage: bun scripts/test-deduction-lines.ts
 */
import { existsSync, readFileSync } from 'node:fs';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!TOKEN || !projectRef) { console.error('Missing token/ref'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
async function runSql(query: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text; try { body = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, body };
}

// Pick a real employee + period, then simulate the engine's insert verbatim.
const sql = `
BEGIN;

-- one employee from the current period
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT e.employee_id AS emp_id, e.pay_period_id AS period_id
FROM payroll_entries e
JOIN employees em ON em.id = e.employee_id
WHERE e.status = 'Computed'
LIMIT 1;

INSERT INTO deductions (employee_id, pay_period_id, deduction_code, deduction_name, category, amount, source, reference, created_at)
SELECT
  t.emp_id, t.period_id, x.dedcode, x.dedname, x.category,
  round(x.amount, 2), 'Payroll Run', 'test-entry-id',
  now() + (x.ord * interval '1 microsecond')
FROM (
  SELECT '0003' AS dedcode, 'GSIS PERSONAL SHARE' AS dedname, 'Mandatory' AS category, 2434.50 AS amount, 1 AS ord
  UNION ALL SELECT '0036', 'WITHHOLDING TAX', 'Mandatory', 987.12, 2
  UNION ALL SELECT '0111', 'PHILHEALTH', 'Mandatory', 675.00, 3
  UNION ALL SELECT '0222', 'PAGIBIG FUND', 'Mandatory', 200.00, 4
  UNION ALL SELECT m->>'dedcode', COALESCE(m->>'dedname', m->>'dedcode'), 'Loan',
                round(COALESCE((m->>'dedamt')::numeric, 0), 2), 5
           FROM jsonb_array_elements('[{"dedcode":"0336","dedname":"PAGIBIG MULTI PURPOSE LOAN","dedamt":1500},{"dedcode":"0122","dedname":"GSIS MPL","dedamt":2500}]'::jsonb) m
  UNION ALL SELECT d->>'dedcode', COALESCE(d->>'dedname', d->>'dedcode'), 'Loan',
                round(COALESCE((d->>'dedamt')::numeric, 0), 2), 6
           FROM jsonb_array_elements('[{"dedcode":"0007","dedname":"GSIS EMERGENCY LOAN","dedamt":1200}]'::jsonb) d
) x
CROSS JOIN _t t
WHERE x.amount > 0
ORDER BY x.ord;

SELECT deduction_code, deduction_name, category, amount,
       to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS stamped
FROM deductions d
WHERE d.source = 'Payroll Run' AND d.reference = 'test-entry-id'
ORDER BY created_at;

ROLLBACK;
`;

const r = await runSql(sql);
if (!r.ok) { console.error(`❌ ${r.status}: ${JSON.stringify(r.body).slice(0, 600)}`); process.exit(1); }
// The endpoint returns an array per statement; find the SELECT result.
const batches = r.body as unknown[];
const selectBatch = batches?.find((b) => Array.isArray(b) && (b as unknown[]).some((row) => typeof row === 'object' && row !== null && 'deduction_code' in (row as Record<string, unknown>)));
if (!selectBatch) { console.log('No select batch found; raw:'); console.log(JSON.stringify(batches).slice(0, 800)); process.exit(1); }
const rows = selectBatch as { deduction_code: string; deduction_name: string; category: string; amount: number; stamped: string }[];
let sum = 0;
rows.forEach((row, i) => {
  sum += Number(row.amount);
  console.log(`  ${i + 1}. ${row.deduction_code}  ${row.deduction_name}  ${row.category}  ${row.amount}  @ ${row.stamped}`);
});
const expected = 2434.50 + 987.12 + 675.00 + 200.00 + 1500 + 2500 + 1200;
console.log(`\nTotal: ${sum.toFixed(2)} (expected ${expected.toFixed(2)}) ${Math.abs(sum - expected) < 0.01 ? '✅' : '❌'}`);
console.log(`Order: ${rows.every((r, i) => i === 0 || rows[i - 1].stamped < r.stamped) ? 'monotonic ✅' : 'NOT monotonic ❌'}`);
console.log('(transaction rolled back — no production data touched)');
