import { useState, useMemo } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Circle, ArrowRightLeft,
  Landmark, FileText, Building2, CreditCard, CalendarDays,
  ShieldCheck, ShieldAlert, Save, Edit3,
} from 'lucide-react';
import { currency } from '@/lib/reports';
import { computeCscFromPeriod } from '@/lib/ipsComputation';
import {
  type EmployeePayrollStatus,
  allRequirementsComplete, requirementList,
} from '@/types/initialPayroll';
import type { PositionMgmt } from '@/lib/usePositions';
import SearchSelect from '@/components/SearchSelect';

/** Strip parenthetical titles from a string, e.g. "Teacher I (SPED)" → "Teacher I" */
function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

interface Props {
  employee: EmployeePayrollStatus;
  allEmployees: EmployeePayrollStatus[];
  positions: PositionMgmt[];
  salaryLookup: (grade: number, step: number) => number | undefined;
  schools: { id: string; school_code: string; school_name: string; school_type: string }[];
  onClose: () => void;
  onNavigate: (emp: EmployeePayrollStatus) => void;
  onToggleRequirement: (empId: string, field: 'req_appointment_validated' | 'req_tin_submitted' | 'req_philhealth_submitted' | 'req_pagibig_submitted' | 'req_atm_submitted') => void;
  onSaveEmployee: (empId: string, patch: Record<string, unknown>) => Promise<boolean>;
  onTransfer: (empId: string) => void;
}

const REQ_FIELDS: { key: 'req_appointment_validated' | 'req_tin_submitted' | 'req_philhealth_submitted' | 'req_pagibig_submitted' | 'req_atm_submitted'; label: string; icon: typeof FileText }[] = [
  { key: 'req_appointment_validated', label: 'Appointment Validated', icon: ShieldCheck },
  { key: 'req_tin_submitted', label: 'TIN Submitted', icon: FileText },
  { key: 'req_philhealth_submitted', label: 'PhilHealth Submitted', icon: Landmark },
  { key: 'req_pagibig_submitted', label: 'Pag-IBIG Submitted', icon: Building2 },
  { key: 'req_atm_submitted', label: 'ATM Account Submitted', icon: CreditCard },
];

export default function InitialEmployeeCard({
  employee, allEmployees, positions, salaryLookup, schools,
  onClose, onNavigate, onToggleRequirement, onSaveEmployee, onTransfer,
}: Props) {
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const e = employee;
  const allDone = allRequirementsComplete(e);
  const reqs = requirementList(e);
  const completedCount = reqs.filter((r) => r.done).length;

  const empno = e.employee_number || '';
  const fname = e.first_name || e.fname || '';
  const lname = e.last_name || e.lname || '';
  const mi = e.middle_name || e.mi || '';

  const idx = allEmployees.findIndex((x) => x.id === e.id);
  const prev = idx > 0 ? allEmployees[idx - 1] : null;
  const next = idx < allEmployees.length - 1 ? allEmployees[idx + 1] : null;

  const monthlySalary = Number(e.basic ?? e.basic_salary ?? 0);
  const dailyRate = Math.round(monthlySalary / 22 * 100) / 100;

  // Edit form state
  const [form, setForm] = useState({
    last_name: e.last_name || e.lname || '',
    first_name: e.first_name || e.fname || '',
    middle_name: e.middle_name || e.mi || '',
    employee_number: e.employee_number || '',
    stacode: e.stacode || '',
    position: e.position || '',
    poscode: '',
    grade: e.grade ?? 0,
    step: e.step ?? 0,
    basic: Number(e.basic ?? e.basic_salary ?? 0),
    hire_date: e.hire_date || e.hiredate || '',
    tin: e.tin || '',
    philhealth_number: e.philhealth_number || '',
    pagibig_number: e.pagibig_number || '',
    bank_name: e.bank_name || '',
    bank_account: e.bank_account || '',
    department: e.department || '',
  });

  // Auto-populate salary when grade/step changes
  const autoSalary = useMemo(() => {
    if (form.grade > 0 && form.step > 0) {
      const v = salaryLookup(form.grade, form.step);
      if (v !== undefined) return v;
    }
    return null;
  }, [form.grade, form.step, salaryLookup]);

  // When a position is selected, auto-fill grade and position title
  function selectPosition(pos: PositionMgmt) {
    setForm((f) => ({
      ...f,
      poscode: pos.position_code,
      position: pos.position_title || pos.position_name,
      grade: pos.salary_grade,
      step: f.step || 1,
    }));
  }

  // When a school is selected, auto-fill stacode
  function selectSchool(school: { school_code: string; school_name: string }) {
    setForm((f) => ({ ...f, stacode: school.school_code, department: school.school_name }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    const patch: Record<string, unknown> = {
      last_name: form.last_name,
      first_name: form.first_name,
      middle_name: form.middle_name,
      lname: form.last_name,
      fname: form.first_name,
      mi: form.middle_name,
      employee_number: form.employee_number,
      stacode: form.stacode,
      position: form.position,
      poscode: form.poscode,
      grade: form.grade,
      step: form.step,
      basic: autoSalary ?? form.basic,
      basic_salary: autoSalary ?? form.basic,
      hire_date: form.hire_date || null,
      tin: form.tin,
      philhealth_number: form.philhealth_number,
      pagibig_number: form.pagibig_number,
      bank_name: form.bank_name,
      bank_account: form.bank_account,
      department: form.department,
    };
    const ok = await onSaveEmployee(e.id, patch);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setSaveError('Failed to save. Please try again.');
    }
  }

  function handleCancelEdit() {
    setForm({
      last_name: e.last_name || e.lname || '',
      first_name: e.first_name || e.fname || '',
      middle_name: e.middle_name || e.mi || '',
      employee_number: e.employee_number || '',
      stacode: e.stacode || '',
      position: e.position || '',
      poscode: '',
      grade: e.grade ?? 0,
      step: e.step ?? 0,
      basic: Number(e.basic ?? e.basic_salary ?? 0),
      hire_date: e.hire_date || e.hiredate || '',
      tin: e.tin || '',
      philhealth_number: e.philhealth_number || '',
      pagibig_number: e.pagibig_number || '',
      bank_name: e.bank_name || '',
      bank_account: e.bank_account || '',
      department: e.department || '',
    });
    setEditing(false);
    setSaveError('');
  }

  const displaySalary = autoSalary ?? form.basic;
  const displayDaily = Math.round((displaySalary / 22) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:bg-white print:p-0">
      <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible">
        {/* Navigation bar */}
        <div className="flex items-center justify-between mb-3 px-1 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => prev && onNavigate(prev)}
              disabled={!prev}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-xs text-slate-500 font-medium px-2">{idx + 1} of {allEmployees.length}</span>
            <button
              onClick={() => next && onNavigate(next)}
              disabled={!next}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-sm"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-sm"
            >
              <X className="w-4 h-4" /> Close
            </button>
          </div>
        </div>

        {/* ── Premium Initial Payroll Card ── */}
        <div className="bg-white rounded-2xl shadow-premium overflow-hidden print:shadow-none print:rounded-none">
          {/* Card header — amber gradient for Initial Payroll */}
          <div className="bg-gradient-to-br from-amber-700 via-amber-600 to-amber-500 px-6 py-5 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 -mr-12 -mt-12 rounded-full bg-white/5" />
            <div className="absolute bottom-0 right-20 w-32 h-32 -mb-10 rounded-full bg-white/5" />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/20 flex items-center justify-center text-xl font-bold shrink-0">
                  {fname[0]?.toUpperCase()}{lname[0]?.toUpperCase()}
                </div>
                <div>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={form.last_name}
                        onChange={(ev) => setForm((f) => ({ ...f, last_name: ev.target.value }))}
                        placeholder="Last Name"
                        className="px-2 py-1 rounded text-sm text-slate-800 bg-white/90 outline-none w-32"
                      />
                      <input
                        value={form.first_name}
                        onChange={(ev) => setForm((f) => ({ ...f, first_name: ev.target.value }))}
                        placeholder="First Name"
                        className="px-2 py-1 rounded text-sm text-slate-800 bg-white/90 outline-none w-28"
                      />
                      <input
                        value={form.middle_name}
                        onChange={(ev) => setForm((f) => ({ ...f, middle_name: ev.target.value }))}
                        placeholder="MI"
                        className="px-2 py-1 rounded text-sm text-slate-800 bg-white/90 outline-none w-12"
                      />
                    </div>
                  ) : (
                    <p className="text-lg font-bold leading-tight">{lname}, {fname} {mi}</p>
                  )}
                  {editing ? (
                    <input
                      value={form.employee_number}
                      onChange={(ev) => setForm((f) => ({ ...f, employee_number: ev.target.value }))}
                      placeholder="Employee #"
                      className="mt-1 px-2 py-0.5 rounded text-xs text-slate-700 bg-white/90 outline-none w-32"
                    />
                  ) : (
                    <p className="text-sm text-amber-100 mt-0.5">{e.position || '—'} · {e.department || e.stacode || '—'}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-medium backdrop-blur">Emp #{empno}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-medium backdrop-blur">SG {e.grade ?? 0} · Step {e.step ?? 0}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-100 text-[11px] font-medium ring-1 ring-amber-300/30">Initial Payroll</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                {editing ? (
                  <>
                    <input
                      value={form.bank_name}
                      onChange={(ev) => setForm((f) => ({ ...f, bank_name: ev.target.value }))}
                      placeholder="Bank Name"
                      className="px-2 py-1 rounded text-xs text-slate-700 bg-white/90 outline-none w-32 mb-1"
                    />
                    <input
                      value={form.bank_account}
                      onChange={(ev) => setForm((f) => ({ ...f, bank_account: ev.target.value }))}
                      placeholder="Account #"
                      className="px-2 py-1 rounded text-xs text-slate-700 bg-white/90 outline-none w-32"
                    />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 text-amber-200 text-[11px] uppercase tracking-wider font-medium">
                      <CreditCard className="w-3 h-3" />
                      ATM Account
                    </div>
                    <p className="text-sm font-mono mt-1 tracking-wider">{e.bank_account ? `•••• ${e.bank_account.slice(-4)}` : '—'}</p>
                    <p className="text-xs text-amber-200 mt-0.5">{e.bank_name || '—'}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Card body */}
          <div className="p-6 space-y-5">
            {saveError && (
              <div className="px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{saveError}</div>
            )}

            {/* Employee info grid / edit form */}
            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200">
                <EditField label="Position (from Position Management)">
                  <SearchSelect
                    options={positions.map((p) => ({
                      value: p.position_code,
                      label: `${p.position_code} · ${stripParens(p.position_title || p.position_name)}`,
                    }))}
                    value={form.poscode}
                    onChange={(val) => {
                      const pos = positions.find((p) => p.position_code === val);
                      if (pos) selectPosition(pos);
                      else setForm((f) => ({ ...f, poscode: '', position: '' }));
                    }}
                    placeholder="— Select Position —"
                    searchPlaceholder="Search position code or title…"
                  />
                </EditField>

                <EditField label="Position Title (override)">
                  <input
                    value={form.position}
                    onChange={(ev) => setForm((f) => ({ ...f, position: ev.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30"
                  />
                </EditField>

                <EditField label="Station / School (from Schools Directory)">
                  <SearchSelect
                    options={schools.map((s) => ({
                      value: s.school_code,
                      label: `${s.school_code} · ${s.school_name}`,
                    }))}
                    value={form.stacode}
                    onChange={(val) => {
                      const school = schools.find((s) => s.school_code === val);
                      if (school) selectSchool(school);
                      else setForm((f) => ({ ...f, stacode: val }));
                    }}
                    placeholder="— Select School / Station —"
                    searchPlaceholder="Search school code or name…"
                  />
                </EditField>

                <EditField label="Station Code (override)">
                  <input
                    value={form.stacode}
                    onChange={(ev) => setForm((f) => ({ ...f, stacode: ev.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30"
                  />
                </EditField>

                <EditField label="Salary Grade">
                  <input
                    type="number" min={1} max={33} value={form.grade}
                    onChange={(ev) => setForm((f) => ({ ...f, grade: Number(ev.target.value) }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30"
                  />
                </EditField>

                <EditField label="Step">
                  <select
                    value={form.step}
                    onChange={(ev) => setForm((f) => ({ ...f, step: Number(ev.target.value) }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((st) => (
                      <option key={st} value={st}>Step {st}</option>
                    ))}
                  </select>
                </EditField>

                <EditField label={`Monthly Salary${autoSalary !== null ? ' (auto from Salary Schedule)' : ''}`}>
                  <input
                    type="number" value={autoSalary ?? form.basic}
                    disabled={autoSalary !== null}
                    onChange={(ev) => setForm((f) => ({ ...f, basic: Number(ev.target.value) }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </EditField>

                <EditField label="Effectivity Date">
                  <input
                    type="date" value={form.hire_date}
                    onChange={(ev) => setForm((f) => ({ ...f, hire_date: ev.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30"
                  />
                </EditField>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoTile label="Station Code" value={e.stacode || '—'} />
                <InfoTile label="Department" value={e.department || '—'} />
                <InfoTile label="Position" value={e.position || '—'} />
                <InfoTile label="Effectivity Date" value={e.hire_date || e.hiredate ? new Date(e.hire_date || e.hiredate || '').toLocaleDateString('en-PH') : '—'} />
              </div>
            )}

            {/* Government IDs */}
            {editing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <EditField label="TIN">
                  <input value={form.tin} onChange={(ev) => setForm((f) => ({ ...f, tin: ev.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
                </EditField>
                <EditField label="PhilHealth # (12 digits)">
                  <input
                    value={form.philhealth_number}
                    onChange={(ev) => setForm((f) => ({ ...f, philhealth_number: ev.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    inputMode="numeric"
                    placeholder="000000000000"
                    className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30 font-mono tracking-wider"
                  />
                </EditField>
                <EditField label="Pag-IBIG # (12 digits)">
                  <input
                    value={form.pagibig_number}
                    onChange={(ev) => setForm((f) => ({ ...f, pagibig_number: ev.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    inputMode="numeric"
                    placeholder="000000000000"
                    className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30 font-mono tracking-wider"
                  />
                </EditField>
                <EditField label="ATM Account #">
                  <input value={form.bank_account} onChange={(ev) => setForm((f) => ({ ...f, bank_account: ev.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-sm outline-none focus:ring-1 focus:ring-amber-500/30" />
                </EditField>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <GovIdTile icon={FileText} label="TIN" value={e.tin || '—'} />
                <GovIdTile icon={Landmark} label="PhilHealth" value={e.philhealth_number || '—'} />
                <GovIdTile icon={Building2} label="Pag-IBIG" value={e.pagibig_number || '—'} />
                <GovIdTile icon={CreditCard} label="ATM Account" value={e.bank_account || '—'} />
              </div>
            )}

            {/* Salary section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Salary</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <AmountRow label="Monthly Salary" value={currency(editing ? displaySalary : monthlySalary)} bold valueColor="text-slate-900" />
                  <AmountRow label="Daily Rate (÷22)" value={currency(editing ? displayDaily : dailyRate)} valueColor="text-slate-600" />
                  <AmountRow label="Salary Grade" value={String(editing ? form.grade : e.grade ?? 0)} valueColor="text-slate-600" />
                  <AmountRow label="Step" value={String(editing ? form.step : e.step ?? 0)} valueColor="text-slate-600" />
                </div>
              </div>

              {/* Requirements Checklist */}
              <div className="md:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payroll Requirements</p>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    allDone
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : 'bg-amber-100 text-amber-700 border border-amber-300'
                  }`}>
                    {completedCount}/5 {allDone ? 'COMPLETE' : 'PENDING'}
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  {REQ_FIELDS.map(({ key, label, icon: Icon }) => {
                    const done = (e as unknown as Record<string, unknown>)[key] as boolean;
                    return (
                      <button
                        key={key}
                        onClick={() => onToggleRequirement(e.id, key)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${
                          done
                            ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-amber-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            done ? 'bg-emerald-500' : 'bg-slate-100'
                          }`}>
                            <Icon className={`w-4 h-4 ${done ? 'text-white' : 'text-slate-400'}`} />
                          </div>
                          <span className={`text-sm font-medium ${done ? 'text-emerald-800' : 'text-slate-600'}`}>
                            {label}
                          </span>
                        </div>
                        {done
                          ? <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm"><CheckCircle2 className="w-5 h-5 text-white" /></div>
                          : <div className="w-6 h-6 rounded-full border-2 border-slate-300 flex items-center justify-center shrink-0"><Circle className="w-4 h-4 text-slate-300" /></div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CSC Days Present Computation */}
              <div className="md:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CSC Days Present Computation</p>
                  <span className="ml-auto text-[10px] text-slate-400">Standard CSC = 11 days</span>
                </div>
                <div className="p-4">
                  <CscBreakdown
                    effectivityDate={form.hire_date || e.hire_date || e.hiredate || null}
                    monthlySalary={editing ? displaySalary : monthlySalary}
                  />
                </div>
              </div>
            </div>

            {/* Transfer section */}
            <div className={`rounded-xl p-5 border ${allDone ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {allDone ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">
                      {allDone ? 'Ready for Regular Payroll' : 'Requirements Incomplete'}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {allDone
                        ? 'All payroll requirements have been submitted. This employee can be transferred to Regular Payroll.'
                        : `Complete all ${5 - completedCount} remaining requirement(s) before transferring to Regular Payroll.`
                      }
                    </p>
                  </div>
                </div>
                {allDone && !transferConfirm ? (
                  <button
                    onClick={() => setTransferConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-sm"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> Transfer to Regular
                  </button>
                ) : allDone && transferConfirm ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { onTransfer(e.id); setTransferConfirm(false); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Confirm Transfer
                    </button>
                    <button
                      onClick={() => setTransferConfirm(false)}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium">
                    Cannot Transfer
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400 tracking-wider font-medium uppercase">
              Initial Payroll Record — {e.payroll_status}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-sm text-slate-700 font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}

function GovIdTile({ icon: Icon, label, value }: { icon: typeof Landmark; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700 truncate">{value}</p>
      </div>
    </div>
  );
}

function AmountRow({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{label}</span>
      <span className={`tabular ${bold ? 'font-bold' : 'font-medium'} ${valueColor ?? 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

function CscBreakdown({ effectivityDate, monthlySalary }: { effectivityDate: string | null; monthlySalary: number }) {
  const csc = useMemo(() => {
    if (!effectivityDate) return null;
    return computeCscFromPeriod(effectivityDate, null, 0, effectivityDate);
  }, [effectivityDate]);

  if (!effectivityDate || !csc) {
    return (
      <p className="text-xs text-slate-400 italic">
        Set an Effectivity Date to compute CSC Days Present.
      </p>
    );
  }

  const periodLabel = csc.periodLabel === 'First Half' ? 'First Half (1–15)' : 'Second Half (16–End of Month)';
  const monthly = Number(monthlySalary) || 0;
  const dailyRate = Math.round((monthly / 22) * 100) / 100;
  const grossSalary = Math.round(dailyRate * csc.payableDays * 100) / 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">{periodLabel}</span>
        <span className="text-slate-400">Period based on Effectivity Date: {new Date(effectivityDate).toLocaleDateString('en-PH')}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Daily Rate (÷22)</p>
          <p className="text-lg font-bold text-slate-700 tabular mt-1">{currency(dailyRate)}</p>
        </div>
        <div className="rounded-lg bg-brand-50 border border-brand-200 p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Payroll Allocation</p>
          <p className="text-lg font-bold text-brand-700 tabular mt-1">{csc.payrollAllocation} days</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Days Before Start</p>
          <p className="text-lg font-bold text-amber-700 tabular mt-1">{csc.daysBeforeStart}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Gross Salary</p>
          <p className="text-lg font-bold text-emerald-700 tabular mt-1">{currency(grossSalary)}</p>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1.5">
        <AmountRow label="Monthly Salary" value={currency(monthly)} bold />
        <AmountRow label="Daily Rate = Monthly Salary ÷ 22" value={currency(dailyRate)} valueColor="text-slate-600" />
        <AmountRow label="Payroll Allocation (fixed per half)" value={`${csc.payrollAllocation} days`} valueColor="text-brand-700" />
        <AmountRow label="Days Before Start (payroll days before effectivity)" value={`${csc.daysBeforeStart} days`} valueColor="text-amber-700" />
        <AmountRow label="Payable Days = Allocation − Days Before Start" value={`${csc.payableDays} days`} valueColor="text-slate-700" />
        <div className="border-t border-slate-200 my-1" />
        <AmountRow label="Gross Salary = Daily Rate × Payable Days" value={currency(grossSalary)} bold valueColor="text-emerald-700" />
      </div>

      <p className="text-[11px] text-slate-500">
        Payroll Allocation is always 11 days per half-period (First Half = 1–15, Second Half = 16–End of Month).
        Days Before Start counts the payroll days that fell before the effectivity date. Payable Days = 11 − Days Before Start.
        Gross Salary = Daily Rate × Payable Days.
      </p>
    </div>
  );
}
