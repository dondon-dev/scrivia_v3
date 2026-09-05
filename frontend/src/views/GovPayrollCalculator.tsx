import { useState } from 'react';
import { Calculator, AlertTriangle, CheckCircle2, Info, AlertCircle } from 'lucide-react';
import {
  computeGSISLifeRetirement,
  computeGovtLifeRetirement,
  computeGovtECC,
  computeMedicare,
  computeGovtMedicare,
  computeWithholdingTax,
  checkNegativePay,
  processDeductionsWithNTHP,
  getDeductionPriority,
  NTHP_THRESHOLD,
  DEDUCTION_CODES,
  type DeductionRecord,
  type ProcessedDeduction,
  type UndeductedObligation,
} from '@/lib/govPayrollComputation';

// TRAIN Law monthly taxable income brackets
const TRAIN_BRACKETS = [
  { max: 20833,   rate: 0,    base: 0,      label: '≤ ₱20,833 (Exempt)' },
  { max: 33332,   rate: 0.15, base: 0,      label: '₱20,834 – ₱33,332 (15%)' },
  { max: 66666,   rate: 0.20, base: 1875,   label: '₱33,333 – ₱66,666 (20%)' },
  { max: 166666,  rate: 0.25, base: 8541.80, label: '₱66,667 – ₱166,666 (25%)' },
  { max: 666666,  rate: 0.30, base: 33451.80, label: '₱166,667 – ₱666,666 (30%)' },
  { max: Infinity, rate: 0.35, base: 183541.80, label: '> ₱666,666 (35%)' },
];

interface CalcInput {
  basic: number;
  trans: number;
  pera: number;
  aca: number;
  dedPag: number;
  trainBracket: number;
  // Dynamic loan deductions
  loanDeductions: DeductionRecord[];
}

export default function GovPayrollCalculator() {
  const [input, setInput] = useState<CalcInput>({
    basic: 0, trans: 0, pera: 0, aca: 0, dedPag: 200,
    trainBracket: 0, loanDeductions: [],
  });
  const [newLoanCode, setNewLoanCode] = useState('');
  const [newLoanAmt, setNewLoanAmt] = useState(0);
  const [newLoanAgency, setNewLoanAgency] = useState('OTHER');
  const [newLoanType, setNewLoanType] = useState('L');

  const selectedBracket = TRAIN_BRACKETS[input.trainBracket] || TRAIN_BRACKETS[0];

  // ── Step 1–2: Mandatory deductions (payroll.ts formulas) ──
  const lnr = computeGSISLifeRetirement(input.basic);       // basic × 9%
  const govtLnr = computeGovtLifeRetirement(input.basic);   // basic × 12%
  const govtEcc = computeGovtECC();                          // fixed ₱100
  const med = computeMedicare(input.basic);                  // PhilHealth employee = floor(total/2)
  const govtMed = computeGovtMedicare(input.basic);          // PhilHealth govt = total − employee
  const taxableIncome = Math.max(0, input.basic - lnr - med - input.dedPag);
  const wtax = computeWithholdingTax(taxableIncome);
  const gross = input.basic + input.trans + input.pera + input.aca;

  // ── Step 3: Available balance after mandatory deductions ──
  const mandatoryDeductions = lnr + med + input.dedPag + wtax;
  const availableBalance = gross - mandatoryDeductions;

  // ── Step 4–7: NTHP deduction processing ──
  const nthpResult = processDeductionsWithNTHP(availableBalance, input.loanDeductions);
  const totalLoanDeductions = nthpResult.actualLoanDeductions;
  const totalDeductions = mandatoryDeductions + totalLoanDeductions;
  const netPay = gross - totalDeductions;
  const negPay = checkNegativePay(netPay);

  const fmt = (v: number) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function set<K extends keyof CalcInput>(key: K, val: CalcInput[K]) {
    setInput(prev => ({ ...prev, [key]: val }));
  }

  function addLoanDeduction() {
    if (!newLoanCode || newLoanAmt <= 0) return;
    const newDed: DeductionRecord = {
      dedCode: newLoanCode,
      dedName: newLoanCode,
      dedAmt: newLoanAmt,
      agency: newLoanAgency,
      type: newLoanType,
      effyy: new Date().getFullYear(),
      effmm: new Date().getMonth() + 1,
    };
    setInput(prev => ({
      ...prev,
      loanDeductions: [...prev.loanDeductions, newDed],
    }));
    setNewLoanCode('');
    setNewLoanAmt(0);
  }

  function removeLoanDeduction(idx: number) {
    setInput(prev => ({
      ...prev,
      loanDeductions: prev.loanDeductions.filter((_, i) => i !== idx),
    }));
  }

  const priorityLabels: Record<number, string> = {
    1: 'BIR', 2: 'PhilHealth', 3: 'GSIS Premium', 4: 'GSIS Loan',
    5: 'Pag-IBIG', 6: 'Pag-IBIG Loan', 7: 'Cooperative', 8: 'MBA',
    9: 'Provident Fund', 10: 'Govt Financial Inst.', 11: 'Insurance',
    12: 'Rural/Thrift Bank', 13: 'Other Lending Inst.',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Government Payroll Calculator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Interactive computation engine — GSIS L&R, Medicare, W/Tax, NTHP deduction processing
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Calculator size={18} /> Input Parameters
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Basic Salary" value={input.basic} onChange={v => set('basic', v)} />
              <Field label="Transportation" value={input.trans} onChange={v => set('trans', v)} />
              <Field label="PERA" value={input.pera} onChange={v => set('pera', v)} />
              <Field label="ACA" value={input.aca} onChange={v => set('aca', v)} />
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Mandated Deductions</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="PAG-IBIG (dedPag)" value={input.dedPag} onChange={v => set('dedPag', v)} />
              </div>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tax Configuration</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Taxable Income Bracket</label>
                <select value={input.trainBracket} onChange={e => set('trainBracket', Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  {TRAIN_BRACKETS.map((b, i) => (
                    <option key={i} value={i}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Loan Deductions (APDS) */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Loan Deductions (APDS)</p>
              <div className="flex gap-2 mb-2">
                <input value={newLoanCode} onChange={e => setNewLoanCode(e.target.value)}
                  placeholder="Code" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                <input type="number" value={newLoanAmt || ''} onChange={e => setNewLoanAmt(Number(e.target.value) || 0)}
                  placeholder="Amount" className="w-28 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono" />
                <select value={newLoanAgency} onChange={e => setNewLoanAgency(e.target.value)}
                  className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
                  <option value="OTHER">Other</option>
                  <option value="COOP">Coop</option>
                  <option value="BANK">Bank</option>
                  <option value="GSIS">GSIS</option>
                  <option value="HDMF">HDMF</option>
                </select>
                <select value={newLoanType} onChange={e => setNewLoanType(e.target.value)}
                  className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
                  <option value="L">Loan</option>
                  <option value="C">Coop</option>
                  <option value="P">Provident</option>
                  <option value="INSURANCE">Insurance</option>
                </select>
                <button onClick={addLoanDeduction}
                  className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                  +
                </button>
              </div>
              {input.loanDeductions.length > 0 && (
                <div className="space-y-1">
                  {input.loanDeductions.map((d, i) => {
                    const priority = getDeductionPriority(d.agency ?? '', d.type ?? '');
                    return (
                      <div key={i} className="flex items-center justify-between py-1 px-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-400 mr-2">#{priority}</span>
                        <span className="flex-1 font-medium">{d.dedCode}</span>
                        <span className="text-slate-500 mr-2">{priorityLabels[priority] || 'Other'}</span>
                        <span className="font-mono">{fmt(d.dedAmt)}</span>
                        <button onClick={() => removeLoanDeduction(i)} className="ml-2 text-red-400 hover:text-red-600">×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Computation Results */}
        <div className="space-y-4">
          {/* Gross Income */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Gross Income</h3>
            <div className="space-y-2">
              <Row label="Basic Salary" value={fmt(input.basic)} detail={`₱${input.basic.toLocaleString()}`} />
              <Row label="+ Transportation" value={fmt(input.trans)} />
              <Row label="+ PERA" value={fmt(input.pera)} />
              <Row label="+ ACA" value={fmt(input.aca)} />
              <Row label="Gross Income" value={fmt(gross)} bold />
            </div>
          </div>

          {/* Step 2: Mandatory Deductions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Step 2 — Mandatory Deductions</h3>
            <div className="space-y-2">
              <Row label="GSIS L&R (Personal)" value={fmt(lnr)} detail={`${input.basic.toLocaleString()} × 9%`} />
              <Row label="Medicare / PhilHealth" value={fmt(med)} detail={input.basic >= 100000 ? '₱5,000 ÷ 2 → floor' : `${(input.basic * 0.05).toLocaleString()} ÷ 2 → floor`} />
              <Row label="PAG-IBIG" value={fmt(input.dedPag)} detail="Fixed" />
              <Row label={`Withholding Tax (TRAIN Law Bracket)`} value={fmt(wtax)} detail={selectedBracket.label} />
              <Row label="Mandatory Deductions Total" value={fmt(mandatoryDeductions)} bold />
            </div>
          </div>

          {/* Step 3: Available Balance */}
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-5 shadow-sm border border-blue-200 dark:border-blue-900/50">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">Step 3 — Available Balance</h3>
            <div className="space-y-1">
              <Row label="Gross − Mandatory Deductions" value={fmt(availableBalance)} bold />
              <p className="text-[10px] text-blue-500">Loan deduction capacity: {fmt(nthpResult.loanDeductionCapacity)}</p>
            </div>
          </div>

          {/* Step 4-7: NTHP Loan Processing */}
          {input.loanDeductions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Step 4–7 — NTHP Deduction Processing</h3>
              <div className="space-y-1">
                {nthpResult.processedDeductions.map((d, i) => (
                  <div key={i} className="flex justify-between items-center py-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">#{d.priority}</span>
                      <span className="text-slate-600 dark:text-slate-400">{d.deduction_description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.deducted_amount > 0 && (
                        <span className="font-medium text-green-600">{fmt(d.deducted_amount)}</span>
                      )}
                      {d.undeducted_amount > 0 && (
                        <span className="font-medium text-amber-600 flex items-center gap-1">
                          <AlertCircle size={12} /> {fmt(d.undeducted_amount)} <span className="text-[9px]">(undeducted)</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Row label="Total Loan Deductions" value={fmt(totalLoanDeductions)} bold />
              </div>
            </div>
          )}

          {/* Net Pay */}
          <div className={`rounded-xl p-5 shadow-sm border ${
            negPay.isNegative
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
              : nthpResult.nthpStatus === 'FAIL'
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Net Pay (Take Home)</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmt(netPay)}</p>
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <span>Period 1–15: {fmt(Math.floor(netPay / 2))}</span>
                  <span>Period 16–30: {fmt(netPay - Math.floor(netPay / 2))}</span>
                </div>
              </div>
              {negPay.isNegative ? (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle size={24} />
                  <div>
                    <p className="text-sm font-semibold">⚠ Below ₱5,000 Floor</p>
                    <p className="text-xs">Deficit: {fmt(negPay.deficit)}</p>
                  </div>
                </div>
              ) : nthpResult.nthpStatus === 'FAIL' ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle size={24} />
                  <div>
                    <p className="text-sm font-semibold">⚠ NTHP FAIL</p>
                    <p className="text-xs">Net below ₱5,000</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 size={24} />
                  <p className="text-sm font-semibold">✓ NTHP PASS</p>
                </div>
              )}
            </div>
          </div>

          {/* Government Shares */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Government Shares</h3>
            <div className="space-y-2">
              <Row label="GSIS L&R (Government)" value={fmt(govtLnr)} detail={`${input.basic.toLocaleString()} × 12%`} />
              <Row label="GSIS ECC" value={fmt(govtEcc)} detail="Fixed ₱100" />
              <Row label="Medicare (Government)" value={fmt(govtMed)} detail={input.basic >= 100000 ? '₱5,000 − employee share' : `₱${(input.basic * 0.05).toLocaleString()} − employee share`} />
            </div>
          </div>

          {/* Undeducted Obligations */}
          {nthpResult.undeductedObligations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                <AlertCircle size={15} /> Undeducted Obligations ({nthpResult.undeductedObligations.length})
              </h3>
              <div className="space-y-1">
                {nthpResult.undeductedObligations.map((u, i) => (
                  <div key={i} className="flex justify-between items-center py-1 text-sm">
                    <span className="text-amber-700 dark:text-amber-400">{u.deduction_description}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-600">{fmt(u.undeducted_amount)}</span>
                      <span className="text-[9px] text-amber-500">{u.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reference: NTHP Priority Order */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Info size={18} /> Reference: NTHP Deduction Priority (DepEd Order No. 05, s. 2018)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.entries(priorityLabels).map(([code, name]) => (
            <div key={code} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs">
              <span className="font-mono font-bold text-deped-700 dark:text-deped-400 min-w-[1.5rem]">#{code}</span>
              <span className="text-slate-600 dark:text-slate-400 truncate">{name}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.entries(DEDUCTION_CODES).map(([code, info]: [string, { name: string; category: string; mandated: boolean }]) => (
            <div key={code} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs">
              <span className="font-mono font-bold text-deped-700 dark:text-deped-400 min-w-[1.5rem]">{code}</span>
              <span className="text-slate-600 dark:text-slate-400 truncate">{info.name}</span>
              {info.mandated && <span className="text-[9px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-1 rounded">M</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type="number" value={value || ''}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono" />
    </div>
  );
}

function Row({ label, value, detail, bold }: { label: string; value: string; detail?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1 ${bold ? 'border-t border-slate-200 dark:border-slate-700 pt-2 mt-1' : ''}`}>
      <div>
        <span className={`text-sm ${bold ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{label}</span>
        {detail && <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{detail}</span>}
      </div>
      <span className={`text-sm ${bold ? 'font-bold text-slate-800 dark:text-slate-100' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
