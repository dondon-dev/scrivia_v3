import { useState } from 'react';
import { Shield, FileText, Calculator, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { computeGSISLifeRetirement, computeGovtLifeRetirement, computeGovtECC, GSIS_LOAN_TYPES, GSIS_PREMIUM_TYPES } from '@/lib/govPayrollComputation';
import { exportGsisRemittanceExcel, buildLoanBillingRecords, type PremiumRecord, type LoanBillingRecord } from '@/lib/gsisRemittanceExport';


export default function GsisDashboard() {
  const [period, setPeriod] = useState('');
  const [activeTab, setActiveTab] = useState<'premiums' | 'remittance' | 'loans'>('premiums');
  const [loading, setLoading] = useState(false);
  const [premiums, setPremiums] = useState<any>(null);
  const [remittance, setRemittance] = useState<any>(null);
  const [loanData, setLoanData] = useState<any>(null);
  const [premiumsList, setPremiumsList] = useState<PremiumRecord[]>([]);
  const [loanBillingRecords, setLoanBillingRecords] = useState<LoanBillingRecord[]>([]);
  const [exporting, setExporting] = useState(false);

  async function fetchPremiums() {
    if (!period) {      alert('Enter a period (MM/YYYY)'); return; }
    setLoading(true);
    try {
      // Fetch active employees with their basic salary and stacode
      const { data: emps } = await supabase
        .from('employees')
        .select('id, empno, employee_number, fname, first_name, lname, last_name, mi, basic, basic_salary, stacode')
        .eq('status', 'Active')
        .order('lname', { ascending: true });

      if (!emps || emps.length === 0) { setPremiums(null); setLoading(false); return; }

      const premiumsList = emps.map((e: any) => {
        const basic = Number(e.basic || e.basic_salary) || 0;
        const lnr = computeGSISLifeRetirement(basic);
        const govtLnr = computeGovtLifeRetirement(basic);
        const ecc = computeGovtECC();
        const empNo = e.empno || e.employee_number || '';
        const fname = e.fname || e.first_name || '';
        const lname = e.lname || e.last_name || '';
        return {
          empNo,
          name: `${lname}, ${fname} ${e.mi || ''}`,
          basic,
          personalShare: lnr,
          governmentShare: govtLnr,
          ecContribution: ecc,
          staCode: e.stacode || '',
        };
      });

      const totals = premiumsList.reduce(
        (acc: any, p: any) => ({
          totalPs: acc.totalPs + p.personalShare,
          totalGs: acc.totalGs + p.governmentShare,
          totalEc: acc.totalEc + p.ecContribution,
          count: acc.count + 1,
        }),
        { totalPs: 0, totalGs: 0, totalEc: 0, count: 0 }
      );

      setPremiums({ premiums: premiumsList, totals });
      setPremiumsList(premiumsList);
    } catch {
      alert('Failed to compute premiums');
    }
    setLoading(false);
  }

  async function fetchRemittance() {
    if (!period) {      alert('Enter a period'); return; }
    setLoading(true);
    try {
      // Try gsis_billing first, fall back to deductions table
      let billings: any[] = [];
      const { data: billingData, error: billingErr } = await supabase
        .from('gsis_billing')
        .select('*')
        .eq('due_month', period);

      if (!billingErr && billingData) {
        billings = billingData;
      } else {
        // Fallback: sum deductions by deduction_code from the deductions table
        const { data: deds } = await supabase
          .from('deductions')
          .select('deduction_code, deduction_name, amount');
        if (deds) {
          billings = deds.map((d: any) => ({
            account: d.deduction_code || 'Unknown',
            amount: Number(d.amount) || 0,
          }));
        }
      }

      const summary: Record<string, number> = {};
      let total = 0;
      for (const b of billings) {
        const acct = b.account || 'Unknown';
        summary[acct] = (summary[acct] || 0) + Number(b.amount);
        total += Number(b.amount);
      }

      setRemittance({ period, accounts: summary, grandTotal: total });
      const loanBillings = billings.filter((b: any) => GSIS_LOAN_TYPES[b.account?.trim()]);
      setLoanBillingRecords(buildLoanBillingRecords(loanBillings));
    } catch {
      alert('Failed to load remittance data');
    }
    setLoading(false);
  }

  async function fetchLoans() {
    setLoading(true);
    try {
      let billings: any[] = [];
      const { data: billingData, error: billingErr } = await supabase
        .from('gsis_billing')
        .select('*');

      if (!billingErr && billingData) {
        billings = billingData;
      } else {
        // Fallback: use deductions table
        const { data: deds } = await supabase
          .from('deductions')
          .select('deduction_code, deduction_name, amount');
        if (deds) {
          billings = deds.map((d: any) => ({
            account: d.deduction_code || 'Unknown',
            amount: Number(d.amount) || 0,
          }));
        }
      }

      const loanTypes = Object.keys(GSIS_LOAN_TYPES);
      const summary: Record<string, number> = {};
      for (const b of billings) {
        const acct = b.account?.trim() || 'Unknown';
        if (loanTypes.includes(acct)) {
          summary[acct] = (summary[acct] || 0) + Number(b.amount);
        }
      }

      setLoanData({ loanTypes: summary });
      setLoanBillingRecords(buildLoanBillingRecords(billings.map((b: any) => ({ account: b.account || '', amount: Number(b.amount) || 0 }))));
    } catch {
      alert('Failed to load loan data');
    }
    setLoading(false);
  }

  async function handleExportExcel() {
    if (!period) { alert('Load data first by clicking Compulsory Premiums, Agency Remittance, or Loan Summary.'); return; }
    if (premiumsList.length === 0) { alert('No premium data loaded. Click Compulsory Premiums first.'); return; }
    setExporting(true);
    try {
      const totals = premiums?.totals || { totalPs: 0, totalGs: 0, totalEc: 0, employeeCount: 0 };
      await exportGsisRemittanceExcel({
        premiums: premiumsList,
        loanBilling: loanBillingRecords.length > 0 ? loanBillingRecords : [],
        totals,
        period,
      });
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    setExporting(false);
  }

  const fmt = (v: number) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">GSIS Module</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          GSIS contributions, remittance summaries, and loan processing — migrated from payroll-modern
        </p>
      </div>

      {/* Period + Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Period (MM/YYYY)</label>
        <div className="flex flex-wrap gap-3 items-end">
          <input
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-44 font-mono"
            placeholder="e.g. 01/2024"
          />
          <button onClick={fetchPremiums} disabled={loading}
            className="px-4 py-2 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 transition-colors disabled:opacity-50 flex items-center gap-2">
            <Shield size={15} /> Compulsory Premiums
          </button>
          <button onClick={fetchRemittance} disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
            <FileText size={15} /> Agency Remittance
          </button>
          <button onClick={fetchLoans} disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
            <Calculator size={15} /> Loan Summary
          </button>
          {(premiums || remittance || loanData) && (
            <button onClick={handleExportExcel} disabled={exporting}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2 ml-auto">
              {exporting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Download size={15} />}
              Export to Excel
            </button>
          )}
        </div>
      </div>

      {/* Compulsory Premiums */}
      {premiums && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Shield size={18} /> Compulsory Premiums — {period}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatBox label="Personal Share (L&R)" value={fmt(premiums.totals?.totalPs)} color="blue" />
            <StatBox label="Government Share (L&R)" value={fmt(premiums.totals?.totalGs)} color="green" />
            <StatBox label="EC Contribution" value={fmt(premiums.totals?.totalEc)} color="amber" />
            <StatBox label="Employees" value={String(premiums.totals?.employeeCount || premiums.premiums?.length || 0)} color="slate" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">Emp No.</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Basic</th>
                  <th className="px-3 py-2 text-right">Personal (L&R)</th>
                  <th className="px-3 py-2 text-right">Govt (L&R)</th>
                  <th className="px-3 py-2 text-right">EC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {premiums.premiums?.map((p: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-xs">{p.empNo}</td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.basic)}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{fmt(p.personalShare)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{fmt(p.governmentShare)}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{fmt(p.ecContribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agency Remittance Summary */}
      {remittance && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <FileText size={18} /> Agency Remittance Summary — {remittance.period}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              {Object.entries(remittance.accounts).map(([account, amount]) => (
                <div key={account} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{GSIS_LOAN_TYPES[account] || GSIS_PREMIUM_TYPES[account] || account}</span>
                  <span className="font-medium">{fmt(amount as number)}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-5 h-fit">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Grand Total</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{fmt(remittance.grandTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loan Summary */}
      {loanData && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Calculator size={18} /> GSIS Loan Summary
          </h2>
          {Object.keys(loanData.loanTypes).length === 0 ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><AlertTriangle size={14} /> No loan billing data found.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(loanData.loanTypes).map(([type, amount]) => (
                <div key={type} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded mr-2">{type}</span>
                    {GSIS_LOAN_TYPES[type] || type}
                  </span>
                  <span className="font-semibold">{fmt(amount as number)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference: GSIS Account Types */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-500" /> Reference: GSIS Account Types
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(GSIS_PREMIUM_TYPES).map(([code, desc]) => (
            <div key={code} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded-lg text-xs">
              <span className="font-mono font-bold text-green-700 dark:text-green-400 min-w-[2rem]">{code}</span>
              <span className="text-slate-600 dark:text-slate-400">{desc}</span>
            </div>
          ))}
          {Object.entries(GSIS_LOAN_TYPES).map(([code, desc]) => (
            <div key={code} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400 min-w-[2rem]">{code}</span>
              <span className="text-slate-600 dark:text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/50',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50',
    slate: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className={`rounded-xl p-4 border ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
