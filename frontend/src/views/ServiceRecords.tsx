import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, Loader2, Trash2, User, CalendarDays,
  Briefcase, AlertTriangle, CheckCircle2, X, Hash, MapPin, Eye, Printer,
} from 'lucide-react';
import { supabase, formatError } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { currency } from '@/lib/reports';
import { usePagination, Pagination } from '@/components/Pagination';

// The roster lists 20 persons per printed/viewed page.
const PERSONS_PER_PAGE = 20;

// ── Derived per-person facts ──────────────────────────────────────────────
// Date Hired: the FROM date of the first service line whose station/place of
// assignment is Calamba City (the start of employment in this Division).
// Date Promoted: the FROM date of the latest designation change — the most
// recent row whose designation differs from the row above it.

function calambaHireDate(r: ServiceRecord): string {
  for (const row of r.rows) {
    if (/calamba/i.test(row.station)) return row.from;
  }
  return '';
}

function latestPromotionDate(r: ServiceRecord): string {
  let prev = '';
  let promo = '';
  for (const row of r.rows) {
    const d = row.designation.trim();
    if (!d) continue;
    if (prev && d !== prev) promo = row.from;
    prev = d;
  }
  return promo;
}

function latestPosition(r: ServiceRecord): string {
  for (let i = r.rows.length - 1; i >= 0; i--) {
    const d = r.rows[i].designation.trim();
    if (d) return d;
  }
  return '';
}

const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Parsed model (mirrors the GSIS "Srecord" sheet layout) ────────────────

interface ServiceRow {
  from: string;
  to: string;
  designation: string;
  status: string;
  salary: string;      // annual amount as printed (monthly × 12 when formula)
  station: string;
  branch: string;
  separationDate: string;
  separationCause: string;
}

interface ServiceRecord {
  id: string;
  fileName: string;
  fileHash: string;
  division: string;
  surname: string;
  firstName: string;
  middleName: string;
  extName: string;
  birthDate: string;
  birthPlace: string;
  employeeNo: string;
  rowCount: number;
  rows: ServiceRow[];
  created: string;
  /** True for a record that still lives only in this browser — imported before
   *  this view wrote to PocketBase, or while the server was unreachable. */
  unsynced?: boolean;
}

/** PocketBase `service_records` row (snake_case columns). */
interface ServiceRecordRow {
  id: string;
  created?: string;
  empno?: string;
  division?: string;
  surname?: string;
  first_name?: string;
  middle_name?: string;
  ext_name?: string;
  birth_date?: string;
  birth_place?: string;
  file_name?: string;
  file_hash?: string;
  row_count?: number;
  rows?: ServiceRow[] | string;
}

const COLLECTION = 'service_records';

const str = (v: unknown): string => String(v ?? '').trim();

/** Map a PocketBase row into the view's record model. */
function fromRow(row: ServiceRecordRow): ServiceRecord {
  let rows: ServiceRow[] = [];
  const raw = row.rows;
  if (Array.isArray(raw)) rows = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) rows = parsed as ServiceRow[]; } catch { /* keep [] */ }
  }
  return {
    id: row.id,
    fileName: str(row.file_name),
    fileHash: str(row.file_hash),
    division: str(row.division),
    surname: str(row.surname),
    firstName: str(row.first_name),
    middleName: str(row.middle_name),
    extName: str(row.ext_name),
    birthDate: str(row.birth_date),
    birthPlace: str(row.birth_place),
    employeeNo: str(row.empno),
    rowCount: Number(row.row_count) || rows.length,
    rows,
    created: str(row.created) || new Date().toISOString(),
  };
}

/**
 * Employee Records id for an EMPNO — '' when the employee is not on file.
 * Lookup only: a service record is always saved, linked or not.
 */
async function findEmployeeIdByEmpno(empno: string): Promise<string> {
  const v = empno.trim();
  if (!v) return '';
  try {
    const a = await supabase.from('employees').select('id').eq('empno', v).limit(1);
    const rows = (a.data as { id: string }[] | null) ?? [];
    if (rows.length > 0) return rows[0].id;
    const b = await supabase.from('employees').select('id').eq('employee_number', v).limit(1);
    return ((b.data as { id: string }[] | null) ?? [])[0]?.id ?? '';
  } catch { return ''; }
}

// The browser keeps a mirror of the database list so the roster still renders
// (read-only) when PocketBase is unreachable. PocketBase remains the source of
// truth: every import/delete goes to the database.
const STORAGE_KEY = 'deped_service_records';

function loadStored(): ServiceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ServiceRecord[]) : [];
  } catch { return []; }
}

function persistStored(records: ServiceRecord[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* quota — keep UI usable */ }
}

const cellText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray((o as { richText?: unknown }).richText)) {
      return ((o as { richText: { text: string }[] }).richText).map((t) => t.text).join('');
    }
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    if (o.formula != null) return String(o.result ?? '');
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

const isDitto = (v: string) => /^-?\s*do-?\.?$/i.test(v.trim());

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();

// ── Parser for the first sheet of a GSIS-format Service Record workbook ───

export function parseServiceRecordSheet(sheetRows: unknown[][]): Omit<ServiceRecord, 'id' | 'created' | 'fileName'> {
  let division = '';
  let surname = ''; let firstName = ''; let middleName = ''; let extName = '';
  let birthDate = ''; let birthPlace = '';
  let employeeNo = '';
  const rows: ServiceRow[] = [];

  // Detect the table header row: it contains FROM + Designation
  let headerIdx = -1;
  for (let i = 0; i < Math.min(sheetRows.length, 30); i++) {
    const r = sheetRows[i] ?? [];
    const joined = r.map((c) => cellText(c).toUpperCase()).join('|');
    if (joined.includes('FROM') && joined.includes('DESIGNATION')) { headerIdx = i; break; }
  }

  for (let i = 0; i < sheetRows.length; i++) {
    const r = sheetRows[i] ?? [];
    const c = (n: number) => cellText(r[n - 1]);
    const raw = (n: number) => r[n - 1];

    if (!division) {
      const d = clean(c(1));
      if (/^DIVISION OF /i.test(d)) division = d;
    }

    // Name row: "Name :" label — surname col B, given col D, middle col F
    if (/^NAME\s*:/i.test(c(1))) {
      surname = clean(c(2));
      firstName = clean(c(4));
      middleName = clean(c(6));
      // Given name cell sometimes packs "ADONAI ABLOG" (given + middle)
      if (middleName === '' && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        firstName = parts[0];
        middleName = parts.slice(1).join(' ');
      }
    }

    // Birth row
    if (/^BIRTH\s*:/i.test(c(1))) {
      birthDate = clean(c(2));
      birthPlace = clean(c(5));
    }

    // Employee No. footer
    const empMatch = c(1).match(/Employee\s*No\.?\s*[:#]?\s*(\S+)/i) || c(2).match(/Employee\s*No\.?\s*[:#]?\s*(\S+)/i);
    if (empMatch && !employeeNo) employeeNo = empMatch[1];

    // Service rows live below the header
    if (headerIdx >= 0 && i > headerIdx) {
      const from = clean(c(1));
      const to = clean(c(2));
      if (!/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(from)) continue;       // not a data row
      if (/^FROM$/i.test(from)) continue;
      const prev = rows[rows.length - 1];
      const designation = isDitto(c(3)) ? prev?.designation ?? '' : clean(c(3));
      const status = isDitto(c(4)) ? prev?.status ?? '' : clean(c(4));
      const station = isDitto(c(6)) ? prev?.station ?? '' : clean(c(6));
      const branch = isDitto(c(8)) ? prev?.branch ?? '' : clean(c(8));
      // Salary can be a formula cell (monthly × 12) — use its computed result
      const salaryRaw = raw(5);
      let salary = cellText(salaryRaw);
      if (salaryRaw && typeof salaryRaw === 'object' && (salaryRaw as { formula?: string }).formula) {
        salary = cellText((salaryRaw as { result?: unknown }).result);
      }
      rows.push({
        from, to,
        designation, status,
        salary: salary ? String(Math.round(Number(salary) || 0)) : '',
        station, branch,
        separationDate: clean(c(9)),
        separationCause: clean(c(10)),
      });
    }
  }

  return {
    division, surname, firstName, middleName, extName: '',
    birthDate, birthPlace, employeeNo, rowCount: rows.length, rows,
    fileHash: '',
  };
}

// ── Excel reading (exceljs is already a project dependency) ───────────────

async function readWorkbookFirstSheet(file: File): Promise<unknown[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no sheets.');
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      vals[col - 1] = cell.value;
    });
    out.push(vals);
  });
  return out;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── View ──────────────────────────────────────────────────────────────────

export default function ServiceRecords() {
  const { profile } = useAuth();
  const { scopedCodes } = useOrg();
  const [records, setRecords] = useState<ServiceRecord[]>(() => loadStored());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = useCallback((next: ServiceRecord[]) => {
    setRecords(next);
    persistStored(next);
  }, []);

  const scopePayload = useCallback(() => ({
    regcode: scopedCodes?.[0]?.regcode ?? '',
    divcode: scopedCodes?.[0]?.divcode ?? '',
    created_by: profile?.email ?? '',
  }), [scopedCodes, profile]);

  // ── Load the roster from PocketBase (the source of truth) ───────────────
  // The browser's mirrored copy is merged in as "unsynced" so records imported
  // before this view used the database stay visible and can be uploaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from(COLLECTION)
          .select('*')
          .order('created', { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        const remote = ((data ?? []) as ServiceRecordRow[]).map(fromRow);
        const known = new Set(remote.map((r) => r.fileHash).filter(Boolean));
        const localOnly = loadStored()
          .filter((r) => !r.fileHash || !known.has(r.fileHash))
          .map((r) => ({ ...r, unsynced: true }));
        const merged = [...remote, ...localOnly]
          .sort((a, b) => String(b.created).localeCompare(String(a.created)));
        update(merged);
      } catch (e) {
        if (!cancelled) {
          setRecords(loadStored());
          setMessage({
            tone: 'err',
            text: `Could not load service records from PocketBase — showing this browser's copy. ${formatError(e)}`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [update]);

  // Accept any spreadsheet extension (.xlsx/.xlsm handled by exceljs; legacy
  // .xls is rejected with a clear message) and any file name — identity is
  // decided purely by content hash, so re-uploading the same sheet under a
  // different name is still recognised as a duplicate (PocketBase also carries
  // a unique index on file_hash). Each parsed workbook is written to the
  // service_records collection.
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true); setMessage(null);
    let added = 0; let skipped = 0; const errors: string[] = [];
    const existing = new Set(records.map((r) => r.fileHash).filter(Boolean));
    const created: ServiceRecord[] = [];
    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (existing.has(hash)) { skipped++; continue; }
        const sheetRows = await readWorkbookFirstSheet(file);
        const parsed = parseServiceRecordSheet(sheetRows);
        if (parsed.rows.length === 0 && !parsed.surname) {
          errors.push(`${file.name}: no service rows found on the first sheet.`);
          continue;
        }
        const { data, error } = await supabase.from(COLLECTION).insert({
          empno: parsed.employeeNo,
          employee_id: await findEmployeeIdByEmpno(parsed.employeeNo),
          ...scopePayload(),
          division: parsed.division,
          surname: parsed.surname,
          first_name: parsed.firstName,
          middle_name: parsed.middleName,
          ext_name: parsed.extName,
          birth_date: parsed.birthDate,
          birth_place: parsed.birthPlace,
          file_name: file.name,
          file_hash: hash,
          row_count: parsed.rows.length,
          rows: parsed.rows,
        });
        if (error) {
          const msg = formatError(error);
          // Another browser already stored this workbook — a duplicate, not a failure.
          if (/unique|duplicate|already exists/i.test(msg)) { skipped++; continue; }
          errors.push(`${file.name}: ${msg}`);
          continue;
        }
        existing.add(hash);
        created.push(fromRow(data as ServiceRecordRow));
        added++;
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    if (created.length) update([...created, ...records]);
    const parts: string[] = [];
    if (added) parts.push(`${added} service record${added > 1 ? 's' : ''} saved`);
    if (skipped) parts.push(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped (same content)`);
    if (errors.length) parts.push(errors.join(' · '));
    setMessage({ tone: errors.length ? 'err' : 'ok', text: parts.join(' — ') || 'Nothing to import.' });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  /**
   * Upload the browser-only records that PocketBase does not have yet — the
   * way records imported before this view wrote to the database get in.
   */
  async function uploadLocalRecords() {
    const pending = records.filter((r) => r.unsynced);
    if (pending.length === 0) return;
    setBusy(true); setMessage(null);
    const scope = scopePayload();
    const replaced = new Map<string, ServiceRecord>();
    const errors: string[] = [];
    for (const r of pending) {
      if (!r.fileHash) {
        errors.push(`${fullName(r) || r.fileName || 'Untitled'}: no content hash — re-import the workbook.`);
        continue;
      }
      const { data, error } = await supabase.from(COLLECTION).insert({
        empno: r.employeeNo,
        employee_id: await findEmployeeIdByEmpno(r.employeeNo),
        ...scope,
        division: r.division,
        surname: r.surname,
        first_name: r.firstName,
        middle_name: r.middleName,
        ext_name: r.extName,
        birth_date: r.birthDate,
        birth_place: r.birthPlace,
        file_name: r.fileName,
        file_hash: r.fileHash,
        row_count: r.rowCount,
        rows: r.rows,
      });
      if (error) {
        errors.push(`${fullName(r) || r.fileName || 'Untitled'}: ${formatError(error)}`);
        continue;
      }
      replaced.set(r.id, fromRow(data as ServiceRecordRow));
    }
    update(records.map((r) => replaced.get(r.id) ?? r));
    setBusy(false);
    const parts: string[] = [];
    if (replaced.size) parts.push(`${replaced.size} record${replaced.size === 1 ? '' : 's'} uploaded to PocketBase`);
    if (errors.length) parts.push(errors.join(' · '));
    setMessage({ tone: errors.length ? 'err' : 'ok', text: parts.join(' — ') || 'Nothing to upload.' });
  }

  async function removeRecord(id: string) {
    const target = records.find((r) => r.id === id);
    if (!target) return;
    if (!window.confirm('Delete this service record? This removes it from the database.')) return;
    // A browser-only copy has nothing to delete in the database.
    if (target.unsynced) { update(records.filter((r) => r.id !== id)); return; }
    setBusy(true); setMessage(null);
    const { error } = await supabase.from(COLLECTION).delete().eq('id', id);
    setBusy(false);
    if (error) {
      setMessage({ tone: 'err', text: `Could not delete the service record: ${formatError(error)}` });
      return;
    }
    update(records.filter((r) => r.id !== id));
    setMessage({ tone: 'ok', text: `Deleted the service record for ${fullName(target) || target.fileName || 'this employee'}.` });
  }

  const fullName = (r: ServiceRecord) =>
    [r.surname, r.firstName, r.middleName].filter(Boolean).join(', ') + (r.extName ? ` ${r.extName}` : '');

  // Roster page — 20 persons per page with a name filter.
  const [nameFilter, setNameFilter] = useState('');
  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      fullName(r).toLowerCase().includes(q) ||
      String(r.employeeNo ?? '').toLowerCase().includes(q));
  }, [records, nameFilter]);
  const { page, setPage, totalPages, pagedItems } = usePagination(filtered, PERSONS_PER_PAGE);

  // Browser-only records — imported before this view wrote to PocketBase.
  const unsyncedCount = records.filter((r) => r.unsynced).length;

  const detail = detailId ? records.find((r) => r.id === detailId) ?? null : null;

  // ── Print helpers (opens a print-friendly window and triggers the dialog) ─

  function printRoster() {
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = filtered.map((r, i) => `<tr>
      <td style="padding:5px 8px;border:1px solid #999;text-align:center">${i + 1}</td>
      <td style="padding:5px 8px;border:1px solid #999">${escapeHtml(fullName(r) || r.fileName)}</td>
      <td style="padding:5px 8px;border:1px solid #999">${escapeHtml(latestPosition(r))}</td>
      <td style="padding:5px 8px;border:1px solid #999;text-align:center">${escapeHtml(calambaHireDate(r) || '—')}</td>
      <td style="padding:5px 8px;border:1px solid #999;text-align:center">${escapeHtml(latestPromotionDate(r) || '—')}</td>
    </tr>`).join('');
    win.document.write(`<html><head><title>Service Records — Roster</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#111}
        h1{font-size:16px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px}
        h2{font-size:12px;margin:0 0 10px;color:#444;font-weight:600}
        p.meta{font-size:10px;color:#666;margin:0 0 12px}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th{background:#f1f5f9;padding:6px 8px;border:1px solid #999;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
        tfoot td{font-weight:600;background:#f8fafc}
      </style>
      </head><body>
      <h1>Service Records — Roster of Personnel</h1>
      <h2>${escapeHtml(records[0]?.division || 'Division Office')}</h2>
      <p class="meta">Generated ${new Date().toLocaleString('en-PH')} — ${filtered.length} person${filtered.length === 1 ? '' : 's'}${nameFilter ? ` (filtered by “${escapeHtml(nameFilter)}”)` : ''}</p>
      <table><thead><tr>
        <th style="width:36px">#</th><th>Name</th><th>Position</th><th style="width:110px">Date Hired</th><th style="width:110px">Date Promoted</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="5">Total: ${filtered.length}</td></tr></tfoot></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    win.document.close();
  }

  // Prints the individual record as a faithful replica of the source Excel
  // (GSIS "Srecord" sheet): centered division/SERVICE RECORD header, Name and
  // Birth label rows with the form's parenthetical notes, the certification
  // paragraph, the grouped two-level table header (RECORD OF APPOINTMENT /
  // OFFICE ENTITY-DIVISION / SEPARATION with the (1)-(4) column numbers), the
  // Employee No. footer and the CERTIFIED CORRECT signature block.
  function printRecord(r: ServiceRecord) {
    const win = window.open('', '_blank');
    if (!win) return;
    const b = 'border:1px solid #000';
    const rowsHtml = r.rows.map((row) => `<tr>
      <td style="${b};padding:2px 5px;text-align:center">${escapeHtml(row.from)}</td>
      <td style="${b};padding:2px 5px;text-align:center">${escapeHtml(row.to)}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.designation)}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.status)}</td>
      <td style="${b};padding:2px 5px;text-align:right">${row.salary ? Number(row.salary).toLocaleString('en-PH') : ''}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.station)}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.branch)}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.separationDate)}</td>
      <td style="${b};padding:2px 5px">${escapeHtml(row.separationCause)}</td>
    </tr>`).join('');
    const note = 'font-size:6.5px;color:#333;font-weight:normal;vertical-align:bottom';
    win.document.write(`<html><head><title>Service Record — ${escapeHtml(fullName(r))}</title>
      <style>
        @page{size:letter landscape;margin:12mm 10mm}
        body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0}
        .wrap{max-width:1000px;margin:0 auto}
        .center{text-align:center}
        .division{font-size:12px;font-weight:bold;margin:0 0 4px}
        .title{font-size:20px;font-weight:bold;margin:0 0 2px}
        .subtitle{font-size:9px;margin:0 0 14px}
        table.form{border-collapse:collapse;width:100%}
        table.form td{font-size:10px;vertical-align:bottom}
        .lbl{font-size:10px;white-space:nowrap}
        .fill{border-bottom:1px solid #000;display:inline-block;min-width:150px;padding:0 6px;text-align:center;font-weight:bold}
        .small-lbl{font-size:7px;color:#333}
        table.grid{border-collapse:collapse;width:100%;margin-top:10px}
        table.grid th{${b};font-size:9px;padding:2px 5px;font-weight:normal}
        table.grid td{font-size:10px;padding:2px 5px}
        .certify{font-size:10px;margin:12px 0 0;line-height:1.5}
        .empno{font-size:10px;font-weight:bold;margin:10px 0 0}
        .cert-block{margin-top:26px;font-size:10px;width:320px;margin-left:60%}
        .sig-line{border-top:1px solid #000;margin-top:52px;padding-top:2px;font-size:9px;text-align:center}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style>
      </head><body><div class="wrap">
      <p class="division center">${escapeHtml(r.division || 'DIVISION OFFICE')}</p>
      <p class="title center">SERVICE RECORD</p>
      <p class="subtitle center">(To be accomplished by Employer)</p>

      <table class="form"><tr>
        <td class="lbl">Name :</td>
        <td class="center"><span class="fill">${escapeHtml(r.surname)}</span> <span class="small-lbl">(Surname)</span></td>
        <td class="center"><span class="fill">${escapeHtml(r.firstName)}</span> <span class="small-lbl">(Given Name)</span></td>
        <td class="center"><span class="fill">${escapeHtml(r.middleName)}</span> <span class="small-lbl">(Middle Name)</span></td>
        <td style="${note}">(If married, give also full maiden name)</td>
      </tr><tr>
        <td class="lbl">Birth :</td>
        <td colspan="2" class="center"><span class="fill">${escapeHtml(r.birthDate)}</span> <span class="small-lbl">(Date)</span></td>
        <td class="center"><span class="fill">${escapeHtml(r.birthPlace)}</span> <span class="small-lbl">(Place)</span></td>
        <td style="${note}">(Date herein should be checked from birth or baptismal certificate or other reliable documents)</td>
      </tr></table>

      <p class="certify">This is to certify that the employee named herein above actually rendered services in this Office as shown by the service record below, each line of which is supported by appointment and other papers actually issued by this Office and approved by the authorities concerned:</p>

      <table class="grid">
        <thead>
          <tr>
            <th colspan="2"></th>
            <th colspan="3" style="border-bottom:none">RECORD OF APPOINTMENT</th>
            <th colspan="3" style="border-bottom:none">OFFICE ENTITY/DIVISION</th>
            <th colspan="2" style="border-bottom:none">SEPARATION (4)</th>
          </tr>
          <tr>
            <th colspan="2">(Inclusive Dates)</th>
            <th rowspan="2">Designation</th>
            <th rowspan="2">Status (1)</th>
            <th rowspan="2">Salary (2)</th>
            <th rowspan="2">Station/Place of Assignment</th>
            <th rowspan="2">Branch (3)</th>
            <th rowspan="2">Date</th>
            <th rowspan="2">Cause</th>
          </tr>
          <tr><th>FROM</th><th>TO</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      ${r.employeeNo ? `<p class="empno">Employee No. ${escapeHtml(r.employeeNo)}</p>` : ''}

      <div class="cert-block">
        <div>CERTIFIED CORRECT:</div>
        <div>For the Schools Div. Supt.:</div>
        <div class="sig-line">Signature over Printed Name</div>
      </div>

      <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></div></body></html>`);
    win.document.close();
  }

  const stats = useMemo(() => ({
    files: records.length,
    employees: new Set(records.map((r) => `${r.surname}|${r.firstName}|${r.birthDate}`)).size,
    lines: records.reduce((s, r) => s + r.rowCount, 0),
  }), [records]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header + import */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Service Records</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upload GSIS-format service record workbooks — the first sheet is parsed and recorded in the
            PocketBase service_records collection. Identical content is skipped regardless of file name or
            extension.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.xls,.xltx,.xltm,.ods,.csv"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import Excel
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
          message.tone === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-200'
        }`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Roster — Name / Position / Date Hired / Date Promoted, 20 per page */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={nameFilter}
          onChange={(e) => { setNameFilter(e.target.value); setPage(1); }}
          placeholder="Search name or employee no…"
          className="w-full sm:w-72 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-deped-500"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} person{filtered.length === 1 ? '' : 's'} · {PERSONS_PER_PAGE} per page</span>
        <button
          onClick={printRoster}
          disabled={filtered.length === 0}
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          title="Print the roster"
        >
          <Printer className="w-4 h-4" />
          Print Roster
        </button>
      </div>

      {!loading && unsyncedCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {unsyncedCount} service record{unsyncedCount === 1 ? '' : 's'} in this browser {unsyncedCount === 1 ? 'is' : 'are'} not
            in PocketBase yet.
          </span>
          <button
            onClick={() => void uploadLocalRecords()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Save to PocketBase
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 py-16 text-center text-slate-400">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
          <p className="mt-2 text-sm">Loading service records…</p>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center">
          <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No service records yet</p>
          <p className="text-xs text-slate-500 mt-1">Click “Import Excel” and pick one or more service record workbooks.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/70">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Position</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Date Hired</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Date Promoted</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedItems.map((r) => (
                  <tr key={r.id} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setDetailId(r.id)}
                        className="font-semibold text-deped-700 dark:text-deped-300 hover:underline text-left"
                        title="View full service record"
                      >
                        {fullName(r) || r.fileName}
                      </button>
                      {r.employeeNo && <p className="text-[11px] text-slate-400">No. {r.employeeNo}</p>}
                    </td>
                    <td className="px-4 py-2">{latestPosition(r)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{calambaHireDate(r) || '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{latestPromotionDate(r) || '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetailId(r.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors"
                          title="View service record"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeRecord(r.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800">
            <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} label="service records" />
          </div>
        </div>
      )}

      {/* Full service record modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal header — employee identity */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-deped-700 dark:text-deped-300">{detail.division || 'Service Record'}</p>
                <h3 className="mt-0.5 text-base font-bold text-slate-800 dark:text-slate-100 truncate">{fullName(detail) || detail.fileName}</h3>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {detail.employeeNo && (
                    <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> No. {detail.employeeNo}</span>
                  )}
                  {detail.birthDate && (
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {detail.birthDate}</span>
                  )}
                  {detail.birthPlace && (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {detail.birthPlace}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => printRecord(detail)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors"
                  title="Print this service record"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setDetailId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Full service table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2 font-semibold">From</th>
                    <th className="px-2 py-2 font-semibold">To</th>
                    <th className="px-2 py-2 font-semibold">Designation</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold text-right">Salary</th>
                    <th className="px-2 py-2 font-semibold">Station</th>
                    <th className="px-4 py-2 font-semibold">Separation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.rows.map((row, i) => (
                    <tr key={i} className="text-slate-700 dark:text-slate-300">
                      <td className="px-4 py-1.5 whitespace-nowrap font-medium">{row.from}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.to}</td>
                      <td className="px-2 py-1.5">{row.designation}</td>
                      <td className="px-2 py-1.5">{row.status}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{row.salary ? currency(row.salary) : ''}</td>
                      <td className="px-2 py-1.5">{row.station}</td>
                      <td className="px-4 py-1.5">{[row.separationDate, row.separationCause].filter(Boolean).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
