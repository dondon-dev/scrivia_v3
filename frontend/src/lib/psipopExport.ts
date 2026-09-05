import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { PlantillaPosition } from '@/lib/plantilla';

const PSIPOP_COLUMNS: {
  header: string;
  width: number;
  key: string;
  type: 'text' | 'date' | 'number';
}[] = [
  { header: 'DEPARTMENT', width: 28, key: 'department', type: 'text' },
  { header: 'ORGANIZATIONAL UNIT', width: 35, key: 'organizational_unit', type: 'text' },
  { header: 'ITEM NUMBER', width: 32, key: 'item_number', type: 'text' },
  { header: 'POSITION TITLE', width: 28, key: 'position_title', type: 'text' },
  { header: 'SALARY GRADE', width: 14, key: 'salary_grade', type: 'number' },
  { header: 'AUTHORIZED ANNUAL SALARY', width: 24, key: 'authorized_salary', type: 'number' },
  { header: 'ACTUAL ANNUAL SALARY', width: 22, key: 'actual_salary', type: 'number' },
  { header: 'STEP', width: 8, key: 'step', type: 'number' },
  { header: 'AREA CODE', width: 14, key: 'area_code', type: 'text' },
  { header: 'AREA TYPE', width: 14, key: 'area_type', type: 'text' },
  { header: 'LEVEL', width: 10, key: 'level', type: 'text' },
  { header: 'LAST NAME', width: 18, key: 'last_name', type: 'text' },
  { header: 'FIRST NAME', width: 18, key: 'first_name', type: 'text' },
  { header: 'MIDDLE NAME', width: 18, key: 'middle_name', type: 'text' },
  { header: 'SEX', width: 8, key: 'sex', type: 'text' },
  { header: 'DATE OF BIRTH', width: 16, key: 'date_of_birth', type: 'date' },
  { header: 'AGE', width: 8, key: 'age', type: 'number' },
  { header: 'TIN', width: 18, key: 'tin', type: 'text' },
  { header: 'DATE OF ORIGINAL APPOINTMENT', width: 26, key: 'original_appointment', type: 'date' },
  { header: 'DATE OF LAST PROMOTION/APPOINTMENT', width: 30, key: 'last_promotion', type: 'date' },
  { header: 'STATUS', width: 16, key: 'status', type: 'text' },
  { header: 'CIVIL SERVICE ELIGIBILITY', width: 26, key: 'civil_service_eligibility', type: 'text' },
  { header: 'COMMENT/ANNOTATION', width: 24, key: 'comment', type: 'text' },
  { header: 'PWD', width: 8, key: 'pwd', type: 'text' },
  { header: 'INDIGENOUS PEOPLE', width: 18, key: 'indigenous_people', type: 'text' },
  { header: 'SOLO PARENT ID NUMBER', width: 20, key: 'solo_parent_id', type: 'text' },
  { header: 'ABOLISHED', width: 12, key: 'abolished', type: 'text' },
  { header: 'DISSOLVED', width: 12, key: 'dissolved', type: 'text' },
  { header: 'GSIS BP NUMBER', width: 18, key: 'gsis_bp_number', type: 'text' },
  { header: 'POSITION CLASSIFICATION', width: 24, key: 'position_classification', type: 'text' },
];

function parseDate(value: string | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [m, d, y] = trimmed.split('/').map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function computeAge(birthDate: string | undefined): number | null {
  const dob = parseDate(birthDate);
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

// ── Filipino compound middle-name dictionary ─────────────────────────────
// In Philippine naming convention the middle name is the mother's maiden
// surname.  These compound (multi-word) names must be kept together so the
// parser does not merge extra given-name tokens into the middle name.
//
// The set contains UPPERCASE tokens joined by single spaces.
const COMPOUND_MIDDLE_NAMES = new Set([
  // De / Del / Dela particle surnames
  'DE ALBA', 'DE ALANIS', 'DE ALMAREZ', 'DE AQUINO', 'DE ASIS',
  'DE BELEN', 'DE CASTRO', 'DE CHAVEZ', 'DE CRUZ', 'DE DIOS',
  'DE GUZMAN', 'DE JESUS', 'DE LA CRUZ', 'DE LA FUENTE',
  'DE LA MERCED', 'DE LA PEÑA', 'DE LA ROSA', 'DE LA TORRE',
  'DE LA VICTORIA', 'DE LEON', 'DE LUNA', 'DE LOS REYES',
  'DE LOS SANTOS', 'DE MESA', 'DE OCAMPO', 'DE RAMOS',
  'DE TORRES', 'DE VERA',
  'DELA CRUZ', 'DELA FUENTE', 'DELA MERCED', 'DELA PEÑA',
  'DELA ROSA', 'DELA TORRE', 'DELA VICTORIA',
  'DEL MUNDO', 'DEL PILAR', 'DEL ROSARIO',
  'DELOS REYES', 'DELOS SANTOS',
  'DELAS SANTOS', 'DELAS REYES',
  // Delgado / Dequito family
  'DELGADO', 'DEQUITO',
  // San / Santa compounds
  'SAN DIEGO', 'SAN JOSE', 'SAN JUAN', 'SAN MIGUEL', 'SAN PEDRO',
  'SANTA ANA', 'SANTA CRUZ', 'SANTA MARIA', 'SANTA ROSA',
  // Spanish particle prefixes (single-word markers that begin compounds)
  'MACAPAGAL', 'MACARAEG', 'MACARAIG', 'MACATANGAY', 'MACHICA',
  'PAGDANGANAN', 'PAGUILIGAN',
  'VILLANUEVA', 'LABRADOR',
  'VON BUELOW', 'VON TRACY',
]);

/**
 * Single-token middle-name markers.  When one of these appears in the
 * given-name portion of the name, everything from that token onward is the
 * middle name (mother's maiden surname).
 */
const MIDDLE_NAME_MARKERS = new Set([
  'DE', 'DE LA', 'DE LOS', 'DEL', 'DELA', 'DELOS', 'DE LAS', 'DELAS',
  'SAN', 'SANTA', 'SANTO',
  'MAC', 'MC', 'VON', 'VAN', 'DI',
  'LABRADOR', 'MACARAEG', 'MACARAIG', 'MACAPAGAL', 'PAGDANGANAN',
]);

/**
 * Split the given-name tokens (i.e. the portion *after* the comma in
 * "LAST, FIRST MIDDLE") into first name and middle name.
 *
 * The algorithm scans left-to-right for the first token that begins a known
 * compound middle name or matches a middle-name marker.  Everything from
 * that token to the end becomes the middle name.
 *
 * Fallback: the last single token is the middle name.
 */
function splitFirstMiddle(tokens: string[]): { first: string; middle: string } {
  if (tokens.length === 0) return { first: '', middle: '' };
  if (tokens.length === 1) return { first: tokens[0], middle: '' };

  const upper = tokens.map(t => t.toUpperCase());

  for (let i = 1; i < tokens.length; i++) {
    const rest = upper.slice(i).join(' ');

    // Compound middle-name match (e.g. "DE GUZMAN", "DE LOS SANTOS")
    for (const cm of COMPOUND_MIDDLE_NAMES) {
      if (rest === cm || rest.startsWith(cm + ' ')) {
        return {
          first: tokens.slice(0, i).join(' '),
          middle: tokens.slice(i).join(' '),
        };
      }
    }

    // Single-token particle marker (DE, DELA, SAN, etc.)
    if (MIDDLE_NAME_MARKERS.has(upper[i])) {
      return {
        first: tokens.slice(0, i).join(' '),
        middle: tokens.slice(i).join(' '),
      };
    }
  }

  // Fallback: last word is the middle name (mother's maiden surname)
  return {
    first: tokens.slice(0, -1).join(' '),
    middle: tokens[tokens.length - 1],
  };
}

/**
 * Split a full name into last / first / middle.
 *
 * Handles:
 *  - Comma format:  "LAST, FIRST MIDDLE"  (PSIPOP / plantilla convention)
 *  - Space format:  "FIRST MIDDLE LAST"
 *
 * Compound Filipino middle names (e.g. "De Guzman", "Dela Cruz",
 * "Delos Santos") are kept together so they are not split across the
 * first-name and middle-name fields.
 */
function splitName(fullName: string): { last: string; first: string; middle: string } {
  if (!fullName || !fullName.trim()) return { last: '', first: '', middle: '' };
  const parts = fullName.split(',').map((s) => s.trim());

  // Comma format: "LAST, FIRST MIDDLE"
  if (parts.length >= 2) {
    const last = parts[0];
    const given = parts.slice(1).join(', ').trim().split(/\s+/).filter(Boolean);
    const { first, middle } = splitFirstMiddle(given);
    return { last, first, middle };
  }

  // Space-only format: "FIRST [MIDDLE...] LAST"
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return { last: tokens[0] || '', first: '', middle: '' };
  }

  // Try to detect a compound surname at the end (e.g. "Mary Jane Dela Cruz")
  const upper = tokens.map(t => t.toUpperCase());
  const lastTwo = upper.slice(-2).join(' ');
  const lastThree = upper.slice(-3).join(' ');
  for (const cm of COMPOUND_MIDDLE_NAMES) {
    if (lastThree === cm) {
      return {
        last: cm,
        first: tokens.slice(0, -3).join(' ') || tokens[0],
        middle: '',
      };
    }
    if (lastTwo === cm) {
      return {
        last: cm,
        first: tokens.slice(0, -2).join(' '),
        middle: '',
      };
    }
  }

  return {
    last: tokens[tokens.length - 1] || '',
    first: tokens[0] || '',
    middle: tokens.slice(1, -1).join(' '),
  };
}

export async function exportPSIPOPToExcel(positions: PlantillaPosition[]): Promise<void> {
  if (positions.length === 0) throw new Error('No plantilla positions to export.');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PSIPOP Personnel System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('PSIPOP Report', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = PSIPOP_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width / 7,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B3A5C' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 32;
  headerRow.border = {
    top: { style: 'thin', color: { argb: 'FF1B3A5C' } },
    left: { style: 'thin', color: { argb: 'FF1B3A5C' } },
    bottom: { style: 'thin', color: { argb: 'FF1B3A5C' } },
    right: { style: 'thin', color: { argb: 'FF1B3A5C' } },
  };

  const dateColumns = new Set(PSIPOP_COLUMNS.filter((c) => c.type === 'date').map((c) => c.key));

  positions.forEach((pos, idx) => {
    const name = splitName(pos.employee_name || '');
    const dobRaw = pos.birth_date || pos.date_of_birth || '';
    const origAppRaw = pos.original_appointment_date || pos.appointment_date || '';
    const lastPromoRaw = pos.last_promotion_date || '';

    const rowData: Record<string, string | number | Date | null> = {
      department: pos.department || 'Department of Education',
      organizational_unit: pos.organizational_unit || pos.school_name || pos.office_assignment || '',
      item_number: pos.item_number,
      position_title: pos.position_title,
      salary_grade: pos.salary_grade,
      authorized_salary: pos.authorized_salary || pos.annual_salary || 0,
      actual_salary: pos.actual_salary || 0,
      step: pos.step || pos.salary_step || 1,
      area_code: pos.area || pos.school_id || '',
      area_type: pos.type || pos.school_type || '',
      level: pos.level || '',
      last_name: name.last,
      first_name: name.first,
      middle_name: name.middle,
      sex: pos.sex || '',
      date_of_birth: parseDate(dobRaw),
      age: computeAge(dobRaw),
      tin: pos.tin || '',
      original_appointment: parseDate(origAppRaw),
      last_promotion: parseDate(lastPromoRaw),
      status: pos.position_status || '',
      civil_service_eligibility: pos.eligibility || pos.civil_service_eligibility || '',
      comment: '',
      pwd: '',
      indigenous_people: '',
      solo_parent_id: '',
      abolished: '',
      dissolved: '',
      gsis_bp_number: '',
      position_classification: pos.personnel_category || '',
    };

    const row = sheet.addRow(rowData);

    dateColumns.forEach((colKey) => {
      const cell = row.getCell(colKey);
      const val = cell.value;
      if (val instanceof Date) {
        cell.numFmt = 'MM/DD/YYYY';
      } else if (val === null) {
        cell.value = '';
      }
    });

    const numColumns = new Set(PSIPOP_COLUMNS.filter((c) => c.type === 'number').map((c) => c.key));
    ['authorized_salary', 'actual_salary'].forEach((k) => {
      if (typeof rowData[k] === 'number') row.getCell(k).numFmt = '#,##0';
    });
    numColumns.forEach((k) => {
      if (typeof rowData[k] !== 'number') row.getCell(k).value = '';
    });

    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FA' } };
      });
    }

    row.font = { name: 'Calibri', size: 10 };
    row.alignment = { vertical: 'middle' };
    row.height = 18;
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: PSIPOP_COLUMNS.length },
  };

  PSIPOP_COLUMNS.forEach((col, i) => {
    const colObj = sheet.getColumn(i + 1);
    if (col.type === 'number') colObj.alignment = { horizontal: 'right' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  saveAs(blob, `PSIPOP_Report_${yyyymmdd}.xlsx`);
}
