import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import {
  Plus, Trash2, Save, FileSpreadsheet, FileText, ArrowRightLeft,
  CheckCircle2, Circle, AlertCircle, RefreshCw, X, ChevronDown, ChevronRight,
  History, Zap, Upload, Search, Pencil, Calculator, Undo2,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope, matchesOrgScope } from '@/lib/org';
import { isSuperAdminRole } from '@/lib/authz';
import { currency } from '@/lib/reports';
import { exportInitialPayrollExcel, exportInitialPayrollPdf, exportRosterExcel, exportRosterPdf, formatPayrollNo } from '@/lib/initialPayrollExport';
import {
  DEFAULT_PHILHEALTH_RATE, type ComputationResult,
  computeMonthlyWithholdingTax, remainingMonthsIncludingCurrent,
} from '@/lib/payrollComputation';
import { computeCsc, computeCscFromPeriod, CSC_STANDARD_DAYS } from '@/lib/ipsComputation';
import {
  type InitialPayrollRecord, type InitialPayrollEntry, type InitialPayrollTransfer,
  type Signatory, type EmployeePayrollStatus, type PayrollStatus,
  allRequirementsComplete, requirementList, dailyRateFromMonthly, grossFromDaysWorked,
} from '@/types/initialPayroll';
import type { UserProfile } from '@/types/auth';
import InitialEmployeeCard from '@/components/InitialEmployeeCard';
import InitialEmployeeImportModal from '@/components/InitialEmployeeImportModal';
import { usePositions, type PositionMgmt } from '@/lib/usePositions';
import { useSalarySchedule } from '@/lib/useSalarySchedule';

interface InitialPayrollProps {
  profile?: UserProfile | null;
}

type Tab = 'payroll' | 'compute' | 'roster' | 'transfers' | 'transfer_ready';

export default function InitialPayroll({ profile }: InitialPayrollProps) {
  const { logAudit, profile: authProfile } = useAuth();
  const pf = profile ?? authProfile;

  const [tab, setTab] = useState<Tab>('payroll');
  const [records, setRecords] = useState<InitialPayrollRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<InitialPayrollRecord | null>(null);
  const [entries, setEntries] = useState<InitialPayrollEntry[]>([]);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [roster, setRoster] = useState<EmployeePayrollStatus[]>([]);
  const [transfers, setTransfers] = useState<InitialPayrollTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<InitialPayrollEntry | null>(null);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [cardEmployee, setCardEmployee] = useState<EmployeePayrollStatus | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);

  const { positions } = usePositions();
  const { lookup: lookupSalary } = useSalarySchedule();
  const [schools, setSchools] = useState<{ id: string; school_code: string; school_name: string; school_type: string }[]>([]);
  useEffect(() => {
    fetchAll(() => supabase.from('schools').select('id,school_code,school_name,school_type').eq('status', 'Active').order('school_code'))
      .then((rows) => setSchools(rows as typeof schools))
      .catch(() => {});
  }, []);

  // Debounce timers for batched DB writes
  const entrySaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const recordSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New record form
  const [newRecord, setNewRecord] = useState({
    payroll_no: '',
    payroll_date: new Date().toISOString().slice(0, 10),
    period_from: '',
    period_to: '',
    description: 'INITIAL PAYROLL - PERMANENT',
  });

  const activeRecordRef = useRef<InitialPayrollRecord | null>(null);
  useEffect(() => { activeRecordRef.current = activeRecord; }, [activeRecord]);

  const { scopedCodes } = useOrg();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const scope = codeScope(scopedCodes);
    // Load essential data first (records + signatories), then roster in background.
    // Records and signatories carry REGCODE/DIVCODE (stamped on insert/update).
    // Strict scoping: a division only ever sees its own rows — uncoded rows
    // stay visible to the super administrator's "All Divisions" view only, so
    // no division data can leak into another division's view.
    const [recs, sigs] = await Promise.all([
      fetchAll(() => supabase.from('initial_payroll_records').select('*').order('created_at', { ascending: false })),
      fetchAll(() => supabase.from('signatories').select('*').order('created_at')),
    ]);
    const scopedRecs = (recs as InitialPayrollRecord[]).filter((r) => matchesOrgScope(r, { scopedDivisionIds: null, scopedCodes }));
    const scopedSigs = (sigs as Signatory[]).filter((s) => matchesOrgScope(s, { scopedDivisionIds: null, scopedCodes }));
    setRecords(scopedRecs);
    setSignatories(scopedSigs);
    if (scopedRecs.length > 0 && !activeRecordRef.current) {
      setActiveRecord(scopedRecs[0] as InitialPayrollRecord);
    }
    setLoading(false);
    // Load roster + transfers in the background — don't block the UI
    let rosterQuery = supabase.from('employees')
      .select('id,employee_number,last_name,first_name,middle_name,empname,fname,lname,mi,stacode,position,department,bank_name,bank_account,basic_salary,basic,grade,step,tin,philhealth_number,pagibig_number,hire_date,hiredate,payroll_status,req_appointment_validated,req_tin_submitted,req_philhealth_submitted,req_pagibig_submitted,req_atm_submitted')
      .eq('status', 'Active')
      .order('last_name');
    if (scope.regcode) {
      rosterQuery = rosterQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    }
    fetchAll(() => rosterQuery)
      .then((rosterData) => {
        const scopedRoster = rosterData as EmployeePayrollStatus[];
        setRoster(scopedRoster);
        // Transfers belong to employees — only surface transfers whose employee
        // is inside the selected division's roster.
        const scopedEmpIds = new Set(scopedRoster.map((r) => r.id).filter(Boolean));
        return fetchAll(() => supabase.from('initial_payroll_transfers').select('*').order('transferred_at', { ascending: false }))
          .then((transferData) => setTransfers((transferData as InitialPayrollTransfer[])
            .filter((t) => !scope.regcode || scopedEmpIds.has(t.employee_id))));
      })
      .catch(() => {});
  }, [scopedCodes]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Load entries when the active record ID changes (not on every field update)
  const activeRecordId = activeRecord?.id;
  useEffect(() => {
    if (!activeRecordId) { setEntries([]); return; }
    let cancelled = false;
    (async () => {
      const data = await fetchAll(() =>
        supabase.from('initial_payroll_entries').select('*').eq('record_id', activeRecordId).order('created_at'),
      );
      if (!cancelled) setEntries(data as InitialPayrollEntry[]);
    })();
    return () => { cancelled = true; };
  }, [activeRecordId]);

  // Flush pending debounced saves on unmount
  useEffect(() => {
    return () => {
      entrySaveTimers.current.forEach((t) => clearTimeout(t));
      entrySaveTimers.current.clear();
      if (recordSaveTimer.current) clearTimeout(recordSaveTimer.current);
      if (totalsTimer.current) clearTimeout(totalsTimer.current);
    };
  }, []);

  // ── Payroll number auto-generation ──
  async function generatePayrollNo(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { data, error } = await supabase
      .from('payroll_number_counter')
      .select('id, last_number')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();
    if (error) throw error;
    const nextSeq = (data?.last_number ?? 0) + 1;
    if (data) {
      await supabase.from('payroll_number_counter').update({ last_number: nextSeq }).eq('id', data.id);
    } else {
      await supabase.from('payroll_number_counter').insert({ year, month, last_number: nextSeq });
    }
    return formatPayrollNo(year, month, nextSeq);
  }

  async function handleCreateRecord() {
    setSaving(true);
    setMsg(null);
    try {
      let payrollNo = newRecord.payroll_no.trim();
      if (!payrollNo) {
        payrollNo = await generatePayrollNo();
      }
      // Check duplicate
      const { data: existing } = await supabase
        .from('initial_payroll_records')
        .select('id')
        .eq('payroll_no', payrollNo)
        .maybeSingle();
      if (existing) {
        setMsg({ type: 'err', text: `Payroll No. ${payrollNo} already exists. Use a different number.` });
        setSaving(false);
        return;
      }
      // Auto-assign the acting division's REGCODE/DIVCODE (the DB trigger
      // covers division admins; this covers the super administrator working
      // inside a selected division, so the payroll can never leak system-wide).
      const scope = codeScope(scopedCodes);
      const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
        ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
        : {};
      const { data, error } = await supabase.from('initial_payroll_records').insert({
        payroll_no: payrollNo,
        payroll_date: newRecord.payroll_date || null,
        period_from: newRecord.period_from || null,
        period_to: newRecord.period_to || null,
        description: newRecord.description,
        status: 'draft',
        created_by: pf?.id ?? null,
        ...stamp,
      }).select('*').single();
      if (error) throw error;
      await logAudit('payroll_creation', 'initial_payroll_records', data.id, { payroll_no: payrollNo });
      setRecords((prev) => [data as InitialPayrollRecord, ...prev]);
      setActiveRecord(data as InitialPayrollRecord);
      setShowNewRecord(false);
      setNewRecord({
        payroll_no: '',
        payroll_date: new Date().toISOString().slice(0, 10),
        period_from: '',
        period_to: '',
        description: 'INITIAL PAYROLL - PERMANENT',
      });
      setMsg({ type: 'ok', text: `Created payroll ${payrollNo}` });
    } catch (e) {
      setMsg({ type: 'err', text: `Error: ${(e as Error).message}` });
    }
    setSaving(false);
  }

  function handleUpdateRecord(field: keyof InitialPayrollRecord, value: string) {
    if (!activeRecord) return;
    const updated = { ...activeRecord, [field]: value || null } as InitialPayrollRecord;
    setActiveRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === activeRecord.id ? updated : r)));
    // Debounce DB write — save 500ms after last keystroke
    if (recordSaveTimer.current) clearTimeout(recordSaveTimer.current);
    recordSaveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from('initial_payroll_records')
        .update({ [field]: value || null, updated_at: new Date().toISOString() })
        .eq('id', activeRecord.id);
      if (error) setMsg({ type: 'err', text: `Error updating: ${error.message}` });
    }, 500);
  }

  async function handleDeleteRecord() {
    if (!activeRecord) return;
    if (!confirm(`Delete payroll ${activeRecord.payroll_no}? This removes all entries.`)) return;
    const { error } = await supabase.from('initial_payroll_records').delete().eq('id', activeRecord.id);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    await logAudit('payroll_deletion', 'initial_payroll_records', activeRecord.id, { payroll_no: activeRecord.payroll_no });
    setRecords((prev) => prev.filter((r) => r.id !== activeRecord.id));
    setActiveRecord(null);
    setEntries([]);
    setMsg({ type: 'ok', text: 'Payroll deleted.' });
  }

  // ── Excel-matching computation for display & storage ──
  // Replicates the formulas used in the Excel export so the on-screen
  // Payroll Details and the exported file always agree.
  function computeEntryForDisplay(entry: InitialPayrollEntry, periodTo: string | null): ComputationResult {
    const monthly = Number(entry.monthly_salary) || 0;
    const daysCsc = Number(entry.days_worked) || 0;
    const daysCal = Number(entry.calendar_days) || 0;
    const effDate = entry.effectivity_date ?? null;
    const dim = (() => {
      const ref = periodTo ?? effDate;
      if (!ref) return 22;
      const d = new Date(ref);
      if (isNaN(d.getTime())) return 22;
      return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    })();
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const salCsc = r2((daysCsc / 22) * monthly);
    const salCal = r2((daysCal / dim) * monthly);
    const pera = r2((daysCsc / 22) * 2000);
    const gsis = r2(salCal * 0.09);
    const philhealth = daysCsc > 2 ? r2(monthly * 0.025) : 0;
    const pagibig = daysCsc > 2 ? 200 : 0;

    const remainingMonths = remainingMonthsIncludingCurrent(effDate);
    const annualIncome = r2(monthly * remainingMonths);
    const annualDeductions = r2((gsis + philhealth + pagibig) * remainingMonths);
    const taxableIncome = r2(annualIncome - annualDeductions);
    const monthlyTaxableIncome = salCal - gsis - philhealth - pagibig;
    const monthlyTax = taxableIncome <= 250000 ? 0 : computeMonthlyWithholdingTax(monthlyTaxableIncome);
    const annualTax = r2(monthlyTax * remainingMonths);

    const totalDeductions = r2(monthlyTax + gsis + philhealth + pagibig);
    const amountDue = r2(salCal - totalDeductions);
    const totalDue = r2(amountDue + (Number(entry.additional_adjustments) || 0) - (Number(entry.adjustment_deductions) || 0));

    return {
      gross_salary: salCal,
      pera,
      gsis,
      philhealth,
      pagibig,
      annual_income: annualIncome,
      annual_deductions: annualDeductions,
      taxable_income: taxableIncome,
      annual_tax: annualTax,
      monthly_tax: monthlyTax,
      total_deductions: totalDeductions,
      amount_due: amountDue,
      total_due: totalDue,
    };
  }

  // Pre-compute Excel-matching values for every entry (for display + totals)
  const computedMap = useMemo(() => {
    const m = new Map<string, ComputationResult>();
    for (const e of entries) {
      m.set(e.id, computeEntryForDisplay(e, activeRecord?.period_to ?? null));
    }
    return m;
  }, [entries, activeRecord?.period_to]);

  // ── Apply computed values back to the initial_payroll_entries table ──
  // Writes only the gross/pera/deductions/net columns — does NOT touch any
  // other database table.
  async function handleApplyComputed() {
    if (!activeRecord || entries.length === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const updates = entries.map((e) => {
        const c = computedMap.get(e.id);
        if (!c) return null;
        return {
          id: e.id,
          gross_salary: c.gross_salary,
          basic_salary: c.gross_salary,
          pera: c.pera,
          total_earnings: Math.round((c.gross_salary + c.pera) * 100) / 100,
          gsis: c.gsis,
          philhealth: c.philhealth,
          pagibig: c.pagibig,
          withholding_tax: c.monthly_tax,
          total_deductions: c.total_deductions,
          net_pay: c.total_due,
        };
      }).filter(Boolean) as { id: string; gross_salary: number; basic_salary: number; pera: number; total_earnings: number; gsis: number; philhealth: number; pagibig: number; withholding_tax: number; total_deductions: number; net_pay: number }[];

      let ok = 0;
      let failed = 0;
      let lastErr = '';
      for (const u of updates) {
        const { error } = await supabase.from('initial_payroll_entries').update({
          gross_salary: u.gross_salary,
          basic_salary: u.basic_salary,
          pera: u.pera,
          total_earnings: u.total_earnings,
          gsis: u.gsis,
          philhealth: u.philhealth,
          pagibig: u.pagibig,
          withholding_tax: u.withholding_tax,
          total_deductions: u.total_deductions,
          net_pay: u.net_pay,
        }).eq('id', u.id);
        if (error) {
          failed++;
          lastErr = error.message;
        } else ok++;
      }

      // Update local state to reflect saved values
      setEntries((prev) => prev.map((e) => {
        const c = computedMap.get(e.id);
        if (!c) return e;
        return {
          ...e,
          gross_salary: c.gross_salary,
          basic_salary: c.gross_salary,
          pera: c.pera,
          total_earnings: Math.round((c.gross_salary + c.pera) * 100) / 100,
          gsis: c.gsis,
          philhealth: c.philhealth,
          pagibig: c.pagibig,
          withholding_tax: c.monthly_tax,
          total_deductions: c.total_deductions,
          net_pay: c.total_due,
        };
      }));

      await logAudit('payroll_computation', 'initial_payroll_entries', activeRecord.id, {
        record_id: activeRecord.id, applied: ok, failed,
      });

      if (failed > 0) {
        setMsg({ type: 'err', text: `${ok} updated, ${failed} failed. ${lastErr || 'Check your connection and try again.'}` });
      } else {
        setMsg({ type: 'ok', text: `Computed values applied to ${ok} entr${ok !== 1 ? 'ies' : 'y'} successfully.` });
      }
    } catch (e) {
      setMsg({ type: 'err', text: `Error: ${(e as Error).message}` });
    }
    setSaving(false);
  }

  // ── Add employee to payroll ──
  async function handleAddEmployee(emp: EmployeePayrollStatus) {
    if (!activeRecord) return;
    const monthly = Number(emp.basic ?? emp.basic_salary ?? 0);
    const daily = dailyRateFromMonthly(monthly);
    const effDate = emp.hire_date || emp.hiredate || new Date().toISOString().slice(0, 10);
    const pfFrom = activeRecord.period_from ?? null;
    const pfTo = activeRecord.period_to ?? null;
    const csc = computeCscFromPeriod(pfFrom, pfTo, 0, effDate);
    const daysWorked = csc.finalPayableDays;
    const calendarDays = csc.calendarDays;
    const gross = grossFromDaysWorked(daily, daysWorked);
    const basicSalary = gross;
    const totalEarnings = basicSalary + (emp.basic ? 0 : 0); // basic only by default

    // Compute prorated deductions matching the Excel export formulas
    const dim = (() => {
      const d = new Date(activeRecord?.period_to ?? effDate);
      return isNaN(d.getTime()) ? 22 : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    })();
    const salCal = Math.round((calendarDays / dim) * monthly * 100) / 100;
    const peraVal = Math.round((daysWorked / 22) * 2000 * 100) / 100;
    const gsisVal = Math.round(salCal * 0.09 * 100) / 100;
    const phicVal = daysWorked > 2 ? Math.round(monthly * 0.025 * 100) / 100 : 0;
    const pagibigVal = daysWorked > 2 ? 200 : 0;
    const remMonths = (() => {
      const d = new Date(effDate);
      return isNaN(d.getTime()) ? 12 : 12 - d.getMonth();
    })();
    const annualProj = Math.round((monthly * remMonths - (gsisVal + phicVal + pagibigVal) * remMonths) * 100) / 100;
    const monthlyTaxable = salCal - gsisVal - phicVal - pagibigVal;
    const taxVal = annualProj <= 250000 ? 0 : (() => {
      const mti = Math.max(0, monthlyTaxable);
      if (mti <= 20833) return 0;
      if (mti <= 33333) return Math.round((mti - 20833) * 0.15 * 100) / 100;
      if (mti <= 66666) return Math.round((1875 + (mti - 33333) * 0.20) * 100) / 100;
      if (mti <= 166667) return Math.round((8541.8 + (mti - 66667) * 0.25) * 100) / 100;
      if (mti <= 666667) return Math.round((33541.8 + (mti - 166667) * 0.30) * 100) / 100;
      return Math.round((183541.8 + (mti - 666667) * 0.35) * 100) / 100;
    })();
    const totalDed = Math.round((taxVal + gsisVal + phicVal + pagibigVal) * 100) / 100;
    const amountDue = Math.round((salCal - totalDed) * 100) / 100;

    const entryPayload = {
      record_id: activeRecord.id,
      employee_id: emp.id,
      item_no: '',
      employee_number: emp.employee_number || emp.id,
      surname: emp.last_name || emp.lname || '',
      first_name: emp.first_name || emp.fname || '',
      middle_name: emp.middle_name || emp.mi || '',
      school: emp.department || emp.stacode || '',
      position_title: emp.position || '',
      salary_grade: emp.grade ?? null,
      salary_step: emp.step ?? null,
      monthly_salary: monthly,
      days_worked: daysWorked,
      daily_rate: daily,
      gross_salary: salCal,
      basic_salary: salCal,
      pera: peraVal,
      total_earnings: Math.round((salCal + peraVal) * 100) / 100,
      gsis: gsisVal,
      philhealth: phicVal,
      pagibig: pagibigVal,
      withholding_tax: taxVal,
      total_deductions: totalDed,
      net_pay: amountDue,
      tin: emp.tin || '',
      philhealth_no: emp.philhealth_number || '',
      hdmf_no: emp.pagibig_number || '',
      atm_account_no: emp.bank_account || '',
      effectivity_date: effDate,
      period_from: pfFrom,
      period_to: pfTo,
    };

    const { data, error } = await supabase.from('initial_payroll_entries').insert(entryPayload).select('*').single();
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setEntries((prev) => [...prev, data as InitialPayrollEntry]);
    await recalcRecordTotals([...entries, data as InitialPayrollEntry]);
    setMsg({ type: 'ok', text: `Added ${emp.last_name || emp.lname}, ${emp.first_name || emp.fname}` });
  }

  // ── Remove employee from payroll ──
  async function handleRemoveEntry(entryId: string) {
    const { error } = await supabase.from('initial_payroll_entries').delete().eq('id', entryId);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    const updated = entries.filter((e) => e.id !== entryId);
    setEntries(updated);
    await recalcRecordTotals(updated);
  }

  // ── Update entry field (debounced DB write) ──
  function handleUpdateEntry(entryId: string, field: keyof InitialPayrollEntry, value: string | number) {
    const updated = entries.map((e) => {
      if (e.id !== entryId) return e;
      const ne = { ...e, [field]: typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && typeof e[field] === 'number'
        ? Number(value) : value } as InitialPayrollEntry;
      // Recompute totals locally (instant UI feedback)
      ne.total_earnings = Math.round((ne.basic_salary + ne.pera + ne.mid_year_bonus + ne.cash_gift + ne.clothing_allowance + ne.cna_incentive + ne.other_earnings) * 100) / 100;
      ne.total_deductions = Math.round((ne.gsis + ne.philhealth + ne.pagibig + ne.withholding_tax + ne.loans + ne.other_deductions) * 100) / 100;
      ne.net_pay = Math.round((ne.total_earnings - ne.total_deductions) * 100) / 100;
      if (field === 'effectivity_date' || field === 'absences' || field === 'period_from' || field === 'period_to') {
        const effDate = field === 'effectivity_date' ? String(value) : (ne.effectivity_date ?? (ne as InitialPayrollEntry & { hire_date?: string | null }).hire_date ?? new Date().toISOString().slice(0, 10));
        const absCount = field === 'absences' ? Number(value) : (ne.absences ?? 0);
        const csc = computeCscFromPeriod(
          field === 'period_from' ? String(value) : ne.period_from,
          field === 'period_to' ? String(value) : ne.period_to,
          absCount,
          effDate,
        );
        ne.days_worked = csc.finalPayableDays;
        ne.calendar_days = csc.calendarDays;
        ne.daily_rate = dailyRateFromMonthly(ne.monthly_salary);
        ne.gross_salary = grossFromDaysWorked(ne.daily_rate, ne.days_worked);
      }
      if (field === 'monthly_salary') {
        ne.daily_rate = dailyRateFromMonthly(ne.monthly_salary);
        ne.gross_salary = grossFromDaysWorked(ne.daily_rate, ne.days_worked);
      }
      return ne;
    });
    setEntries(updated);

    // Debounce DB write for this specific entry — 600ms after last keystroke
    const existing = entrySaveTimers.current.get(entryId);
    if (existing) clearTimeout(existing);
    const entry = updated.find((e) => e.id === entryId);
    if (!entry) return;
    entrySaveTimers.current.set(entryId, setTimeout(async () => {
      entrySaveTimers.current.delete(entryId);
      const { error } = await supabase.from('initial_payroll_entries').update({
        [field]: entry[field],
        total_earnings: entry.total_earnings,
        total_deductions: entry.total_deductions,
        net_pay: entry.net_pay,
        gross_salary: entry.gross_salary,
        daily_rate: entry.daily_rate,
        days_worked: entry.days_worked,
        calendar_days: entry.calendar_days,
        absences: entry.absences,
        period_from: entry.period_from,
        period_to: entry.period_to,
      }).eq('id', entryId);
      if (error) { setMsg({ type: 'err', text: error.message }); return; }
      // Debounce record totals recalc — only once after all entry edits settle
      if (totalsTimer.current) clearTimeout(totalsTimer.current);
      totalsTimer.current = setTimeout(() => recalcRecordTotals(updated), 300);
    }, 600));
  }

  async function recalcRecordTotals(entriesList: InitialPayrollEntry[]) {
    if (!activeRecord) return;
    const totalGross = entriesList.reduce((s, e) => s + e.total_earnings, 0);
    const totalDed = entriesList.reduce((s, e) => s + e.total_deductions, 0);
    const totalNet = entriesList.reduce((s, e) => s + e.net_pay, 0);
    const updated = { ...activeRecord, total_gross: totalGross, total_deductions: totalDed, total_net: totalNet, employee_count: entriesList.length };
    setActiveRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    await supabase.from('initial_payroll_records').update({
      total_gross: totalGross, total_deductions: totalDed, total_net: totalNet, employee_count: entriesList.length,
      updated_at: new Date().toISOString(),
    }).eq('id', activeRecord.id);
  }

  // ── Roster: toggle requirement ──
  async function handleToggleRequirement(empId: string, field: 'req_appointment_validated' | 'req_tin_submitted' | 'req_philhealth_submitted' | 'req_pagibig_submitted' | 'req_atm_submitted') {
    const emp = roster.find((e) => e.id === empId);
    if (!emp) return;
    const newVal = !emp[field];
    const { error } = await supabase.from('employees').update({ [field]: newVal }).eq('id', empId);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setRoster((prev) => prev.map((e) => (e.id === empId ? { ...e, [field]: newVal } : e)));
    setCardEmployee((prev) => (prev && prev.id === empId ? { ...prev, [field]: newVal } as EmployeePayrollStatus : prev));
  }

  // ── Save employee edits from card ──
  async function handleSaveEmployee(empId: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from('employees').update(patch).eq('id', empId);
    if (error) { setMsg({ type: 'err', text: error.message }); return false; }
    setRoster((prev) => prev.map((e) => (e.id === empId ? { ...e, ...patch } as EmployeePayrollStatus : e)));
    setCardEmployee((prev) => (prev && prev.id === empId ? { ...prev, ...patch } as EmployeePayrollStatus : prev));
    return true;
  }

  // ── Add new employee manually ──
  async function handleCreateEmployee(data: Record<string, unknown>) {
    // Auto-assign the acting division's REGCODE/DIVCODE so a manually added
    // employee is never visible to other divisions.
    const scope = codeScope(scopedCodes);
    const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
      ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
      : {};
    const { data: row, error } = await supabase.from('employees').insert({ ...data, ...stamp, status: 'Active', payroll_status: 'Initial Payroll' }).select('id,employee_number,last_name,first_name,middle_name,empname,fname,lname,mi,stacode,position,department,bank_name,bank_account,basic_salary,basic,grade,step,tin,philhealth_number,pagibig_number,hire_date,hiredate,payroll_status,req_appointment_validated,req_tin_submitted,req_philhealth_submitted,req_pagibig_submitted,req_atm_submitted').single();
    if (error) { setMsg({ type: 'err', text: error.message }); return false; }
    setRoster((prev) => [...prev, row as EmployeePayrollStatus]);
    setMsg({ type: 'ok', text: `Added employee ${data.last_name}, ${data.first_name}` });
    return true;
  }

  // ── Set payroll status ──
  async function handleSetPayrollStatus(empId: string, status: PayrollStatus) {
    const { error } = await supabase.from('employees').update({ payroll_status: status }).eq('id', empId);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setRoster((prev) => prev.map((e) => (e.id === empId ? { ...e, payroll_status: status } : e)));
  }

  // ── Transfer to Regular Payroll ──
  async function handleTransfer(empId: string) {
    const emp = roster.find((e) => e.id === empId);
    if (!emp) return;
    if (!allRequirementsComplete(emp)) {
      setMsg({ type: 'err', text: 'Cannot transfer: payroll requirements are not complete.' });
      return;
    }
    if (!confirm(`Transfer ${emp.last_name || emp.lname}, ${emp.first_name || emp.fname} to Regular Payroll?`)) return;
    const payrollNo = activeRecord?.payroll_no ?? '';
    const { error: transferErr } = await supabase.from('initial_payroll_transfers').insert({
      employee_id: empId,
      employee_name: `${emp.last_name || emp.lname || ''}, ${emp.first_name || emp.fname || ''} ${emp.middle_name || emp.mi || ''}`.trim(),
      employee_number: emp.employee_number,
      payroll_no: payrollNo,
      processed_by: pf?.id ?? null,
      processed_by_name: pf ? `${pf.first_name} ${pf.last_name}` : null,
    });
    if (transferErr) { setMsg({ type: 'err', text: transferErr.message }); return; }
    const { error: statusErr } = await supabase.from('employees').update({ payroll_status: 'Regular Payroll' }).eq('id', empId);
    if (statusErr) { setMsg({ type: 'err', text: statusErr.message }); return; }
    await logAudit('transfer_to_regular', 'employees', empId, { payroll_no: payrollNo });
    setRoster((prev) => prev.map((e) => (e.id === empId ? { ...e, payroll_status: 'Regular Payroll' } : e)));
    // Reload transfers (kept scoped to the selected division's employees)
    const scopeNow = codeScope(scopedCodes);
    const tData = await fetchAll(() => supabase.from('initial_payroll_transfers').select('*').order('transferred_at', { ascending: false }));
    const scopedIds = new Set(roster.map((r) => r.id).filter(Boolean));
    setTransfers((tData as InitialPayrollTransfer[]).filter((t) => !scopeNow.regcode || scopedIds.has(t.employee_id)));
    setMsg({ type: 'ok', text: 'Employee transferred to Regular Payroll.' });
  }

  // ── Undo Transfer (bring employee back to Initial Payroll) ──
  async function handleUndoTransfer(transfer: InitialPayrollTransfer) {
    if (!canUndoTransfer) return;
    if (!confirm(`Bring back ${transfer.employee_name} from Regular Payroll to Initial Payroll?`)) return;
    // Revert the employee's payroll status
    const { error: statusErr } = await supabase
      .from('employees')
      .update({ payroll_status: 'Initial Payroll' })
      .eq('id', transfer.employee_id);
    if (statusErr) { setMsg({ type: 'err', text: statusErr.message }); return; }
    // Remove the transfer log entry
    const { error: delErr } = await supabase
      .from('initial_payroll_transfers')
      .delete()
      .eq('id', transfer.id);
    if (delErr) { setMsg({ type: 'err', text: delErr.message }); return; }
    await logAudit('undo_transfer', 'employees', transfer.employee_id, {
      payroll_no: transfer.payroll_no,
      employee_name: transfer.employee_name,
    });
    // Update local state
    setRoster((prev) => prev.map((e) => (e.id === transfer.employee_id ? { ...e, payroll_status: 'Initial Payroll' as PayrollStatus } : e)));
    setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
    setMsg({ type: 'ok', text: `${transfer.employee_name} brought back to Initial Payroll.` });
  }

  const canUndoTransfer = isSuperAdminRole(pf?.role) || pf?.role === 'payroll_admin';

  // ── Export ──
  async function handleExportExcel() {
    if (!activeRecord || entries.length === 0) return;
    setExporting('excel');
    try {
      await exportInitialPayrollExcel(activeRecord, entries, signatories);
      await logAudit('payroll_export', 'initial_payroll_records', activeRecord.id, { format: 'excel' });
    } catch (e) {
      setMsg({ type: 'err', text: `Export error: ${(e as Error).message}` });
    }
    setExporting(null);
  }

  function handleExportPdf() {
    if (!activeRecord || entries.length === 0) return;
    setExporting('pdf');
    try {
      exportInitialPayrollPdf(activeRecord, entries, signatories);
      logAudit('payroll_export', 'initial_payroll_records', activeRecord.id, { format: 'pdf' });
    } catch (e) {
      setMsg({ type: 'err', text: `Export error: ${(e as Error).message}` });
    }
    setExporting(null);
  }

  // ── Roster Export ──
  async function handleRosterExcel(emps: EmployeePayrollStatus[], title: string) {
    if (emps.length === 0) return;
    setExporting('excel');
    try {
      await exportRosterExcel(emps, title);
      await logAudit('roster_export', 'employees', undefined, { format: 'excel', count: emps.length });
    } catch (e) {
      setMsg({ type: 'err', text: `Export error: ${(e as Error).message}` });
    }
    setExporting(null);
  }

  function handleRosterPdf(emps: EmployeePayrollStatus[], title: string) {
    if (emps.length === 0) return;
    setExporting('pdf');
    try {
      exportRosterPdf(emps, title);
      logAudit('roster_export', 'employees', undefined, { format: 'pdf', count: emps.length });
    } catch (e) {
      setMsg({ type: 'err', text: `Export error: ${(e as Error).message}` });
    }
    setExporting(null);
  }

  // ── Post payroll ──
  async function handlePostPayroll() {
    if (!activeRecord) return;
    if (!confirm(`Post payroll ${activeRecord.payroll_no}? This locks the payroll record.`)) return;
    const { error } = await supabase.from('initial_payroll_records').update({ status: 'posted', updated_at: new Date().toISOString() }).eq('id', activeRecord.id);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    await logAudit('payroll_modification', 'initial_payroll_records', activeRecord.id, { action: 'posted' });
    const updated = { ...activeRecord, status: 'posted' as const };
    setActiveRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setMsg({ type: 'ok', text: 'Payroll posted successfully.' });
  }

  // ── Derived data ──
  const initialPayrollEmployees = useMemo(() => roster.filter((e) => e.payroll_status === 'Initial Payroll'), [roster]);
  const readyForTransfer = useMemo(() => initialPayrollEmployees.filter((e) => allRequirementsComplete(e)), [initialPayrollEmployees]);
  const regularPayrollEmployees = useMemo(() => roster.filter((e) => e.payroll_status === 'Regular Payroll'), [roster]);

  const totalGross = entries.reduce((s, e) => { const c = computedMap.get(e.id); return s + (c?.gross_salary ?? e.gross_salary ?? 0) + (c?.pera ?? e.pera ?? 0); }, 0);
  const totalDeductions = entries.reduce((s, e) => s + (computedMap.get(e.id)?.total_deductions ?? e.total_deductions ?? 0), 0);
  const totalNet = entries.reduce((s, e) => s + (computedMap.get(e.id)?.total_due ?? e.net_pay ?? 0), 0);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400 text-sm">Loading Initial Payroll...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Initial Payroll" value={initialPayrollEmployees.length} color="amber" />
        <StatCard label="Ready for Transfer" value={readyForTransfer.length} color="emerald" />
        <StatCard label="Regular Payroll" value={regularPayrollEmployees.length} color="blue" />
        <StatCard label="Payrolls This Month" value={records.filter((r) => {
          const d = new Date(r.created_at);
          const now = new Date();
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length} color="slate" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: 'payroll' as Tab, label: 'Payroll', icon: Zap },
          { key: 'compute' as Tab, label: 'Run Computation', icon: Calculator },
          { key: 'roster' as Tab, label: 'Employee Roster', icon: CheckCircle2 },
          { key: 'transfer_ready' as Tab, label: 'Ready for Transfer', icon: ArrowRightLeft },
          { key: 'transfers' as Tab, label: 'Transfer Log', icon: History },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-deped-600 text-deped-600 dark:text-deped-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
          msg.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          <span className="flex items-center gap-2">
            {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
          </span>
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── PAYROLL TAB ── */}
      {tab === 'payroll' && (
        <div className="space-y-4">
          {/* Record selector + new */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeRecord?.id ?? ''}
              onChange={(e) => setActiveRecord(records.find((r) => r.id === e.target.value) ?? null)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-deped-500/30"
            >
              <option value="">— Select Payroll —</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>{r.payroll_no} — {r.description} ({r.status})</option>
              ))}
            </select>
            <button
              onClick={() => setShowNewRecord(!showNewRecord)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-deped-600 hover:bg-deped-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Payroll
            </button>
            <div className="flex-1" />
            {activeRecord && entries.length > 0 && (
              <>
                <button
                  onClick={handleExportExcel}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 dark:text-emerald-400 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" /> {exporting === 'excel' ? 'Exporting...' : 'Excel'}
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 dark:text-rose-400 text-sm hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" /> {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
                </button>
              </>
            )}
          </div>

          {/* New record form */}
          {showNewRecord && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Create New Initial Payroll</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <FormField label="Payroll No. (auto if blank)">
                  <input
                    type="text"
                    value={newRecord.payroll_no}
                    onChange={(e) => setNewRecord({ ...newRecord, payroll_no: e.target.value })}
                    placeholder="YYYY-MM-XXX"
                    className="form-input"
                  />
                </FormField>
                <FormField label="Payroll Date">
                  <input type="date" value={newRecord.payroll_date} onChange={(e) => setNewRecord({ ...newRecord, payroll_date: e.target.value })} className="form-input" />
                </FormField>
                <FormField label="Description">
                  <input type="text" value={newRecord.description} onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })} className="form-input" />
                </FormField>
                <FormField label="Period From">
                  <input type="date" value={newRecord.period_from} onChange={(e) => setNewRecord({ ...newRecord, period_from: e.target.value })} className="form-input" />
                </FormField>
                <FormField label="Period To">
                  <input type="date" value={newRecord.period_to} onChange={(e) => setNewRecord({ ...newRecord, period_to: e.target.value })} className="form-input" />
                </FormField>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateRecord} disabled={saving} className="px-4 py-2 rounded-lg bg-deped-600 hover:bg-deped-700 text-white text-sm font-medium disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Payroll'}
                </button>
                <button onClick={() => setShowNewRecord(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Payroll header (editable) */}
          {activeRecord && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Payroll Header</h3>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    activeRecord.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    activeRecord.status === 'reversed' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>{activeRecord.status.toUpperCase()}</span>
                  {activeRecord.status === 'draft' && (
                    <button onClick={handlePostPayroll} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium">Post Payroll</button>
                  )}
                  <button onClick={handleDeleteRecord} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <FormField label="Payroll No.">
                  <input type="text" value={activeRecord.payroll_no} onChange={(e) => handleUpdateRecord('payroll_no', e.target.value)} className="form-input" />
                </FormField>
                <FormField label="Payroll Date">
                  <input type="date" value={activeRecord.payroll_date ?? ''} onChange={(e) => handleUpdateRecord('payroll_date', e.target.value)} className="form-input" />
                </FormField>
                <FormField label="Period From">
                  <input type="date" value={activeRecord.period_from ?? ''} onChange={(e) => handleUpdateRecord('period_from', e.target.value)} className="form-input" />
                </FormField>
                <FormField label="Period To">
                  <input type="date" value={activeRecord.period_to ?? ''} onChange={(e) => handleUpdateRecord('period_to', e.target.value)} className="form-input" />
                </FormField>
                <FormField label="Description">
                  <input type="text" value={activeRecord.description ?? ''} onChange={(e) => handleUpdateRecord('description', e.target.value)} className="form-input" />
                </FormField>
              </div>
            </div>
          )}

          {/* Employee payroll table */}
          {activeRecord && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Employee Payroll Details ({entries.length})</h3>
                <AddEmployeeDropdown roster={initialPayrollEmployees} onAdd={handleAddEmployee} />
              </div>
              {entries.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No employees added yet. Click "Add Employee" to select from the Initial Payroll roster.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">No.</th>
                      <th className="px-2 py-2 text-left font-medium">Surname</th>
                      <th className="px-2 py-2 text-left font-medium">First Name</th>
                      <th className="px-2 py-2 text-left font-medium">Emp No.</th>
                      <th className="px-2 py-2 text-left font-medium">School</th>
                      <th className="px-2 py-2 text-right font-medium">Monthly</th>
                      <th className="px-2 py-2 text-right font-medium">Eff. Date</th>
                      <th className="px-2 py-2 text-left font-medium">Period Covered</th>
                      <th className="px-2 py-2 text-right font-medium">CSC</th>
                      <th className="px-2 py-2 text-right font-medium">Cal. Days</th>
                      <th className="px-2 py-2 text-right font-medium">Absences</th>
                      <th className="px-2 py-2 text-right font-medium">Gross</th>
                      <th className="px-2 py-2 text-right font-medium">Total Earn.</th>
                      <th className="px-2 py-2 text-right font-medium">Total Ded.</th>
                      <th className="px-2 py-2 text-right font-medium">Net Pay</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {entries.map((e, i) => {
                      const c = computedMap.get(e.id);
                      const grossSalary = c?.gross_salary ?? e.gross_salary;
                      const totalEarnings = (c ? c.gross_salary + c.pera : e.total_earnings);
                      const totalDed = c?.total_deductions ?? e.total_deductions;
                      const netPay = c?.total_due ?? e.net_pay;
                      return (
                      <Fragment key={e.id}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-100">{e.surname}</td>
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{e.first_name}</td>
                          <td className="px-2 py-2 text-slate-500">{e.employee_number}</td>
                          <td className="px-2 py-2 text-slate-500">{e.school}</td>
                          <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{currency(e.monthly_salary)}</td>
                          <td className="px-2 py-2 text-right text-slate-500 text-xs whitespace-nowrap" title="Same as Hire Date from employee roster">
                            {(() => {
                              const ed = e.effectivity_date ?? roster.find((r) => r.id === e.employee_id)?.hire_date ?? roster.find((r) => r.id === e.employee_id)?.hiredate;
                              return ed ? new Date(ed).toLocaleDateString('en-PH') : '—';
                            })()}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="date" value={e.period_from ?? ''}
                                onChange={(ev) => handleUpdateEntry(e.id, 'period_from', ev.target.value)}
                                className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="date" value={e.period_to ?? ''}
                                onChange={(ev) => handleUpdateEntry(e.id, 'period_to', ev.target.value)}
                                className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-slate-500 tabular" title="CSC days present (auto-computed)">{e.days_worked}</td>
                          <td className="px-2 py-2 text-right text-slate-500 tabular" title="Calendar days (auto-computed)">{e.calendar_days ?? 0}</td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number" step="1" min="0" value={e.absences ?? 0}
                              onChange={(ev) => handleUpdateEntry(e.id, 'absences', Number(ev.target.value))}
                              className="w-12 px-1 py-0.5 text-right rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                            />
                          </td>
                          <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{currency(grossSalary)}</td>
                          <td className="px-2 py-2 text-right font-medium text-slate-700 dark:text-slate-200">{currency(totalEarnings)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 dark:text-rose-400">{currency(totalDed)}</td>
                          <td className="px-2 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{currency(netPay)}</td>
                          <td className="px-2 py-2 flex items-center gap-1">
                            <button onClick={() => toggleRow(e.id)} className="p-1 text-slate-400 hover:text-slate-600">
                              {expandedRows.has(e.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => handleRemoveEntry(e.id)} className="p-1 text-rose-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                        {expandedRows.has(e.id) && (
                          <tr key={e.id + '-detail'} className="bg-slate-50 dark:bg-slate-800/30">
                            <td colSpan={16} className="px-4 py-3">
                              <EntryDetailEditor entry={e} computed={computedMap.get(e.id)} onUpdate={(field, val) => handleUpdateEntry(e.id, field, val)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr className="font-bold text-slate-800 dark:text-slate-100">
                      <td colSpan={11} className="px-2 py-3 text-right">TOTALS</td>
                      <td className="px-2 py-3 text-right">{currency(entries.reduce((s,e)=>s+(computedMap.get(e.id)?.gross_salary??e.gross_salary??0),0))}</td>
                      <td className="px-2 py-3 text-right">{currency(entries.reduce((s,e)=>s+(computedMap.get(e.id)?.gross_salary??e.gross_salary??0)+(computedMap.get(e.id)?.pera??e.pera??0),0))}</td>
                      <td className="px-2 py-3 text-right text-rose-600">{currency(entries.reduce((s,e)=>s+(computedMap.get(e.id)?.total_deductions??e.total_deductions??0),0))}</td>
                      <td className="px-2 py-3 text-right text-emerald-600">{currency(entries.reduce((s,e)=>s+(computedMap.get(e.id)?.total_due??e.net_pay??0),0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {!activeRecord && (
            <div className="py-16 text-center text-slate-400 text-sm">
              No payroll selected. Click "New Payroll" to create one.
            </div>
          )}
        </div>
      )}

      {/* ── RUN COMPUTATION TAB ── */}
      {tab === 'compute' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Run Initial Payroll Computation</h3>
              <p className="text-xs text-slate-500 mt-1">
                Computes gross salary, PERA, GSIS, PhilHealth, Pag-IBIG, withholding tax, and net pay for every entry using the same formulas as the Excel export.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</span>
              <button
                onClick={handleApplyComputed}
                disabled={saving || entries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Apply Computed Values'}
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              No entries to compute. Add employees from the Payroll or Roster tab first.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Gross Salary', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.gross_salary ?? 0), 0), color: 'text-slate-700 dark:text-slate-200' },
                  { label: 'PERA', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.pera ?? 0), 0), color: 'text-blue-600' },
                  { label: 'GSIS (9%)', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.gsis ?? 0), 0), color: 'text-rose-600' },
                  { label: 'PhilHealth', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.philhealth ?? 0), 0), color: 'text-rose-600' },
                  { label: 'Pag-IBIG', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.pagibig ?? 0), 0), color: 'text-rose-600' },
                  { label: 'Withholding Tax', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.monthly_tax ?? 0), 0), color: 'text-rose-600' },
                  { label: 'Net Pay', value: entries.reduce((s, e) => s + (computedMap.get(e.id)?.total_due ?? 0), 0), color: 'text-emerald-600' },
                ].map((card) => (
                  <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{card.label}</p>
                    <p className={`text-sm font-bold tabular mt-1 ${card.color}`}>{currency(card.value)}</p>
                  </div>
                ))}
              </div>

              {/* Detailed computation table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Employee</th>
                      <th className="px-2 py-2 text-left font-medium">Station</th>
                      <th className="px-2 py-2 text-right font-medium">Monthly</th>
                      <th className="px-2 py-2 text-right font-medium">CSC Days</th>
                      <th className="px-2 py-2 text-right font-medium">Cal Days</th>
                      <th className="px-2 py-2 text-right font-medium">Gross (Cal)</th>
                      <th className="px-2 py-2 text-right font-medium">PERA</th>
                      <th className="px-2 py-2 text-right font-medium">GSIS</th>
                      <th className="px-2 py-2 text-right font-medium">PhilHealth</th>
                      <th className="px-2 py-2 text-right font-medium">Pag-IBIG</th>
                      <th className="px-2 py-2 text-right font-medium">Tax</th>
                      <th className="px-2 py-2 text-right font-medium">Total Ded.</th>
                      <th className="px-2 py-2 text-right font-medium">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {entries.map((e) => {
                      const c = computedMap.get(e.id);
                      if (!c) return null;
                      const name = `${e.surname || ''}, ${e.first_name || ''} ${e.middle_name || ''}`.trim();
                      return (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{name}</td>
                          <td className="px-2 py-2 text-slate-500">{e.school || '—'}</td>
                          <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300 tabular">{currency(Number(e.monthly_salary) || 0)}</td>
                          <td className="px-2 py-2 text-right text-slate-500 tabular">{e.days_worked ?? 0}</td>
                          <td className="px-2 py-2 text-right text-slate-500 tabular">{e.calendar_days ?? 0}</td>
                          <td className="px-2 py-2 text-right text-slate-700 dark:text-slate-200 tabular">{currency(c.gross_salary)}</td>
                          <td className="px-2 py-2 text-right text-blue-600 tabular">{currency(c.pera)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(c.gsis)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(c.philhealth)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(c.pagibig)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(c.monthly_tax)}</td>
                          <td className="px-2 py-2 text-right text-rose-600 tabular font-medium">{currency(c.total_deductions)}</td>
                          <td className="px-2 py-2 text-right text-emerald-600 tabular font-bold">{currency(c.total_due)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                    <tr>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100" colSpan={5}>TOTALS ({entries.length} employees)</td>
                      <td className="px-2 py-2 text-right text-slate-700 dark:text-slate-200 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.gross_salary ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-blue-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.pera ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.gsis ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.philhealth ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.pagibig ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.monthly_tax ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-rose-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.total_deductions ?? 0), 0))}</td>
                      <td className="px-2 py-2 text-right text-emerald-600 tabular">{currency(entries.reduce((s, e) => s + (computedMap.get(e.id)?.total_due ?? 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {msg && (
                <div className={`p-3 rounded-lg text-xs font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                  {msg.text}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ROSTER TAB ── */}
      {tab === 'roster' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Initial Payroll Roster</h3>
              <p className="text-xs text-slate-500 mt-1">Click an employee card to view details, check requirements, and transfer to Regular Payroll.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {initialPayrollEmployees.length} employee{initialPayrollEmployees.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => handleRosterExcel(initialPayrollEmployees, 'INITIAL PAYROLL ROSTER')}
                disabled={exporting !== null || initialPayrollEmployees.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting === 'excel' ? 'Exporting...' : 'Excel'}
              </button>
              <button
                onClick={() => handleRosterPdf(initialPayrollEmployees, 'INITIAL PAYROLL ROSTER')}
                disabled={exporting !== null || initialPayrollEmployees.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" /> {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
              </button>
              <button
                onClick={() => setShowAddEmployee(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Employee
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" /> Upload CSV
              </button>
            </div>
          </div>
          {initialPayrollEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              No employees in Initial Payroll status.
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">No.</th>
                    <th className="px-3 py-2 text-left font-medium">Employee Name</th>
                    <th className="px-3 py-2 text-left font-medium">Emp No.</th>
                    <th className="px-3 py-2 text-left font-medium">Position</th>
                    <th className="px-3 py-2 text-left font-medium">Station</th>
                    <th className="px-3 py-2 text-right font-medium">Monthly Salary</th>
                    <th className="px-3 py-2 text-center font-medium">Requirements</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {initialPayrollEmployees.map((e, i) => {
                    const reqs = requirementList(e);
                    const allDone = allRequirementsComplete(e);
                    const completedCount = reqs.filter((r) => r.done).length;
                    const monthlySalary = Number(e.basic ?? e.basic_salary ?? 0);
                    const fname = e.first_name || e.fname || '';
                    const lname = e.last_name || e.lname || '';
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setCardEmployee(e)}
                        className="hover:bg-amber-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                          {lname}, {fname} {e.middle_name || e.mi || ''}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{e.employee_number || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[180px]">{e.position || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{e.stacode || '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{currency(monthlySalary)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {reqs.map((r) => (
                              <div
                                key={r.label}
                                title={r.label}
                                className={`w-4 h-1.5 rounded-full ${r.done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            allDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {allDone ? 'READY' : `${completedCount}/5`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setCardEmployee(e); }}
                            className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                            title="View details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* All employees payroll status overview */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-3">All Employees Payroll Status</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatusCounter label="Initial Payroll" count={initialPayrollEmployees.length} color="amber" onSet={(id) => handleSetPayrollStatus(id, 'Initial Payroll')} />
              <StatusCounter label="Regular Payroll" count={regularPayrollEmployees.length} color="emerald" onSet={(id) => handleSetPayrollStatus(id, 'Regular Payroll')} />
              <StatusCounter label="Inactive" count={roster.filter((e) => e.payroll_status === 'Inactive').length} color="slate" onSet={(id) => handleSetPayrollStatus(id, 'Inactive')} />
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSFER READY TAB ── */}
      {tab === 'transfer_ready' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Ready for Transfer</h3>
              <p className="text-xs text-slate-500 mt-1">Employees with all payroll requirements submitted. Transfer them to Regular Payroll to list them in Employee Records.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {readyForTransfer.length} ready
              </span>
              <button
                onClick={() => handleRosterExcel(readyForTransfer, 'EMPLOYEES READY FOR TRANSFER')}
                disabled={exporting !== null || readyForTransfer.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting === 'excel' ? 'Exporting...' : 'Excel'}
              </button>
              <button
                onClick={() => handleRosterPdf(readyForTransfer, 'EMPLOYEES READY FOR TRANSFER')}
                disabled={exporting !== null || readyForTransfer.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" /> {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
              </button>
            </div>
          </div>
          {readyForTransfer.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              No employees are ready for transfer. Complete all payroll requirements in the Employee Roster first.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {readyForTransfer.map((e) => {
                const monthlySalary = Number(e.basic ?? e.basic_salary ?? 0);
                const fname = e.first_name || e.fname || '';
                const lname = e.last_name || e.lname || '';
                return (
                  <div
                    key={e.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    {/* Card header — emerald for ready */}
                    <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 px-4 py-3 text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-white/5" />
                      <div className="relative flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                          {fname[0]?.toUpperCase()}{lname[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight truncate">{lname}, {fname}</p>
                          <p className="text-[11px] text-emerald-100 truncate mt-0.5">{e.position || '—'} · Emp #{e.employee_number || '—'}</p>
                        </div>
                        <button
                          onClick={() => setCardEmployee(e)}
                          className="shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                          title="View details"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Card body */}
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400">Monthly Salary</p>
                          <p className="font-medium text-slate-700 dark:text-slate-200">{currency(monthlySalary)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Station</p>
                          <p className="font-medium text-slate-700 dark:text-slate-200">{e.stacode || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">TIN</p>
                          <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{e.tin || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ATM Account</p>
                          <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{e.bank_account ? `•••• ${e.bank_account.slice(-4)}` : '—'}</p>
                        </div>
                      </div>
                      {/* All requirements badge */}
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">All 5 requirements submitted</span>
                      </div>
                      {/* Transfer button */}
                      <button
                        onClick={() => handleTransfer(e.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer to Regular Payroll
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick info: where do transferred employees go? */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">After transfer</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Transferred employees will have their payroll status changed to "Regular Payroll" and will automatically appear in the Employee Records list. The transfer is logged in the Transfer Log tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSFERS TAB ── */}
      {tab === 'transfers' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Transfer Log</h3>
            <p className="text-xs text-slate-500 mt-1">Employees transferred from Initial Payroll to Regular Payroll.</p>
          </div>
          {transfers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No transfers recorded yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Employee Name</th>
                  <th className="px-3 py-2 text-left font-medium">Employee No.</th>
                  <th className="px-3 py-2 text-left font-medium">Date Transferred</th>
                  <th className="px-3 py-2 text-left font-medium">Payroll No.</th>
                  <th className="px-3 py-2 text-left font-medium">Processed By</th>
                  {canUndoTransfer && <th className="px-3 py-2 text-right font-medium">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{t.employee_name}</td>
                    <td className="px-3 py-2 text-slate-500">{t.employee_number}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{new Date(t.transferred_at).toLocaleString('en-PH')}</td>
                    <td className="px-3 py-2 text-slate-500">{t.payroll_no}</td>
                    <td className="px-3 py-2 text-slate-500">{t.processed_by_name}</td>
                    {canUndoTransfer && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleUndoTransfer(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800 transition-colors"
                          title="Bring back to Initial Payroll"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Redo
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {/* ── CSV Import Modal ── */}
      <InitialEmployeeImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={loadAll}
      />

      {/* ── Add Employee Modal ── */}
      {showAddEmployee && (
        <AddEmployeeModal
          positions={positions}
          salaryLookup={lookupSalary}
          schools={schools}
          onClose={() => setShowAddEmployee(false)}
          onCreate={handleCreateEmployee}
        />
      )}

      {/* ── Employee Card Modal ── */}
      {cardEmployee && (
        <InitialEmployeeCard
          employee={cardEmployee}
          allEmployees={initialPayrollEmployees}
          positions={positions}
          salaryLookup={lookupSalary}
          schools={schools}
          onClose={() => setCardEmployee(null)}
          onNavigate={(emp) => setCardEmployee(emp)}
          onToggleRequirement={handleToggleRequirement}
          onSaveEmployee={handleSaveEmployee}
          onTransfer={(empId) => { handleTransfer(empId); setCardEmployee(null); }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, color }: { label: string; value: number; color: 'amber' | 'emerald' | 'blue' | 'slate' }) {
  const colors = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusCounter({ label, count, color, onSet }: { label: string; count: number; color: 'amber' | 'emerald' | 'slate'; onSet: (id: string) => void }) {
  void onSet;
  const colors = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-xl font-bold mt-1">{count}</p>
    </div>
  );
}

function AddEmployeeDropdown({ roster, onAdd }: { roster: EmployeePayrollStatus[]; onAdd: (e: EmployeePayrollStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return roster;
    const q = search.toLowerCase();
    return roster.filter((e) => `${e.last_name || e.lname} ${e.first_name || e.fname} ${e.employee_number}`.toLowerCase().includes(q));
  }, [roster, search]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-deped-600 hover:bg-deped-700 text-white text-xs font-medium"
      >
        <Plus className="w-3.5 h-3.5" /> Add Employee
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-40 overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee..."
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No employees found</div>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { onAdd(e); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-100">{e.last_name || e.lname}, {e.first_name || e.fname}</span>
                  <span className="text-slate-400 ml-2">{e.employee_number}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EntryDetailEditor({ entry, computed, onUpdate }: {
  entry: InitialPayrollEntry;
  computed?: ComputationResult;
  onUpdate: (field: keyof InitialPayrollEntry, value: string | number) => void;
}) {
  const earningsFields: { key: keyof InitialPayrollEntry; label: string }[] = [
    { key: 'basic_salary', label: 'Basic Salary' },
    { key: 'pera', label: 'PERA' },
    { key: 'mid_year_bonus', label: 'Mid-Year Bonus' },
    { key: 'cash_gift', label: 'Cash Gift' },
    { key: 'clothing_allowance', label: 'Clothing Allowance' },
    { key: 'cna_incentive', label: 'CNA Incentive' },
    { key: 'other_earnings', label: 'Other Earnings' },
  ];
  const dedFields: { key: keyof InitialPayrollEntry; label: string }[] = [
    { key: 'gsis', label: 'GSIS' },
    { key: 'philhealth', label: 'PhilHealth' },
    { key: 'pagibig', label: 'Pag-IBIG' },
    { key: 'withholding_tax', label: 'Withholding Tax' },
    { key: 'loans', label: 'Loans' },
    { key: 'other_deductions', label: 'Other Deductions' },
  ];

  const cGross = computed?.gross_salary ?? entry.gross_salary;
  const cPera = computed?.pera ?? entry.pera;
  const cTotalEarnings = cGross + cPera;
  const cTotalDed = computed?.total_deductions ?? entry.total_deductions;
  const cAmountDue = computed?.amount_due ?? entry.amount_due;
  const cTotalDue = computed?.total_due ?? entry.total_due ?? entry.net_pay;
  const cTax = computed?.monthly_tax ?? entry.withholding_tax;
  const cGsis = computed?.gsis ?? entry.gsis;
  const cPhilhealth = computed?.philhealth ?? entry.philhealth;
  const cPagibig = computed?.pagibig ?? entry.pagibig;
  const storedDiffers = computed != null && Math.abs(cTotalDue - entry.net_pay) > 0.01;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Employee info */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Employee Details</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <LabeledInput label="Item No." value={entry.item_no ?? ''} onChange={(v) => onUpdate('item_no', v)} />
            <LabeledInput label="TIN" value={entry.tin ?? ''} onChange={(v) => onUpdate('tin', v)} />
            <LabeledInput label="PhilHealth No." value={entry.philhealth_no ?? ''} onChange={(v) => onUpdate('philhealth_no', v)} />
            <LabeledInput label="HDMF No." value={entry.hdmf_no ?? ''} onChange={(v) => onUpdate('hdmf_no', v)} />
            <LabeledInput label="ATM Account" value={entry.atm_account_no ?? ''} onChange={(v) => onUpdate('atm_account_no', v)} />
            <LabeledInput label="Position" value={entry.position_title ?? ''} onChange={(v) => onUpdate('position_title', v)} />
            <LabeledNumber label="Monthly Salary" value={entry.monthly_salary} onChange={(v) => onUpdate('monthly_salary', v)} />
            <LabeledNumber label="Salary Grade" value={entry.salary_grade ?? 0} onChange={(v) => onUpdate('salary_grade', v)} />
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Effectivity Date</label>
              <input
                type="date" value={entry.effectivity_date ?? ''}
                onChange={(e) => onUpdate('effectivity_date', e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-deped-500/30"
              />
            </div>
            <LabeledNumber label="No. of Absences" value={entry.absences ?? 0} onChange={(v) => onUpdate('absences', v)} />
            <ReadOnlyField label="CSC Days Present" value={String(entry.days_worked)} />
            <ReadOnlyField label="Calendar Days" value={String(entry.calendar_days || 0)} />
            <ReadOnlyField label="Salary (CSC Basis)" value={currency(grossFromDaysWorked(dailyRateFromMonthly(entry.monthly_salary), entry.days_worked))} className="text-emerald-600 font-medium" />
            <ReadOnlyField label="Salary (Calendar Basis)" value={currency(entry.monthly_salary / (entry.calendar_days || 1) * entry.days_worked)} className="text-emerald-600 font-medium" />
            <LabeledNumber label="Other Deductions" value={entry.other_deductions} onChange={(v) => onUpdate('other_deductions', v)} />
            <LabeledNumber label="Add. Adjustments" value={entry.additional_adjustments} onChange={(v) => onUpdate('additional_adjustments', v)} />
            <LabeledNumber label="Adj. Deductions" value={entry.adjustment_deductions} onChange={(v) => onUpdate('adjustment_deductions', v)} />
          </div>
        </div>

        {/* Earnings */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Earnings</h4>
          {earningsFields.map(({ key, label }) => (
            <LabeledNumber key={key} label={label} value={entry[key] as number} onChange={(v) => onUpdate(key, v)} />
          ))}
          <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Total Earnings (computed)</span>
            <span className="text-xs font-bold text-emerald-600">{currency(cTotalEarnings)}</span>
          </div>
          {computed && Math.abs(cTotalEarnings - entry.total_earnings) > 0.01 && (
            <div className="flex justify-between text-[10px] text-amber-600">
              <span>Stored value:</span>
              <span>{currency(entry.total_earnings)}</span>
            </div>
          )}
        </div>

        {/* Deductions */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-rose-600 uppercase tracking-wide">Deductions</h4>
          {dedFields.map(({ key, label }) => (
            <LabeledNumber key={key} label={label} value={entry[key] as number} onChange={(v) => onUpdate(key, v)} />
          ))}
          <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Total Deductions (computed)</span>
            <span className="text-xs font-bold text-rose-600">{currency(cTotalDed)}</span>
          </div>
          {computed && Math.abs(cTotalDed - entry.total_deductions) > 0.01 && (
            <div className="flex justify-between text-[10px] text-amber-600">
              <span>Stored value:</span>
              <span>{currency(entry.total_deductions)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-slate-300 dark:border-slate-600">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">NET PAY (computed)</span>
            <span className="text-sm font-bold text-emerald-600">{currency(cTotalDue)}</span>
          </div>
          {computed && Math.abs(cTotalDue - entry.net_pay) > 0.01 && (
            <div className="flex justify-between text-[10px] text-amber-600">
              <span>Stored value:</span>
              <span>{currency(entry.net_pay)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Computation engine breakdown */}
      {computed && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calculator className="w-3.5 h-3.5 text-slate-400" />
            <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Computation Engine Breakdown</h4>
            {storedDiffers && (
              <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Stored values are stale — run computation to sync
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
            <CompMetric label="Gross Salary" value={currency(computed.gross_salary)} />
            <CompMetric label="PERA" value={currency(computed.pera)} />
            <CompMetric label="GSIS (9%)" value={currency(cGsis)} />
            <CompMetric label="PhilHealth" value={currency(cPhilhealth)} />
            <CompMetric label="Pag-IBIG" value={currency(cPagibig)} />
            <CompMetric label="W/holding Tax" value={currency(cTax)} />
            <CompMetric label="Annual Income" value={currency(computed.annual_income)} />
            <CompMetric label="Annual Deductions" value={currency(computed.annual_deductions)} />
            <CompMetric label="Taxable Income" value={currency(computed.taxable_income)} />
            <CompMetric label="Annual Tax" value={currency(computed.annual_tax)} />
            <CompMetric label="Amount Due" value={currency(cAmountDue)} valueClass="text-emerald-600" />
            <CompMetric label="Total Due" value={currency(cTotalDue)} valueClass="text-emerald-700 font-bold" />
          </div>
        </div>
      )}
    </div>
  );
}

function CompMetric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded px-2 py-1.5 border border-slate-100 dark:border-slate-700">
      <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`tabular ${valueClass ?? 'text-slate-700 dark:text-slate-200'}`}>{value}</p>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-400 mb-0.5">{label}</label>
      <input
        type="text" value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-deped-500/30"
      />
    </div>
  );
}

function LabeledNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-400 mb-0.5">{label}</label>
      <input
        type="number" step="0.01" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 text-xs text-right rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-deped-500/30"
      />
    </div>
  );
}

function ReadOnlyField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-400 mb-0.5">{label}</label>
      <div className={'w-full px-2 py-1 text-xs text-right rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 ' + className}>
        {value}
      </div>
    </div>
  );
}



// ── Add Employee Modal (manual entry) ──────────────────────────────────────────
function AddEmployeeModal({
  positions, salaryLookup, schools, onClose, onCreate,
}: {
  positions: PositionMgmt[];
  salaryLookup: (grade: number, step: number) => number | undefined;
  schools: { id: string; school_code: string; school_name: string; school_type: string }[];
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    last_name: '',
    first_name: '',
    middle_name: '',
    employee_number: '',
    poscode: '',
    position: '',
    stacode: '',
    department: '',
    grade: 0,
    step: 0,
    basic: 0,
    hire_date: new Date().toISOString().slice(0, 10),
    tin: '',
    philhealth_number: '',
    pagibig_number: '',
    bank_name: '',
    bank_account: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const autoSalary = useMemo(() => {
    if (form.grade > 0 && form.step > 0) {
      const v = salaryLookup(form.grade, form.step);
      if (v !== undefined) return v;
    }
    return null;
  }, [form.grade, form.step, salaryLookup]);

  function selectPosition(pos: PositionMgmt) {
    setForm((f) => ({ ...f, poscode: pos.position_code, position: pos.position_title || pos.position_name, grade: pos.salary_grade, step: f.step || 1 }));
  }
  function selectSchool(school: { school_code: string; school_name: string }) {
    setForm((f) => ({ ...f, stacode: school.school_code, department: school.school_name }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.last_name.trim() || !form.first_name.trim()) { setError('Last Name and First Name are required.'); return; }
    if (!form.employee_number.trim()) { setError('Employee Number is required.'); return; }
    setSaving(true);
    const salary = autoSalary ?? form.basic;
    const data: Record<string, unknown> = {
      last_name: form.last_name, first_name: form.first_name, middle_name: form.middle_name,
      lname: form.last_name, fname: form.first_name, mi: form.middle_name,
      employee_number: form.employee_number,
      position: form.position, poscode: form.poscode,
      stacode: form.stacode, department: form.department,
      grade: form.grade, step: form.step,
      basic: salary, basic_salary: salary,
      hire_date: form.hire_date || null,
      tin: form.tin, philhealth_number: form.philhealth_number, pagibig_number: form.pagibig_number,
      bank_name: form.bank_name, bank_account: form.bank_account,
    };
    const ok = await onCreate(data);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">Add New Employee</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}

          {/* Name section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Last Name *</label>
              <input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" required />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" required />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Middle Name</label>
              <input value={form.middle_name} onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Employee Number *</label>
              <input value={form.employee_number} onChange={(e) => setForm((f) => ({ ...f, employee_number: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" required />
            </div>
          </div>

          {/* Position & Station */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Position (from Position Management)</label>
              <select value={form.poscode} onChange={(e) => { const pos = positions.find((p) => p.position_code === e.target.value); if (pos) selectPosition(pos); else setForm((f) => ({ ...f, poscode: '', position: '' })); }} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30">
                <option value="">— Select Position —</option>
                {positions.map((p) => <option key={p.id} value={p.position_code}>{p.position_code} · {p.position_title || p.position_name} (SG {p.salary_grade})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Position Title</label>
              <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Station / School (from Schools Directory)</label>
              <select value={form.stacode} onChange={(e) => { const sc = schools.find((s) => s.school_code === e.target.value); if (sc) selectSchool(sc); else setForm((f) => ({ ...f, stacode: e.target.value })); }} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30">
                <option value="">— Select School / Station —</option>
                {schools.map((s) => <option key={s.id} value={s.school_code}>{s.school_code} · {s.school_name} ({s.school_type})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Department</label>
              <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
          </div>

          {/* Salary Grade / Step / Salary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Salary Grade</label>
              <input type="number" min={1} max={33} value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Step</label>
              <select value={form.step} onChange={(e) => setForm((f) => ({ ...f, step: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30">
                <option value={0}>— Select Step —</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((st) => <option key={st} value={st}>Step {st}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">{autoSalary !== null ? 'Monthly Salary (auto from Schedule)' : 'Monthly Salary'}</label>
              <input type="number" value={autoSalary ?? form.basic} disabled={autoSalary !== null} onChange={(e) => setForm((f) => ({ ...f, basic: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30 disabled:bg-slate-100 disabled:text-slate-500" />
            </div>
          </div>

          {/* Gov IDs & Bank */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Hire Date</label>
              <input type="date" value={form.hire_date} onChange={(e) => setForm((f) => ({ ...f, hire_date: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">TIN</label>
              <input value={form.tin} onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">PhilHealth #</label>
              <input value={form.philhealth_number} onChange={(e) => setForm((f) => ({ ...f, philhealth_number: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Pag-IBIG #</label>
              <input value={form.pagibig_number} onChange={(e) => setForm((f) => ({ ...f, pagibig_number: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Bank Name</label>
              <input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">ATM Account #</label>
              <input value={form.bank_account} onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4" /> {saving ? 'Adding…' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
