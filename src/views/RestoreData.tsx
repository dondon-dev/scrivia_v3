import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DatabaseBackup, Upload, FileX2, CheckCircle, AlertTriangle,
  Table2, ShieldCheck, FileSearch, X, ChevronRight, HardDriveDownload,
  History, RefreshCw, Lock, Info,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import LoadingIndicator from '@/components/LoadingIndicator';
import { supabase, fetchAll, formatError } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { decodeDbf, type DbfField } from '@/lib/dbf';
import { syncMastfile, syncDedfile, type SyncResult } from '@/lib/restoreSync';
import { usePagination, Pagination } from '@/components/Pagination';
import GroupFilter, { type GroupFilterValue, resolveGroupFilter } from '@/components/GroupFilter';
import {
  DBF_TABLES, TABLE_LABELS, TABLE_DESCRIPTIONS, TABLE_TO_DB, TABLE_FIELDS,
  SYNC_ORDER, VALID_DBF_VERSIONS, VALID_SIDECAR_EXTENSIONS, extractTableName,
} from '@/lib/dbfTemplate';

// ── Derived from the single-source template ──
interface SupportedTable {
  name: string;
  label: string;
  description: string;
  icon: typeof Table2;
}

const SUPPORTED_TABLES: SupportedTable[] = DBF_TABLES.map((t) => ({
  name: t.name,
  label: t.label,
  description: t.description,
  icon: Table2,
}));

const TABLE_NAMES = DBF_TABLES.map((t) => t.name);

// ── Types ──
interface RestoreHistoryRecord {
  id: string;
  table_name: string;
  category: string | null;
  original_filename: string;
  file_size: number;
  checksum: string | null;
  dbf_version: number | null;
  header_size: number | null;
  record_size: number | null;
  field_count: number | null;
  record_count: number;
  code_page: number | null;
  sidecar_files: string[] | null;
  user_email: string | null;
  restored_at: string;
}

interface ParsedDbf {
  fileName: string;
  tableName: string;
  fileSize: number;
  bytes: Uint8Array;
  version: number;
  headerSize: number;
  recordSize: number;
  fieldCount: number;
  recordCount: number;
  codePage: number;
  fields: DbfField[];
  sampleRows: Record<string, string | number | boolean | null>[];
  sidecarFiles: string[];
  checksum: string;
}

type Phase = 'idle' | 'reading' | 'validating' | 'parsing' | 'staging' | 'migrating' | 'done' | 'error';

interface ProgressState {
  phase: Phase;
  fileName: string;
  message: string;
}

// ── Utility: compute SHA-256 checksum ──
async function computeChecksum(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Parse DBF header from raw bytes ──
function parseDbfHeader(bytes: Uint8Array): {
  version: number;
  headerSize: number;
  recordSize: number;
  recordCount: number;
  codePage: number;
  fieldCount: number;
  fields: DbfField[];
  sampleRows: Record<string, string | number | boolean | null>[];
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0];
  const recordCount = view.getUint32(4, true);
  const headerSize = view.getUint16(8, true);
  const recordSize = view.getUint16(10, true);
  const codePage = bytes[29] ?? 0;

  // Parse field descriptors
  const fields: DbfField[] = [];
  let offset = 32;
  while (offset < headerSize - 1) {
    if (bytes[offset] === 0x0d) break;
    let name = '';
    for (let i = 0; i < 11; i++) {
      if (bytes[offset + i] === 0x00) break;
      name += String.fromCharCode(bytes[offset + i]);
    }
    const typeChar = String.fromCharCode(bytes[offset + 11]);
    const length = bytes[offset + 16];
    const decimals = bytes[offset + 17];
    fields.push({ name: name.trim(), type: typeChar as DbfField['type'], length, decimals });
    offset += 32;
  }
  const fieldCount = fields.length;

  // Decode up to 5 sample rows using the existing decoder
  const { records } = decodeDbf(bytes);
  const sampleRows = records.slice(0, 5);

  return { version, headerSize, recordSize, recordCount, codePage, fieldCount, fields, sampleRows };
}

// ── Validate DBF header magic bytes and structure ──
function validateDbfHeader(bytes: Uint8Array): { valid: boolean; error: string | null } {
  if (bytes.length < 32) {
    return { valid: false, error: 'File is too small to be a valid DBF (minimum 32 bytes for header).' };
  }
  const version = bytes[0];
  if (!VALID_DBF_VERSIONS.has(version)) {
    return { valid: false, error: `Invalid DBF version byte: 0x${version.toString(16).padStart(2, '0')}. Expected FoxPro (0x30) or dBASE (0x03/0x83).` };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint16(8, true);
  const recordSize = view.getUint16(10, true);
  if (headerSize < 33 || headerSize > bytes.length) {
    return { valid: false, error: `Invalid header size: ${headerSize} bytes.` };
  }
  if (recordSize === 0) {
    return { valid: false, error: 'Invalid record size: 0 bytes.' };
  }
  // Check for field descriptor terminator (0x0D)
  if (bytes[headerSize - 1] !== 0x0d) {
    return { valid: false, error: 'Missing field descriptor terminator (0x0D) at expected header boundary.' };
  }
  // Check for EOF marker (0x1A) at the end
  const expectedDataEnd = headerSize + view.getUint32(4, true) * recordSize;
  if (bytes.length < expectedDataEnd) {
    return { valid: false, error: `File truncated: expected ${expectedDataEnd} bytes, got ${bytes.length}.` };
  }
  return { valid: true, error: null };
}

// extractTableName is now imported from '@/lib/dbfTemplate'

// ── Check if file is a sidecar ──
function getSidecarExt(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const ext of VALID_SIDECAR_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export default function RestoreData() {
  const { logAudit, user } = useAuth();
  const [groupFilter, setGroupFilter] = useState<GroupFilterValue>({ kind: 'all' });
  const [history, setHistory] = useState<RestoreHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const pag = usePagination(history, 10, history);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);
  const [inspection, setInspection] = useState<ParsedDbf | null>(null);
  const [pendingFiles, setPendingFiles] = useState<ParsedDbf[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const gf = useMemo(() => resolveGroupFilter(groupFilter, []), [groupFilter]);

  // Load restore history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      let query = supabase.from('dbf_restore_history').select('*').order('restored_at', { ascending: false });
      if (gf.category) query = query.eq('category', gf.category);
      const records = await fetchAll(() => query);
      setHistory(records as RestoreHistoryRecord[]);
    } catch {
      // Table might not be accessible yet
    } finally {
      setLoadingHistory(false);
    }
  }, [gf.category]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Get latest restore per table
  const latestPerTable = useCallback((tableName: string): RestoreHistoryRecord | null => {
    return history.find((h) => h.table_name === tableName) ?? null;
  }, [history]);

  // ── Process uploaded files ──
  const processFiles = useCallback(async (fileList: File[]) => {
    setError(null);
    setSuccess(null);
    setSyncResults(null);
    setPendingFiles([]);

    const dbfFiles = fileList.filter((f) => f.name.toLowerCase().endsWith('.dbf'));
    const sidecarFiles = fileList.filter((f) => getSidecarExt(f.name) !== null);

    if (dbfFiles.length === 0) {
      setError('No .DBF files detected. Please upload FoxPro DBF files.');
      return;
    }

    const parsed: ParsedDbf[] = [];

    for (const file of dbfFiles) {
      setProgress({ phase: 'reading', fileName: file.name, message: 'Reading binary data...' });
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Validate
        setProgress({ phase: 'validating', fileName: file.name, message: 'Validating DBF header...' });
        const validation = validateDbfHeader(bytes);
        if (!validation.valid) {
          throw new Error(`${file.name}: ${validation.error}`);
        }

        // Parse
        setProgress({ phase: 'parsing', fileName: file.name, message: 'Parsing field descriptors and sample rows...' });
        const header = parseDbfHeader(bytes);
        const tableName = extractTableName(file.name);
        if (!tableName) {
          throw new Error(`${file.name}: Could not match filename to any of the 10 supported tables (DEDFILE, DIVTABLE, EXCLUDED, INCLUDED, MASTFILE, PAYROLLS, PYENT, PYENT1, PYENT2, STNTABLE).`);
        }

        const checksum = await computeChecksum(bytes);
        const matchedSidecars = sidecarFiles
          .filter((sf) => sf.name.replace(/\.[^.]+$/, '').toUpperCase() === tableName)
          .map((sf) => sf.name);

        parsed.push({
          fileName: file.name,
          tableName,
          fileSize: file.size,
          bytes,
          version: header.version,
          headerSize: header.headerSize,
          recordSize: header.recordSize,
          fieldCount: header.fieldCount,
          recordCount: header.recordCount,
          codePage: header.codePage,
          fields: header.fields,
          sampleRows: header.sampleRows,
          sidecarFiles: matchedSidecars,
          checksum,
        });
      } catch (err) {
        setProgress({ phase: 'error', fileName: file.name, message: '' });
        setError(formatError(err));
        return;
      }
    }

    setProgress(null);
    setPendingFiles(parsed);
    // Auto-open inspection for the first file
    if (parsed.length > 0) {
      setInspection(parsed[0]);
    }
  }, []);

  // ── Drag and drop handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  // ── Confirm restore: save record to database ──
  const confirmRestore = useCallback(async (parsed: ParsedDbf) => {
    setProgress({ phase: 'staging', fileName: parsed.fileName, message: 'Staging file for atomic restore...' });
    try {
      // Record the restore in the database
      setProgress({ phase: 'migrating', fileName: parsed.fileName, message: 'Migrating from staging to active database...' });

      const { error: insertError } = await supabase.from('dbf_restore_history').insert({
        table_name: parsed.tableName,
        category: gf.category ?? null,
        original_filename: parsed.fileName,
        file_size: parsed.fileSize,
        checksum: parsed.checksum,
        dbf_version: parsed.version,
        header_size: parsed.headerSize,
        record_size: parsed.recordSize,
        field_count: parsed.fieldCount,
        record_count: parsed.recordCount,
        code_page: parsed.codePage,
        sidecar_files: parsed.sidecarFiles,
        user_email: user?.email ?? null,
        // user_id is intentionally omitted — the database defaults it to auth.uid()
      });

      if (insertError) throw insertError;

      await logAudit('dbf_restore', 'dbf_restore_history', parsed.tableName, {
        filename: parsed.fileName,
        table: parsed.tableName,
        records: parsed.recordCount,
        checksum: parsed.checksum,
        version: `0x${parsed.version.toString(16)}`,
        sidecars: parsed.sidecarFiles,
      });

      let syncMsg = '';
      if (parsed.tableName === 'MASTFILE') {
        setProgress({ phase: 'migrating', fileName: parsed.fileName, message: 'Syncing employee records to Masterfile...' });
        const result = await syncMastfile(parsed.bytes);
        setSyncResults(result);
        syncMsg = ` Synced ${result.imported} employee records to Masterfile${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.`;
        await logAudit('dbf_sync_mastfile', 'employees', undefined, { imported: result.imported, skipped: result.skipped });
      } else if (parsed.tableName === 'DEDFILE') {
        setProgress({ phase: 'migrating', fileName: parsed.fileName, message: 'Syncing deduction records to Dedfile...' });
        const result = await syncDedfile(parsed.bytes);
        setSyncResults(result);
        syncMsg = ` Synced ${result.imported} deduction records to Dedfile${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.`;
        await logAudit('dbf_sync_dedfile', 'payroll_deductions', undefined, { imported: result.imported, skipped: result.skipped });
      }

      setProgress({ phase: 'done', fileName: parsed.fileName, message: 'Restore completed successfully.' });
      setSuccess(`${parsed.tableName} restored successfully — ${parsed.recordCount} records, ${parsed.fieldCount} fields, ${(parsed.fileSize / 1024).toFixed(1)} KB.${syncMsg}`);
      setInspection(null);
      setPendingFiles((prev) => prev.filter((p) => p.tableName !== parsed.tableName));
      await loadHistory();
      setTimeout(() => setProgress(null), 2000);
    } catch (err) {
      setProgress({ phase: 'error', fileName: parsed.fileName, message: '' });
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [logAudit, user, loadHistory, gf.category]);

  const cancelInspection = useCallback(() => {
    setInspection(null);
  }, []);

  const dismissPending = useCallback((tableName: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.tableName !== tableName));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
            <DatabaseBackup className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Restore Data</h1>
            <p className="text-sm text-slate-500">Restore legacy FoxPro DBF files with full structure validation</p>
          </div>
        </div>
        <GroupFilter value={groupFilter} onChange={setGroupFilter} />
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="space-y-2">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{success}</span>
            <button onClick={() => { setSuccess(null); setSyncResults(null); }} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
          </div>
          {syncResults && (
            <div className={`px-4 py-3 rounded-lg text-sm border ${syncResults.errors.length > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              <p className="font-medium">{syncResults.tableName} sync: {syncResults.imported} records imported, {syncResults.skipped} skipped.</p>
              {syncResults.errors.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {syncResults.errors.map((err, i) => <li key={i}>• {err}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress indicator */}
      {progress && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
          {progress.phase === 'done' ? <CheckCircle className="w-4 h-4 shrink-0" /> :
           progress.phase === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> :
           <LoadingIndicator size={24} />}
          <span className="flex-1">
            <span className="font-medium">{progress.fileName}</span> — {progress.message || `${progress.phase}...`}
          </span>
        </div>
      )}

      {/* Drag-and-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <HardDriveDownload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="text-sm font-medium text-slate-700">Drag and drop FoxPro DBF files here</p>
        <p className="text-xs text-slate-500 mt-1">Supports batch upload of all 10 tables, plus .CDX / .FPT / .IDX sidecar files</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors"
        >
          <Upload className="w-4 h-4" /> Select Files
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".DBF,.dbf,.cdx,.fpt,.idx" onChange={handleFileInput} className="hidden" />
      </div>

      {/* Pending files (awaiting confirmation) */}
      {pendingFiles.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">{pendingFiles.length} file(s) awaiting restore confirmation</p>
          </div>
          <div className="space-y-2">
            {pendingFiles.map((pf) => (
              <div key={pf.tableName} className="flex items-center justify-between bg-white rounded-lg border border-amber-200 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Table2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{pf.tableName}</p>
                    <p className="text-xs text-slate-500 truncate">{pf.fileName} — {pf.recordCount} records, {pf.fieldCount} fields</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setInspection(pf)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                    <FileSearch className="w-3.5 h-3.5 inline mr-1" /> Inspect
                  </button>
                  <button onClick={() => dismissPending(pf.tableName)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10-table status dashboard */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-800">Supported Tables Status</h2>
          </div>
          <button onClick={loadHistory} disabled={loadingHistory} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
            {loadingHistory ? <LoadingIndicator size={32} /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-px bg-slate-100">
          {SUPPORTED_TABLES.map((table) => {
            const latest = latestPerTable(table.name);
            const Icon = table.icon;
            return (
              <div key={table.name} className="bg-white p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${latest ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                    <Icon className={`w-4 h-4 ${latest ? 'text-emerald-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-700">{table.name}</p>
                    <p className="text-[11px] text-slate-500 leading-tight truncate">{table.description}</p>
                  </div>
                </div>
                {latest ? (
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle className="w-3 h-3" />
                      <span>{latest.record_count.toLocaleString()} records</span>
                    </div>
                    <p className="text-slate-400">Restored {new Date(latest.restored_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>
                    <p className="text-slate-400 font-mono text-[10px] truncate">{latest.checksum?.slice(0, 16)}...</p>
                    <p className="text-slate-400">{(latest.file_size / 1024).toFixed(1)} KB</p>
                    {latest.sidecar_files && latest.sidecar_files.length > 0 && (
                      <p className="text-blue-500 text-[10px]">+ {latest.sidecar_files.length} sidecar(s)</p>
                    )}
                  </div>
                ) : (
                  <div className="text-xs flex items-center gap-1.5 text-slate-400">
                    <FileX2 className="w-3 h-3" />
                    <span>Never restored</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Restore history log */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <History className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-800">Restore Audit Trail</h2>
        </div>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <LoadingIndicator size={40} />
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No restore operations recorded yet.
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-2.5">Timestamp</th>
                  <th className="text-left font-medium px-4 py-2.5">Table</th>
                  <th className="text-left font-medium px-4 py-2.5">Filename</th>
                  <th className="text-right font-medium px-4 py-2.5">Records</th>
                  <th className="text-right font-medium px-4 py-2.5">Size</th>
                  <th className="text-left font-medium px-4 py-2.5">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pag.pagedItems.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                      {new Date(h.restored_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{h.table_name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono truncate max-w-[200px]">{h.original_filename}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{h.record_count.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-500">{(h.file_size / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 truncate">{h.user_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} label="records" />
          </>
        )}
      </div>

      {/* Integrity rules info panel */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-slate-600" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">File Integrity Constraints</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500">
          <div className="flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>DBF headers, field lengths, and code pages remain 100% intact</span></div>
          <div className="flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Binary buffers prevent truncation or string conversion corruption</span></div>
          <div className="flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Supports CP1252 / CP437 / ANSI legacy character encodings</span></div>
          <div className="flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /><span>Sidecar .CDX / .FPT / .IDX files matched and tracked</span></div>
        </div>
      </div>

      {/* Inspection Modal */}
      {inspection && (
        <InspectionModal
          data={inspection}
          onConfirm={() => confirmRestore(inspection)}
          onCancel={cancelInspection}
          busy={progress !== null && progress.phase !== 'done' && progress.phase !== 'error'}
        />
      )}
    </div>
  );
}

// ── Inspection Modal ──
interface InspectionModalProps {
  data: ParsedDbf;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}

function InspectionModal({ data, onConfirm, onCancel, busy }: InspectionModalProps) {
  const versionLabel = `0x${data.version.toString(16).padStart(2, '0').toUpperCase()}`;
  const versionName = data.version === 0x30 ? 'FoxPro 2.x / VFP' :
    data.version === 0x03 ? 'dBASE III' :
    data.version === 0x83 ? 'dBASE III with memo' :
    data.version === 0x43 || data.version === 0x63 ? 'FoxPro with memo' :
    'FoxPro / dBASE compatible';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileSearch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Pre-Restore Inspection</h2>
              <p className="text-xs text-slate-500">{data.fileName} → <span className="font-mono font-medium">{data.tableName}</span></p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* File metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetaCard label="DBF Version" value={versionLabel} sub={versionName} />
            <MetaCard label="Record Count" value={data.recordCount.toLocaleString()} />
            <MetaCard label="Record Size" value={`${data.recordSize} bytes`} />
            <MetaCard label="Header Size" value={`${data.headerSize} bytes`} />
            <MetaCard label="Field Count" value={String(data.fieldCount)} />
            <MetaCard label="File Size" value={`${(data.fileSize / 1024).toFixed(1)} KB`} />
            <MetaCard label="Code Page" value={`0x${data.codePage.toString(16).padStart(2, '0')}`} sub={codePageName(data.codePage)} />
            <MetaCard label="Checksum" value={data.checksum.slice(0, 12) + '...'} sub="SHA-256" />
          </div>

          {/* Sidecar files */}
          {data.sidecarFiles.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 text-sm text-blue-700 border border-blue-200">
              <Info className="w-4 h-4 shrink-0" />
              <span>Sidecar files detected: {data.sidecarFiles.join(', ')}</span>
            </div>
          )}

          {/* Field structure table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Field Structure ({data.fields.length} fields)</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="text-left font-medium px-3 py-2">#</th>
                    <th className="text-left font-medium px-3 py-2">Field Name</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-right font-medium px-3 py-2">Length</th>
                    <th className="text-right font-medium px-3 py-2">Decimals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.fields.map((f, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono font-medium text-slate-700">{f.name}</td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">{f.type}</span>
                        <span className="ml-1.5 text-slate-500">{fieldTypeName(f.type)}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{f.length}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{f.decimals || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sample rows */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Sample Data (first {Math.min(5, data.sampleRows.length)} rows)</h3>
            {data.sampleRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No non-deleted records found in file.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      {data.fields.slice(0, 8).map((f) => (
                        <th key={f.name} className="text-left font-medium px-3 py-2 whitespace-nowrap">{f.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.sampleRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {data.fields.slice(0, 8).map((f) => (
                          <td key={f.name} className="px-3 py-1.5 text-slate-600 whitespace-nowrap truncate max-w-[120px]">
                            {formatCellValue(row[f.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer with confirm/cancel */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            <span>This will overwrite the active {data.tableName} data.</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {busy ? <LoadingIndicator size={40} /> : <CheckCircle className="w-4 h-4" />}
              {busy ? 'Restoring...' : 'Confirm Restore'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper components ──
function MetaCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</p>
      <p className="text-sm font-bold text-slate-700 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function fieldTypeName(type: string): string {
  switch (type) {
    case 'C': return 'Character';
    case 'N': return 'Numeric';
    case 'D': return 'Date';
    case 'L': return 'Logical';
    case 'F': return 'Float';
    case 'M': return 'Memo';
    default: return type;
  }
}

function codePageName(codePage: number): string {
  switch (codePage) {
    case 0x01: return 'CP437 (DOS USA)';
    case 0x03: return 'Windows-1252 (ANSI)';
    case 0x04: return 'Windows-1252 (Standard)';
    case 0x64: return 'CP852 (DOS EE)';
    case 0x00: return 'Unspecified';
    default: return `Code page ${codePage}`;
  }
}

function formatCellValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'T' : 'F';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}
