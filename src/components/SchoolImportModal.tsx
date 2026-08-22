import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, Download, X, CheckCircle2, AlertCircle,
  FileUp, Inbox,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase } from '@/lib/supabase';
import type { SchoolType } from '@/types/schools';

interface ParsedRow {
  school_code: string;
  school_name: string;
  school_type: SchoolType;
  cluster: string;
  address: string;
  school_head: string;
  contact_number: string;
  email: string;
  status: string;
  _errors: string[];
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: number;
}

interface SchoolImportModalProps {
  open: boolean;
  onClose: () => void;
  schoolType: SchoolType;
  onImported: () => void;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';

const EXPECTED_HEADERS = ['school_code', 'school_name', 'cluster', 'address', 'school_head', 'contact_number', 'email', 'status'];

function downloadTemplate(schoolType: SchoolType) {
  const headers = EXPECTED_HEADERS;
  const sampleRow = [
    '101', `${schoolType === 'Elementary' ? 'Sample Elementary School' : 'Sample School'}`,
    'Cluster I', 'Brgy. Sample, Calamba City', 'Juan Dela Cruz', '0912-345-6789', 'school@deped.ph', 'Active',
  ];
  const csv = [headers.join(','), sampleRow.map(v => `"${v}"`).join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `school_import_template_${schoolType.toLowerCase().replace(/\s+/g, '_')}.csv`;
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

const VALID_STATUSES = ['Active', 'Inactive'];

function validateRow(row: Record<string, string>, schoolType: SchoolType): ParsedRow {
  const _errors: string[] = [];
  const school_code = row.school_code ?? '';
  const school_name = row.school_name ?? '';
  const cluster = row.cluster ?? '';
  const address = row.address ?? '';
  const school_head = row.school_head ?? '';
  const contact_number = row.contact_number ?? '';
  const email = row.email ?? '';
  let status = (row.status ?? 'Active').trim();
  if (!school_code.trim()) _errors.push('School Code is required');
  if (!school_name.trim()) _errors.push('School Name is required');
  if (status && !VALID_STATUSES.includes(status)) {
    _errors.push(`Status must be Active or Inactive (got "${status}")`);
    status = 'Active';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) _errors.push('Invalid email format');
  return {
    school_code: school_code.trim(),
    school_name: school_name.trim(),
    school_type: schoolType,
    cluster: cluster.trim(),
    address: address.trim(),
    school_head: school_head.trim(),
    contact_number: contact_number.trim(),
    email: email.trim(),
    status: status || 'Active',
    _errors,
  };
}

export default function SchoolImportModal({ open, onClose, schoolType, onImported }: SchoolImportModalProps) {
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
      const validated = raw.map(r => validateRow(r, schoolType));
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
    const payload = valid.map(({ _errors, ...rest }) => rest);
    const { error } = await supabase
      .from('schools')
      .upsert(payload, { onConflict: 'school_code' });

    if (error) {
      setErrorMsg(error.message);
      setStage('preview');
      return;
    }
    const errorCount = parsedRows.filter(r => r._errors.length > 0).length;
    setImportResult({ inserted: valid.length, updated: 0, errors: errorCount });
    setStage('done');
    onImported();
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
            <span className="w-9 h-9 rounded-lg bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400 flex items-center justify-center">
              <FileUp className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import School Profiles</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Type: {schoolType}</p>
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
                    ? 'border-deped-500 bg-deped-50 dark:bg-deped-900/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-deped-400 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                <Inbox className={`w-12 h-12 mx-auto mb-3 transition-colors ${dragOver ? 'text-deped-500' : 'text-slate-300 dark:text-slate-600'}`} />
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
                <button onClick={() => downloadTemplate(schoolType)} className="btn-secondary text-sm">
                  <Download className="w-4 h-4" /> Download Template
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p className="font-semibold text-slate-600 dark:text-slate-300">Required columns:</p>
                <p>school_code, school_name, cluster, address, school_head, contact_number, email, status</p>
                <p>Only <span className="font-medium">school_code</span> and <span className="font-medium">school_name</span> are required. Status must be "Active" or "Inactive" (defaults to Active).</p>
                <p>Existing schools with the same School Code will be updated.</p>
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
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Cluster</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800/40">
                          <td className="px-3 py-2 text-slate-400 tabular">{i + 1}</td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-700 dark:text-slate-300">{r.school_code || '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.school_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.cluster || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`badge text-[10px] ${r.status === 'Active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>{r.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            {r._errors.length > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 text-[11px]">{r._errors.join('; ')}</span>
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 100 && (
                  <p className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                    Showing first 100 of {parsedRows.length} rows
                  </p>
                )}
              </div>

              <div className="flex justify-between items-center">
                <button onClick={reset} className="btn-secondary text-sm">
                  <X className="w-4 h-4" /> Choose Different File
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={handleClose} className="btn-secondary text-sm">Cancel</button>
                  <button onClick={doImport} disabled={validCount === 0} className="btn-primary text-sm">
                    <Upload className="w-4 h-4" /> Import {validCount} School{validCount !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stage: Importing */}
          {stage === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <ScriviaLogo className="w-10 h-10 animate-pulse mb-4" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Importing school profiles...</p>
              <p className="text-xs text-slate-400 mt-1">This may take a moment</p>
            </div>
          )}

          {/* Stage: Done */}
          {stage === 'done' && importResult && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Import Complete</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {importResult.inserted} school profile{importResult.inserted !== 1 ? 's' : ''} processed successfully.
              </p>
              {importResult.errors > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {importResult.errors} row{importResult.errors !== 1 ? 's' : ''} were skipped due to validation errors.
                </p>
              )}
              <button onClick={handleClose} className="btn-primary mt-6 text-sm">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
