// ── Communication Allowance Payroll — Dashboard ──────────────────────────────
// Department of Education · Division of Calamba City · "Other Payroll" module.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Wallet, Users, Search, Plus, Pencil, Trash2, X, Upload, Download,
  FileSpreadsheet, AlertTriangle, ChevronRight, RefreshCw,
  History, UserPlus, BadgeCheck, HandCoins, ScrollText, Building2, Calendar,
  CheckCircle2, Eye, ClipboardCopy,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import { usePositions } from '@/lib/usePositions';
import { Pagination, usePagination } from '@/components/Pagination';
import { currency, generateCsv, downloadFile } from '@/lib/reports';
import {
  caCapability, caAllowedNext, nextCaPayrollNo, num, parseCaEmployeeCsv, money,
  caMiddleInitial, caNormalizeStatus, parseEmpFullName, buildCaSyncPlan, caErrMsg, caIsMissingTable,
  caDedupeByAccount, caStacodeFromSchoolName, caUpsertEmployees, caMissingOptionalColumn,
  caDisplayGroup, caPositionRank, caMasterfileStacodeNum,
  exportCaSyncReportCsv, exportCaSyncReportExcel,
  exportCaMasterfileExcelBySchool,
  CA_BREAKDOWN_CATEGORIES, CA_BREAKDOWN_DEFS,
  type CaSyncPlan,
} from '@/lib/commAllowance';
import type { CaCapability } from '@/lib/commAllowance';
import {
  CA_DEFAULT_AGENCY, CA_DEFAULT_DIVISION, CA_DEFAULT_PAYROLL_TYPE,
  CA_DEFAULT_AMOUNT, CA_DEFAULT_DEDUCTION, CA_STATUS_COLORS, CA_SIGNATORY_DEFS,
  CA_RECORD_TYPE_PAYROLL, CA_RECORD_TYPE_EMPLOYEE,
  type CaEmployee, type CaPayrollHeader, type CaStatus,
} from '@/types/commAllowance';
import type { AuditLog, UserProfile } from '@/types/auth';
import CommAllowancePayroll from './CommAllowancePayroll';
import caSetupSql from '@/sql/ca_setup.sql?raw';

const EMPLOYEE_CSV_HEADERS = ['account_no', 'last_name', 'first_name', 'middle_initial', 'position_title', 'school_name', 'stacode', 'category', 'status'];

interface CreateForm {
  payroll_title: string;
  payroll_type: string;
  /** Payroll scope — 'all' | `group:<category>` | `school:<school name>` ('' = no school). */
  schoolSelection: string;
  covered_period: string;
  default_amount: string;
  default_deduction: string;
  alobs_no: string;
  jev_no: string;
  eo_no: string;
  date: string;
  payroll_ref_no: string;
  remarks: string;
}

function emptyCreateForm(): CreateForm {
  return {
    payroll_title: CA_DEFAULT_PAYROLL_TYPE,
    payroll_type: CA_DEFAULT_PAYROLL_TYPE,
    schoolSelection: 'all',
    covered_period: '',
    default_amount: String(CA_DEFAULT_AMOUNT),
    default_deduction: String(CA_DEFAULT_DEDUCTION),
    alobs_no: '',
    jev_no: '',
    eo_no: '',
    date: new Date().toISOString().slice(0, 10),
    payroll_ref_no: '',
    remarks: '',
  };
}

export default function CommAllowance({ profile }: { profile: UserProfile | null }) {
  const { logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  // Fresh division scope for the CA sync (async handlers).
  const caScopeRef = useRef(codeScope(scopedCodes));
  caScopeRef.current = codeScope(scopedCodes);
  const cap = caCapability(profile?.role ?? 'read_only');
  const { lookup: lookupPosition, positions: positionList } = usePositions();

  // Position codes stored on source records are resolved to the official
  // Position Title from Position Management (position_management). Memoized so
  // the masterfile sort can depend on it without rebuilding every render.
  const positionTitle = useCallback((code: string): string => {
    const c = String(code ?? '').trim();
    if (!c) return '';
    const p = lookupPosition(c);
    return p ? (p.position_title || p.position_name || c) : c;
  }, [lookupPosition]);

  const [tab, setTab] = useState<'overview' | 'employees' | 'activity'>('overview');
  const [headers, setHeaders] = useState<CaPayrollHeader[]>([]);
  const [employees, setEmployees] = useState<CaEmployee[]>([]);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm());
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Employees tab
  const [empSearch, setEmpSearch] = useState('');
  const [empSchoolFilter, setEmpSchoolFilter] = useState('all');
  const [empModal, setEmpModal] = useState<null | { id?: string }>(null);
  const [empForm, setEmpForm] = useState<CaEmployee>(emptyEmp());
  // Organization directory (Elementary / High Schools / Implementing Units) —
  // powers the school-name datalist with STACODE-prefixed options.
  const [schoolDir, setSchoolDir] = useState<{ school_code: string; school_name: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncPlan, setSyncPlan] = useState<CaSyncPlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [h, e] = await Promise.all([
        fetchAll(() => supabase.from('ca_payroll_headers').select('*').order('created_date', { ascending: false })),
        fetchAll(() => supabase.from('ca_employees').select('*').order('stacode', { ascending: true }).order('last_name', { ascending: true })),
      ]);
      setHeaders(h as CaPayrollHeader[]);
      setEmployees(e as CaEmployee[]);
    } catch (err) {
      const msg = caErrMsg(err);
      setDbError(caIsMissingTable(msg) ? msg : null);
      if (!caIsMissingTable(msg)) setError(msg);
    } finally {
      setLoading(false);
    }
    // Organization directory — lookup only, never blocks the page.
    try {
      const { data: sd } = await supabase.from('schools').select('school_code, school_name').eq('status', 'Active');
      setSchoolDir((sd ?? []) as { school_code: string; school_name: string }[]);
    } catch { /* optional lookup */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadActivity = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('audit_logs')
      .select('*')
      .in('record_type', [CA_RECORD_TYPE_PAYROLL, CA_RECORD_TYPE_EMPLOYEE])
      .order('created_at', { ascending: false })
      .limit(100);
    if (!e) setActivity((data ?? []) as AuditLog[]);
  }, []);

  const openTab = (t: 'overview' | 'employees' | 'activity') => {
    setTab(t);
    setError(null);
    if (t === 'activity') void loadActivity();
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let gross = 0, ded = 0, net = 0, generated = 0, approved = 0, paid = 0, total = headers.length;
    for (const h of headers) {
      gross += num(h.gross_amount);
      ded += num(h.total_deductions);
      net += num(h.net_amount);
      if (h.status === 'Generated') generated++;
      if (h.status === 'Approved') approved++;
      if (h.status === 'Paid') paid++;
    }
    const activeEmployees = employees.filter((e) => e.status === 'Active').length;
    return { gross, ded, net, generated, approved, paid, total, activeEmployees };
  }, [headers, employees]);

  // ── Payroll breakdown ──────────────────────────────────────────────────────
  // Grouped by the STACODE-derived group (caDisplayGroup) so a 095 record is
  // always counted under Division Office, not Elementary/Secondary — regardless
  // of the category stamped by an older sync.
  const breakdown = useMemo(() => {
    const b: Record<string, number> = {};
    for (const e of employees) {
      if (e.status !== 'Active') continue;
      const g = caDisplayGroup(e);
      b[g] = (b[g] ?? 0) + 1;
    }
    return b;
  }, [employees]);

  // Grouped school dropdown for payroll creation: all 7 categories with every
  // school name under each group (from the CA masterfile) and live employee counts.
  const schoolGroups = useMemo(() => {
    const active = employees.filter((e) => e.status === 'Active');
    const groups: { category: string; source: string; schools: { name: string; count: number }[]; total: number }[] = [];
    for (const def of CA_BREAKDOWN_DEFS) {
      const cat = active.filter((e) => caDisplayGroup(e) === def.category);
      if (cat.length === 0) continue;
      const bySchool = new Map<string, number>();
      for (const e of cat) {
        const s = e.school_name.trim();
        bySchool.set(s, (bySchool.get(s) ?? 0) + 1);
      }
      groups.push({
        category: def.category,
        source: def.source,
        schools: [...bySchool.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        total: cat.length,
      });
    }
    return groups;
  }, [employees]);

  // Live count of active employees matching the current School / Group selection.
  const selCount = useMemo(() => {
    const s = createForm.schoolSelection;
    const active = employees.filter((e) => e.status === 'Active');
    if (s === 'all') return active.length;
    if (s.startsWith('group:')) return active.filter((e) => caDisplayGroup(e) === s.slice('group:'.length)).length;
    if (s.startsWith('school:')) return active.filter((e) => e.school_name === s.slice('school:'.length)).length;
    return 0;
  }, [employees, createForm.schoolSelection]);

  // ── Payroll list ───────────────────────────────────────────────────────────
  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const filteredHeaders = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return headers.filter((h) => {
      if (statusFilter !== 'all' && h.status !== statusFilter) return false;
      if (!q) return true;
      return [h.payroll_no, h.school_name, h.covered_period, h.payroll_title, h.payroll_ref_no]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [headers, listSearch, statusFilter]);
  const listPagination = usePagination(filteredHeaders, 10, `${statusFilter}-${listSearch}`);

  const transition = async (h: CaPayrollHeader, to: CaStatus) => {
    setError(null);
    const { error: e } = await supabase
      .from('ca_payroll_headers')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('id', h.id);
    if (e) { setError(e.message); return; }
    await logAudit(`ca_transition_${to.toLowerCase()}`, CA_RECORD_TYPE_PAYROLL, h.id, {
      payroll_no: h.payroll_no, from: h.status, to,
    });
    await load();
  };

  const removePayroll = async (h: CaPayrollHeader) => {
    if (!window.confirm(`Delete payroll ${h.payroll_no}? This permanently removes its ${h.total_employees} entries.`)) return;
    const { error: e } = await supabase.from('ca_payroll_headers').delete().eq('id', h.id);
    if (e) { setError(e.message); return; }
    await logAudit('ca_delete', CA_RECORD_TYPE_PAYROLL, h.id, { payroll_no: h.payroll_no });
    await load();
  };

  // ── Create payroll ─────────────────────────────────────────────────────────
  const openCreate = () => { setCreateForm(emptyCreateForm()); setCreateErr(null); setShowCreate(true); };

  const handleCreate = async () => {
    setCreateErr(null);
    if (!createForm.covered_period.trim()) { setCreateErr('Covered Period is required.'); return; }
    setCreating(true);
    try {
      const payrollNo = await nextCaPayrollNo();
      const amount = num(createForm.default_amount);
      const deduction = num(createForm.default_deduction);
      const sel = createForm.schoolSelection;
      let source: CaEmployee[] = [];
      let headerSchool = '';
      if (sel === 'all') {
        source = employees.filter((e) => e.status === 'Active');
      } else if (sel.startsWith('group:')) {
        headerSchool = sel.slice('group:'.length);
        source = employees.filter((e) => e.status === 'Active' && caDisplayGroup(e) === headerSchool);
      } else if (sel.startsWith('school:')) {
        headerSchool = sel.slice('school:'.length);
        source = employees.filter((e) => e.status === 'Active' && e.school_name === headerSchool);
      }
      if (source.length === 0) { setCreateErr('No active employees match the selected group/school. Add or sync employees first.'); return; }

      const headerData = {
        payroll_no: payrollNo,
        payroll_title: createForm.payroll_title.trim() || CA_DEFAULT_PAYROLL_TYPE,
        payroll_type: createForm.payroll_type.trim() || CA_DEFAULT_PAYROLL_TYPE,
        agency: CA_DEFAULT_AGENCY,
        division: CA_DEFAULT_DIVISION,
        school_name: headerSchool,
        covered_period: createForm.covered_period.trim(),
        alobs_no: createForm.alobs_no.trim(),
        jev_no: createForm.jev_no.trim(),
        eo_no: createForm.eo_no.trim(),
        date: createForm.date || null,
        payroll_ref_no: createForm.payroll_ref_no.trim(),
        remarks: createForm.remarks.trim(),
        created_by: profile?.email ?? '',
        status: 'Draft',
      };
      const { data: hdr, error: hErr } = await supabase
        .from('ca_payroll_headers')
        .insert(headerData)
        .select()
        .single();
      if (hErr) throw hErr;

      const details = source.map((e, i) => ({
        payroll_id: hdr.id,
        employee_id: e.id,
        line_no: i + 1,
        amount,
        deduction,
        net_amount_due: money(amount - deduction),
        remarks: '',
      }));
      const { error: dErr } = await supabase.from('ca_payroll_details').insert(details);
      if (dErr) throw dErr;

      const sigs = CA_SIGNATORY_DEFS.map((s) => ({
        payroll_id: hdr.id, signatory_type: s.type, name: '', position: s.position, sequence_no: s.seq,
      }));
      const { error: sErr } = await supabase.from('ca_payroll_signatories').insert(sigs);
      if (sErr) throw sErr;

      const totals = { total_employees: source.length, gross_amount: money(amount * source.length), total_deductions: money(deduction * source.length), net_amount: money((amount - deduction) * source.length) };
      await supabase.from('ca_payroll_headers').update(totals).eq('id', hdr.id);

      await logAudit('ca_create', CA_RECORD_TYPE_PAYROLL, hdr.id, { payroll_no: payrollNo, employees: source.length });
      setShowCreate(false);
      await load();
      setSelectedId(hdr.id);
    } catch (err) {
      setCreateErr(caErrMsg(err));
    } finally {
      setCreating(false);
    }
  };

  // ── Employees tab ──────────────────────────────────────────────────────────
  // Every school present in the masterfile (with its employee count) so the
  // list can be narrowed to a single school.
  const empSchoolOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const s = (e.school_name ?? '').trim();
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);

  const empFiltered = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const school = empSchoolFilter;
    return employees
      .filter((e) => {
        if (school !== 'all' && (e.school_name ?? '').trim() !== school) return false;
        if (!q) return true;
        return [e.account_no, e.last_name, e.first_name, e.position_title, e.school_name, e.stacode, e.category]
          .some((v) => (v ?? '').toLowerCase().includes(q));
      })
      // Per-school/STACODE order — School Principals first, then Head Teachers,
      // then everyone else (name order within each rank).
      .sort((a, b) => {
        const ka = caMasterfileStacodeNum(a.stacode) ?? 9999;
        const kb = caMasterfileStacodeNum(b.stacode) ?? 9999;
        if (ka !== kb) return ka - kb;
        const ra = caPositionRank(positionTitle(a.position_title));
        const rb = caPositionRank(positionTitle(b.position_title));
        if (ra !== rb) return ra - rb;
        return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      });
  }, [employees, empSearch, empSchoolFilter, positionTitle]);
  const empPagination = usePagination(empFiltered, 12, `${empSearch}|${empSchoolFilter}`);

  const openEmpModal = (emp?: CaEmployee) => {
    // Position is stored as its Position Management TITLE (codes are resolved
    // at display/sync time) — resolve any stored code before editing.
    setEmpForm(emp ? { ...emp, position_title: positionTitle(emp.position_title) } : emptyEmp());
    setEmpModal(emp ? { id: emp.id } : {});
  };

  const saveEmp = async () => {
    setError(null);
    if (!empForm.account_no.trim() || !empForm.last_name.trim() || !empForm.first_name.trim()) {
      setError('Account No., Last Name and First Name are required.'); return;
    }
    // STACODE lives inside the School Name ("001 - Banlic Elementary School"):
    // keep any existing value, otherwise derive it from the name's prefix.
    // Category is chosen manually here — the STACODE→category mapping is applied
    // by Auto Employee Sync, not by this form.
    const stacode = empForm.stacode.trim() || caStacodeFromSchoolName(empForm.school_name);
    const payload = {
      account_no: empForm.account_no.trim(),
      last_name: empForm.last_name.trim(),
      first_name: empForm.first_name.trim(),
      middle_initial: empForm.middle_initial.trim(),
      position_title: empForm.position_title.trim(),
      school_name: empForm.school_name.trim(),
      stacode,
      category: empForm.category,
      status: empForm.status,
      updated_at: new Date().toISOString(),
    };
    // Optional columns (category, stacode) may not exist until their migrations
    // run — retry without the missing column so save still works.
    const stripped = new Set<string>();
    let saved: { id?: string } | null = null;
    let saveErr: { message: string } | null = null;
    for (;;) {
      const slim = { ...payload };
      for (const c of stripped) delete (slim as Record<string, unknown>)[c];
      if (empModal?.id) {
        const { error: e } = await supabase.from('ca_employees').update(slim).eq('id', empModal.id);
        if (!e) { saved = { id: empModal.id }; saveErr = null; break; }
        saveErr = e;
      } else {
        const { data, error: e } = await supabase.from('ca_employees').insert({ ...slim, created_at: new Date().toISOString() }).select().single();
        if (!e) { saved = data; saveErr = null; break; }
        saveErr = e;
      }
      const col = caMissingOptionalColumn(caErrMsg(saveErr));
      if (!col || stripped.has(col)) break;
      stripped.add(col);
    }
    if (saveErr) { setError(saveErr.message); return; }
    if (empModal?.id) {
      await logAudit('ca_employee_update', CA_RECORD_TYPE_EMPLOYEE, empModal.id, { account_no: payload.account_no });
    } else if (saved?.id) {
      await logAudit('ca_employee_create', CA_RECORD_TYPE_EMPLOYEE, saved.id, { account_no: payload.account_no });
    }
    setEmpModal(null);
    await load();
  };

  const toggleEmpStatus = async (e: CaEmployee) => {
    const next = e.status === 'Active' ? 'Inactive' : 'Active';
    const { error: err } = await supabase.from('ca_employees').update({ status: next, updated_at: new Date().toISOString() }).eq('id', e.id);
    if (err) { setError(err.message); return; }
    await logAudit(next === 'Active' ? 'ca_employee_activate' : 'ca_employee_deactivate', CA_RECORD_TYPE_EMPLOYEE, e.id, { account_no: e.account_no });
    await load();
  };

  const deleteEmp = async (e: CaEmployee) => {
    const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.account_no;
    if (!window.confirm(`Delete ${name} from the CA masterfile? This permanently removes the employee record.`)) return;
    const { error } = await supabase.from('ca_employees').delete().eq('id', e.id);
    if (error) { setError(error.message); return; }
    await logAudit('ca_employee_delete', CA_RECORD_TYPE_EMPLOYEE, e.id, { account_no: e.account_no });
    await load();
  };

  const handleEmpFile = async (file: File) => {
    setImporting(true);
    setNotice(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseCaEmployeeCsv(text);
      if (rows.length === 0) { setError(errors[0] ?? 'No valid rows found.'); return; }
      const { error: e } = await caUpsertEmployees(rows.map((r) => ({
        ...r, middle_initial: caMiddleInitial(r.middle_initial), status: r.status || 'Active', updated_at: new Date().toISOString(),
      })));
      if (e) { setError(e.message); return; }
      setNotice(`Imported ${rows.length} employee record(s)${errors.length ? ` with ${errors.length} warning(s).` : '.'}`);
      await logAudit('ca_employee_import', CA_RECORD_TYPE_EMPLOYEE, undefined, { count: rows.length });
      await load();
    } catch (err) {
      setError(caErrMsg(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadEmpTemplate = () => {
    downloadFile({
      filename: 'ca_employee_template.csv',
      content: generateCsv(EMPLOYEE_CSV_HEADERS, [['1012345678', 'DELA CRUZ', 'JUAN', 'P.', 'TEACHER I', 'CALAMBA CENTRAL SCHOOL', '123', 'Elementary', 'Active']]),
      mimeType: 'text/csv',
    });
  };

  // Auto Employee — dry-run preview + apply.
  const previewSync = async () => {
    setPreviewing(true);
    setError(null);
    try {
      setSyncPlan(await buildCaSyncPlan(caScopeRef.current));
    } catch (err) {
      setError(caErrMsg(err));
    } finally {
      setPreviewing(false);
    }
  };

  const applySyncPlan = async (plan: CaSyncPlan) => {
    setPulling(true);
    setError(null);
    try {
      // caUpsertEmployees dedupes by account_no (Postgres rejects duplicate
      // conflict keys: "ON CONFLICT DO UPDATE command cannot affect row a second
      // time") and retries without optional columns (category, stacode) that only
      // exist after their migrations are applied.
      const { error: uErr } = await caUpsertEmployees(plan.rows);
      if (uErr) throw uErr;
      const parts = CA_BREAKDOWN_DEFS
        .map((d) => ({ ...d, count: plan.byCategory[d.category] ?? 0 }))
        .filter((x) => x.count > 0)
        .map((x) => `${x.category} ${x.count}`);
      setNotice(`Auto-synced ${plan.total} employee(s) — ${parts.join(', ')}${plan.unclassified ? `, ${plan.unclassified} unclassified` : ''}${plan.schools ? `, across ${plan.schools} school(s)` : ''}.`);
      await logAudit('ca_employee_auto_sync', CA_RECORD_TYPE_EMPLOYEE, undefined, {
        total: plan.total, new: plan.newCount, updated: plan.updateCount, unchanged: plan.unchangedCount,
        byCategory: plan.byCategory, unclassified: plan.unclassified, schools: plan.schools,
      });
      setSyncPlan(null);
      await load();
    } catch (err) {
      setError(caErrMsg(err));
    } finally {
      setPulling(false);
    }
  };

  const runSync = async () => {
    try {
      const plan = await buildCaSyncPlan(caScopeRef.current);
      if (plan.rows.length === 0) {
        setNotice('Nothing to sync — no Employee Records, Non-Plantilla Items, approved Employee Movement (Detailed) requests or Newly Hired Employees could be mapped.');
        return;
      }
      await applySyncPlan(plan);
    } catch (err) {
      setError(caErrMsg(err));
    }
  };

  const exportSyncReportCsv = () => {
    if (!syncPlan) return;
    try { exportCaSyncReportCsv(syncPlan); }
    catch (err) { setError(caErrMsg(err)); }
  };

  const exportSyncReportExcel = async () => {
    if (!syncPlan) return;
    setError(null);
    try { await exportCaSyncReportExcel(syncPlan); }
    catch (err) { setError(caErrMsg(err)); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (selectedId) {
    return (
      <CommAllowancePayroll
        profile={profile}
        payrollId={selectedId}
        onBack={() => { setSelectedId(null); void load(); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Communication Allowance Payroll</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {CA_DEFAULT_AGENCY} · {CA_DEFAULT_DIVISION} · Other Payroll Module
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-medium text-deped-700">{cap.level === 'admin' ? 'Administrator' : cap.level === 'officer' ? 'Payroll Officer' : cap.level === 'accountant' ? 'Accountant' : cap.level === 'cashier' ? 'Cashier' : 'Viewer'}</span>
          </p>
        </div>
        {cap.canCreate && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> New Payroll
          </button>
        )}
      </div>

      {dbError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Database setup incomplete.</p>
            <p className="mt-0.5">Apply the <strong>PocketBase CA migration</strong> (<code className="font-mono text-[11px] bg-amber-100 px-1.5 py-0.5 rounded">pb_migrations/</code>) to create all 4 CA collections plus the <strong>category</strong> and <strong>stacode</strong> fields — or run the consolidated setup script in your PocketBase Admin SQL console:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(caSetupSql).then(() => {
                    const b = document.getElementById('ca-copy-sql');
                    if (b) { const t = b.textContent; b.textContent = '✓ Copied!'; setTimeout(() => { b.textContent = t; }, 1600); }
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span id="ca-copy-sql">Copy Setup SQL</span>
              </button>
              <code className="font-mono text-[11px] bg-amber-100 px-1.5 py-0.5 rounded">src/sql/ca_setup.sql</code>
            </div>
            <p className="mt-2 text-xs opacity-80">{dbError}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-sm">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">
          <BadgeCheck className="w-4 h-4" /> {notice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['overview', 'Payroll Register', Wallet], ['employees', 'CA Employee Masterfile', Users], ['activity', 'Activity Log', History]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => openTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-deped-700 text-deped-700 dark:border-deped-400 dark:text-deped-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-2">
          <LoadingIndicator size={40} /> Loading…
        </div>
      ) : tab === 'overview' ? (
        <OverviewTab
          kpis={kpis}
          headers={filteredHeaders}
          listSearch={listSearch}
          setListSearch={setListSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          pagination={listPagination}
          cap={cap}
          onOpen={(h) => setSelectedId(h.id)}
          onTransition={transition}
          onDelete={removePayroll}
        />
      ) : tab === 'employees' ? (
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-heading">CA Employee Masterfile</h2>
              <p className="text-xs text-slate-500 mt-0.5">{employees.filter((e) => e.status === 'Active').length} active · {employees.length} total</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void exportCaMasterfileExcelBySchool(employees, { resolvePosition: positionTitle })}
                disabled={employees.length === 0}
                className="btn-secondary"
                title="Download Excel workbooks per school — Elementary (STACODE 001–094), Division Office (095), High School (500–701)"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Excel
              </button>
              {cap.canManageEmployees && (
                <>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                    onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void handleEmpFile(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-secondary">
                    <Upload className="w-4 h-4" /> {importing ? 'Importing…' : 'Import CSV'}
                  </button>
                  <button onClick={downloadEmpTemplate} className="btn-secondary"><Download className="w-4 h-4" /> Template</button>
                  <button onClick={() => void previewSync()} disabled={previewing || pulling} className="btn-secondary" title="Dry-run: preview what the sync will change before applying">
                    <Eye className="w-4 h-4" /> {previewing ? 'Analyzing…' : 'Preview Sync'}
                  </button>
                  <button onClick={() => void runSync()} disabled={pulling || previewing} className="btn-secondary" title="Sync employees from Employee Records (classified by STACODE), Non-Plantilla Items, approved Employee Movement (Detailed) requests and approved Newly Hired Employees">
                    {pulling ? <LoadingIndicator size={40} /> : <RefreshCw className="w-4 h-4" />} {pulling ? 'Syncing…' : 'Auto Employee Sync'}
                  </button>
                  <button onClick={() => openEmpModal()} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
                </>
              )}
            </div>
          </div>
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400"><Building2 className="w-3.5 h-3.5 text-deped-600" /> Payroll Breakdown</span>
            {CA_BREAKDOWN_DEFS.filter((d) => (breakdown[d.category] ?? 0) > 0).map((d) => (
              <span key={d.category} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium badge ${catTone(d.category)}`}>
                {d.category} · {d.source} · {breakdown[d.category]}
              </span>
            ))}
            {(breakdown[''] ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium badge bg-slate-100 text-slate-500 border-slate-200">Unclassified · {breakdown['']}</span>
            )}
          </div>
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search account no, name, position, school, category…" className="input-base pl-9" />
            </div>
            <div className="relative">
              <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={empSchoolFilter}
                onChange={(e) => setEmpSchoolFilter(e.target.value)}
                className="input-base pl-9 pr-8 max-w-xs"
                title="Filter by school"
              >
                <option value="all">All schools ({employees.length})</option>
                {empSchoolOptions.map(([name, count]) => (
                  <option key={name || '(none)'} value={name}>{name || '(No school)'} ({count})</option>
                ))}
              </select>
            </div>
            {empSchoolFilter !== 'all' && (
              <button
                onClick={() => setEmpSchoolFilter('all')}
                className="text-xs font-medium text-slate-500 hover:text-deped-700 dark:hover:text-deped-300"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Account No.</th>
                  <th className="text-left px-4 py-3 font-medium">Last Name</th>
                  <th className="text-left px-4 py-3 font-medium">First Name</th>
                  <th className="text-left px-4 py-3 font-medium">M.I.</th>
                  <th className="text-left px-4 py-3 font-medium">Position</th>
                  <th className="text-left px-4 py-3 font-medium">School</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  {cap.canManageEmployees && <th className="text-right px-5 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {empPagination.pagedItems.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{e.account_no}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{e.last_name}</td>
                    <td className="px-4 py-2.5">{e.first_name}</td>
                    <td className="px-4 py-2.5">{e.middle_initial}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.position_title ? positionTitle(e.position_title) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.school_name}</td>
                    <td className="px-4 py-2.5">
                      {(() => { const g = caDisplayGroup(e); return g ? <span className={`badge ${catTone(g)}`}>{g}</span> : <span className="text-slate-300">—</span>; })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${e.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{e.status}</span>
                    </td>
                    {cap.canManageEmployees && (
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEmpModal(e)} title="Edit" className="p-1.5 rounded-lg text-slate-400 hover:text-deped-700 hover:bg-deped-50 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => void toggleEmpStatus(e)} title={e.status === 'Active' ? 'Deactivate' : 'Activate'} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"><BadgeCheck className="w-4 h-4" /></button>
                          <button onClick={() => void deleteEmp(e)} title="Delete" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={empPagination} label="employees" />
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="section-heading">Recent Activity — Communication Allowance</h2>
            <p className="text-xs text-slate-500 mt-0.5">Audit trail for payroll & employee actions in this module</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Date / Time</th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Record</th>
                  <th className="text-left px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-2.5 text-xs text-slate-500">{new Date(a.created_at).toLocaleString('en-PH')}</td>
                    <td className="px-4 py-2.5 text-xs font-medium">{a.user_email ?? 'system'}</td>
                    <td className="px-4 py-2.5"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{a.action}</code></td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{a.record_type}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[260px] truncate">{JSON.stringify(a.details ?? {})}</td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No activity recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create payroll modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><Wallet className="w-5 h-5" /></span>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">New Communication Allowance Payroll</h3>
                  <p className="text-xs text-slate-500">{CA_DEFAULT_DIVISION}</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Payroll Title</span>
                  <input value={createForm.payroll_title} onChange={(e) => setCreateForm({ ...createForm, payroll_title: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Payroll Type</span>
                  <input value={createForm.payroll_type} onChange={(e) => setCreateForm({ ...createForm, payroll_type: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">School / Group <span className="text-rose-500">*</span></span>
                  <select
                    value={createForm.schoolSelection}
                    onChange={(e) => setCreateForm({ ...createForm, schoolSelection: e.target.value })}
                    className="input-base mt-1"
                  >
                    <option value="all">All Active Employees ({selCount})</option>
                    {schoolGroups.map((g) => (
                      <optgroup key={g.category} label={`${g.category} · ${g.source} (${g.total})`}>
                        <option value={`group:${g.category}`}>— All {g.category} ({g.total}) —</option>
                        {g.schools.map((s) => (
                          <option key={`${g.category}|${s.name}`} value={`school:${s.name}`}>
                            {s.name || '(No school)'} ({s.count})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {schoolGroups.length === 0 && (
                      <option value="all" disabled>No employees yet — run Auto Employee Sync first</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Covered Period <span className="text-rose-500">*</span></span>
                  <input value={createForm.covered_period} onChange={(e) => setCreateForm({ ...createForm, covered_period: e.target.value })} placeholder="e.g. January 1 – 15, 2026" className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Default Amount (₱)</span>
                  <input type="number" min={0} step="0.01" value={createForm.default_amount} onChange={(e) => setCreateForm({ ...createForm, default_amount: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Default Deduction (₱)</span>
                  <input type="number" min={0} step="0.01" value={createForm.default_deduction} onChange={(e) => setCreateForm({ ...createForm, default_deduction: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">ALOBS No.</span>
                  <input value={createForm.alobs_no} onChange={(e) => setCreateForm({ ...createForm, alobs_no: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">JEV No.</span>
                  <input value={createForm.jev_no} onChange={(e) => setCreateForm({ ...createForm, jev_no: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">EO No.</span>
                  <input value={createForm.eo_no} onChange={(e) => setCreateForm({ ...createForm, eo_no: e.target.value })} placeholder="e.g. 2022-006" className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Date</span>
                  <input type="date" value={createForm.date} onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })} className="input-base mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Payroll Reference No.</span>
                  <input value={createForm.payroll_ref_no} onChange={(e) => setCreateForm({ ...createForm, payroll_ref_no: e.target.value })} className="input-base mt-1" />
                </label>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">Select a group or a specific school — only its employees load into the Payroll Register.</p>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Remarks</span>
                <textarea value={createForm.remarks} onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })} rows={2} className="input-base mt-1" />
              </label>
              {createErr && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-sm">
                  <AlertTriangle className="w-4 h-4" /> {createErr}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => void handleCreate()} disabled={creating} className="btn-primary">
                {creating ? <LoadingIndicator size={40} /> : <Wallet className="w-4 h-4" />}
                {creating ? 'Creating…' : `Generate Payroll (${selCount} employee${selCount === 1 ? '' : 's'})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Employee Sync — dry-run preview modal */}
      {syncPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => !pulling && setSyncPlan(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><RefreshCw className="w-5 h-5" /></span>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Auto Employee Sync — Dry Run</h3>
                  <p className="text-xs text-slate-500">Preview of what will be migrated into CA Payroll · nothing has been saved</p>
                </div>
              </div>
              <button onClick={() => setSyncPlan(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-lg font-bold text-slate-800 dark:text-white tabular-nums">{syncPlan.total}</p>
                  <p className="text-slate-500 mt-0.5">Total records</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-lg font-bold text-emerald-700 tabular-nums">{syncPlan.newCount}</p>
                  <p className="text-emerald-600 mt-0.5">New employees</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-lg font-bold text-amber-700 tabular-nums">{syncPlan.updateCount}</p>
                  <p className="text-amber-600 mt-0.5">Records to update</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-lg font-bold text-slate-500 tabular-nums">{syncPlan.unchangedCount}</p>
                  <p className="text-slate-500 mt-0.5">Unchanged</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Breakdown:</span>
                {CA_BREAKDOWN_DEFS.filter((d) => (syncPlan.byCategory[d.category] ?? 0) > 0).map((d) => (
                  <span key={d.category} className={`px-2 py-0.5 rounded-full font-medium badge ${catTone(d.category)}`}>
                    {d.category} · {d.source} · {syncPlan.byCategory[d.category]}
                  </span>
                ))}
                {syncPlan.unclassified > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">Unclassified · {syncPlan.unclassified}</span>}
                {syncPlan.schools > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">{syncPlan.schools} school(s)</span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Account No.</th>
                      <th className="text-left px-3 py-2.5 font-medium">Name</th>
                      <th className="text-left px-3 py-2.5 font-medium">STACODE</th>
                      <th className="text-left px-3 py-2.5 font-medium">Category</th>
                      <th className="text-left px-3 py-2.5 font-medium">Status</th>
                      <th className="text-left px-3 py-2.5 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {syncPlan.changes.slice(0, 50).map((c) => (
                      <tr key={c.account_no} className={c.isNew ? 'bg-emerald-50/40' : c.changedFields.length > 0 ? 'bg-amber-50/40' : ''}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{c.account_no}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{c.last_name}, {c.first_name} {c.middle_initial}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{c.stacode || '—'}</td>
                        <td className="px-3 py-2">{c.category ? <span className={`badge ${catTone(c.category)}`}>{c.category}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2"><span className={`badge ${c.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{c.status}</span></td>
                        <td className="px-3 py-2">
                          {c.isNew ? (
                            <span className="badge bg-emerald-100 text-emerald-700 border-emerald-200">NEW</span>
                          ) : c.changedFields.length > 0 ? (
                            <span className="text-xs font-medium text-amber-700">{c.changedFields.join(', ')}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {syncPlan.changes.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No syncable records found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {syncPlan.changes.length > 50 && (
                <p className="text-xs text-slate-500">Showing first 50 of {syncPlan.changes.length} records — apply to sync them all.</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={exportSyncReportCsv} className="btn-secondary" title="Export the dry-run changes to CSV">
                  <Download className="w-4 h-4" /> CSV Report
                </button>
                <button onClick={() => void exportSyncReportExcel()} className="btn-secondary" title="Export the dry-run changes to Excel">
                  <FileSpreadsheet className="w-4 h-4" /> Excel Report
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSyncPlan(null)} className="btn-secondary">Close</button>
                <button
                  onClick={() => void applySyncPlan(syncPlan)}
                  disabled={pulling || (syncPlan.newCount + syncPlan.updateCount) === 0}
                  className="btn-primary"
                >
                  {pulling ? <LoadingIndicator size={40} /> : <CheckCircle2 className="w-4 h-4" />}
                  {pulling ? 'Applying…' : `Apply ${syncPlan.newCount + syncPlan.updateCount} Change${syncPlan.newCount + syncPlan.updateCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee add/edit modal */}
      {empModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEmpModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-deped-700 text-white flex items-center justify-center"><UserPlus className="w-5 h-5" /></span>
                <h3 className="font-semibold text-slate-900 dark:text-white">{empModal.id ? 'Edit' : 'Add'} CA Employee</h3>
              </div>
              <button onClick={() => setEmpModal(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Account No. <span className="text-rose-500">*</span></span>
                <input value={empForm.account_no} onChange={(e) => setEmpForm({ ...empForm, account_no: e.target.value })} className="input-base mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Status</span>
                <select value={empForm.status} onChange={(e) => setEmpForm({ ...empForm, status: e.target.value })} className="input-base mt-1">
                  <option>Active</option><option>Inactive</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Last Name <span className="text-rose-500">*</span></span>
                <input value={empForm.last_name} onChange={(e) => setEmpForm({ ...empForm, last_name: e.target.value })} className="input-base mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">First Name <span className="text-rose-500">*</span></span>
                <input value={empForm.first_name} onChange={(e) => setEmpForm({ ...empForm, first_name: e.target.value })} className="input-base mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Middle Initial</span>
                <input value={empForm.middle_initial} onChange={(e) => setEmpForm({ ...empForm, middle_initial: e.target.value })} maxLength={2} className="input-base mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Position Title</span>
                <input value={empForm.position_title} onChange={(e) => setEmpForm({ ...empForm, position_title: e.target.value })} className="input-base mt-1" list="ca-positions" />
                <datalist id="ca-positions">
                  {positionList.map((p) => (
                    <option key={`pos-${p.id}-${p.position_code}`} value={p.position_title || p.position_name || p.position_code} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Category (Payroll Breakdown)</span>
                <select value={empForm.category} onChange={(e) => setEmpForm({ ...empForm, category: e.target.value })} className="input-base mt-1">
                  <option value="">— Unclassified —</option>
                  {CA_BREAKDOWN_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'Elementary' ? 'Elementary (STACODE 001–094)' : c === 'Secondary' ? 'Secondary (STACODE 508–701)' : c === 'Division Office' ? 'Division Office (STACODE 095)' : c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">School Name</span>
                <input value={empForm.school_name} onChange={(e) => setEmpForm({ ...empForm, school_name: e.target.value })} className="input-base mt-1" list="ca-schools" />
                <datalist id="ca-schools">
                  {schoolDir.map((s) => <option key={`dir-${s.school_code}`} value={`${s.school_code} - ${s.school_name}`} />)}
                  {[...new Set(employees.map((e) => e.school_name).filter(Boolean))].map((s) => <option key={`emp-${s}`} value={s} />)}
                </datalist>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button onClick={() => setEmpModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => void saveEmp()} className="btn-primary"><CheckCircle2 className="w-4 h-4" /> Save Employee</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function emptyEmp(): CaEmployee {
  return {
    id: '', account_no: '', last_name: '', first_name: '', middle_initial: '',
    position_title: '', school_name: '', stacode: '', category: '', status: 'Active', created_at: '', updated_at: '',
  };
}

function catTone(cat: string): string {
  if (cat === 'Division Office') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (cat === 'Elementary') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (cat === 'Secondary') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (cat === 'LSB & LSA Teachers') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (cat === 'Utility Workers') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (cat === 'Without ATM') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (cat === 'Separated Employees') return 'bg-red-50 text-red-700 border-red-200';
  if (cat === 'Non-Plantilla') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

function OverviewTab(props: {
  kpis: { gross: number; ded: number; net: number; generated: number; approved: number; paid: number; total: number; activeEmployees: number };
  headers: CaPayrollHeader[];
  listSearch: string; setListSearch: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  pagination: ReturnType<typeof usePagination<CaPayrollHeader>>;
  cap: CaCapability;
  onOpen: (h: CaPayrollHeader) => void;
  onTransition: (h: CaPayrollHeader, to: CaStatus) => Promise<void>;
  onDelete: (h: CaPayrollHeader) => Promise<void>;
}) {
  const cards: { label: string; value: string; icon: ReactNode; tone: string }[] = [
    { label: 'Total Employees', value: String(props.kpis.activeEmployees), icon: <Users className="w-5 h-5" />, tone: 'bg-deped-50 text-deped-700' },
    { label: 'Gross Payroll', value: `₱${currency(props.kpis.gross)}`, icon: <Wallet className="w-5 h-5" />, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Total Deductions', value: `₱${currency(props.kpis.ded)}`, icon: <HandCoins className="w-5 h-5" />, tone: 'bg-rose-50 text-rose-700' },
    { label: 'Net Payroll Amount', value: `₱${currency(props.kpis.net)}`, icon: <BadgeCheck className="w-5 h-5" />, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Generated Payrolls', value: String(props.kpis.generated), icon: <FileSpreadsheet className="w-5 h-5" />, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Approved Payrolls', value: String(props.kpis.approved), icon: <CheckCircle2 className="w-5 h-5" />, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Paid Payrolls', value: String(props.kpis.paid), icon: <HandCoins className="w-5 h-5" />, tone: 'bg-teal-50 text-teal-700' },
  ];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="kpi-card">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.tone}`}>{c.icon}</div>
            <p className="mt-2.5 text-xl font-bold text-slate-800 dark:text-white tabular-nums leading-tight">{c.value}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Payroll register */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-heading">Payroll Register</h2>
            <p className="text-xs text-slate-500 mt-0.5">{props.headers.length} payroll(s) · Workflow: Draft → Generated → Reviewed → Approved → Posted → Paid → Archived</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={props.listSearch} onChange={(e) => props.setListSearch(e.target.value)} placeholder="Search payrolls…" className="input-base pl-9 w-56" />
            </div>
            <select value={props.statusFilter} onChange={(e) => props.setStatusFilter(e.target.value)} className="input-base w-40">
              <option value="all">All Status</option>
              {(['Draft', 'Generated', 'Reviewed', 'Approved', 'Posted', 'Paid', 'Archived'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Payroll No.</th>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">School</th>
                <th className="text-left px-4 py-3 font-medium">Covered Period</th>
                <th className="text-right px-4 py-3 font-medium">Employees</th>
                <th className="text-right px-4 py-3 font-medium">Gross</th>
                <th className="text-right px-4 py-3 font-medium">Deductions</th>
                <th className="text-right px-4 py-3 font-medium">Net</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {props.pagination.pagedItems.map((h) => {
                const nexts = caAllowedNext(h.status, props.cap);
                return (
                  <tr key={h.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-deped-700 dark:text-deped-300">{h.payroll_no}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{h.payroll_title}</td>
                    <td className="px-4 py-3 text-slate-600">{h.school_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{h.covered_period}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{h.total_employees}</td>
                    <td className="px-4 py-3 text-right tabular-nums">₱{currency(h.gross_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">₱{currency(h.total_deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">₱{currency(h.net_amount)}</td>
                    <td className="px-4 py-3"><span className={`badge ${CA_STATUS_COLORS[h.status]}`}>{h.status}</span></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button onClick={() => props.onOpen(h)} title="Open payroll" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-deped-50 text-deped-700 text-xs font-semibold hover:bg-deped-100 transition-colors">
                          Open <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        {nexts.map((to) => (
                          <button key={to} onClick={() => void props.onTransition(h, to)}
                            title={`${h.status} → ${to}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                            {to === 'Draft' ? 'Reopen' : to}
                          </button>
                        ))}
                        {props.cap.canDelete && (
                          <button onClick={() => void props.onDelete(h)} title="Delete" className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {props.pagination.pagedItems.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-slate-400">
                  No payrolls yet. {props.cap.canCreate ? 'Click "New Payroll" to generate one from the employee masterfile.' : ''}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={props.pagination} label="payrolls" />
      </div>
    </div>
  );
}
