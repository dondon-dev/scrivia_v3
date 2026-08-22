// ── Official government payroll print template ───────────────────────────────
// GENERAL PAYROLL · Department of Education · Division of Calamba City
// Communication Allowance · US Standard Fanfold 14-7/8" × 11" landscape.
// Matches the approved DepEd register layout:
//   header (payroll no. + school + acknowledgment line) → register table
//   (No. | Last | First | M.I. | Acct No. | Position | Amount | Net Due |
//   Signature | No.) → right-aligned "TOTAL FOR PAGE X" → page number.
// The last page carries the carried page-totals summary + GRAND TOTAL and the
// 3-column certification box (never split across pages).

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { currency } from '@/lib/reports';
import type { CaPayrollHeader } from '@/types/commAllowance';
import type { CaPrintPages, CaPrintRow } from '@/lib/commAllowance';

interface CommAllowancePrintProps {
  header: CaPayrollHeader;
  pages: CaPrintPages;
  signatories: Record<string, { name: string; position: string }>;
  onClose: () => void;
}

// US fanfold sheet dimensions (screen pixels at 96dpi): 14-7/8" × 11".
const SHEET_WIDTH_PX = 14.875 * 96;
const SHEET_HEIGHT_PX = 11 * 96;

export default function CommAllowancePrint({ header, pages, signatories, onClose }: CommAllowancePrintProps) {
  const [printing, setPrinting] = useState(false);
  // Screen-only auto-fit: scale the fanfold sheet down so the whole page is
  // visible in the preview pane (never affects the printed output).
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const end = () => { setPrinting(false); document.body.classList.remove('ca-printing'); };
    window.addEventListener('afterprint', end);
    return () => { window.removeEventListener('afterprint', end); document.body.classList.remove('ca-printing'); };
  }, []);

  useEffect(() => {
    const fit = () => {
      const avail = Math.max(320, window.innerWidth - 48);
      setScale(Math.min(1, avail / SHEET_WIDTH_PX));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const handlePrint = () => {
    setPrinting(true);
    document.body.classList.add('ca-printing');
    // Allow the browser to apply the print class before invoking print dialog.
    window.setTimeout(() => window.print(), 50);
  };

  const signatory = (type: string) => signatories[type] ?? { name: '', position: '' };
  const lastPage = pages.pages[pages.pages.length - 1];
  // +1in covers the sheet's vertical padding so the scroll area never clips it.
  const sheetHeightPx = Math.max(1, pages.pages.length) * SHEET_HEIGHT_PX + 96;

  // Strip a stored STACODE prefix/suffix (e.g. "003 - BUBUYAN ELEM SCHOOL" or
  // "BUBUYAN ELEM SCHOOL (003)") so only the plain school name prints.
  const cleanSchoolName = (name: string) =>
    name.replace(/^\s*\d{1,4}\s*[-–—]\s*/, '').replace(/\s*\(\s*\d{1,4}\s*\)\s*$/, '').trim();
  const schoolLabel = (name: string) => cleanSchoolName(name);

  // Numbering is per school: each school's first row is No. 1 and counts up;
  // a school continuing onto the next page keeps counting. Built globally from
  // the ordered pages so page boundaries never reset a school's sequence.
  const schoolNoByLine = new Map<number, number>();
  {
    let curKey = '';
    let curNo = 0;
    for (const pg of pages.pages) {
      for (const r of pg.rows) {
        const key = `${r.schoolName}|${r.stacode}`;
        if (key !== curKey) {
          curKey = key;
          curNo = 0;
        }
        curNo += 1;
        schoolNoByLine.set(r.lineNo, curNo);
      }
    }
  }

  // Render each page's rows: a banner row at the start of every school group,
  // and a subtotal row at the end of each school group (its rows on this page)
  // before the next school starts.
  const renderRows = (pageRows: CaPrintRow[]) => {
    const cells: ReactNode[] = [];
    let lastGroup = '';
    let groupSchool = '';
    let subAmount = 0;
    let subNet = 0;

    const flushSubtotal = () => {
      if (!groupSchool) return;
      cells.push(
        <tr key={`sub-${groupSchool}`} className="ca-print-school-subtotal">
          <td colSpan={6} className="ca-print-sub-label">SUBTOTAL — {schoolLabel(groupSchool)}</td>
          <td className="text-right ca-print-sub-amount">{currency(subAmount)}</td>
          <td className="text-right ca-print-sub-amount">{currency(subNet)}</td>
          <td colSpan={2} />
        </tr>,
      );
    };

    pageRows.forEach((r: CaPrintRow) => {
      const group = `${r.schoolName}|${r.stacode}`;
      if (group !== lastGroup) {
        flushSubtotal();
        lastGroup = group;
        groupSchool = r.schoolName;
        subAmount = 0;
        subNet = 0;
      }
      const no = schoolNoByLine.get(r.lineNo) ?? 0;
      subAmount += r.amount;
      subNet += r.net;
      cells.push(
        <tr key={r.lineNo}>
          <td className="text-center">{no}</td>
          <td>{r.lastName}</td>
          <td>{r.firstName}</td>
          <td className="text-center">{r.middleInitial}</td>
          <td className="text-center">{r.accountNo}</td>
          <td>{r.position}</td>
          <td className="text-right">{currency(r.amount)}</td>
          <td className="text-right">{currency(r.net)}</td>
          <td />
          <td className="text-center">{no}</td>
        </tr>,
      );
    });
    flushSubtotal();
    return cells;
  };

  return createPortal(
    <div className="ca-print-root" role="dialog" aria-modal="true" aria-label="Payroll print preview">
      <div className="ca-print-toolbar">
        <div>
          <p className="font-semibold text-white text-sm">Print Preview — {header.payroll_no}</p>
          <p className="text-deped-200 text-xs">US Fanfold 14-7/8" × 11" · Landscape · {pages.pages.length} page{pages.pages.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-deped-700 text-sm font-semibold hover:bg-deped-100 transition-colors">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={onClose} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </div>

      <div
        className="ca-print-sheet-wrap"
        style={scale < 1 ? { height: `${sheetHeightPx * scale}px` } : undefined}
      >
      <div
        className="ca-print-sheet"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
      >
        {pages.pages.map((page) => {
          // Page header reflects the first school group on that page.
          const firstRow = page.rows[0];
          const pageSchool = firstRow?.schoolName
            ? schoolLabel(firstRow.schoolName)
            : cleanSchoolName(header.school_name ?? '');
          return (
          <section key={page.pageNo} className="ca-print-page">
            <div className="ca-print-content">
            <CaPageHeader header={header} schoolLabel={pageSchool} />

            <table className="ca-print-table">
              <thead>
                <tr>
                  <th className="w-8">No.</th>
                  <th>Last Name</th>
                  <th>First Name</th>
                  <th className="w-8">M.I.</th>
                  <th className="w-24">Account No.</th>
                  <th>Position</th>
                  <th className="w-20">Amount</th>
                  <th className="w-24">Net Amount<br />Due</th>
                  <th className="w-24">Signature Recipient</th>
                  <th className="w-8">No.</th>
                </tr>
              </thead>
              <tbody>{renderRows(page.rows)}</tbody>
            </table>

            {/* Per-page subtotal — right-aligned, outside the table, per the form */}
            <div className="ca-print-page-total">
              <span>TOTAL FOR PAGE {page.pageNo}</span>
              <span className="ca-print-total-num">{currency(page.pageNet)}</span>
            </div>

            {/* Last page only: carried page totals (last page first) + GRAND TOTAL,
                then the certification / signatory block — never split across pages. */}
            {lastPage && page.pageNo === lastPage.pageNo && (
              <>
                <section className="ca-print-grand">
                  {[...pages.pages].reverse().map((pg) => (
                    <div key={pg.pageNo} className="ca-print-grand-row">
                      <span className="ca-print-grand-label">TOTAL FOR PAGE {pg.pageNo}</span>
                      <span className="ca-print-grand-num">{currency(pg.pageNet)}</span>
                    </div>
                  ))}
                  <div className="ca-print-grand-row ca-print-grand-total">
                    <span className="ca-print-grand-label">GRAND TOTAL</span>
                    <span className="ca-print-grand-num">{currency(pages.net)}</span>
                  </div>
                </section>

                {/* Certification / signatory block — 3 bordered columns */}
                <section className="ca-print-cert">
                  <div className="ca-print-cert-grid">
                    {/* Column 1: a + b */}
                    <div className="ca-print-cert-col">
                      <div className="ca-print-cert-block">
                        <p><strong>a.</strong> CERTIFIED: Services duly rendered as stated.</p>
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('authorized_official').name}</div>
                            <div className="ca-print-sign-pos">{signatory('authorized_official').position || 'Authorized Official'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="ca-print-cert-block">
                        <p>
                          <strong>b.</strong> CERTIFIED: Supporting documents complete and proper in the amount of{' '}
                          <span className="ca-print-amt-blank">______________________________</span> {currency(pages.net)}
                        </p>
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('accountant').name}</div>
                            <div className="ca-print-sign-pos">{signatory('accountant').position || 'City Accountant'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: c + d */}
                    <div className="ca-print-cert-col">
                      <div className="ca-print-cert-block">
                        <p><strong>c.</strong> CERTIFIED CORRECT:</p>
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('head_of_agency').name}</div>
                            <div className="ca-print-sign-pos">{signatory('head_of_agency').position || 'Head of Agency/Authorized Representative'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="ca-print-cert-block">
                        <p>
                          <strong>d.</strong> CERTIFIED: Each employee whose name appears above has been paid the amount
                          indicated opposite on his/her name.
                        </p>
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('cashier').name}</div>
                            <div className="ca-print-sign-pos">{signatory('cashier').position || 'Cashier I'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: City Mayor · EO · City Administrator · ALOBS/Date/JEV */}
                    <div className="ca-print-cert-col ca-print-cert-far">
                      <div className="ca-print-cert-block">
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('mayor').name}</div>
                            <div className="ca-print-sign-pos">{signatory('mayor').position || 'City Mayor'}</div>
                          </div>
                        </div>
                        <p className="ca-print-eo">As per EO No. {header.eo_no || '____________________'}</p>
                      </div>

                      <div className="ca-print-cert-block">
                        <div className="ca-print-cert-sign">
                          <div>
                            <div className="ca-print-sign-line">{signatory('city_admin').name}</div>
                            <div className="ca-print-sign-pos">{signatory('city_admin').position || 'City Administrator'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="ca-print-cert-ref ca-print-ref-col">
                        <span>ALOBS No. <strong>{header.alobs_no || '__________________'}</strong></span>
                        <span>Date <strong>{header.date || '__________________'}</strong></span>
                        <span>JEV No. <strong>{header.jev_no || '__________________'}</strong></span>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            <p className="ca-print-pageno">Page {page.pageNo} of {page.totalPages}</p>
            </div>
          </section>
          );
        })}
      </div>
      </div>
    </div>,
    document.body,
  );
}

function CaPageHeader({ header, schoolLabel }: { header: CaPayrollHeader; schoolLabel: string }) {
  return (
    <header className="ca-print-head">
      <h1>GENERAL PAYROLL</h1>
      <h2>{header.agency}</h2>
      <h3>{header.division}</h3>
      <h4>{header.payroll_type}</h4>
      <p className="ca-print-head-period">{header.covered_period}</p>

      <div className="ca-print-head-info">
        <span>Payroll No.: <strong>{header.payroll_no}</strong></span>
        <span>{schoolLabel}</span>
      </div>

      <p className="ca-print-ack">
        We acknowledge receipt of cash shown our name as full compensation for services rendered for the period covered.
      </p>
    </header>
  );
}
