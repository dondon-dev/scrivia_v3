import { useState, useEffect } from 'react';
import { Wallet, TrendingUp, Landmark, FileText, Calendar, User, Building2, BadgePercent, Receipt, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { currency } from '@/lib/reports';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import type { UserProfile } from '@/types/auth';
import type { Employee, PayrollEntry, PayPeriod, PayrollDeduction, DeductionCode } from '@/types/payroll';

interface EssDashboardProps {
  profile: UserProfile;
}

export default function EssDashboard({ profile }: EssDashboardProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [deductions, setDeductions] = useState<PayrollDeduction[]>([]);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<PayrollEntry | null>(null);
  const { lookup: lookupSalary, meta: schedMeta } = useSalarySchedule();

  useEffect(() => {
    let active = true;
    (async () => {
      const empno = profile.employee_number ?? profile.username;
      if (!empno) {
        if (active) { setError('No employee number linked to your account. Contact your administrator.'); setLoading(false); }
        return;
      }

      try {
        const { data: empData, error: empErr } = await supabase
          .from('employees')
          .select('*')
          .or(`empno.eq.${empno},employee_number.eq.${empno}`)
          .maybeSingle();

        if (empErr) throw empErr;
        if (!empData) {
          if (active) { setError('Your employee record was not found. Contact your administrator.'); setLoading(false); }
          return;
        }

        const emp = empData as Employee;

        const [entRes, perRes, dedRes, codeRes] = await Promise.all([
          supabase.from('payroll_entries').select('*').eq('employee_id', emp.id).order('processed_at', { ascending: false }),
          supabase.from('pay_periods').select('*').order('start_date', { ascending: false }),
          supabase.from('payroll_deductions').select('*').eq('empno', empno).order('dedcode'),
          supabase.from('deduction_codes').select('*'),
        ]);

        if (!active) return;

        setEmployee(emp);
        setEntries((entRes.data ?? []) as PayrollEntry[]);
        setPeriods((perRes.data ?? []) as PayPeriod[]);
        setDeductions((dedRes.data ?? []) as PayrollDeduction[]);
        setDedCodes((codeRes.data ?? []) as DeductionCode[]);
        setLoading(false);
      } catch {
        if (active) { setError('Unable to load your payroll data. Please try again later.'); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [profile]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading your dashboard…</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <User className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-sm font-medium text-slate-700">{error}</p>
      </div>
    );
  }

  if (!employee) return null;

  const periodMap = new Map(periods.map((p) => [p.id, p]));
  const latestEntry = entries[0] ?? null;
  const latestPeriod = latestEntry ? periodMap.get(latestEntry.pay_period_id) : null;
  const activeDeds = deductions.filter((d) => d.status === 'Active');
  const totalMonthlyDeduction = activeDeds.reduce((s, d) => s + Number(d.dedamt), 0);
  const ytdGross = entries.reduce((s, e) => s + e.gross_pay, 0);
  const ytdNet = entries.reduce((s, e) => s + e.net_pay, 0);
  const ytdTax = entries.reduce((s, e) => s + e.dedtax, 0);

  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));
  const fname = employee.fname || employee.first_name || profile.first_name;
  const lname = employee.lname || employee.last_name || profile.last_name;

  const mandatoryBreakdown = latestEntry ? [
    { label: 'GSIS (LNR)', amount: latestEntry.dedlnr },
    { label: 'PhilHealth (MED)', amount: latestEntry.dedmed },
    { label: 'Pag-IBIG (PAG)', amount: latestEntry.dedpag },
    { label: 'Withholding Tax', amount: latestEntry.dedtax },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Employee Self-Service</p>
            <h2 className="text-xl font-semibold mt-0.5">{fname} {lname}</h2>
            <p className="text-sm text-slate-300 mt-0.5">{employee.poscode || employee.position || '—'} · Emp. No. {employee.empno || employee.employee_number}</p>
          </div>
        </div>
        {latestPeriod && (
          <div className="text-right">
            <p className="text-xs text-slate-400">Latest Pay Period</p>
            <p className="text-sm font-medium text-slate-200">{latestPeriod.period_name}</p>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard icon={Wallet} color="bg-emerald-500" label="Latest Net Pay" value={latestEntry ? currency(latestEntry.net_pay) : '—'} sub={latestPeriod ? latestPeriod.period_name : 'No payroll yet'} />
        <SummaryCard icon={TrendingUp} color="bg-blue-500" label="YTD Gross Earnings" value={currency(ytdGross)} sub={`${entries.length} pay period(s)`} />
        <SummaryCard icon={Landmark} color="bg-amber-500" label="YTD Net Earnings" value={currency(ytdNet)} sub="After all deductions" />
        <SummaryCard icon={Receipt} color="bg-rose-500" label="YTD Tax Withheld" value={currency(ytdTax)} sub="Withholding tax" />
      </div>

      {/* Latest payslip breakdown + Active deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payslip breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Latest Payslip Breakdown</h3>
          </div>
          {latestEntry ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between col-span-2 pb-2 border-b border-slate-100">
                  <span className="text-slate-500">Gross Pay</span>
                  <span className="font-semibold text-slate-800">{currency(latestEntry.gross_pay)}</span>
                </div>
                {mandatoryBreakdown.filter((m) => m.amount > 0).map((m) => (
                  <div key={m.label} className="flex justify-between">
                    <span className="text-slate-500">{m.label}</span>
                    <span className="font-medium text-rose-600">-{currency(m.amount)}</span>
                  </div>
                ))}
                {latestEntry.other_deductions > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Other Deductions</span>
                    <span className="font-medium text-rose-600">-{currency(latestEntry.other_deductions)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-100 col-span-2">
                  <span className="font-medium text-slate-700">Total Deductions</span>
                  <span className="font-semibold text-rose-600">-{currency(latestEntry.total_deductions)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-emerald-200 col-span-2">
                  <span className="font-semibold text-slate-800">Net Pay</span>
                  <span className="font-bold text-emerald-600 text-lg">{currency(latestEntry.net_pay)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-6 text-center">No payroll entries yet.</p>
          )}
        </div>

        {/* Active deductions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Active Deductions</h3>
          </div>
          {activeDeds.length > 0 ? (
            <div className="space-y-2.5">
              {activeDeds.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-semibold shrink-0">{d.dedcode}</span>
                    <span className={`truncate ${!dedCodeMap.get(d.dedcode) ? 'text-amber-600' : 'text-slate-600'}`}>{dedCodeMap.get(d.dedcode)?.dedname ?? `${d.dedcode} (unknown)`}</span>
                  </div>
                  <span className="tabular-nums font-medium text-slate-700 shrink-0 ml-2">{currency(Number(d.dedamt))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 font-semibold">
                <span className="text-slate-800">Total Monthly Deduction</span>
                <span className="text-rose-600">{currency(totalMonthlyDeduction)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-6 text-center">No active deductions.</p>
          )}
        </div>
      </div>

      {/* Employment info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard icon={Building2} label="Station / School" value={employee.stacode || '—'} />
        <InfoCard icon={BadgePercent} label="Salary Grade" value={employee.grade ? `SG ${employee.grade}, Step ${employee.step}` : '—'} />
        <InfoCard icon={Wallet} label="Basic Salary" value={currency(employee.basic || employee.basic_salary)} />
        {(() => {
          const official = lookupSalary(employee.grade ?? 0, employee.step ?? 0);
          if (official == null) return null;
          return <InfoCard icon={BadgePercent} label={`Schedule Rate (${schedMeta?.circular_no ?? ''})`} value={currency(official)} />;
        })()}
        <InfoCard icon={Calendar} label="Pay Mode" value={employee.paymode || '—'} />
      </div>

      {/* Payroll history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Clock className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Payroll History</h3>
        </div>
        {entries.length > 0 ? (
          <div className="divide-y divide-slate-100">
            <div className="grid grid-cols-4 gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50">
              <span>Pay Period</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Deductions</span>
              <span className="text-right">Net Pay</span>
            </div>
            {entries.map((e) => {
              const period = periodMap.get(e.pay_period_id);
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEntry(e)}
                  className="w-full grid grid-cols-4 gap-2 px-5 py-3 text-sm hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="text-slate-700 font-medium truncate">{period?.period_name ?? 'Unknown period'}</span>
                  <span className="text-right text-slate-600 tabular-nums">{currency(e.gross_pay)}</span>
                  <span className="text-right text-rose-500 tabular-nums">-{currency(e.total_deductions)}</span>
                  <span className="text-right text-emerald-600 font-semibold tabular-nums">{currency(e.net_pay)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-slate-400 text-sm">No payroll history yet.</p>
        )}
      </div>

      {/* Payslip detail modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Payslip Details</h3>
              <button onClick={() => setSelectedEntry(null)} className="text-slate-400 hover:text-slate-600 text-sm">Close</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Pay Period</span><span className="font-medium text-slate-700">{periodMap.get(selectedEntry.pay_period_id)?.period_name ?? '—'}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-500">Gross Pay</span><span className="font-medium text-slate-700">{currency(selectedEntry.gross_pay)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">GSIS</span><span className="text-rose-600">-{currency(selectedEntry.dedlnr)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">PhilHealth</span><span className="text-rose-600">-{currency(selectedEntry.dedmed)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Pag-IBIG</span><span className="text-rose-600">-{currency(selectedEntry.dedpag)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Withholding Tax</span><span className="text-rose-600">-{currency(selectedEntry.dedtax)}</span></div>
              {selectedEntry.other_deductions > 0 && <div className="flex justify-between"><span className="text-slate-500">Other Deductions</span><span className="text-rose-600">-{currency(selectedEntry.other_deductions)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-500">Total Deductions</span><span className="font-semibold text-rose-600">-{currency(selectedEntry.total_deductions)}</span></div>
              <div className="flex justify-between pt-2 border-t-2 border-emerald-200"><span className="font-semibold text-slate-800">Net Pay</span><span className="font-bold text-emerald-600 text-lg">{currency(selectedEntry.net_pay)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, color, label, value, sub }: {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-slate-800 mt-1">{value}</p>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-4 h-4 text-slate-400" />
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
