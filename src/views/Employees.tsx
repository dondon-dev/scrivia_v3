import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Pagination } from '@/components/Pagination';
import { useServerPagination } from '@/lib/useServerPagination';
import { Plus, Search, Pencil, Trash2, X, Download, Building2, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Upload, FileUp, MoreVertical } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/pb';
import { useOrg, matchesOrgScope } from '@/lib/org';
import { generateMasterfileDbf, downloadFile, currency } from '@/lib/reports';
import { decodeDbf, type DbfRecord } from '@/lib/dbf';
import { loadDivisionDirectory, loadSchoolDivisionMap, resolveEmployeeScope } from '@/lib/restoreSync';
import type { Employee, PayrollGroup } from '@/types/payroll';
import { classifyByStacode } from '@/lib/stacodeClassify';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import { validateUpload } from '@/lib/uploadSecurity';
import DeleteAllConfirm from '@/components/DeleteAllConfirm';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';
import { getEmployeeFilter, isReadOnlyRole, canWritePayrollData } from '@/lib/authz';
import { usePositions } from '@/lib/usePositions';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import type { UserProfile } from '@/types/auth';

interface EmployeeForm {
  // Legacy (synced on save)
  employee_number: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  department: string;
  bank_name: string;
  bank_account: string;
  basic_salary: number;
  hourly_rate: number;
  tax_status: string;
  sss_number: string;
  philhealth_number: string;
  pagibig_number: string;
  hire_date: string | null;
  // Masterfile
  regcode: string; divcode: string; stacode: string;
  empno: string; account: string; empname: string;
  fname: string; mi: string; lname: string; appel: string;
  poscode: string; paymode: string;
  grade: number; step: number;
  basic: number; trans: number; pera: number; aca: number; rata: number;
  ontop: number; long: number; clothing: number; cashallow: number;
  dedlnr: number; dedmed: number; dedtax: number; dedpag: number; netpay: number;
  govtlnr: number; govtecc: number; govtmed: number; govtpag: number;
  pagcode: string; taxcode: string; civilstat: string; attend: string;
  status: string; sex: string; tin: string;
  gsis_pn: string; gsis_id: string; hdmf_id: string; phic_id: string;
  pib: string; banker: string;
  birthdate: string | null; update: string | null; paydate: string | null; hiredate: string | null;
  mid_bonus: number; mid_cash: number; end_bonus: number; end_cash: number;
  add_bonus: number; taxref: number; special: number; over_wheld: number;
  exposcode: string; exgrade: number; exstep: number;
  exbasic: number; exlnr: number; exmed: number; expag: number; extax: number;
  exglnr: number; exgmed: number; exgpag: number; exgecc: number;
  saldiff: number; lnrdiff: number; meddiff: number; pagdiff: number; taxdiff: number;
  glnrdiff: number; gmeddiff: number; gpagdiff: number; geccdiff: number;
  updcode: string; editor: string;
  depname1: string; depname2: string; depname3: string; depname4: string;
  depdate1: string | null; depdate2: string | null;
  depdate3: string | null; depdate4: string | null;
  payroll_group_id: string;
  distcode: string;
}

/** Auto-compute employee deductions and government shares from basic salary */
function computeEmployeeDeductions(basic: number) {
  // GSIS Personal share = basic × 9%
  const dedlnr = Math.round(basic * 0.09 * 100) / 100;
  // PhilHealth Employee share = basic × 2.5%, ceiling at ₱2,500 if basic >= ₱100,000
  const philTotal = basic >= 100000 ? 5000 : Math.round(basic * 0.05 * 100) / 100;
  const dedmed = Math.floor(philTotal / 2 * 100) / 100;
  // Pag-IBIG = fixed ₱200
  const dedpag = 200;
  // GSIS Government share = basic × 12%
  const govtlnr = Math.round(basic * 0.12 * 100) / 100;
  // GSIS ECC = fixed ₱100
  const govtecc = 100;
  // PhilHealth Government share = total - employee share
  const govtmed = Math.round((philTotal - dedmed) * 100) / 100;
  return { dedlnr, dedmed, dedpag, govtlnr, govtecc, govtmed };
}

function emptyForm(): EmployeeForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    employee_number: '', last_name: '', first_name: '', middle_name: '', position: '',
    department: '', bank_name: '', bank_account: '', basic_salary: 0, hourly_rate: 0,
    tax_status: 'ME1', sss_number: '', philhealth_number: '', pagibig_number: '',
    hire_date: today,
    regcode: '', divcode: '', stacode: '', empno: '', account: '', empname: '',
    fname: '', mi: '', lname: '', appel: '', poscode: '', paymode: 'ATM',
    grade: 0, step: 1, basic: 0, trans: 0, pera: 2000, aca: 0, rata: 0,
    ontop: 0, long: 0, clothing: 0, cashallow: 0,
    dedlnr: 0, dedmed: 0, dedtax: 0, dedpag: 0, netpay: 0,
    govtlnr: 0, govtecc: 0, govtmed: 0, govtpag: 0,
    pagcode: '', taxcode: 'ME1', civilstat: '', attend: '',
    status: 'Active', sex: '', tin: '',
    gsis_pn: '', gsis_id: '', hdmf_id: '', phic_id: '', pib: '', banker: '',
    birthdate: null, update: null, paydate: null, hiredate: today,
    mid_bonus: 0, mid_cash: 0, end_bonus: 0, end_cash: 0,
    add_bonus: 0, taxref: 0, special: 0, over_wheld: 0,
    exposcode: '', exgrade: 0, exstep: 0,
    exbasic: 0, exlnr: 0, exmed: 0, expag: 0, extax: 0,
    exglnr: 0, exgmed: 0, exgpag: 0, exgecc: 0,
    saldiff: 0, lnrdiff: 0, meddiff: 0, pagdiff: 0, taxdiff: 0,
    glnrdiff: 0, gmeddiff: 0, gpagdiff: 0, geccdiff: 0,
    updcode: '', editor: '',
    depname1: '', depname2: '', depname3: '', depname4: '',
    depdate1: null, depdate2: null, depdate3: null, depdate4: null,
    payroll_group_id: '', distcode: '',
  };
}

function formFromEmployee(e: Employee): EmployeeForm {
  return {
    ...emptyForm(),
    employee_number: e.employee_number, last_name: e.last_name, first_name: e.first_name,
    middle_name: e.middle_name, position: e.position, department: e.department,
    bank_name: e.bank_name, bank_account: e.bank_account, basic_salary: e.basic_salary,
    hourly_rate: e.hourly_rate, tax_status: e.tax_status, sss_number: e.sss_number,
    philhealth_number: e.philhealth_number, pagibig_number: e.pagibig_number,
    hire_date: e.hire_date,
    regcode: e.regcode ?? '', divcode: e.divcode ?? '', stacode: e.stacode ?? '',
    empno: e.empno ?? '', account: e.account ?? '', empname: e.empname ?? '',
    fname: e.fname ?? '', mi: e.mi ?? '', lname: e.lname ?? '', appel: e.appel ?? '',
    poscode: e.poscode ?? '', paymode: e.paymode ?? 'ATM',
    grade: e.grade ?? 0, step: e.step ?? 0, basic: e.basic ?? 0,
    trans: e.trans ?? 0, pera: e.pera ?? 0, aca: e.aca ?? 0, rata: e.rata ?? 0,
    ontop: e.ontop ?? 0, long: e.long ?? 0, clothing: e.clothing ?? 0, cashallow: e.cashallow ?? 0,
    dedlnr: e.dedlnr ?? 0, dedmed: e.dedmed ?? 0, dedtax: e.dedtax ?? 0, dedpag: e.dedpag ?? 0,
    netpay: e.netpay ?? 0, govtlnr: e.govtlnr ?? 0, govtecc: e.govtecc ?? 0,
    govtmed: e.govtmed ?? 0, govtpag: e.govtpag ?? 0,
    pagcode: e.pagcode ?? '', taxcode: e.taxcode ?? 'ME1', civilstat: e.civilstat ?? '',
    attend: e.attend ?? '', status: e.status, sex: e.sex ?? '', tin: e.tin ?? '',
    gsis_pn: e.gsis_pn ?? '', gsis_id: e.gsis_id ?? '', hdmf_id: e.hdmf_id ?? '',
    phic_id: e.phic_id ?? '', pib: e.pib ?? '', banker: e.banker ?? '',
    birthdate: e.birthdate, update: e.update, paydate: e.paydate, hiredate: e.hiredate,
    mid_bonus: e.mid_bonus ?? 0, mid_cash: e.mid_cash ?? 0, end_bonus: e.end_bonus ?? 0,
    end_cash: e.end_cash ?? 0, add_bonus: e.add_bonus ?? 0, taxref: e.taxref ?? 0,
    special: e.special ?? 0, over_wheld: e.over_wheld ?? 0,
    exposcode: e.exposcode ?? '', exgrade: e.exgrade ?? 0, exstep: e.exstep ?? 0,
    exbasic: e.exbasic ?? 0, exlnr: e.exlnr ?? 0, exmed: e.exmed ?? 0,
    expag: e.expag ?? 0, extax: e.extax ?? 0, exglnr: e.exglnr ?? 0,
    exgmed: e.exgmed ?? 0, exgpag: e.exgpag ?? 0, exgecc: e.exgecc ?? 0,
    saldiff: e.saldiff ?? 0, lnrdiff: e.lnrdiff ?? 0, meddiff: e.meddiff ?? 0,
    pagdiff: e.pagdiff ?? 0, taxdiff: e.taxdiff ?? 0, glnrdiff: e.glnrdiff ?? 0,
    gmeddiff: e.gmeddiff ?? 0, gpagdiff: e.gpagdiff ?? 0, geccdiff: e.geccdiff ?? 0,
    updcode: e.updcode ?? '', editor: e.editor ?? '',
    depname1: e.depname1 ?? '', depname2: e.depname2 ?? '',
    depname3: e.depname3 ?? '', depname4: e.depname4 ?? '',
    depdate1: e.depdate1, depdate2: e.depdate2,
    depdate3: e.depdate3, depdate4: e.depdate4,
    payroll_group_id: e.payroll_group_id ?? '', distcode: e.distcode ?? '',
  };
}

// Sync masterfile fields → legacy fields on save
function syncLegacy(f: EmployeeForm): EmployeeForm {
  return {
    ...f,
    employee_number: f.empno || f.employee_number,
    first_name: f.fname || f.first_name,
    last_name: f.lname || f.last_name,
    middle_name: f.mi || f.middle_name,
    position: f.poscode || f.position,
    bank_name: f.banker || f.bank_name,
    bank_account: f.account || f.bank_account,
    basic_salary: f.basic || f.basic_salary,
    tax_status: f.taxcode || f.tax_status,
    philhealth_number: f.phic_id || f.philhealth_number,
    pagibig_number: f.hdmf_id || f.pagibig_number,
    hire_date: f.hiredate || f.hire_date,
    empno: f.empno || f.employee_number,
    fname: f.fname || f.first_name,
    lname: f.lname || f.last_name,
    mi: f.mi || f.middle_name,
    poscode: f.poscode || f.position,
    banker: f.banker || f.bank_name,
    account: f.account || f.bank_account,
    basic: f.basic || f.basic_salary,
    taxcode: f.taxcode || f.tax_status,
    phic_id: f.phic_id || f.philhealth_number,
    hdmf_id: f.hdmf_id || f.pagibig_number,
    hiredate: f.hiredate || f.hire_date,
  };
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';

type FieldDef = { key: keyof EmployeeForm; label: string; type?: 'text' | 'number' | 'date' | 'select'; options?: string[]; step?: string };

function CollapsibleSection({ title, fields, form, setForm, defaultOpen }: {
  title: string;
  fields: FieldDef[];
  form: EmployeeForm;
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-[11px] text-slate-500 mb-0.5">{f.label}</span>
              {f.type === 'select' ? (
                <select
                  value={String(form[f.key] ?? '')}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={inputCls}
                >
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  step={f.step}
                  value={form[f.key] === null ? '' : String(form[f.key] ?? '')}
                  onChange={(e) => setForm({
                    ...form,
                    [f.key]: f.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value || null,
                  })}
                  className={inputCls}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Employees({ highlightEmpId, onConsumedHighlight, profile }: { highlightEmpId?: string | null; onConsumedHighlight?: () => void; profile?: UserProfile | null }) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{ records: DbfRecord[]; fields: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; imported: number; skipped: number } | null>(null);
  const [payrollGroups, setPayrollGroups] = useState<{ id: string; group_code: string; group_name: string; stacode_min: number | null; stacode_max: number | null; status: string }[]>([]);
  const [autoUpdateStacode, setAutoUpdateStacode] = useState(true);
  const [importSummary, setImportSummary] = useState<{
    totalImported: number;
    newEmployees: number;
    employeesUpdated: number;
    stacodeChanges: number;
    invalidStacode: number;
    stacodeChangesList: { empno: string; employeeName: string; oldStacode: string; newStacode: string }[];
    invalidRecordsList: { empno: string; employeeName: string; stacode: string; error: string }[];
  } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showInvalidRecords, setShowInvalidRecords] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [positionSearch, setPositionSearch] = useState('');
  const [showPositionPicker, setShowPositionPicker] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const { positions: positionList, lookup: lookupPosition } = usePositions();
  const { salaryMap } = useSalarySchedule();

  // Server-side pagination: fetch only 10 rows per page instead of all 2,710
  const scopeFilter = profile ? getEmployeeFilter(profile) : null;
  const groupsForFilter = useMemo(() => payrollGroups as PayrollGroup[], [payrollGroups]);
  const gf = useMemo(() => resolveGroupFilter(groupFilter, groupsForFilter), [groupFilter, groupsForFilter]);
  const { scopedDivisionIds, scopedCodes, divisions: orgDivisions, regions: orgRegions } = useOrg();
  // REGCODE + DIVCODE codes are the unique reference for one division's payroll
  // (the masterfile rows carry these columns), so scope the query by them.
  const scopeRegcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null;
  const scopeDivcodes = scopedCodes && scopedCodes.length > 0 ? [...new Set(scopedCodes.map((c) => c.divcode))] : null;
  const serverPag = useServerPagination<Employee>('query_employees', {
    p_search: search || null,
    p_stacode_min: gf.stacodeMin,
    p_stacode_max: gf.stacodeMax,
    p_scope_column: scopeFilter?.column ?? null,
    p_scope_value: scopeFilter?.value ?? null,
    // Division scoping — the RPC clamps non-super_admins to their own division
    // server-side regardless of this value.
    p_division_ids: scopedDivisionIds,
    p_regcode: scopeRegcode,
    p_divcodes: scopeDivcodes,
  }, { pageSize: 10 });
  const employees = serverPag.rows;
  const loading = serverPag.loading;

  // Load payroll groups + salary schedule (small tables, fine to load once)
  const refreshFn = useRef<() => void>(() => {});
  refreshFn.current = serverPag.refresh;

  const load = useCallback(async () => {
    const { data: grp } = await supabase.from('payroll_groups').select('id,group_code,group_name,stacode_min,stacode_max,status').order('group_code');
    setPayrollGroups((grp as unknown as { id: string; group_code: string; group_name: string; stacode_min: number | null; stacode_max: number | null; status: string }[]) ?? []);
  }, []);

  useEffect(() => { load(); refreshFn.current(); }, [load]);

  // When navigated from STACODE Validation with a specific employee, fetch that one record
  useEffect(() => {
    if (highlightEmpId && !loading) {
      (async () => {
        const { data: target } = await supabase.from('employees').select('*').eq('id', highlightEmpId).single();
        if (target) {
          setForm(formFromEmployee(target as Employee));
          setEditing(target as Employee);
          setError('');
          setShowModal(true);
        }
        onConsumedHighlight?.();
      })();
    }
  }, [highlightEmpId, loading, onConsumedHighlight, profile]);

  // Schools list for STACODE search
  const [schools, setSchools] = useState<{ school_code: string; school_name: string }[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);

  useEffect(() => {
    fetchAll(() => supabase.from('schools').select('school_code, school_name').eq('status', 'Active').order('school_code'))
      .then((rows) => setSchools(rows as { school_code: string; school_name: string }[]));
  }, []);

  // Filtered schools for search
  const filteredSchools = useMemo(() => {
    if (!schoolSearch) return schools.slice(0, 20);
    const q = schoolSearch.toLowerCase();
    return schools.filter(s =>
      s.school_code.toLowerCase().includes(q) || s.school_name.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [schools, schoolSearch]);

  // Wrap setForm to auto-populate BASIC when grade/step changes + auto-compute deductions
  const setFormWithSalary = useCallback((updater: EmployeeForm | ((prev: EmployeeForm) => EmployeeForm)) => {
    setForm((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const grade = next.grade || 0;
      const step = next.step || 0;
      if (grade > 0 && step > 0) {
        const salary = salaryMap.get(`${grade}-${step}`);
        if (salary != null) {
          next.basic = salary;
          next.basic_salary = salary;
        }
      }
      // Auto-compute deductions and government shares from basic salary
      if (next.basic > 0) {
        const deds = computeEmployeeDeductions(next.basic);
        next.dedlnr = deds.dedlnr;
        next.dedmed = deds.dedmed;
        next.dedpag = deds.dedpag;
        next.govtlnr = deds.govtlnr;
        next.govtecc = deds.govtecc;
        next.govtmed = deds.govtmed;
        // Auto-compute NETPAY: gross - employee deductions
        const gross = next.basic + next.trans + next.pera + next.aca + next.rata + next.ontop + next.long + next.clothing + next.cashallow;
        const totalEmpDeds = next.dedlnr + next.dedmed + next.dedtax + next.dedpag;
        next.netpay = Math.round((gross - totalEmpDeds) * 100) / 100;
      }
      return next;
    });
  }, [salaryMap]);

  const lookedUpSalary = form.grade > 0 && form.step > 0 ? salaryMap.get(`${form.grade}-${form.step}`) : undefined;

  function openAdd() {
    setEditing(null);
    const f = emptyForm();
    f.empno = `EMP${String(serverPag.total + 1).padStart(4, '0')}`;
    // Auto-populate REGCODE and DIVCODE from org scope
    if (scopeRegcode) f.regcode = scopeRegcode;
    if (scopeDivcodes && scopeDivcodes.length > 0) f.divcode = scopeDivcodes[0];
    setForm(f);
    setError('');
    setShowModal(true);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    setForm(formFromEmployee(e));
    setError('');
    setShowModal(true);
  }

  async function save() {
    setError('');
    const synced = syncLegacy(form);
    if (!synced.empno && !synced.employee_number) {
      setError('Employee Number (EMPNO) is required.');
      return;
    }
    if (!synced.lname && !synced.last_name) {
      setError('Last Name (LNAME) is required.');
      return;
    }
    if (!synced.fname && !synced.first_name) {
      setError('First Name (FNAME) is required.');
      return;
    }
    if (!synced.stacode) {
      setError('STACODE is required.');
      return;
    }
    if ((synced.paymode || 'ATM') === 'ATM' && !synced.account) {
      setError('ACCOUNT is required for ATM payroll mode.');
      return;
    }
    if (synced.tin && synced.tin.length !== 12) {
      setError('TIN must be exactly 12 characters.');
      return;
    }
    if (synced.gsis_pn && synced.gsis_pn.length !== 13) {
      setError('GSIS_PN must be exactly 13 characters.');
      return;
    }
    setSaving(true);
    const num = (v: number) => Number(v) || 0;
    const payload = {
      ...synced,
      basic_salary: num(synced.basic_salary), hourly_rate: num(synced.hourly_rate),
      basic: num(synced.basic), trans: num(synced.trans), pera: num(synced.pera),
      aca: num(synced.aca), rata: num(synced.rata), ontop: num(synced.ontop),
      long: num(synced.long), clothing: num(synced.clothing), cashallow: num(synced.cashallow),
      dedlnr: num(synced.dedlnr), dedmed: num(synced.dedmed), dedtax: num(synced.dedtax),
      dedpag: num(synced.dedpag), netpay: num(synced.netpay),
      govtlnr: num(synced.govtlnr), govtecc: num(synced.govtecc), govtmed: num(synced.govtmed),
      govtpag: num(synced.govtpag),
      grade: parseInt(String(synced.grade)) || 0, step: parseInt(String(synced.step)) || 0,
      mid_bonus: num(synced.mid_bonus), mid_cash: num(synced.mid_cash),
      end_bonus: num(synced.end_bonus), end_cash: num(synced.end_cash),
      add_bonus: num(synced.add_bonus), taxref: num(synced.taxref),
      special: num(synced.special), over_wheld: num(synced.over_wheld),
      exgrade: parseInt(String(synced.exgrade)) || 0, exstep: parseInt(String(synced.exstep)) || 0,
      exbasic: num(synced.exbasic), exlnr: num(synced.exlnr), exmed: num(synced.exmed),
      expag: num(synced.expag), extax: num(synced.extax),
      exglnr: num(synced.exglnr), exgmed: num(synced.exgmed), exgpag: num(synced.exgpag), exgecc: num(synced.exgecc),
      saldiff: num(synced.saldiff), lnrdiff: num(synced.lnrdiff), meddiff: num(synced.meddiff),
      pagdiff: num(synced.pagdiff), taxdiff: num(synced.taxdiff),
      glnrdiff: num(synced.glnrdiff), gmeddiff: num(synced.gmeddiff), gpagdiff: num(synced.gpagdiff), geccdiff: num(synced.geccdiff),
      depname1: form.depname1 || '', depname2: form.depname2 || '',
      depname3: form.depname3 || '', depname4: form.depname4 || '',
      depdate1: form.depdate1 || null, depdate2: form.depdate2 || null,
      depdate3: form.depdate3 || null, depdate4: form.depdate4 || null,
      payroll_group_id: classifyByStacode(form.stacode, payrollGroups as PayrollGroup[])?.id ?? (form.payroll_group_id || null),
      distcode: form.distcode || '',
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error: err } = await supabase.from('employees').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      // New employee: stamp the uploader's division context (canonical
      // REGCODE/DIVCODE + division_id) so the record is visible in their
      // Employee Records scope even when the form leaves the codes blank.
      const syncScope = scopedCodes && scopedCodes.length === 1 ? scopedCodes[0] : null;
      if (syncScope && !payload.regcode && !payload.divcode) {
        const divisionDirectory = await loadDivisionDirectory();
        const resolved = resolveEmployeeScope(divisionDirectory, new Map(), '', '', payload.stacode ?? '', syncScope);
        payload.regcode = resolved.regcode;
        payload.divcode = resolved.divcode;
        (payload as Record<string, unknown>).division_id = resolved.divisionId;
      }
      const { error: err } = await supabase.from('employees').insert(payload);
      if (err) {
        setError(err.code === '23505' ? 'Employee number already exists.' : err.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setShowModal(false);
    load(); refreshFn.current();
  }

  async function remove(e: Employee) {
    const name = e.lname || e.last_name;
    const fname = e.fname || e.first_name;
    if (!confirm(`Delete ${name}, ${fname}? This also removes their payroll history.`)) return;
    const { data: posted } = await supabase
      .from('payroll_entries')
      .select('id')
      .eq('employee_id', e.id)
      .eq('status', 'Posted')
      .limit(1);
    if (posted && posted.length > 0) {
      alert(`Cannot delete ${name}, ${fname} — they have posted payroll entries. Reverse the posted pay period in the Payroll page first, then try again.`);
      return;
    }
    const { error } = await supabase.from('employees').delete().eq('id', e.id);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    load(); refreshFn.current();
  }

  async function deleteAllEmployees() {
    try {
      // Only ever delete the employees inside the current Region/Division scope.
      // One division's masterfile must never be wiped by another division's
      // action — nor blocked by another division's posted payroll.
      const scope = { scopedDivisionIds, scopedCodes };
      const all = await fetchAll(() =>
        supabase.from('employees').select('id,division_id,regcode,divcode'),
      );
      const scopedIds = all
        .filter((e) => matchesOrgScope(e, scope))
        .map((e) => e.id);
      if (scopedIds.length === 0) {
        throw new Error('No employees found in the current division scope to delete.');
      }

      // Batches keep every request URL small — a single .in() with thousands
      // of ids exceeds URL length limits and the connection dies with a raw
      // "TypeError: Failed to fetch".
      const BATCH = 100;

      // Division-scoped posted check: only THIS scope's posted payroll entries
      // block the delete — other divisions' postings do not. Restored/uploaded
      // payroll files also arrive with status 'Posted' (not just the Post
      // button), so the error names the exact pay periods AND the division
      // each posted entry belongs to — otherwise it looks like "no posted
      // payroll" when the posted entries live in another division.
      const divisionNameById = new Map(orgDivisions.map((d) => [d.id, d.division_name]));
      const divisionNameByCode = new Map(orgDivisions.map((d) => [d.division_code, d.division_name]));
      const regionNameByCode = new Map(orgRegions.map((r) => [r.region_code, r.region_name]));
      const divisionLabel = (e: { division_id: string | null; regcode: string | null; divcode: string | null }) => {
        if (e.division_id && divisionNameById.has(e.division_id)) return divisionNameById.get(e.division_id)!;
        if (e.divcode && divisionNameByCode.has(e.divcode)) {
          const name = divisionNameByCode.get(e.divcode)!;
          if (!e.regcode) return name;
          const regionName = regionNameByCode.get(e.regcode);
          return regionName ? `${name} (${regionName})` : `${name} (REGCODE ${e.regcode})`;
        }
        if (e.regcode && e.divcode) return `${e.divcode} (REGCODE ${e.regcode})`;
        return 'Unknown Division';
      };

      const postedDetails: { period: string; division: string }[] = [];
      for (let i = 0; i < scopedIds.length && postedDetails.length === 0; i += BATCH) {
        const chunk = scopedIds.slice(i, i + BATCH);
        const { data: posted } = await supabase
          .from('payroll_entries')
          .select('pay_periods(period_name), employees(division_id, regcode, divcode)')
          .in('employee_id', chunk)
          .eq('status', 'Posted')
          .limit(20);
        if (posted && posted.length > 0) {
          for (const row of posted) {
            const typed = row as {
              pay_periods?: { period_name?: string } | null;
              employees?: { division_id?: string | null; regcode?: string | null; divcode?: string | null } | null;
            };
            postedDetails.push({
              period: typed.pay_periods?.period_name ?? 'this period',
              division: typed.employees
                ? divisionLabel(typed.employees as { division_id: string | null; regcode: string | null; divcode: string | null })
                : 'Unknown Division',
            });
          }
        }
      }
      if (postedDetails.length > 0) {
        const unique = new Map<string, { period: string; division: string }>();
        for (const d of postedDetails) unique.set(`${d.period}|${d.division}`, d);
        const rows = [...unique.values()].slice(0, 5);
        const summary = rows.map((r) => `${r.period} — ${r.division}`).join('; ');
        throw new Error(
          'Cannot delete all employees — posted payroll entries exist in: ' +
          summary +
          (unique.size > 5 ? ` and ${unique.size - 5} more.` : '.') +
          ' Reverse the posted pay period(s) in the Payroll page first, then try again.'
        );
      }

      // Delete in the same batches (employee deletion cascades to their
      // payroll entries, deductions, etc.).
      for (let i = 0; i < scopedIds.length; i += BATCH) {
        const chunk = scopedIds.slice(i, i + BATCH);
        const { error } = await supabase.from('employees').delete().in('id', chunk);
        if (error) throw new Error(error.message);
      }
      await load(); refreshFn.current();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to fetch|networkerror|network error|load failed|typeerror/i.test(msg)) {
        throw new Error('Network error while deleting — check your connection and try again.');
      }
      throw err instanceof Error ? err : new Error(msg);
    }
  }

  async function exportDbf() {
    const allEmps = await fetchAll(() => supabase.from('employees').select('*').order('lname', { ascending: true }));
    // Honor the selected Region/Division scope — by division_id first, then by
    // the REGCODE/DIVCODE codes carried by legacy masterfile rows.
    const scopedEmps = allEmps.filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes }));
    const content = generateMasterfileDbf(scopedEmps);
    downloadFile({ filename: `MASTERFILE_${new Date().toISOString().slice(0, 10)}.DBF`, content, mimeType: 'application/dbf' });
  }

  async function handleDbfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadResult(null);

    const validation = await validateUpload(file);
    if (!validation.valid) {
      setUploadResult({ success: false, message: validation.error ?? 'Invalid file.', imported: 0, skipped: 0 });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const { fields, records } = decodeDbf(data);
        if (records.length === 0) {
          setUploadResult({ success: false, message: 'No records found in the DBF file.', imported: 0, skipped: 0 });
          return;
        }
        const fieldNames = fields.map((f) => f.name);
        setUploadPreview({ records, fields: fieldNames });
      } catch (err) {
        setUploadResult({ success: false, message: `Failed to read DBF file: ${(err as Error).message}`, imported: 0, skipped: 0 });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function dbfRecordToEmployee(rec: DbfRecord): Record<string, unknown> {
    const str = (key: string): string => {
      const v = rec[key];
      return v != null ? String(v).trim() : '';
    };
    const num = (key: string): number => {
      const v = rec[key];
      if (v == null) return 0;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    };
    const dateStr = (key: string): string | null => {
      const v = rec[key];
      if (!v || typeof v !== 'string') return null;
      return v.length >= 10 ? v.slice(0, 10) : null;
    };
    const statusChar = str('STATUS').toUpperCase();
    const statusMap: Record<string, string> = { A: 'Active', I: 'Inactive', R: 'Resigned', T: 'Terminated' };
    const empno = str('EMPNO');
    const fname = str('FNAME');
    const lname = str('LNAME');
    return {
      empno,
      fname,
      mi: str('MI'),
      lname,
      appel: str('APPEL'),
      empname: str('EMPNAME'),
      regcode: str('REGCODE'),
      divcode: str('DIVCODE'),
      stacode: str('STACODE'),
      account: str('ACCOUNT'),
      poscode: str('POSCODE'),
      paymode: str('PAYMODE') || 'ATM',
      grade: parseInt(str('GRADE')) || 0,
      step: parseInt(str('STEP')) || 0,
      basic: num('BASIC'),
      trans: num('TRANS'),
      pera: num('PERA'),
      aca: num('ACA'),
      rata: num('RATA'),
      ontop: num('ONTOP'),
      long: num('LONG'),
      clothing: num('CLOTHING'),
      cashallow: num('CASHALLOW'),
      dedlnr: num('DEDLNR'),
      dedmed: num('DEDMED'),
      dedtax: num('DEDTAX'),
      dedpag: num('DEDPAG'),
      netpay: num('NETPAY'),
      govtlnr: num('GOVTLNR'),
      govtecc: num('GOVTECC'),
      govtmed: num('GOVTMED'),
      govtpag: num('GOVTPAG'),
      pagcode: str('PAGCODE'),
      taxcode: str('TAXCODE') || 'ME1',
      civilstat: str('CIVILSTAT'),
      attend: str('ATTEND'),
      status: statusMap[statusChar] || 'Active',
      sex: str('SEX'),
      tin: str('TIN'),
      gsis_pn: str('GSIS_PN'),
      gsis_id: str('GSIS_ID'),
      hdmf_id: str('HDMF_ID'),
      phic_id: str('PHIC_ID'),
      banker: str('BANKER'),
      pib: str('PIB'),
      birthdate: dateStr('BIRTHDATE'),
      update: dateStr('UPDATE'),
      paydate: dateStr('PAYDATE'),
      hiredate: dateStr('HIREDATE'),
      mid_bonus: num('MID_BONUS'),
      mid_cash: num('MID_CASH'),
      end_bonus: num('END_BONUS'),
      end_cash: num('END_CASH'),
      add_bonus: num('ADD_BONUS'),
      taxref: num('TAXREF'),
      special: num('SPECIAL'),
      over_wheld: num('OVER_WHELD'),
      exposcode: str('EXPOSCODE'),
      exgrade: parseInt(str('EXGRADE')) || 0,
      exstep: parseInt(str('EXSTEP')) || 0,
      exbasic: num('EXBASIC'),
      exlnr: num('EXLNR'),
      exmed: num('EXMED'),
      expag: num('EXPAG'),
      extax: num('EXTAX'),
      exglnr: num('EXGLNR'),
      exgmed: num('EXGMED'),
      exgpag: num('EXGPAG'),
      exgecc: num('EXGECC'),
      saldiff: num('SALDIFF'),
      lnrdiff: num('LNRDIFF'),
      meddiff: num('MEDDIFF'),
      pagdiff: num('PAGDIFF'),
      taxdiff: num('TAXDIFF'),
      glnrdiff: num('GLNRDIFF'),
      gmeddiff: num('GMEDDIFF'),
      gpagdiff: num('GPAGDIFF'),
      geccdiff: num('GECCDIFF'),
      updcode: str('UPDCODE'),
      editor: str('EDITOR'),
      depname1: str('DEPNAME1'), depname2: str('DEPNAME2'),
      depname3: str('DEPNAME3'), depname4: str('DEPNAME4'),
      depdate1: dateStr('DEPDATE1'), depdate2: dateStr('DEPDATE2'),
      depdate3: dateStr('DEPDATE3'), depdate4: dateStr('DEPDATE4'),
      // Sync legacy fields
      employee_number: empno,
      first_name: fname,
      last_name: lname,
      middle_name: str('MI'),
      position: str('POSCODE'),
      bank_name: str('BANKER'),
      bank_account: str('ACCOUNT'),
      basic_salary: num('BASIC'),
      tax_status: str('TAXCODE') || 'ME1',
      philhealth_number: str('PHIC_ID'),
      pagibig_number: str('HDMF_ID'),
      hire_date: dateStr('HIREDATE'),
      payroll_group_id: classifyByStacode(str('STACODE'), payrollGroups as PayrollGroup[])?.id ?? null,
      distcode: str('DISTCODE') || '',
      updated_at: new Date().toISOString(),
    };
  }

  async function importDbf() {
    if (!uploadPreview || uploadPreview.records.length === 0) return;
    setUploading(true);
    setUploadResult(null);

    const stacodeSyncEnabled = autoUpdateStacode;
    const groupList = payrollGroups as PayrollGroup[];

    // Stamp every imported row with its resolved division context (canonical
    // REGCODE + DIVCODE + division_id) so the records show up in the uploader's
    // Employee Records scope — the same resolution Smart Import uses. Rows
    // without usable codes fall back to the selected division, then to the
    // STACODE's school.
    const syncScope = scopedCodes && scopedCodes.length === 1 ? scopedCodes[0] : null;
    const divisionDirectory = await loadDivisionDirectory();
    const schoolDivision = await loadSchoolDivisionMap();

    // Build payload + metadata from DBF records
    const payloads: Record<string, unknown>[] = [];
    const stacodeChanges: { empno: string; employeeName: string; oldStacode: string; newStacode: string }[] = [];
    const invalidStacodeRecords: { empno: string; employeeName: string; stacode: string; error: string }[] = [];
    let skipped = 0;

    for (const rec of uploadPreview.records) {
      const empno = String(rec['EMPNO'] ?? '').trim();
      const lname = String(rec['LNAME'] ?? '').trim();
      if (!empno || !lname) { skipped++; continue; }

      const newStacode = String(rec['STACODE'] ?? '').trim();
      const employeeName = `${lname}, ${String(rec['FNAME'] ?? '').trim()}`;
      const payload = dbfRecordToEmployee(rec);

      // Stamp division context: canonical codes + division_id so scoped users
      // (per REGCODE/DIVCODE) can see the imported record in Employee Records.
      const resolved = resolveEmployeeScope(
        divisionDirectory,
        schoolDivision,
        String(rec['REGCODE'] ?? '').trim(),
        String(rec['DIVCODE'] ?? '').trim(),
        newStacode,
        syncScope,
      );
      payload['regcode'] = resolved.regcode;
      payload['divcode'] = resolved.divcode;
      payload['division_id'] = resolved.divisionId;

      // Classify by new STACODE
      const newGroup = stacodeSyncEnabled ? classifyByStacode(newStacode, groupList) : null;
      if (stacodeSyncEnabled) {
        payload['payroll_group_id'] = newGroup?.id ?? null;
      }

      // Track invalid STACODE
      if (!newStacode || !/^\d+$/.test(newStacode) || !newGroup) {
        invalidStacodeRecords.push({
          empno,
          employeeName,
          stacode: newStacode || '(empty)',
          error: !newStacode ? 'STACODE is empty' : !/^\d+$/.test(newStacode) ? 'STACODE is non-numeric' : 'STACODE outside configured ranges',
        });
      }

      payloads.push({ payload, empno, employeeName, newStacode });
    }

    if (payloads.length === 0) {
      setUploadResult({ success: false, message: 'No valid records found. Each row needs at least EMPNO and LNAME.', imported: 0, skipped });
      setUploading(false);
      return;
    }

    // Fetch existing employees to determine insert vs update + detect STACODE changes
    const { data: existing } = await supabase.from('employees').select('id,empno,employee_number,stacode,lname,fname');
    const existingMap = new Map<string, { id: string; stacode: string; empno: string; lname: string; fname: string }>();
    (existing ?? []).forEach((e: { id: string; empno: string | null; employee_number: string; stacode: string | null; lname: string | null; fname: string | null }) => {
      const key = (e.empno || e.employee_number || '').trim();
      if (key) existingMap.set(key, { id: e.id, stacode: (e.stacode ?? '').trim(), empno: key, lname: e.lname ?? '', fname: e.fname ?? '' });
    });

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; data: Record<string, unknown>; empno: string; employeeName: string; oldStacode: string; newStacode: string }[] = [];
    let newEmployeesAdded = 0;
    let employeesUpdated = 0;

    for (const item of payloads) {
      const { payload, empno, employeeName, newStacode } = item as { payload: Record<string, unknown>; empno: string; employeeName: string; newStacode: string };
      const existingRec = existingMap.get(empno);
      if (existingRec) {
        const oldStacode = existingRec.stacode;
        // Detect STACODE change
        if (stacodeSyncEnabled && oldStacode !== newStacode) {
          stacodeChanges.push({ empno, employeeName, oldStacode: oldStacode || '(empty)', newStacode: newStacode || '(empty)' });
        }
        toUpdate.push({ id: existingRec.id, data: payload, empno, employeeName, oldStacode, newStacode });
      } else {
        toInsert.push(payload);
        newEmployeesAdded++;
      }
    }

    let imported = 0;
    // Batch insert new employees
    if (toInsert.length > 0) {
      const { error } = await supabase.from('employees').insert(toInsert);
      if (error) {
        setUploadResult({ success: false, message: `Insert failed: ${error.message}`, imported, skipped });
        setUploading(false);
        return;
      }
      imported += toInsert.length;
    }

    // Batch update existing employees + log STACODE changes to audit trail
    const auditEntries: Record<string, unknown>[] = [];
    for (const u of toUpdate) {
      const { error } = await supabase.from('employees').update(u.data).eq('id', u.id);
      if (error) {
        skipped++;
      } else {
        imported++;
        employeesUpdated++;
        // Log STACODE change to audit trail
        if (stacodeSyncEnabled && u.oldStacode !== u.newStacode) {
          const oldGroup = classifyByStacode(u.oldStacode, groupList);
          const newGroup = classifyByStacode(u.newStacode, groupList);
          auditEntries.push({
            employee_id: u.id,
            employee_no: u.empno,
            old_stacode: u.oldStacode,
            new_stacode: u.newStacode,
            old_group_code: oldGroup?.group_code ?? 'Unassigned',
            new_group_code: newGroup?.group_code ?? 'Unassigned',
            changed_by: 'dbf_import',
            reason: `STACODE updated from MASTERFILE.DBF import`,
          });
        }
      }
    }

    // Batch insert audit entries
    if (auditEntries.length > 0) {
      await supabase.from('stacode_audit').insert(auditEntries);
    }

    setImportSummary({
      totalImported: imported,
      newEmployees: newEmployeesAdded,
      employeesUpdated,
      stacodeChanges: stacodeChanges.length,
      invalidStacode: invalidStacodeRecords.length,
      stacodeChangesList: stacodeChanges,
      invalidRecordsList: invalidStacodeRecords,
    });
    setUploadResult({
      success: true,
      message: `Import complete. ${imported} employee record${imported !== 1 ? 's' : ''} processed from DBF file.`,
      imported,
      skipped,
    });
    setUploading(false);
    load(); refreshFn.current();
    setUploadPreview(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Employee ID, First, Middle, or Last name…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </div>
          <GroupFilter value={groupFilter} onChange={setGroupFilter} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowUpload(true); setUploadPreview(null); setUploadResult(null); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Import DBF
          </button>
          <button
            onClick={exportDbf}
            disabled={serverPag.total === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" /> Export DBF
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-slate-200 z-20 py-1">
                  <button
                    onClick={() => { setMenuOpen(false); setShowDeleteAll(true); }}
                    disabled={serverPag.total === 0}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete All Employees
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading employees…</div>
        ) : employees.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            {serverPag.total === 0 ? 'No employees yet. Click "Add Employee" to create your masterfile.' : 'No employees match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">EMPNO</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Position</th>
                  <th className="text-left px-4 py-3 font-medium">Grade/Step</th>
                  <th className="text-right px-4 py-3 font-medium">BASIC</th>
                  <th className="text-right px-4 py-3 font-medium">NETPAY</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => {
                  const lname = e.lname || e.last_name;
                  const fname = e.fname || e.first_name;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.empno || e.employee_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{lname}, {fname} {e.mi || ''}</p>
                      </td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-slate-600">{e.poscode || e.position || '—'}</span>{(() => { const pos = lookupPosition(e.poscode || e.position); return pos ? <span className="block text-xs text-slate-400 mt-0.5">{pos.position_title || pos.position_name}</span> : null; })()}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{e.grade}/{e.step}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{currency(e.basic || e.basic_salary)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">{currency(e.netpay)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>{e.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(e)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={serverPag.page} totalPages={serverPag.totalPages} total={serverPag.total} onPageChange={serverPag.setPage} label="employees" />
      </div>

      <DeleteAllConfirm
        open={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={deleteAllEmployees}
        title="Delete All Employees"
        count={serverPag.total}
        label="employee records"
        description="This will remove every employee in the current division scope from the masterfile, including all their payroll entries, deductions, and salary schedule references. Other divisions' records are not affected."
      />

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold text-slate-800">Import DBF Masterfile</h2>
              </div>
              <button onClick={() => { setShowUpload(false); setUploadPreview(null); setUploadResult(null); setImportSummary(null); }} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {uploadResult && importSummary && (
                <ImportSummaryDisplay
                  summary={importSummary}
                  showChanges={showChanges}
                  setShowChanges={setShowChanges}
                  showInvalidRecords={showInvalidRecords}
                  setShowInvalidRecords={setShowInvalidRecords}
                  onDone={() => { setShowUpload(false); setUploadResult(null); setImportSummary(null); }}
                />
              )}

              {uploadResult && !importSummary && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  uploadResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {uploadResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {uploadResult.message}
                  {uploadResult.skipped > 0 && <span className="text-xs opacity-75">({uploadResult.skipped} skipped)</span>}
                </div>
              )}

              {!uploadPreview && !uploadResult && (
                <>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                    <input ref={fileRef} type="file" accept=".DBF,.dbf" onChange={handleDbfFile} className="hidden" />
                    <FileUp className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Upload className="w-4 h-4" /> Choose DBF File
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      Select a masterfile .DBF file from your computer to import employee records.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoUpdateStacode}
                      onChange={(e) => setAutoUpdateStacode(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500/30"
                    />
                    <div>
                      <span className="text-sm font-medium text-emerald-800">Automatically update STACODE from MASTERFILE.DBF during import</span>
                      <p className="text-xs text-emerald-600 mt-0.5">When enabled, employee STACODE, Payroll Group assignments, and school classifications are synchronized with the latest uploaded masterfile data. All STACODE changes are logged in the audit trail.</p>
                    </div>
                  </label>
                </>
              )}

              {uploadPreview && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      {uploadPreview.records.length} records found &middot; {uploadPreview.fields.length} columns
                    </span>
                    <button
                      onClick={() => { setUploadPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >Choose different file</button>
                  </div>
                  <div className={`flex items-start gap-3 px-4 py-3 rounded-lg ${autoUpdateStacode ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={autoUpdateStacode}
                      onChange={(e) => setAutoUpdateStacode(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500/30"
                    />
                    <div>
                      <span className={`text-sm font-medium ${autoUpdateStacode ? 'text-emerald-800' : 'text-slate-700'}`}>Auto-update STACODE & Payroll Group from DBF</span>
                      <p className="text-xs text-slate-500 mt-0.5">Synchronizes STACODE, school, position, salary grade, and payroll group from the uploaded file. Changes are logged in the audit trail.</p>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-2 font-medium">#</th>
                          <th className="text-left px-2 py-2 font-medium">EMPNO</th>
                          <th className="text-left px-2 py-2 font-medium">Name</th>
                          <th className="text-left px-2 py-2 font-medium">STACODE</th>
                          <th className="text-left px-2 py-2 font-medium">SG/Step</th>
                          <th className="text-right px-2 py-2 font-medium">BASIC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uploadPreview.records.slice(0, 50).map((rec, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-mono text-slate-600">{String(rec['EMPNO'] ?? '')}</td>
                            <td className="px-2 py-1.5 text-slate-700">{String(rec['LNAME'] ?? '')}, {String(rec['FNAME'] ?? '')}</td>
                            <td className="px-2 py-1.5 font-mono text-slate-500">{String(rec['STACODE'] ?? '')}</td>
                            <td className="px-2 py-1.5 text-slate-500">{String(rec['GRADE'] ?? '')}/{String(rec['STEP'] ?? '')}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{rec['BASIC'] ? currency(Number(rec['BASIC'])) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {uploadPreview.records.length > 50 && (
                    <p className="text-xs text-slate-400">Showing first 50 of {uploadPreview.records.length} records</p>
                  )}
                </>
              )}
            </div>
            {uploadPreview && (
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
                <p className="text-xs text-slate-500">
                  Existing employees (matched by EMPNO) will be updated. New EMPNOs will be added.
                  {autoUpdateStacode && ' STACODE changes will be logged in the audit trail.'}
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setShowUpload(false); setUploadPreview(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
                  <button
                    onClick={importDbf}
                    disabled={uploading}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {uploading ? 'Importing…' : `Import ${uploadPreview.records.length} Records`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-slate-800">{editing ? 'Edit Employee' : 'Add Employee'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}              <CollapsibleSection title="Assignment & Identity" defaultOpen fields={[
                { key: 'empno', label: 'EMPNO *' },
                { key: 'lname', label: 'LNAME *' }, { key: 'fname', label: 'FNAME *' },
                { key: 'mi', label: 'MI' }, { key: 'appel', label: 'APPEL' },
                { key: 'account', label: 'ACCOUNT' },
                { key: 'paymode', label: 'PAYMODE', type: 'select', options: ['ATM', 'Cash', 'Check'] },
                { key: 'empname', label: 'EMPNAME (auto if blank)' },
              ]} form={form} setForm={setFormWithSalary} />

              {/* Auto-populated REGCODE + DIVCODE from org scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">REGCODE (auto)</span>
                  <input value={form.regcode} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">DIVCODE (auto)</span>
                  <input value={form.divcode} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                </label>
              </div>

              {/* STACODE searchable School picker */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => setShowSchoolPicker(!showSchoolPicker)} className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">School Assignment (STACODE)</span>
                  {showSchoolPicker ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {showSchoolPicker && (
                  <div className="p-4 space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        value={schoolSearch}
                        onChange={e => setSchoolSearch(e.target.value)}
                        placeholder="Search by school code or name…"
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                      />
                    </div>
                    <select
                      value={form.stacode}
                      onChange={e => {
                        const code = e.target.value;
                        const school = schools.find(s => s.school_code === code);
                        setFormWithSalary({
                          ...form,
                          stacode: code,
                          department: school?.school_name || form.department,
                        });
                      }}
                      className={inputCls}
                    >
                      <option value="">— Select School —</option>
                      {filteredSchools.map(s => (
                        <option key={s.school_code} value={s.school_code}>
                          {s.school_code} — {s.school_name}
                        </option>
                      ))}
                    </select>
                    {form.stacode && (() => {
                      const school = schools.find(s => s.school_code === form.stacode);
                      if (!school) return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          STACODE "{form.stacode}" not found in School Directory. Import schools in Organization first.
                        </div>
                      );
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          {school.school_name}
                        </div>
                      );
                    })()}
                    {/* Manual STACODE input */}
                    <label className="block">
                      <span className="block text-[11px] text-slate-500 mb-0.5">Or type STACODE manually</span>
                      <input value={form.stacode} onChange={e => setFormWithSalary({ ...form, stacode: e.target.value })} className={inputCls} placeholder="STACODE" />
                    </label>
                  </div>
                )}
              </div>
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-0.5">DISTCODE</span>
                <input value={form.distcode} onChange={e => setFormWithSalary({ ...form, distcode: e.target.value })} className={inputCls} />
              </label>

              {/* Position picker — sourced from position_management table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPositionPicker(!showPositionPicker)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Position Assignment (from Position Management)</span>
                  {showPositionPicker ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {showPositionPicker && (
                  <div className="p-4 space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        value={positionSearch}
                        onChange={e => setPositionSearch(e.target.value)}
                        placeholder="Search position code or title…"
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                      />
                    </div>
                    <select
                      value={form.poscode}
                      onChange={e => {
                        const code = e.target.value;
                        const pos = lookupPosition(code);
                        if (pos) {
                          setFormWithSalary({
                            ...form,
                            poscode: code,
                            position: code,
                            grade: pos.salary_grade,
                            step: 1,
                          });
                        } else {
                          setFormWithSalary({ ...form, poscode: code, position: code });
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">— Select Position —</option>
                      {positionList
                        .filter(p => {
                          if (!positionSearch) return true;
                          const q = positionSearch.toLowerCase();
                          return p.position_code.toLowerCase().includes(q) ||
                            (p.position_title || '').toLowerCase().includes(q) ||
                            (p.position_name || '').toLowerCase().includes(q);
                        })
                        .map(p => (
                          <option key={p.id} value={p.position_code}>
                            {p.position_code} — {p.position_title || p.position_name} (SG {p.salary_grade})
                          </option>
                        ))}
                    </select>
                    {form.poscode && (() => {
                      const pos = lookupPosition(form.poscode);
                      if (!pos) return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Position code "{form.poscode}" not found in Position Management. Grade/step must be set manually.
                        </div>
                      );
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          {pos.position_title || pos.position_name} · SG {pos.salary_grade} · {pos.personnel_category}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <CollapsibleSection title="Personal Information" defaultOpen fields={[
                { key: 'birthdate', label: 'BIRTHDATE', type: 'date' },
                { key: 'sex', label: 'SEX', type: 'select', options: ['', 'M', 'F'] },
                { key: 'civilstat', label: 'CIVILSTAT', type: 'select', options: ['', 'S', 'M', 'W', 'SP', 'D'] },
                { key: 'tin', label: 'TIN' },
                { key: 'status', label: 'STATUS', type: 'select', options: ['Active', 'Inactive', 'Resigned', 'Terminated'] },
                { key: 'attend', label: 'ATTEND' },
              ]} form={form} setForm={setFormWithSalary} />

              <CollapsibleSection title="Salary & Allowances" defaultOpen fields={[
                { key: 'grade', label: 'GRADE', type: 'number' }, { key: 'step', label: 'STEP (default 1)', type: 'number' },
                { key: 'basic', label: 'BASIC (auto from SG+STEP)', type: 'number', step: '0.01' },
                { key: 'pera', label: 'PERA (default ₱2,000)', type: 'number', step: '0.01' },
                { key: 'trans', label: 'TRANS', type: 'number', step: '0.01' },
                { key: 'aca', label: 'ACA', type: 'number', step: '0.01' },
                { key: 'rata', label: 'RATA', type: 'number', step: '0.01' },
                { key: 'ontop', label: 'ONTOP', type: 'number', step: '0.01' },
                { key: 'long', label: 'LONG', type: 'number', step: '0.01' },
                { key: 'clothing', label: 'CLOTHING', type: 'number', step: '0.01' },
                { key: 'cashallow', label: 'CASHALLOW', type: 'number', step: '0.01' },
              ]} form={form} setForm={setFormWithSalary} />
              {lookedUpSalary != null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  BASIC auto-set to {currency(lookedUpSalary)} from DBM Salary Schedule (SG {form.grade}, Step {form.step}). Override manually if needed.
                </div>
              )}
              {form.grade > 0 && form.step > 0 && lookedUpSalary == null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  No salary schedule entry found for SG {form.grade}, Step {form.step}. Upload the DBM circular in the Salary Schedule page.
                </div>
              )}

              <CollapsibleSection title="Government IDs & Banking" fields={[
                { key: 'gsis_pn', label: 'GSIS_PN' }, { key: 'gsis_id', label: 'GSIS_ID' },
                { key: 'hdmf_id', label: 'HDMF_ID' }, { key: 'phic_id', label: 'PHIC_ID' },
                { key: 'banker', label: 'BANKER' }, { key: 'pib', label: 'PIB' },
              ]} form={form} setForm={setFormWithSalary} />

              {/* Deductions (Employee Share) — auto-computed, only DEDTAX editable */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-default">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Deductions (Employee Share) — Auto-Computed</span>
                </button>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">DEDLNR — GSIS (9% of basic)</span>
                    <input value={form.dedlnr} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">DEDMED — PhilHealth (2.5%)</span>
                    <input value={form.dedmed} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">DEDPAG — Pag-IBIG (₱200)</span>
                    <input value={form.dedpag} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">DEDTAX — Withholding Tax (editable)</span>
                    <input type="number" step="0.01" value={form.dedtax} onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      const gross = form.basic + form.trans + form.pera + form.aca + form.rata + form.ontop + form.long + form.clothing + form.cashallow;
                      const totalDeds = form.dedlnr + form.dedmed + val + form.dedpag;
                      setFormWithSalary({ ...form, dedtax: val, netpay: Math.round((gross - totalDeds) * 100) / 100 });
                    }} className="w-full px-3 py-2 rounded-lg border border-emerald-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">NETPAY (auto-computed)</span>
                    <input value={form.netpay} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed font-semibold" />
                  </label>
                </div>
              </div>

              {/* Government Share — auto-computed, read-only */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 cursor-default">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Government Share — Auto-Computed</span>
                </button>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">GOVTLNR — GSIS (12% of basic)</span>
                    <input value={form.govtlnr} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">GOVTECC — GSIS ECC (₱100)</span>
                    <input value={form.govtecc} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-0.5">GOVTMED — PhilHealth (2.5%)</span>
                    <input value={form.govtmed} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                  </label>
                </div>
              </div>

              <CollapsibleSection title="Codes & Dates" fields={[
                { key: 'pagcode', label: 'PAGCODE' }, { key: 'taxcode', label: 'TAXCODE' },
                { key: 'updcode', label: 'UPDCODE' }, { key: 'editor', label: 'EDITOR' },
                { key: 'hiredate', label: 'HIREDATE', type: 'date' },
                { key: 'update', label: 'UPDATE', type: 'date' },
                { key: 'paydate', label: 'PAYDATE', type: 'date' },
              ]} form={form} setForm={setFormWithSalary} />

              <CollapsibleSection title="Bonuses & Adjustments" fields={[
                { key: 'mid_bonus', label: 'MID_BONUS', type: 'number', step: '0.01' },
                { key: 'mid_cash', label: 'MID_CASH', type: 'number', step: '0.01' },
                { key: 'end_bonus', label: 'END_BONUS', type: 'number', step: '0.01' },
                { key: 'end_cash', label: 'END_CASH', type: 'number', step: '0.01' },
                { key: 'add_bonus', label: 'ADD_BONUS', type: 'number', step: '0.01' },
                { key: 'taxref', label: 'TAXREF', type: 'number', step: '0.01' },
                { key: 'special', label: 'SPECIAL', type: 'number', step: '0.01' },
                { key: 'over_wheld', label: 'OVER_WHELD', type: 'number', step: '0.01' },
              ]} form={form} setForm={setFormWithSalary} />

              <CollapsibleSection title="Excess Fields" fields={[
                { key: 'exposcode', label: 'EXPOSCODE' },
                { key: 'exgrade', label: 'EXGRADE', type: 'number' },
                { key: 'exstep', label: 'EXSTEP', type: 'number' },
                { key: 'exbasic', label: 'EXBASIC', type: 'number', step: '0.01' },
                { key: 'exlnr', label: 'EXLNR', type: 'number', step: '0.01' },
                { key: 'exmed', label: 'EXMED', type: 'number', step: '0.01' },
                { key: 'expag', label: 'EXPAG', type: 'number', step: '0.01' },
                { key: 'extax', label: 'EXTAX', type: 'number', step: '0.01' },
                { key: 'exglnr', label: 'EXGLNR', type: 'number', step: '0.01' },
                { key: 'exgmed', label: 'EXGMED', type: 'number', step: '0.01' },
                { key: 'exgpag', label: 'EXGPAG', type: 'number', step: '0.01' },
                { key: 'exgecc', label: 'EXGECC', type: 'number', step: '0.01' },
              ]} form={form} setForm={setFormWithSalary} />

              <CollapsibleSection title="Difference Fields" fields={[
                { key: 'saldiff', label: 'SALDIFF', type: 'number', step: '0.01' },
                { key: 'lnrdiff', label: 'LNRDIFF', type: 'number', step: '0.01' },
                { key: 'meddiff', label: 'MEDDIFF', type: 'number', step: '0.01' },
                { key: 'pagdiff', label: 'PAGDIFF', type: 'number', step: '0.01' },
                { key: 'taxdiff', label: 'TAXDIFF', type: 'number', step: '0.01' },
                { key: 'glnrdiff', label: 'GLNRDIFF', type: 'number', step: '0.01' },
                { key: 'gmeddiff', label: 'GMEDDIFF', type: 'number', step: '0.01' },
                { key: 'gpagdiff', label: 'GPAGDIFF', type: 'number', step: '0.01' },
                { key: 'geccdiff', label: 'GECCDIFF', type: 'number', step: '0.01' },
              ]} form={form} setForm={setFormWithSalary} />

              <CollapsibleSection title="Dependents" fields={[
                { key: 'depname1', label: 'DEPNAME1' }, { key: 'depdate1', label: 'DEPDATE1', type: 'date' },
                { key: 'depname2', label: 'DEPNAME2' }, { key: 'depdate2', label: 'DEPDATE2', type: 'date' },
                { key: 'depname3', label: 'DEPNAME3' }, { key: 'depdate3', label: 'DEPDATE3', type: 'date' },
                { key: 'depname4', label: 'DEPNAME4' }, { key: 'depdate4', label: 'DEPDATE4', type: 'date' },
              ]} form={form} setForm={setFormWithSalary} />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportSummaryDisplay({
  summary,
  showChanges,
  setShowChanges,
  showInvalidRecords,
  setShowInvalidRecords,
  onDone,
}: {
  summary: {
    totalImported: number;
    newEmployees: number;
    employeesUpdated: number;
    stacodeChanges: number;
    invalidStacode: number;
    stacodeChangesList: { empno: string; employeeName: string; oldStacode: string; newStacode: string }[];
    invalidRecordsList: { empno: string; employeeName: string; stacode: string; error: string }[];
  };
  showChanges: boolean;
  setShowChanges: (v: boolean) => void;
  showInvalidRecords: boolean;
  setShowInvalidRecords: (v: boolean) => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-semibold text-slate-800 text-base">MASTERFILE IMPORT SUMMARY</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryStat label="Total Imported" value={summary.totalImported} color="slate" />
        <SummaryStat label="New Employees" value={summary.newEmployees} color="emerald" />
        <SummaryStat label="Updated" value={summary.employeesUpdated} color="blue" />
        <SummaryStat label="STACODE Changes" value={summary.stacodeChanges} color="amber" />
        <SummaryStat label="Invalid STACODE" value={summary.invalidStacode} color="rose" />
      </div>

      <div className="flex flex-wrap gap-2">
        {summary.stacodeChanges > 0 && (
          <button
            onClick={() => { setShowChanges(!showChanges); setShowInvalidRecords(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            {showChanges ? 'Hide' : 'View'} Changes ({summary.stacodeChanges})
          </button>
        )}
        {summary.invalidStacode > 0 && (
          <button
            onClick={() => { setShowInvalidRecords(!showInvalidRecords); setShowChanges(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            {showInvalidRecords ? 'Hide' : 'View'} Invalid Records ({summary.invalidStacode})
          </button>
        )}
        <button
          onClick={onDone}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Done
        </button>
      </div>

      {showChanges && summary.stacodeChangesList.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
            <span className="text-xs font-semibold text-amber-800">STACODE Change Log</span>
          </div>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Employee No.</th>
                  <th className="text-left px-3 py-2 font-medium">Employee Name</th>
                  <th className="text-left px-3 py-2 font-medium">Old STACODE</th>
                  <th className="text-left px-3 py-2 font-medium">New STACODE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.stacodeChangesList.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-600">{c.empno}</td>
                    <td className="px-3 py-2 text-slate-700">{c.employeeName}</td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono">{c.oldStacode}</span></td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono">{c.newStacode}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showInvalidRecords && summary.invalidRecordsList.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100">
            <span className="text-xs font-semibold text-rose-800">Invalid STACODE Records</span>
          </div>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Employee No.</th>
                  <th className="text-left px-3 py-2 font-medium">Employee Name</th>
                  <th className="text-left px-3 py-2 font-medium">STACODE</th>
                  <th className="text-left px-3 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.invalidRecordsList.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-600">{r.empno}</td>
                    <td className="px-3 py-2 text-slate-700">{r.employeeName}</td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono">{r.stacode}</span></td>
                    <td className="px-3 py-2 text-rose-600">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: 'slate' | 'emerald' | 'blue' | 'amber' | 'rose' }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value.toLocaleString()}</div>
    </div>
  );
}