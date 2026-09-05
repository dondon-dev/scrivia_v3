import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Pencil, Trash2, X, Download, Upload, AlertCircle,
  CheckCircle2, UserPlus, FileSpreadsheet, ChevronUp, ChevronDown,
} from 'lucide-react';
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import { Pagination, usePagination } from '@/components/Pagination';
import {
  type NonPlantillaEmployee, type NonPlantillaForm,
  emptyNonPlantillaForm, formFromNonPlantilla,
} from '@/types/nonplantilla';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';

const SEX_OPTIONS = ['', 'Male', 'Female'];
const CIVIL_STATUS_OPTIONS = ['', 'Single', 'Married', 'Widowed', 'Separated'];

const COLUMNS: { key: keyof NonPlantillaEmployee; label: string; sortable: boolean }[] = [
  { key: 'surname', label: 'Surname', sortable: true },
  { key: 'first_name', label: 'First Name', sortable: true },
  { key: 'middle_name', label: 'Middle Name', sortable: false },
  { key: 'complete_name', label: 'Complete Name', sortable: true },
  { key: 'school', label: 'School', sortable: true },
  { key: 'designation', label: 'Designation', sortable: true },
  { key: 'pagibig_number', label: 'PAG-IBIG', sortable: false },
  { key: 'philhealth', label: 'PhilHealth', sortable: false },
  { key: 'landbank', label: 'Land Bank', sortable: false },
  { key: 'first_day_of_service', label: 'First Day of Service', sortable: true },
  { key: 'contact_number', label: 'Contact Number', sortable: false },
  { key: 'birthday', label: 'Birthday', sortable: true },
  { key: 'sex', label: 'Sex', sortable: true },
  { key: 'address', label: 'Address', sortable: false },
  { key: 'civil_status', label: 'Civil Status', sortable: true },
  { key: 'tin', label: 'TIN', sortable: false },
];

interface FormFieldDef {
  key: keyof NonPlantillaForm;
  label: string;
  type?: 'text' | 'date' | 'select' | 'textarea';
  options?: string[];
  required?: boolean;
  maxLength?: number;
}

const FORM_FIELDS: FormFieldDef[] = [
  { key: 'surname', label: 'Surname', type: 'text', required: true, maxLength: 100 },
  { key: 'first_name', label: 'First Name', type: 'text', required: true, maxLength: 100 },
  { key: 'middle_name', label: 'Middle Name', type: 'text', maxLength: 100 },
  { key: 'school', label: 'School / Office', type: 'text', required: true },
  { key: 'designation', label: 'Designation', type: 'text', required: true },
  { key: 'pagibig_number', label: 'PAG-IBIG Number', type: 'text', maxLength: 50 },
  { key: 'philhealth', label: 'PhilHealth Number', type: 'text', maxLength: 50 },
  { key: 'landbank', label: 'Land Bank Account', type: 'text', maxLength: 50 },
  { key: 'tin', label: 'TIN', type: 'text', maxLength: 50 },
  { key: 'contact_number', label: 'Contact Number', type: 'text', maxLength: 30 },
  { key: 'first_day_of_service', label: 'First Day of Service', type: 'date' },
  { key: 'birthday', label: 'Birthday', type: 'date' },
  { key: 'sex', label: 'Sex', type: 'select', options: SEX_OPTIONS },
  { key: 'civil_status', label: 'Civil Status', type: 'select', options: CIVIL_STATUS_OPTIONS },
  { key: 'address', label: 'Address', type: 'textarea' },
];

function formatDate(d: string | null): string {
  if (!d) return '';
  return d.slice(0, 10);
}

function isValidContactNumber(num: string): boolean {
  if (!num) return true;
  const cleaned = num.replace(/[\s\-()]/g, '');
  return /^(09|\+639)\d{9}$/.test(cleaned);
}

function validateForm(form: NonPlantillaForm): string | null {
  if (!form.surname.trim()) return 'Surname is required.';
  if (!form.first_name.trim()) return 'First Name is required.';
  if (!form.school.trim()) return 'School / Office is required.';
  if (!form.designation.trim()) return 'Designation is required.';
  if (form.contact_number && !isValidContactNumber(form.contact_number))
    return 'Contact number must be a valid Philippine mobile format (e.g. 09171234567 or +639171234567).';
  const today = new Date().toISOString().slice(0, 10);
  if (form.birthday && form.birthday > today) return 'Birthday cannot be a future date.';
  if (form.first_day_of_service && form.first_day_of_service > today)
    return 'First Day of Service cannot be a future date.';
  return null;
}

export default function NonPlantillaItems() {
  const { logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  const [records, setRecords] = useState<NonPlantillaEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('All');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [sexFilter, setSexFilter] = useState('All');
  const [sortCol, setSortCol] = useState<keyof NonPlantillaEmployee>('surname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<NonPlantillaEmployee | null>(null);
  const [form, setForm] = useState<NonPlantillaForm>(emptyNonPlantillaForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<NonPlantillaEmployee | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; inserted: number; updated: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Division-scoped: REGCODE + DIVCODE are the unique reference for one
      // division's payroll, so only rows of the selected division are loaded.
      // Unscoped (super admin, "All Divisions") sees every row.
      const scope = codeScope(scopedCodes);
      let query = supabase.from('non_plantilla_employees').select('*').eq('is_deleted', false);
      if (scope.regcode) {
        query = query.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const data = await fetchAll<NonPlantillaEmployee>(() => query);
      setRecords(data);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [scopedCodes]);

  useEffect(() => { load(); }, [load]);

  // Build filter option lists from data
  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => { if (r.school) set.add(r.school); });
    return ['All', ...[...set].sort()];
  }, [records]);

  const designationOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => { if (r.designation) set.add(r.designation); });
    return ['All', ...[...set].sort()];
  }, [records]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = records;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(r =>
        r.surname.toLowerCase().includes(q) ||
        r.first_name.toLowerCase().includes(q) ||
        r.middle_name.toLowerCase().includes(q) ||
        r.complete_name.toLowerCase().includes(q) ||
        r.school.toLowerCase().includes(q) ||
        r.designation.toLowerCase().includes(q) ||
        (r.tin ?? '').toLowerCase().includes(q) ||
        (r.pagibig_number ?? '').toLowerCase().includes(q) ||
        (r.philhealth ?? '').toLowerCase().includes(q) ||
        (r.contact_number ?? '').toLowerCase().includes(q),
      );
    }
    if (schoolFilter !== 'All') result = result.filter(r => r.school === schoolFilter);
    if (designationFilter !== 'All') result = result.filter(r => r.designation === designationFilter);
    if (sexFilter !== 'All') result = result.filter(r => r.sex === sexFilter);

    const sorted = [...result].sort((a, b) => {
      const av = String(a[sortCol] ?? '');
      const bv = String(b[sortCol] ?? '');
      if (sortDir === 'asc') return av.localeCompare(bv, undefined, { numeric: true });
      return bv.localeCompare(av, undefined, { numeric: true });
    });
    return sorted;
  }, [records, search, schoolFilter, designationFilter, sexFilter, sortCol, sortDir]);

  const paginated = usePagination(filtered, 10, `${search}-${schoolFilter}-${designationFilter}-${sexFilter}`);

  function handleSort(col: keyof NonPlantillaEmployee) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyNonPlantillaForm());
    setError('');
    setShowModal(true);
  }

  function openEdit(rec: NonPlantillaEmployee) {
    setEditing(rec);
    setForm(formFromNonPlantilla(rec));
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Auto-assign the acting division's REGCODE/DIVCODE when creating a record
    // under a single division (the DB trigger covers division admins; this
    // covers the super administrator working inside a selected division).
    const scope = codeScope(scopedCodes);
    const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
      ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
      : {};

    const payload = {
      surname: form.surname.trim(),
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      school: form.school.trim(),
      designation: form.designation.trim(),
      pagibig_number: form.pagibig_number.trim() || null,
      philhealth: form.philhealth.trim() || null,
      landbank: form.landbank.trim() || null,
      tin: form.tin.trim() || null,
      first_day_of_service: form.first_day_of_service || null,
      contact_number: form.contact_number.trim(),
      birthday: form.birthday || null,
      sex: form.sex,
      address: form.address.trim(),
      civil_status: form.civil_status,
    };

    setSaving(true);
    setError('');
    try {
      if (editing) {
        const { error: upErr } = await supabase
          .from('non_plantilla_employees')
          .update(payload)
          .eq('id', editing.id);
        if (upErr) {
          if (upErr.code === '23505') {
            setError('A record with one of the provided unique numbers (TIN, PAG-IBIG, PhilHealth, or Land Bank) already exists.');
          } else {
            setError(upErr.message);
          }
          return;
        }
        await logAudit('update_non_plantilla', 'non_plantilla_employees', editing.id, { surname: payload.surname, first_name: payload.first_name });
      } else {
        const { error: insErr } = await supabase
          .from('non_plantilla_employees')
          .insert({ ...payload, ...stamp });
        if (insErr) {
          if (insErr.code === '23505') {
            setError('A record with one of the provided unique numbers (TIN, PAG-IBIG, PhilHealth, or Land Bank) already exists.');
          } else {
            setError(insErr.message);
          }
          return;
        }
        await logAudit('create_non_plantilla', 'non_plantilla_employees', undefined, { surname: payload.surname, first_name: payload.first_name });
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rec: NonPlantillaEmployee) {
    const { error: delErr } = await supabase
      .from('non_plantilla_employees')
      .update({ is_deleted: true })
      .eq('id', rec.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await logAudit('delete_non_plantilla', 'non_plantilla_employees', rec.id, { surname: rec.surname, first_name: rec.first_name });
    setShowDeleteConfirm(null);
    await load();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const { error: delErr } = await supabase
      .from('non_plantilla_employees')
      .update({ is_deleted: true })
      .in('id', ids);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await logAudit('bulk_delete_non_plantilla', 'non_plantilla_employees', undefined, { count: ids.length });
    setSelectedIds(new Set());
    setShowBulkDelete(false);
    await load();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = paginated.pagedItems.map(r => r.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  // Export to Excel (CSV)
  function handleExport() {
    const headers = COLUMNS.map(c => c.label);
    const rows = filtered.map(r => COLUMNS.map(c => {
      const val = r[c.key];
      if (c.key === 'first_day_of_service' || c.key === 'birthday') return formatDate(val as string | null);
      return String(val ?? '').replace(/"/g, '""');
    }));
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non_plantilla_employees_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit('export_non_plantilla', 'non_plantilla_employees', undefined, { count: filtered.length });
  }

  function handleDownloadTemplate() {
    const headers = COLUMNS.filter(c => c.key !== 'complete_name' && c.key !== 'is_deleted' && c.key !== 'created_at' && c.key !== 'updated_at').map(c => c.label);
    const csv = [headers.join(','), ''].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'non_plantilla_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        setImportResult({ total: 0, inserted: 0, updated: 0, errors: ['File is empty or has no data rows.'] });
        return;
      }
      // Parse CSV (simple — handles quoted fields)
      const parseRow = (line: string): string[] => {
        const cells: string[] = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cur += ch; }
          } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === ',') { cells.push(cur); cur = ''; }
            else { cur += ch; }
          }
        }
        cells.push(cur);
        return cells;
      };

      const headerMap: Record<string, string> = {
        'Surname': 'surname', 'First Name': 'first_name', 'Middle Name': 'middle_name',
        'School': 'school', 'Designation': 'designation', 'PAG-IBIG': 'pagibig_number',
        'PhilHealth': 'philhealth', 'Land Bank': 'landbank', 'First Day of Service': 'first_day_of_service',
        'Contact Number': 'contact_number', 'Birthday': 'birthday', 'Sex': 'sex',
        'Address': 'address', 'Civil Status': 'civil_status', 'TIN': 'tin',
      };
      const headers = parseRow(lines[0]).map(h => h.trim());
      const colIndices: Record<string, number> = {};
      headers.forEach((h, i) => {
        const mapped = headerMap[h];
        if (mapped) colIndices[mapped] = i;
      });

      const errors: string[] = [];
      let inserted = 0;
      let updated = 0;

      // Upsert matching is scoped to the selected division: only this
      // division's rows can be updated, and new rows are stamped with the
      // division's REGCODE/DIVCODE (uploaded = assigned to that division).
      const scope = codeScope(scopedCodes);
      let existingQuery = supabase.from('non_plantilla_employees').select('*').eq('is_deleted', false);
      if (scope.regcode) {
        existingQuery = existingQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const existing = await fetchAll<NonPlantillaEmployee>(() => existingQuery);
      const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
        ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
        : {};
      const existingByTin = new Map<string, NonPlantillaEmployee>();
      const existingByPagibig = new Map<string, NonPlantillaEmployee>();
      existing.forEach(r => {
        if (r.tin) existingByTin.set(r.tin.toLowerCase(), r);
        if (r.pagibig_number) existingByPagibig.set(r.pagibig_number.toLowerCase(), r);
      });

      for (let i = 1; i < lines.length; i++) {
        const cells = parseRow(lines[i]);
        const get = (key: string): string => {
          const idx = colIndices[key];
          return idx !== undefined ? (cells[idx] ?? '').trim() : '';
        };
        const rowSurname = get('surname');
        const rowFirstName = get('first_name');
        if (!rowSurname || !rowFirstName) {
          errors.push(`Row ${i + 1}: Missing surname or first name.`);
          continue;
        }
        const rowSchool = get('school');
        const rowDesignation = get('designation');
        if (!rowSchool || !rowDesignation) {
          errors.push(`Row ${i + 1}: Missing school or designation.`);
          continue;
        }

        const payload = {
          surname: rowSurname,
          first_name: rowFirstName,
          middle_name: get('middle_name'),
          school: rowSchool,
          designation: rowDesignation,
          pagibig_number: get('pagibig_number') || null,
          philhealth: get('philhealth') || null,
          landbank: get('landbank') || null,
          tin: get('tin') || null,
          first_day_of_service: get('first_day_of_service') || null,
          contact_number: get('contact_number'),
          birthday: get('birthday') || null,
          sex: get('sex'),
          address: get('address'),
          civil_status: get('civil_status'),
        };

        // Check for existing by TIN or PAG-IBIG for upsert
        const existingRec = (payload.tin && existingByTin.get(payload.tin.toLowerCase())) ||
          (payload.pagibig_number && existingByPagibig.get(payload.pagibig_number.toLowerCase()));

        if (existingRec) {
          const { error: upErr } = await supabase
            .from('non_plantilla_employees')
            .update(payload)
            .eq('id', existingRec.id);
          if (upErr) {
            errors.push(`Row ${i + 1}: ${upErr.message}`);
          } else {
            updated++;
          }
        } else {
          const { error: insErr } = await supabase
            .from('non_plantilla_employees')
            .insert({ ...payload, ...stamp });
          if (insErr) {
            errors.push(`Row ${i + 1}: ${insErr.message}`);
          } else {
            inserted++;
          }
        }
      }

      setImportResult({ total: lines.length - 1, inserted, updated, errors: errors.slice(0, 20) });
      await logAudit('import_non_plantilla', 'non_plantilla_employees', undefined, { inserted, updated, errors: errors.length });
      await load();
    } catch (err) {
      setImportResult({ total: 0, inserted: 0, updated: 0, errors: [err instanceof Error ? err.message : 'Import failed.'] });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const pageIds = paginated.pagedItems.map(r => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Non-Plantilla Items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage Job Order, COS, Contractual, Casual, and Substitute personnel records.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Template
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, school, TIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)} className={inputCls}>
            {schoolOptions.map(s => <option key={s} value={s}>{s === 'All' ? 'All Schools' : s}</option>)}
          </select>
          <select value={designationFilter} onChange={e => setDesignationFilter(e.target.value)} className={inputCls}>
            {designationOptions.map(d => <option key={d} value={d}>{d === 'All' ? 'All Designations' : d}</option>)}
          </select>
          <select value={sexFilter} onChange={e => setSexFilter(e.target.value)} className={inputCls}>
            {['All', 'Male', 'Female'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Sex' : s}</option>)}
          </select>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`rounded-xl border p-4 ${importResult.errors.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Import complete: {importResult.inserted} added, {importResult.updated} updated, {importResult.errors.length} error(s).
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                  {importResult.errors.map((er, i) => <li key={i}>{er}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && !showModal && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:text-slate-700 dark:hover:text-slate-200' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortCol === col.key && (
                        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-3 py-12 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : paginated.pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-3 py-12 text-center text-slate-400">
                    No non-plantilla records found. Click "Add Employee" to create one.
                  </td>
                </tr>
              ) : (
                paginated.pagedItems.map(rec => (
                  <tr
                    key={rec.id}
                    className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${selectedIds.has(rec.id) ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(rec.id)}
                        onChange={() => toggleSelect(rec.id)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    {COLUMNS.map(col => {
                      const val = rec[col.key];
                      const display = (col.key === 'first_day_of_service' || col.key === 'birthday')
                        ? formatDate(val as string | null)
                        : String(val ?? '');
                      return (
                        <td key={col.key} className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={display}>
                          {display}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(rec)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(rec)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination pagination={paginated} label="records" />

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/20">
            <span className="text-sm text-amber-700 dark:text-amber-400">
              {selectedIds.size} record(s) selected
            </span>
            <button
              onClick={() => setShowBulkDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                {editing ? 'Edit Non-Plantilla Employee' : 'Add Non-Plantilla Employee'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mx-5 mt-4 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>
              </div>
            )}

            <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FORM_FIELDS.map(field => {
                const val = form[field.key];
                const isReq = field.required;
                return (
                  <label key={field.key} className={`block ${field.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                      {field.label}{isReq && <span className="text-rose-500"> *</span>}
                    </span>
                    {field.type === 'select' ? (
                      <select
                        value={String(val ?? '')}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                        className={inputCls}
                      >
                        {field.options?.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={String(val ?? '')}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                        rows={2}
                        className={inputCls}
                      />
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : 'text'}
                        maxLength={field.maxLength}
                        value={val === null ? '' : String(val ?? '')}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value || null })}
                        className={inputCls}
                      />
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : (editing ? 'Update' : 'Save')}
                {!saving && <CheckCircle2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Delete Record</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Are you sure you want to delete <span className="font-medium text-slate-700 dark:text-slate-200">{showDeleteConfirm.complete_name || `${showDeleteConfirm.surname}, ${showDeleteConfirm.first_name}`}</span>? This action will soft-delete the record.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {showBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Delete {selectedIds.size} Records</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Are you sure you want to delete {selectedIds.size} selected record(s)? This action will soft-delete the records.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowBulkDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
