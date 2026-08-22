/**
 * Parity test: run_payroll_engine (server-side) must produce the same
 * entries as the client-side TypeScript computation (src/lib/payroll.ts +
 * src/lib/nthp.ts) for the same employees, deductions and pay period.
 *
 * Runs the engine inside a rolled-back transaction, reads back the
 * written entries for a sample of employees, and compares every field
 * (tolerance ±0.01). Exits non-zero on any mismatch.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx bun scripts/test-payroll-engine-parity.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { computePayrollDeductions } from '../src/lib/payroll';
import { processEmployeeDeductions } from '../src/lib/nthp';

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
const ADMIN = 'f14791d7-89d6-44d3-baae-fee2f12de2c3';
const PER = '40136dea-25de-4c83-b0d6-23e902892f3a'; // August 2026
const SAMPLE = 60;

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

// port of isDeductionActive (src/views/DeductionMasterfile.tsx)
function toFullYear(yy: number): number {
  return yy < 100 ? 2000 + yy : yy;
}
function isDeductionActive(d: Record<string, unknown>, payYY: number, payMM: number): boolean {
  const status = String(d.status ?? '');
  if (status === 'Terminated' || status === 'T') return false;
  const payYM = toFullYear(payYY) * 100 + payMM;
  const effYM = toFullYear(Number(d.effyy) || 0) * 100 + (Number(d.effmm) || 0);
  if (payYM < effYM) return false;
  const teryy = Number(d.teryy) || 0;
  const termm = Number(d.termm) || 0;
  if (teryy > 0 && termm > 0) {
    const termYM = toFullYear(teryy) * 100 + termm;
    if (payYM > termYM) return false;
  }
  return true;
}

const num = (v: unknown): number => Number(v) || 0;

// 1) fetch real data
console.log('Fetching real data…');
const employees = (await runSql(
  `SELECT id, empno, employee_number, basic, basic_salary, pera, aca, rata, ontop, long, stacode FROM employees ORDER BY id`,
)).body as Record<string, unknown>[];
const deductions = (await runSql(
  `SELECT id, employee_id, empno, dedcode, agency, type, status, effmm, effyy, termm, teryy, dedamt FROM payroll_deductions`,
)).body as Record<string, unknown>[];
const codes = (await runSql(
  `SELECT dedcode, dedname, agency, type FROM deduction_codes`,
)).body as Record<string, unknown>[];
const period = (await runSql(
  `SELECT year, month, pay_date FROM pay_periods WHERE id = '${PER}'`,
)).body as Record<string, unknown>[];

if (!employees?.length || !deductions?.length) {
  console.error('No data fetched — aborting.');
  process.exit(1);
}
const payYY = Number(period[0].year);
const payMM = Number(period[0].month);
const payDate = period[0].pay_date ?? null;

const dedCodeMap = new Map<string, { dedcode: string; dedname: string; agency: string; type: string }>();
for (const c of codes ?? []) {
  dedCodeMap.set(String(c.dedcode), {
    dedcode: String(c.dedcode),
    dedname: String(c.dedname ?? c.dedcode),
    agency: String(c.agency ?? ''),
    type: String(c.type ?? ''),
  });
}

// 2) client-side computation for the sample (mirrors Payroll.tsx runPayroll)
const sample = employees.slice(0, SAMPLE);
const sampleIds = sample.map((e) => e.id);
const empByEmpno = new Map<string, Record<string, unknown>>();
for (const e of employees) {
  const n = String(e.empno ?? e.employee_number ?? '').trim();
  if (n) empByEmpno.set(n, e);
}
const activeByEmp = new Map<string, Record<string, unknown>[]>();
for (const d of deductions) {
  if (!isDeductionActive(d, payYY, payMM)) continue;
  let empId = String(d.employee_id ?? '');
  if (!empId) {
    const emp = empByEmpno.get(String(d.empno ?? '').trim());
    if (emp) empId = String(emp.id);
  }
  if (!empId) continue;
  const arr = activeByEmp.get(empId) ?? [];
  arr.push(d);
  activeByEmp.set(empId, arr);
}

const tsResults = new Map<string, Record<string, unknown>>();
for (const e of sample) {
  const computed = computePayrollDeductions(
    num(e.basic ?? e.basic_salary ?? 0), num(e.pera), num(e.aca), num(e.rata), num(e.ontop), num(e.long), 0,
  );
  const nthp = processEmployeeDeductions(
    computed.netBeforeLoans,
    (activeByEmp.get(String(e.id)) ?? []) as never,
    dedCodeMap as never,
    String(e.stacode ?? ''),
  );
  const actualLoansTotal = nthp.actualLoanDeductions + nthp.mandatoryLoanDeductions;
  tsResults.set(String(e.id), {
    gross_pay: computed.gross,
    total_deductions: computed.mandatoryDeductions + actualLoansTotal,
    net_pay: nthp.finalNetPay,
    dedlnr: computed.dedlnr, dedmed: computed.dedmed, dedpag: computed.dedpag, dedtax: computed.dedtax,
    govtlnr: computed.govtlnr, govtecc: computed.govtecc, govtmed: computed.govtmed, govtpag: computed.govtpag,
    other_deductions: actualLoansTotal,
    actual_loan_deductions: actualLoansTotal,
    undeducted_amount: nthp.undeductedObligations.reduce((s, u) => s + u.undeducted_amount, 0),
    mandatory_deductions: computed.mandatoryDeductions,
    available_balance: nthp.availableBalance,
    loan_deduction_capacity: nthp.loanDeductionCapacity,
    nthp_status: nthp.nthpStatus,
    unded: nthp.undeductedObligations.map((u) => ({ code: u.deduction_code, amount: u.undeducted_amount, scheduled: u.scheduled_amount })),
  });
}

// 3) run the engine (rolled back) and read back the sample entries
const ids = `ARRAY[${sampleIds.map((i) => `'${i}'::uuid`).join(',')}]`;
const out = await runSql(`BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${ADMIN}';
SELECT run_payroll_engine('${PER}') AS summary;
SELECT jsonb_agg(jsonb_build_object(
  'employee_id', pe.employee_id,
  'gross_pay', pe.gross_pay, 'total_deductions', pe.total_deductions, 'net_pay', pe.net_pay,
  'dedlnr', pe.dedlnr, 'dedmed', pe.dedmed, 'dedpag', pe.dedpag, 'dedtax', pe.dedtax,
  'govtlnr', pe.govtlnr, 'govtecc', pe.govtecc, 'govtmed', pe.govtmed, 'govtpag', pe.govtpag,
  'other_deductions', pe.other_deductions, 'actual_loan_deductions', pe.actual_loan_deductions,
  'undeducted_amount', pe.undeducted_amount, 'mandatory_deductions', pe.mandatory_deductions,
  'available_balance', pe.available_balance, 'loan_deduction_capacity', pe.loan_deduction_capacity,
  'nthp_status', pe.nthp_status,
  'unded', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('code', u.deduction_code, 'amount', u.undeducted_amount, 'scheduled', u.scheduled_amount))
    FROM undeducted_obligations u WHERE u.payroll_entry_id = pe.id
  ), '[]'::jsonb)
) ORDER BY pe.employee_id)
FROM payroll_entries pe
WHERE pe.pay_period_id = '${PER}' AND pe.employee_id = ANY(${ids});
ROLLBACK;`);
if (!out.ok) {
  console.error('engine call failed:', JSON.stringify(out.body).slice(0, 400));
  process.exit(1);
}
const rows = (out.body as { jsonb_agg: unknown }[])?.[0]?.jsonb_agg as Record<string, unknown>[] | null;
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('no engine rows returned:', JSON.stringify(out.body).slice(0, 400));
  process.exit(1);
}
const engineResults = new Map<string, Record<string, unknown>>();
for (const r of rows) engineResults.set(String(r.employee_id), r);

// 4) compare
const FIELDS = [
  'gross_pay', 'total_deductions', 'net_pay', 'dedlnr', 'dedmed', 'dedpag', 'dedtax',
  'govtlnr', 'govtecc', 'govtmed', 'govtpag', 'other_deductions', 'actual_loan_deductions',
  'undeducted_amount', 'mandatory_deductions', 'available_balance', 'loan_deduction_capacity',
];
let mismatches = 0;
let compared = 0;
for (const e of sample) {
  const id = String(e.id);
  const ts = tsResults.get(id)!;
  const eng = engineResults.get(id);
  if (!eng) {
    console.error(`✗ ${id}: no engine entry found`);
    mismatches++;
    continue;
  }
  compared++;
  for (const f of FIELDS) {
    const a = num(ts[f]);
    const b = num(eng[f]);
    if (Math.abs(a - b) > 0.011) {
      mismatches++;
      console.error(`✗ ${id} ${f}: TS=${a} engine=${b} (Δ=${(a - b).toFixed(3)})`);
    }
  }
  if (ts.nthp_status !== eng.nthp_status) {
    mismatches++;
    console.error(`✗ ${id} nthp_status: TS=${ts.nthp_status} engine=${eng.nthp_status}`);
  }
  const tsUnded = (ts.unded as { code: string; amount: number; scheduled: number }[]);
  const engUnded = (eng.unded as { code: string; amount: number; scheduled: number }[]);
  if (tsUnded.length !== engUnded.length) {
    mismatches++;
    console.error(`✗ ${id} undeducted count: TS=${tsUnded.length} engine=${engUnded.length} (TS: ${JSON.stringify(tsUnded)}, engine: ${JSON.stringify(engUnded)})`);
  } else {
    for (let i = 0; i < tsUnded.length; i++) {
      if (tsUnded[i].code !== engUnded[i].code || Math.abs(tsUnded[i].amount - num(engUnded[i].amount)) > 0.011) {
        mismatches++;
        console.error(`✗ ${id} unded[${i}]: TS=${JSON.stringify(tsUnded[i])} engine=${JSON.stringify(engUnded[i])}`);
      }
    }
  }
}

console.log(`\nCompared ${compared} employees × ${FIELDS.length} fields (+status, +undeducted) — ${mismatches} mismatch(es)`);
if (mismatches > 0) process.exit(1);
console.log('PARITY OK');
