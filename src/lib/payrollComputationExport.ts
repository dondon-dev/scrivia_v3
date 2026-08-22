// ── Computation Engine Excel & PDF Exports ────────────────────────────────
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadFile, currency } from './reports';
import {
  type PayrollSummary, type ComputedEntry, type GroupSummary,
  SCHOOL_GROUP_LABELS,
} from './payrollComputation';
import type { Signatory } from '@/types/initialPayroll';

const SIG_LABELS: Record<Signatory['role'], string> = {
  prepared_by: 'Prepared By',
  certified_correct: 'Certified Correct',
  checked_by: 'Checked By',
  recommending_approval: 'Recommending Approval',
  approved_by: 'Approved By',
};

function sigText(list: Signatory[], role: Signatory['role']) {
  const s = list.find((x) => x.role === role && x.is_active);
  return { name: s?.name ?? '_________________', position: s?.position ?? '' };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: '2-digit' });
}

// ── Excel Export ───────────────────────────────────────────────────────────

export async function exportComputedPayrollExcel(
  summary: PayrollSummary,
  payrollNo: string,
  payrollDate: string | null,
  periodFrom: string | null,
  periodTo: string | null,
  description: string,
  signatories: Signatory[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const periodCovered = `${fmtDate(periodFrom)} - ${fmtDate(periodTo)}`;

  // ── Sheet 1: Detailed Computation ──
  const ws = wb.addWorksheet('Payroll Computation', {
    pageSetup: { paperSize: 5, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
  });

  const COLS = [
    'No.', 'Item No.', 'Surname', 'First Name', 'Middle Name', 'Emp No.',
    'Stacode', 'School', 'Group', 'Position', 'SG', 'Step',
    'Monthly Salary', 'Calendar Days', 'Days Present', 'Gross Salary', 'PERA',
    'GSIS (9%)', 'PhilHealth', 'Pag-IBIG', 'Annual Income', 'Annual Deductions',
    'Taxable Income', 'Annual Tax', 'Monthly Tax', 'Other Ded.', 'Total Deductions',
    'Amount Due', 'Add. Adj.', 'Adj. Ded.', 'Total Due',
  ];
  ws.columns = COLS.map((h) => ({ header: h, width: h.length > 14 ? 16 : 10 }));

  // Title
  ws.mergeCells(1, 1, 1, COLS.length);
  const t1 = ws.getCell('A1');
  t1.value = 'DEPARTMENT OF EDUCATION';
  t1.font = { bold: true, size: 12 };
  t1.alignment = { horizontal: 'center' };

  ws.mergeCells(2, 1, 2, COLS.length);
  const t2 = ws.getCell('A2');
  t2.value = 'INITIAL PAYROLL COMPUTATION - PERMANENT EMPLOYEES';
  t2.font = { bold: true, size: 11 };
  t2.alignment = { horizontal: 'center' };

  ws.mergeCells(3, 1, 3, COLS.length);
  const t3 = ws.getCell('A3');
  t3.value = description || '';
  t3.font = { bold: true, size: 10 };
  t3.alignment = { horizontal: 'center' };

  ws.mergeCells(4, 1, 4, COLS.length);
  const t4 = ws.getCell('A4');
  t4.value = `PAYROLL NO. ${payrollNo}    |    Payroll Date: ${fmtDate(payrollDate)}    |    Period: ${periodCovered}`;
  t4.font = { size: 10 };
  t4.alignment = { horizontal: 'center' };

  ws.getRow(5).height = 6;

  // Header row (row 6)
  const headerRow = ws.getRow(6);
  COLS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getRow(6).height = 28;

  // Data rows
  summary.entries.forEach((e, idx) => {
    const r = e.result;
    const row = ws.getRow(7 + idx);
    const vals: (string | number)[] = [
      idx + 1,
      e.item_no || '',
      e.surname, e.first_name, e.middle_name,
      e.employee_number, e.stacode, e.school, e.group, e.position_title,
      e.salary_grade ?? '', e.salary_step ?? '',
      e.monthly_salary, e.calendar_days, e.days_present,
      r.gross_salary, r.pera, r.gsis, r.philhealth, r.pagibig,
      r.annual_income, r.annual_deductions, r.taxable_income, r.annual_tax, r.monthly_tax,
      e.other_deductions, r.total_deductions, r.amount_due,
      e.additional_adjustments, e.adjustment_deductions, r.total_due,
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 7 };
      cell.alignment = { horizontal: typeof v === 'number' ? 'right' : 'left', vertical: 'middle' };
      cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
    });
    row.height = 14;
  });

  // Totals row
  const tr = ws.getRow(7 + summary.entries.length);
  const d = summary.division;
  const totalVals: (string | number)[] = [
    '', '', 'TOTAL', '', '', '', '', '', '', '', '', '',
    '', '', d.total_gross, d.total_pera, d.total_gsis, d.total_philhealth, d.total_pagibig,
    d.total_gross > 0 ? d.total_gross / summary.entries.length * 12 : 0, '', '', '', '',
    d.total_tax, '', d.total_deductions, d.total_amount_due, '', '', d.total_due,
  ];
  totalVals.forEach((v, ci) => {
    const cell = tr.getCell(ci + 1);
    if (v !== '') { cell.value = v; }
    cell.font = { bold: true, size: 8 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
    cell.alignment = { horizontal: typeof v === 'number' ? 'right' : 'left' };
  });
  tr.height = 20;

  // Signatories
  const sigStart = 7 + summary.entries.length + 3;
  const sigRoles: Signatory['role'][] = ['prepared_by', 'certified_correct', 'checked_by', 'recommending_approval', 'approved_by'];
  sigRoles.forEach((role, i) => {
    const row = sigStart + i * 2;
    const { name, position } = sigText(signatories, role);
    ws.mergeCells(row, 1, row, 6);
    ws.getCell(row, 1).value = SIG_LABELS[role];
    ws.getCell(row, 1).font = { bold: true, size: 10 };
    ws.mergeCells(row, 7, row, 12);
    ws.getCell(row, 7).value = name;
    ws.getCell(row, 7).font = { size: 10, underline: true };
    ws.getCell(row, 7).alignment = { horizontal: 'center' };
    ws.mergeCells(row + 1, 7, row + 1, 12);
    ws.getCell(row + 1, 7).value = position;
    ws.getCell(row + 1, 7).font = { size: 9, italic: true };
    ws.getCell(row + 1, 7).alignment = { horizontal: 'center' };
  });

  // ── Sheet 2: Group Summaries ──
  const ws2 = wb.addWorksheet('Group Summary', {
    pageSetup: { orientation: 'portrait', fitToWidth: 1 },
  });
  const G_COLS = ['Group', 'Count', 'Gross Salary', 'PERA', 'GSIS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Total Ded.', 'Amount Due', 'Total Due'];
  ws2.columns = G_COLS.map((h) => ({ header: h, width: 16 }));
  ws2.mergeCells(1, 1, 1, G_COLS.length);
  ws2.getCell('A1').value = 'PAYROLL SUMMARY BY GROUP';
  ws2.getCell('A1').font = { bold: true, size: 11 };
  ws2.getCell('A1').alignment = { horizontal: 'center' };

  const gHeader = ws2.getRow(3);
  G_COLS.forEach((h, i) => {
    const cell = gHeader.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    cell.alignment = { horizontal: 'center' };
  });

  summary.groups.forEach((g, i) => {
    const row = ws2.getRow(4 + i);
    const vals: (string | number)[] = [g.label, g.count, g.total_gross, g.total_pera, g.total_gsis, g.total_philhealth, g.total_pagibig, g.total_tax, g.total_deductions, g.total_amount_due, g.total_due];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: ci === 0 ? 'left' : 'right' };
    });
  });

  const gTotal = ws2.getRow(4 + summary.groups.length);
  const gTotalVals: (string | number)[] = ['DIVISION TOTAL', summary.division.count, summary.division.total_gross, summary.division.total_pera, summary.division.total_gsis, summary.division.total_philhealth, summary.division.total_pagibig, summary.division.total_tax, summary.division.total_deductions, summary.division.total_amount_due, summary.division.total_due];
  gTotalVals.forEach((v, ci) => {
    const cell = gTotal.getCell(ci + 1);
    cell.value = v;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7DD' } };
    cell.alignment = { horizontal: ci === 0 ? 'left' : 'right' };
  });

  // ── Sheet 3: School Summaries ──
  const ws3 = wb.addWorksheet('School Summary', {
    pageSetup: { orientation: 'portrait', fitToWidth: 1 },
  });
  const S_COLS = ['Stacode', 'School', 'Group', 'Count', 'Gross', 'PERA', 'GSIS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Total Ded.', 'Amount Due', 'Total Due'];
  ws3.columns = S_COLS.map((h) => ({ header: h, width: 16 }));
  ws3.mergeCells(1, 1, 1, S_COLS.length);
  ws3.getCell('A1').value = 'PAYROLL SUMMARY BY SCHOOL';
  ws3.getCell('A1').font = { bold: true, size: 11 };
  ws3.getCell('A1').alignment = { horizontal: 'center' };

  const sHeader = ws3.getRow(3);
  S_COLS.forEach((h, i) => {
    const cell = sHeader.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    cell.alignment = { horizontal: 'center' };
  });

  summary.schools.forEach((s, i) => {
    const row = ws3.getRow(4 + i);
    const vals: (string | number)[] = [s.stacode, s.school, s.group, s.count, s.total_gross, s.total_pera, s.total_gsis, s.total_philhealth, s.total_pagibig, s.total_tax, s.total_deductions, s.total_amount_due, s.total_due];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 8 };
      cell.alignment = { horizontal: ci < 3 ? 'left' : 'right' };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadFile({
    filename: `PAYROLL_COMPUTATION_${payrollNo}_${dateStr}.xlsx`,
    content: new Uint8Array(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── PDF Export ─────────────────────────────────────────────────────────────

export function exportComputedPayrollPdf(
  summary: PayrollSummary,
  payrollNo: string,
  payrollDate: string | null,
  periodFrom: string | null,
  periodTo: string | null,
  description: string,
  signatories: Signatory[],
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const periodCovered = `${fmtDate(periodFrom)} - ${fmtDate(periodTo)}`;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DEPARTMENT OF EDUCATION', pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.text('INITIAL PAYROLL COMPUTATION - PERMANENT EMPLOYEES', pageWidth / 2, 18, { align: 'center' });
  if (description) {
    doc.setFontSize(9);
    doc.text(description, pageWidth / 2, 24, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `PAYROLL NO. ${payrollNo}   |   Payroll Date: ${fmtDate(payrollDate)}   |   Period: ${periodCovered}`,
    pageWidth / 2, 30, { align: 'center' },
  );

  // Detail table
  const head = [[
    'No.', 'Surname', 'First Name', 'Emp No.', 'Stacode', 'Grp',
    'Monthly', 'Days', 'Gross', 'PERA', 'GSIS', 'PHIC', 'HDMF',
    'Tax', 'Tot Ded.', 'Amount Due', 'Total Due',
  ]];

  const body = summary.entries.map((e, i) => [
    String(i + 1),
    e.surname.slice(0, 12),
    e.first_name.slice(0, 12),
    e.employee_number.slice(0, 8),
    e.stacode.slice(0, 6),
    e.group,
    currency(e.monthly_salary),
    String(e.days_present),
    currency(e.result.gross_salary),
    currency(e.result.pera),
    currency(e.result.gsis),
    currency(e.result.philhealth),
    currency(e.result.pagibig),
    currency(e.result.monthly_tax),
    currency(e.result.total_deductions),
    currency(e.result.amount_due),
    currency(e.result.total_due),
  ]);

  // Division total row
  const d = summary.division;
  body.push([
    '', 'DIVISION TOTAL', '', '', '', '',
    '', '', currency(d.total_gross), currency(d.total_pera),
    currency(d.total_gsis), currency(d.total_philhealth), currency(d.total_pagibig),
    currency(d.total_tax), currency(d.total_deductions), currency(d.total_amount_due), currency(d.total_due),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 34,
    theme: 'grid',
    styles: { fontSize: 5.5, cellPadding: 0.8, overflow: 'hidden' as const },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 7 },
      6: { halign: 'right' },
      7: { halign: 'right' },
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

  // Group summary on new page
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PAYROLL SUMMARY BY GROUP', pageWidth / 2, 14, { align: 'center' });

  const gHead = [['Group', 'Count', 'Gross', 'PERA', 'GSIS', 'PHIC', 'HDMF', 'Tax', 'Total Ded.', 'Amount Due', 'Total Due']];
  const gBody = summary.groups.map((g: GroupSummary) => [
    g.label, String(g.count),
    currency(g.total_gross), currency(g.total_pera), currency(g.total_gsis),
    currency(g.total_philhealth), currency(g.total_pagibig), currency(g.total_tax),
    currency(g.total_deductions), currency(g.total_amount_due), currency(g.total_due),
  ]);
  gBody.push([
    'DIVISION TOTAL', String(d.count),
    currency(d.total_gross), currency(d.total_pera), currency(d.total_gsis),
    currency(d.total_philhealth), currency(d.total_pagibig), currency(d.total_tax),
    currency(d.total_deductions), currency(d.total_amount_due), currency(d.total_due),
  ]);

  autoTable(doc, {
    head: gHead,
    body: gBody,
    startY: 20,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'hidden' as const },
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.row.index === gBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [209, 231, 221];
      }
      if (data.section === 'body' && data.column.index >= 1) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  // School summary
  const afterGroupY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYROLL SUMMARY BY SCHOOL', pageWidth / 2, afterGroupY, { align: 'center' });

  const sHead = [['Stacode', 'School', 'Group', 'Count', 'Gross', 'PERA', 'GSIS', 'PHIC', 'HDMF', 'Tax', 'Total Ded.', 'Amount Due', 'Total Due']];
  const sBody = summary.schools.map((s) => [
    s.stacode, s.school.slice(0, 20), s.group, String(s.count),
    currency(s.total_gross), currency(s.total_pera), currency(s.total_gsis),
    currency(s.total_philhealth), currency(s.total_pagibig), currency(s.total_tax),
    currency(s.total_deductions), currency(s.total_amount_due), currency(s.total_due),
  ]);

  autoTable(doc, {
    head: sHead,
    body: sBody,
    startY: afterGroupY + 4,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1, overflow: 'hidden' as const },
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index >= 3) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  // Signatories
  const afterSchoolY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  const sigRoles: Signatory['role'][] = ['prepared_by', 'certified_correct', 'checked_by', 'recommending_approval', 'approved_by'];
  let y = afterSchoolY;
  doc.setFontSize(8);
  sigRoles.forEach((role) => {
    const { name, position } = sigText(signatories, role);
    doc.setFont('helvetica', 'bold');
    doc.text(`${SIG_LABELS[role]}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(name, 70, y);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    if (position) doc.text(position, 70, y + 4);
    doc.setFontSize(8);
    y += 14;
  });

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`PAYROLL_COMPUTATION_${payrollNo}_${dateStr}.pdf`);
}

// ── Computed entry helper: build from InitialPayrollEntry ───────────────────
export function entryToComputed(entry: {
  employee_number: string | null;
  surname: string | null;
  first_name: string | null;
  middle_name: string | null;
  stacode: string | null;
  school: string | null;
  item_no: string | null;
  position_title: string | null;
  salary_grade: number | null;
  salary_step: number | null;
  monthly_salary: number | null;
  days_worked: number;
  calendar_days: number;
  tin: string | null;
  philhealth_no: string | null;
  hdmf_no: string | null;
  atm_account_no: string | null;
  effectivity_date: string | null;
  other_deductions: number;
  additional_adjustments: number;
  adjustment_deductions: number;
  absences: number;
}): ComputedEntry {
  const result = computePayrollFromEntry(entry);
  return {
    employee_number: entry.employee_number ?? '',
    surname: entry.surname ?? '',
    first_name: entry.first_name ?? '',
    middle_name: entry.middle_name ?? '',
    stacode: entry.stacode ?? '',
    school: entry.school ?? '',
    group: classifyStacode(entry.stacode ?? ''),
    item_no: entry.item_no ?? '',
    position_title: entry.position_title ?? '',
    salary_grade: entry.salary_grade,
    salary_step: entry.salary_step,
    monthly_salary: entry.monthly_salary ?? 0,
    days_present: entry.days_worked,
    calendar_days: entry.calendar_days,
    tin: entry.tin ?? '',
    philhealth_no: entry.philhealth_no ?? '',
    hdmf_no: entry.hdmf_no ?? '',
    atm_account_no: entry.atm_account_no ?? '',
    effectivity_date: entry.effectivity_date,
    result,
    other_deductions: entry.other_deductions,
    additional_adjustments: entry.additional_adjustments,
    adjustment_deductions: entry.adjustment_deductions,
    absences: entry.absences ?? 0,
  };
}

import { computePayroll, classifyStacode, DEFAULT_PHILHEALTH_RATE } from './payrollComputation';

function computePayrollFromEntry(entry: {
  monthly_salary: number | null;
  days_worked: number;
  calendar_days: number;
  other_deductions: number;
  additional_adjustments: number;
  adjustment_deductions: number;
  effectivity_date: string | null;
  absences: number;
}) {
  return computePayroll({
    monthly_salary: entry.monthly_salary ?? 0,
    days_present: entry.days_worked,
    calendar_days: entry.calendar_days || 22,
    other_deductions: entry.other_deductions,
    additional_adjustments: entry.additional_adjustments,
    adjustment_deductions: entry.adjustment_deductions,
    philhealth_rate: DEFAULT_PHILHEALTH_RATE,
    effectivity_date: entry.effectivity_date ?? null,
  });
}
