import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Landmark,
  RotateCcw,
  FileDown,
  Printer,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Receipt,
  Info,
  Search,
  UserCheck,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import type { Employee } from '@/types/payroll';

const PERA_DEFAULT = 2000;

const TAX_BRACKETS = [
  { max: 20833, base: 0, rate: 0, label: '₱0 – ₱20,833', rateText: '0%' },
  { max: 33333, base: 0, rate: 0.15, label: '₱20,834 – ₱33,333', rateText: '15% of excess over ₱20,833' },
  { max: 66667, base: 1875, rate: 0.20, label: '₱33,334 – ₱66,667', rateText: '₱1,875 + 20% of excess over ₱33,333' },
  { max: 166667, base: 8541.67, rate: 0.25, label: '₱66,668 – ₱166,667', rateText: '₱8,541.67 + 25% of excess over ₱66,667' },
  { max: 666667, base: 33541.67, rate: 0.30, label: '₱166,668 – ₱666,667', rateText: '₱33,541.67 + 30% of excess over ₱166,667' },
  { max: Infinity, base: 183541.67, rate: 0.35, label: '₱666,668 and above', rateText: '₱183,541.67 + 35% of excess over ₱666,667' },
];

interface TaxResult {
  taxableIncome: number;
  withholdingTax: number;
  grossCompensation: number;
  totalDeductions: number;
  netPay: number;
  bracketIndex: number;
}

function computeTax(basic: number, gsis: number, philHealth: number, pagIbig: number, pera: number): TaxResult {
  const taxableIncome = Math.max(0, basic - gsis - philHealth - pagIbig);

  let withholdingTax = 0;
  let bracketIndex = 0;
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    if (taxableIncome <= TAX_BRACKETS[i].max) {
      bracketIndex = i;
      withholdingTax = TAX_BRACKETS[i].base + (taxableIncome - (i === 0 ? 0 : TAX_BRACKETS[i - 1].max)) * TAX_BRACKETS[i].rate;
      break;
    }
  }

  const grossCompensation = basic + pera;
  const totalDeductions = gsis + philHealth + pagIbig + withholdingTax;
  const netPay = grossCompensation - totalDeductions;

  return { taxableIncome, withholdingTax, grossCompensation, totalDeductions, netPay, bracketIndex };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
  autoFocus?: boolean;
}

function InputField({ label, value, onChange, placeholder, hint, autoFocus }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">
          ₱
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-right font-semibold tabular-nums focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

interface ResultRowProps {
  icon: typeof Receipt;
  label: string;
  value: number;
  variant?: 'default' | 'deduction' | 'highlight' | 'net';
}

function ResultRow({ icon: Icon, label, value, variant = 'default' }: ResultRowProps) {
  const styles = {
    default: 'text-slate-800',
    deduction: 'text-rose-600',
    highlight: 'text-blue-700',
    net: 'text-emerald-700',
  };
  const bg = variant === 'net' ? 'bg-emerald-50 border-emerald-200' : variant === 'highlight' ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100';

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${bg} transition-all`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${styles[variant]}`} />
        <span className="text-sm font-medium text-slate-600 truncate">{label}</span>
      </div>
      <span className={`text-base font-bold tabular-nums ${styles[variant]}`}>
        ₱{fmt(value)}
      </span>
    </div>
  );
}

export default function TaxCalculator() {
  const [basicSalary, setBasicSalary] = useState('');
  const [gsis, setGsis] = useState('');
  const [philHealth, setPhilHealth] = useState('');
  const [pagIbig, setPagIbig] = useState('');
  const [pera, setPera] = useState(String(PERA_DEFAULT));
  const [employeeName, setEmployeeName] = useState('');
  const [position, setPosition] = useState('');
  const payslipRef = useRef<HTMLDivElement>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { scopedCodes } = useOrg();

  const loadEmployees = useCallback(async () => {
    const scope = codeScope(scopedCodes);
    let q = supabase.from('employees').select('*').order('lname', { ascending: true });
    if (scope.regcode) {
      q = q.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    }
    const data = await fetchAll(() => q);
    setEmployees(data);
  }, [scopedCodes]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const empResults = useMemo(() => {
    if (!empSearch.trim()) return [];
    const q = empSearch.toLowerCase();
    return employees.filter((e) =>
      [e.empno, e.employee_number, e.fname, e.first_name, e.mi, e.middle_name, e.lname, e.last_name]
        .some((v) => v?.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [empSearch, employees]);

  function selectEmployee(e: Employee) {
    setSelectedEmp(e);
    const lname = e.lname || e.last_name || '';
    const fname = e.fname || e.first_name || '';
    const mi = e.mi || e.middle_name || '';
    setEmployeeName(`${lname}, ${fname} ${mi}`.trim());
    setPosition(e.poscode || e.position || '');
    const basic = Number(e.basic || e.basic_salary) || 0;
    setBasicSalary(String(basic));
    setPera(String(Number(e.pera) || PERA_DEFAULT));
    const dedlnr = basic * 0.09;
    const dedmed = basic * 0.0249998422961678;
    setGsis(dedlnr.toFixed(2));
    setPhilHealth(dedmed.toFixed(2));
    setPagIbig('200.00');
    setEmpSearch(`${e.empno || e.employee_number} — ${lname}, ${fname}`);
    setShowDropdown(false);
  }

  const result = useMemo(
    () => computeTax(parseNum(basicSalary), parseNum(gsis), parseNum(philHealth), parseNum(pagIbig), parseNum(pera)),
    [basicSalary, gsis, philHealth, pagIbig, pera],
  );

  const hasInput = parseNum(basicSalary) > 0;

  const loadSample = () => {
    setBasicSalary('34069');
    setGsis('3066.21');
    setPhilHealth('851.72');
    setPagIbig('200');
    setPera(String(PERA_DEFAULT));
    setEmployeeName('JUAN DELA CRUZ');
    setPosition('Teacher I');
  };

  const reset = () => {
    setBasicSalary('');
    setGsis('');
    setPhilHealth('');
    setPagIbig('');
    setPera(String(PERA_DEFAULT));
    setEmployeeName('');
    setPosition('');
    setEmpSearch('');
    setSelectedEmp(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = () => {
    window.print();
  };

  const activeBracket = TAX_BRACKETS[result.bracketIndex];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 px-6 py-5 shadow-lg print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur">
            <Landmark className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold leading-tight">Withholding Tax Calculator</h2>
            <p className="text-blue-200 text-sm">Department of Education · TRAIN Law (2023 onwards)</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:hidden">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Employee & Contributions</h3>
            <button
              onClick={loadSample}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Sample Data
            </button>
          </div>

          <div className="space-y-4">
            {/* Employee Search */}
            <div className="relative" ref={searchRef}>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Search Employee
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => { setEmpSearch(e.target.value); setShowDropdown(true); setSelectedEmp(null); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by Employee ID, First, Middle, or Last name…"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                />
                {selectedEmp && (
                  <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                )}
              </div>
              {showDropdown && empResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg max-h-64 overflow-y-auto">
                  {empResults.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => selectEmployee(e)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {e.lname || e.last_name}, {e.fname || e.first_name} {e.mi || e.middle_name || ''}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{e.empno || e.employee_number}</p>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">{e.poscode || e.position || ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && empSearch.trim() && empResults.length === 0 && employees.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg px-3 py-3 text-sm text-slate-400">
                  No matching employee found.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Employee Name
                </label>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Position
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Teacher I"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <InputField label="Basic Salary" value={basicSalary} onChange={setBasicSalary} placeholder="0.00" autoFocus />
            </div>
            <InputField label="GSIS Premium" value={gsis} onChange={setGsis} placeholder="0.00" />
            <InputField label="PhilHealth Contribution" value={philHealth} onChange={setPhilHealth} placeholder="0.00" />
            <InputField label="Pag-IBIG Contribution" value={pagIbig} onChange={setPagIbig} placeholder="0.00" />
            <InputField label="PERA (Non-Taxable)" value={pera} onChange={setPera} placeholder="2,000.00" hint="Default ₱2,000 — not subject to tax" />

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={handlePrint}
                disabled={!hasInput}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Payslip
              </button>
              <button
                onClick={handleExportPdf}
                disabled={!hasInput}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={reset}
                className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Payroll Summary</h3>

            <div className="space-y-2.5">
              <ResultRow icon={TrendingUp} label="Gross Compensation" value={result.grossCompensation} variant="highlight" />
              <ResultRow icon={Receipt} label="Taxable Income" value={result.taxableIncome} variant="default" />
              <ResultRow icon={ShieldCheck} label="Withholding Tax" value={result.withholdingTax} variant="highlight" />
              <ResultRow icon={Wallet} label="Total Deductions" value={result.totalDeductions} variant="deduction" />
              <ResultRow icon={Wallet} label="Net Pay" value={result.netPay} variant="net" />
            </div>
          </div>

          {/* Tax bracket indicator */}
          {hasInput && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start gap-2.5 mb-3">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-700">Applicable Tax Bracket</p>
                  <p className="text-[11px] text-slate-400">Based on monthly taxable income under TRAIN Law</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2.5">
                <p className="text-sm font-bold text-blue-800">{activeBracket.label}</p>
                <p className="text-xs text-blue-600 mt-0.5">{activeBracket.rateText}</p>
              </div>
            </div>
          )}

          {/* Breakdown table */}
          {hasInput && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-2.5 text-slate-700">Basic Salary</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">₱{fmt(parseNum(basicSalary))}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-slate-700">PERA (Non-Taxable)</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">₱{fmt(parseNum(pera))}</td>
                  </tr>
                  <tr className="bg-blue-50/50">
                    <td className="px-4 py-2.5 font-semibold text-blue-700">Gross Compensation</td>
                    <td className="px-4 py-2.5 text-right font-bold text-blue-700 tabular-nums">₱{fmt(result.grossCompensation)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-slate-600 pl-8 text-xs">GSIS Premium</td>
                    <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">₱{fmt(parseNum(gsis))}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-slate-600 pl-8 text-xs">PhilHealth</td>
                    <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">₱{fmt(parseNum(philHealth))}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-slate-600 pl-8 text-xs">Pag-IBIG</td>
                    <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">₱{fmt(parseNum(pagIbig))}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-slate-600 pl-8 text-xs">Withholding Tax</td>
                    <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">₱{fmt(result.withholdingTax)}</td>
                  </tr>
                  <tr className="bg-rose-50/50">
                    <td className="px-4 py-2.5 font-semibold text-rose-700">Total Deductions</td>
                    <td className="px-4 py-2.5 text-right font-bold text-rose-700 tabular-nums">₱{fmt(result.totalDeductions)}</td>
                  </tr>
                  <tr className="bg-emerald-50">
                    <td className="px-4 py-3 font-bold text-emerald-800">Net Pay</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 text-base tabular-nums">₱{fmt(result.netPay)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {!hasInput && (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">Enter a Basic Salary or load Sample Data to see the computation.</p>
            </div>
          )}
        </div>
      </div>

      {/* Printable Payslip */}
      {hasInput && (
        <div className="hidden print:block" ref={payslipRef}>
          <Payslip
            employeeName={employeeName || '—'}
            position={position || '—'}
            basicSalary={parseNum(basicSalary)}
            gsis={parseNum(gsis)}
            philHealth={parseNum(philHealth)}
            pagIbig={parseNum(pagIbig)}
            pera={parseNum(pera)}
            result={result}
          />
        </div>
      )}
    </div>
  );
}

interface PayslipProps {
  employeeName: string;
  position: string;
  basicSalary: number;
  gsis: number;
  philHealth: number;
  pagIbig: number;
  pera: number;
  result: TaxResult;
}

function Payslip({ employeeName, position, basicSalary, gsis, philHealth, pagIbig, pera, result }: PayslipProps) {
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#1e293b', padding: '32px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', borderBottom: '3px solid #1e40af', paddingBottom: '12px', marginBottom: '20px' }}>
        <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#1e40af', fontWeight: 700 }}>
          Republic of the Philippines
        </p>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '2px 0' }}>Department of Education</h1>
        <p style={{ fontSize: '13px', color: '#64748b' }}>Payslip — Withholding Tax Computation</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px' }}>
        <div>
          <p><strong>Employee:</strong> {employeeName}</p>
          <p><strong>Position:</strong> {position}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p><strong>Date:</strong> {today}</p>
          <p><strong>Tax Table:</strong> TRAIN Law 2023</p>
        </div>
      </div>

      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#1e40af', color: '#fff' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Earnings</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Amount</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Deductions</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px' }}>Basic Salary</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>₱{fmt(basicSalary)}</td>
            <td style={{ padding: '8px' }}>GSIS Premium</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#dc2626' }}>₱{fmt(gsis)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px' }}>PERA (Non-Taxable)</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>₱{fmt(pera)}</td>
            <td style={{ padding: '8px' }}>PhilHealth</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#dc2626' }}>₱{fmt(philHealth)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px' }}></td>
            <td style={{ textAlign: 'right', padding: '8px' }}></td>
            <td style={{ padding: '8px' }}>Pag-IBIG</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#dc2626' }}>₱{fmt(pagIbig)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px' }}></td>
            <td style={{ textAlign: 'right', padding: '8px' }}></td>
            <td style={{ padding: '8px' }}>Withholding Tax</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#dc2626' }}>₱{fmt(result.withholdingTax)}</td>
          </tr>
          <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
            <td style={{ padding: '8px' }}>Gross Compensation</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#1e40af' }}>₱{fmt(result.grossCompensation)}</td>
            <td style={{ padding: '8px' }}>Total Deductions</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#dc2626' }}>₱{fmt(result.totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: '16px', padding: '14px 16px', background: '#ecfdf5', borderRadius: '8px', border: '2px solid #059669', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#065f46' }}>NET PAY</span>
        <span style={{ fontSize: '20px', fontWeight: 700, color: '#059669' }}>₱{fmt(result.netPay)}</span>
      </div>

      <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
        <p>Taxable Income: ₱{fmt(result.taxableIncome)}</p>
        <p>This payslip is computer-generated and does not require a signature.</p>
      </div>
    </div>
  );
}
