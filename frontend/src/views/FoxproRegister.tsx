import { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import type { Employee, PayrollEntry, Deduction, PayrollDeduction, DeductionCode, PayPeriod, PayentRecord } from '@/types/payroll';
import {
  FOXPRO_FONT, REGISTER_COLUMNS, SIGNATORIES, foxMoney, foxText, foxLongDate, foxDate,
  buildRegisterModel, TAKEHOME_MONTHS,
} from '@/lib/foxpro/engine';

interface Props {
  period: PayPeriod | null | undefined;
  scopedCodes?: { regcode: string; divcode: string }[];
  employees: Employee[];
  entries: PayrollEntry[];
  deductions: Deduction[];
  payrollDeds: PayrollDeduction[];
  dedCodes: DeductionCode[];
  payent: PayentRecord[];
  onClose: () => void;
}

export default function FoxproRegister({
  period, scopedCodes, employees, entries, deductions, payrollDeds, dedCodes, payent, onClose,
}: Props) {
  const model = useMemo(
    () => buildRegisterModel({ period, employees, entries, deductions, payrollDeds, dedCodes, payent, scopedCodes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period?.id, employees, entries, deductions, payrollDeds, dedCodes, payent, scopedCodes],
  );

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const genTime = now.toLocaleTimeString('en-US', { hour12: true });
  const scope = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0] : null;
  const monthIssued = period?.month
    ? new Date(period.year ?? 2000, period.month - 1, 1).toLocaleDateString('en-US', { month: 'long' })
    : '';

  const t = model.totals;
  const colCount = REGISTER_COLUMNS.length;

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
        .foxpro-reg { font-family: ${FOXPRO_FONT}; color: #000; font-size: 8pt; line-height: 1.15; }
        .foxpro-reg table { border-collapse: collapse; table-layout: fixed; }
        .foxpro-reg .reg-table { width: 138ch; }
        .foxpro-reg .reg-table th, .foxpro-reg .reg-table td { padding: 0; vertical-align: top; }
        .foxpro-reg .reg-table thead { display: table-header-group; }
        .foxpro-reg .col-head { font-weight: 700; font-size: 8pt; border-top: 1px solid #000; border-bottom: 1px solid #000; }
        .foxpro-reg .col-head th { font-weight: 700; }
        .foxpro-reg .foxpro-block { break-inside: avoid; page-break-inside: avoid; }
        .foxpro-reg .emp-sum td { border-bottom: 1px dotted #999; font-size: 7pt; }
        .foxpro-reg .sub-line { font-size: 7pt; }
        .foxpro-reg .ded-row { font-size: 7pt; }
        .foxpro-reg .totals-sec { break-inside: avoid; page-break-inside: avoid; }
        .foxpro-reg .sign-sec { break-inside: avoid; page-break-inside: avoid; }
        .foxpro-reg .sig-line { border-bottom: 1px solid #000; height: 2.2em; }
      `}</style>

      {/* Toolbar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-2.5 flex items-center gap-3 print:hidden">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors">
          <X className="w-4 h-4" /> Back to Report Center
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">FOXPRO Payroll Register — {period?.period_name ?? 'No Period'}</p>
          <p className="text-[11px] text-slate-400 font-mono">Legal portrait · 300 DPI · Courier · {model.blocks.length.toLocaleString()} employees</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      {/* FOXPRO page */}
      <div className="mx-auto my-6 shadow-2xl foxpro-page print:my-0 print:shadow-none">
        <div className="foxpro-reg">
          {/* ── Report header (repeats on every page via thead) ── */}
          <table className="reg-table w-full">
            <thead>
              <tr>
                <th colSpan={colCount} className="text-left" style={{ fontFamily: FOXPRO_FONT, fontWeight: 400 }}>
                  <div className="flex justify-between text-[8pt]">
                    <span>DATE: {genDate}</span>
                    <span>TIME: {genTime}</span>
                  </div>
                </th>
              </tr>
              <tr>
                <th colSpan={colCount} style={{ fontFamily: FOXPRO_FONT }}>
                  <div className="text-center font-bold" style={{ fontSize: '10pt' }}>DEPARTMENT OF EDUCATION</div>
                  <div className="text-center font-bold" style={{ fontSize: '10pt', letterSpacing: '0.08em' }}>PAYROLL REGISTER</div>
                  <div className="text-left font-bold" style={{ fontSize: '9pt' }}>REGULAR SALARY</div>
                  <div className="text-left" style={{ fontSize: '8pt' }}>
                    FOR THE PAY PERIOD ENDING {period ? foxLongDate(period.end_date ?? period.pay_date) : '____________'}
                  </div>
                  <div className="flex justify-between" style={{ fontSize: '8pt' }}>
                    <span>REGION : {scope?.regcode ?? 'ALL'}</span>
                    <span>DIVISION : {scope?.divcode ?? 'ALL'}</span>
                    <span>STATION : ALL</span>
                    <span>MONTH ISSUED : {monthIssued.toUpperCase() || '______'}</span>
                  </div>
                </th>
              </tr>
              <tr className="col-head">
                {REGISTER_COLUMNS.map((c) => (
                  <th key={c.key} style={{ width: `${c.width}ch`, textAlign: c.key === 'name' ? 'left' : 'left', fontFamily: FOXPRO_FONT, fontWeight: 700 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Employee blocks (never split across pages) ── */}
            {model.empty ? (
              <tbody>
                <tr><td colSpan={colCount} className="text-center py-16" style={{ fontFamily: FOXPRO_FONT }}>NO PAYROLL ENTRIES FOR THIS PERIOD</td></tr>
              </tbody>
            ) : model.blocks.map((b) => (
              <tbody key={b.employee.id} className="foxpro-block">
                {/* Employee summary row */}
                <tr className="emp-sum">
                  <td style={{ width: '12ch' }}>{b.empno}</td>
                  <td style={{ width: '35ch' }}>{b.name}</td>
                  <td style={{ width: '6ch' }}>{b.poscode}</td>
                  <td style={{ width: '3ch' }}>{b.grade}</td>
                  <td style={{ width: '3ch' }}>{b.step}</td>
                  <td style={{ width: '12ch', textAlign: 'right' }}>{foxMoney(b.salary)}</td>
                  <td style={{ width: '10ch', textAlign: 'right' }}>{foxMoney(b.pera)}</td>
                  <td style={{ width: '12ch', textAlign: 'right' }}>{foxMoney(b.totalDeductions)}</td>
                  <td style={{ width: '12ch', textAlign: 'right', fontWeight: 700 }}>{foxMoney(b.net)}</td>
                  <td style={{ width: '15ch' }}>{b.account}</td>
                  <td style={{ width: '18ch' }} />
                </tr>
                {/* Tax information block */}
                <tr>
                  <td colSpan={colCount} className="sub-line">
                    <span style={{ display: 'inline-block', width: '18ch' }}>T.CODE: {foxText(b.taxCode, 6)}</span>
                    <span style={{ display: 'inline-block', width: '34ch' }}>CIVIL STATUS: {foxText(b.civilStatus, 24)}</span>
                    <span style={{ display: 'inline-block', width: '22ch' }}>DEPENDENTS: {b.dependents}</span>
                    <span style={{ display: 'inline-block', width: '30ch' }}>EXEMPTION: {b.exemption ? foxMoney(b.exemption) : ''}</span>
                  </td>
                </tr>
                {/* Half pay split block */}
                <tr>
                  <td colSpan={colCount} className="sub-line">
                    <span style={{ display: 'inline-block', width: '38ch' }}>1ST HALF PAY: {b.firstHalf ? foxMoney(b.firstHalf) : ''}</span>
                    <span style={{ display: 'inline-block', width: '38ch' }}>2ND HALF PAY: {b.secondHalf ? foxMoney(b.secondHalf) : ''}</span>
                    <span style={{ display: 'inline-block', width: '26ch' }}>(SIGNATURE)</span>
                  </td>
                </tr>
                {/* Itemized deductions */}
                {b.deductions.length > 0 && (
                  <tr>
                    <td colSpan={colCount} className="sub-line">
                      <span style={{ display: 'inline-block', width: '10ch', fontWeight: 700 }}>DEDUCTIONS</span>
                      <span style={{ display: 'inline-block', width: '8ch', fontWeight: 700 }}>CODE</span>
                      <span style={{ display: 'inline-block', width: '34ch', fontWeight: 700 }}>DESCRIPTION</span>
                      <span style={{ display: 'inline-block', width: '14ch', textAlign: 'right', fontWeight: 700 }}>AMOUNT</span>
                      <span style={{ display: 'inline-block', width: '16ch', textAlign: 'center', fontWeight: 700 }}>EFFECTIVITY</span>
                      <span style={{ display: 'inline-block', width: '14ch', textAlign: 'center', fontWeight: 700 }}>TERMINATION</span>
                    </td>
                  </tr>
                )}
                {b.deductions.map((d, i) => (
                  <tr key={`${d.code}-${i}`}>
                    <td colSpan={colCount} className="ded-row">
                      <span style={{ display: 'inline-block', width: '10ch' }} />
                      <span style={{ display: 'inline-block', width: '8ch' }}>{d.code}</span>
                      <span style={{ display: 'inline-block', width: '34ch' }}>{d.description}</span>
                      <span style={{ display: 'inline-block', width: '14ch', textAlign: 'right' }}>{foxMoney(d.amount)}</span>
                      <span style={{ display: 'inline-block', width: '16ch', textAlign: 'center' }}>{d.effmm ? `${d.effmm}/${d.effyy}` : ''}</span>
                      <span style={{ display: 'inline-block', width: '14ch', textAlign: 'center' }}>{d.termm ? `${d.termm}/${d.teryy}` : ''}</span>
                    </td>
                  </tr>
                ))}
                {/* one blank line between employees */}
                <tr><td colSpan={colCount} style={{ height: '0.9em' }} /></tr>
              </tbody>
            ))}
          </table>

          {/* ── Report totals ── */}
          {!model.empty && (
            <div className="totals-sec mt-6">
              <div className="text-center font-bold" style={{ fontSize: '9pt', letterSpacing: '0.2em' }}>G R A N D&nbsp;&nbsp;T O T A L S</div>
              <table className="mt-2" style={{ width: '62ch', fontFamily: FOXPRO_FONT }}>
                <tbody>
                  <tr><td style={{ width: '32ch' }}>TOTAL EMPLOYEES</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{t.employees.toLocaleString()}</td></tr>
                  <tr><td>TOTAL SALARY</td><td style={{ textAlign: 'right' }}>{foxMoney(t.salary)}</td></tr>
                  <tr><td>TOTAL P.E.R.A.</td><td style={{ textAlign: 'right' }}>{foxMoney(t.pera)}</td></tr>
                  <tr><td>TOTAL GROSS COMPENSATION</td><td style={{ textAlign: 'right' }}>{foxMoney(t.gross)}</td></tr>
                  <tr><td>TOTAL DEDUCTIONS</td><td style={{ textAlign: 'right' }}>{foxMoney(t.deductions)}</td></tr>
                  <tr><td>TOTAL NET PAY</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{foxMoney(t.net)}</td></tr>
                </tbody>
              </table>

              {/* Bank totals */}
              {model.bankTotals.length > 0 && (
                <div className="mt-4">
                  <div className="font-bold">BANK TOTALS</div>
                  <table style={{ width: '70ch', fontFamily: FOXPRO_FONT }}>
                    <thead>
                      <tr className="col-head">
                        <th style={{ textAlign: 'left' }}>BANK</th>
                        <th style={{ textAlign: 'right' }}>EMPLOYEES</th>
                        <th style={{ textAlign: 'right' }}>NET AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.bankTotals.map((bt) => (
                        <tr key={bt.bank}>
                          <td>{bt.bank}</td>
                          <td style={{ textAlign: 'right' }}>{bt.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{foxMoney(bt.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Deduction totals */}
              {model.dedTotals.length > 0 && (
                <div className="mt-4">
                  <div className="font-bold">DEDUCTION TOTALS</div>
                  <table style={{ width: '90ch', fontFamily: FOXPRO_FONT }}>
                    <thead>
                      <tr className="col-head">
                        <th style={{ textAlign: 'left', width: '10ch' }}>CODE</th>
                        <th style={{ textAlign: 'left', width: '46ch' }}>DESCRIPTION</th>
                        <th style={{ textAlign: 'right', width: '14ch' }}>COUNT</th>
                        <th style={{ textAlign: 'right', width: '18ch' }}>TOTAL AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.dedTotals.map((dt) => (
                        <tr key={dt.code}>
                          <td>{dt.code}</td>
                          <td>{dt.name}</td>
                          <td style={{ textAlign: 'right' }}>{dt.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{foxMoney(dt.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Signatories ── */}
          <div className="sign-sec mt-10">
            <table className="w-full" style={{ fontFamily: FOXPRO_FONT }}>
              <tbody>
                {[0, 3].map((start) => (
                  <tr key={start}>
                    {SIGNATORIES.slice(start, start + 3).map((s) => (
                      <td key={s.role} style={{ width: '33.33%', paddingRight: '1.5ch' }}>
                        <div className="text-center font-bold" style={{ fontSize: '8pt' }}>{s.role}</div>
                        <div className="sig-line" />
                        <div className="text-center" style={{ fontSize: '8pt' }}>PRINTED NAME</div>
                        <div className="text-center" style={{ fontSize: '8pt' }}>{s.position}</div>
                        <div className="text-center" style={{ fontSize: '8pt' }}>DATE: ____________</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-center mt-6" style={{ fontFamily: FOXPRO_FONT, fontSize: '8pt' }}>
              GENERATED BY SCRIVIA CLOUD — {genDate} {genTime} — REGULAR SALARY — {monthIssued.toUpperCase()} {period?.year ?? ''}
            </div>
          </div>

          {/* Take-home month strip reference (register footer) */}
          <div className="text-center mt-1" style={{ fontFamily: FOXPRO_FONT, fontSize: '7pt' }}>
            {TAKEHOME_MONTHS} · {foxDate(period?.end_date ?? period?.pay_date)}
          </div>
        </div>
      </div>
    </div>
  );
}
