import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet, Download, Users, FileText, Calculator, Database, CheckCircle2,
  FileDown, ClipboardList, BookOpen, BarChart3, Search, ShieldAlert, Landmark, HeartPulse, Home, Wallet,
  AlertCircle, Printer, Building, CalendarDays, RefreshCw,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import LoadingIndicator from '@/components/LoadingIndicator';
import { usePagination, Pagination } from '@/components/Pagination';
import {
  generateMasterfileDbf, generateMasterfileCsv, generateDeductionDbf, generatePayrollDbf,
  generateDedfileDbf, generateCsv, downloadFile, currency,
} from '@/lib/reports';
import type { Employee, Deduction, PayPeriod, PayrollEntry, PayrollDeduction, DeductionCode, PayrollGroup, UndeductedObligation, PayentRecord } from '@/types/payroll';
import FoxproRegister from '@/views/FoxproRegister';
import FoxproPayslip from '@/views/FoxproPayslip';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { computeW2Tax } from '@/lib/govPayrollComputation';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import { getEmployeeFilter } from '@/lib/authz';
import { useOrg, matchesOrgScope } from '@/lib/org';
import type { UserProfile } from '@/types/auth';

type ReportTab = 'exports' | 'payrollHistory' | 'payrollRegister' | 'deductionSummary' | 'loanLedger' | 'nthp' | 'undeducted' | 'gsis' | 'philhealth' | 'pagibig' | 'salarySummary' | 'netPaySummary' | 'unassigned' | 'overpayment' | 'bankAdvice' | 'payslip' | 'w2';

interface HistoryMonth {
  period_id: string | null;
  month: number;
  year: number;
  period_name: string;
  status: string;
  pay_date: string | null;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_undeducted: number;
  nthp_pass_count: number;
  nthp_fail_count: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Pick the default period from a newest-first list (sorted year DESC, month
 * DESC, created_at DESC). Prefers an open/draft period — the one payroll runs
 * target — so a stale closed/legacy period sharing the same month can never
 * shadow the real period that holds the payroll entries.
 */
function pickDefaultPeriod(rows: PayPeriod[]): PayPeriod | undefined {
  return rows.find((p) => p.status === 'open' || p.status === 'draft') ?? rows[0];
}

export default function Reports({ category, profile, initialTab }: { category?: PayrollCategory | null; profile?: UserProfile | null; initialTab?: ReportTab }) {
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [tab, setTab] = useState<ReportTab>(initialTab ?? 'exports');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [payrollDeds, setPayrollDeds] = useState<PayrollDeduction[]>([]);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generated, setGenerated] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [groups, setGroups] = useState<PayrollGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [undeductedObs, setUndeductedObs] = useState<UndeductedObligation[]>([]);
  const [payslipEmpId, setPayslipEmpId] = useState('');
  // FOXPRO legacy report engine (Print Register / Payslip overlays)
  const [foxpro, setFoxpro] = useState<'register' | 'payslip' | null>(null);
  const [schools, setSchools] = useState<{ school_code: string; school_name: string }[]>([]);
  const [payent, setPayent] = useState<PayentRecord[]>([]);
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyData, setHistoryData] = useState<HistoryMonth[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Auto-sync: keep the Report Center live with the database ──
  // Refetches every 30s while the tab is visible, and immediately when the
  // tab regains focus/visibility — so DB changes from DBF imports, payroll
  // runs, or other sessions appear without a manual page reload.
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setRefreshTick((t) => t + 1); };
    const id = window.setInterval(bump, 30000);
    document.addEventListener('visibilitychange', bump);
    window.addEventListener('focus', bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('focus', bump);
    };
  }, []);

  // Lazy-load payroll_deductions only when a tab that needs them is active;
  // refetched on each auto-sync tick so re-imported DEDFILE data flows in.
  const PD_TABS: ReportTab[] = ['deductionSummary', 'overpayment', 'loanLedger', 'payslip', 'exports'];
  const pdFetchedTick = useRef(-1);
  useEffect(() => {
    if (!PD_TABS.includes(tab)) return;
    if (payrollDeds.length > 0 && pdFetchedTick.current === refreshTick) return;
    pdFetchedTick.current = refreshTick;
    const pdCols = 'id,employee_id,empno,dedcode,dedid,policyno,agency,type,status,effmm,effyy,termm,teryy,dedamt,principal,interest,charges,proceeds,stacode,created_by,created_at,updated_by,updated_at';
    (async () => {
      const pd = await fetchAll(() => supabase.from('payroll_deductions').select(pdCols).order('empno'));
      setPayrollDeds(pd as PayrollDeduction[]);
    })();
  }, [tab, refreshTick, payrollDeds.length]);

  useEffect(() => {
    (async () => {
      const scopeFilter = profile ? getEmployeeFilter(profile) : null;
      const empCols = 'id,empno,employee_number,lname,last_name,fname,first_name,mi,stacode,regcode,divcode,division_id,basic,basic_salary,trans,pera,aca,rata,ontop,long,payroll_group_id,bank_name,bank_account,account,status,position,poscode,grade,step,taxcode,civilstat,taxref,tin,gsis_pn,gsis_id,phic_id,hdmf_id,hiredate,hire_date,sex,distcode,empname,appel,paymode,dedlnr,dedmed,dedtax,dedpag,netpay,govtlnr,govtecc,govtmed,govtpag,updcode,update,paydate,editor,department,birthdate,clothing,cashallow,mid_bonus,mid_cash,end_bonus,end_cash,add_bonus,special,pib,pagcode,attend,depname1,depname2,depname3,depname4,depdate1,depdate2,depdate3,depdate4';
      const [emp, per, codes, grp, sch] = await Promise.all([
        fetchAll(() => {
          let q = supabase.from('employees').select(empCols).order('lname', { ascending: true });
          if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
          return q;
        }),
        supabase.from('pay_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('created_at', { ascending: false }),
        fetchAll(() => supabase.from('deduction_codes').select('*').order('dedcode')),
        fetchAll(() => supabase.from('payroll_groups').select('*').order('group_code')),
        fetchAll(() => supabase.from('schools').select('school_code, school_name')),
      ]);
      // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
      // unique reference for one division's payroll. Entries are always scoped
      // to the division's own employees below; if the scope matches no period
      // (the division has not created one yet), fall back to the full list so
      // the Report Center is never left dead with no selectable period.
      const scopedPeriods = (per.data ?? []).filter((p) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes }));
      const visiblePeriods = scopedPeriods.length > 0 ? scopedPeriods : (per.data ?? []);
      setEmployees((emp as unknown as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
      setPeriods(visiblePeriods);
      setDedCodes(codes);
      setGroups(grp);
      setSchools(sch);
      // Keep the user's selected period across auto-syncs; otherwise default to
      // the newest open/draft period. Periods are sorted with a created_at
      // tiebreaker, so duplicate month periods (e.g. a legacy "Aug 2026" vs the
      // real "August 2026") resolve to the one that actually holds the payroll.
      setPeriodId((cur) => (cur && visiblePeriods.some((p) => p.id === cur) ? cur : (pickDefaultPeriod(visiblePeriods)?.id ?? '')));
      setLastSynced(new Date());
      setLoading(false);
    })();
  }, [profile, scopedDivisionIds, scopedCodes, refreshTick]);

  useEffect(() => {
    if (!periodId) return;
    (async () => {
      const entryCols = 'id,employee_id,pay_period_id,gross_pay,net_pay,dedlnr,dedmed,dedpag,dedtax,total_deductions,other_deductions,actual_loan_deductions,undeducted_amount,nthp_status,status,processed_at,mandatory_deductions,available_balance,loan_deduction_capacity,govtlnr,govtecc,govtmed,govtpag';
      const [ded, ent, unded, pynt] = await Promise.all([
        fetchAll(() => supabase.from('deductions').select('id,employee_id,pay_period_id,deduction_code,deduction_name,category,amount,source,reference,created_at').eq('pay_period_id', periodId)),
        fetchAll(() => supabase.from('payroll_entries').select(entryCols).eq('pay_period_id', periodId)),
        fetchAll(() => supabase.from('undeducted_obligations').select('*').eq('pay_period_id', periodId)),
        fetchAll(() => supabase.from('payent').select('*').eq('pay_period_id', periodId)),
      ]);
      setDeductions(ded);
      setEntries(ent as PayrollEntry[]);
      setUndeductedObs(unded as UndeductedObligation[]);
      // Half-pay (PYENT hashfile) — fall back to the legacy payperiod string key
      let peRows = (pynt ?? []) as PayentRecord[];
      if (peRows.length === 0) {
        const pname = periods.find((p) => p.id === periodId)?.period_name;
        if (pname) peRows = (await fetchAll(() => supabase.from('payent').select('*').eq('payperiod', pname))) as PayentRecord[];
      }
      setPayent(peRows);
    })();
  }, [periodId, refreshTick]);

  useEffect(() => {
    if (tab !== 'payrollHistory') return;
    (async () => {
      setHistoryLoading(true);
      const scope = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0] : null;
      const { data, error } = await supabase.rpc('get_payroll_history_by_month', {
        p_year: historyYear,
        p_regcode: scope?.regcode ?? null,
        p_divcode: scope?.divcode ?? null,
      });
      setHistoryLoading(false);
      if (error) { console.error('History fetch error:', error.message); return; }
      setHistoryData((data ?? []) as HistoryMonth[]);
      setLastSynced(new Date());
    })();
  }, [tab, historyYear, scopedCodes, refreshTick]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const currentPeriod = periods.find((p) => p.id === periodId);
  const dedCodeMap = useMemo(() => new Map(dedCodes.map((c) => [c.dedcode, c])), [dedCodes]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const selectedGroupLabel = groupFilter === 'all' ? 'All Groups' : groupMap.get(groupFilter)?.group_name ?? 'Group';

  // Filter employees by category (STACODE range) and payroll group
  const scopedEmployees = useMemo(() => {
    let result = employees;
    if (category) result = result.filter((e) => inCategory(e.stacode, category));
    if (groupFilter !== 'all') result = result.filter((e) => e.payroll_group_id === groupFilter);
    return result;
  }, [employees, groupFilter, category]);
  const scopedEmpIds = useMemo(() => new Set(scopedEmployees.map((e) => e.id)), [scopedEmployees]);
  const scopedEntries = useMemo(() => entries.filter((e) => scopedEmpIds.has(e.employee_id)), [entries, scopedEmpIds]);
  const scopedUndeducted = useMemo(() => undeductedObs.filter((u) => scopedEmpIds.has(u.employee_id)), [undeductedObs, scopedEmpIds]);

  // Unassigned STACODE employees
  const unassignedEmployees = useMemo(() =>
    tab !== 'unassigned' ? [] : (category ? employees.filter((e) => inCategory(e.stacode, category)) : employees).filter((e) => !classifyByStacode(e.stacode, groups)),
    [tab, employees, groups, category],
  );

  function stamp(fn: () => void, label: string) {
    fn();
    setGenerated(label);
    setTimeout(() => setGenerated(null), 3000);
  }

  // ── Export functions ──
  function exportMasterfileDbf() {
    const content = generateMasterfileDbf(scopedEmployees);
    downloadFile({ filename: `MASTERFILE_${selectedGroupLabel.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.DBF`, content, mimeType: 'application/dbf' });
  }
  function exportMasterfileCsv() {
    const content = generateMasterfileCsv(scopedEmployees);
    downloadFile({ filename: `MASTERFILE_${selectedGroupLabel.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }
  // Merge payroll_deductions (imported DEDFILE) + deductions (payroll run) into unified DEDFILE list.
  // DEDFILE includes ALL payroll_deductions records (no scope filter) to ensure completeness.
  const mergedDeductions = useMemo(() => {
    // 1) ALL Payroll deductions (imported DEDFILE records) — include every record
    const pdRows: PayrollDeduction[] = [...payrollDeds];
    // 2) Per-period deductions from payroll runs — map to PayrollDeduction shape
    const now = new Date();
    const runDeds: PayrollDeduction[] = deductions
      .filter((d) => d.amount > 0)
      .map((d) => {
        const e = empMap.get(d.employee_id);
        return {
          id: d.id,
          employee_id: d.employee_id,
          empno: e?.empno ?? e?.employee_number ?? '',
          dedcode: d.deduction_code,
          dedid: '',
          policyno: d.reference ?? '',
          agency: '',
          type: (d.category ?? 'Other') as PayrollDeduction['type'],
          status: 'Active' as const,
          effmm: now.getMonth() + 1,
          effyy: now.getFullYear(),
          termm: null,
          teryy: null,
          dedamt: d.amount,
          principal: 0,
          interest: 0,
          charges: 0,
          proceeds: 0,
          created_by: 'Payroll Run',
          created_at: d.created_at ?? now.toISOString(),
          updated_by: '',
          updated_at: now.toISOString(),
        };
      });
    // 3) Merge — dedupe by (empno + dedcode + dedamt) to avoid double-counting
    const seen = new Set<string>();
    const merged: PayrollDeduction[] = [];
    for (const d of [...pdRows, ...runDeds]) {
      const key = `${d.empno}|${d.dedcode}|${d.dedamt}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(d);
      }
    }
    return merged;
  }, [payrollDeds, deductions, empMap]);

  function exportDedfileDbf() {
    // Use ALL employees (not just scoped) so empMap covers every deduction's employee
    const content = generateDedfileDbf(mergedDeductions, employees);
    downloadFile({ filename: `DEDFILE_${selectedGroupLabel.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.DBF`, content, mimeType: 'application/dbf' });
  }
  function exportDedfileCsv() {
    const rows = mergedDeductions.map((d) => {
      const e = empMap.get(d.employee_id ?? '');
      return [d.empno, e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : '', d.dedcode, dedCodeMap.get(d.dedcode)?.dedname ?? '', d.policyno, d.agency, d.type, d.status, d.effmm, d.effyy, d.termm ?? '', d.teryy ?? '', d.dedamt, d.principal, d.interest, d.charges, d.proceeds];
    });
    const content = generateCsv(['EMPNO', 'NAME', 'DEDCODE', 'DEDNAME', 'POLICYNO', 'AGENCY', 'TYPE', 'STATUS', 'EFFMM', 'EFFYY', 'TERMM', 'TERYY', 'DEDAMT', 'PRINCIPAL', 'INTEREST', 'CHARGES', 'PROCEEDS'], rows);
    downloadFile({ filename: `DEDFILE_${selectedGroupLabel.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }
  function exportPayrollDbf() {
    if (!currentPeriod) return;
    const content = generatePayrollDbf(scopedEntries, scopedEmployees, currentPeriod);
    downloadFile({ filename: `PAYROLL_${selectedGroupLabel.replace(/\s/g, '_')}_${currentPeriod.period_name.replace(/\s/g, '_')}.DBF`, content, mimeType: 'application/dbf' });
  }

  // ── Payroll Register data ──
  const registerRows = useMemo(() => {
    if (tab !== 'payrollRegister') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        group: groupMap.get(e?.payroll_group_id ?? '')?.group_code ?? '',
        gross: pe.gross_pay,
        gsis: pe.dedlnr,
        philhealth: pe.dedmed,
        pagibig: pe.dedpag,
        tax: pe.dedtax,
        loans: pe.actual_loan_deductions ?? pe.other_deductions ?? 0,
        undeducted: pe.undeducted_amount ?? 0,
        net: pe.net_pay,
        nthp: pe.nthp_status ?? 'PASS',
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));
  }, [tab, scopedEntries, empMap, groupMap]);

  function exportHistoryCsv() {
    const rows = historyData.map((h) => [
      MONTHS[h.month - 1], h.year, h.period_name, h.status,
      h.employee_count, h.total_gross, h.total_deductions, h.total_net, h.total_undeducted,
      `${h.nthp_pass_count}/${h.employee_count}`,
    ]);
    const content = generateCsv(['Month', 'Year', 'Period Name', 'Status', 'Employees', 'Gross Pay', 'Deductions', 'Net Pay', 'Undeducted', 'NTHP'], rows);
    downloadFile({ filename: `Payroll_History_${historyYear}.csv`, content, mimeType: 'text/csv' });
  }

  function exportPayrollRegisterCsv() {
    const rows = registerRows.map((r) => [r.empno, r.name, r.group, r.gross, r.gsis, r.philhealth, r.pagibig, r.tax, r.loans, r.undeducted, r.net, r.nthp]);
    const content = generateCsv(['EMPNO', 'Employee Name', 'Group', 'Gross Pay', 'GSIS', 'PhilHealth', 'Pag-IBIG', 'W/Tax', 'Loan Ded.', 'Undeducted', 'Net Pay', 'NTHP'], rows);
    downloadFile({ filename: `Payroll_Register_${selectedGroupLabel.replace(/\s/g, '_')}_${currentPeriod?.period_name.replace(/\s/g, '_') ?? ''}.csv`, content, mimeType: 'text/csv' });
  }

  function exportPayrollRegisterDbf() {
    if (!currentPeriod) return;
    const content = generatePayrollDbf(scopedEntries, scopedEmployees, currentPeriod);
    downloadFile({ filename: `Payroll_Register_${selectedGroupLabel.replace(/\s/g, '_')}_${currentPeriod.period_name.replace(/\s/g, '_')}.DBF`, content, mimeType: 'application/dbf' });
  }

  // ── Deduction Summary data (group by DEDCODE, scoped to group) ──
  const scopedDeds = useMemo(() =>
    tab !== 'deductionSummary' && tab !== 'overpayment' ? [] : payrollDeds.filter((d) => scopedEmpIds.has(d.employee_id ?? '')),
    [tab, payrollDeds, scopedEmpIds],
  );
  const dedSummary = useMemo(() => {
    if (tab !== 'deductionSummary') return [];
    const m = new Map<string, { code: string; name: string; count: number; total: number }>();
    scopedDeds.filter((d) => d.status === 'Active').forEach((d) => {
      const cur = m.get(d.dedcode) ?? { code: d.dedcode, name: dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(d.dedamt);
      m.set(d.dedcode, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [tab, scopedDeds, dedCodeMap]);

  function exportDeductionSummaryCsv() {
    const rows = dedSummary.map((d) => [d.code, d.name, d.count, d.total]);
    const content = generateCsv(['Deduction Code', 'Deduction Name', 'Number of Employees', 'Total Deduction Amount'], rows);
    downloadFile({ filename: `Deduction_Summary_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  // ── Loan Ledger data ──
  const filteredLedgerEmps = useMemo(() => {
    if (tab !== 'loanLedger') return [];
    let base = category ? employees.filter((e) => inCategory(e.stacode, category)) : employees;
    if (!empSearch) return base;
    const q = empSearch.toLowerCase();
    return base.filter((e) =>
      (e.empno || e.employee_number || '').toLowerCase().includes(q) ||
      (e.lname || e.last_name || '').toLowerCase().includes(q) ||
      (e.fname || e.first_name || '').toLowerCase().includes(q),
    );
  }, [tab, employees, empSearch, category]);

  const ledgerData = useMemo(() => {
    if (tab !== 'loanLedger') return [];
    return filteredLedgerEmps.flatMap((e) => {
      const empDeds = payrollDeds.filter((d) => d.employee_id === e.id && d.status === 'Active');
      return empDeds.map((d) => ({
        empno: e.empno || e.employee_number || '',
        empName: `${e.lname || e.last_name}, ${e.fname || e.first_name}`,
        dedcode: d.dedcode,
        dedname: dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode,
        policyno: d.policyno,
        principal: Number(d.principal),
        interest: Number(d.interest),
        charges: Number(d.charges),
        proceeds: Number(d.proceeds),
        monthlyAmt: Number(d.dedamt),
        balance: Number(d.principal) - Number(d.proceeds) + Number(d.interest) + Number(d.charges) - (Number(d.dedamt) * 0),
        status: d.status,
      })).sort((a, b) => a.dedcode.localeCompare(b.dedcode));
    });
  }, [tab, filteredLedgerEmps, payrollDeds, dedCodeMap]);

  function exportLoanLedgerCsv() {
    const rows = ledgerData.map((r) => [r.empno, r.empName, r.dedcode, r.dedname, r.policyno, r.principal, r.interest, r.charges, r.proceeds, r.monthlyAmt, r.balance, r.status]);
    const content = generateCsv(['EMPNO', 'Employee Name', 'Deduction Code', 'Deduction Name', 'Policy Number', 'Principal', 'Interest', 'Charges', 'Proceeds', 'Monthly Deduction', 'Balance', 'Status'], rows);
    downloadFile({ filename: `Loan_Ledger_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  const TABS: { id: ReportTab; label: string; icon: typeof FileText }[] = [
    { id: 'payrollHistory', label: 'Payroll History', icon: CalendarDays },
    { id: 'exports', label: 'DBF/CSV Exports', icon: Database },
    { id: 'payrollRegister', label: 'Payroll Register', icon: Calculator },
    { id: 'salarySummary', label: 'Salary Summary', icon: Wallet },
    { id: 'deductionSummary', label: 'Deduction Summary', icon: BarChart3 },
    { id: 'netPaySummary', label: 'Net Pay Summary', icon: FileText },
    { id: 'loanLedger', label: 'Loan Deduction Report', icon: BookOpen },
    { id: 'gsis', label: 'GSIS Report', icon: Landmark },
    { id: 'philhealth', label: 'PhilHealth Report', icon: HeartPulse },
    { id: 'pagibig', label: 'Pag-IBIG Report', icon: Home },
    { id: 'nthp', label: 'NTHP / Undeducted', icon: ShieldAlert },
    { id: 'undeducted', label: 'Undeducted Report', icon: AlertCircle },
    { id: 'overpayment', label: 'Overpayment', icon: AlertCircle },
    { id: 'bankAdvice', label: 'Bank Credit Advice', icon: Building },
    { id: 'payslip', label: 'Payslip', icon: Printer },
    { id: 'unassigned', label: 'Unassigned STACODE', icon: AlertCircle },
    { id: 'w2', label: 'W-2 Annual Tax', icon: FileText },
  ];

  const registerTotal = registerRows.reduce(
    (s, r) => ({ gross: s.gross + r.gross, gsis: s.gsis + r.gsis, philhealth: s.philhealth + r.philhealth, pagibig: s.pagibig + r.pagibig, tax: s.tax + r.tax, loans: s.loans + r.loans, undeducted: (s.undeducted ?? 0) + r.undeducted, net: s.net + r.net }),
    { gross: 0, gsis: 0, philhealth: 0, pagibig: 0, tax: 0, loans: 0, undeducted: 0, net: 0 },
  );

  // ── Salary Summary data ──
  const salarySummary = useMemo(() => {
    if (tab !== 'salarySummary') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        group: groupMap.get(e?.payroll_group_id ?? '')?.group_code ?? '',
        basic: e?.basic ?? e?.basic_salary ?? 0,
        pera: e?.pera ?? 0,
        aca: e?.aca ?? 0,
        rata: e?.rata ?? 0,
        ontop: e?.ontop ?? 0,
        long: e?.long ?? 0,
        gross: pe.gross_pay,
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));
  }, [tab, scopedEntries, empMap, groupMap]);

  // ── Net Pay Summary data ──
  const netPaySummary = useMemo(() => {
    if (tab !== 'netPaySummary') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        group: groupMap.get(e?.payroll_group_id ?? '')?.group_code ?? '',
        gross: pe.gross_pay,
        mandatory: pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax,
        loans: pe.actual_loan_deductions ?? pe.other_deductions ?? 0,
        undeducted: pe.undeducted_amount ?? 0,
        net: pe.net_pay,
        nthp: pe.nthp_status ?? 'PASS',
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));
  }, [tab, scopedEntries, empMap, groupMap]);

  // ── GSIS Report data ──
  const gsisReport = useMemo(() => {
    if (tab !== 'gsis') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        basic: e?.basic ?? e?.basic_salary ?? 0,
        premium: pe.dedlnr,
        govtShare: pe.govtlnr,
        ecc: pe.govtecc,
        total: pe.dedlnr + pe.govtlnr + pe.govtecc,
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));  }, [tab, scopedEntries, empMap]);

  // ── W-2 Annual Tax Report data ──
  // Groups ALL entries for the selected year by employee and computes annual
  // withholding tax reconciliation (COMPUTAX.PRG / W2SUM.PRG).
  const w2Report = useMemo(() => {
    if (tab !== 'w2') return [];
    // Group entries by employee across ALL periods for the year
    const empEntries = new Map<string, PayrollEntry[]>();
    for (const pe of scopedEntries) {
      const list = empEntries.get(pe.employee_id) || [];
      list.push(pe);
      empEntries.set(pe.employee_id, list);
    }
    const results: {
      empno: string; name: string; tin: string; totalIncome: number;
      exemption: number; totalDeductions: number; taxableIncome: number;
      annualTaxDue: number; totalTaxPaid: number; taxPayable: number; isRefund: boolean;
    }[] = [];
    for (const [empId, empRecords] of empEntries) {
      const e = empMap.get(empId);
      const w2 = computeW2Tax(
        empRecords.map(r => ({
          basic: Number(r.gross_pay) || 0,
          trans: 0,
          aca: 0,
          dedLnr: Number(r.dedlnr) || 0,
          dedMed: Number(r.dedmed) || 0,
          dedPag: Number(r.dedpag) || 0,
          dedTax: Number(r.dedtax) || 0,
          taxCode: '01',
        }))
      );
      results.push({
        empno: e?.empno || e?.employee_number || empId,
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        tin: (e as any)?.tin || '',
        totalIncome: w2.totalBasic,
        exemption: w2.exemption,
        totalDeductions: w2.totalLnr + w2.totalMed + w2.totalPag,
        taxableIncome: w2.taxableIncome,
        annualTaxDue: w2.annualTaxDue,
        totalTaxPaid: w2.totalTaxPaid,
        taxPayable: w2.taxPayable,
        isRefund: w2.isRefund,
      });
    }
    return results.sort((a, b) => a.empno.localeCompare(b.empno));
  }, [tab, scopedEntries, empMap]);

  const w2Pag = usePagination(tab === 'w2' ? w2Report : [], 15, `${periodId}-w2`);



  // ── PhilHealth Report data ──
  const philhealthReport = useMemo(() => {
    if (tab !== 'philhealth') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        basic: e?.basic ?? e?.basic_salary ?? 0,
        employeeShare: pe.dedmed,
        govtShare: pe.govtmed,
        total: pe.dedmed + pe.govtmed,
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));  }, [tab, scopedEntries, empMap]);

  // ── Pag-IBIG Report data ──
  const pagibigReport = useMemo(() => {
    if (tab !== 'pagibig') return [];
    return scopedEntries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        basic: e?.basic ?? e?.basic_salary ?? 0,
        employeeShare: pe.dedpag,
        govtShare: pe.govtpag,
        total: pe.dedpag + pe.govtpag,
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno));  }, [tab, scopedEntries, empMap]);

  // ── Undeducted Report data ──
  const undeductedReport = useMemo(() => {
    if (tab !== 'undeducted') return { rows: [], codeSummary: [], stationSummary: [], totalUndeducted: 0, totalScheduled: 0, affectedEmployees: 0 };
    const rows = scopedUndeducted.map((u) => {
      const e = empMap.get(u.employee_id);
      const pe = scopedEntries.find((p) => p.employee_id === u.employee_id);
      return {
        empno: e?.empno || e?.employee_number || '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        stacode: e?.stacode ?? '',
        group: groupMap.get(e?.payroll_group_id ?? '')?.group_code ?? '',
        dedcode: u.deduction_code,
        description: u.deduction_description,
        scheduled: Number(u.scheduled_amount),
        undeducted: Number(u.undeducted_amount),
        station: u.station_code,
        reason: u.reason,
        netPay: pe?.net_pay ?? 0,
        nthp: pe?.nthp_status ?? 'PASS',
      };
    }).sort((a, b) => a.empno.localeCompare(b.empno) || a.dedcode.localeCompare(b.dedcode));

    const byCode = new Map<string, { code: string; name: string; count: number; total: number }>();
    rows.forEach((r) => {
      const cur = byCode.get(r.dedcode) ?? { code: r.dedcode, name: r.description, count: 0, total: 0 };
      cur.count += 1;
      cur.total += r.undeducted;
      byCode.set(r.dedcode, cur);
    });
    const codeSummary = Array.from(byCode.values()).sort((a, b) => b.total - a.total);

    const byStation = new Map<string, { station: string; count: number; total: number }>();
    rows.forEach((r) => {
      const st = r.station || '(unassigned)';
      const cur = byStation.get(st) ?? { station: st, count: 0, total: 0 };
      cur.count += 1;
      cur.total += r.undeducted;
      byStation.set(st, cur);
    });
    const stationSummary = Array.from(byStation.values()).sort((a, b) => b.total - a.total);

    return {
      rows,
      codeSummary,
      stationSummary,
      totalUndeducted: rows.reduce((s, r) => s + r.undeducted, 0),
      totalScheduled: rows.reduce((s, r) => s + r.scheduled, 0),
      affectedEmployees: new Set(rows.map((r) => r.empno)).size,
    };
  }, [tab, scopedUndeducted, empMap, scopedEntries, groupMap]);

  function exportUndeductedCsv() {
    const rows = undeductedReport.rows.map((r) => [r.empno, r.name, r.stacode, r.group, r.dedcode, r.description, r.scheduled, r.undeducted, r.station, r.reason, r.netPay, r.nthp]);
    const content = generateCsv(['EMPNO', 'Employee Name', 'STACODE', 'Group', 'Deduction Code', 'Description', 'Scheduled Amount', 'Undeducted Amount', 'Station Code', 'Reason', 'Net Pay', 'NTHP Status'], rows);
    downloadFile({ filename: `Undeducted_Report_${currentPeriod?.period_name.replace(/\s/g, '_') ?? ''}.csv`, content, mimeType: 'text/csv' });
  }

  // ── NTHP / Undeducted Obligations Report ──
  const nthpReport = useMemo(() => {
    if (tab !== 'nthp') return { total: 0, pass: 0, fail: 0, belowThreshold: 0, totalUndeducted: 0, obligations: [], belowNthpEntries: [] };
    const belowNthp = scopedEntries.filter((pe) => pe.net_pay < 5000);
    return {
      total: scopedEntries.length,
      pass: scopedEntries.filter((e) => (e.nthp_status ?? 'PASS') === 'PASS').length,
      fail: scopedEntries.filter((e) => e.nthp_status === 'FAIL').length,
      belowThreshold: belowNthp.length,
      totalUndeducted: scopedUndeducted.reduce((s, u) => s + Number(u.undeducted_amount), 0),
      obligations: scopedUndeducted,
      belowNthpEntries: belowNthp.map((pe) => {
        const e = empMap.get(pe.employee_id);
        return {
          empno: e?.empno || e?.employee_number || '',
          name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
          net: pe.net_pay,
          undeducted: pe.undeducted_amount ?? 0,
        };
      }),
    };
  }, [tab, scopedEntries, scopedUndeducted, empMap]);

  // ── Overpayment Report data ──
  const overpaymentReport = useMemo(() => {
    if (tab !== 'overpayment') return [];
    const opCodes = ['SALARY', 'PERA', 'PVP', 'OVERPAY'];
    return scopedDeds
      .filter((d) => d.status === 'Active' && opCodes.some((c) => d.dedcode.toUpperCase().includes(c)))
      .map((d) => {
        const e = empMap.get(d.employee_id ?? '');
        const principal = Number(d.principal);
        const proceeds = Number(d.proceeds);
        const interest = Number(d.interest);
        const charges = Number(d.charges);
        return {
          empno: e?.empno || e?.employee_number || '',
          name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
          stacode: e?.stacode ?? '',
          category: d.dedcode.toUpperCase().includes('PERA') ? 'PERA' : d.dedcode.toUpperCase().includes('PVP') ? 'PVP' : 'Salary',
          dedcode: d.dedcode,
          dedname: dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode,
          amount: Number(d.dedamt),
          principal,
          balance: principal + interest + charges - proceeds,
        };
      }).sort((a, b) => a.empno.localeCompare(b.empno));
  }, [tab, scopedDeds, empMap, dedCodeMap]);

  function exportOverpaymentCsv() {
    const rows = overpaymentReport.map((r) => [r.empno, r.name, r.stacode, r.category, r.dedcode, r.dedname, r.amount, r.principal, r.balance]);
    const content = generateCsv(['EMPNO', 'Employee Name', 'STACODE', 'Category', 'Ded Code', 'Description', 'Monthly Amount', 'Principal', 'Balance'], rows);
    downloadFile({ filename: `Overpayment_Report_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  // ── Bank Credit Advice data ──
  const bankAdvice = useMemo(() => {
    if (tab !== 'bankAdvice') return [];
    return scopedEntries
      .filter((pe) => pe.status === 'Posted')
      .map((pe) => {
        const e = empMap.get(pe.employee_id);
        return {
          bank: e?.bank_name ?? '',
          empno: e?.empno || e?.employee_number || '',
          name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
          account: e?.bank_account ?? e?.account ?? '',
          net: pe.net_pay,
        };
      })
      .sort((a, b) => (a.bank || 'ZZZ').localeCompare(b.bank || 'ZZZ') || a.empno.localeCompare(b.empno));  }, [tab, scopedEntries, empMap]);

  function exportBankAdviceCsv() {
    const rows = bankAdvice.map((r) => [r.bank || 'N/A', r.empno, r.name, r.account || 'N/A', r.net]);
    const content = generateCsv(['Bank', 'EMPNO', 'Employee Name', 'Account Number', 'Net Amount'], rows);
    downloadFile({ filename: `Bank_Credit_Advice_${currentPeriod?.period_name.replace(/\s/g, '_') ?? ''}.csv`, content, mimeType: 'text/csv' });
  }

  // ── Payslip data ──
  const payslipData = useMemo(() => {
    if (!payslipEmpId) return null;
    const pe = scopedEntries.find((e) => e.employee_id === payslipEmpId);
    if (!pe) return null;
    const e = empMap.get(payslipEmpId);
    if (!e) return null;

    const empDeds = payrollDeds.filter((d) => d.employee_id === payslipEmpId && d.status === 'Active');
    const mandatory = deductions.filter((d) => d.employee_id === payslipEmpId);
    const empUndeducted = scopedUndeducted.filter((u) => u.employee_id === payslipEmpId);
    const mandatoryTotal = pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax;
    const loanTotal = pe.actual_loan_deductions ?? pe.other_deductions ?? 0;
    const undeductedTotal = empUndeducted.reduce((s, u) => s + Number(u.undeducted_amount), 0);

    return {
      empno: e.empno || e.employee_number || '',
      name: `${e.lname || e.last_name}, ${e.fname || e.first_name}`,
      stacode: e.stacode ?? '',
      position: e.position ?? '',
      basic: e.basic ?? e.basic_salary ?? 0,
      pera: e.pera ?? 0,
      aca: e.aca ?? 0,
      rata: e.rata ?? 0,
      long: e.long ?? 0,
      gross: pe.gross_pay,
      mandatory: mandatory.map((d) => ({ dedcode: d.deduction_code, dedamt: d.amount })),
      loans: empDeds.map((d) => ({ dedcode: d.dedcode, dedamt: Number(d.dedamt) })),
      mandatoryTotal,
      loanTotal,
      net: pe.net_pay,
      nthp: pe.nthp_status ?? 'PASS',
      undeducted: empUndeducted,
      undeductedTotal,
    };
  }, [payslipEmpId, scopedEntries, empMap, payrollDeds, deductions, scopedUndeducted]);

  function exportPayslipCsv() {
    if (!payslipData) return;
    const rows: (string | number)[][] = [
      ['Employee', payslipData.name],
      ['EMP No', payslipData.empno],
      ['Period', currentPeriod?.period_name ?? ''],
      ['Gross Pay', payslipData.gross],
      ['Total Deductions', payslipData.mandatoryTotal + payslipData.loanTotal],
      ['Net Pay', payslipData.net],
      ['NTHP Status', payslipData.nthp],
    ];
    const content = generateCsv(['Field', 'Value'], rows);
    downloadFile({ filename: `Payslip_${payslipData.empno}_${currentPeriod?.period_name.replace(/\s/g, '_') ?? ''}.csv`, content, mimeType: 'text/csv' });
  }

  // ── Pagination hooks for all report tables ──
  const regPag = usePagination(tab === 'payrollRegister' ? registerRows : [], 10, `${periodId}-${groupFilter}`);
  const dedPag = usePagination(tab === 'deductionSummary' ? dedSummary : [], 10, `${periodId}-${groupFilter}`);
  const salaryPag = usePagination(tab === 'salarySummary' ? salarySummary : [], 10, `${periodId}-${groupFilter}`);
  const netPayPag = usePagination(tab === 'netPaySummary' ? netPaySummary : [], 10, `${periodId}-${groupFilter}`);
  const gsisPag = usePagination(tab === 'gsis' ? gsisReport : [], 10, `${periodId}-${groupFilter}`);
  const philPag = usePagination(tab === 'philhealth' ? philhealthReport : [], 10, `${periodId}-${groupFilter}`);
  const pagibigPag = usePagination(tab === 'pagibig' ? pagibigReport : [], 10, `${periodId}-${groupFilter}`);
  const nthpPag = usePagination(tab === 'nthp' ? nthpReport.obligations : [], 10, `${periodId}-${groupFilter}`);
  const undeductedPag = usePagination(tab === 'undeducted' ? undeductedReport.rows : [], 10, `${periodId}-${groupFilter}`);
  const ledgerPag = usePagination(tab === 'loanLedger' ? ledgerData : [], 10, `${periodId}-${groupFilter}`);
  const overpaymentPag = usePagination(tab === 'overpayment' ? overpaymentReport : [], 10, `${periodId}-${groupFilter}`);
  const bankPag = usePagination(tab === 'bankAdvice' ? bankAdvice : [], 10, `${periodId}-${groupFilter}`);
  const unassignedPag = usePagination(tab === 'unassigned' ? unassignedEmployees : [], 10, undefined);

  // ── Categorized sidebar tabs for QuickBooks-style layout ──
  // ── Search state for filtering tables ──
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Top bar: Period/Group selectors + Search + Sync */}
      <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-slate-50/60">
          <div className="flex items-center gap-3 flex-wrap">
            {tab === 'payrollHistory' ? (
              <>
                <label className="text-xs font-medium text-slate-500">Year:</label>
                <select value={historyYear} onChange={(e) => setHistoryYear(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-w-[120px] bg-white">
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className="text-xs font-medium text-slate-500">Period:</label>
                <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-w-[200px] bg-white">
                  {periods.length === 0 && <option>No pay periods</option>}
                  {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name}</option>)}
                </select>

                {tab !== 'payrollRegister' && (<>
                  <label className="text-xs font-medium text-slate-500">Group:</label>
                  <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-w-[160px] bg-white">
                    <option value="all">All Groups</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name} ({g.group_code})</option>)}
                  </select>
                </>)}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-48 bg-white"
              />
            </div>
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              title="Refresh from database"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync
            </button>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-medium tabular-nums">
              <span className={`w-1.5 h-1.5 rounded-full ${lastSynced ? 'bg-emerald-500' : 'bg-slate-300'} animate-pulse`} />
              {lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : 'Auto-sync 30s'}
            </span>
            {generated && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" /> {generated}
              </div>
            )}
          </div>
        </div>

      <div className="p-5">
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">Loading reports…</div>
      ) : tab === 'exports' ? (
        <>
          <div className="flex items-start gap-3 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 text-white">
            <Database className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-sm">DBF Report Format</h2>
              <p className="text-xs text-slate-300 mt-1">All DBF files are generated in dBASE III format — compatible with legacy DepEd payroll systems. Files download directly with a <span className="font-mono text-emerald-400">.DBF</span> extension.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[
              { title: 'MASTFILE.DBF', desc: 'Complete employee master list (80-column FoxPro format)', icon: Users, color: 'bg-blue-500', actions: [{ label: 'DBF', primary: true, fn: exportMasterfileDbf }, { label: 'CSV', primary: false, fn: exportMasterfileCsv }] },
              { title: 'DEDFILE.DBF', desc: 'All deduction records with loan details and policy numbers', icon: FileText, color: 'bg-amber-500', actions: [{ label: 'DBF', primary: true, fn: exportDedfileDbf }, { label: 'CSV', primary: false, fn: exportDedfileCsv }] },
              { title: 'PAYROLL.DBF', desc: 'Payroll summary per employee for the selected period', icon: Calculator, color: 'bg-emerald-500', actions: [{ label: 'DBF', primary: true, fn: exportPayrollDbf }, { label: 'CSV', primary: false, fn: exportPayrollRegisterCsv }] },
            ].map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.title} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${r.color} flex items-center justify-center shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 text-sm">{r.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">{r.desc}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                    {r.actions.map((a) => (
                      <button key={a.label} onClick={() => stamp(a.fn, `${r.title} ${a.label} exported`)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${a.primary ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <Download className="w-4 h-4" /> {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : tab === 'payrollHistory' ? (
        <div className="space-y-4">
          {/* Year header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 text-white">
            <div className="flex items-center gap-3">
              <CalendarDays className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <h2 className="font-semibold text-sm">Payroll History — {historyYear}</h2>
                <p className="text-xs text-slate-300 mt-0.5">Monthly payroll archive from January to December</p>
              </div>
            </div>
            <button onClick={() => stamp(exportHistoryCsv, 'Payroll History CSV exported')} disabled={historyData.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>

          {/* Year totals */}
          {historyData.length > 0 && (() => {
            const posted = historyData.filter((h) => h.status === 'closed').length;
            const computed = historyData.filter((h) => h.status === 'open').length;
            const drafts = historyData.filter((h) => h.status === 'draft').length;
            const totalGross = historyData.reduce((s, h) => s + Number(h.total_gross), 0);
            const totalNet = historyData.reduce((s, h) => s + Number(h.total_net), 0);
            const totalDed = historyData.reduce((s, h) => s + Number(h.total_deductions), 0);
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Posted Periods</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{posted} <span className="text-xs font-normal text-slate-400">/ 12</span></p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">In Progress</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{computed + drafts}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">YTD Gross</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{currency(totalGross)}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">YTD Net Pay</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{currency(totalNet)}</p>
                </div>
              </div>
            );
          })()}

          {/* Month cards */}
          {historyLoading ? (
            <div className="py-20 flex justify-center"><LoadingIndicator /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MONTHS.map((monthName, i) => {
                const data = historyData.find((h) => h.month === i + 1);
                const hasEntries = data && data.employee_count > 0;
                const status = data?.status;
                const statusBg = status === 'closed' ? 'bg-emerald-50 text-emerald-700' : status === 'open' ? 'bg-blue-50 text-blue-700' : status === 'draft' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400';
                const statusLabel = status === 'closed' ? 'Posted' : status === 'open' ? 'Computed' : status === 'draft' ? 'Draft' : 'No Period';
                const accentBar = status === 'closed' ? 'bg-emerald-500' : status === 'open' ? 'bg-blue-500' : status === 'draft' ? 'bg-amber-500' : 'bg-slate-200';
                return (
                  <div key={monthName} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className={`h-1 ${accentBar}`} />
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-slate-800 text-sm">{monthName}</h4>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${statusBg}`}>{statusLabel}</span>
                      </div>
                      {hasEntries ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Employees</span>
                            <span className="font-semibold text-slate-700 tabular-nums">{data!.employee_count}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Gross Pay</span>
                            <span className="font-medium text-slate-700 tabular-nums">{currency(Number(data!.total_gross))}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Deductions</span>
                            <span className="font-medium text-rose-600 tabular-nums">{currency(Number(data!.total_deductions))}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500">Net Pay</span>
                            <span className="font-bold text-emerald-600 tabular-nums">{currency(Number(data!.total_net))}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">NTHP</span>
                            <span className={`font-medium tabular-nums ${data!.nthp_fail_count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {data!.nthp_pass_count}/{data!.employee_count} PASS
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 text-center">
                          <CalendarDays className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                          <p className="text-xs text-slate-400">{data ? 'No payroll run' : 'Period not created'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === 'payrollRegister' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Payroll Register — {currentPeriod?.period_name ?? '—'}</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setFoxpro('register')} disabled={entries.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
                <Printer className="w-4 h-4" /> Print Register (FOXPRO)
              </button>
              <button onClick={() => stamp(exportPayrollRegisterDbf, 'Payroll Register DBF exported')} disabled={registerRows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors">
                <Database className="w-4 h-4" /> Export DBF
              </button>
              <button onClick={() => stamp(exportPayrollRegisterCsv, 'Payroll Register CSV exported')} disabled={registerRows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>
          {registerRows.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Calculator className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-500">No payroll entries for this period.</p>
              <p className="text-xs text-slate-400 mt-1">Go to <span className="font-medium text-blue-600">Payroll</span> in the sidebar and click <span className="font-medium text-emerald-600">Run Payroll</span> to compute payroll for this period first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-right px-4 py-3 font-medium">Gross Pay</th>
                    <th className="text-right px-4 py-3 font-medium">GSIS</th>
                    <th className="text-right px-4 py-3 font-medium">PhilHealth</th>
                    <th className="text-right px-4 py-3 font-medium">Pag-IBIG</th>
                    <th className="text-right px-4 py-3 font-medium">W/Tax</th>
                    <th className="text-right px-4 py-3 font-medium">Loan Ded.</th>
                    <th className="text-right px-4 py-3 font-medium">Undeducted</th>
                    <th className="text-right px-4 py-3 font-medium">Final Net Pay</th>
                    <th className="text-center px-4 py-3 font-medium">NTHP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {regPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.gsis)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.philhealth)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.pagibig)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.tax)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.loans)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">{currency(r.undeducted)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{currency(r.net)}</td>
                      <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.nthp === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{r.nthp}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-800">
                    <td className="px-4 py-3" colSpan={2}>TOTAL ({registerRows.length} employees)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.gsis)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.philhealth)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.pagibig)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.tax)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(registerTotal.loans)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{currency(registerTotal.undeducted)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{currency(registerTotal.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={regPag.page} totalPages={regPag.totalPages} total={regPag.total} onPageChange={regPag.setPage} label="records" />
        </div>
      ) : tab === 'deductionSummary' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Deduction Summary by Code — {selectedGroupLabel}</h3>
            <button onClick={() => stamp(exportDeductionSummaryCsv, 'Deduction Summary CSV exported')} disabled={dedSummary.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          {dedSummary.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No active deductions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Deduction Code</th>
                    <th className="text-left px-4 py-3 font-medium">Deduction Name</th>
                    <th className="text-right px-4 py-3 font-medium">Employees</th>
                    <th className="text-right px-4 py-3 font-medium">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dedPag.pagedItems.map((d) => (
                    <tr key={d.code} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono font-semibold">{d.code}</span></td>
                      <td className="px-4 py-3 text-slate-700">{d.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{d.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-800">
                    <td className="px-4 py-3" colSpan={2}>TOTAL ({dedSummary.length} codes)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{dedSummary.reduce((s, d) => s + d.count, 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(dedSummary.reduce((s, d) => s + d.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={dedPag.page} totalPages={dedPag.totalPages} total={dedPag.total} onPageChange={dedPag.setPage} label="codes" />
        </div>
      ) : tab === 'salarySummary' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Salary Summary — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
          </div>
          {salarySummary.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No entries for this period/group.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-center px-4 py-3 font-medium">Group</th>
                    <th className="text-right px-4 py-3 font-medium">Basic</th>
                    <th className="text-right px-4 py-3 font-medium">PERA</th>
                    <th className="text-right px-4 py-3 font-medium">ACA</th>
                    <th className="text-right px-4 py-3 font-medium">RATA</th>
                    <th className="text-right px-4 py-3 font-medium">On Top</th>
                    <th className="text-right px-4 py-3 font-medium">Longevity</th>
                    <th className="text-right px-4 py-3 font-medium">Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salaryPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-600">{r.group || '—'}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.basic)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.pera)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.aca)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.rata)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.ontop)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.long)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={salaryPag.page} totalPages={salaryPag.totalPages} total={salaryPag.total} onPageChange={salaryPag.setPage} />
        </div>
      ) : tab === 'netPaySummary' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Net Pay Summary — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
          </div>
          {netPaySummary.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No entries for this period/group.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-center px-4 py-3 font-medium">Group</th>
                    <th className="text-right px-4 py-3 font-medium">Gross</th>
                    <th className="text-right px-4 py-3 font-medium">Mandatory</th>
                    <th className="text-right px-4 py-3 font-medium">Loans Applied</th>
                    <th className="text-right px-4 py-3 font-medium">Undeducted</th>
                    <th className="text-right px-4 py-3 font-medium">Net Pay</th>
                    <th className="text-center px-4 py-3 font-medium">NTHP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {netPayPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-600">{r.group || '—'}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.mandatory)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.loans)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">{currency(r.undeducted)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{currency(r.net)}</td>
                      <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.nthp === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{r.nthp}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={netPayPag.page} totalPages={netPayPag.totalPages} total={netPayPag.total} onPageChange={netPayPag.setPage} />
        </div>
      ) : tab === 'gsis' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">GSIS Report — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
          </div>
          {gsisReport.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No entries for this period/group.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-right px-4 py-3 font-medium">Basic Salary</th>
                    <th className="text-right px-4 py-3 font-medium">Employee Premium (9%)</th>
                    <th className="text-right px-4 py-3 font-medium">Govt Share (12%)</th>
                    <th className="text-right px-4 py-3 font-medium">ECC</th>
                    <th className="text-right px-4 py-3 font-medium">Total GSIS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gsisPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.basic)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.premium)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.govtShare)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.ecc)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-800">
                    <td className="px-4 py-3" colSpan={3}>TOTAL ({gsisReport.length} employees)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(gsisReport.reduce((s, r) => s + r.premium, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(gsisReport.reduce((s, r) => s + r.govtShare, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(gsisReport.reduce((s, r) => s + r.ecc, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(gsisReport.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={gsisPag.page} totalPages={gsisPag.totalPages} total={gsisPag.total} onPageChange={gsisPag.setPage} label="employees" />
        </div>
      ) : tab === 'philhealth' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">PhilHealth Report — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
          </div>
          {philhealthReport.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No entries for this period/group.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-right px-4 py-3 font-medium">Basic Salary</th>
                    <th className="text-right px-4 py-3 font-medium">Employee Share</th>
                    <th className="text-right px-4 py-3 font-medium">Govt Share</th>
                    <th className="text-right px-4 py-3 font-medium">Total PhilHealth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {philPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.basic)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.employeeShare)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.govtShare)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-800">
                    <td className="px-4 py-3" colSpan={3}>TOTAL ({philhealthReport.length} employees)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(philhealthReport.reduce((s, r) => s + r.employeeShare, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(philhealthReport.reduce((s, r) => s + r.govtShare, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(philhealthReport.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={philPag.page} totalPages={philPag.totalPages} total={philPag.total} onPageChange={philPag.setPage} label="employees" />
        </div>
      ) : tab === 'pagibig' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Pag-IBIG Report — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
          </div>
          {pagibigReport.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No entries for this period/group.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-right px-4 py-3 font-medium">Basic Salary</th>
                    <th className="text-right px-4 py-3 font-medium">Employee Share</th>
                    <th className="text-right px-4 py-3 font-medium">Govt Share</th>
                    <th className="text-right px-4 py-3 font-medium">Total Pag-IBIG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagibigPag.pagedItems.map((r) => (
                    <tr key={r.empno} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{currency(r.basic)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.employeeShare)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.govtShare)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-800">
                    <td className="px-4 py-3" colSpan={3}>TOTAL ({pagibigReport.length} employees)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(pagibigReport.reduce((s, r) => s + r.employeeShare, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(pagibigReport.reduce((s, r) => s + r.govtShare, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(pagibigReport.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={pagibigPag.page} totalPages={pagibigPag.totalPages} total={pagibigPag.total} onPageChange={pagibigPag.setPage} label="employees" />
        </div>
      ) : tab === 'nthp' ? (
        <div className="space-y-4">
          {/* NTHP Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Entries</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{nthpReport.total}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">NTHP Pass</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{nthpReport.pass}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Below ₱5,000</div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{nthpReport.belowThreshold}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Undeducted</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{currency(nthpReport.totalUndeducted)}</div>
            </div>
          </div>

          {/* Undeducted Obligations Detail */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Undeducted Obligations — {selectedGroupLabel}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Loan deductions skipped to preserve ₱5,000 NTHP floor (DepEd Order No. 05, s. 2018)</p>
            </div>
            {nthpReport.obligations.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                No undeducted obligations. All employees passed NTHP check.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                      <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                      <th className="text-left px-4 py-3 font-medium">Ded. Code</th>
                      <th className="text-left px-4 py-3 font-medium">Description</th>
                      <th className="text-right px-4 py-3 font-medium">Undeducted Amount</th>
                      <th className="text-left px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nthpPag.pagedItems.map((u) => {
                      const e = empMap.get(u.employee_id);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{e?.empno || e?.employee_number || '—'}</td>
                          <td className="px-4 py-3 text-slate-800">{e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown'}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-mono font-semibold">{u.deduction_code}</span></td>
                          <td className="px-4 py-3 text-slate-600">{u.deduction_description}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-600">{currency(Number(u.undeducted_amount))}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{u.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={nthpPag.page} totalPages={nthpPag.totalPages} total={nthpPag.total} onPageChange={nthpPag.setPage} label="obligations" />
          </div>
        </div>
      ) : tab === 'undeducted' ? (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Affected Employees</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{undeductedReport.affectedEmployees}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Undeducted Items</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{undeductedReport.rows.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Undeducted Amount</div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{currency(undeductedReport.totalUndeducted)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Scheduled Amount</div>
              <div className="text-2xl font-bold text-slate-700 mt-1">{currency(undeductedReport.totalScheduled)}</div>
            </div>
          </div>

          {/* By Deduction Code Summary */}
          {undeductedReport.codeSummary.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Summary by Deduction Code — {selectedGroupLabel}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">Deduction Code</th>
                      <th className="text-left px-4 py-3 font-medium">Description</th>
                      <th className="text-right px-4 py-3 font-medium">Employees</th>
                      <th className="text-right px-4 py-3 font-medium">Total Undeducted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {undeductedReport.codeSummary.map((c) => (
                      <tr key={c.code} className="hover:bg-slate-50">
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-mono font-semibold">{c.code}</span></td>
                        <td className="px-4 py-3 text-slate-700">{c.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{c.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-rose-600">{currency(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-800">
                      <td className="px-4 py-3" colSpan={2}>TOTAL ({undeductedReport.codeSummary.length} codes)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{undeductedReport.codeSummary.reduce((s, c) => s + c.count, 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{currency(undeductedReport.totalUndeducted)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* By Station Summary */}
          {undeductedReport.stationSummary.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Summary by Station Code</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">Station Code</th>
                      <th className="text-right px-4 py-3 font-medium">Undeducted Items</th>
                      <th className="text-right px-4 py-3 font-medium">Total Undeducted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {undeductedReport.stationSummary.map((s) => (
                      <tr key={s.station} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.station}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{s.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-rose-600">{currency(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed Undeducted Obligations */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Undeducted Obligations Detail — {selectedGroupLabel} — {currentPeriod?.period_name ?? '—'}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Loan deductions skipped to preserve the ₱5,000 NTHP floor</p>
              </div>
              <button onClick={() => stamp(exportUndeductedCsv, 'Undeducted Report CSV exported')} disabled={undeductedReport.rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
            {undeductedReport.rows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                No undeducted obligations for this period. All loan deductions were applied successfully.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                      <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                      <th className="text-center px-4 py-3 font-medium">STACODE</th>
                      <th className="text-left px-4 py-3 font-medium">Ded. Code</th>
                      <th className="text-left px-4 py-3 font-medium">Description</th>
                      <th className="text-right px-4 py-3 font-medium">Scheduled</th>
                      <th className="text-right px-4 py-3 font-medium">Undeducted</th>
                      <th className="text-right px-4 py-3 font-medium">Net Pay</th>
                      <th className="text-left px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {undeductedPag.pagedItems.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                        <td className="px-4 py-3 text-slate-800">{r.name}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">{r.stacode || '—'}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-mono font-semibold">{r.dedcode}</span></td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{r.description}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.scheduled)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-rose-600">{currency(r.undeducted)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.netPay)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-800">
                      <td className="px-4 py-3" colSpan={5}>TOTAL ({undeductedReport.rows.length} items, {undeductedReport.affectedEmployees} employees)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{currency(undeductedReport.totalScheduled)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{currency(undeductedReport.totalUndeducted)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <Pagination page={undeductedPag.page} totalPages={undeductedPag.totalPages} total={undeductedPag.total} onPageChange={undeductedPag.setPage} label="items" />
          </div>
        </div>
      ) : tab === 'loanLedger' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search employee no or name…" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <button onClick={() => stamp(exportLoanLedgerCsv, 'Loan Ledger CSV exported')} disabled={ledgerData.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {ledgerData.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No active loan records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                      <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                      <th className="text-left px-4 py-3 font-medium">Ded. Code</th>
                      <th className="text-left px-4 py-3 font-medium">Deduction Name</th>
                      <th className="text-left px-4 py-3 font-medium">Policy No.</th>
                      <th className="text-right px-4 py-3 font-medium">Principal</th>
                      <th className="text-right px-4 py-3 font-medium">Interest</th>
                      <th className="text-right px-4 py-3 font-medium">Charges</th>
                      <th className="text-right px-4 py-3 font-medium">Proceeds</th>
                      <th className="text-right px-4 py-3 font-medium">Monthly</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerPag.pagedItems.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                        <td className="px-4 py-3 text-slate-800">{r.empName}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono font-semibold">{r.dedcode}</span></td>
                        <td className="px-4 py-3 text-slate-600">{r.dedname}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.policyno || '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.principal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.interest)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.charges)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.proceeds)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.monthlyAmt)}</td>
                        <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={ledgerPag.page} totalPages={ledgerPag.totalPages} total={ledgerPag.total} onPageChange={ledgerPag.setPage} label="records" />
          </div>
        </div>
      ) : tab === 'overpayment' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Overpayment Report (Salary / PERA / PVP)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Employees with overpayment deductions for salary, PERA, and PVP recovery</p>
            </div>
            <button onClick={exportOverpaymentCsv} disabled={overpaymentReport.length === 0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          {overpaymentReport.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
              No overpayment deductions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-left px-4 py-3 font-medium">STACODE</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Ded Code</th>
                    <th className="text-left px-4 py-3 font-medium">Description</th>
                    <th className="text-right px-4 py-3 font-medium">Monthly Amount</th>
                    <th className="text-right px-4 py-3 font-medium">Principal</th>
                    <th className="text-right px-4 py-3 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overpaymentPag.pagedItems.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.stacode}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{r.category}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.dedcode}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs">{r.dedname}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800">{currency(r.amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{currency(r.principal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{currency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-800">
                    <td colSpan={6} className="px-4 py-3 text-right">Total Monthly Recovery:</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(overpaymentReport.reduce((s, r) => s + r.amount, 0))}</td>
                    <td colSpan={2} className="px-4 py-3 text-right tabular-nums">{currency(overpaymentReport.reduce((s, r) => s + r.balance, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={overpaymentPag.page} totalPages={overpaymentPag.totalPages} total={overpaymentPag.total} onPageChange={overpaymentPag.setPage} label="records" />
        </div>
      ) : tab === 'bankAdvice' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Bank Credit Advice</h3>
              <p className="text-xs text-slate-500 mt-0.5">Net pay amounts grouped by bank for payroll crediting</p>
            </div>
            <button onClick={exportBankAdviceCsv} disabled={bankAdvice.length === 0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          {bankAdvice.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              No posted payroll entries for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Bank</th>
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-left px-4 py-3 font-medium">Account Number</th>
                    <th className="text-right px-4 py-3 font-medium">Net Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankPag.pagedItems.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-medium">{r.bank || 'N/A'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                      <td className="px-4 py-3 text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.account || 'N/A'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{currency(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-800">
                    <td colSpan={4} className="px-4 py-3 text-right">Total Credit:</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(bankAdvice.reduce((s, r) => s + r.net, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination page={bankPag.page} totalPages={bankPag.totalPages} total={bankPag.total} onPageChange={bankPag.setPage} label="records" />
        </div>
      ) : tab === 'payslip' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Payslip Generator</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select an employee to view their detailed payslip for this period</p>
              </div>
              <div className="flex items-center gap-2">
                {entries.length > 0 && (
                  <button onClick={() => setFoxpro('payslip')} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors" title={payslipEmpId ? 'Prints the selected employee only' : 'Prints one page per employee'}>
                    <Printer className="w-3.5 h-3.5" /> Print Payslip (FOXPRO)
                  </button>
                )}
                {payslipData && (
                  <button onClick={exportPayslipCsv} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                )}
              </div>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Select Employee</label>
              <select value={payslipEmpId} onChange={(e) => setPayslipEmpId(e.target.value)} className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">— Choose an employee —</option>
                {scopedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.empno || e.employee_number} — {e.lname || e.last_name}, {e.fname || e.first_name}</option>
                ))}
              </select>
            </div>
          </div>
          {payslipData && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">PAYSLIP</h2>
                    <p className="text-xs text-slate-500">{currentPeriod?.period_name ?? 'N/A'}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-slate-800">{payslipData.name}</p>
                    <p className="text-xs text-slate-500">EMP No: {payslipData.empno} · Station: {payslipData.stacode}</p>
                    <p className="text-xs text-slate-500">{payslipData.position}</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Earnings</h4>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2 text-slate-600">Basic Salary</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(payslipData.basic)}</td></tr>
                      <tr><td className="py-2 text-slate-600">PERA</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(payslipData.pera)}</td></tr>
                      {(payslipData.aca > 0) && <tr><td className="py-2 text-slate-600">ACA</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(payslipData.aca)}</td></tr>}
                      {(payslipData.rata > 0) && <tr><td className="py-2 text-slate-600">RATA</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(payslipData.rata)}</td></tr>}
                      {(payslipData.long > 0) && <tr><td className="py-2 text-slate-600">Longevity</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(payslipData.long)}</td></tr>}
                      <tr className="font-semibold border-t-2 border-slate-200"><td className="py-2.5 text-slate-800">Gross Pay</td><td className="py-2.5 text-right tabular-nums text-slate-900">{currency(payslipData.gross)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Deductions</h4>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {payslipData.mandatory.map((d, i) => (
                        <tr key={`m${i}`}><td className="py-2 text-slate-600 text-xs">{dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode}</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(d.dedamt)}</td></tr>
                      ))}
                      {payslipData.loans.map((d, i) => (
                        <tr key={`l${i}`}><td className="py-2 text-slate-600 text-xs">{dedCodeMap.get(d.dedcode)?.dedname ?? d.dedcode}</td><td className="py-2 text-right tabular-nums text-slate-800">{currency(d.dedamt)}</td></tr>
                      ))}
                      <tr className="font-semibold border-t-2 border-slate-200"><td className="py-2.5 text-slate-800">Total Deductions</td><td className="py-2.5 text-right tabular-nums text-slate-900">{currency(payslipData.mandatoryTotal + payslipData.loanTotal)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Net Take Home Pay</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">{currency(payslipData.net)}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${payslipData.nthp === 'PASS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    <ShieldAlert className="w-4 h-4" /> NTHP: {payslipData.nthp}
                  </span>
                  {payslipData.undeductedTotal > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">Undeducted: {currency(payslipData.undeductedTotal)}</p>
                  )}
                </div>
              </div>
              {payslipData.undeducted.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">Undeducted Obligations</h4>
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500"><th className="text-left py-1.5">Code</th><th className="text-left py-1.5">Description</th><th className="text-right py-1.5">Scheduled</th><th className="text-right py-1.5">Undeducted</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {payslipData.undeducted.map((u, i) => (
                        <tr key={i}><td className="py-1.5 font-mono">{u.deduction_code}</td><td className="py-1.5 text-slate-700">{u.deduction_description}</td><td className="py-1.5 text-right tabular-nums">{currency(u.scheduled_amount)}</td><td className="py-1.5 text-right tabular-nums text-rose-600">{currency(u.undeducted_amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : tab === 'unassigned' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Unassigned STACODE Report</h3>
            <p className="text-xs text-slate-500 mt-0.5">Employees with invalid or missing STACODE that cannot be classified into a payroll group</p>
          </div>
          {unassignedEmployees.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
              All employees have valid STACODE assignments.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                    <th className="text-left px-4 py-3 font-medium">Employee Name</th>
                    <th className="text-left px-4 py-3 font-medium">STACODE</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unassignedPag.pagedItems.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.empno || e.employee_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-800">{e.lname || e.last_name}, {e.fname || e.first_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-mono font-semibold">{e.stacode || '(empty)'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {!e.stacode || !e.stacode.trim() ? 'STACODE is empty' :
                         !/^\d+$/.test(e.stacode.trim()) ? 'STACODE is non-numeric' :
                         'STACODE does not match any group range'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>{e.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={unassignedPag.page} totalPages={unassignedPag.totalPages} total={unassignedPag.total} onPageChange={unassignedPag.setPage} label="employees" />
        </div>
      ) : tab === 'w2' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">W-2 Annual Tax Computation — {currentPeriod?.year ?? '—'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Annual withholding tax reconciliation per COMPUTAX.PRG / W2SUM.PRG</p>
            </div>
          </div>
          {w2Report.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No payroll entries found for this period.</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <div><div className="text-xs text-slate-500">Employees</div><div className="text-lg font-bold text-slate-800">{w2Report.length}</div></div>
                <div><div className="text-xs text-slate-500">Total Tax Due</div><div className="text-lg font-bold text-rose-600">{currency(w2Report.reduce((s, r) => s + r.annualTaxDue, 0))}</div></div>
                <div><div className="text-xs text-slate-500">Total Tax Paid</div><div className="text-lg font-bold text-emerald-600">{currency(w2Report.reduce((s, r) => s + r.totalTaxPaid, 0))}</div></div>
                <div><div className="text-xs text-slate-500">Still Payable</div><div className="text-lg font-bold text-rose-600">{currency(w2Report.filter(r => !r.isRefund).reduce((s, r) => s + r.taxPayable, 0))}</div></div>
                <div><div className="text-xs text-slate-500">Total Refunds</div><div className="text-lg font-bold text-emerald-600">{currency(w2Report.filter(r => r.isRefund).reduce((s, r) => s + Math.abs(r.taxPayable), 0))}</div></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-3 py-3 font-medium">EMPNO</th>
                      <th className="text-left px-3 py-3 font-medium">Employee Name</th>
                      <th className="text-right px-3 py-3 font-medium">Total Income</th>
                      <th className="text-right px-3 py-3 font-medium">Exemption</th>
                      <th className="text-right px-3 py-3 font-medium">Deductions</th>
                      <th className="text-right px-3 py-3 font-medium">Taxable Income</th>
                      <th className="text-right px-3 py-3 font-medium">Tax Due</th>
                      <th className="text-right px-3 py-3 font-medium">Tax Paid</th>
                      <th className="text-right px-3 py-3 font-medium">Payable / (Refund)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {w2Pag.pagedItems.map((r) => (
                      <tr key={r.empno} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.empno}</td>
                        <td className="px-3 py-3 text-slate-800">{r.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{currency(r.totalIncome)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{currency(r.exemption)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{currency(r.totalDeductions)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-700">{currency(r.taxableIncome)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-rose-600">{currency(r.annualTaxDue)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{currency(r.totalTaxPaid)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums font-bold ${r.isRefund ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {currency(Math.abs(r.taxPayable))} {r.isRefund ? '(Refund)' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-800">
                      <td className="px-3 py-3" colSpan={2}>TOTAL ({w2Report.length} employees)</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency(w2Report.reduce((s, r) => s + r.totalIncome, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency(w2Report.reduce((s, r) => s + r.exemption, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency(w2Report.reduce((s, r) => s + r.totalDeductions, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency(w2Report.reduce((s, r) => s + r.taxableIncome, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-rose-600">{currency(w2Report.reduce((s, r) => s + r.annualTaxDue, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{currency(w2Report.reduce((s, r) => s + r.totalTaxPaid, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency(w2Report.filter(r => !r.isRefund).reduce((s, r) => s + r.taxPayable, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Pagination page={w2Pag.page} totalPages={w2Pag.totalPages} total={w2Pag.total} onPageChange={w2Pag.setPage} label="employees" />
            </>
          )}
        </div>
      ) : null}

      {/* FOXPRO legacy report engine overlays */}
      {foxpro === 'register' && (
        <FoxproRegister
          period={currentPeriod}
          scopedCodes={scopedCodes ?? undefined}
          employees={scopedEmployees}
          entries={scopedEntries}
          deductions={deductions}
          payrollDeds={payrollDeds}
          dedCodes={dedCodes}
          payent={payent}
          onClose={() => setFoxpro(null)}
        />
      )}
      {foxpro === 'payslip' && (
        <FoxproPayslip
          period={currentPeriod}
          employees={scopedEmployees}
          entries={scopedEntries}
          deductions={deductions}
          payrollDeds={payrollDeds}
          undeducted={scopedUndeducted}
          dedCodes={dedCodes}
          payent={payent}
          schools={schools}
          selectedEmpId={payslipEmpId || undefined}
          onClose={() => setFoxpro(null)}
        />
      )}
      </div>
    </div>
  );
}
