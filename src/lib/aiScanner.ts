import { supabase, fetchAll } from '@/lib/supabase';

/**
 * SCRIVIA Intelligence™ — payroll exception scanner.
 *
 * Runs entirely client-side over RLS-scoped reads (the same tables the rest of
 * the app uses), so every user only ever sees findings inside their own
 * division/region scope. Each finding carries a deterministic confidence score
 * derived from how strong the signal is (exact STACODE match > name-only
 * match, hard data gaps > soft heuristics, etc.).
 */

export type AiSeverity = 'critical' | 'warning' | 'info';

export interface AiEmployeeRef {
  id: string;
  name: string;
  empno: string;
  stacode?: string | null;
}

export interface AiFinding {
  id: string;
  kind: AiFindingKind;
  kindLabel: string;
  title: string;
  detail: string;
  severity: AiSeverity;
  confidence: number;
  employee?: AiEmployeeRef;
  /** Nav id to deep-link when the user hits Resolve. */
  refView: string;
  refLabel: string;
  suggestion: string;
}

export type AiFindingKind =
  | 'duplicate'
  | 'dup_empno'
  | 'invalid_stacode'
  | 'missing_data'
  | 'name_mismatch'
  | 'salary_low'
  | 'salary_grade'
  | 'loan_error';

export const FINDING_KINDS: { kind: AiFindingKind; label: string }[] = [
  { kind: 'duplicate', label: 'Duplicate Employees' },
  { kind: 'dup_empno', label: 'Duplicate Employee No.' },
  { kind: 'invalid_stacode', label: 'Invalid STACODE' },
  { kind: 'missing_data', label: 'Missing Data' },
  { kind: 'name_mismatch', label: 'Name Mismatches' },
  { kind: 'salary_low', label: 'Salary Discrepancies' },
  { kind: 'salary_grade', label: 'Salary Grade Conflicts' },
  { kind: 'loan_error', label: 'Loan Errors' },
];

export interface AiScanStep {
  label: string;
  ok: boolean;
  note?: string;
}

export interface AiScanResult {
  findings: AiFinding[];
  scannedAt: string;
  stats: { total: number; critical: number; warning: number; info: number };
  steps: AiScanStep[];
}

interface EmpRow {
  id: string;
  empno: string | null;
  employee_number: string | null;
  fname: string | null;
  first_name: string | null;
  lname: string | null;
  last_name: string | null;
  mi: string | null;
  stacode: string | null;
  poscode: string | null;
  position: string | null;
  basic: number | null;
  basic_salary: number | null;
  grade: number | null;
  step: number | null;
  status: string | null;
}

interface SalaryRow { grade: number; step: number; monthly_salary: number }

interface GroupRow { stacode_min: number | null; stacode_max: number | null; status: string | null }
interface DedRow {
  id: string;
  employee_id: string | null;
  empno: string | null;
  dedcode: string | null;
  dedamt: number | null;
  status: string | null;
}

const CAP_PER_KIND = 8;

function normName(e: EmpRow): string {
  const f = (e.fname ?? e.first_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const l = (e.lname ?? e.last_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!f && !l) return '';
  return `${l}, ${f}`.replace(/,\s*$/, '');
}

function fullName(e: EmpRow): string {
  const f = (e.fname ?? e.first_name ?? '').trim();
  const l = (e.lname ?? e.last_name ?? '').trim();
  const mi = (e.mi ?? '').trim();
  return [f, mi, l].filter(Boolean).join(' ') || 'Unnamed employee';
}

function empRef(e: EmpRow): AiEmployeeRef {
  return {
    id: e.id,
    name: fullName(e),
    empno: String(e.empno ?? e.employee_number ?? '').trim() || '—',
    stacode: e.stacode ?? null,
  };
}

function isValidStacode(s: string | null | undefined, groups: GroupRow[]): boolean {
  if (!s || !s.trim() || !/^\d+$/.test(s.trim())) return false;
  const n = parseInt(s.trim(), 10);
  return groups.some((g) => g.stacode_min !== null && g.stacode_max !== null && n >= g.stacode_min && n <= g.stacode_max);
}

export interface AiScanScope {
  regcode: string | null;
  divcodes: string[] | null;
}

/** Full scan over the payroll dataset (division-scoped by REGCODE/DIVCODE). */
export async function runAiScan(scope: AiScanScope = { regcode: null, divcodes: null }): Promise<AiScanResult> {
  const steps: AiScanStep[] = [];
  const findings: AiFinding[] = [];
  const scannedAt = new Date().toISOString();

  let empQuery = supabase.from('employees').select('id,empno,employee_number,fname,first_name,lname,last_name,mi,stacode,poscode,position,basic,basic_salary,grade,step,status').order('lname', { ascending: true });
  if (scope.regcode) {
    empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
  }
  const emps = await fetchAll<EmpRow>(() => empQuery);
  const empnos = [...new Set(emps.map((e) => String(e.empno ?? e.employee_number ?? '').trim()).filter(Boolean))];
  const empIds = new Set(emps.map((e) => e.id).filter(Boolean));

  let dedQuery = supabase.from('payroll_deductions').select('id,employee_id,empno,dedcode,dedamt,status');
  if (scope.regcode) {
    if (empnos.length > 0) dedQuery = dedQuery.in('empno', empnos);
    else dedQuery = dedQuery.eq('empno', '__none__');
  }

  const [groups, deds, sched] = await Promise.all([
    fetchAll<GroupRow>(() =>
      supabase.from('payroll_groups').select('stacode_min,stacode_max,status').eq('status', 'Active')),
    fetchAll<DedRow>(() => dedQuery),
    fetchAll<SalaryRow>(() =>
      supabase.from('salary_schedule').select('grade,step,monthly_salary')),
  ]);

  // Client-side safety net: never let a deduction from outside the scoped
  // employee set influence findings (employee_id link or empno match).
  const scopedDeds = scope.regcode
    ? deds.filter((d) => (d.employee_id && empIds.has(d.employee_id)) || (empnos.includes(String(d.empno ?? '').trim())))
    : deds;

  steps.push({ label: 'Employee masterfile scanned', ok: true, note: `${emps.length.toLocaleString()} records` });
  steps.push({ label: 'Payroll groups loaded', ok: true, note: `${groups.length.toLocaleString()} active ranges` });
  steps.push({ label: 'Salary schedule cross-checked', ok: true, note: `${sched.length.toLocaleString()} rates` });
  steps.push({ label: 'Deduction file inspected', ok: true, note: `${scopedDeds.length.toLocaleString()} records` });

  const active = emps.filter((e) => (e.status ?? 'Active').toLowerCase() === 'active');

  // ── 1. Duplicate employees (same name, different employee numbers) ──────
  const byName = new Map<string, EmpRow[]>();
  for (const e of active) {
    const n = normName(e);
    if (!n) continue;
    const arr = byName.get(n) ?? [];
    arr.push(e);
    byName.set(n, arr);
  }
  for (const [name, arr] of byName) {
    if (arr.length < 2) continue;
    const empnos = new Set(arr.map((e) => String(e.empno ?? e.employee_number ?? '').trim()).filter(Boolean));
    if (empnos.size < 2) continue;
    const sameStacode = new Set(arr.map((e) => e.stacode?.trim() ?? '')).size === 1;
    const dup = arr.slice(0, 2);
    findings.push({
      id: `dup-${name.replace(/[^a-z0-9]+/gi, '-')}`,
      kind: 'duplicate',
      kindLabel: 'Duplicate Employees',
      title: `“${name}” appears ${arr.length} times`,
      detail: `${arr.length} active records share the same name with different employee numbers (${arr.map((e) => e.empno || e.employee_number).filter(Boolean).join(', ')}). Likely double-entered in the masterfile.`,
      severity: sameStacode ? 'critical' : 'warning',
      confidence: sameStacode ? 96 : 82,
      employee: empRef(dup[0]),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Compare the two records and de-duplicate the older/inactive one.',
    });
  }

  // ── 2. Duplicate employee numbers ────────────────────────────────────────
  const byEmpno = new Map<string, EmpRow[]>();
  for (const e of active) {
    const n = String(e.empno ?? e.employee_number ?? '').trim();
    if (!n) continue;
    const arr = byEmpno.get(n) ?? [];
    arr.push(e);
    byEmpno.set(n, arr);
  }
  for (const [empno, arr] of byEmpno) {
    if (arr.length < 2) continue;
    const names = new Set(arr.map(normName).filter(Boolean));
    findings.push({
      id: `dupno-${empno}`,
      kind: 'dup_empno',
      kindLabel: 'Duplicate Employee No.',
      title: `Employee No. ${empno} is used ${arr.length} times`,
      detail: `${arr.length} records claim employee number ${empno}${names.size > 1 ? ` with different names (${[...names].join(' / ')})` : ''}. Unique numbers are required for imports and payroll runs.`,
      severity: 'critical',
      confidence: 99,
      employee: empRef(arr[0]),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Assign a unique number to one of the records and update the other.',
    });
  }

  // ── 3. Invalid STACODE ───────────────────────────────────────────────────
  const invalidStacodes = active.filter((e) => !isValidStacode(e.stacode, groups));
  for (const e of invalidStacodes.slice(0, CAP_PER_KIND)) {
    findings.push({
      id: `stacode-${e.id}`,
      kind: 'invalid_stacode',
      kindLabel: 'Invalid STACODE',
      title: `Invalid STACODE “${e.stacode ?? '—'}”`,
      detail: e.stacode && e.stacode.trim()
        ? `STACODE ${e.stacode} is not inside any active payroll group range. The employee may be excluded from payroll runs.`
        : 'No STACODE assigned — the employee cannot be mapped to a school or payroll group.',
      severity: 'warning',
      confidence: 97,
      employee: empRef(e),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Set a STACODE that falls inside an active payroll group range.',
    });
  }
  if (invalidStacodes.length > CAP_PER_KIND) {
    findings.push({
      id: 'stacode-more',
      kind: 'invalid_stacode',
      kindLabel: 'Invalid STACODE',
      title: `+${(invalidStacodes.length - CAP_PER_KIND).toLocaleString()} more records`,
      detail: `${invalidStacodes.length.toLocaleString()} active employees have invalid or missing STACODEs in total.`,
      severity: 'info',
      confidence: 97,
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Bulk-review STACODEs in the masterfile.',
    });
  }

  // ── 4. Missing data ──────────────────────────────────────────────────────
  const missing = active.filter((e) => {
    const basic = Number(e.basic ?? e.basic_salary ?? 0);
    return !e.stacode?.trim() || (!e.poscode?.trim() && !e.position?.trim()) || basic <= 0;
  });
  for (const e of missing.slice(0, CAP_PER_KIND)) {
    const gaps: string[] = [];
    if (!e.stacode?.trim()) gaps.push('STACODE');
    if (!e.poscode?.trim() && !e.position?.trim()) gaps.push('position code');
    if (Number(e.basic ?? e.basic_salary ?? 0) <= 0) gaps.push('basic salary');
    findings.push({
      id: `missing-${e.id}`,
      kind: 'missing_data',
      kindLabel: 'Missing Data',
      title: `Incomplete record: ${gaps.join(', ')}`,
      detail: `${fullName(e)} is active but missing ${gaps.join(', ')}. This blocks accurate computation of gross pay and deductions.`,
      severity: gaps.length >= 2 ? 'critical' : 'warning',
      confidence: 92,
      employee: empRef(e),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: `Complete the missing field${gaps.length > 1 ? 's' : ''} (${gaps.join(', ')}).`,
    });
  }
  if (missing.length > CAP_PER_KIND) {
    findings.push({
      id: 'missing-more',
      kind: 'missing_data',
      kindLabel: 'Missing Data',
      title: `+${(missing.length - CAP_PER_KIND).toLocaleString()} more records`,
      detail: `${missing.length.toLocaleString()} active employees have incomplete masterfile data.`,
      severity: 'info',
      confidence: 92,
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Use Name Validation and the masterfile to complete the records.',
    });
  }

  // ── 5. Name mismatches (fname vs first_name columns disagree) ───────────
  const mismatches = active.filter((e) =>
    (e.fname && e.first_name && e.fname.trim().toLowerCase() !== e.first_name.trim().toLowerCase()) ||
    (e.lname && e.last_name && e.lname.trim().toLowerCase() !== e.last_name.trim().toLowerCase()));
  for (const e of mismatches.slice(0, CAP_PER_KIND)) {
    const bits: string[] = [];
    if (e.fname && e.first_name && e.fname.trim().toLowerCase() !== e.first_name.trim().toLowerCase()) {
      bits.push(`first name “${e.fname}” vs “${e.first_name}”`);
    }
    if (e.lname && e.last_name && e.lname.trim().toLowerCase() !== e.last_name.trim().toLowerCase()) {
      bits.push(`last name “${e.lname}” vs “${e.last_name}”`);
    }
    findings.push({
      id: `name-${e.id}`,
      kind: 'name_mismatch',
      kindLabel: 'Name Mismatches',
      title: `Conflicting name fields: ${bits[0] ?? ''}`,
      detail: `The record stores two disagreeing values (${bits.join('; ')}). Reports and payslips may render the wrong spelling.`,
      severity: 'warning',
      confidence: 85,
      employee: empRef(e),
      refView: 'namevalidation',
      refLabel: 'Name Validation',
      suggestion: 'Standardize the name fields to a single consistent spelling.',
    });
  }
  if (mismatches.length > CAP_PER_KIND) {
    findings.push({
      id: 'name-more',
      kind: 'name_mismatch',
      kindLabel: 'Name Mismatches',
      title: `+${(mismatches.length - CAP_PER_KIND).toLocaleString()} more records`,
      detail: `${mismatches.length.toLocaleString()} active employees have conflicting name fields.`,
      severity: 'info',
      confidence: 85,
      refView: 'namevalidation',
      refLabel: 'Name Validation',
      suggestion: 'Run Name Validation to clean the batch.',
    });
  }

  // ── 6. Salary discrepancies (implausibly low basic pay) ─────────────────
  const low = active.filter((e) => {
    const basic = Number(e.basic ?? e.basic_salary ?? 0);
    return basic > 0 && basic < 5000;
  });
  for (const e of low.slice(0, CAP_PER_KIND)) {
    findings.push({
      id: `salary-${e.id}`,
      kind: 'salary_low',
      kindLabel: 'Salary Discrepancies',
      title: `Basic salary ${currencyOf(Number(e.basic ?? e.basic_salary))} is unusually low`,
      detail: 'A full-time DepEd employee with a valid salary grade would normally earn above this amount. This may be a data-entry error or a partial record.',
      severity: 'info',
      confidence: 78,
      employee: empRef(e),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Verify against the salary schedule and the employee’s position.',
    });
  }
  if (low.length > CAP_PER_KIND) {
    findings.push({
      id: 'salary-more',
      kind: 'salary_low',
      kindLabel: 'Salary Discrepancies',
      title: `+${(low.length - CAP_PER_KIND).toLocaleString()} more records`,
      detail: `${low.length.toLocaleString()} active employees have suspiciously low basic pay.`,
      severity: 'info',
      confidence: 78,
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Cross-check the batch against the salary schedule.',
    });
  }

  // ── 6b. Salary grade conflicts (basic vs schedule rate) ────────────────
  // Same lookup semantics as the app-wide salary schedule (last tranche wins),
  // so this rule agrees with what the employee cards display.
  const schedMap = new Map<string, number>();
  for (const r of sched) {
    if (r.grade > 0 && r.step > 0) schedMap.set(`${r.grade}-${r.step}`, Number(r.monthly_salary));
  }
  const gradeConflicts = active.filter((e) => {
    const g = Number(e.grade ?? 0);
    const s = Number(e.step ?? 0);
    const basic = Number(e.basic ?? e.basic_salary ?? 0);
    if (g <= 0 || s <= 0 || basic <= 0) return false;
    const official = schedMap.get(`${g}-${s}`);
    return official != null && Math.abs(basic - official) >= 0.01;
  });
  for (const e of gradeConflicts.slice(0, CAP_PER_KIND)) {
    const g = Number(e.grade ?? 0);
    const s = Number(e.step ?? 0);
    const basic = Number(e.basic ?? e.basic_salary ?? 0);
    const official = schedMap.get(`${g}-${s}`) ?? 0;
    const diff = basic - official;
    findings.push({
      id: `sgrade-${e.id}`,
      kind: 'salary_grade',
      kindLabel: 'Salary Grade Conflicts',
      title: `SG ${g} Step ${s} basic (${currencyOf(basic)}) differs from schedule (${currencyOf(official)})`,
      detail: `The recorded basic salary is ${currencyOf(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} the official schedule rate for SG ${g} Step ${s}. Verify the record against the salary schedule.`,
      severity: 'warning',
      confidence: 90,
      employee: empRef(e),
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Correct the basic salary to the official schedule rate for the grade/step.',
    });
  }
  if (gradeConflicts.length > CAP_PER_KIND) {
    findings.push({
      id: 'sgrade-more',
      kind: 'salary_grade',
      kindLabel: 'Salary Grade Conflicts',
      title: `+${(gradeConflicts.length - CAP_PER_KIND).toLocaleString()} more records`,
      detail: `${gradeConflicts.length.toLocaleString()} active employees have basic pay that conflicts with their salary grade schedule rate.`,
      severity: 'info',
      confidence: 90,
      refView: 'emp_records',
      refLabel: 'Employee Records',
      suggestion: 'Bulk-review the batch against the salary schedule.',
    });
  }

  // ── 7. Loan errors (zero / negative active deductions) ──────────────────
  const badDeds = scopedDeds.filter((d) => {
    const amt = Number(d.dedamt ?? 0);
    const st = (d.status ?? 'Active').toLowerCase();
    return (st === 'active' || st === '') && (amt <= 0 || !Number.isFinite(amt));
  });
  const dedByEmp = new Map<string, EmpRow>();
  for (const e of emps) dedByEmp.set(e.id, e);
  for (const d of badDeds.slice(0, CAP_PER_KIND)) {
    const emp = d.employee_id ? dedByEmp.get(d.employee_id) : undefined;
    findings.push({
      id: `loan-${d.id}`,
      kind: 'loan_error',
      kindLabel: 'Loan Errors',
      title: `Active deduction ${d.dedcode ?? '—'} has amount ${currencyOf(Number(d.dedamt ?? 0))}`,
      detail: 'An active deduction record must carry a positive monthly amount. Zero or negative amounts distort net pay and remittance totals.',
      severity: d.dedamt !== null && Number(d.dedamt) < 0 ? 'critical' : 'warning',
      confidence: 88,
      employee: emp ? empRef(emp) : undefined,
      refView: 'ded_file_viewer',
      refLabel: 'Deductions',
      suggestion: 'Correct or deactivate the deduction entry.',
    });
  }
  if (badDeds.length > CAP_PER_KIND) {
    findings.push({
      id: 'loan-more',
      kind: 'loan_error',
      kindLabel: 'Loan Errors',
      title: `+${(badDeds.length - CAP_PER_KIND).toLocaleString()} more entries`,
      detail: `${badDeds.length.toLocaleString()} active deduction entries have zero or negative amounts.`,
      severity: 'info',
      confidence: 88,
      refView: 'ded_file_viewer',
      refLabel: 'Deductions',
      suggestion: 'Bulk-review the deduction file.',
    });
  }

  steps.push({ label: 'Exception rules applied', ok: true, note: `${findings.length.toLocaleString()} findings` });

  // Sort: severity first, then confidence.
  const order: Record<AiSeverity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.confidence - a.confidence);

  return {
    findings,
    scannedAt,
    stats: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === 'critical').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length,
    },
    steps,
  };
}

function currencyOf(n: number): string {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(Number.isFinite(n) ? n : 0);
  return `${sign}₱${abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
