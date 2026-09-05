// ── GSIS Remittance Excel Export ─────────────────────────────────────────────
// Generates a multi-sheet Excel workbook for agency submission to GSIS:
//   Sheet 1 — Compulsory Premiums (PS/GS/EC per employee)
//   Sheet 2 — Loan Billing Summary (by account type)
//   Sheet 3 — Agency Remittance Summary (grand totals)
//
// Mirrors the output of GSISARS.PRG and GSISCOMP.PRG from the original
// FoxPro system, formatted for GSIS electronic submission.
// ────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import { downloadFile } from './reports';
import {
  GSIS_LOAN_TYPES,
  GSIS_PREMIUM_TYPES,
  GSIS_PRENEED_PRODUCTS,
  GSIS_HOUSING_LOANS,
} from './govPayrollComputation';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROUND2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

// ── Types ──────────────────────────────────────────────────────────────────

export interface PremiumRecord {
  empNo: string;
  name: string;
  basic: number;
  personalShare: number;   // L&R PS
  governmentShare: number; // L&R GS
  ecContribution: number;  // EC
  staCode?: string;
  divCode?: string;
}

export interface LoanBillingRecord {
  account: string;
  description: string;
  amount: number;
  count: number;
}

export interface RemittanceTotals {
  totalPs: number;
  totalGs: number;
  totalEc: number;
  employeeCount: number;
}

// ── Styling constants ──────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const SUBTITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 };
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FFF0F4F8' },
};
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10 };
const CURRENCY_FMT = '#,##0.00';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
    };
  });
  row.height = 28;
}

function styleCurrencyCell(cell: ExcelJS.Cell) {
  cell.numFmt = CURRENCY_FMT;
  cell.alignment = { horizontal: 'right' };
}

function addPageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: undefined,
  };
  ws.headerFooter = {
    oddFooter: '&CPage &P of &N',
    oddHeader: '&LGSIS Remittance&R&Draft',
  };
}

// ── Main Export Function ───────────────────────────────────────────────────

export async function exportGsisRemittanceExcel(params: {
  premiums: PremiumRecord[];
  loanBilling: LoanBillingRecord[];
  totals: RemittanceTotals;
  period: string;
  divCode?: string;
  divName?: string;
}): Promise<void> {
  const { premiums, loanBilling, totals, period, divCode, divName } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scrivia Cloud';
  wb.created = new Date();

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 1: Compulsory Premiums (GSISCOMP.PRG)
  // ════════════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Compulsory Premiums', { properties: { defaultColWidth: 14 } });
  addPageSetup(ws1);

  // Agency header
  ws1.mergeCells('A1:H1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = 'GOVERNMENT SERVICE INSURANCE SYSTEM';
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { horizontal: 'center' };

  ws1.mergeCells('A2:H2');
  const subCell = ws1.getCell('A2');
  subCell.value = 'COMPULSORY PREMIUMS REMITTANCE';
  subCell.font = SUBTITLE_FONT;
  subCell.alignment = { horizontal: 'center' };

  ws1.mergeCells('A3:H3');
  const periodCell = ws1.getCell('A3');
  periodCell.value = `Period: ${period}${divCode ? ` | Division: ${divCode}${divName ? ' — ' + divName : ''}` : ''}`;
  periodCell.font = { size: 10, italic: true };
  periodCell.alignment = { horizontal: 'center' };

  ws1.mergeCells('A4:H4');

  // Column headers
  const headers = ['No.', 'Emp No.', 'Employee Name', 'Station', 'Basic Salary', 'Personal Share (L&R)', 'Government Share (L&R)', 'EC Contribution'];
  const headerRow = ws1.addRow(headers);
  styleHeaderRow(headerRow);

  // Data rows
  premiums.forEach((p, i) => {
    const row = ws1.addRow([
      i + 1,
      p.empNo,
      p.name,
      p.staCode || '',
      ROUND2(p.basic),
      ROUND2(p.personalShare),
      ROUND2(p.governmentShare),
      ROUND2(p.ecContribution),
    ]);
    // Alternate row shading
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
    // Currency formatting for amount columns
    for (let c = 5; c <= 8; c++) {
      styleCurrencyCell(row.getCell(c));
    }
    row.getCell(1).alignment = { horizontal: 'center' };
  });

  // Totals row
  const totalRow = ws1.addRow([
    '',
    '',
    `TOTAL (${totals.employeeCount} employees)`,
    '',
    ROUND2(premiums.reduce((s, p) => s + p.basic, 0)),
    ROUND2(totals.totalPs),
    ROUND2(totals.totalGs),
    ROUND2(totals.totalEc),
  ]);
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
  });
  for (let c = 5; c <= 8; c++) {
    styleCurrencyCell(totalRow.getCell(c));
  }

  // Column widths
  ws1.getColumn(1).width = 6;
  ws1.getColumn(2).width = 12;
  ws1.getColumn(3).width = 30;
  ws1.getColumn(4).width = 10;
  ws1.getColumn(5).width = 16;
  ws1.getColumn(6).width = 20;
  ws1.getColumn(7).width = 22;
  ws1.getColumn(8).width = 18;

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 2: Loan Billing Summary (GSISARS.PRG)
  // ════════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Loan Billing', { properties: { defaultColWidth: 14 } });
  addPageSetup(ws2);

  ws2.mergeCells('A1:D1');
  ws2.getCell('A1').value = 'GSIS LOAN BILLING SUMMARY';
  ws2.getCell('A1').font = TITLE_FONT;
  ws2.getCell('A1').alignment = { horizontal: 'center' };

  ws2.mergeCells('A2:D2');
  ws2.getCell('A2').value = `Period: ${period}`;
  ws2.getCell('A2').font = { size: 10, italic: true };
  ws2.getCell('A2').alignment = { horizontal: 'center' };

  ws2.mergeCells('A3:D3');

  const loanHeaders = ['Account Code', 'Description', 'Amount', 'Employee Count'];
  const loanHeaderRow = ws2.addRow(loanHeaders);
  styleHeaderRow(loanHeaderRow);

  let loanGrandTotal = 0;
  loanBilling.forEach((lb, i) => {
    const row = ws2.addRow([lb.account, lb.description, ROUND2(lb.amount), lb.count]);
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
    styleCurrencyCell(row.getCell(3));
    row.getCell(1).font = { bold: true };
    loanGrandTotal += lb.amount;
  });

  const loanTotalRow = ws2.addRow(['', 'GRAND TOTAL', ROUND2(loanGrandTotal), '']);
  loanTotalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
  });
  styleCurrencyCell(loanTotalRow.getCell(3));

  ws2.getColumn(1).width = 16;
  ws2.getColumn(2).width = 35;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(4).width = 18;

  // ════════════════════════════════════════════════════════════════════════
  // SHEET 3: Agency Remittance Summary
  // ════════════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Agency Summary', { properties: { defaultColWidth: 14 } });
  addPageSetup(ws3);

  ws3.mergeCells('A1:C1');
  ws3.getCell('A1').value = 'AGENCY REMITTANCE SUMMARY';
  ws3.getCell('A1').font = TITLE_FONT;
  ws3.getCell('A1').alignment = { horizontal: 'center' };

  ws3.mergeCells('A2:C2');
  ws3.getCell('A2').value = `Period: ${period}${divCode ? ` | Division: ${divCode}` : ''}`;
  ws3.getCell('A2').font = { size: 10, italic: true };
  ws3.getCell('A2').alignment = { horizontal: 'center' };

  ws3.mergeCells('A3:C3');

  // Summary section
  const summaryHeaders = ['Category', 'Amount', 'Notes'];
  const summaryHeaderRow = ws3.addRow(summaryHeaders);
  styleHeaderRow(summaryHeaderRow);

  const summaryData = [
    ['Personal Share (L&R) — Employee', totals.totalPs, `${totals.employeeCount} employees × L&R PS rate`],
    ['Government Share (L&R) — Agency', totals.totalGs, 'Agency counterpart at 12% of basic'],
    ['EC Contribution — Agency', totals.totalEc, 'Agency counterpart at 1% of basic'],
    ['Total Compulsory Premiums', ROUND2(totals.totalPs + totals.totalGs + totals.totalEc), ''],
    [''],
    ['LOAN BILLING', '', ''],
    ...loanBilling.map(lb => [lb.description || lb.account, ROUND2(lb.amount), `${lb.count} accounts`]),
    ['Total Loan Billing', ROUND2(loanGrandTotal), ''],
    [''],
    ['GRAND TOTAL — AGENCY REMITTANCE', ROUND2(totals.totalPs + totals.totalGs + totals.totalEc + loanGrandTotal), ''],
  ];

  summaryData.forEach((data, i) => {
    const row = ws3.addRow(data);
    if (typeof data[0] === 'string' && data[0].includes('TOTAL')) {
      row.eachCell((cell) => {
        cell.fill = TOTAL_FILL;
        cell.font = TOTAL_FONT;
      });
    }
    if (typeof data[1] === 'number') {
      styleCurrencyCell(row.getCell(2));
    }
  });

  ws3.getColumn(1).width = 40;
  ws3.getColumn(2).width = 20;
  ws3.getColumn(3).width = 40;

  // ════════════════════════════════════════════════════════════════════════
  // Download
  // ════════════════════════════════════════════════════════════════════════
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `GSIS_Remittance_${period.replace(/\//g, '-')}${divCode ? '_' + divCode : ''}.xlsx`;
  downloadFile({
    filename,
    content: new Uint8Array(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Helper: Build loan billing records from GSIS bill account types ────────

export function buildLoanBillingRecords(billings: { account: string; amount: number }[]): LoanBillingRecord[] {
  const accountMap = new Map<string, LoanBillingRecord>();
  const ALL_ACCOUNTS: Record<string, string> = {
    ...GSIS_PREMIUM_TYPES,
    ...GSIS_LOAN_TYPES,
    ...GSIS_PRENEED_PRODUCTS,
    ...GSIS_HOUSING_LOANS,
  };

  for (const b of billings) {
    const acct = b.account?.trim() || 'Unknown';
    const existing = accountMap.get(acct);
    if (existing) {
      existing.amount += Number(b.amount) || 0;
      existing.count++;
    } else {
      accountMap.set(acct, {
        account: acct,
        description: ALL_ACCOUNTS[acct] || acct,
        amount: Number(b.amount) || 0,
        count: 1,
      });
    }
  }

  return Array.from(accountMap.values()).sort((a, b) => b.amount - a.amount);
}
