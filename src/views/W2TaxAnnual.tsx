import { useState } from 'react';
import { FileText, Download, Calculator, Building2, User, Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { computeW2Tax, TAX_EXEMPTIONS } from '@/lib/govPayrollComputation';

/** BIR Form 2316 field groupings (Annual Compensation Income Tax Return) */
interface Bir2316Row {
  empNo: string;
  name: string;
  tin: string;
  // Part II — Taxable Income
  compensationIncome: number;   // Line 21: Gross Compensation
  nonTaxable: number;           // Tax-exempt portions (de minimis, etc.)
  totalDeductions: number;      // GSIS + PhilHealth + Pag-IBIG mandatory
  personalExemption: number;    // ₱250,000 TRAIN Law threshold
  taxableIncome: number;        // Line 22: Taxable Income
  // Part III — Tax Due
  annualTaxDue: number;         // Line 23: Tax Due
  taxPaid: number;              // Line 24: Total Tax Withheld
  taxPayable: number;           // Line 25: Tax Payable / (Refund)
  isRefund: boolean;
}

export default function W2TaxAnnual() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Bir2316Row[]>([]);
  const [summary, setSummary] = useState<{
    totalEmployees: number;
    totalCompensation: number;
    totalTaxable: number;
    totalTaxDue: number;
    totalTaxPaid: number;
    totalPayable: number;
    totalRefunds: number;
  } | null>(null);

  async function compute() {
    if (!year || year.length !== 4) { alert('Enter a valid 4-digit year'); return; }
    setLoading(true);
    try {
      const { data: entries } = await supabase
        .from('payroll_entries')
        .select('employee_id, gross_pay, net_pay, dedlnr, dedmed, dedpag, dedtax, status')
        .eq('status', 'Computed');

      if (!entries?.length) { setResults([]); setSummary(null); setLoading(false); return; }

      const empMap = new Map<string, any[]>();
      for (const e of entries) {
        const arr = empMap.get(e.employee_id) ?? [];
        arr.push(e);
        empMap.set(e.employee_id, arr);
      }

      const uniqueIds = [...empMap.keys()];
      const { data: empData } = await supabase
        .from('employees')
        .select('id, empno, employee_number, fname, first_name, lname, last_name, mi, tin, basic, basic_salary, govtlnr, govtmed, govtpag')
        .in('id', uniqueIds);
      const empLookup = new Map((empData ?? []).map((e: any) => [e.id, e]));

      const rows: Bir2316Row[] = [];
      let grandComp = 0, grandTaxable = 0, grandTaxDue = 0, grandTaxPaid = 0, grandPayable = 0, grandRefund = 0;

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
            taxCode: '01',
          }))
        );

        const emp = empLookup.get(empId) ?? {};
        const empNo = emp.empno ?? emp.employee_number ?? empId;
        const fname = emp.fname ?? emp.first_name ?? '';
        const lname = emp.lname ?? emp.last_name ?? '';

        const row: Bir2316Row = {
          empNo,
          name: `${lname}, ${fname} ${emp.mi ?? ''}`.trim(),
          tin: emp.tin ?? '',
          compensationIncome: computation.totalBasic,
          nonTaxable: 0,
          totalDeductions: computation.totalLnr + computation.totalMed + computation.totalPag,
          personalExemption: computation.exemption,
          taxableIncome: computation.taxableIncome,
          annualTaxDue: computation.annualTaxDue,
          taxPaid: computation.totalTaxPaid,
          taxPayable: computation.taxPayable,
          isRefund: computation.isRefund,
        };

        rows.push(row);
        grandComp += row.compensationIncome;
        grandTaxable += row.taxableIncome;
        grandTaxDue += row.annualTaxDue;
        grandTaxPaid += row.taxPaid;
        if (row.isRefund) grandRefund += Math.abs(row.taxPayable);
        else grandPayable += row.taxPayable;
      }

      rows.sort((a, b) => a.empNo.localeCompare(b.empNo));
      setResults(rows);
      setSummary({
        totalEmployees: rows.length,
        totalCompensation: grandComp,
        totalTaxable: grandTaxable,
        totalTaxDue: grandTaxDue,
        totalTaxPaid: grandTaxPaid,
        totalPayable: grandPayable,
        totalRefunds: grandRefund,
      });
    } catch {
      alert('Failed to compute BIR Form 2316 data');
    }
    setLoading(false);
  }

  function exportCsv() {
    if (!results.length) return;
    const headers = ['Emp No.', 'Name', 'TIN', 'Compensation Income', 'Non-Taxable', 'Total Deductions', 'Personal Exemption', 'Taxable Income', 'Annual Tax Due', 'Tax Withheld', 'Tax Payable/(Refund)'];
    const rows = results.map(r => [
      r.empNo, r.name, r.tin, r.compensationIncome, r.nonTaxable, r.totalDeductions,
      r.personalExemption, r.taxableIncome, r.annualTaxDue, r.taxPaid, r.taxPayable,
    ]);
    const totals = ['', 'TOTAL', '', results.reduce((s, r) => s + r.compensationIncome, 0),
      0, results.reduce((s, r) => s + r.totalDeductions, 0), 0,
      results.reduce((s, r) => s + r.taxableIncome, 0),
      results.reduce((s, r) => s + r.annualTaxDue, 0),
      results.reduce((s, r) => s + r.taxPaid, 0),
      results.reduce((s, r) => s + r.taxPayable, 0)];
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const allRows = [headers, ...rows.map(r => r.map(escape)), totals.map(escape)];
    const content = new TextEncoder().encode(allRows.map(r => r.join(',')).join('\n'));
    downloadFile({ filename: `BIR_Form_2316_${year}.csv`, content, mimeType: 'text/csv' });
  }

  const fmt = (v: number) => `₱${Math.abs(Number(v || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Building2 size={24} /> BIR Form 2316
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Annual Income Tax Return for Individuals Receiving Purely Compensation Income — {year}
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
              placeholder="2026"
              maxLength={4}
            />
          </div>
          <button
            onClick={compute}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Calculator size={15} />}
            Compute Form 2316
          </button>
          {results.length > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Download size={14} /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Employees" value={String(summary.totalEmployees)} />
          <SummaryCard label="Total Compensation" value={fmt(summary.totalCompensation)} />
          <SummaryCard label="Total Tax Due" value={fmt(summary.totalTaxDue)} color="red" />
          <SummaryCard label="Total Tax Withheld" value={fmt(summary.totalTaxPaid)} color="green" />
        </div>
      )}

      {/* BIR Form 2316 Results Table */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-deped-50 to-white dark:from-deped-900/20 dark:to-slate-900">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <FileText size={18} /> BIR Form 2316 — {year}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Annual Income Tax Return for Compensation Income Earners</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-3 py-2">Emp No.</th>
                  <th className="px-3 py-2">Employee Name</th>
                  <th className="px-3 py-2">TIN</th>
                  <th className="px-3 py-2 text-right">Compensation<br/>Income</th>
                  <th className="px-3 py-2 text-right">Total<br/>Deductions</th>
                  <th className="px-3 py-2 text-right">Personal<br/>Exemption</th>
                  <th className="px-3 py-2 text-right">Taxable<br/>Income</th>
                  <th className="px-3 py-2 text-right">Annual<br/>Tax Due</th>
                  <th className="px-3 py-2 text-right">Tax<br/>Withheld</th>
                  <th className="px-3 py-2 text-right">Tax Payable /<br/>(Refund)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-xs">{r.empNo}</td>
                    <td className="px-3 py-2 font-medium text-sm">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tin}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.compensationIncome)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.totalDeductions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.personalExemption)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(r.taxableIncome)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{fmt(r.annualTaxDue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-600">{fmt(r.taxPaid)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.isRefund ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(r.taxPayable)} {r.isRefund ? '(Refund)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-sm">
                <tr>
                  <td className="px-3 py-3" colSpan={3}>TOTAL ({results.length} employees)</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(results.reduce((s, r) => s + r.compensationIncome, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(results.reduce((s, r) => s + r.totalDeductions, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums" colSpan={1}></td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(results.reduce((s, r) => s + r.taxableIncome, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-600">{fmt(summary?.totalTaxDue ?? 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-green-600">{fmt(summary?.totalTaxPaid ?? 0)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${(summary?.totalPayable ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(summary?.totalPayable ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TRAIN Law Tax Brackets Reference */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Landmark size={16} /> TRAIN Law Annual Tax Brackets (Revenue Regulations No. 29-2025)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Not over ₱250,000</span>
            <span className="font-semibold">Exempt</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Over ₱250,000 — ₱400,000</span>
            <span className="font-semibold">15%</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Over ₱400,000 — ₱800,000</span>
            <span className="font-semibold">₱30,000 + 20% of excess over ₱400,000</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Over ₱800,000 — ₱2,000,000</span>
            <span className="font-semibold">₱130,000 + 25% of excess over ₱800,000</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Over ₱2,000,000 — ₱8,000,000</span>
            <span className="font-semibold">₱490,000 + 30% of excess over ₱2,000,000</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-slate-600 dark:text-slate-400">Over ₱8,000,000</span>
            <span className="font-semibold">₱2,410,000 + 35% of excess over ₱8,000,000</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Personal exemption: ₱250,000 annually (TRAIN Law). Mandatory deductions: GSIS, PhilHealth, Pag-IBIG.</p>
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

function downloadFile({ filename, content, mimeType }: { filename: string; content: Uint8Array; mimeType: string }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
