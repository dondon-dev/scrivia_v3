import { useState, useCallback, useRef } from 'react';
import GroupFilter, { type GroupFilterValue } from '@/components/GroupFilter';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, XCircle,
  Download, ArrowRight, RefreshCw, X, History,
  FileCheck2, Table2, Plus, Pencil, Landmark,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { validateUpload } from '@/lib/uploadSecurity';
import { downloadFile, generateCsv, currency } from '@/lib/reports';
import {
  parseGsisTxt, validateGsisRecords, classifyGsisRecords,
  type PliRecord, type MatchedRecord, type ValidationError,
} from '@/lib/gsisParser';
import {
  fetchExistingDeductions, fetchEmployeeMap, fetchDeductionCodes, processImport,
  type ImportProgress,
} from '@/lib/pliImport';
import { syncPayrollAfterImport } from '@/lib/payrollSync';
import { usePagination, Pagination } from '@/components/Pagination';

type Phase = 'upload' | 'validating' | 'preview' | 'importing' | 'complete' | 'history';

interface ImportLog {
  id: string;
  uploaded_by: string;
  filename: string;
  file_content: string | null;
  remark: string | null;
  total_records: number;
  matched_records: number;
  new_deductions: number;
  updated_deductions: number;
  failed_records: number;
  processing_time_ms: number;
  status: string;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; color: string; icon: typeof Plus }> = {
  ADD: { label: 'ADD', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Plus },
  UPDATE: { label: 'UPDATE', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Pencil },
  ERROR: { label: 'ERROR', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle },
};

export default function GsisImport() {
  const { profile, logAudit } = useAuth();
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [phase, setPhase] = useState<Phase>('upload');
  const [gsisFile, setGsisFile] = useState<File | null>(null);
  const [gsisFileText, setGsisFileText] = useState<string>('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [matched, setMatched] = useState<MatchedRecord[]>([]);
  const [allRecords, setAllRecords] = useState<PliRecord[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<{
    added: number; updated: number; terminated: number; failed: number; errors: string[]; elapsed: number;
  } | null>(null);
  const [payrollSyncMessage, setPayrollSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const startTimeRef = useRef<number>(0);

  const handleFileSelect = useCallback(async (file: File, setter: (f: File | null) => void) => {
    setError(null);
    const validation = await validateUpload(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file.');
      return;
    }
    setter(file);
  }, []);

  const handleValidate = useCallback(async () => {
    if (!gsisFile) {
      setError('Please upload a GSIS deduction file.');
      return;
    }
    setPhase('validating');
    setError(null);
    setParseErrors([]);
    setValidationErrors([]);
    setMatched([]);
    setAllRecords([]);

    try {
      const text = await gsisFile.text();
      setGsisFileText(text);
      const result = parseGsisTxt(text);
      const records = result.records;

      if (result.errors.length > 0) {
        setParseErrors(result.errors);
      }

      setAllRecords(records);

      if (records.length === 0) {
        setError('No valid records found in the uploaded file.');
        setPhase('upload');
        return;
      }

      // Fetch validation context
      const stacodes = records.map((r) => r.stacode);
      const empnos = records.map((r) => r.empno);
      const dedcodes = records.map((r) => r.dedcode);

      const [employeeMap, deductionCodes] = await Promise.all([
        fetchEmployeeMap(stacodes, empnos),
        fetchDeductionCodes(),
      ]);

      // Validate
      const vErrors = validateGsisRecords(records, {
        employees: employeeMap,
        deductionCodes,
      });
      setValidationErrors(vErrors);

      // Fetch existing deductions for matching
      const existing = await fetchExistingDeductions(stacodes, empnos, dedcodes);

      // Classify records — ADD or UPDATE only
      const matchedRecords = classifyGsisRecords(records, existing, vErrors);
      setMatched(matchedRecords);

      setPhase('preview');
    } catch (e) {
      setError(`Validation failed: ${(e as Error).message}`);
      setPhase('upload');
    }
  }, [gsisFile]);

  const handleProcessImport = useCallback(async () => {
    if (matched.length === 0) return;
    setPhase('importing');
    setProgress({ phase: 'processing', current: 0, total: matched.length, message: 'Starting…' });
    startTimeRef.current = performance.now();
    setError(null);

    try {
      const stacodes = matched.map((m) => m.record.stacode);
      const empnos = matched.map((m) => m.record.empno);
      const employeeMap = await fetchEmployeeMap(stacodes, empnos);

      const result = await processImport(
        matched,
        employeeMap,
        profile?.email ?? '',
        (p) => setProgress(p),
        'GSIS',
      );
      const elapsed = Math.round(performance.now() - startTimeRef.current);

      setImportResult({ ...result, elapsed });

      // Audit trail
      await logAudit('gsis_import', 'payroll_deductions', undefined, {
        filename: gsisFile?.name,
        records_added: result.added,
        records_updated: result.updated,
        records_failed: result.failed,
        processing_time_ms: elapsed,
      });

      const importStatus = result.failed === 0 ? 'Completed' : result.added + result.updated > 0 ? 'Partial' : 'Failed';
      const remark = importStatus === 'Completed'
        ? `Successfully imported ${result.added + result.updated} records (${result.added} new, ${result.updated} updated).`
        : importStatus === 'Partial'
          ? `Partially imported: ${result.added + result.updated} succeeded, ${result.failed} failed.`
          : `Import failed: ${result.failed} records could not be processed.`;

      // Save import log
      await supabase.from('gsis_import_logs').insert({
        uploaded_by: profile?.email ?? '',
        filename: gsisFile?.name ?? '',
        file_content: gsisFileText || null,
        remark,
        total_records: matched.length,
        matched_records: matched.filter((m) => m.action === 'UPDATE').length,
        new_deductions: result.added,
        updated_deductions: result.updated,
        failed_records: result.failed,
        processing_time_ms: elapsed,
        status: importStatus,
      });

      // --- Auto-sync payroll: reflect new deductions in Elementary & High School payroll ---
      const importedEmpIds = [...new Set(
        matched
          .filter((m) => m.action === 'ADD' || m.action === 'UPDATE')
          .map((m) => {
            const empKey = `${m.record.stacode}|${m.record.empno}`;
            return employeeMap.get(empKey)?.id;
          })
          .filter(Boolean) as string[],
      )];
      let syncMessage: string | null = null;
      if (importedEmpIds.length > 0) {
        setProgress({ phase: 'processing', current: result.added + result.updated, total: matched.length, message: 'Syncing payroll entries with new deductions…' });
        try {
          const syncResults = await syncPayrollAfterImport(importedEmpIds, (msg) =>
            setProgress({ phase: 'processing', current: result.added + result.updated, total: matched.length, message: msg }),
          );
          if (syncResults.length > 0) {
            const totalEntries = syncResults.reduce((s, r) => s + r.entriesUpdated, 0);
            const totalElem = syncResults.reduce((s, r) => s + r.elementaryCount, 0);
            const totalHS = syncResults.reduce((s, r) => s + r.highSchoolCount, 0);
            syncMessage = `Payroll synced: ${totalEntries} entries updated across ${syncResults.length} period(s) — ${totalElem} Elementary, ${totalHS} High School.`;
          } else {
            syncMessage = 'No open pay periods to sync — deductions will apply on next Run Payroll.';
          }
        } catch (syncErr) {
          syncMessage = `Payroll sync skipped: ${(syncErr as Error).message}`;
        }
      }

      setPayrollSyncMessage(syncMessage);
      setPhase('complete');
    } catch (e) {
      const errMsg = (e as Error).message;

      await supabase.from('gsis_import_logs').insert({
        uploaded_by: profile?.email ?? '',
        filename: gsisFile?.name ?? '',
        file_content: gsisFileText || null,
        remark: `Import failed: ${errMsg}`,
        total_records: matched.length,
        matched_records: 0,
        new_deductions: 0,
        updated_deductions: 0,
        failed_records: matched.length,
        processing_time_ms: 0,
        status: 'Failed',
      });

      setError(`Import failed: ${errMsg}`);
      setPhase('preview');
    }
  }, [matched, profile, logAudit, gsisFile]);

  const handleLoadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('gsis_import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setImportLogs((data as ImportLog[]) ?? []);
    setShowHistory(true);
  }, []);

  const handleReset = useCallback(() => {
    setPhase('upload');
    setGsisFile(null);
    setGsisFileText('');
    setParseErrors([]);
    setValidationErrors([]);
    setMatched([]);
    setAllRecords([]);
    setImportResult(null);
    setPayrollSyncMessage(null);
    setProgress(null);
    setError(null);
  }, []);

  const handleExportPreview = useCallback(() => {
    const headers = ['Action', 'STACODE', 'EMPNO', 'DEDCODE', 'POLICYNO', 'Amount', 'Effective Date', 'Termination Date', 'Status'];
    const rows = matched.map((m) => {
      const r = m.record;
      const effDate = r.effMm && r.effYy ? `${String(r.effMm).padStart(2, '0')}/${String(r.effYy).padStart(2, '0')}` : '';
      const terDate = r.terMm && r.terYy ? `${String(r.terMm).padStart(2, '0')}/${String(r.terYy).padStart(2, '0')}` : '';
      return [
        m.action, r.stacode, r.empno, r.dedcode, r.policyno,
        r.dedAmt.toFixed(2), effDate, terDate, r.status,
      ];
    });
    const csv = generateCsv(headers, rows);
    downloadFile({ filename: `gsis_preview_${Date.now()}.csv`, content: csv, mimeType: 'text/csv' });
  }, [matched]);

  const handleExportTemplate = useCallback(() => {
    // Export in the payroll deduction Excel template structure
    const headers = ['STACODE', 'EMPNO', 'DEDCODE', 'POLICYNO', 'Deduction Amount', 'Effective Date', 'Termination Date', 'Status'];
    const validRecords = matched.filter((m) => m.action === 'ADD' || m.action === 'UPDATE');
    const rows = validRecords.map((m) => {
      const r = m.record;
      const effDate = r.effMm && r.effYy ? `${String(r.effMm).padStart(2, '0')}/${String(r.effYy).padStart(2, '0')}` : '';
      const terDate = r.terMm && r.terYy ? `${String(r.terMm).padStart(2, '0')}/${String(r.terYy).padStart(2, '0')}` : '';
      return [
        r.stacode, r.empno, r.dedcode, r.policyno,
        r.dedAmt.toFixed(2), effDate, terDate, r.status,
      ];
    });
    const csv = generateCsv(headers, rows);
    downloadFile({ filename: `gsis_deduction_template_${Date.now()}.csv`, content: csv, mimeType: 'text/csv' });
  }, [matched]);

  const handleExportErrors = useCallback(() => {
    const headers = ['STACODE', 'EMPNO', 'DEDCODE', 'POLICYNO', 'Error', 'Line'];
    const rows = validationErrors.map((e) => [
      e.stacode, e.empno, e.dedcode, e.policyno, e.error, e.lineNumber,
    ]);
    const csv = generateCsv(headers, rows);
    downloadFile({ filename: `gsis_exception_report_${Date.now()}.csv`, content: csv, mimeType: 'text/csv' });
  }, [validationErrors]);

  const stats = {
    total: matched.length,
    add: matched.filter((m) => m.action === 'ADD').length,
    update: matched.filter((m) => m.action === 'UPDATE').length,
    error: matched.filter((m) => m.action === 'ERROR').length,
    matched: matched.filter((m) => m.action === 'UPDATE').length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600" />
            GSIS Deduction Upload
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload a GSIS deduction file to add and update employee deduction records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GroupFilter value={groupFilter} onChange={setGroupFilter} />
          <button
            onClick={handleLoadHistory}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <History className="w-4 h-4" />
            Import History
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 text-xs font-medium">
        {[
          { key: 'upload', label: '1. Upload File' },
          { key: 'preview', label: '2. Preview & Validate' },
          { key: 'complete', label: '3. Summary' },
        ].map((step, i) => {
          const active =
            (step.key === 'upload' && (phase === 'upload' || phase === 'validating')) ||
            (step.key === 'preview' && (phase === 'preview' || phase === 'importing')) ||
            (step.key === 'complete' && phase === 'complete');
          const done =
            (step.key === 'upload' && phase !== 'upload' && phase !== 'validating') ||
            (step.key === 'preview' && phase === 'complete');
          return (
            <div key={step.key} className="flex items-center">
              <span className={`px-3 py-1.5 rounded-full ${active ? 'bg-blue-600 text-white' : done ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                {done && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                {step.label}
              </span>
              {i < 2 && <ArrowRight className="w-3 h-3 text-slate-300 mx-1" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Phase: Upload */}
      {(phase === 'upload' || phase === 'validating') && (
        <div className="space-y-6">
          <FileDropZone
            file={gsisFile}
            onFile={(f) => handleFileSelect(f, setGsisFile)}
            onClear={() => setGsisFile(null)}
          />

          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <FileCheck2 className="w-5 h-5 text-slate-400 shrink-0" />
            <p className="text-sm text-slate-600">
              {gsisFile
                ? 'File uploaded. Click Validate to parse and check records.'
                : 'Upload a GSIS deduction TXT file to begin.'}
            </p>
          </div>

          {parseErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm font-medium text-amber-800 mb-2">Parse warnings ({parseErrors.length})</p>
              <ul className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                {parseErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                {parseErrors.length > 20 && <li>…and {parseErrors.length - 20} more</li>}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={!gsisFile || phase === 'validating'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {phase === 'validating' ? <LoadingIndicator size={40} /> : <FileCheck2 className="w-4 h-4" />}
              Validate File
            </button>
          </div>
        </div>
      )}

      {/* Phase: Preview */}
      {(phase === 'preview' || phase === 'importing') && (
        <PreviewScreen
          matched={matched}
          validationErrors={validationErrors}
          stats={stats}
          onExportPreview={handleExportPreview}
          onExportTemplate={handleExportTemplate}
          onExportErrors={handleExportErrors}
          onProcess={handleProcessImport}
          onCancel={handleReset}
          importing={phase === 'importing'}
          progress={progress}
        />
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && importResult && (
        <CompleteScreen
          result={importResult}
          stats={stats}
          payrollSyncMessage={payrollSyncMessage}
          onReset={handleReset}
          onExportErrors={handleExportErrors}
        />
      )}

      {/* History Modal */}
      {showHistory && (
        <HistoryModal logs={importLogs} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// --- FileDropZone ---------------------------------------------------------

function FileDropZone({
  file, onFile, onClear,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
      className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        file ? 'border-blue-300 bg-blue-50' : dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      {file ? (
        <div className="space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-blue-500 flex items-center justify-center">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
          <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs text-blue-600 hover:underline"
            >
              Replace
            </button>
            <button
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-rose-600"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="w-full space-y-3">
          <div className="w-14 h-14 mx-auto rounded-xl bg-slate-100 flex items-center justify-center">
            <Upload className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">GSIS Deduction File</p>
            <p className="text-xs text-slate-500 mt-1">TXT file (.txt) — Required</p>
          </div>
          <p className="text-xs text-slate-400">Click or drag file here</p>
        </button>
      )}
    </div>
  );
}

// --- Preview Screen -------------------------------------------------------

function PreviewScreen({
  matched, validationErrors, stats, onExportPreview, onExportTemplate, onExportErrors, onProcess, onCancel, importing, progress,
}: {
  matched: MatchedRecord[];
  validationErrors: ValidationError[];
  stats: { total: number; add: number; update: number; error: number; matched: number };
  onExportPreview: () => void;
  onExportTemplate: () => void;
  onExportErrors: () => void;
  onProcess: () => void;
  onCancel: () => void;
  importing: boolean;
  progress: ImportProgress | null;
}) {
  const [filter, setFilter] = useState<string>('ALL');

  const filtered = filter === 'ALL' ? matched : matched.filter((m) => m.action === filter);
  const pag = usePagination(filtered, 50, filter);

  const summaryCards = [
    { label: 'Total Uploaded', value: stats.total, color: 'bg-slate-700', icon: Table2 },
    { label: 'Matched (Update)', value: stats.matched, color: 'bg-blue-500', icon: Pencil },
    { label: 'New (Add)', value: stats.add, color: 'bg-emerald-500', icon: Plus },
    { label: 'Errors', value: stats.error + validationErrors.length, color: 'bg-rose-500', icon: XCircle },
  ];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{c.label}</span>
              <c.icon className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Validation errors banner */}
      {validationErrors.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800">
              {validationErrors.length} record(s) failed validation
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              These records will be excluded from import. Export the exception report for details.
            </p>
          </div>
          <button
            onClick={onExportErrors}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exception Report
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {['ALL', 'ADD', 'UPDATE', 'ERROR'].map((f) => {
          const count = f === 'ALL' ? matched.length : matched.filter((m) => m.action === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* Preview table */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">STACODE</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">EMPNO</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">DEDCODE</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">POLICYNO</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Eff. Date</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pag.pagedItems.map((m, i) => {
                const meta = ACTION_META[m.action];
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
                        <meta.icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{m.record.stacode}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{m.record.empno}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{m.record.dedcode}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{m.record.policyno}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{m.record.status || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums">
                      {m.record.effMm && m.record.effYy ? `${String(m.record.effMm).padStart(2, '0')}/${String(m.record.effYy).padStart(2, '0')}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {m.record.dedAmt > 0 ? currency(m.record.dedAmt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} pageSize={pag.pageSize} onPageChange={pag.setPage} label="records" />
      </div>

      {/* Import progress */}
      {importing && progress && (
        <div className="p-5 rounded-xl bg-slate-900 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <LoadingIndicator size={40} />
              {progress.message}
            </span>
            <span className="text-sm tabular-nums text-slate-300">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onProcess}
          disabled={importing || stats.add + stats.update === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? <LoadingIndicator size={40} /> : <CheckCircle2 className="w-4 h-4" />}
          Process Import
        </button>
        <button
          onClick={onExportPreview}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Preview
        </button>
        <button
          onClick={onExportTemplate}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <Table2 className="w-4 h-4" />
          Export Deduction Template
        </button>
        <button
          onClick={onCancel}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Complete Screen ------------------------------------------------------

function CompleteScreen({
  result, stats, payrollSyncMessage, onReset, onExportErrors,
}: {
  result: { added: number; updated: number; terminated: number; failed: number; errors: string[]; elapsed: number };
  stats: { total: number; add: number; update: number; error: number; matched: number };
  payrollSyncMessage: string | null;
  onReset: () => void;
  onExportErrors: () => void;
}) {
  const successCount = result.added + result.updated;
  const allGood = result.failed === 0;

  const cards = [
    { label: 'Total Uploaded', value: stats.total, color: 'text-slate-700', icon: Table2, bg: 'bg-slate-50' },
    { label: 'New Deductions', value: result.added, color: 'text-emerald-600', icon: Plus, bg: 'bg-emerald-50' },
    { label: 'Updated Deductions', value: result.updated, color: 'text-blue-600', icon: Pencil, bg: 'bg-blue-50' },
    { label: 'Failed Records', value: result.failed, color: 'text-rose-600', icon: XCircle, bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div className={`rounded-xl p-6 text-center ${allGood ? 'bg-blue-50 border border-blue-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${allGood ? 'bg-blue-500' : 'bg-amber-500'}`}>
          {allGood ? <CheckCircle2 className="w-8 h-8 text-white" /> : <AlertTriangle className="w-8 h-8 text-white" />}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mt-3">
          {allGood ? 'Import Completed Successfully' : 'Import Completed with Warnings'}
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          {successCount} of {stats.total} records processed in {(result.elapsed / 1000).toFixed(1)}s
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-white border border-slate-200 p-5">
            <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-3xl font-bold text-slate-800 tabular-nums">{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {payrollSyncMessage && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">{payrollSyncMessage}</p>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-rose-800">Processing errors ({result.errors.length})</p>
            <button
              onClick={onExportErrors}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
          <ul className="text-xs text-rose-700 space-y-1 max-h-40 overflow-y-auto">
            {result.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
            {result.errors.length > 30 && <li>…and {result.errors.length - 30} more</li>}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          New Upload
        </button>
      </div>
    </div>
  );
}

// --- History Modal --------------------------------------------------------

function HistoryModal({ logs, onClose }: { logs: ImportLog[]; onClose: () => void }) {
  const pag = usePagination(logs, 10, logs);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            GSIS Import History
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">No GSIS import history yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Uploaded By</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">File</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Total</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">New</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Updated</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Failed</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pag.pagedItems.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(log.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{log.uploaded_by}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[140px]">{log.filename}</span>
                        {log.file_content && (
                          <button
                            onClick={() => downloadFile({
                              filename: log.filename || `gsis_file_${log.id}.txt`,
                              content: new TextEncoder().encode(log.file_content ?? ''),
                              mimeType: 'text/plain',
                            })}
                            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-medium hover:bg-blue-100 transition-colors"
                            title="Download TXT file"
                          >
                            <Download className="w-3 h-3" />
                            TXT
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-600 font-medium">{log.total_records}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-emerald-600 font-medium">{log.new_deductions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-blue-600 font-medium">{log.updated_deductions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-rose-600 font-medium">{log.failed_records}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'Completed' ? 'bg-emerald-100 text-emerald-700'
                        : log.status === 'Partial' ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px]">
                      {log.remark ? (
                        <span className={log.status === 'Failed' ? 'text-rose-600' : log.status === 'Partial' ? 'text-amber-600' : 'text-emerald-600'}>
                          {log.remark}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} label="logs" />
      </div>
    </div>
  );
}
