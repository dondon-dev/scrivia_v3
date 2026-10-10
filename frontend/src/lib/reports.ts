import { encodeDbf, type DbfField, type DbfRecord } from './dbf';
import { computePyentSplit } from './payroll';
import { TABLE_FIELDS } from './dbfTemplate';
import type { Employee, Deduction, PayrollEntry, PayPeriod, PayrollDeduction } from '@/types/payroll';

// Re-export template field definitions so existing imports still work
export const MASTERFILE_FIELDS: DbfField[] = TABLE_FIELDS['MASTFILE'];
export const DEDFILE_FIELDS: DbfField[] = TABLE_FIELDS['DEDFILE'];
export const PAYROLLS_FIELDS: DbfField[] = TABLE_FIELDS['PAYROLLS'];

export interface DownloadOptions {
  filename: string;
  content: Uint8Array;
  mimeType: string;
}

export function downloadFile({ filename, content, mimeType }: DownloadOptions) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function currency(n: number | string): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

// ── Masterfile DBF fields imported from dbfTemplate.ts ──
// MASTERFILE_FIELDS is re-exported from the top of this file.

function buildEmpName(e: Employee): string {
  const parts = [e.appel, e.lname, e.fname, e.mi].filter(Boolean);
  return parts.join(' ').toUpperCase().slice(0, 40);
}

export function generateMasterfileDbf(employees: Employee[]): Uint8Array {
  const records: DbfRecord[] = employees.map((e) => ({
    REGCODE: e.regcode || '',
    DIVCODE: e.divcode || '',
    STACODE: e.stacode || '',
    EMPNO: e.empno || e.employee_number || '',
    ACCOUNT: e.account || e.bank_account || '',
    EMPNAME: e.empname || buildEmpName(e),
    FNAME: e.fname || e.first_name || '',
    MI: e.mi || '',
    LNAME: e.lname || e.last_name || '',
    APPEL: e.appel || '',
    POSCODE: e.poscode || e.position || '',
    GRADE: String(e.grade || 0),
    STEP: String(e.step || 0),
    BASIC: e.basic || e.basic_salary || 0,
    TRANS: e.trans || 0,
    PERA: e.pera || 0,
    ACA: e.aca || 0,
    RATA: e.rata || 0,
    ONTOP: e.ontop || 0,
    LONG: e.long || 0,
    DEDLNR: e.dedlnr || 0,
    DEDMED: e.dedmed || 0,
    DEDTAX: e.dedtax || 0,
    DEDPAG: e.dedpag || 0,
    NETPAY: e.netpay || 0,
    PAGCODE: e.pagcode || '',
    TAXCODE: e.taxcode || e.tax_status || 'ME1',
    CIVILSTAT: e.civilstat || '',
    ATTEND: e.attend || '',
    STATUS: (e.status === 'Active' ? 'A' : e.status === 'Inactive' ? 'I' : e.status === 'Resigned' ? 'R' : 'T'),
    SEX: e.sex || '',
    BIRTHDATE: e.birthdate,
    TIN: e.tin || '',
    GSIS_PN: e.gsis_pn || '',
    GSIS_ID: e.gsis_id || '',
    GOVTLNR: e.govtlnr || 0,
    GOVTECC: e.govtecc || 0,
    GOVTMED: e.govtmed || 0,
    GOVTPAG: e.govtpag || 0,
    UPDCODE: e.updcode || '',
    UPDATE: e.update,
    PAYDATE: e.paydate,
    EDITOR: e.editor || '',
    PAYMODE: e.paymode || 'ATM',
    HIREDATE: e.hiredate || e.hire_date,
    HDMF_ID: e.hdmf_id || e.pagibig_number || '',
    PHIC_ID: e.phic_id || e.philhealth_number || '',
    BANKER: e.banker || e.bank_name || '',
    PIB: e.pib || 0,
    CLOTHING: e.clothing || 0,
    CASHALLOW: e.cashallow || 0,
    MID_BONUS: e.mid_bonus || 0,
    MID_CASH: e.mid_cash || 0,
    END_BONUS: e.end_bonus || 0,
    END_CASH: e.end_cash || 0,
    ADD_BONUS: e.add_bonus || 0,
    TAXREF: e.taxref || 0,
    SPECIAL: e.special || 0,
    OVER_WHELD: e.over_wheld || 0,
    EXPOSCODE: e.exposcode || '',
    EXGRADE: String(e.exgrade || 0),
    EXSTEP: String(e.exstep || 0),
    EXBASIC: e.exbasic || 0,
    EXLNR: e.exlnr || 0,
    EXMED: e.exmed || 0,
    EXPAG: e.expag || 0,
    EXTAX: e.extax || 0,
    EXGLNR: e.exglnr || 0,
    EXGMED: e.exgmed || 0,
    EXGPAG: e.exgpag || 0,
    EXGECC: e.exgecc || 0,
    SALDIFF: e.saldiff || 0,
    LNRDIFF: e.lnrdiff || 0,
    MEDDIFF: e.meddiff || 0,
    PAGDIFF: e.pagdiff || 0,
    TAXDIFF: e.taxdiff || 0,
    GLNRDIFF: e.glnrdiff || 0,
    GMEDDIFF: e.gmeddiff || 0,
    GPAGDIFF: e.gpagdiff || 0,
    GECCDIFF: e.geccdiff || 0,
    DEPNAME1: e.depname1 || '',
    DEPNAME2: e.depname2 || '',
    DEPNAME3: e.depname3 || '',
    DEPNAME4: e.depname4 || '',
    DEPDATE1: e.depdate1 || null,
    DEPDATE2: e.depdate2 || null,
    DEPDATE3: e.depdate3 || null,
    DEPDATE4: e.depdate4 || null,
  }));
  return encodeDbf(MASTERFILE_FIELDS, records);
}

// ── Deduction DBF ──────────────────────────────────────────────────────

export function generateDeductionDbf(
  deductions: Deduction[],
  employees: Employee[],
  deductionCode: string,
): Uint8Array {
  const fields: DbfField[] = [
    { name: 'EMPNO', type: 'C', length: 15, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 25, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 25, decimals: 0 },
    { name: 'DEPT', type: 'C', length: 20, decimals: 0 },
    { name: 'DCODE', type: 'C', length: 10, decimals: 0 },
    { name: 'DNAME', type: 'C', length: 30, decimals: 0 },
    { name: 'AMOUNT', type: 'N', length: 12, decimals: 2 },
    { name: 'REF', type: 'C', length: 20, decimals: 0 },
    { name: 'SOURCE', type: 'C', length: 10, decimals: 0 },
  ];
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const records: DbfRecord[] = deductions
    .filter((d) => d.deduction_code === deductionCode)
    .map((d) => {
      const e = empMap.get(d.employee_id);
      return {
        EMPNO: e?.empno || e?.employee_number || '',
        LNAME: e?.lname || e?.last_name || '',
        FNAME: e?.fname || e?.first_name || '',
        DEPT: e?.department || '',
        DCODE: d.deduction_code,
        DNAME: d.deduction_name,
        AMOUNT: d.amount,
        REF: d.reference || '',
        SOURCE: d.source || '',
      };
    });
  return encodeDbf(fields, records);
}

// ── Payroll DBF ────────────────────────────────────────────────────────

export function generatePayrollDbf(
  entries: PayrollEntry[],
  employees: Employee[],
  period: PayPeriod,
): Uint8Array {
  const fields: DbfField[] = [
    { name: 'EMPNO', type: 'C', length: 15, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 25, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 25, decimals: 0 },
    { name: 'MIDINIT', type: 'C', length: 3, decimals: 0 },
    { name: 'DEPT', type: 'C', length: 20, decimals: 0 },
    { name: 'BANKAC', type: 'C', length: 20, decimals: 0 },
    { name: 'GROSS', type: 'N', length: 12, decimals: 2 },
    { name: 'GSIS_LR', type: 'N', length: 12, decimals: 2 },
    { name: 'MEDICARE', type: 'N', length: 12, decimals: 2 },
    { name: 'PAGIBIG', type: 'N', length: 12, decimals: 2 },
    { name: 'WTAX', type: 'N', length: 12, decimals: 2 },
    { name: 'LOANS_AP', type: 'N', length: 12, decimals: 2 },
    { name: 'UNDEDUCT', type: 'N', length: 12, decimals: 2 },
    { name: 'TOT_DED', type: 'N', length: 12, decimals: 2 },
    { name: 'NET', type: 'N', length: 12, decimals: 2 },
    { name: 'NTHP', type: 'C', length: 6, decimals: 0 },
    { name: 'PERIOD', type: 'C', length: 25, decimals: 0 },
    { name: 'STATUS', type: 'C', length: 10, decimals: 0 },
  ];
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const records: DbfRecord[] = entries.map((pe) => {
    const e = empMap.get(pe.employee_id);
    return {
      EMPNO: e?.empno || e?.employee_number || '',
      LNAME: e?.lname || e?.last_name || '',
      FNAME: e?.fname || e?.first_name || '',
      MIDINIT: e?.mi || '',
      DEPT: e?.department || '',
      BANKAC: e?.account || e?.bank_account || '',
      GROSS: pe.gross_pay,
      GSIS_LR: pe.dedlnr,
      MEDICARE: pe.dedmed,
      PAGIBIG: pe.dedpag,
      WTAX: pe.dedtax,
      LOANS_AP: pe.actual_loan_deductions ?? pe.other_deductions ?? 0,
      UNDEDUCT: pe.undeducted_amount ?? 0,
      TOT_DED: pe.total_deductions,
      NET: pe.net_pay,
      NTHP: pe.nthp_status ?? 'PASS',
      PERIOD: period.period_name,
      STATUS: pe.status,
    };
  });
  return encodeDbf(fields, records);
}

// ── PAYROLL CSV — full payroll register matching the Regular Payroll grid ──
export function generatePayrollCsv(
  entries: PayrollEntry[],
  employees: Employee[],
  period: PayPeriod,
): Uint8Array {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const headers = [
    'EMPNO', 'Last Name', 'First Name', 'M.I.', 'Department', 'Account No.',
    'Gross Pay', 'GSIS L&R', 'Medicare', 'Pag-IBIG', 'W/Tax',
    'Loans Applied', 'Undeducted', 'Total Deductions', 'Net Pay',
    'NTHP', 'Period', 'Status',
  ];
  const rows = entries.map((pe) => {
    const e = empMap.get(pe.employee_id);
    return [
      e?.empno || e?.employee_number || '',
      e?.lname || e?.last_name || '',
      e?.fname || e?.first_name || '',
      e?.mi || '',
      e?.department || '',
      e?.account || e?.bank_account || '',
      pe.gross_pay,
      pe.dedlnr,
      pe.dedmed,
      pe.dedpag,
      pe.dedtax,
      pe.actual_loan_deductions ?? pe.other_deductions ?? 0,
      pe.undeducted_amount ?? 0,
      pe.total_deductions,
      pe.net_pay,
      pe.nthp_status ?? 'PASS',
      period.period_name,
      pe.status,
    ];
  });
  return generateCsv(headers, rows);
}

// ── DEDFILE DBF — FoxPro-compatible deduction masterfile ──────────────────
// Columns: P YY MN DC HR MI SE REG DIVSTA EMPNO FNAME MI LNAME APP NETPAY
//          DEDC POLICYNO DE EF IEFFY TEITERY DEDAMT POLICYDA AGENT AB U UN
//          S U UPDATE PAYDATE EDITOR PRINCIPAL INTEREST CHARGES PROCEED T
//          AGEN B AB AB OLD HIREDATE BIRTHDAT GSIS_BPN QID

// ── DEDFILE fields imported from dbfTemplate.ts ──
// DEDFILE_FIELDS is re-exported from the top of this file.

function statusFlag(status: string): string {
  if (status === 'Active') return 'A';
  if (status === 'Suspended') return 'S';
  if (status === 'Terminated') return 'T';
  return 'A';
}

function typeFlag(type: string): string {
  const map: Record<string, string> = { Loan: 'L', Insurance: 'I', Membership: 'M', Savings: 'S', Other: 'O' };
  return map[type] ?? 'O';
}

export function generateDedfileDbf(
  deductions: PayrollDeduction[],
  employees: Employee[],
): Uint8Array {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const records: DbfRecord[] = deductions.map((d, idx) => {
    const e = empMap.get(d.employee_id ?? '');
    return {
      P:          d.status === 'Active' ? 'A' : 'I',
      YY:         String(now.getFullYear()),
      MM:         pad2(now.getMonth() + 1),
      DD:         pad2(now.getDate()),
      HR:         pad2(now.getHours()),
      MIN:        pad2(now.getMinutes()),
      SEC:        pad2(now.getSeconds()),
      REGCODE:    e?.regcode ?? '',
      DIVCODE:    e?.divcode ?? '',
      STACODE:    e?.stacode ?? '',
      EMPNO:      d.empno,
      FNAME:      e?.fname ?? e?.first_name ?? '',
      MI:         e?.mi ?? '',
      LNAME:      e?.lname ?? e?.last_name ?? '',
      APPEL:      e?.appel ?? '',
      NETPAY:     e?.netpay ?? 0,
      DEDCODE:    d.dedcode,
      POLICYNO:   d.policyno,
      DEDID:      (d.dedid ?? '').slice(0, 2),
      EFFMM:      pad2(d.effmm),
      EFFYY:      String(d.effyy).padStart(4, '0'),
      TERMM:      d.termm ? pad2(d.termm) : '',
      TERYY:      d.teryy ? String(d.teryy).padStart(4, '0') : '',
      DEDAMT:     d.dedamt,
      POLICYDATE: null,
      AGENT:      d.agency,
      ABSNO:      0,
      UNDERHR:    0,
      UNDERMIN:   0,
      STATUS:     statusFlag(d.status),
      UPDCODE:    e?.updcode ?? '',
      UPDATE:     e?.update ?? null,
      PAYDATE:    e?.paydate ?? null,
      EDITOR:     e?.editor ?? '',
      PRINCIPAL:  d.principal,
      INTEREST:   d.interest,
      CHARGES:    d.charges,
      PROCEEDS:   d.proceeds,
      TYPE:       typeFlag(d.type),
      AGENCY:     d.agency.slice(0, 5),
      BILL:       '',
      ABMM:       '',
      ABYY:       '',
      OLDCODE:    '',
      HIREDATE:   e?.hiredate ?? e?.hire_date ?? null,
      BIRTHDATE:  e?.birthdate ?? null,
      GSIS_BPN:   e?.gsis_pn ?? '',
      QS:         '',
      ID:         String(idx + 1).padStart(3, '0'),
    };
  });
  return encodeDbf(DEDFILE_FIELDS, records);
}



export function generateCsv(
  headers: string[],
  rows: (string | number)[][],
): Uint8Array {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  return new TextEncoder().encode(lines.join('\n'));
}

// Excel export via SpreadsheetML (XML) — opens directly in Excel, no library needed
export function generateExcel(
  headers: string[],
  rows: (string | number)[][],
  sheetName = 'Sheet1',
): Uint8Array {
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const cellType = (v: string | number) => typeof v === 'number' ? 'Number' : 'String';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${esc(sheetName)}">
  <Table>
   <Row>
${headers.map((h) => `    <Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('\n')}
   </Row>
${rows.map((r) => `   <Row>
${r.map((v) => `    <Cell><Data ss:Type="${cellType(v)}">${esc(String(v ?? ''))}</Data></Cell>`).join('\n')}
   </Row>`).join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;
  const encoded = new TextEncoder().encode(xml);
  // The current bundler target trips over Uint8Array<ArrayBufferLike> in a
  // Blob constructor / download helper, so coerce back to Uint8Array<ArrayBuffer>
  // explicitly before returning. This keeps generateExcel + the DBF/CSV helpers
  // compiling without widening the API footprint.
  return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength) as Uint8Array;
}

export function generateMasterfileCsv(employees: Employee[]): Uint8Array {
  const headers = MASTERFILE_FIELDS.map((f) => f.name);
  const rows: (string | number)[][] = employees.map((e) => {
    const rec: Record<string, string | number | null> = {};
    // Build the same record as DBF
    rec.REGCODE = e.regcode || '';
    rec.DIVCODE = e.divcode || '';
    rec.STACODE = e.stacode || '';
    rec.EMPNO = e.empno || e.employee_number || '';
    rec.ACCOUNT = e.account || e.bank_account || '';
    rec.EMPNAME = e.empname || buildEmpName(e);
    rec.FNAME = e.fname || e.first_name || '';
    rec.MI = e.mi || '';
    rec.LNAME = e.lname || e.last_name || '';
    rec.APPEL = e.appel || '';
    rec.POSCODE = e.poscode || e.position || '';
    rec.GRADE = e.grade || 0;
    rec.STEP = e.step || 0;
    rec.BASIC = e.basic || e.basic_salary || 0;
    rec.TRANS = e.trans || 0;
    rec.PERA = e.pera || 0;
    rec.ACA = e.aca || 0;
    rec.RATA = e.rata || 0;
    rec.ONTOP = e.ontop || 0;
    rec.LONG = e.long || 0;
    rec.DEDLNR = e.dedlnr || 0;
    rec.DEDMED = e.dedmed || 0;
    rec.DEDTAX = e.dedtax || 0;
    rec.DEDPAG = e.dedpag || 0;
    rec.NETPAY = e.netpay || 0;
    rec.PAGCODE = e.pagcode || '';
    rec.TAXCODE = e.taxcode || e.tax_status || 'ME1';
    rec.CIVILSTAT = e.civilstat || '';
    rec.ATTEND = e.attend || '';
    rec.STATUS = (e.status === 'Active' ? 'A' : e.status === 'Inactive' ? 'I' : e.status === 'Resigned' ? 'R' : 'T');
    rec.SEX = e.sex || '';
    rec.BIRTHDATE = e.birthdate || '';
    rec.TIN = e.tin || '';
    rec.GSIS_PN = e.gsis_pn || '';
    rec.GSIS_ID = e.gsis_id || '';
    rec.GOVTLNR = e.govtlnr || 0;
    rec.GOVTECC = e.govtecc || 0;
    rec.GOVTPAG = e.govtpag || 0;
    rec.UPDCODE = e.updcode || '';
    rec.UPDATE = e.update || '';
    rec.PAYDATE = e.paydate || '';
    rec.EDITOR = e.editor || '';
    rec.PAYMODE = e.paymode || 'ATM';
    rec.HIREDATE = e.hiredate || e.hire_date || '';
    rec.HDMF_ID = e.hdmf_id || e.pagibig_number || '';
    rec.PHIC_ID = e.phic_id || e.philhealth_number || '';
    rec.BANKER = e.banker || e.bank_name || '';
    rec.PIB = e.pib || 0;
    rec.CLOTHING = e.clothing || 0;
    rec.CASHALLOW = e.cashallow || 0;
    rec.MID_BONUS = e.mid_bonus || 0;
    rec.MID_CASH = e.mid_cash || 0;
    rec.END_BONUS = e.end_bonus || 0;
    rec.END_CASH = e.end_cash || 0;
    rec.ADD_BONUS = e.add_bonus || 0;
    rec.TAXREF = e.taxref || 0;
    rec.SPECIAL = e.special || 0;
    rec.OVER_WHELD = e.over_wheld || 0;
    rec.EXPOSCODE = e.exposcode || '';
    rec.EXGRADE = e.exgrade || 0;
    rec.EXSTEP = e.exstep || 0;
    rec.EXBASIC = e.exbasic || 0;
    rec.EXLNR = e.exlnr || 0;
    rec.EXMED = e.exmed || 0;
    rec.EXPAG = e.expag || 0;
    rec.EXTAX = e.extax || 0;
    rec.EXGLNR = e.exglnr || 0;
    rec.EXGMED = e.exgmed || 0;
    rec.EXGPAG = e.exgpag || 0;
    rec.EXGECC = e.exgecc || 0;
    rec.SALDIFF = e.saldiff || 0;
    rec.LNRDIFF = e.lnrdiff || 0;
    rec.MEDDIFF = e.meddiff || 0;
    rec.PAGDIFF = e.pagdiff || 0;
    rec.TAXDIFF = e.taxdiff || 0;
    rec.GLNRDIFF = e.glnrdiff || 0;
    rec.GMEDDIFF = e.gmeddiff || 0;
    rec.GPAGDIFF = e.gpagdiff || 0;
    rec.GECCDIFF = e.geccdiff || 0;
    return headers.map((h) => rec[h] ?? '');
  });
  return generateCsv(headers, rows);
}

// ── PYENT DBF Export — FoxPro-compatible banking upload file ──
// PYENT1.DBF / PYENT2.DBF: 6 character fields, 80 data bytes + 1 deletion flag = 81 byte records
// ACCT_NO(C10) ACCT_NAME(C40) AMOUNT(C15) BRANCH_CD(C3) BATCH_NO(C5) FILLER(C7)

const PYENT_DBF_FIELDS: DbfField[] = [
  { name: 'ACCT_NO',   type: 'C', length: 10, decimals: 0 },
  { name: 'ACCT_NAME', type: 'C', length: 40, decimals: 0 },
  { name: 'AMOUNT',    type: 'C', length: 15, decimals: 0 },
  { name: 'BRANCH_CD', type: 'C', length: 3,  decimals: 0 },
  { name: 'BATCH_NO',  type: 'C', length: 5,  decimals: 0 },
  { name: 'FILLER',    type: 'C', length: 7,  decimals: 0 },
];

export interface PyentValidationRow {
  empno: string;
  empname: string;
  field: string;
  value: string;
  reason: string;
}

export interface PyentCheck {
  empno: string;
  empname: string;
  pyent: number;
  pyent1: number;
  pyent2: number;
  difference: number;
  valid: boolean;
}

export interface PyentExportResult {
  records: DbfRecord[];
  fieldValidations: PyentValidationRow[];
  pyentChecks: PyentCheck[];
  valid: boolean;
  totalRecords: number;
  totalAmount: number;
  totalPyent: number;
  recordLength: number;
  dbf: Uint8Array | null;
}

export function generatePyentDbf(
  entries: PayrollEntry[],
  employees: Employee[],
  half: 1 | 2,
  branchCd: string,
  batchNo: string,
): PyentExportResult {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const fieldValidations: PyentValidationRow[] = [];
  const pyentChecks: PyentCheck[] = [];
  const records: DbfRecord[] = [];
  let totalAmount = 0;
  let totalPyent = 0;

  for (const pe of entries) {
    const e = empMap.get(pe.employee_id);
    if (!e) continue;

    const empno = (e.empno || e.employee_number || '').trim();
    const lname = (e.lname || e.last_name || '').trim();
    const fname = (e.fname || e.first_name || '').trim();
    const mi = (e.mi || '').trim();
    const acctName = `${lname}, ${fname}${mi ? ' ' + mi : ''}`.toUpperCase();
    const acctNo = (e.account || e.bank_account || '').trim();

    const split = computePyentSplit(pe.net_pay);
    const amount = half === 1 ? split.pyent1 : split.pyent2;
    const amountStr = Math.round(amount * 100).toString().padStart(15, '0');

    pyentChecks.push({
      empno, empname: acctName, pyent: split.pyent, pyent1: split.pyent1,
      pyent2: split.pyent2, difference: split.difference, valid: split.valid,
    });

    if (!split.valid) continue;

    if (acctNo.length === 0) {
      fieldValidations.push({ empno, empname: acctName, field: 'ACCT_NO', value: '', reason: 'Account number is empty' });
      continue;
    }
    if (acctNo.length > 10) {
      fieldValidations.push({ empno, empname: acctName, field: 'ACCT_NO', value: acctNo, reason: `Length ${acctNo.length} exceeds 10 characters` });
      continue;
    }
    if (acctName.length > 40) {
      fieldValidations.push({ empno, empname: acctName, field: 'ACCT_NAME', value: acctName, reason: `Length ${acctName.length} exceeds 40 characters` });
      continue;
    }
    if (amountStr.length > 15) {
      fieldValidations.push({ empno, empname: acctName, field: 'AMOUNT', value: amountStr, reason: `Length ${amountStr.length} exceeds 15 characters` });
      continue;
    }
    if (branchCd.length > 3) {
      fieldValidations.push({ empno, empname: acctName, field: 'BRANCH_CD', value: branchCd, reason: `Length ${branchCd.length} exceeds 3 characters` });
      continue;
    }
    if (batchNo.length > 5) {
      fieldValidations.push({ empno, empname: acctName, field: 'BATCH_NO', value: batchNo, reason: `Length ${batchNo.length} exceeds 5 characters` });
      continue;
    }

    totalAmount += amount;
    totalPyent += split.pyent;
    records.push({
      ACCT_NO: acctNo, ACCT_NAME: acctName, AMOUNT: amountStr,
      BRANCH_CD: branchCd, BATCH_NO: batchNo, FILLER: '       ',
    });
  }

  const allPyentValid = pyentChecks.every((v) => v.valid);
  const valid = fieldValidations.length === 0 && allPyentValid && records.length > 0;
  const recordLength = 1 + PYENT_DBF_FIELDS.reduce((s, f) => s + f.length, 0);
  const dbf = valid ? encodeDbf(PYENT_DBF_FIELDS, records) : null;

  return {
    records, fieldValidations, pyentChecks, valid,
    totalRecords: records.length, totalAmount, totalPyent,
    recordLength, dbf,
  };
}

// ── PAYROLLS fields imported from dbfTemplate.ts ──
// PAYROLLS_FIELDS is re-exported from the top of this file.

export interface PayrollsDbfRecord {
  PAYCODE: number; REGCODE: string; DIVCODE: string; STACODE: string;
  EMPNO: string; FNAME: string; MI: string; LNAME: string; APPEL: string;
  BASIC: number; TRANS: number; DEDLNR: number; DEDMED: number; DEDPAG: number;
  DEDTAX: number; OTHERDED: number; OFFICE: string; ENDING: string; ISSUE: string;
  CHKNO: number; ONTOP: number; LONG: number; RATA: number; PERA: number; ACA: number;
  TAKEHOME: number; POSCODE: string; GRADE: string; STEP: string;
  GOVTLNR: number; GOVTECC: number; GOVTPAG: number; GOVTMED: number;
  TAXCODE: string; PAYMODE: string; BANK: string;
}

export function generatePayrollsDbf(records: PayrollsDbfRecord[]): Uint8Array {
  const dbfRecords: DbfRecord[] = records.map((r) => ({
    PAYCODE: r.PAYCODE, REGCODE: r.REGCODE, DIVCODE: r.DIVCODE, STACODE: r.STACODE,
    EMPNO: r.EMPNO, FNAME: r.FNAME, MI: r.MI, LNAME: r.LNAME, APPEL: r.APPEL,
    BASIC: r.BASIC, TRANS: r.TRANS, DEDLNR: r.DEDLNR, DEDMED: r.DEDMED, DEDPAG: r.DEDPAG,
    DEDTAX: r.DEDTAX, OTHERDED: r.OTHERDED, OFFICE: r.OFFICE, ENDING: r.ENDING, ISSUE: r.ISSUE,
    CHKNO: r.CHKNO, ONTOP: r.ONTOP, LONG: r.LONG, RATA: r.RATA, PERA: r.PERA, ACA: r.ACA,
    TAKEHOME: r.TAKEHOME, POSCODE: r.POSCODE, GRADE: r.GRADE, STEP: r.STEP,
    GOVTLNR: r.GOVTLNR, GOVTECC: r.GOVTECC, GOVTPAG: r.GOVTPAG, GOVTMED: r.GOVTMED,
    TAXCODE: r.TAXCODE, PAYMODE: r.PAYMODE, BANK: r.BANK,
  }));
  return encodeDbf(PAYROLLS_FIELDS, dbfRecords);
}

// TAKEHOME = (BASIC + TRANS + ONTOP + LONG + RATA + PERA + ACA) - (DEDLNR + DEDMED + DEDPAG + DEDTAX + OTHERDED)
export function computeTakeHome(r: {
  BASIC: number; TRANS: number; ONTOP: number; LONG: number; RATA: number; PERA: number; ACA: number;
  DEDLNR: number; DEDMED: number; DEDPAG: number; DEDTAX: number; OTHERDED: number;
}): number {
  const earnings = r.BASIC + r.TRANS + r.ONTOP + r.LONG + r.RATA + r.PERA + r.ACA;
  const deductions = r.DEDLNR + r.DEDMED + r.DEDPAG + r.DEDTAX + r.OTHERDED;
  return Math.round((earnings - deductions) * 100) / 100;
}
