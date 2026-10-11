import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Plus, Trash2, Calculator, CheckCircle2, X, Play, RefreshCw, Download, AlertCircle, Eye, ShieldAlert, Lock, Search, RefreshCcw, FileDown, Landmark } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll, formatError } from '@/lib/pb';
import { generatePayrollDbf, generatePayrollCsv, generatePyentDbf, downloadFile, currency, type PyentExportResult } from '@/lib/reports';
import { computePyentSplit } from '@/lib/payroll';
import { computeDisbursement } from '@/lib/disbursement';
import { syncPayrollForEmployees } from '@/lib/payrollSync';
import { NTHP_THRESHOLD } from '@/lib/nthp';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import { useAuth } from '@/lib/auth';
import { getEmployeeFilter, isSuperAdminRole } from '@/lib/authz';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { usePagination, Pagination } from '@/components/Pagination';
import type { UserProfile } from '@/types/auth';
import type { Employee, PayPeriod, PayrollEntry, Earning, Deduction, UndeductedObligation, PayrollGroup, PayentRecord } from '@/types/payroll';
import EmployeePayrollCard from '@/components/EmployeePayrollCard';
import PyentExportModal from '@/components/PyentExportModal';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';
import LoadingIndicator from '@/components/LoadingIndicator';

interface PayrollProps {
  profile?: UserProfile | null;
}

/**
 * Pick the default period from a newest-first list (sorted year DESC, month
 * DESC, created_at DESC). Prefers an open/draft period — the one payroll runs
 * target — so a stale closed/legacy period sharing the same month can never
 * shadow the real period that holds the payroll entries.
 */
function pickDefaultPeriod(rows: PayPeriod[]): PayPeriod | undefined {
  return rows.find((p) => p.status === 'open' || p.status === 'draft') ?? rows[0];
}

export default function Payroll({ profile }: PayrollProps) {
  const { logAudit, profile: authProfile } = useAuth();
  const { scopedDivisionIds, scopedCodes } = useOrg();

  // Pay periods are per-division (REGCODE + DIVCODE live on the row), so only
  // the selected division's periods may ever be listed or operated on. When the
  // org is unscoped (super admin on "All Divisions") everything is visible.
  const scopedPeriods = useCallback(
    (rows: PayPeriod[]) => rows.filter((p) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes })),
    [scopedDivisionIds, scopedCodes],
  );
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardEmployee, setCardEmployee] = useState<Employee | null>(null);
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [refetch, setRefetch] = useState(0);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const [undeductedObs, setUndeductedObs] = useState<UndeductedObligation[]>([]);
  const [payent, setPayent] = useState<PayentRecord[]>([]);
  const [groups, setGroups] = useState<PayrollGroup[]>([]);
  const [stacodeWarning, setStacodeWarning] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Computed' | 'Posted'>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [showPyentModal, setShowPyentModal] = useState(false);
  const [pyentResult, setPyentResult] = useState<PyentExportResult | null>(null);
  const [pyentHalf, setPyentHalf] = useState<1 | 2>(1);
  const [pyentBranch, setPyentBranch] = useState('001');
  const [pyentBatch, setPyentBatch] = useState('00001');
  const [showDisb, setShowDisb] = useState(false);
  const [stationNames, setStationNames] = useState<Map<string, string>>(new Map());
  const [stationsLoaded, setStationsLoaded] = useState(false);
  const [expandedSta, setExpandedSta] = useState<string | null>(null);

  function handleCardNavigate(emp: Employee) {
    setCardEmployee(emp);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pf = profile ?? authProfile;
        const scopeFilter = pf ? getEmployeeFilter(pf) : null;
        const empCols = 'id,empno,employee_number,lname,last_name,fname,first_name,mi,stacode,regcode,divcode,division_id,basic,basic_salary,trans,pera,aca,rata,ontop,long,payroll_group_id,dedlnr,dedmed,dedpag,dedtax,netpay,status';
        const [{ data: per }, emp, grp] = await Promise.all([
          supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false }),
          fetchAll(() => {
            let q = supabase.from('employees').select(empCols).eq('status', 'Active').order('last_name');
            if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
            return q;
          }),
          fetchAll(() => supabase.from('payroll_groups').select('*').order('group_code')),
        ]);
        if (cancelled) return;
        const scopedPer = scopedPeriods(per ?? []);
        // Prefer the division-scoped periods; if the scope matches none (the
        // division has not created periods yet), fall back to the full list so
        // the screen is never dead. Runs and entries stay scoped to this
        // division's employees regardless of the selected period.
        const visiblePer = scopedPer.length > 0 ? scopedPer : (per ?? []);
        setPeriods(visiblePer);
        // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
        // unique reference for one division's payroll.
        setEmployees((emp as unknown as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
        setGroups((grp as PayrollGroup[]) ?? []);
        if (visiblePer.length > 0) setPeriodId((pickDefaultPeriod(visiblePer) ?? visiblePer[0]).id);
      } catch {
        // Silently handle — the UI shows an empty state when employees/periods are empty.
      } finally {
        // Always clear the loading state — a scoping or query error must never
        // leave the screen stuck on an infinite spinner.
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, authProfile, scopedDivisionIds, scopedCodes]);

  const loadData = useCallback(async () => {
    if (!periodId) { setEntries([]); setEarnings([]); setDeductions([]); setUndeductedObs([]); setPayent([]); return; }
    const entryCols = 'id,employee_id,pay_period_id,gross_pay,net_pay,dedlnr,dedmed,dedpag,dedtax,total_deductions,other_deductions,actual_loan_deductions,undeducted_amount,nthp_status,status,processed_at,mandatory_deductions,available_balance,loan_deduction_capacity,govtlnr,govtecc,govtmed,govtpag';
    const periodName = periods.find((p) => p.id === periodId)?.period_name;
    const [ent, earn, ded, unded, pay] = await Promise.all([
      fetchAll(() => supabase.from('payroll_entries').select(entryCols).eq('pay_period_id', periodId)),
      fetchAll(() => supabase.from('earnings').select('*').eq('pay_period_id', periodId)),
      fetchAll(() => supabase.from('deductions').select('*').eq('pay_period_id', periodId)),
      fetchAll(() => supabase.from('undeducted_obligations').select('*').eq('pay_period_id', periodId)),
      fetchAll(() => supabase.from('payent').select('*').order('empno')),
    ]);
    setEntries(ent as PayrollEntry[]);
    setEarnings(earn);
    setDeductions(ded);
    setUndeductedObs(unded as UndeductedObligation[]);
    // Match by resolved pay_period_id, falling back to the raw payperiod string
    // so imported rows whose period could not be resolved at sync time still show.
    setPayent((pay as PayentRecord[]).filter((p) =>
      p.pay_period_id === periodId || (!!periodName && p.payperiod === periodName),
    ));
  }, [periodId, periods]);

  useEffect(() => { loadData(); }, [loadData, refetch]);

  const currentPeriod = periods.find((p) => p.id === periodId);
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const gf = useMemo(() => resolveGroupFilter(groupFilter, groups), [groupFilter, groups]);
  const category = gf.category;

  // Filter employees by selected group/category STACODE range
  const scopedEmployees = useMemo(() => {
    if (gf.stacodeMin === null && gf.stacodeMax === null && gf.groupId === null) return employees;
    if (gf.groupId) return employees.filter((e) => e.payroll_group_id === gf.groupId);
    return employees.filter((e) => inCategory(e.stacode, category!));
  }, [employees, gf, category]);

  const scopedEmpIds = useMemo(() => new Set(scopedEmployees.map((e) => e.id)), [scopedEmployees]);

  // Filter payroll entries to only the selected division's employees (and the
  // current category scope when one is active) — a division must never see or
  // operate on another division's entries in the shared pay period.
  const scopedEntries = useMemo(() => {
    return entries.filter((e) => scopedEmpIds.has(e.employee_id));
  }, [entries, scopedEmpIds]);

  // ── Hidden-entry diagnosis ──
  // When the period holds entries but none survive the filters, find out WHY
  // so the empty state can name the real blocker instead of always blaming
  // the Region/Division scope: the payroll-group filter (stacode range) can
  // hide in-scope employees, and entries whose employees went inactive (or
  // were deleted) are invisible under EVERY scope — no selector switch can
  // reveal those. The probe runs only in that empty-state case.
  const [hiddenProbe, setHiddenProbe] = useState<{
    byGroup: number; byScope: number; inactive: number; deleted: number;
  } | null>(null);

  useEffect(() => {
    if (!(entries.length > 0 && scopedEntries.length === 0)) { setHiddenProbe(null); return; }
    let cancelled = false;
    (async () => {
      const empIds = new Set(employees.map((e) => e.id));
      let byGroup = 0;
      const missing: string[] = [];
      for (const en of entries) {
        if (scopedEmpIds.has(en.employee_id)) continue;
        if (empIds.has(en.employee_id)) byGroup++;
        else if (en.employee_id && !missing.includes(en.employee_id)) missing.push(en.employee_id);
      }
      let byScope = 0;
      let inactive = 0;
      let deleted = 0;
      if (missing.length > 0) {
        // No status filter here on purpose: we need to see inactive rows too.
        const { data } = await supabase
          .from('employees')
          .select('id,status,stacode,regcode,divcode,division_id')
          .in('id', missing);
        const found = new Map(((data as { id: string; status: string | null; stacode: string | null; regcode: string | null; divcode: string | null; division_id: string | null }[] | null) ?? []).map((r) => [r.id, r]));
        for (const id of missing) {
          const count = entries.filter((en) => en.employee_id === id).length;
          const rec = found.get(id);
          if (!rec) deleted += count;
          else if ((rec.status ?? '') !== 'Active') inactive += count;
          else if (!matchesOrgScope(rec, { scopedDivisionIds, scopedCodes })) byScope += count;
          else byGroup += count; // active + in scope: only the group filter can exclude it
        }
      }
      if (!cancelled) setHiddenProbe({ byGroup, byScope, inactive, deleted });
    })();
    return () => { cancelled = true; };
  }, [entries, scopedEntries.length, employees, scopedEmpIds, scopedDivisionIds, scopedCodes]);

  // Whether this division's payroll for the selected period is already posted.
  // Divisions post independently within the shared period, so this is derived
  // from the division's own entries rather than the global period status.
  // A division's payroll can also be PARTIALLY posted (some employees posted,
  // some still computed) — the posted entries are locked and must be reversed
  // before they can be recomputed, so the UI keys off `hasPosted` everywhere
  // that would otherwise overwrite or delete locked entries.
  const postedCount = scopedEntries.filter((e) => e.status === 'Posted').length;
  const hasPosted = postedCount > 0;
  const divisionPosted = scopedEntries.length > 0 && postedCount === scopedEntries.length;
  // Entries still awaiting posting — these are the dashboard's "Pending Approvals".
  const pendingCount = scopedEntries.length - postedCount;

  // Build display rows from stored entries only
  const rows = useMemo(() => {
    return scopedEntries
      .map((pe) => {
        const e = empMap.get(pe.employee_id);
        if (!e) return null;
        return {
          employee: e,
          entry: pe,
          gross: Number(pe.gross_pay) || 0,
          dedlnr: Number(pe.dedlnr) || 0,
          dedmed: Number(pe.dedmed) || 0,
          dedpag: Number(pe.dedpag) || 0,
          dedtax: Number(pe.dedtax) || 0,
          loansApplied: Number(pe.actual_loan_deductions ?? pe.other_deductions) || 0,
          undeducted: Number(pe.undeducted_amount) || 0,
          totalDeductions: Number(pe.total_deductions) || 0,
          netPay: Number(pe.net_pay) || 0,
          nthpStatus: (pe.nthp_status ?? 'PASS') === 'PASS' ? 'PASS' as const : 'FAIL' as const,
          status: pe.status,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [scopedEntries, empMap]);

  const filteredRows = useMemo(() => {
    const base = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((r) => {
      const e = r.employee;
      const empno = (e.empno ?? e.employee_number ?? '').toLowerCase();
      const name = `${e.lname || e.last_name || ''} ${e.fname || e.first_name || ''}`.toLowerCase();
      return empno.includes(q) || name.includes(q);
    });
  }, [rows, searchQuery, statusFilter]);

  const pag = usePagination(filteredRows, 15, `${searchQuery}|${statusFilter}`);

  // Totals from stored entries
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalDedlnr = rows.reduce((s, r) => s + r.dedlnr, 0);
  const totalDedmed = rows.reduce((s, r) => s + r.dedmed, 0);
  const totalDedpag = rows.reduce((s, r) => s + r.dedpag, 0);
  const totalDedtax = rows.reduce((s, r) => s + r.dedtax, 0);
  const totalOtherDeds = rows.reduce((s, r) => s + r.loansApplied, 0);
  const totalDeductions = rows.reduce((s, r) => s + r.totalDeductions, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPay, 0);
  // Compute undeducted from undeducted_obligations table (not stale entry fields)
  const totalUndeducted = undeductedObs.reduce((s, u) => s + Number(u.undeducted_amount || 0), 0);
  const nthpFails = rows.filter((r) => r.nthpStatus === 'FAIL').length;

  const undeductedByEmp = new Map<string, UndeductedObligation[]>();
  undeductedObs.forEach((u) => {
    const arr = undeductedByEmp.get(u.employee_id) ?? [];
    arr.push(u);
    undeductedByEmp.set(u.employee_id, arr);
  });

  // Imported Payent (bank-crediting hashfile) for the selected period —
  // PYENT.DBF (full month), PYENT1.DBF (first half), PYENT2.DBF (second half).
  const payentRows = useMemo(() => {
    const map = new Map<string, {
      empno: string; employeeId: string | null; acctNo: string; acctName: string;
      full: number; first: number; second: number;
    }>();
    payent.forEach((p) => {
      let cur = map.get(p.empno);
      if (!cur) {
        cur = { empno: p.empno, employeeId: p.employee_id, acctNo: p.acct_no, acctName: p.acct_name, full: 0, first: 0, second: 0 };
        map.set(p.empno, cur);
      }
      if (p.half === 'full') cur.full += Number(p.amount) || 0;
      else if (p.half === 'first') cur.first += Number(p.amount) || 0;
      else cur.second += Number(p.amount) || 0;
      if (!cur.acctNo && p.acct_no) cur.acctNo = p.acct_no;
      if (!cur.acctName && p.acct_name) cur.acctName = p.acct_name;
    });
    return Array.from(map.values()).map((r) => {
      const emp = r.employeeId ? empMap.get(r.employeeId) : undefined;
      const name = emp ? `${emp.lname || emp.last_name || ''}, ${emp.fname || emp.first_name || ''}` : (r.acctName || r.empno);
      return { ...r, name };
    });
  }, [payent, empMap]);

  // ── Disbursement Report (FoxPro SUMREP → SUMSTN/SUMREP2, Regular only) ──
  // Ports the register semantics onto the stored run. Per station (PAYSUM1):
  // payees, basic+trans, PERA, ACA, total compensation, total deductions, net
  // pay, and the four government shares; per-dedcode station detail (ITEMDED
  // damt = PAYDCON recorded mandatory shares 0003/0036/0111/0222 plus PAYDED1
  // INCLUDED lines — in V3 both already live in the run's itemized deduction
  // lines, so the breakdown reads them directly); division grand totals
  // (PAYDIV1) with division per-dedcode totals (PAYDIV2). Station names
  // resolve via dbf_stntable (STNTABLE). Deliberate deviations: no bank filter
  // (xbank LBP/PVB lives in the PYENT export above) and no per-station picker
  // (SUMSTN) — the report covers the current scope grouped by station.
  useEffect(() => {
    if (!showDisb || stationsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const stn = await fetchAll(() => supabase.from('dbf_stntable').select('stacode,staname'));
        if (cancelled) return;
        const m = new Map<string, string>();
        ((stn as { stacode: string; staname: string }[] | null) ?? []).forEach((s) => {
          if (s.stacode) m.set(String(s.stacode).trim(), s.staname ?? '');
        });
        setStationNames(m);
      } catch {
        // Names stay blank — stacodes still print.
      } finally {
        if (!cancelled) setStationsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [showDisb, stationsLoaded]);

  const disb = useMemo(() => computeDisbursement(rows, deductions, empMap), [rows, deductions, empMap]);

  function exportDisbCsv() {
    if (!currentPeriod || disb.list.length === 0) return;
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      'STACODE,STATION,PAYEES,BASIC_TRANS,PERA,ACA,TOTAL_COMP,TOTAL_DED,NET,GOVT_LNR,GOVT_MED,GOVT_PAG,GOVT_ECC',
      ...disb.list.map((t) => [
        q(t.stacode), q(stationNames.get(t.stacode) ?? ''), t.payees,
        t.basicTrans.toFixed(2), t.pera.toFixed(2), t.aca.toFixed(2), t.comp.toFixed(2),
        t.ded.toFixed(2), t.net.toFixed(2),
        t.glnr.toFixed(2), t.gmed.toFixed(2), t.gpag.toFixed(2), t.gecc.toFixed(2),
      ].join(',')),
      ['DIVISION TOTAL', '', disb.div.payees, disb.div.basicTrans.toFixed(2), disb.div.pera.toFixed(2), disb.div.aca.toFixed(2), disb.div.comp.toFixed(2), disb.div.ded.toFixed(2), disb.div.net.toFixed(2), disb.div.glnr.toFixed(2), disb.div.gmed.toFixed(2), disb.div.gpag.toFixed(2), disb.div.gecc.toFixed(2)].map(q).join(','),
      '',
      'DEDCODE,DEDNAME,DIVISION_AMOUNT',
      ...disb.divCodes.map(([code, v]) => [q(code), q(v.name), v.amt.toFixed(2)].join(',')),
    ];
    downloadFile({ filename: `DISBURSEMENT_${currentPeriod.period_name?.replace(/\s/g, '_')}.csv`, content: new TextEncoder().encode(lines.join('\n')), mimeType: 'text/csv' });
  }

  // STACODE validation: find employees with invalid/unassignable STACODE
  const unassignedEmployees = useMemo(() =>
    scopedEmployees.filter((e) => !classifyByStacode(e.stacode, groups)),
    [scopedEmployees, groups],
  );

  async function runPayroll() {
    if (!periodId || scopedEmployees.length === 0) return;
    const scopedUnassigned = unassignedEmployees;
    if (scopedUnassigned.length > 0) {
      setStacodeWarning(
        `Cannot generate payroll: ${scopedUnassigned.length} employee(s) have invalid or unassigned STACODE. ` +
        `Please fix their STACODE or review the Unassigned STACODE Report before running payroll.`
      );
      return;
    }
    setStacodeWarning(null);
    if (hasPosted) {
      setRunSummary('Payroll run blocked: this division has posted (locked) entries. Click Reverse to un-post them, then run payroll again.');
      return;
    }
    setRunning(true);
    setRunSummary(null);
    const startedAt = performance.now();
    try {
      // Compute + persist this division's payroll client-side, mirroring the
      // DepEd/NTHP formulas (computePayrollDeductions + processEmployeeDeductions).
      // The engine upserts payroll_entries, rewrites undeducted_obligations and
      // the per-period deduction lines, and syncs the employee masterfile — the
      // same outputs the removed server `run_payroll_engine` RPC produced, but
      // run directly against the (already populated) PocketBase collections.
      // Writes flow through the adapter's bounded-concurrency pool, so thousands
      // of entries are persisted in parallel instead of one-by-one.
      const startDate = currentPeriod?.start_date ? new Date(currentPeriod.start_date) : new Date();
      const payYY = currentPeriod?.year ?? startDate.getFullYear();
      const payMM = currentPeriod?.month ?? (startDate.getMonth() + 1);
      const result = await syncPayrollForEmployees([...scopedEmpIds], periodId, payYY, payMM);

      setRefetch((r) => r + 1);
      const { data: per } = await supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      setPeriods(scopedPeriods(per ?? []));

      const unded = await fetchAll(() => supabase.from('undeducted_obligations').select('*').eq('pay_period_id', periodId));
      const undeductedTotal = (unded ?? []).reduce((s: number, u: any) => s + (Number(u.undeducted_amount) || 0), 0);
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      // Surface skipped/truncated records loudly — a run that dropped rows must
      // never read as a clean success banner.
      const issues = [
        ...result.errors.map((e) => `error: ${e}`),
        ...result.warnings,
      ];
      if (issues.length > 0) {
        const isError = result.errors.length > 0;
        setRunSummary(
          `${isError ? 'Payroll run completed with ERRORS' : 'Payroll run completed with WARNINGS'}: ` +
          `${result.entriesUpdated} entries in ${seconds}s, undeducted obligations: ${currency(undeductedTotal)}, ` +
          `total net: ${currency(result.totalNet)}${result.negativeCount > 0 ? `, ${result.negativeCount} below ₱5,000` : ''}. ` +
          `${issues.length} record issue${issues.length === 1 ? '' : 's'}: ${issues.slice(0, 3).join(' • ')}` +
          (issues.length > 3 ? ` (+${issues.length - 3} more)` : '')
        );
      } else {
        setRunSummary(
          `Payroll computed: ${result.entriesUpdated} entries in ${seconds}s, ` +
          `${result.elementaryCount} elementary, ${result.highSchoolCount} high school, ` +
          `undeducted obligations: ${currency(undeductedTotal)}, ` +
          `total net: ${currency(result.totalNet)}${result.negativeCount > 0 ? `, ${result.negativeCount} below ₱5,000` : ''}.`
        );
      }
    } catch (err) {
      setRunSummary('Payroll run failed: ' + formatError(err));
    } finally {
      setRunning(false);
    }
  }

  // STEP 8 / FINAL VALIDATION — NTHP posting gate
  const nthpViolations = scopedEntries.filter((e) => Number(e.net_pay) < NTHP_THRESHOLD);
  const canPost = scopedEntries.length > 0 && !divisionPosted && nthpViolations.length === 0;

  async function postPayroll() {
    setPostError(null);
    const violations = scopedEntries.filter((e) => Number(e.net_pay) < NTHP_THRESHOLD);
    if (violations.length > 0) {
      setPostError(
        `Payroll posting blocked. ${violations.length} employee(s) have Net Take Home Pay below the DepEd-required ₱5,000 threshold. Review loan deductions and Undeducted Obligations.`
      );
      return;
    }
    if (!confirm(`Post this payroll? ${scopedEntries.length} entries will be marked as Posted.`)) return;
    setPosting(true);
    try {
      const ids = scopedEntries.map((e) => e.id).filter(Boolean);
      // Chunks stay under ~100: PocketBase rejects longer `.in()` OR-expansions.
      for (let i = 0; i < ids.length; i += 60) {
        const chunk = ids.slice(i, i + 60);
        if (chunk.length === 0) continue;
        const { error } = await supabase.from('payroll_entries').update({ status: 'Posted' }).in('id', chunk);
        if (error) throw new Error(error.message);
      }
      await logAudit('payroll_post', 'pay_period', periodId, { entries_posted: scopedEntries.length });
      setRefetch((r) => r + 1);
      setRunSummary(`Payroll posted: ${scopedEntries.length} entries marked as Posted.`);
    } catch (err) {
      setPostError('Posting failed: ' + formatError(err));
    } finally {
      setPosting(false);
    }
  }

  // Whole-period reversal, server-side. Works on open AND closed periods and
  // does not depend on which entries the client currently has loaded — so a
  // stale/empty entry view can never trap a posted period again.
  async function reversePayroll() {
    if (!periodId || !currentPeriod) return;
    const wasClosed = currentPeriod.status === 'closed';
    if (!confirm(
      `Reverse ${currentPeriod.period_name}? All posted entries will be un-posted and returned to Computed` +
      (wasClosed ? ', and the period will be reopened for editing' : '') +
      '. This cannot be undone.'
    )) return;
    setReversing(true);
    setPostError(null);
    try {
      // Un-post only this division's posted entries within the shared period.
      const postedIds = scopedEntries.filter((e) => e.status === 'Posted').map((e) => e.id).filter(Boolean);
      // Chunks stay under ~100: PocketBase rejects longer `.in()` OR-expansions.
      for (let i = 0; i < postedIds.length; i += 60) {
        const chunk = postedIds.slice(i, i + 60);
        if (chunk.length === 0) continue;
        const { error } = await supabase.from('payroll_entries').update({ status: 'Computed' }).in('id', chunk);
        if (error) throw new Error(error.message);
      }
      // Reopen the shared period if it was closed (returns it to editable state).
      if (wasClosed) {
        const { error: perr } = await supabase.from('pay_periods').update({ status: 'open' }).eq('id', periodId);
        if (perr) throw new Error(perr.message);
      }
      await logAudit('payroll_reverse', 'pay_period', periodId, { entries_reversed: postedIds.length });
      setRefetch((r) => r + 1);
      setRunSummary(`Payroll reversed. ${postedIds.length} posted entries returned to Computed` + (wasClosed ? ' and the period reopened' : '') + '.');
    } catch (err) {
      setPostError('Reversal failed: ' + formatError(err));
    } finally {
      setReversing(false);
    }
  }

  // Delete THIS division's payroll entries for the selected period only. The
  // shared pay period is kept — other divisions may still be working on it.
  // Posted entries stay locked for everyone except super_admin, who may delete
  // this division's posted payroll outright (the DB trigger enforces that).
  async function deleteDivisionPayroll() {
    if (!periodId || scopedEntries.length === 0) return;
    const isAdmin = isSuperAdminRole(profile?.role);
    if (hasPosted && !isAdmin) {
      setPostError('This division\'s payroll has posted (locked) entries — reverse them first, then delete.');
      return;
    }
    const warning = hasPosted
      ? `Delete this division's payroll? ${scopedEntries.length} entries (${postedCount} posted) will be permanently removed — including their itemized deduction lines. This cannot be undone.`
      : `Delete this division's payroll? ${scopedEntries.length} computed entries for this period will be removed. Other divisions' entries are unaffected.`;
    if (!confirm(warning)) return;
    setDeleting(true);
    setPostError(null);
    try {
      const scopedIdList = [...scopedEmpIds];
      const batch = 50;
      for (let i = 0; i < scopedIdList.length; i += batch) {
        const chunk = scopedIdList.slice(i, i + batch);
        const { error: undedErr } = await supabase.from('undeducted_obligations').delete().eq('pay_period_id', periodId).in('employee_id', chunk);
        if (undedErr) throw new Error('Failed to clear undeducted obligations: ' + undedErr.message);
        const { error: delErr } = await supabase.from('payroll_entries').delete().eq('pay_period_id', periodId).in('employee_id', chunk);
        if (delErr) throw new Error('Failed to delete payroll entries: ' + delErr.message);
        // Itemized deduction lines written by the payroll run (mirrors the
        // engine's own cleanup — manual lines are kept).
        const { error: dedErr } = await supabase.from('deductions').delete().eq('pay_period_id', periodId).in('employee_id', chunk).in('source', ['Payroll Run', 'INCLUDED']);
        if (dedErr) throw new Error('Failed to clear run deduction lines: ' + dedErr.message);
      }
      setRefetch((r) => r + 1);
      const { data: per } = await supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      setPeriods(scopedPeriods(per ?? []));
      await logAudit('payroll_delete', 'pay_period', periodId, { entries_deleted: scopedEntries.length });
      setRunSummary(`Deleted ${scopedEntries.length} payroll entries for this division. The pay period remains available for other divisions.`);
    } catch (err) {
      const msg = formatError(err);
      setPostError('Delete failed: ' + msg);
    } finally {
      setDeleting(false);
    }
  }

  async function syncDeductionsFromMaster() {
    if (!periodId || scopedEntries.length === 0) return;
    setSyncing(true);
    setSyncSummary(null);
    try {
      // Same client engine as Run Payroll — recompute this division's entries
      // from the deduction masterfile and persist everything PocketBase-side.
      if (hasPosted) {
        setSyncSummary('Sync blocked: this division has posted (locked) entries. Click Reverse to un-post them, then sync again.');
        return;
      }
      const startDate = currentPeriod?.start_date ? new Date(currentPeriod.start_date) : new Date();
      const payYY = currentPeriod?.year ?? startDate.getFullYear();
      const payMM = currentPeriod?.month ?? (startDate.getMonth() + 1);
      const result = await syncPayrollForEmployees([...scopedEmpIds], periodId, payYY, payMM);

      setRefetch((r) => r + 1);
      const unded = await fetchAll(() => supabase.from('undeducted_obligations').select('*').eq('pay_period_id', periodId));
      const undeductedTotal = (unded ?? []).reduce((s: number, u: any) => s + (Number(u.undeducted_amount) || 0), 0);
      // Surface skipped/truncated records loudly — never read as a clean success.
      const issues = [
        ...result.errors.map((e) => `error: ${e}`),
        ...result.warnings,
      ];
      if (issues.length > 0) {
        const isError = result.errors.length > 0;
        setSyncSummary(
          `${isError ? 'Deductions synced with ERRORS' : 'Deductions synced with WARNINGS'}: ` +
          `${result.entriesUpdated} entries updated, undeducted: ${currency(undeductedTotal)}. ` +
          `${issues.length} record issue${issues.length === 1 ? '' : 's'}: ${issues.slice(0, 3).join(' • ')}` +
          (issues.length > 3 ? ` (+${issues.length - 3} more)` : '')
        );
      } else {
        setSyncSummary(`Deductions synced: ${result.entriesUpdated} entries updated, undeducted: ${currency(undeductedTotal)}.`);
      }
      await logAudit('deduction_sync', 'pay_period', periodId, { entries: result.entriesUpdated });
    } catch (err) {
      setSyncSummary('Sync failed: ' + formatError(err));
    } finally {
      setSyncing(false);
    }
  }

  async function deleteEntry(pe: PayrollEntry) {
    if (pe.status === 'Posted' && !isSuperAdminRole(profile?.role)) {
      setPostError('Posted entries are locked — only a super admin can delete a posted entry.');
      return;
    }
    if (!confirm(pe.status === 'Posted' ? 'Delete this posted payroll entry? This cannot be undone.' : 'Remove this payroll entry?')) return;
    await supabase.from('payroll_entries').delete().eq('id', pe.id);
    setRefetch((r) => r + 1);
  }

  function exportDbf() {
    const content = generatePayrollDbf(scopedEntries, employees, currentPeriod!);
    downloadFile({ filename: `PAYROLL_${currentPeriod?.period_name?.replace(/\s/g, '_')}_${gf.label.replace(/\s/g, '_')}.DBF`, content, mimeType: 'application/dbf' });
    logAudit('dbf_upload', 'pay_period', periodId, { entries: scopedEntries.length });
  }

  function exportCsv() {
    if (!currentPeriod) return;
    const content = generatePayrollCsv(scopedEntries, employees, currentPeriod);
    downloadFile({ filename: `PAYROLL_${currentPeriod?.period_name?.replace(/\s/g, '_')}_${gf.label.replace(/\s/g, '_')}.csv`, content, mimeType: 'text/csv' });
    logAudit('dbf_upload', 'pay_period', periodId, { entries: scopedEntries.length, format: 'csv' });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-5 shadow-sm space-y-4">
        {/* Row 1: period selector + status badge + group filter */}
        <div className="flex items-center gap-3">
          <select
            value={periodId}
            onChange={(e) => {
              if (e.target.value === '__generate') {
                setShowNewPeriod(true);
                setPeriodId(periods[0]?.id ?? '');
              } else {
                setPeriodId(e.target.value);
              }
            }}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-w-[210px] cursor-pointer"
          >
            {periods.length === 0 && <option>No pay periods yet</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
            {periods.length > 0 && (
              <option value="__generate" className="text-emerald-600 font-medium">+ New Monthly Period…</option>
            )}
          </select>
          {currentPeriod && (
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase ${
              currentPeriod.status === 'open' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
              currentPeriod.status === 'draft' ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' :
              'bg-slate-100 text-slate-400 ring-1 ring-slate-200'
            }`}>{currentPeriod.status}</span>
          )}
          <div className="ml-auto">
            <GroupFilter value={groupFilter} onChange={setGroupFilter} />
          </div>
        </div>

        {/* Row 2: premium grouped action buttons */}
        <div className="flex items-stretch gap-3">
          {/* ── Operations Group ── */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 pl-1">Operations</span>
            <div className="flex items-center gap-1.5 bg-slate-50/80 rounded-xl border border-slate-200/60 p-1.5">
              <button
                onClick={() => setShowNewPeriod(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> New Period
              </button>

              <button
                onClick={runPayroll}
                disabled={!periodId || scopedEmployees.length === 0 || hasPosted || running}
                title={hasPosted ? 'This division has posted (locked) entries for this period — reverse them first' : 'Compute payroll for the selected period'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-emerald-600/20"
              >
                {running ? <LoadingIndicator size={32} /> : <Play className="w-3.5 h-3.5 fill-white" />}
                {running ? 'Running…' : gf.groupId || category ? `Run ${gf.label}` : 'Run Payroll'}
              </button>

              {scopedEntries.length > 0 && !hasPosted && (
                <button
                  onClick={syncDeductionsFromMaster}
                  disabled={syncing || running}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-600/20"
                  title="Re-apply current deduction masterfile to this payroll run"
                >
                  {syncing ? <LoadingIndicator size={32} /> : <RefreshCcw className="w-3.5 h-3.5" />}
                  {syncing ? 'Syncing…' : 'Sync'}
                </button>
              )}
            </div>
          </div>

          {/* ── Export Group ── */}
          {scopedEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 pl-1">Export</span>
              <div className="flex items-center gap-1.5 bg-amber-50/50 rounded-xl border border-amber-200/50 p-1.5">
                <button
                  onClick={() => setShowPyentModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 active:bg-amber-700 transition-all shadow-sm shadow-amber-500/20"
                >
                  <FileDown className="w-3.5 h-3.5" /> PYENT DBF
                </button>
                <button
                  onClick={exportDbf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> DBF
                </button>
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
          )}

          {/* ── Admin Group ── */}
          {scopedEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 pl-1">Admin</span>
              <div className="flex items-center gap-1.5 bg-rose-50/40 rounded-xl border border-rose-200/40 p-1.5">
                {!divisionPosted && (
                  <button
                    onClick={postPayroll}
                    disabled={!canPost || posting}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-all shadow-sm ${
                      canPost ? 'bg-slate-800 text-white hover:bg-slate-900 active:bg-black shadow-slate-800/20' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {posting ? <LoadingIndicator size={32} /> : canPost ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {posting ? 'Posting…' : canPost ? (pendingCount > 0 ? `Post (${pendingCount})` : 'Post') : 'Blocked'}
                  </button>
                )}

                {isSuperAdminRole(profile?.role) && currentPeriod && currentPeriod.status !== 'draft' && (
                  <button
                    onClick={reversePayroll}
                    disabled={reversing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 text-white text-[13px] font-semibold hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-rose-600/20"
                    title="Un-post this period's payroll server-side and reopen it for editing (super admin)"
                  >
                    {reversing ? <LoadingIndicator size={32} /> : <RefreshCcw className="w-3.5 h-3.5" />}
                    {reversing ? 'Reversing…' : 'Reverse'}
                  </button>
                )}

                {(!hasPosted || isSuperAdminRole(profile?.role)) && (
                  <button
                    onClick={deleteDivisionPayroll}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 bg-white text-[13px] font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 active:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    title={hasPosted
                      ? 'Delete this division\'s posted payroll permanently (super admin only). This cannot be undone.'
                      : "Delete this division's computed payroll entries for the selected period. Other divisions are unaffected."}
                  >
                    {deleting ? <LoadingIndicator size={32} /> : <Trash2 className="w-3.5 h-3.5" />}
                    {deleting ? 'Deleting…' : hasPosted ? 'Delete Posted' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NTHP posting block error */}
      {postError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{postError}</span>
          <button onClick={() => setPostError(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Sync summary */}
      {syncSummary && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border ${
          syncSummary.includes('failed') || syncSummary.includes('ERRORS') ? 'bg-rose-50 text-rose-700 border-rose-200' :
          syncSummary.includes('WARNINGS') || syncSummary.includes('skipped') || syncSummary.includes('truncat') || syncSummary.includes('NOT saved') ? 'bg-amber-50 text-amber-800 border-amber-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          <RefreshCcw className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{syncSummary}</span>
          <button onClick={() => setSyncSummary(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Partial-post warning — some entries are posted (locked) and some are not */}
      {!loading && hasPosted && !divisionPosted && !postError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">
            {postedCount} of {scopedEntries.length} entries for this period are <span className="font-semibold">Posted</span> (locked).{' '}
            {isSuperAdminRole(profile?.role) ? (
              <>Click <span className="font-semibold">Reverse</span> to un-post them and re-run payroll, Post the remaining {scopedEntries.length - postedCount} computed entry{scopedEntries.length - postedCount === 1 ? '' : 'ies'} to finish posting, or <span className="font-semibold">Delete Posted Payroll</span> to remove them permanently.</>
            ) : (
              <>Ask a system administrator to reverse them before re-running payroll.</>
            )}
          </span>
        </div>
      )}

      {/* NTHP pre-post warning */}
      {!loading && scopedEntries.length > 0 && nthpViolations.length > 0 && !postError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{nthpViolations.length} employee(s) have Net Take Home Pay below ₱5,000. Posting is blocked until loan deductions are reviewed.</span>
        </div>
      )}

      {/* STACODE validation warning */}
      {stacodeWarning && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{stacodeWarning}</span>
          <button onClick={() => setStacodeWarning(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Unassigned STACODE info banner */}
      {!loading && unassignedEmployees.length > 0 && !stacodeWarning && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{unassignedEmployees.length} employee(s) have invalid or missing STACODE and will be excluded from payroll. Fix their STACODE in the Masterfile or review the Unassigned STACODE Report.</span>
        </div>
      )}

      {/* Run summary / error banner */}
      {runSummary && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border ${
          runSummary.includes('failed') || runSummary.includes('ERRORS') ? 'bg-rose-50 text-rose-700 border-rose-200' :
          runSummary.includes('WARNINGS') || runSummary.includes('skipped') || runSummary.includes('truncat') || runSummary.includes('NOT saved') ? 'bg-amber-50 text-amber-800 border-amber-200' :
          'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{runSummary}</span>
          <button onClick={() => setRunSummary(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stats */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
          <StatCard label="Employees" value={String(rows.length)} icon="employees" />
          <StatCard label="Gross Pay" value={currency(totalGross)} icon="gross" />
          <StatCard label="Total Deductions" value={currency(totalDeductions)} tone="rose" icon="deductions" />
          <StatCard label="Loan Deductions" value={currency(totalOtherDeds)} tone="slate" icon="deductions" />
          <StatCard label="Undeducted" value={currency(totalUndeducted)} tone="amber" icon="undeducted" />
          <StatCard label="Net Pay" value={currency(totalNet)} tone="emerald" icon="net" />
          <StatCard label="NTHP Status" value={`${rows.length - nthpFails}/${rows.length} PASS`} tone={nthpFails > 0 ? 'rose' : 'emerald'} icon="nthp" />
        </div>
      )}

      {/* Imported Payent (bank-crediting hashfile from Smart Import) */}
      {!loading && payentRows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Payent — Bank Crediting (Smart Import)</h2>
              <p className="text-xs text-slate-500">
                Imported PYENT.DBF (full month), PYENT1.DBF (first half), PYENT2.DBF (second half) for {currentPeriod?.period_name ?? 'this period'}.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Emp. No.</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Account No.</th>
                  <th className="text-right px-4 py-3 font-medium">Full Month</th>
                  <th className="text-right px-4 py-3 font-medium">First Half</th>
                  <th className="text-right px-4 py-3 font-medium">Second Half</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payentRows.map((r) => (
                  <tr key={r.empno} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.empno}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.acctNo || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{currency(r.full)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{currency(r.first)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-600">{currency(r.second)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{currency(r.full + r.first + r.second)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                  <td colSpan={3} className="px-4 py-2.5">Totals</td>
                  <td className="px-4 py-2.5 text-right">{currency(payentRows.reduce((s, r) => s + r.full, 0))}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">{currency(payentRows.reduce((s, r) => s + r.first, 0))}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600">{currency(payentRows.reduce((s, r) => s + r.second, 0))}</td>
                  <td className="px-4 py-2.5 text-right">{currency(payentRows.reduce((s, r) => s + r.full + r.first + r.second, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Disbursement Report — FoxPro SUMREP/SUMSTN (Regular Payroll register) */}
      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button onClick={() => setShowDisb((v) => !v)} className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-slate-50">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileDown className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-slate-800">Disbursement Report — Regular Payroll Register</h2>
              <p className="text-xs text-slate-500">
                DEPARTMENT OF EDUCATION · PAYROLL REGISTER · REGULAR SALARY · {currentPeriod?.period_name ?? 'this period'}
                {currentPeriod?.end_date ? ` · Period ending ${currentPeriod.end_date}` : ''}
                {currentPeriod?.pay_date ? ` · Issued ${currentPeriod.pay_date}` : ''}
              </p>
            </div>
            <span className="text-xs font-semibold text-emerald-700">{showDisb ? 'Hide' : 'Show'}</span>
          </button>
          {showDisb && (
            <div className="border-t border-slate-100">
              <div className="px-5 py-3 flex items-center gap-2 flex-wrap border-b border-slate-100">
                <span className="text-xs text-slate-500 mr-auto">{disb.list.length} station{disb.list.length === 1 ? '' : 's'} · click a station row for its per-deduction breakdown</span>
                <button onClick={exportDisbCsv} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">Station</th>
                      <th className="text-right px-4 py-3 font-medium">Payees</th>
                      <th className="text-right px-4 py-3 font-medium">Basic + Trans</th>
                      <th className="text-right px-4 py-3 font-medium">PERA</th>
                      <th className="text-right px-4 py-3 font-medium">ACA</th>
                      <th className="text-right px-4 py-3 font-medium">Total Comp</th>
                      <th className="text-right px-4 py-3 font-medium">Total Ded</th>
                      <th className="text-right px-4 py-3 font-medium">Net Salary</th>
                      <th className="text-right px-4 py-3 font-medium">GSIS L&R (Govt)</th>
                      <th className="text-right px-4 py-3 font-medium">Medicare (Govt)</th>
                      <th className="text-right px-4 py-3 font-medium">Pag-IBIG (Govt)</th>
                      <th className="text-right px-4 py-3 font-medium">ECC (Govt)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {disb.list.map((t) => (
                      <Fragment key={t.stacode}>
                        <tr onClick={() => setExpandedSta((s) => s === t.stacode ? null : t.stacode)} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            <span className="font-mono text-xs text-slate-500 mr-2">{t.stacode}</span>
                            {stationNames.get(t.stacode) || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{t.payees}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{currency(t.basicTrans)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{currency(t.pera)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{currency(t.aca)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-slate-800">{currency(t.comp)}</td>
                          <td className="px-4 py-2.5 text-right text-rose-600">{currency(t.ded)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{currency(t.net)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{currency(t.glnr)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{currency(t.gmed)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{currency(t.gpag)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{currency(t.gecc)}</td>
                        </tr>
                        {expandedSta === t.stacode && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={12} className="px-8 py-3">
                              {t.byCode.size === 0 ? (
                                <p className="text-xs text-slate-400">No itemized deduction lines for this station.</p>
                              ) : (
                                <table className="w-full text-xs max-w-2xl">
                                  <thead>
                                    <tr className="text-slate-400 uppercase tracking-wider">
                                      <th className="text-left py-1 font-medium">Dedcode</th>
                                      <th className="text-left py-1 font-medium">Deduction</th>
                                      <th className="text-right py-1 font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {Array.from(t.byCode.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([code, v]) => (
                                      <tr key={code}>
                                        <td className="py-1 font-mono text-slate-500">{code}</td>
                                        <td className="py-1 text-slate-700">{v.name}</td>
                                        <td className="py-1 text-right tabular-nums text-slate-700">{currency(v.amt)}</td>
                                      </tr>
                                    ))}
                                    <tr className="font-semibold text-slate-800">
                                      <td colSpan={2} className="py-1">Station deduction total</td>
                                      <td className="py-1 text-right tabular-nums">{currency(Array.from(t.byCode.values()).reduce((s, v) => s + v.amt, 0))}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                      <td className="px-4 py-2.5">DIVISION TOTAL</td>
                      <td className="px-4 py-2.5 text-right">{disb.div.payees}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.basicTrans)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.pera)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.aca)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.comp)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{currency(disb.div.ded)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{currency(disb.div.net)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.glnr)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.gmed)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.gpag)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(disb.div.gecc)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {disb.divCodes.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Division totals by deduction</h3>
                  <table className="w-full text-xs max-w-3xl">
                    <thead>
                      <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Dedcode</th>
                        <th className="text-left py-1.5 font-medium">Deduction</th>
                        <th className="text-right py-1.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {disb.divCodes.map(([code, v]) => (
                        <tr key={code}>
                          <td className="py-1.5 font-mono text-slate-500">{code}</td>
                          <td className="py-1.5 text-slate-700">{v.name}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">{currency(v.amt)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-slate-800">
                        <td colSpan={2} className="py-1.5">Total itemized deductions</td>
                        <td className="py-1.5 text-right tabular-nums">{currency(disb.divCodes.reduce((s, [, v]) => s + v.amt, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search + Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center"><LoadingIndicator /></div>
        ) : scopedEmployees.length === 0 ? (
          <div className="py-16 text-center">
            <Calculator className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500 mb-1">
              {periods.length === 0 ? 'Create a pay period to begin.' : 'No employees in this scope.'}
            </p>
          </div>
        ) : scopedEntries.length === 0 ? (
          <div className="py-16 text-center">
            <Calculator className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            {entries.length > 0 ? (
              <>
                <p className="text-sm text-slate-500 mb-1">
                  This period has <span className="font-medium text-slate-700">{entries.length}</span> payroll {entries.length === 1 ? 'entry' : 'entries'} in the database, but none are visible under the current filters.
                </p>
                <div className="text-xs text-slate-400 max-w-md mx-auto space-y-1.5">
                  {!hiddenProbe ? (
                    <p>Analyzing which filter hides them…</p>
                  ) : (
                    <>
                      {hiddenProbe.byGroup > 0 && (
                        <p>
                          <span className="font-medium text-slate-500">{hiddenProbe.byGroup}</span> {hiddenProbe.byGroup === 1 ? 'entry belongs' : 'entries belong'} to employees outside the selected payroll group (stacode range).
                          <button onClick={() => setGroupFilter({ kind: 'all' })} className="ml-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors">
                            Show all payroll groups
                          </button>
                        </p>
                      )}
                      {(hiddenProbe.byScope > 0 || (hiddenProbe.byGroup === 0 && hiddenProbe.inactive === 0 && hiddenProbe.deleted === 0)) && (
                        <p>
                          {hiddenProbe.byScope > 0 && (<><span className="font-medium text-slate-500">{hiddenProbe.byScope}</span> {hiddenProbe.byScope === 1 ? 'entry belongs' : 'entries belong'} to another division. </>)}
                          {currentPeriod?.regcode && currentPeriod?.divcode && (
                            <>The period belongs to division <span className="font-medium text-slate-500">{currentPeriod.regcode}/{currentPeriod.divcode}</span>. </>
                          )}
                          Switch the Region/Division selector in the top bar to that division — or All Divisions — to view, post or reverse them.
                        </p>
                      )}
                      {hiddenProbe.inactive > 0 && (
                        <p>
                          <span className="font-medium text-slate-500">{hiddenProbe.inactive}</span> {hiddenProbe.inactive === 1 ? 'entry references' : 'entries reference'} an employee who is no longer Active. Re-activate the employee in Employee Records to view, post or reverse {hiddenProbe.inactive === 1 ? 'it' : 'them'}.
                        </p>
                      )}
                      {hiddenProbe.deleted > 0 && (
                        <p>
                          <span className="font-medium text-slate-500">{hiddenProbe.deleted}</span> {hiddenProbe.deleted === 1 ? 'entry references' : 'entries reference'} an employee record that no longer exists. {hiddenProbe.deleted === 1 ? 'It cannot' : 'They cannot'} be posted until the employee is restored.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 mb-1">
                No payroll entries yet for this period. Click <span className="font-medium text-emerald-600">Run Payroll</span> to compute.
              </p>
            )}
          </div>
        ) : (
          <>
          <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            {/* Status filter — "Pending" isolates the entries awaiting posting */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                All {rows.length}
              </button>
              <button
                onClick={() => setStatusFilter('Computed')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${statusFilter === 'Computed' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
              >
                Pending {pendingCount}
              </button>
              <button
                onClick={() => setStatusFilter('Posted')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${statusFilter === 'Posted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
              >
                Posted {postedCount}
              </button>
            </div>
            <div className="relative max-w-sm ml-auto w-full sm:w-auto sm:min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by employee number or name…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Emp. No.</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-right px-4 py-3 font-medium">Gross</th>
                  <th className="text-right px-4 py-3 font-medium" title="GSIS Life & Retirement">GSIS L&R</th>
                  <th className="text-right px-4 py-3 font-medium" title="Medicare">Medicare</th>
                  <th className="text-right px-4 py-3 font-medium" title="Pag-IBIG">Pag-IBIG</th>
                  <th className="text-right px-4 py-3 font-medium" title="Withholding Tax">W/Tax</th>
                  <th className="text-right px-4 py-3 font-medium" title="Loan deductions actually applied after NTHP check">Loans Applied</th>
                  <th className="text-right px-4 py-3 font-medium" title="Loan deductions skipped due to ₱5,000 NTHP floor">Undeducted</th>
                  <th className="text-right px-4 py-3 font-medium">Total Ded.</th>
                  <th className="text-right px-4 py-3 font-medium">Net Pay</th>
                  <th className="text-center px-4 py-3 font-medium" title="NTHP ₱5,000 Compliance">NTHP</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400 text-sm">
                      {statusFilter === 'Computed'
                        ? 'No pending entries — nothing left to approve for this period.'
                        : statusFilter === 'Posted'
                          ? 'No posted entries match your filters.'
                          : `No employees match "${searchQuery}".`}
                    </td>
                  </tr>
                )}
                {pag.pagedItems.map((r) => {
                  const e = r.employee;
                  const empno = e.empno ?? e.employee_number ?? '—';
                  const name = `${e.lname || e.last_name || ''}, ${e.fname || e.first_name || ''}`;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{empno}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{currency(r.gross)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{currency(r.dedlnr)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{currency(r.dedmed)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{currency(r.dedpag)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{currency(r.dedtax)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{currency(r.loansApplied)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{currency(r.undeducted)}</td>
                      <td className="px-4 py-3 text-right text-rose-600 font-medium">{currency(r.totalDeductions)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{currency(r.netPay)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.nthpStatus === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>{r.nthpStatus}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'Posted' ? 'bg-emerald-50 text-emerald-700' :
                          r.status === 'Reversed' ? 'bg-rose-50 text-rose-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setCardEmployee(e)} className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="View payroll card">
                            <Eye className="w-4 h-4" />
                          </button>
                          {r.entry && (r.status !== 'Posted' || isSuperAdminRole(profile?.role)) && (
                            <button onClick={() => deleteEntry(r.entry!)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title={r.status === 'Posted' ? 'Delete posted entry (super admin)' : 'Delete entry'}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-700 border-t-2 border-slate-200">
                  <td colSpan={2} className="px-4 py-3">Totals</td>
                  <td className="px-4 py-3 text-right">{currency(totalGross)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{currency(totalDedlnr)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{currency(totalDedmed)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{currency(totalDedpag)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{currency(totalDedtax)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{currency(totalOtherDeds)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{currency(totalUndeducted)}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{currency(totalDeductions)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{currency(totalNet)}</td>
                  <td className="px-4 py-3 text-center text-xs font-medium text-slate-600">{nthpFails > 0 ? `${nthpFails} FAIL` : 'ALL PASS'}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} label="employees" />
          </>
        )}
      </div>

      {showNewPeriod && (
        <NewPeriodModal
          existing={periods}
          regcode={scopedCodes?.[0]?.regcode ?? null}
          divcode={scopedCodes?.[0]?.divcode ?? null}
          onClose={() => setShowNewPeriod(false)}
          onCreated={async () => {
            setShowNewPeriod(false);
            const { data: per } = await supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false });
            const scopedPer = scopedPeriods(per ?? []);
            const visiblePer = scopedPer.length > 0 ? scopedPer : (per ?? []);
            setPeriods(visiblePer);
            if (visiblePer.length > 0) setPeriodId((pickDefaultPeriod(visiblePer) ?? visiblePer[0]).id);
          }}
        />
      )}

      {cardEmployee && (
        <EmployeePayrollCard
          employee={cardEmployee}
          entry={scopedEntries.find((en) => en.employee_id === cardEmployee.id) ?? null}
          period={currentPeriod ?? null}
          allEmployees={employees}
          allEntries={scopedEntries}
          onClose={() => setCardEmployee(null)}
          onNavigate={handleCardNavigate}
        />
      )}

      {showPyentModal && (
        <PyentExportModal
          entries={scopedEntries}
          employees={employees}
          periodName={currentPeriod?.period_name ?? ''}
          periodId={periodId}
          logAudit={logAudit}
          onClose={() => { setShowPyentModal(false); setPyentResult(null); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone = 'slate', icon }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'rose' | 'amber'; icon?: string }) {
  const valueColors: Record<string, string> = {
    slate: 'text-slate-800',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
  };
  const labelColors: Record<string, string> = {
    slate: 'text-slate-500',
    emerald: 'text-emerald-600',
    rose: 'text-rose-500',
    amber: 'text-amber-500',
  };
  const borderColors: Record<string, string> = {
    slate: 'border-slate-200',
    emerald: 'border-emerald-200',
    rose: 'border-rose-200',
    amber: 'border-amber-200',
  };
  return (
    <div className={`bg-white rounded-xl border ${borderColors[tone]} px-4 py-4 min-w-0 shadow-sm hover:shadow-md transition-shadow`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelColors[tone]} truncate mb-1.5`}>{label}</p>
      <p className={`text-lg font-bold ${valueColors[tone]} whitespace-nowrap overflow-hidden text-ellipsis leading-tight`}>{value}</p>
    </div>
  );
}

function NewPeriodModal({ existing, regcode, divcode, onClose, onCreated }: { existing: PayPeriod[]; regcode: string | null; divcode: string | null; onClose: () => void; onCreated: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const existingSet = new Set(existing.filter((p) => p.year && p.month).map((p) => `${p.year}-${p.month}`));
  const alreadyExists = existingSet.has(`${year}-${month}`);

  async function save() {
    setSaving(true);
    setError('');
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    const payDate = new Date(year, month, 15).toISOString().slice(0, 10);
    const periodName = `${MONTHS[month - 1]} ${year}`;
    const { error: err } = await supabase.from('pay_periods').insert({
      period_name: periodName, start_date: start, end_date: end, pay_date: payDate,
      frequency: 'Monthly', status: 'draft', month, year, period_number: month,
      regcode, divcode,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onCreated();
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Create Monthly Pay Period</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm"><AlertCircle className="w-4 h-4" /> {error}</div>}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
            Payroll is computed once per month. Select a month and year to create a single monthly pay period. Periods are created one month at a time — add a month only when you are ready to run its payroll.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Month</span>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} disabled={existingSet.has(`${year}-${i + 1}`)}>
                    {m}{existingSet.has(`${year}-${i + 1}`) ? ' (exists)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Year</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {alreadyExists && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4" /> {MONTHS[month - 1]} {year} already exists. Choose a different month.
            </div>
          )}
          <div className="text-xs text-slate-500 space-y-1">
            <p><span className="font-medium text-slate-600">Period:</span> {MONTHS[month - 1]} {year}</p>
            <p><span className="font-medium text-slate-600">Coverage:</span> {MONTHS[month - 1]} 1 – {new Date(year, month, 0).getDate()}, {year}</p>
            <p><span className="font-medium text-slate-600">Pay Date:</span> {MONTHS[month % 12]} 15, {month === 12 ? year + 1 : year}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || alreadyExists} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? 'Creating…' : 'Create Period'}
          </button>
        </div>
      </div>
    </div>
  );
}
