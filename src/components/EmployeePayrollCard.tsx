import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Printer, ShieldAlert, ShieldCheck, Landmark, Wallet, FileText, User, CreditCard, Building2, Briefcase } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { usePositions } from '@/lib/usePositions';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import type { Employee, PayrollEntry, PayPeriod, PayrollDeduction, DeductionCode, UndeductedObligation } from '@/types/payroll';
import { computePayrollDeductions } from '@/lib/payroll';
import { NTHP_THRESHOLD } from '@/lib/nthp';
import { currency } from '@/lib/reports';

interface Props {
  employee: Employee;
  entry: PayrollEntry | null;
  period: PayPeriod | null;
  allEmployees: Employee[];
  allEntries: PayrollEntry[];
  onClose: () => void;
  onNavigate: (emp: Employee) => void;
}

const CIVIL_STAT: Record<string, string> = {
  S: 'Single', M: 'Married', W: 'Widowed', SP: 'Separated', D: 'Divorced',
};
const SEX_LABEL: Record<string, string> = { M: 'Male', F: 'Female' };
const STATUS_LABEL: Record<string, string> = {
  Active: 'Permanent', A: 'Permanent', Permanent: 'Permanent',
  Casual: 'Casual', Contractual: 'Contractual',
  Inactive: 'Inactive', Resigned: 'Resigned', Terminated: 'Terminated',
};
const ATTEND_LABEL: Record<string, string> = { A: 'Active', P: 'Present', L: 'Leave' };
const PAY_MODE_LABEL: Record<string, string> = { A: 'ATM', C: 'Check', D: 'Cash', P: 'Pickup' };

function maskedAccount(account: string | undefined): string {
  if (!account) return '—';
  const digits = account.replace(/\D/g, '');
  if (digits.length <= 4) return account;
  return `•••• •••• •••• ${digits.slice(-4)}`;
}

export default function EmployeePayrollCard({ employee: initialEmployee, entry, period, allEmployees, allEntries, onClose, onNavigate }: Props) {
  const [fullEmployee, setFullEmployee] = useState<Employee | null>(null);
  const [empDeds, setEmpDeds] = useState<PayrollDeduction[]>([]);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const [undeductedObs, setUndeductedObs] = useState<UndeductedObligation[]>([]);
  const { lookup: lookupPosition } = usePositions();
  const { lookup: lookupSalary, meta: schedMeta } = useSalarySchedule();

  const e = fullEmployee ?? initialEmployee;

  useEffect(() => {
    (async () => {
      const [empRes, dedRes, codeRes, undedRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', initialEmployee.id).single(),
        supabase.from('payroll_deductions').select('*').eq('employee_id', initialEmployee.id).neq('status', 'Terminated'),
        fetchAll(() => supabase.from('deduction_codes').select('*')),
        entry
          ? supabase.from('undeducted_obligations').select('*').eq('payroll_entry_id', entry.id)
          : Promise.resolve({ data: null, error: null }),
      ]);
      setFullEmployee((empRes.data as Employee) ?? null);
      setEmpDeds((dedRes.data as PayrollDeduction[]) ?? []);
      setDedCodes(codeRes as DeductionCode[]);
      setUndeductedObs((undedRes.data as UndeductedObligation[]) ?? []);
    })();
  }, [initialEmployee.id, entry?.id]);

  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));

  const basicSalary = e.basic ?? e.basic_salary ?? 0;
  const computed = computePayrollDeductions(
    basicSalary, e.pera ?? 0, e.aca ?? 0, e.rata ?? 0, e.ontop ?? 0, e.long ?? 0, 0,
  );

  const nthpStatus = entry?.nthp_status ?? 'PASS';

  // Build a set of (dedcode + amount) pairs that are undeducted obligations
  const undeductedKeys = new Set(
    undeductedObs.map((u) => `${u.deduction_code}::${Number(u.scheduled_amount || u.undeducted_amount).toFixed(2)}`)
  );

  // Filter out undeducted deductions from the detail display —
  // only show deductions that were ACTUALLY applied (deducted from net pay)
  const appliedDeds = empDeds.filter((d) => !undeductedKeys.has(`${d.dedcode}::${Number(d.dedamt).toFixed(2)}`));

  const gross = entry ? Number(entry.gross_pay) : computed.gross;
  // Always compute from individual components to stay consistent with the displayed rows
  const mandatoryDed = Math.round((computed.dedlnr + computed.dedmed + computed.dedpag + computed.dedtax) * 100) / 100;
  // Sum only APPLIED deductions (not undeducted ones)
  const loanDedsDisplay = appliedDeds.reduce((sum, d) => sum + (Number(d.dedamt) || 0), 0);
  // Total Deductions = Mandatory Deductions + Total Loan Deductions Applied (excludes undeducted)
  const totalDed = Math.round((mandatoryDed + loanDedsDisplay) * 100) / 100;
  // NET PAY = Gross Compensation - Total Deductions
  const netPay = Math.round((gross - totalDed) * 100) / 100;
  // NTHP computed values (always fresh, not from stale entry fields)
  const netPayBeforeLoans = Math.round((gross - mandatoryDed) * 100) / 100;
  const actualLoanDeductionsApplied = loanDedsDisplay;
  const totalUndeductedAmount = undeductedObs.reduce((s, u) => s + Number(u.undeducted_amount || 0), 0);
  const finalNetPay = Math.round((netPayBeforeLoans - actualLoanDeductionsApplied) * 100) / 100;

  const civil = e.civilstat?.toUpperCase() ?? '';
  const civilLabel = CIVIL_STAT[civil] ?? civil;
  const sex = e.sex?.toUpperCase() ?? '';
  const sexLabel = SEX_LABEL[sex] ?? sex;
  const attendLabel = ATTEND_LABEL[e.attend?.toUpperCase() ?? ''] ?? (e.attend || 'Active');
  const statusLabel = STATUS_LABEL[e.status] ?? e.status;
  const empno = e.empno || e.employee_number || '';
  const fname = e.fname || e.first_name || '';
  const mi = e.mi || '';
  const lname = e.lname || e.last_name || '';
  const appel = e.appel || '';

  const idx = allEmployees.findIndex((x) => x.id === e.id);
  const prev = idx > 0 ? allEmployees[idx - 1] : null;
  const next = idx < allEmployees.length - 1 ? allEmployees[idx + 1] : null;

  function getEntry(emp: Employee) {
    return allEntries.find((en) => en.employee_id === emp.id) ?? null;
  }

  function handlePrint() {
    window.print();
  }

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
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-sm"
            >
              <X className="w-4 h-4" /> Close
            </button>
          </div>
        </div>

        {/* ── Premium Payroll Card ── */}
        <div className="bg-white rounded-2xl shadow-premium overflow-hidden print:shadow-none print:rounded-none">
          {/* Card header — blue gradient */}
          <div className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-5 text-white relative overflow-hidden print:bg-brand-700">
            <div className="absolute top-0 right-0 w-48 h-48 -mr-12 -mt-12 rounded-full bg-white/5" />
            <div className="absolute bottom-0 right-20 w-32 h-32 -mb-10 rounded-full bg-white/5" />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/20 flex items-center justify-center text-xl font-bold shrink-0">
                  {fname[0]?.toUpperCase()}{lname[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-bold leading-tight">{lname}, {fname} {mi}</p>
                  <p className="text-sm text-brand-200 mt-0.5">{(() => {
                    const pos = lookupPosition(e.poscode || e.position);
                    return pos ? `${pos.position_title || pos.position_name} · ${pos.personnel_category}` : (e.poscode || e.position || '—');
                  })()} · {e.empname || ''}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-medium backdrop-blur">Emp #{empno}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-medium backdrop-blur">SG {e.grade ?? 0} · Step {e.step ?? 0}</span>
                    {e.status === 'Active' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium ring-1 ring-emerald-400/30">{statusLabel}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1.5 text-brand-200 text-[11px] uppercase tracking-wider font-medium">
                  <CreditCard className="w-3 h-3" />
                  Account
                </div>
                <p className="text-sm font-mono mt-1 tracking-wider">{maskedAccount(e.account || e.bank_account)}</p>
                <p className="text-xs text-brand-200 mt-0.5">{e.banker || e.bank_name || '—'}</p>
              </div>
            </div>

            {period && (
              <div className="relative mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                <span className="text-brand-200">{period.period_name}</span>
                <span className="text-brand-200">Pay Date: <span className="text-white font-medium">{period.pay_date ?? '—'}</span></span>
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="p-6 space-y-5">
            {/* Employee info grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoTile label="Division Code" value={e.divcode || '—'} />
              <InfoTile label="Station Code" value={e.stacode || '—'} />
              <InfoTile label="Region" value={e.regcode || '—'} />
              <InfoTile label="Civil Status" value={civilLabel || '—'} />
              <InfoTile label="Sex" value={sexLabel || '—'} />
              <InfoTile label="Date of Birth" value={e.birthdate ? e.birthdate.replace(/-/g, '/') : '—'} />
              <InfoTile label="Attendance" value={attendLabel} />
              <InfoTile label="Pay Mode" value={PAY_MODE_LABEL[e.paymode?.toUpperCase() ?? ''] ?? (e.paymode || 'ATM')} />
            </div>

            {/* Government IDs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <GovIdTile icon={Landmark} label="GSIS BP No" value={e.gsis_id || '—'} />
              <GovIdTile icon={Wallet} label="PHIC ID" value={e.phic_id || '—'} />
              <GovIdTile icon={Building2} label="HDMF ID" value={e.hdmf_id || '—'} />
              <GovIdTile icon={FileText} label="TIN NO" value={e.tin || '—'} />
            </div>

            {/* Salary & Deductions split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Earnings */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Earnings</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <AmountRow label="Basic Salary" value={currency(e.basic ?? e.basic_salary)} />
                  {(() => {
                    const official = lookupSalary(e.grade ?? 0, e.step ?? 0);
                    const actual = e.basic ?? e.basic_salary ?? 0;
                    if (official == null) return null;
                    const diff = actual - official;
                    if (Math.abs(diff) < 0.01) {
                      return <AmountRow label={`Schedule Rate (${schedMeta?.circular_no ?? ''})`} value={currency(official)} valueColor="text-emerald-600" />;
                    }
                    return (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-600">Schedule rate ({schedMeta?.circular_no ?? ''})</span>
                        <span className={diff > 0 ? 'text-amber-600 font-medium tabular' : 'text-rose-600 font-medium tabular'}>
                          {currency(official)} ({diff > 0 ? '+' : ''}{currency(diff)})
                        </span>
                      </div>
                    );
                  })()}
                  <AmountRow label="P.E.R.A." value={currency(e.pera)} />
                  {(e.rata ?? 0) > 0 && <AmountRow label="RATA" value={currency(e.rata)} />}
                  {(e.aca ?? 0) > 0 && <AmountRow label="ACA" value={currency(e.aca)} />}
                  {(e.ontop ?? 0) > 0 && <AmountRow label="ONTOP" value={currency(e.ontop)} />}
                  {(e.long ?? 0) > 0 && <AmountRow label="Longevity" value={currency(e.long)} />}
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <AmountRow label="Gross Compensation" value={currency(gross)} bold valueColor="text-slate-900" />
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deductions</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <AmountRow label="GSIS Life & Ret" value={currency(computed.dedlnr)} />
                  <AmountRow label="MEDICARE" value={currency(computed.dedmed)} />
                  <AmountRow label="PAG-IBIG" value={currency(computed.dedpag)} />
                  <AmountRow label="W/holding Tax" value={currency(computed.dedtax)} />
                  <div className="border-t border-slate-200 pt-2 mt-1">
                    <AmountRow label="Mandatory Deductions" value={currency(mandatoryDed)} bold valueColor="text-brand-700" />
                  </div>
                  {loanDedsDisplay > 0 && (
                    <AmountRow label="Loan Deductions" value={currency(loanDedsDisplay)} valueColor="text-slate-700" />
                  )}
                  <div className="border-t border-slate-200 pt-2 mt-1">
                    <AmountRow label="Total Deductions" value={currency(totalDed)} bold valueColor="text-rose-600" />
                    <p className="text-[10px] text-slate-400 mt-0.5">Mandatory ({currency(mandatoryDed)}) + Loans ({currency(loanDedsDisplay)})</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Pay highlight bar */}
            <div className="flex items-center justify-between px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-emerald-900">NET PAY</span>
              </div>
              <span className={`text-2xl font-bold tabular ${netPay >= 5000 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {currency(netPay)}
              </span>
            </div>

            {/* Loan Deductions Detail — only applied (deducted) deductions */}
            {appliedDeds.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loan Deductions Detail ({appliedDeds.length} records)</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {appliedDeds.map((d) => {
                    const codeInfo = dedCodeMap.get(d.dedcode);
                    return (
                      <div key={d.id} className="px-4 py-2.5 grid grid-cols-[70px_1fr_100px_90px] gap-x-3 text-xs items-center hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-semibold text-brand-700">{d.dedcode}</span>
                          {!codeInfo && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Code not found in deduction codes lookup" />}
                        </div>
                        <span className={`truncate ${!codeInfo ? 'text-amber-600' : 'text-slate-600'}`}>{codeInfo?.dedname ?? `${d.dedcode} (unknown code)`}</span>
                        <span className="text-slate-400 truncate text-right">{d.policyno || '—'}</span>
                        <span className="font-semibold text-slate-700 text-right tabular">{currency(d.dedamt)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 grid grid-cols-[70px_1fr_100px_90px] gap-x-3 text-xs items-center">
                  <span className="col-span-3 font-semibold text-slate-600">Total Loan Deductions Applied:</span>
                  <span className="font-bold text-slate-800 text-right tabular">{currency(appliedDeds.reduce((sum, d) => sum + (Number(d.dedamt) || 0), 0))}</span>
                </div>
              </div>
            )}

            {/* NTHP Compliance Section */}
            <div className={`rounded-xl p-5 border ${nthpStatus === 'PASS' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {nthpStatus === 'PASS' ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-600" />
                  )}
                  <span className="font-semibold text-slate-800">NTHP Compliance</span>
                  <span className="text-xs text-slate-400">(DepEd Order No. 05, s. 2018)</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  nthpStatus === 'PASS' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'
                }`}>
                  {nthpStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <NthpMetric label="Net Pay Before Loans" value={currency(netPayBeforeLoans)} />
                <NthpMetric label="Actual Loan Deductions" value={currency(actualLoanDeductionsApplied)} />
                <NthpMetric label="Undeducted Obligations" value={currency(totalUndeductedAmount)} color="text-amber-600" />
                <NthpMetric label="Final Net Pay" value={currency(finalNetPay)} color={finalNetPay >= 5000 ? 'text-emerald-600' : 'text-rose-600'} bold />
              </div>
              <p className="text-xs text-slate-400 mt-3">NTHP Floor: ₱{NTHP_THRESHOLD.toFixed(2)} — loan deductions are skipped if they would bring net pay below this threshold.</p>

              {undeductedObs.length > 0 && (
                <div className="mt-4 pt-3 border-t border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wider">
                    Undeducted Obligations ({undeductedObs.length} items)
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {undeductedObs.map((u) => (
                      <div key={u.id} className="flex items-center justify-between text-xs bg-white/60 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-amber-700 shrink-0">{u.deduction_code}</span>
                          <span className="text-slate-600 truncate">{u.deduction_description}</span>
                        </div>
                        <span className="font-bold text-amber-600 tabular shrink-0 ml-2">{currency(u.undeducted_amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400 tracking-wider font-medium uppercase">
              Payroll Record — {period?.period_name ?? 'All Periods'}
            </p>
          </div>
        </div>
      </div>
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

function NthpMetric({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`${bold ? 'font-bold text-base' : 'font-medium'} tabular ${color ?? 'text-slate-700'}`}>{value}</p>
    </div>
  );
}
