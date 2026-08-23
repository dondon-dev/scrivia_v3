import { useState } from 'react';
import { FileText, Download, Calculator, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { computeW2Tax, TAX_EXEMPTIONS } from '@/lib/govPayrollComputation';


export default function W2TaxAnnual() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  async function computeW2() {
    if (!year || year.length !== 4)      { alert('Enter a valid 4-digit year'); return; }
    setLoading(true);
    try {
      // Fetch all payroll entries for the year
      const { data: entries } = await supabase
        .from('payroll_entries')
        .select('employee_id, gross_pay, net_pay, dedlnr, dedmed, dedpag, dedtax, status')
        .eq('status', 'Computed');

      if (!entries) { setResults([]); setLoading(false); return; }

      // Group by employee_id
      const empMap = new Map<string, any[]>();
      for (const e of entries) {
        const empId = e.employee_id;
        if (!empMap.has(empId)) empMap.set(empId, []);
        empMap.get(empId)!.push(e);
      }
      // Fetch employees for name lookup
      const uniqueIds = [...empMap.keys()];
      const { data: empData } = await supabase
        .from('employees')
        .select('id, empno, employee_number, fname, first_name, lname, last_name, mi, tin')
        .in('id', uniqueIds);
      const empLookup = new Map((empData || []).map((e: any) => [e.id, e]));

      const w2Results: any[] = [];
      let grandTotalTax = 0;
      let grandTotalPaid = 0;
      let totalRefunds = 0;
      let totalPayable = 0;

      for (const [empId, empRecords] of empMap) {
        const computation = computeW2Tax(
          empRecords.map(r => ({
            basic: Number(r.gross_pay) || 0,
            trans: 0,
            aca: 0,
            dedLnr: Number(r.dedlnr) || 0,
            dedMed: Number(r.dedmed) || 0,
            dedPag: Number(r.dedpag) || 0,
            dedTax: Number(r.dedtax) || 0,
            taxCode: '01', // default
          }))
        );

        const empInfo = empLookup.get(empId) || {};
        const empNo = empInfo.empno || empInfo.employee_number || empId;
        const fname = empInfo.fname || empInfo.first_name || '';
        const lname = empInfo.lname || empInfo.last_name || '';
        const taxCode = '01';
        const entry = {
          empNo,
          name: `${lname}, ${fname} ${empInfo.mi || ''}`,
          tin: empInfo.tin || '',
          ...computation,
        };

        w2Results.push(entry);
        grandTotalTax += computation.annualTaxDue;
        grandTotalPaid += computation.totalTaxPaid;
        if (computation.isRefund) totalRefunds += Math.abs(computation.taxPayable);
        else totalPayable += computation.taxPayable;
      }

      w2Results.sort((a, b) => a.empNo.localeCompare(b.empNo));
      setResults(w2Results);
      setSummary({
        totalEmployees: w2Results.length,
        grandTotalTaxDue: grandTotalTax,
        grandTotalTaxPaid: grandTotalPaid,
        totalPayable,
        totalRefunds,
      });
      alert(`W-2 computed for ${w2Results.length} employees`);
    } catch {
      alert('Failed to compute W-2 data');
    }
    setLoading(false);
  }

  const fmt = (v: number) => `₱${Math.abs(Number(v || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">W-2 Annual Tax Computation</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Annual withholding tax reconciliation — COMPUTAX.PRG / W2SUM.PRG
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tax Year</label>
            <input
              value={year}
              onChange={e => setYear(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-28 font-mono"
              placeholder="2024"
              maxLength={4}
            />
          </div>
          <button
            onClick={computeW2}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Calculator size={15} />}
            Compute W-2
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard label="Employees" value={String(summary.totalEmployees)} />
          <SummaryCard label="Total Tax Due" value={fmt(summary.grandTotalTaxDue)} color="red" />
          <SummaryCard label="Total Tax Paid" value={fmt(summary.grandTotalTaxPaid)} color="green" />
          <SummaryCard label="Still Payable" value={fmt(summary.totalPayable)} color="red" />
          <SummaryCard label="Total Refunds" value={fmt(summary.totalRefunds)} color="green" />
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <FileText size={18} /> W-2 Tax Computation — Year {year}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-3 py-2">Emp No.</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">TIN</th>
                  <th className="px-3 py-2 text-right">Total Income</th>
                  <th className="px-3 py-2 text-right">Exemption</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Taxable Income</th>
                  <th className="px-3 py-2 text-right">Tax Due</th>
                  <th className="px-3 py-2 text-right">Tax Paid</th>
                  <th className="px-3 py-2 text-right">Payable / (Refund)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-xs">{r.empNo}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tin}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.totalBasic)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.exemption)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.totalLnr + r.totalMed + r.totalPag)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(r.taxableIncome)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(r.annualTaxDue)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{fmt(r.totalTaxPaid)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.isRefund ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(r.taxPayable)} {r.isRefund ? '(Refund)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 font-bold">
                <tr>
                  <td className="px-3 py-3" colSpan={3}>TOTAL ({results.length} employees)</td>
                  <td className="px-3 py-3 text-right">{fmt(results.reduce((s, r) => s + r.totalBasic, 0))}</td>
                  <td className="px-3 py-3 text-right" colSpan={3}></td>
                  <td className="px-3 py-3 text-right text-red-600">{fmt(summary?.grandTotalTaxDue)}</td>
                  <td className="px-3 py-3 text-right text-green-600">{fmt(summary?.grandTotalTaxPaid)}</td>
                  <td className={`px-3 py-3 text-right ${(summary?.totalPayable || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(summary?.totalPayable || 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Reference: Tax Exemption Codes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100">Reference: Tax Exemption Codes (BIR)</h2>
        <p className="text-xs text-slate-500 mb-3">From W2SUM.PRG — exemption amounts per tax code for annual W-2 computation</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(TAX_EXEMPTIONS).map(([code, info]) => (
            <div key={code} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs">
              <span className="font-mono font-bold text-deped-700 dark:text-deped-400 min-w-[1.5rem]">{code}</span>
              <span className="text-slate-600 dark:text-slate-400 flex-1">{info.desc}</span>
              <span className="font-semibold">₱{info.annualExemption.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color = 'slate' }: { label: string; value: string; color?: string }) {
  const colorMap: Record<string, string> = {
    red: 'text-red-600 dark:text-red-400',
    green: 'text-green-600 dark:text-green-400',
    slate: 'text-slate-800 dark:text-slate-100',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
