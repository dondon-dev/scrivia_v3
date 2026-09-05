import { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import type { Employee, PayrollEntry, Deduction, PayrollDeduction, UndeductedObligation, DeductionCode, PayPeriod, PayentRecord } from '@/types/payroll';
import {
  FOXPRO_FONT, foxMoney, foxText, foxLongDate, foxDate, buildPayslipModels, TAKEHOME_MONTHS,
} from '@/lib/foxpro/engine';

interface Props {
  period: PayPeriod | null | undefined;
  employees: Employee[];
  entries: PayrollEntry[];
  deductions: Deduction[];
  payrollDeds: PayrollDeduction[];
  undeducted: UndeductedObligation[];
  dedCodes: DeductionCode[];
  payent: PayentRecord[];
  schools: { school_code: string; school_name: string }[];
  /** When set, only this employee's payslip is rendered (1 page). */
  selectedEmpId?: string;
  onClose: () => void;
}

export default function FoxproPayslip({
  period, employees, entries, deductions, payrollDeds, undeducted, dedCodes, payent, schools, selectedEmpId, onClose,
}: Props) {
  const all = useMemo(
    () => buildPayslipModels({ period, employees, entries, deductions, payrollDeds, undeducted, dedCodes, payent, schools }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period?.id, employees, entries, deductions, payrollDeds, undeducted, dedCodes, payent, schools],
  );
  const slips = selectedEmpId ? all.filter((s) => s.employee.id === selectedEmpId) : all;

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const genTime = now.toLocaleTimeString('en-US', { hour12: true });
  const monthLabel = period?.month
    ? `${new Date(period.year ?? 2000, period.month - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${period.year ?? ''}`.toUpperCase()
    : '';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-200 overflow-auto print:bg-white">
      <style>{`
        @page { size: legal portrait; margin: 10mm 10mm 12mm 10mm; }
        @page { @top-right { content: "PAGE " counter(page); font-family: ${FOXPRO_FONT}; font-size: 8pt; font-weight: bold; } }
        .foxpro-page { width: 816px; min-height: 1248px; padding: 15mm 10mm 12mm; background: #fff; }
        @media print {
          .foxpro-page { width: auto; min-height: 0; padding: 0; box-shadow: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .foxpro-slip { font-family: ${FOXPRO_FONT}; color: #000; font-size: 8pt; line-height: 1.2; }
        .foxpro-slip .slip-page { break-after: page; page-break-after: always; }
        .foxpro-slip .slip-page:last-child { break-after: auto; page-break-after: auto; }
        .foxpro-slip table { border-collapse: collapse; }
        .foxpro-slip .info-cell { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
        .foxpro-slip .chart-grid td, .foxpro-slip .chart-grid th { border: 1px solid #000; width: 8.33%; text-align: center; }
      `}</style>

      {/* Toolbar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-2.5 flex items-center gap-3 print:hidden">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors">
          <X className="w-4 h-4" /> Back to Report Center
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">FOXPRO Official Payslip — {period?.period_name ?? 'No Period'}</p>
          <p className="text-[11px] text-slate-400 font-mono">{slips.length.toLocaleString()} page{slips.length === 1 ? '' : 's'} · one employee per page</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto my-6 shadow-2xl foxpro-page print:my-0 print:shadow-none">
        <div className="foxpro-slip">
          {slips.length === 0 && (
            <div className="py-20 text-center" style={{ fontFamily: FOXPRO_FONT }}>
              NO PAYROLL ENTRY FOR THE SELECTED EMPLOYEE IN THIS PERIOD.
            </div>
          )}

          {slips.map((s) => (
            <div key={s.employee.id} className="slip-page">
              {/* ── Government header ── */}
              <div className="text-center">
                <div className="font-bold" style={{ fontSize: '10pt' }}>REPUBLIC OF THE PHILIPPINES</div>
                <div className="font-bold" style={{ fontSize: '10pt' }}>DEPARTMENT OF EDUCATION</div>
                <div className="font-bold" style={{ fontSize: '10pt', letterSpacing: '0.06em' }}>OFFICIAL PAYROLL SLIP</div>
                <div style={{ fontSize: '8pt' }}>PAYROLL MONTH: {monthLabel || '__________'}</div>
              </div>

              {/* ── Employee information area ── */}
              <table className="w-full mt-3" style={{ fontFamily: FOXPRO_FONT }}>
                <tbody>
                  <tr>
                    <td className="info-cell" style={{ width: '50%' }}>NAME: {s.name}</td>
                    <td className="info-cell" style={{ width: '25%' }}>EMP NO: {s.empno}</td>
                    <td className="info-cell" style={{ width: '25%' }}>STATION: {s.station}</td>
                  </tr>
                  <tr>
                    <td className="info-cell">REGION: {s.regcode}</td>
                    <td className="info-cell">DIVISION: {s.divcode}</td>
                    <td className="info-cell">DATE HIRED: {s.hiredate}</td>
                  </tr>
                  <tr>
                    <td className="info-cell" colSpan={2}>POSITION: {s.position}</td>
                    <td className="info-cell">DATE RETIRED: ______________</td>
                  </tr>
                  <tr>
                    <td className="info-cell">SALARY GRADE: {s.grade}</td>
                    <td className="info-cell">STEP: {s.step}</td>
                    <td className="info-cell">ACCOUNT NO: {s.account}</td>
                  </tr>
                  <tr>
                    <td className="info-cell">TAX CODE: {s.taxCode}</td>
                    <td className="info-cell">BPN NO: ______________</td>
                    <td className="info-cell">TIN: {s.tin}</td>
                  </tr>
                  <tr>
                    <td className="info-cell">PHILHEALTH NO: {s.philhealthNo}</td>
                    <td className="info-cell">PAG-IBIG NO: {s.pagibigNo}</td>
                    <td className="info-cell">GSIS NO: {s.gsisNo}</td>
                  </tr>
                  <tr>
                    <td className="info-cell">BASIC SALARY: {foxMoney(s.basic)}</td>
                    <td className="info-cell">P.E.R.A.: {foxMoney(s.pera)}</td>
                    <td className="info-cell">GROSS COMPENSATION: {foxMoney(s.gross)}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Deductions area: two columns ── */}
              <div className="flex gap-2 mt-3" style={{ fontFamily: FOXPRO_FONT }}>
                {/* Left: itemized deductions */}
                <div style={{ width: '50%' }}>
                  <div className="text-center font-bold border border-black" style={{ fontSize: '8pt' }}>DEDUCTIONS</div>
                  <table className="w-full">
                    <thead>
                      <tr className="font-bold" style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'left', width: '9ch' }}>CODE</th>
                        <th style={{ textAlign: 'left' }}>DESCRIPTION</th>
                        <th style={{ textAlign: 'right', width: '12ch' }}>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.deductions.length === 0 && (
                        <tr><td colSpan={3}>NO DEDUCTIONS</td></tr>
                      )}
                      {s.deductions.map((d, i) => (
                        <tr key={`${d.code}-${i}`}>
                          <td>{d.code}</td>
                          <td>{d.description}</td>
                          <td style={{ textAlign: 'right' }}>{foxMoney(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Right: undeducted obligations */}
                <div style={{ width: '50%' }}>
                  <div className="text-center font-bold border border-black" style={{ fontSize: '8pt' }}>UNDEDUCTED OBLIGATIONS</div>
                  <table className="w-full">
                    <thead>
                      <tr className="font-bold" style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'left', width: '9ch' }}>CODE</th>
                        <th style={{ textAlign: 'left' }}>DESCRIPTION</th>
                        <th style={{ textAlign: 'right', width: '12ch' }}>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.undeducted.length === 0 && (
                        <tr><td colSpan={3}>NONE</td></tr>
                      )}
                      {s.undeducted.map((u, i) => (
                        <tr key={`${u.code}-${i}`}>
                          <td>{u.code}</td>
                          <td>{u.description}</td>
                          <td style={{ textAlign: 'right' }}>{foxMoney(u.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Totals area ── */}
              <table className="w-full mt-3" style={{ fontFamily: FOXPRO_FONT }}>
                <tbody>
                  <tr>
                    <td className="info-cell font-bold">TOTAL DEDUCTIONS: {foxMoney(s.totalDeductions)}</td>
                    <td className="info-cell font-bold">NET PAY: {foxMoney(s.net)}</td>
                  </tr>
                  <tr>
                    <td className="info-cell">1ST HALF PAY: {s.firstHalf ? foxMoney(s.firstHalf) : '______________'}</td>
                    <td className="info-cell">2ND HALF PAY: {s.secondHalf ? foxMoney(s.secondHalf) : '______________'}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Take-home chart + New Obligations ── */}
              <div className="flex gap-3 mt-3" style={{ fontFamily: FOXPRO_FONT }}>
                {/* Static 12-month take-home chart (FOXPRO template — no chart lib) */}
                <div style={{ width: '45%' }}>
                  <div className="text-center font-bold" style={{ fontSize: '8pt' }}>MONTHLY TAKEHOME PAY CHART</div>
                  <table className="chart-grid w-full" style={{ fontFamily: FOXPRO_FONT, fontSize: '7pt', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        {TAKEHOME_MONTHS.split(' ').map((m) => <th key={m} className="font-bold">{m}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 12 }).map((_, r) => (
                        <tr key={r}>
                          {Array.from({ length: 12 }).map((_, c) => <td key={c}>&nbsp;</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* New Obligations panel (manual entry by lending institutions) */}
                <div style={{ width: '45%' }}>
                  <div className="text-center font-bold border border-black" style={{ fontSize: '8pt' }}>NEW OBLIGATIONS</div>
                  <table className="w-full" style={{ fontFamily: FOXPRO_FONT }}>
                    <tbody>
                      {[
                        ['ORGANIZATION', ''],
                        ['TYPE', ''],
                        ['AMOUNT LOANED', ''],
                        ['MONTHLY AMORTIZATION', ''],
                      ].map(([label]) => (
                        <tr key={label}>
                          <td className="info-cell font-bold" style={{ width: '45%' }}>{label}</td>
                          <td className="info-cell" style={{ height: '2.6em' }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="mt-6" style={{ fontFamily: FOXPRO_FONT, fontSize: '8pt' }}>
                <div className="flex justify-between">
                  <span>EMPLOYEE SIGNATURE: ____________________________</span>
                  <span>DATE: ____________</span>
                </div>
                <div className="text-center mt-4">
                  GENERATED BY SCRIVIA CLOUD — {genDate} {genTime} — {monthLabel} — PERIOD ENDING {period ? foxLongDate(period.end_date ?? period.pay_date) : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
