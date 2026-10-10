import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload, FileCheck2, AlertTriangle, CheckCircle2, XCircle, X, Database,
  RefreshCw, History, Undo2, ChevronDown, ChevronRight, FileWarning,
  Table2, Clock, User, ArrowRight, Info, ShieldCheck, Trash2, FileSpreadsheet,
  School, GraduationCap,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import LoadingIndicator from '@/components/LoadingIndicator';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { useOrg } from '@/lib/org';
import { supabase, fetchAll, formatError } from '@/lib/pb';
import {
  SYNC_ORDER, TABLE_LABELS, TABLE_DESCRIPTIONS, TABLE_TO_DB,
  previewDbf, importElementaryFiles, importHighSchoolFiles,
  rollbackSession, loadSyncSessions,
  deleteSyncSession, clearElementaryTableData, clearHighSchoolTableData,
  type FilePreview, type PerFileResult, type SyncSessionResult, type SyncSessionRecord, type SyncTableName,
} from '@/lib/syncEngine';
import { validateFileSignature, validateFileSize } from '@/lib/uploadSecurity';
import { CATEGORIES, type PayrollCategory } from '@/lib/categories';
import { usePagination, Pagination } from '@/components/Pagination';

type Phase = 'idle' | 'uploading' | 'previewing' | 'syncing' | 'done' | 'error';

interface ProgressState {
  current: number;
  total: number;
  tableName: SyncTableName;
  message: string;
}

export default function SmartImport() {
  const { user, profile, logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  // The division context of the current upload: when exactly one division is
  // selected, any DBF record that lacks REGCODE/DIVCODE is stamped with these
  // codes so it lands in this division's Employee Records. When viewing a
  // whole region / All Divisions, the file's own codes (if any) are kept.
  const syncScope = useMemo(() => {
    if (scopedCodes && scopedCodes.length === 1) return scopedCodes[0];
    return null;
  }, [scopedCodes]);
  const [category, setCategory] = useState<PayrollCategory>('elementary');
  const [periodName, setPeriodName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<SyncSessionResult | null>(null);
  const [history, setHistory] = useState<SyncSessionRecord[]>([]);
  const historyPag = usePagination(history, 10, history);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [rollbackInProgress, setRollbackInProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'session'; id: string; label: string } |
    { type: 'table'; tableName: SyncTableName; count: number } |
    null
  >(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const sessions = await loadSyncSessions(category);
      setHistory(sessions);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }, [category]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFiles = useCallback(async (files: FileList) => {
    setError(null);
    setResult(null);
    setPhase('uploading');

    const validPreviews: FilePreview[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
      if (ext !== 'dbf') {
        errors.push(`${file.name}: Only .DBF files are accepted.`);
        continue;
      }
      const sizeCheck = validateFileSize(file);
      if (!sizeCheck.valid) { errors.push(`${file.name}: ${sizeCheck.error}`); continue; }
      const sigCheck = await validateFileSignature(file);
      if (!sigCheck.valid) { errors.push(`${file.name}: ${sigCheck.error}`); continue; }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const preview = previewDbf(bytes, file.name, { limit: undefined });
      if (!preview.valid) { errors.push(`${file.name}: ${preview.error}`); continue; }

      const existing = validPreviews.find((p) => p.tableName === preview.tableName);
      if (existing) {
        errors.push(`${file.name}: Duplicate table ${preview.tableName} (already uploaded as ${existing.fileName}).`);
        continue;
      }
      validPreviews.push(preview);
    }

    if (errors.length > 0) setError(errors.join('\n'));
    setPreviews(validPreviews);
    setPhase(validPreviews.length > 0 ? 'previewing' : 'idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  }, [handleFiles]);

  const removePreview = useCallback((tableName: SyncTableName) => {
    setPreviews((prev) => {
      const next = prev.filter((p) => p.tableName !== tableName);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setPreviews([]);
    setResult(null);
    setError(null);
    setProgress(null);
    setPhase('idle');
  }, []);

  const startSync = useCallback(async () => {
    if (previews.length === 0) return;
    setPhase('syncing');
    setError(null);
    setResult(null);

    try {
      // Elementary and High School each save through their own import routine,
      // so this batch only ever writes the selected category's STACODE range.
      const importFiles = category === 'elementary' ? importElementaryFiles : importHighSchoolFiles;
      const syncResult = await importFiles(
        previews,
        user?.email ?? 'unknown',
        (current, total, tableName, message) => {
          setProgress({ current, total, tableName, message });
        },
        syncScope,
        periodName.trim() || null,
      );

      setResult(syncResult);
      setPhase('done');

      await logAudit('dbf_smart_sync', 'dbf_sync_sessions', syncResult.sessionId, {
        files: previews.map((p) => p.fileName),
        tables: previews.map((p) => p.tableName),
        inserted: syncResult.totalInserted,
        updated: syncResult.totalUpdated,
        skipped: syncResult.totalSkipped,
        errors: syncResult.totalErrors,
        durationMs: syncResult.durationMs,
      });

      setPreviews([]);
      setProgress(null);
      await loadHistory();
    } catch (err) {
      setPhase('error');
      setError(formatError(err));
      setProgress(null);
    }
  }, [previews, user, logAudit, loadHistory, periodName, category, syncScope]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setDeleteInProgress(true);
    try {
      const success = await deleteSyncSession(sessionId);
      if (success) {
        await logAudit('dbf_sync_session_delete', 'dbf_sync_sessions', sessionId, {});
        await loadHistory();
      } else {
        setError('Failed to delete import session. You may not have permission.');
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDeleteInProgress(false);
      setDeleteTarget(null);
    }
  }, [logAudit, loadHistory]);

  const handleDeleteTable = useCallback(async (tableName: SyncTableName) => {
    setDeleteInProgress(true);
    try {
      // Elementary and High School each clear through their own routine, so
      // this only ever removes the selected category's rows.
      const clearTable = category === 'elementary' ? clearElementaryTableData : clearHighSchoolTableData;
      const result = await clearTable(tableName);
      if (result.error) {
        setError(`Failed to clear ${tableName} (${category === 'elementary' ? 'Elementary' : 'High School'}) data: ${result.error}`);
      } else {
        await logAudit('dbf_table_delete', TABLE_TO_DB[tableName], tableName, {
          tableName,
          deletedCount: result.deleted,
          category,
        });
        setTableRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDeleteInProgress(false);
      setDeleteTarget(null);
    }
  }, [logAudit, category]);

  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const isSuperAdmin = isSuperAdminRole(profile?.role);

  const handleRollback = useCallback(async (sessionId: string) => {
    setRollbackInProgress(sessionId);
    try {
      const success = await rollbackSession(sessionId);
      if (success) {
        await logAudit('dbf_sync_rollback', 'dbf_sync_sessions', sessionId, {});
        await loadHistory();
      } else {
        setError('Rollback failed — this session may have already been rolled back or no records were found to remove.');
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setRollbackInProgress(null);
    }
  }, [logAudit, loadHistory]);

  const sortedPreviews = [...previews].sort((a, b) => SYNC_ORDER.indexOf(a.tableName) - SYNC_ORDER.indexOf(b.tableName));
  const previewPag = usePagination(sortedPreviews, 10, sortedPreviews);
  const isAdmin = isSuperAdminRole(profile?.role) || profile?.role === 'payroll_admin';
  const catLabel = CATEGORIES[category].label;
  const catIcon = category === 'elementary' ? School : GraduationCap;
  const CatIcon = catIcon;
  const accentColor = category === 'elementary' ? 'blue' : category === 'highschool' ? 'emerald' : 'slate';
  const accentBg = accentColor === 'blue' ? 'bg-blue-600' : accentColor === 'emerald' ? 'bg-emerald-600' : 'bg-slate-800';
  const accentHoverBg = accentColor === 'blue' ? 'hover:bg-blue-700' : accentColor === 'emerald' ? 'hover:bg-emerald-700' : 'hover:bg-slate-900';
  const accentRing = accentColor === 'blue' ? 'border-blue-500 bg-blue-50' : accentColor === 'emerald' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white';
  const accentText = accentColor === 'blue' ? 'text-blue-700' : accentColor === 'emerald' ? 'text-emerald-700' : 'text-slate-800';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentBg}`}>
          <CatIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Smart Import — {catLabel}</h1>
          <p className="text-sm text-slate-500">
            Upload FoxPro DBF files — records in the {catLabel} stacode range will be imported (STNTABLE imports all stations for both Elementary and High School)
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1">
          <button
            onClick={() => setCategory('elementary')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              category === 'elementary'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <School className="w-4 h-4" /> Elementary
          </button>
          <button
            onClick={() => setCategory('highschool')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              category === 'highschool'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <GraduationCap className="w-4 h-4" /> High School
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Only administrators can perform database synchronization. You can preview uploaded files but cannot execute a sync.</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 whitespace-pre-line">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Success banner */}
      {result && (
        <SyncResultReport result={result} category={category} onDismiss={() => { setResult(null); setPhase('idle'); }} />
      )}

      {/* Progress indicator */}
      {progress && phase === 'syncing' && (
        <div className={`${accentColor === 'blue' ? 'bg-blue-50 border-blue-200' : accentColor === 'emerald' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-3">
            <LoadingIndicator size={24} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${accentColor === 'blue' ? 'text-blue-800' : accentColor === 'emerald' ? 'text-emerald-800' : 'text-blue-800'}`}>{progress.message}</p>
              <p className={`text-xs ${accentColor === 'blue' ? 'text-blue-600' : accentColor === 'emerald' ? 'text-emerald-600' : 'text-blue-600'}`}>File {progress.current} of {progress.total} — {TABLE_LABELS[progress.tableName]}</p>
            </div>
          </div>
          <div className={`w-full h-2 ${accentColor === 'blue' ? 'bg-blue-100' : accentColor === 'emerald' ? 'bg-emerald-100' : 'bg-blue-100'} rounded-full overflow-hidden`}>
            <div
              className={`h-full ${accentColor === 'blue' ? 'bg-blue-500' : accentColor === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Drag-and-drop zone */}
      {phase !== 'syncing' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all ${
            dragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? 'bg-blue-500' : 'bg-slate-100'}`}>
            <Upload className={`w-7 h-7 ${dragOver ? 'text-white' : 'text-slate-400'}`} />
          </div>
          <p className="text-sm font-semibold text-slate-700">Drag and drop FoxPro DBF files here — {catLabel} only</p>
          <p className="text-xs text-slate-500 mt-1">
            Records in the {catLabel} stacode range will be imported — STNTABLE syncs every station to its own organization (Elementary or High School). Upload tables: DEDFILE, DIVTABLE, INCLUDED, EXCLUDED, MASTFILE, STNTABLE — EXCLUDED = undeducted obligations
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors shadow-sm ${accentBg} ${accentHoverBg}`}
          >
            <Upload className="w-4 h-4" /> Select Files
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".DBF,.dbf" onChange={handleFileInput} className="hidden" />
        </div>
      )}

      {/* File previews */}
      {sortedPreviews.length > 0 && phase !== 'syncing' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-800">Synchronization Preview ({sortedPreviews.length} file{sortedPreviews.length !== 1 ? 's' : ''})</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {previewPag.pagedItems.map((p, idx) => (
              <PreviewRow key={p.tableName} preview={p} order={idx + 1} onRemove={() => removePreview(p.tableName)} highlighted={p.tableName === 'MASTFILE'} />
            ))}
          </div>
          <Pagination page={previewPag.page} totalPages={previewPag.totalPages} total={previewPag.total} onPageChange={previewPag.setPage} label="files" />
          {/* Sync order info */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Sync order: {SYNC_ORDER.join(' → ')}</span>
              </div>
              {sortedPreviews.some((p) => p.tableName === 'MASTFILE') && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span><span className="font-medium text-slate-700">MASTFILE.DBF</span><ArrowRight className="w-3 h-3 inline-block" /><span className="font-medium text-slate-700">Employee Records</span></span>
                </div>
              )}
              {sortedPreviews.some((p) => p.tableName === 'STNTABLE') && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <School className="w-3.5 h-3.5 shrink-0" />
                  <span><span className="font-medium text-slate-700">STNTABLE.DBF</span><ArrowRight className="w-3 h-3 inline-block" /><span className="font-medium text-slate-700">Organization — Elementary &amp; High School</span></span>
                </div>
              )}
              {/* Period name input for files that need it (PAYROLLS, INCLUDED, EXCLUDED) */}
              {(sortedPreviews.some(p => ['INCLUDED', 'EXCLUDED'].includes(p.tableName))) && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Pay Period:</label>
                  <input
                    type="text"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    placeholder="e.g. August 2026, 08-2026, etc."
                    className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-400">Required for INCLUDED / EXCLUDED</span>
                </div>
              )}
              {/* Sync button */}
              {isAdmin && (
                <div className="flex justify-end">
                  <button
                    onClick={startSync}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors shadow-sm ${accentBg} ${accentHoverBg}`}
                  >
                    <Database className="w-4 h-4" /> Start {catLabel} Sync
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10-table status grid */}
      <TableStatusGrid
        canDelete={isSuperAdmin}
        category={category}
        accentColor={accentColor}
        onDeleteTable={(tableName, count) => setDeleteTarget({ type: 'table', tableName, count })}
        refreshKey={tableRefreshKey}
      />

      {/* Import history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-800">Import History</h2>
          </div>
          <button onClick={loadHistory} disabled={loadingHistory} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
            {loadingHistory ? <LoadingIndicator size={32} /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        </div>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <LoadingIndicator size={40} />
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No import sessions recorded yet.</div>
        ) : (
          <>
          <div className="divide-y divide-slate-50">
            {historyPag.pagedItems.map((h) => (
              <HistoryRow
                key={h.id}
                session={h}
                expanded={expandedHistory === h.id}
                onToggle={() => setExpandedHistory(expandedHistory === h.id ? null : h.id)}
                onRollback={() => handleRollback(h.id)}
                rollbackInProgress={rollbackInProgress === h.id}
                canRollback={isAdmin && !h.is_rolled_back && h.status === 'completed'}
                canDelete={isSuperAdmin}
                onDelete={() => setDeleteTarget({ type: 'session', id: h.id, label: h.session_label })}
              />
            ))}
          </div>
          <Pagination page={historyPag.page} totalPages={historyPag.totalPages} total={historyPag.total} onPageChange={historyPag.setPage} label="sessions" />
          </>
        )}
      </div>

      {/* Integrity info panel */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-slate-600" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Synchronization Guarantees</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-slate-500">
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Automatic file-to-table detection by filename</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>DBF signature validation rejects corrupted files</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Insert new, update existing, skip unchanged records</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Duplicate prevention via unique constraints</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Ordered sync: Station → Division → Masterfile → …</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Full audit trail with per-file breakdown</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Rollback last synchronization with one click</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Employee number (EMPNO) is the primary relationship key</span></div>
          <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Bulk batch processing for 100K+ record files</span></div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => !deleteInProgress && setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Confirm Deletion</h3>
                <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            {deleteTarget.type === 'session' ? (
              <p className="text-sm text-slate-600 mb-5">
                Delete the import session <span className="font-semibold text-slate-800">"{deleteTarget.label}"</span>? This removes the session record and its audit log from Import History. The imported data itself is not affected.
              </p>
            ) : (
              <p className="text-sm text-slate-600 mb-5">
                Permanently delete <span className="font-semibold text-rose-600">{deleteTarget.count.toLocaleString()}</span> records from the <span className="font-semibold text-slate-800">{deleteTarget.tableName}</span> table{category ? ` for ${category === 'elementary' ? 'Elementary' : 'High School'} Payroll (STACODE ${category === 'elementary' ? '1–499' : '500–701'})` : ''} — including the database records this import forwarded into the system. This is a hard delete and cannot be undone.
              </p>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteInProgress}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteTarget.type === 'session') handleDeleteSession(deleteTarget.id);
                  else handleDeleteTable(deleteTarget.tableName);
                }}
                disabled={deleteInProgress}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                {deleteInProgress ? <LoadingIndicator size={40} /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PreviewRow({ preview, order, onRemove, highlighted = false }: { preview: FilePreview; order: number; onRemove: () => void; highlighted?: boolean }) {
  const [showFields, setShowFields] = useState(false);
  return (
    <div className={highlighted ? 'px-5 py-4 bg-emerald-50/60 ring-1 ring-inset ring-emerald-200' : 'px-5 py-4'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${highlighted ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{order}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-800">{preview.tableName}</p>
              <span className="text-[10px] text-slate-400">— {TABLE_LABELS[preview.tableName]}</span>
              {highlighted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                  <User className="w-3 h-3" /> Employee Records
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {preview.fileName} · {preview.recordCount.toLocaleString()} records · {preview.fieldCount} fields · {(preview.fileSize / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFields(!showFields)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            {showFields ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Details
          </button>
          <button onClick={onRemove} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showFields && (
        <div className="mt-3 ml-10 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {preview.fields.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                {f.name}
                <span className="text-slate-400">{f.type}{f.length > 0 ? `(${f.length})` : ''}</span>
              </span>
            ))}
          </div>
          {preview.sampleRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {preview.fields.slice(0, 8).map((f) => (
                      <th key={f.name} className="text-left font-medium px-2 py-1.5 text-slate-500 whitespace-nowrap">{f.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.sampleRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {preview.fields.slice(0, 8).map((f) => (
                        <td key={f.name} className="px-2 py-1.5 text-slate-700 whitespace-nowrap max-w-[160px] truncate">
                          {row[f.name] != null ? String(row[f.name]) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sync Result Report ────────────────────────────────────────────────────────
function SyncResultReport({ result, category, onDismiss }: { result: SyncSessionResult; category: PayrollCategory | null; onDismiss: () => void }) {
  const hasErrors = result.totalErrors > 0;
  const catLabel = category === 'elementary' ? 'Elementary Payroll' : category === 'highschool' ? 'High School Payroll' : 'All Payroll Groups';
  const catColor = category === 'elementary' ? 'blue' : category === 'highschool' ? 'emerald' : 'slate';
  const successBg = catColor === 'blue' ? 'bg-blue-50 border-blue-200' : catColor === 'emerald' ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-50 border-emerald-200';
  const successIcon = catColor === 'blue' ? 'text-blue-600' : 'text-emerald-600';
  return (
    <div className={`rounded-xl border p-5 ${hasErrors ? 'bg-amber-50 border-amber-200' : successBg}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          {hasErrors ? <FileWarning className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className={`w-5 h-5 ${successIcon}`} />}
          <div>
            <h3 className="text-sm font-bold text-slate-800">Synchronization {hasErrors ? 'Completed with Errors' : 'Completed Successfully'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {catLabel} · {(result.durationMs / 1000).toFixed(2)}s total · Session ID: {result.sessionId.slice(0, 8)}
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <StatCard label="Inserted" value={result.totalInserted} color="emerald" icon={<ArrowRight className="w-3.5 h-3.5" />} />
        <StatCard label="Updated" value={result.totalUpdated} color="blue" icon={<RefreshCw className="w-3.5 h-3.5" />} />
        <StatCard label="Skipped" value={result.totalSkipped} color="slate" icon={<Info className="w-3.5 h-3.5" />} />
        <StatCard label="Duplicates" value={result.totalDuplicates} color="amber" icon={<FileWarning className="w-3.5 h-3.5" />} />
        <StatCard label="Errors" value={result.totalErrors} color="rose" icon={<XCircle className="w-3.5 h-3.5" />} />
        <StatCard label="Files" value={result.files.length} color="slate" icon={<FileSpreadsheet className="w-3.5 h-3.5" />} />
      </div>
      {/* Per-file breakdown */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-500">
              <th className="text-left font-medium px-3 py-2">Table</th>
              <th className="text-right font-medium px-3 py-2">Inserted</th>
              <th className="text-right font-medium px-3 py-2">Updated</th>
              <th className="text-right font-medium px-3 py-2">Skipped</th>
              <th className="text-right font-medium px-3 py-2">Errors</th>
              <th className="text-right font-medium px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {result.files.map((f) => (
              <tr key={f.tableName} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-700">{f.tableName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{f.inserted.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-blue-700">{f.updated.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{f.skipped.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.errors.length > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{f.errors.length}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{(f.durationMs / 1000).toFixed(2)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Error log */}
      {result.files.some((f) => f.errors.length > 0) && (
        <div className="mt-3 bg-white rounded-lg border border-rose-200 p-3">
          <p className="text-xs font-semibold text-rose-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Error Log</p>
          <ul className="space-y-1 text-xs text-rose-600">
            {result.files.flatMap((f) => f.errors.map((e, i) => <li key={`${f.tableName}-${i}`}>• [{f.tableName}] {e}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: 'emerald' | 'blue' | 'slate' | 'amber' | 'rose'; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700 bg-emerald-100',
    blue: 'text-blue-700 bg-blue-100',
    slate: 'text-slate-700 bg-slate-100',
    amber: 'text-amber-700 bg-amber-100',
    rose: 'text-rose-700 bg-rose-100',
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-5 h-5 rounded flex items-center justify-center ${colors[color]}`}>{icon}</span>
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${colors[color].split(' ')[0]}`}>{value.toLocaleString()}</p>
    </div>
  );
}

// ── Table Status Grid ─────────────────────────────────────────────────────────
interface CategoryCounts {
  total: number | null;
  elementary: number | null;
  highschool: number | null;
}

function TableStatusGrid({ canDelete, category, accentColor, onDeleteTable, refreshKey }: {
  canDelete: boolean;
  category: PayrollCategory | null;
  accentColor: string;
  onDeleteTable: (tableName: SyncTableName, count: number) => void;
  refreshKey: number;
}) {
  const [counts, setCounts] = useState<Record<string, CategoryCounts>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const result: Record<string, CategoryCounts> = {};
      // Query PocketBase collections directly instead of calling PostgreSQL RPC.
      // Keys must match TABLE_TO_DB values (e.g. 'dbf_stntable') because the
      // render loop looks up counts[dbTable] where dbTable = TABLE_TO_DB[table].
      const TABLE_MAP: Record<string, string> = {
        dbf_stntable: 'dbf_stntable',
        dbf_divtable: 'dbf_divtable',
        employees: 'employees',
        payroll_deductions: 'payroll_deductions',
        dbf_included: 'dbf_included',
        dbf_excluded: 'dbf_excluded',
      };
      for (const [dbTable, collection] of Object.entries(TABLE_MAP)) {
        try {
          const allRes = await fetchAll<{ id: string; stacode?: string }>(() =>
            supabase.from(collection).select(dbTable === 'dbf_divtable' ? 'id' : 'id,stacode'),
          );
          const rows = allRes;
          const total = rows.length;
          if (dbTable === 'dbf_divtable') {
            result[dbTable] = { total, elementary: total, highschool: total };
          } else {
            const elementary = rows.filter((r) => {
              const s = Number(r.stacode ?? 0);
              return s >= 1 && s <= 499;
            }).length;
            const highschool = rows.filter((r) => {
              const s = Number(r.stacode ?? 0);
              return s >= 500 && s <= 701;
            }).length;
            result[dbTable] = { total, elementary, highschool };
          }
        } catch {
          result[dbTable] = { total: null, elementary: null, highschool: null };
        }
      }
      if (active) { setCounts(result); setLoading(false); }
    })();
    return () => { active = false; };
  }, [refreshKey]);

  const accentBg = accentColor === 'blue' ? 'bg-blue-50' : accentColor === 'emerald' ? 'bg-emerald-50' : 'bg-emerald-50';
  const accentText = accentColor === 'blue' ? 'text-blue-600' : accentColor === 'emerald' ? 'text-emerald-600' : 'text-emerald-600';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Table2 className="w-5 h-5 text-slate-600" />
        <h2 className="font-semibold text-slate-800">Supported Tables Status (6 tables)</h2>
        {category && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${accentText} ${accentBg} px-2 py-0.5 rounded-full`}>
            {category === 'elementary' ? 'STACODE 1–499' : 'STACODE 500–701'}
          </span>
        )}
        {canDelete && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
            <Trash2 className="w-3 h-3" /> Delete available
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-slate-100">
        {SYNC_ORDER.filter((table) => !['PAYROLLS', 'PYENT', 'PYENT1', 'PYENT2'].includes(table)).map((table) => {
          const dbTable = TABLE_TO_DB[table];
          const row = counts[dbTable];
          const isShared = table === 'DIVTABLE';
          const count = category && !isShared
            ? (row ? (category === 'elementary' ? row.elementary : row.highschool) : null)
            : (row ? row.total : null);
          const hasData = count !== null && count > 0;
          return (
            <div key={table} className="bg-white p-4 flex flex-col gap-1.5 relative group">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${hasData ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                  {hasData ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Table2 className="w-4 h-4 text-slate-400" />}
                </div>
                <p className="text-sm font-bold text-slate-700">{table}</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">{TABLE_DESCRIPTIONS[table]}</p>
              <p className={`text-xs font-medium tabular-nums ${hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                {loading ? '...' : count === null ? 'Error' : `${count.toLocaleString()} records`}
              </p>
              {isShared && category && (
                <p className="text-[10px] text-slate-400 italic">Shared across both categories</p>
              )}
              {canDelete && hasData && !(isShared && category) && (
                <button
                  onClick={() => onDeleteTable(table, count ?? 0)}
                  className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── History Row ───────────────────────────────────────────────────────────────
function HistoryRow({
  session, expanded, onToggle, onRollback, rollbackInProgress, canRollback, canDelete, onDelete,
}: {
  session: SyncSessionRecord;
  expanded: boolean;
  onToggle: () => void;
  onRollback: () => void;
  rollbackInProgress: boolean;
  canRollback: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const statusColors: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
    running: 'bg-blue-50 text-blue-700 border-blue-200',
    rolled_back: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const perFile = session.per_file as Record<string, PerFileResult> | undefined;
  const fileEntries = perFile ? Object.entries(perFile) : [];

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-slate-700">{session.session_label}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[session.status] ?? statusColors.completed}`}>
                {session.is_rolled_back ? 'Rolled Back' : session.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(session.started_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{session.performed_by ?? 'Unknown'}</span>
              <span>{session.files_uploaded.length} file(s)</span>
              <span className="text-emerald-600">{session.total_inserted.toLocaleString()} inserted</span>
              {session.total_updated > 0 && <span className="text-blue-600">{session.total_updated.toLocaleString()} updated</span>}
              {session.total_errors > 0 && <span className="text-rose-600">{session.total_errors} errors</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canRollback && (
            <button
              onClick={(e) => { e.stopPropagation(); onRollback(); }}
              disabled={rollbackInProgress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
            >
              {rollbackInProgress ? <LoadingIndicator size={32} /> : <Undo2 className="w-3.5 h-3.5" />}
              Rollback
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 ml-6 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {session.files_uploaded.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">{f}</span>
            ))}
          </div>
          {fileEntries.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-slate-500">
                    <th className="text-left font-medium px-3 py-2">Table</th>
                    <th className="text-right font-medium px-3 py-2">Inserted</th>
                    <th className="text-right font-medium px-3 py-2">Updated</th>
                    <th className="text-right font-medium px-3 py-2">Skipped</th>
                    <th className="text-right font-medium px-3 py-2">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fileEntries.map(([table, info]) => (
                    <tr key={table} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700">{table}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{(info.inserted ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-700">{(info.updated ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{(info.skipped ?? 0).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${(info.errors?.length ?? 0) > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{info.errors?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {session.error_log && session.error_log.length > 0 && (
            <div className="bg-rose-50 rounded-lg border border-rose-200 p-3">
              <p className="text-xs font-semibold text-rose-700 mb-1.5">Errors</p>
              <ul className="space-y-0.5 text-xs text-rose-600">
                {session.error_log.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
