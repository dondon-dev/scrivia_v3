import { useState, useRef, useCallback } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Upload, FileSpreadsheet, Download, X, CheckCircle2, AlertCircle,
  FileUp, Inbox,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';

interface ParsedRow {
  employee_number: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  department: string;
  stacode: string;
  bank_name: string;
  bank_account: string;
  basic_salary: number;
  grade: number;
  step: number;
  tin: string;
  philhealth_number: string;
  pagibig_number: string;
  hire_date: string;
  _errors: string[];
}

interface ImportResult {
  inserted: number;
  errors: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const EXPECTED_HEADERS = [
  'employee_number', 'last_name', 'first_name', 'middle_name',
  'position', 'department', 'stacode', 'bank_name', 'bank_account',
  'basic_salary', 'grade', 'step', 'tin', 'philhealth_number',
  'pagibig_number', 'hire_date',
];

function downloadTemplate() {
  const sampleRow = [
    'EMP-001', 'Dela Cruz', 'Juan', 'Santos',
    'Teacher I', 'Sample Elementary School', '101',
    'Land Bank', '1234-5678-9012', '25508', '11', '1',
    '123-456-789-000', '12-345678-901', '1111-2222-333-444', '2024-01-15',
  ];
  const csv = [EXPECTED_HEADERS.join(','), sampleRow.map(v => `"${v}"`).join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'initial_payroll_employees_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur); cur = '';
      } else { cur += ch; }
    }
    result.push(cur);
    return result;
  };
  const headerCells = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headerCells.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function validateRow(row: Record<string, string>): ParsedRow {
  const _errors: string[] = [];
  const employee_number = row.employee_number ?? '';
  const last_name = row.last_name ?? '';
  const first_name = row.first_name ?? '';
  const middle_name = row.middle_name ?? '';
  const position = row.position ?? '';
  const department = row.department ?? '';
  const stacode = row.stacode ?? '';
  const bank_name = row.bank_name ?? '';
  const bank_account = row.bank_account ?? '';
  const grade = Number(row.grade ?? 0) || 0;
  const step = Number(row.step ?? 0) || 0;
  const tin = row.tin ?? '';
  const philhealth_number = row.philhealth_number ?? '';
  const pagibig_number = row.pagibig_number ?? '';
  const hire_date = row.hire_date ?? '';

  if (!employee_number.trim()) _errors.push('Employee Number is required');
  if (!last_name.trim()) _errors.push('Last Name is required');
  if (!first_name.trim()) _errors.push('First Name is required');

  let basic_salary = 0;
  const rawSalary = row.basic_salary ?? '';
  if (rawSalary.trim()) {
    basic_salary = Number(rawSalary.replace(/[^0-9.]/g, '')) || 0;
    if (basic_salary < 0) {
      _errors.push('Basic Salary must be positive');
      basic_salary = 0;
    }
  } else {
    _errors.push('Basic Salary is required');
  }

  let parsedHireDate: string = new Date().toISOString().slice(0, 10);
  if (hire_date.trim()) {
    const d = new Date(hire_date);
    if (isNaN(d.getTime())) {
      _errors.push('Invalid hire date format (use YYYY-MM-DD)');
    } else {
      parsedHireDate = d.toISOString().slice(0, 10);
    }
  }

  return {
    employee_number: employee_number.trim(),
    last_name: last_name.trim(),
    first_name: first_name.trim(),
    middle_name: middle_name.trim(),
    position: position.trim(),
    department: department.trim(),
    stacode: stacode.trim(),
    bank_name: bank_name.trim(),
    bank_account: bank_account.trim(),
    basic_salary,
    grade,
    step,
    tin: tin.trim(),
    philhealth_number: philhealth_number.trim(),
    pagibig_number: pagibig_number.trim(),
    hire_date: parsedHireDate,
    _errors,
  };
}

export default function InitialEmployeeImportModal({ open, onClose, onImported }: Props) {
  const { logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStage('upload');
    setParsedRows([]);
    setFileName('');
    setImportResult(null);
    setErrorMsg('');
    setDragOver(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMsg('Please upload a CSV file.');
      return;
    }
    if (file.size > 5_000_000) {
      setErrorMsg('File too large (max 5MB).');
      return;
    }
    setErrorMsg('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const raw = parseCsv(text);
      if (raw.length === 0) {
        setErrorMsg('CSV file is empty or missing headers.');
        return;
      }
      const validated = raw.map(validateRow);
      setParsedRows(validated);
      setStage('preview');
    };
    reader.onerror = () => setErrorMsg('Failed to read file.');
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function doImport() {
    setStage('importing');
    setErrorMsg('');
    const valid = parsedRows.filter(r => r._errors.length === 0);
    if (valid.length === 0) {
      setErrorMsg('No valid rows to import.');
      setStage('preview');
      return;
    }

    // Auto-assign the acting division's REGCODE/DIVCODE to every uploaded
    // employee (division admins get it from the DB trigger too; this covers the
    // super administrator working inside a selected division). Uploaded records
    // are therefore always owned by the division they were uploaded under.
    const scope = codeScope(scopedCodes);
    const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
      ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
      : {};

    const payload = valid.map(({ _errors, ...rest }) => ({
      ...rest,
      ...stamp,
      status: 'Active',
      payroll_status: 'Initial Payroll',
      tax_status: 'ME1',
      hourly_rate: 0,
      empno: rest.employee_number,
      fname: rest.first_name,
      lname: rest.last_name,
      mi: rest.middle_name,
      poscode: rest.position,
      banker: rest.bank_name,
      account: rest.bank_account,
      basic: rest.basic_salary,
      hiredate: rest.hire_date,
      phic_id: rest.philhealth_number,
      hdmf_id: rest.pagibig_number,
    }));

    const { error } = await supabase
      .from('employees')
      .upsert(payload, { onConflict: 'employee_number' });

    if (error) {
      setErrorMsg(error.message);
      setStage('preview');
      return;
    }

    const errorCount = parsedRows.filter(r => r._errors.length > 0).length;
    setImportResult({ inserted: valid.length, errors: errorCount });
    setStage('done');
    onImported();

    try {
      await logAudit('csv_import', 'employees', undefined, {
        source: 'initial_payroll_csv',
        count: valid.length,
        fileName,
      });
    } catch { /* non-fatal */ }
  }

  if (!open) return null;

  const validCount = parsedRows.filter(r => r._errors.length === 0).length;
  const errorCount = parsedRows.filter(r => r._errors.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={handleClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <FileUp className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import Initial Payroll Employees</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Upload a CSV file to add employees to Initial Payroll</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
            </div>
          )}

          {/* Stage: Upload */}
          {stage === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                <Inbox className={`w-12 h-12 mx-auto mb-3 transition-colors ${dragOver ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Drop your CSV file here, or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">Maximum 5MB · CSV format only</p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Need a template?</p>
                    <p className="text-xs text-slate-400">Download the CSV template with sample data</p>
                  </div>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Download className="w-4 h-4" /> Download Template
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p className="font-semibold text-slate-600 dark:text-slate-300">Required columns (minimum):</p>
                <p><span className="font-medium">employee_number</span>, <span className="font-medium">last_name</span>, <span className="font-medium">first_name</span>, <span className="font-medium">basic_salary</span></p>
                <p className="font-semibold text-slate-600 dark:text-slate-300 mt-2">Optional columns:</p>
                <p>middle_name, position, department, stacode, bank_name, bank_account, grade, step, tin, philhealth_number, pagibig_number, hire_date</p>
                <p className="mt-2">All imported employees will have payroll_status set to <span className="font-medium text-amber-600">"Initial Payroll"</span> and status set to <span className="font-medium">"Active"</span>.</p>
                <p>Existing employees with the same Employee Number will be updated.</p>
              </div>
            </div>
          )}

          {/* Stage: Preview */}
          {stage === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-slate-700 dark:text-slate-200 font-medium">{fileName}</span>
                <span className="text-slate-400">· {parsedRows.length} rows parsed</span>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular">{validCount}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500">Valid</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 text-center">
                  <p className="text-2xl font-bold text-rose-700 dark:text-rose-400 tabular">{errorCount}</p>
                  <p className="text-[11px] text-rose-600 dark:text-rose-500">With Errors</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300 tabular">{parsedRows.length}</p>
                  <p className="text-[11px] text-slate-500">Total Rows</p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 backdrop-blur">
                      <tr className="text-slate-600 dark:text-slate-300">
                        <th className="px-3 py-2 text-left font-medium">Emp #</th>
                        <th className="px-3 py-2 text-left font-medium">Last Name</th>
                        <th className="px-3 py-2 text-left font-medium">First Name</th>
                        <th className="px-3 py-2 text-left font-medium">Position</th>
                        <th className="px-3 py-2 text-right font-medium">Salary</th>
                        <th className="px-3 py-2 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedRows.map((r, i) => (
                        <tr key={i} className={r._errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{r.employee_number || '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.last_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.first_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{r.position || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300 tabular">{r.basic_salary.toLocaleString()}</td>
                          <td className="px-3 py-2 text-center">
                            {r._errors.length > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400" title={r._errors.join('; ')}>
                                <AlertCircle className="w-4 h-4 inline" />
                              </span>
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Error details */}
              {errorCount > 0 && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">Errors:</p>
                  {parsedRows.filter(r => r._errors.length > 0).map((r, i) => (
                    <p key={i} className="text-xs text-rose-600 dark:text-rose-400">
                      Row {i + 1} ({r.employee_number || '—'}): {r._errors.join(', ')}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button onClick={() => setStage('upload')} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  Back
                </button>
                <button
                  onClick={doImport}
                  disabled={validCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Import {validCount} Employee{validCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* Stage: Importing */}
          {stage === 'importing' && (
            <div className="py-12 text-center">
              <LoadingIndicator size={40} />
              <p className="text-sm text-slate-600 dark:text-slate-300">Importing employees...</p>
            </div>
          )}

          {/* Stage: Done */}
          {stage === 'done' && importResult && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import Complete</p>
                <p className="text-sm text-slate-500 mt-1">
                  {importResult.inserted} employee{importResult.inserted !== 1 ? 's' : ''} added to Initial Payroll
                  {importResult.errors > 0 && ` · ${importResult.errors} row${importResult.errors !== 1 ? 's' : ''} with errors skipped`}
                </p>
              </div>
              <button onClick={handleClose} className="px-6 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
