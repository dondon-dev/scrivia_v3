import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadFile, currency } from './reports';
import { classifyStacode } from './payrollComputation';
import type { InitialPayrollRecord, InitialPayrollEntry, Signatory } from '@/types/initialPayroll';

const SIGNATORY_LABELS: Record<Signatory['role'], string> = {
  prepared_by: 'Prepared By',
  certified_correct: 'Certified Correct',
  checked_by: 'Checked By',
  recommending_approval: 'Recommending Approval',
  approved_by: 'Approved By',
};

function signatoryText(list: Signatory[], role: Signatory['role']): { name: string; position: string } {
  const s = list.find((x) => x.role === role && x.is_active);
  return { name: s?.name ?? '_________________', position: s?.position ?? '' };
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: '2-digit' });
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ── Excel Export (Government Initial Payroll layout) ─────────────────────────
//
// Reproduces the reference "INITIAL PAYROLL 2026.xlsx" single-sheet layout:
// 29 columns, two-row column header, ELEM / JHS / SHS grouped sections with
// subtotals, a grand total row, and a four-block certification/signature area.
// All computed cells are live Excel formulas that recalculate when inputs change.

const PAYROLL_COLS = [
  'NO.', 'SURNAME', 'FIRST NAME', 'MIDDLE NAME', 'EMPLOYEE NO.',
  'SCHOOL', 'TIN', 'PHILHEALTH NO.', 'HDMF NO.', 'ATM ACCOUNT NO.',
  'PERIOD COVERED', 'SG', 'MONTHLY SALARY', 'EFFECTIVITY DATE',
  'DAYS PRESENT (CSC)', 'DAYS PRESENT (CALENDAR)',
  'SALARY BASED ON CSC', 'SALARY BASED ON CALENDAR', 'PERA',
  'GSIS', 'PHILHEALTH', 'PAG-IBIG', 'TAX',
  'TOTAL DEDUCTIONS', 'AMOUNT DUE', 'ADDL', 'DED', 'TOTAL DUE',
] as const;

const PAYROLL_WIDTHS = [
  5, 18, 18, 8, 12,
  24, 16, 16, 14, 16,
  22, 5, 14, 14,
  12, 12,
  16, 16, 10,
  12, 12, 10, 12,
  14, 14, 10, 10, 14,
];

const NUM_FMT = '#,##0.00;(#,##0.00);"-"';
const DATE_FMT = 'mm/dd/yyyy';

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function daysInMonth(dateStr: string | null): number {
  if (!dateStr) return 22;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 22;
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function styleHeaderCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

function styleDataCell(cell: ExcelJS.Cell, numeric: boolean): void {
  cell.font = { size: 8 };
  cell.alignment = {
    horizontal: numeric ? 'right' : 'left',
    vertical: 'middle',
    wrapText: false,
  };
  cell.border = {
    top: { style: 'hair' }, bottom: { style: 'hair' },
    left: { style: 'hair' }, right: { style: 'hair' },
  };
}

function styleTotalCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 8 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

// Tax formula implementing the spec's two-step logic:
//   1. Project annual taxable income = Monthly × RemainingMonths − (GSIS+PHIC+PIBIG) × RemainingMonths
//      where RemainingMonths = 12 − MONTH(EffectivityDate) + 1 (inclusive of current month).
//      If ≤ 250,000 → Tax = 0.
//   2. Otherwise apply the monthly BIR TRAIN withholding table to
//      Salary(Calendar) − GSIS − PhilHealth − Pag-IBIG.
function taxFormula(
  salaryCalCell: string,
  gsisCell: string,
  phicCell: string,
  pagibigCell: string,
  monthlyCell: string,
  effectivityCell: string,
): string {
  const monthlyTaxable = `(${salaryCalCell}-${gsisCell}-${phicCell}-${pagibigCell})`;
  const remainingMonths = `IF(ISNUMBER(${effectivityCell}),12-MONTH(${effectivityCell})+1,12)`;
  const projectedAnnualTaxable = `(${monthlyCell}*${remainingMonths}-(${gsisCell}+${phicCell}+${pagibigCell})*${remainingMonths})`;
  const monthlyTable = [
    `IF(${monthlyTaxable}<=20833,0,`,
    `IF(${monthlyTaxable}<=33332,ROUND((${monthlyTaxable}-20833)*0.15,2),`,
    `IF(${monthlyTaxable}<=66666,ROUND(1875+((${monthlyTaxable}-33333)*0.2),2),`,
    `IF(${monthlyTaxable}<=166666,ROUND(8541.8+((${monthlyTaxable}-66667)*0.25),2),`,
    `IF(${monthlyTaxable}<=666666,ROUND(33541.8+((${monthlyTaxable}-166667)*0.3),2),`,
    `ROUND(183541.8+((${monthlyTaxable}-666667)*0.35),2))))))`,
  ].join('');
  return `IF(${projectedAnnualTaxable}<=250000,0,${monthlyTable})`;
}

export async function exportInitialPayrollExcel(
  record: InitialPayrollRecord,
  entries: InitialPayrollEntry[],
  signatories: Signatory[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DepEd Payroll System';
  wb.created = new Date();

  const ws = wb.addWorksheet('Initial Payroll', {
    properties: { defaultRowHeight: 16 },
    pageSetup: {
      paperSize: 5, // Legal
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        top: 0.4, bottom: 0.4, left: 0.3, right: 0.3,
        header: 0.2, footer: 0.2,
      },
    },
    views: [{ showGridLines: false }],
  });

  // Column widths (1-indexed)
  PAYROLL_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const totalCols = PAYROLL_COLS.length; // 29
  const periodCovered = `${fmtDate(record.period_from)} - ${fmtDate(record.period_to)}`;
  const totalDaysInMonth = daysInMonth(record.period_to || record.period_from);

  // ── Title block (rows 1-5) ──
  ws.mergeCells(1, 1, 1, totalCols);
  const t1 = ws.getCell('A1');
  t1.value = 'DEPARTMENT OF EDUCATION';
  t1.font = { bold: true, size: 12 };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 20;

  ws.mergeCells(2, 1, 2, totalCols);
  const t2 = ws.getCell('A2');
  t2.value = 'INITIAL PAYROLL';
  t2.font = { bold: true, size: 11 };
  t2.alignment = { horizontal: 'center' };

  ws.mergeCells(3, 1, 3, totalCols);
  const t3 = ws.getCell('A3');
  t3.value = record.description || '';
  t3.font = { bold: true, size: 10 };
  t3.alignment = { horizontal: 'center' };

  ws.mergeCells(4, 1, 4, totalCols);
  const t4 = ws.getCell('A4');
  t4.value = `PAYROLL NO. ${record.payroll_no}    |    Payroll Date: ${fmtDate(record.payroll_date)}    |    Period: ${periodCovered}`;
  t4.font = { size: 10 };
  t4.alignment = { horizontal: 'center' };

  ws.getRow(5).height = 4;

  // ── Column headers (rows 6-7) ──
  const headerRow1 = ws.getRow(6);
  const headerRow2 = ws.getRow(7);
  PAYROLL_COLS.forEach((h, i) => {
    const c1 = headerRow1.getCell(i + 1);
    c1.value = h;
    styleHeaderCell(c1);
    const c2 = headerRow2.getCell(i + 1);
    c2.value = '';
    styleHeaderCell(c2);
  });
  // Merge the two header rows for each column (vertical merge)
  for (let i = 1; i <= totalCols; i++) {
    ws.mergeCells(6, i, 7, i);
  }
  ws.getRow(6).height = 28;
  ws.getRow(7).height = 4;

  // ── Group entries into ELEM, JHS, SHS ──
  const groups: { key: 'ELEM' | 'JHS' | 'SHS'; label: string }[] = [
    { key: 'ELEM', label: 'ELEMENTARY' },
    { key: 'JHS', label: 'JUNIOR HIGH SCHOOL' },
    { key: 'SHS', label: 'SENIOR HIGH SCHOOL' },
  ];
  const grouped: Record<'ELEM' | 'JHS' | 'SHS', InitialPayrollEntry[]> = {
    ELEM: [], JHS: [], SHS: [],
  };
  entries.forEach((e) => {
    const g = (e.school_group as 'ELEM' | 'JHS' | 'SHS' | null) ?? classifyStacode(e.stacode || '');
    grouped[g].push(e);
  });

  // Column letter references (1-indexed -> letter)
  const CL = (n: number) => colLetter(n - 1);
  // Column indices (1-based) for formula building
  const C = {
    no: 1, surname: 2, firstName: 3, middleName: 4, empNo: 5,
    school: 6, tin: 7, phicNo: 8, hdmfNo: 9, atmNo: 10,
    period: 11, sg: 12, monthly: 13, effectivity: 14,
    daysCsc: 15, daysCal: 16,
    salCsc: 17, salCal: 18, pera: 19,
    gsis: 20, phic: 21, pagibig: 22, tax: 23,
    totalDed: 24, amountDue: 25, addl: 26, ded: 27, totalDue: 28,
  };

  let currentRow = 8;
  const subtotalRows: number[] = [];
  const allDataRowRows: number[] = [];

  groups.forEach((grp) => {
    const groupEntries = grouped[grp.key];
    if (groupEntries.length === 0) return;

    // Section header row
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const sectionCell = ws.getCell(currentRow, 1);
    sectionCell.value = grp.label;
    sectionCell.font = { bold: true, size: 10 };
    sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF2' } };
    sectionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sectionCell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
    ws.getRow(currentRow).height = 18;
    currentRow++;

    const groupStartRow = currentRow;

    groupEntries.forEach((e, idx) => {
      const r = currentRow;
      allDataRowRows.push(r);

      // Input / text columns
      const inputs: Record<number, string | number | Date> = {
        [C.no]: idx + 1,
        [C.surname]: safeStr(e.surname),
        [C.firstName]: safeStr(e.first_name),
        [C.middleName]: safeStr(e.middle_name),
        [C.empNo]: safeStr(e.employee_number),
        [C.school]: safeStr(e.school),
        [C.tin]: safeStr(e.tin),
        [C.phicNo]: safeStr(e.philhealth_no),
        [C.hdmfNo]: safeStr(e.hdmf_no),
        [C.atmNo]: safeStr(e.atm_account_no),
        [C.period]: periodCovered,
        [C.sg]: e.salary_grade ?? '',
        [C.monthly]: e.monthly_salary,
        [C.effectivity]: e.effectivity_date ? new Date(e.effectivity_date) : '',
        [C.daysCsc]: e.days_worked,
        [C.daysCal]: e.calendar_days,
        [C.addl]: e.additional_adjustments,
        [C.ded]: e.adjustment_deductions,
      };

      Object.entries(inputs).forEach(([colStr, val]) => {
        const ci = Number(colStr);
        const cell = ws.getCell(r, ci);
        cell.value = val;
        const isNumeric = typeof val === 'number';
        styleDataCell(cell, isNumeric);
        if (isNumeric && ci !== C.no && ci !== C.sg) {
          cell.numFmt = ci === C.monthly || ci === C.addl || ci === C.ded ? NUM_FMT : NUM_FMT;
        }
        if (ci === C.effectivity && e.effectivity_date) {
          cell.numFmt = DATE_FMT;
        }
      });

      // Formula columns (dynamic)
      const rowAddr = (col: number) => `${CL(col)}${r}`;

      // Sal CSC = ROUND((Days_CSC/22)*Monthly,2)
      const salCscCell = ws.getCell(r, C.salCsc);
      salCscCell.value = { formula: `ROUND((${rowAddr(C.daysCsc)}/22)*${rowAddr(C.monthly)},2)` };
      salCscCell.numFmt = NUM_FMT;
      styleDataCell(salCscCell, true);

      // Sal Calendar = ROUND((Days_Cal/TotalDaysInMonth)*Monthly,2)
      const salCalCell = ws.getCell(r, C.salCal);
      salCalCell.value = { formula: `ROUND((${rowAddr(C.daysCal)}/${totalDaysInMonth})*${rowAddr(C.monthly)},2)` };
      salCalCell.numFmt = NUM_FMT;
      styleDataCell(salCalCell, true);

      // PERA = ROUND((Days_CSC/22)*2000,2)
      const peraCell = ws.getCell(r, C.pera);
      peraCell.value = { formula: `ROUND((${rowAddr(C.daysCsc)}/22)*2000,2)` };
      peraCell.numFmt = NUM_FMT;
      styleDataCell(peraCell, true);

      // GSIS = ROUND(SalCal*0.09,2)
      const gsisCell = ws.getCell(r, C.gsis);
      gsisCell.value = { formula: `ROUND(${rowAddr(C.salCal)}*0.09,2)` };
      gsisCell.numFmt = NUM_FMT;
      styleDataCell(gsisCell, true);

      // PhilHealth = IF(DaysCsc>2, ROUND(Monthly*0.025,2), 0)
      const phicCell = ws.getCell(r, C.phic);
      phicCell.value = { formula: `IF(${rowAddr(C.daysCsc)}>2,ROUND(${rowAddr(C.monthly)}*0.025,2),0)` };
      phicCell.numFmt = NUM_FMT;
      styleDataCell(phicCell, true);

      // Pag-IBIG = 200 if days present > 2, else 0 (eligible)
      const pagibigCell = ws.getCell(r, C.pagibig);
      pagibigCell.value = { formula: `IF(${rowAddr(C.daysCsc)}>2,200,0)` };
      pagibigCell.numFmt = NUM_FMT;
      styleDataCell(pagibigCell, true);

      // Tax
      const taxCell = ws.getCell(r, C.tax);
      taxCell.value = { formula: taxFormula(rowAddr(C.salCal), rowAddr(C.gsis), rowAddr(C.phic), rowAddr(C.pagibig), rowAddr(C.monthly), rowAddr(C.effectivity)) };
      taxCell.numFmt = NUM_FMT;
      styleDataCell(taxCell, true);

      // Total Deductions = Tax + GSIS + PHIC + PagIBIG
      const tdCell = ws.getCell(r, C.totalDed);
      tdCell.value = { formula: `${rowAddr(C.tax)}+${rowAddr(C.gsis)}+${rowAddr(C.phic)}+${rowAddr(C.pagibig)}` };
      tdCell.numFmt = NUM_FMT;
      styleDataCell(tdCell, true);

      // Amount Due = SalCal - TotalDed
      const adCell = ws.getCell(r, C.amountDue);
      adCell.value = { formula: `${rowAddr(C.salCal)}-${rowAddr(C.totalDed)}` };
      adCell.numFmt = NUM_FMT;
      styleDataCell(adCell, true);

      // Total Due = AmountDue + ADDL - DED
      const tuCell = ws.getCell(r, C.totalDue);
      tuCell.value = { formula: `${rowAddr(C.amountDue)}+${rowAddr(C.addl)}-${rowAddr(C.ded)}` };
      tuCell.numFmt = NUM_FMT;
      styleDataCell(tuCell, true);

      ws.getRow(r).height = 14;
      currentRow++;
    });

    const groupEndRow = currentRow - 1;

    // ── Subtotal row for this group ──
    const stRow = currentRow;
    subtotalRows.push(stRow);

    ws.mergeCells(stRow, 1, stRow, 4);
    const stLabelCell = ws.getCell(stRow, 1);
    stLabelCell.value = `SUBTOTAL - ${grp.label}`;
    stLabelCell.font = { bold: true, size: 8 };
    stLabelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    stLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
    stLabelCell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };

    // Apply total styling + SUM formulas to numeric columns
    const sumCols = [C.salCsc, C.salCal, C.pera, C.gsis, C.phic, C.pagibig, C.tax, C.totalDed, C.amountDue, C.totalDue];
    sumCols.forEach((ci) => {
      const cell = ws.getCell(stRow, ci);
      cell.value = { formula: `SUM(${CL(ci)}${groupStartRow}:${CL(ci)}${groupEndRow})` };
      cell.numFmt = NUM_FMT;
      styleTotalCell(cell);
    });
    // Also style the non-sum cells in subtotal row for consistent border
    for (let ci = 5; ci <= totalCols; ci++) {
      if (!sumCols.includes(ci)) {
        const cell = ws.getCell(stRow, ci);
        if (cell.value === null || cell.value === undefined) {
          cell.value = '';
        }
        styleTotalCell(cell);
      }
    }
    ws.getRow(stRow).height = 16;
    currentRow++;

    // Spacer row
    ws.getRow(currentRow).height = 4;
    currentRow++;
  });

  // ── Grand Total row ──
  const gtRow = currentRow;
  ws.mergeCells(gtRow, 1, gtRow, 4);
  const gtLabel = ws.getCell(gtRow, 1);
  gtLabel.value = 'GRAND TOTAL';
  gtLabel.font = { bold: true, size: 9 };
  gtLabel.alignment = { horizontal: 'left', vertical: 'middle' };
  gtLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8D8C9' } };
  gtLabel.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  const grandSumCols = [C.salCsc, C.salCal, C.pera, C.gsis, C.phic, C.pagibig, C.tax, C.totalDed, C.amountDue, C.totalDue];
  grandSumCols.forEach((ci) => {
    const cell = ws.getCell(gtRow, ci);
    const sumArgs = subtotalRows.map((sr) => `${CL(ci)}${sr}`).join(',');
    cell.value = { formula: `SUM(${sumArgs})` };
    cell.numFmt = NUM_FMT;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8D8C9' } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  for (let ci = 5; ci <= totalCols; ci++) {
    if (!grandSumCols.includes(ci)) {
      const cell = ws.getCell(gtRow, ci);
      cell.value = '';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8D8C9' } };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    }
  }
  ws.getRow(gtRow).height = 18;
  currentRow += 3;

  // ── Certification / Signature section ──
  // Four blocks in a 2x2 arrangement matching the reference:
  //   A. Certified: Service duly rendered as stated       — Administrative Officer IV - Personnel
  //   B. Certified: Supporting documents complete/proper  — Accountant III
  //   C. Approved for payment                             — Schools Division Superintendent
  //   D. Cashier
  const certBlocks: { label: string; role: Signatory['role']; defaultPosition: string }[] = [
    { label: 'A. CERTIFIED: SERVICE DULY RENDERED AS STATED', role: 'certified_correct', defaultPosition: 'Administrative Officer IV - Personnel' },
    { label: 'B. CERTIFIED: SUPPORTING DOCUMENTS COMPLETE AND PROPER', role: 'checked_by', defaultPosition: 'Accountant III' },
    { label: 'C. APPROVED FOR PAYMENT', role: 'approved_by', defaultPosition: 'Schools Division Superintendent' },
    { label: 'D. CASHIER', role: 'prepared_by', defaultPosition: 'Cashier' },
  ];

  const certStartRow = currentRow;
  const blockHeight = 5; // rows per cert block
  const colSpan = Math.floor(totalCols / 2); // 14 columns per side

  certBlocks.forEach((block, i) => {
    const isLeft = i % 2 === 0;
    const blockRow = certStartRow + Math.floor(i / 2) * (blockHeight + 1);
    const startCol = isLeft ? 1 : colSpan + 2;
    const endCol = isLeft ? colSpan : totalCols;

    // Label row
    ws.mergeCells(blockRow, startCol, blockRow, endCol);
    const labelCell = ws.getCell(blockRow, startCol);
    labelCell.value = block.label;
    labelCell.font = { bold: true, size: 9 };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    labelCell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };

    // Blank gap
    ws.getRow(blockRow + 1).height = 18;

    // Signature line (name)
    ws.mergeCells(blockRow + 2, startCol, blockRow + 2, endCol);
    const sig = signatoryText(signatories, block.role);
    const nameCell = ws.getCell(blockRow + 2, startCol);
    nameCell.value = sig.name;
    nameCell.font = { bold: true, size: 10, underline: true };
    nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    nameCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };

    // Position
    ws.mergeCells(blockRow + 3, startCol, blockRow + 3, endCol);
    const posCell = ws.getCell(blockRow + 3, startCol);
    posCell.value = sig.position || block.defaultPosition;
    posCell.font = { size: 9, italic: true };
    posCell.alignment = { horizontal: 'center', vertical: 'middle' };
    posCell.border = {
      bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // Print setup: repeat header rows on each page
  ws.pageSetup.printTitlesRow = '6:7';

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadFile({
    filename: `INITIAL_PAYROLL_${dateStr}.xlsx`,
    content: new Uint8Array(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export function exportInitialPayrollPdf(
  record: InitialPayrollRecord,
  entries: InitialPayrollEntry[],
  signatories: Signatory[],
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const periodCovered = `${fmtDate(record.period_from)} - ${fmtDate(record.period_to)}`;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DEPARTMENT OF EDUCATION', pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.text('INITIAL PAYROLL', pageWidth / 2, 18, { align: 'center' });
  if (record.description) {
    doc.setFontSize(9);
    doc.text(record.description, pageWidth / 2, 24, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `PAYROLL NO. ${record.payroll_no}   |   Payroll Date: ${fmtDate(record.payroll_date)}   |   Period: ${periodCovered}`,
    pageWidth / 2, 30, { align: 'center' },
  );

  // Table
  const head = [[
    'No.', 'Surname', 'First Name', 'Emp No.', 'School', 'SG', 'Monthly', 'Days', 'Gross',
    'PERA', 'GSIS', 'PhilHealth', 'Pag-IBIG', 'W/Tax', 'Loans', 'Total Ded.', 'Net Pay',
  ]];

  const body = entries.map((e, i) => [
    String(i + 1),
    safeStr(e.surname).slice(0, 14),
    safeStr(e.first_name).slice(0, 14),
    safeStr(e.employee_number).slice(0, 8),
    safeStr(e.school).slice(0, 12),
    String(e.salary_grade ?? ''),
    currency(e.monthly_salary),
    String(e.days_worked),
    currency(e.gross_salary),
    currency(e.pera),
    currency(e.gsis),
    currency(e.philhealth),
    currency(e.pagibig),
    currency(e.withholding_tax),
    currency(e.loans),
    currency(e.total_deductions),
    currency(e.net_pay),
  ]);

  const totalGross = entries.reduce((s, e) => s + e.gross_salary, 0);
  const totalDed = entries.reduce((s, e) => s + e.total_deductions, 0);
  const totalNet = entries.reduce((s, e) => s + e.net_pay, 0);
  body.push([
    '', 'TOTAL', '', '', '', '', '', '',
    currency(totalGross), '', currency(entries.reduce((s,e)=>s+e.gsis,0)),
    currency(entries.reduce((s,e)=>s+e.philhealth,0)),
    currency(entries.reduce((s,e)=>s+e.pagibig,0)),
    currency(entries.reduce((s,e)=>s+e.withholding_tax,0)),
    currency(entries.reduce((s,e)=>s+e.loans,0)),
    currency(totalDed), currency(totalNet),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 34,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1, overflow: 'hidden' as const },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8 },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [209, 231, 221];
      }
      if (data.section === 'body' && data.column.index >= 6) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  // Signatories on last page
  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  const sigRoles: Signatory['role'][] = ['prepared_by', 'certified_correct', 'checked_by', 'recommending_approval', 'approved_by'];
  let y = afterTableY;

  doc.setFontSize(8);
  sigRoles.forEach((role) => {
    const { name, position } = signatoryText(signatories, role);
    doc.setFont('helvetica', 'bold');
    doc.text(`${SIGNATORY_LABELS[role]}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(name, 70, y);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    if (position) doc.text(position, 70, y + 4);
    doc.setFontSize(8);
    y += 14;
  });

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`INITIAL_PAYROLL_${dateStr}.pdf`);
}

// ── Roster Exports ────────────────────────────────────────────────────────────

import type { EmployeePayrollStatus } from '@/types/initialPayroll';

export async function exportRosterExcel(
  employees: EmployeePayrollStatus[],
  title: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Roster', {
    pageSetup: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
  });

  const COLS = [
    'No.', 'Emp No.', 'Last Name', 'First Name', 'Middle Name',
    'Position', 'Department', 'Stacode', 'Grade', 'Step',
    'Monthly Salary', 'TIN', 'PhilHealth', 'Pag-IBIG', 'ATM Account',
    'Appt.', 'TIN Sub.', 'PHIC Sub.', 'HDMF Sub.', 'ATM Sub.', 'Status',
  ];
  ws.columns = COLS.map((h) => ({ header: h, width: h.length > 14 ? 18 : 12 }));

  ws.mergeCells(1, 1, 1, COLS.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 22;

  const headerRow = ws.getRow(3);
  COLS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getRow(3).height = 28;

  employees.forEach((e, idx) => {
    const row = ws.getRow(4 + idx);
    const vals: (string | number)[] = [
      idx + 1,
      safeStr(e.employee_number),
      safeStr(e.last_name || e.lname),
      safeStr(e.first_name || e.fname),
      safeStr(e.middle_name || e.mi),
      safeStr(e.position),
      safeStr(e.department),
      safeStr(e.stacode),
      e.grade ?? '',
      e.step ?? '',
      Number(e.basic ?? e.basic_salary ?? 0),
      safeStr(e.tin),
      safeStr(e.philhealth_number),
      safeStr(e.pagibig_number),
      safeStr(e.bank_account),
      e.req_appointment_validated ? 'YES' : 'NO',
      e.req_tin_submitted ? 'YES' : 'NO',
      e.req_philhealth_submitted ? 'YES' : 'NO',
      e.req_pagibig_submitted ? 'YES' : 'NO',
      e.req_atm_submitted ? 'YES' : 'NO',
      safeStr(e.payroll_status),
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: typeof v === 'number' ? 'right' : 'left', vertical: 'middle' };
      cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
    });
    row.height = 16;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadFile({
    filename: `INITIAL_PAYROLL_ROSTER_${dateStr}.xlsx`,
    content: new Uint8Array(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function exportRosterPdf(
  employees: EmployeePayrollStatus[],
  title: string,
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DEPARTMENT OF EDUCATION', pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.text(title, pageWidth / 2, 18, { align: 'center' });

  const head = [[
    'No.', 'Emp No.', 'Last Name', 'First Name', 'Position', 'Stacode',
    'SG', 'Step', 'Monthly', 'TIN', 'PHIC', 'HDMF', 'ATM',
    'Appt', 'TIN', 'PHIC', 'HDMF', 'ATM', 'Status',
  ]];

  const body = employees.map((e, i) => [
    String(i + 1),
    safeStr(e.employee_number).slice(0, 10),
    safeStr(e.last_name || e.lname).slice(0, 14),
    safeStr(e.first_name || e.fname).slice(0, 14),
    safeStr(e.position).slice(0, 14),
    safeStr(e.stacode).slice(0, 8),
    String(e.grade ?? ''),
    String(e.step ?? ''),
    currency(Number(e.basic ?? e.basic_salary ?? 0)),
    safeStr(e.tin).slice(0, 12),
    safeStr(e.philhealth_number).slice(0, 12),
    safeStr(e.pagibig_number).slice(0, 12),
    safeStr(e.bank_account).slice(0, 12),
    e.req_appointment_validated ? 'Y' : 'N',
    e.req_tin_submitted ? 'Y' : 'N',
    e.req_philhealth_submitted ? 'Y' : 'N',
    e.req_pagibig_submitted ? 'Y' : 'N',
    e.req_atm_submitted ? 'Y' : 'N',
    safeStr(e.payroll_status).slice(0, 10),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 24,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1, overflow: 'hidden' as const },
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 8)) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`INITIAL_PAYROLL_ROSTER_${dateStr}.pdf`);
}

// ── Payroll Number Generator ──────────────────────────────────────────────────

export function formatPayrollNo(year: number, month: number, seq: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;
}
