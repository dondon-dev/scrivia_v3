import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Award, Upload, Search, Download, Plus, Pencil, Trash2, X,
  FileUp, FileCheck2, AlertTriangle, CheckCircle2, Database,
  History, ArrowLeft, RefreshCw, FileDown, RotateCcw,
  GraduationCap, Users, Briefcase, Eye,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import LoadingIndicator from '@/components/LoadingIndicator';
import { supabase, fetchAll } from '@/lib/pb';
import { downloadFile, generateCsv } from '@/lib/reports';
import { validateUpload } from '@/lib/uploadSecurity';
import { usePagination, Pagination } from '@/components/Pagination';
import { useAuth } from '@/lib/auth';
import { useSalarySchedule } from '@/lib/useSalarySchedule';
import {
  parseFile, autoDetectMapping, validateRow, classifyPosition,
  processPositionImport, rollbackImport,
  FIELD_MAPPING, DBF_FIELDS,
  type ParsedPositionRow, type ImportMode, type ImportProgress,
  type ImportResult, type PersonnelCategory, type PositionRecord,
} from '@/lib/positionImport';

// ── Types ──────────────────────────────────────────────────────────────

interface PositionRow extends PositionRecord {
  id: string;
  status: 'Active' | 'Inactive';
  last_imported_at: string | null;
  last_updated_at: string | null;
}

interface ImportLog {
  id: string;
  uploaded_by: string;
  filename: string;
  import_mode: ImportMode;
  total_records: number;
  new_records: number;
  updated_records: number;
  skipped_records: number;
  error_records: number;
  processing_time_ms: number;
  status: string;
  created_at: string;
}

type Tab = 'positions' | 'import' | 'history';

// ── Component ──────────────────────────────────────────────────────────

export default function PositionManagement({ initialTab = 'positions' }: { initialTab?: Tab }) {
  const { profile, logAudit } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Position Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage position masterfile records and import legacy DBF files</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabButton active={tab === 'positions'} onClick={() => setTab('positions')} icon={Briefcase} label="Positions" />
        <TabButton active={tab === 'import'} onClick={() => setTab('import')} icon={FileUp} label="Import Positions" />
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={History} label="Import History" />
      </div>

      {tab === 'positions' && <PositionsTab onGoImport={() => setTab('import')} />}
      {tab === 'import' && <ImportTab onDone={() => setTab('history')} profile={profile} logAudit={logAudit} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Award; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Positions Tab ──────────────────────────────────────────────────────

function PositionsTab({ onGoImport }: { onGoImport: () => void }) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [deletingPos, setDeletingPos] = useState<PositionRow | null>(null);
  const [editing, setEditing] = useState<PositionRow | null>(null);
  const [form, setForm] = useState<PositionForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ total: 0, teaching: 0, teachingRelated: 0, nonTeaching: 0, active: 0 });
  const { stepsForGrade, meta: schedMeta } = useSalarySchedule();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('position_management').select('*').order('position_code');
    const rows = (data as PositionRow[]) ?? [];
    setPositions(rows);
    setStats({
      total: rows.length,
      teaching: rows.filter(r => r.personnel_category === 'Teaching').length,
      teachingRelated: rows.filter(r => r.personnel_category === 'Teaching Related').length,
      nonTeaching: rows.filter(r => r.personnel_category === 'Non-Teaching').length,
      active: rows.filter(r => r.status === 'Active').length,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return positions.filter(p => {
      if (categoryFilter !== 'All' && p.personnel_category !== categoryFilter) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [p.position_code, p.position_title, p.position_name, p.old_position_code]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [positions, search, categoryFilter, statusFilter]);

  const pag = usePagination(filtered, 12, `${search}|${categoryFilter}|${statusFilter}`);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setShowModal(true);
  }

  function openEdit(p: PositionRow) {
    setEditing(p);
    setForm({
      position_code: p.position_code,
      old_position_code: p.old_position_code,
      position_title: p.position_title,
      position_name: p.position_name,
      salary_grade: p.salary_grade,
      step1: p.step1, step2: p.step2, step3: p.step3, step4: p.step4,
      step5: p.step5, step6: p.step6, step7: p.step7, step8: p.step8,
      personnel_category: p.personnel_category,
      position_category_code: p.position_category_code,
      remarks: p.remarks,
      status: p.status,
    });
    setError('');
    setShowModal(true);
  }

  async function save() {
    setError('');
    if (!form.position_code.trim()) { setError('Position Code is required.'); return; }
    if (!form.position_name.trim() && !form.position_title.trim()) { setError('Position Name or Title is required.'); return; }
    setSaving(true);
    const payload = {
      ...form,
      position_code: form.position_code.toUpperCase().trim(),
      personnel_category: form.personnel_category,
      last_updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error: err } = await supabase.from('position_management').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('position_management').insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  function remove(p: PositionRow) {
    setDeletingPos(p);
  }

  async function confirmRemove() {
    if (!deletingPos) return;
    await supabase.from('position_management').delete().eq('id', deletingPos.id);
    setDeletingPos(null);
    load();
  }

  async function toggleStatus(p: PositionRow) {
    await supabase.from('position_management')
      .update({ status: p.status === 'Active' ? 'Inactive' : 'Active', last_updated_at: new Date().toISOString() })
      .eq('id', p.id);
    load();
  }

  function exportCsv() {
    const content = generateCsv(
      ['POSCODE', 'OLDCODE', 'POSTITLE', 'POSITION', 'GRADE', 'STEP1', 'STEP2', 'STEP3', 'STEP4', 'STEP5', 'STEP6', 'STEP7', 'STEP8', 'SC', 'POSTPLUS', 'CATEGORY', 'STATUS'],
      filtered.map(p => [
        p.position_code, p.old_position_code, p.position_title, p.position_name,
        p.salary_grade, p.step1, p.step2, p.step3, p.step4, p.step5, p.step6, p.step7, p.step8,
        p.position_category_code, p.remarks, p.personnel_category, p.status,
      ]),
    );
    downloadFile({ filename: `positions_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Positions" value={stats.total} icon={Briefcase} tone="slate" />
        <StatCard label="Teaching" value={stats.teaching} icon={GraduationCap} tone="emerald" />
        <StatCard label="Teaching Related" value={stats.teachingRelated} icon={Users} tone="blue" />
        <StatCard label="Non-Teaching" value={stats.nonTeaching} icon={Briefcase} tone="amber" />
        <StatCard label="Active" value={stats.active} icon={CheckCircle2} tone="emerald" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search code, title, name…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
            <option>All</option>
            <option>Teaching</option>
            <option>Teaching Related</option>
            <option>Non-Teaching</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={onGoImport} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <FileUp className="w-4 h-4" /> Import
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Position
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading positions…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Database className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500 mb-4">
              {positions.length === 0 ? 'No positions yet. Import a POSTFILE or add manually.' : 'No positions match your filters.'}
            </p>
            {positions.length === 0 && (
              <button onClick={onGoImport} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                <FileUp className="w-4 h-4" /> Import Positions
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Code</th>
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium">Grade</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pag.pagedItems.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-mono font-semibold">{p.position_code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{p.position_title || p.position_name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.salary_grade}</td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={p.personnel_category} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleStatus(p)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            p.status === 'Active' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {p.status === 'Active' ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {p.status}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} pageSize={pag.pageSize} onPageChange={pag.setPage} label="positions" />
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Position' : 'Add Position'} onClose={() => setShowModal(false)} wide>
          <div className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Position Code *</label>
                <input value={form.position_code} onChange={e => setForm(f => ({ ...f, position_code: e.target.value }))} disabled={!!editing} className={inputCls} placeholder="e.g. T1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Old Position Code</label>
                <input value={form.old_position_code} onChange={e => setForm(f => ({ ...f, old_position_code: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Position Title</label>
                <input value={form.position_title} onChange={e => setForm(f => ({ ...f, position_title: e.target.value }))} className={inputCls} placeholder="e.g. Teacher I" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Position Name</label>
                <input value={form.position_name} onChange={e => setForm(f => ({ ...f, position_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Salary Grade</label>
                <input type="number" min={0} max={33} value={form.salary_grade} onChange={e => {
                  const g = parseInt(e.target.value) || 0;
                  const steps = stepsForGrade(g);
                  setForm(f => ({ ...f, salary_grade: g, step1: steps[0], step2: steps[1], step3: steps[2], step4: steps[3], step5: steps[4], step6: steps[5], step7: steps[6], step8: steps[7] }));
                }} className={inputCls} />
                {form.salary_grade > 0 && stepsForGrade(form.salary_grade).some(v => v > 0) && (
                  <p className="text-[10px] text-emerald-600 mt-1">Auto-filled from {schedMeta?.tranche ?? 'salary schedule'} · {schedMeta?.circular_no ?? ''}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Personnel Category</label>
                <select value={form.personnel_category} onChange={e => setForm(f => ({ ...f, personnel_category: e.target.value as PersonnelCategory }))} className={inputCls}>
                  <option>Teaching</option>
                  <option>Teaching Related</option>
                  <option>Non-Teaching</option>
                </select>
              </div>
            </div>
            {/* Steps grid */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500">Salary Steps (1–8)</label>
                {form.salary_grade > 0 && (
                  <button type="button" onClick={() => {
                    const steps = stepsForGrade(form.salary_grade);
                    setForm(f => ({ ...f, step1: steps[0], step2: steps[1], step3: steps[2], step4: steps[3], step5: steps[4], step6: steps[5], step7: steps[6], step8: steps[7] }));
                  }} className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium">↻ Sync from Schedule</button>
                )}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[1,2,3,4,5,6,7,8].map(s => (
                  <div key={s}>
                    <span className="block text-[10px] text-slate-400 mb-0.5">Step {s}</span>
                    <input
                      type="number"
                      value={(form as unknown as Record<string, unknown>)[`step${s}`] as number ?? 0}
                      onChange={e => setForm(f => ({ ...f, [`step${s}`]: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Category Code</label>
                <input value={form.position_category_code} onChange={e => setForm(f => ({ ...f, position_category_code: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'Active' | 'Inactive' }))} className={inputCls}>
                  <option>Active</option><option>Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
              <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {saving ? <LoadingIndicator size={40} /> : <CheckCircle2 className="w-4 h-4" />}
                {editing ? 'Update' : 'Add'} Position
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPos && (
        <Modal title="Delete Position Record" onClose={() => setDeletingPos(null)}>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete position <strong className="font-semibold text-slate-900 dark:text-white">{deletingPos.position_code} — {deletingPos.position_title || deletingPos.position_name}</strong>?
            </p>
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
              This action will remove the record from position management.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setDeletingPos(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={confirmRemove} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
                <Trash2 className="w-4 h-4" />
                Delete Position
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Import Tab ─────────────────────────────────────────────────────────

function ImportTab({ onDone, profile, logAudit }: { onDone: () => void; profile: { email: string; role: string } | null; logAudit: (action: string, recordType?: string, recordId?: string, details?: Record<string, unknown>) => Promise<void> }) {
  const [stage, setStage] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [rawRecords, setRawRecords] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<ParsedPositionRow[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('add_new');
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErrorMsg('');
    const validation = await validateUpload(file);
    if (!validation.valid) { setErrorMsg(validation.error ?? 'Invalid file'); return; }
    try {
      const { fields, records } = await parseFile(file);
      if (records.length === 0) { setErrorMsg('File contains no records.'); return; }
      setFileName(file.name);
      setSourceFields(fields);
      setRawRecords(records);
      const auto = autoDetectMapping(fields);
      setMapping(auto);
      setStage('mapping');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function runPreview() {
    const rows: ParsedPositionRow[] = rawRecords.map((raw, idx) => {
      const { errors, record } = validateRow(raw, mapping);
      return { ...record, _rowNum: idx + 2, _errors: errors, _action: 'invalid' as const };
    });
    setParsedRows(rows);
    setStage('preview');
  }

  async function doImport() {
    setStage('importing');
    setProgress({ phase: 'fetching', current: 0, total: parsedRows.length, message: 'Starting…' });
    try {
      const res = await processPositionImport(
        parsedRows, importMode, profile?.email ?? 'unknown', fileName,
        p => setProgress(p),
      );
      setResult(res);
      setStage('done');
      await logAudit('position_dbf_import', 'position_management', undefined, {
        filename: fileName, mode: importMode,
        new: res.added, updated: res.updated, skipped: res.skipped, errors: res.failed,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStage('preview');
    }
  }

  function reset() {
    setStage('upload'); setFileName(''); setSourceFields([]); setRawRecords([]);
    setMapping({}); setParsedRows([]); setErrorMsg(''); setProgress(null); setResult(null);
  }

  // Summary counts
  const summary = useMemo(() => {
    const newCount = parsedRows.filter(r => r._action === 'new').length;
    const updateCount = parsedRows.filter(r => r._action === 'update').length;
    const skipCount = parsedRows.filter(r => r._action === 'skip' || r._action === 'duplicate').length;
    const errorCount = parsedRows.filter(r => r._errors.length > 0).length;
    return { newCount, updateCount, skipCount, errorCount };
  }, [parsedRows]);

  // ── Upload Stage ─────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-800">Import Position Master File</h3>
          <p className="text-sm text-slate-500 mt-1">Upload POSTFILE.DBF, POSTFILE.CSV, or POSTFILE.XLSX to import positions</p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl py-16 px-6 text-center cursor-pointer transition-all ${
            dragOver ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".DBF,.dbf,.csv,.xlsx,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${dragOver ? 'bg-emerald-100' : 'bg-slate-100'}`}>
            <Upload className={`w-8 h-8 ${dragOver ? 'text-emerald-600' : 'text-slate-400'}`} />
          </div>
          <p className="text-sm font-medium text-slate-700">Drag and drop your file here</p>
          <p className="text-xs text-slate-400 mt-1">or click to browse</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {['.DBF', '.CSV', '.XLSX'].map(ext => (
              <span key={ext} className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-xs font-mono">{ext}</span>
            ))}
          </div>
        </div>

        {errorMsg && <ErrorBanner message={errorMsg} />}

        {/* DBF field reference */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Expected DBF Fields</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {DBF_FIELDS.map(f => (
              <span key={f} className="px-2 py-1 rounded bg-white border border-slate-200 text-xs font-mono text-slate-600">{f}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Mapping Stage ────────────────────────────────────────────────
  if (stage === 'mapping') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Field Mapping</h3>
            <p className="text-sm text-slate-500">File: {fileName} ({rawRecords.length} records)</p>
          </div>
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Start Over
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">DBF Field</th>
                <th className="text-left px-4 py-3 font-medium">→ Database Field</th>
                <th className="text-left px-4 py-3 font-medium">Source Field</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(FIELD_MAPPING).map(([dbfField, dbCol]) => {
                const mappedSrc = Object.keys(mapping).find(k => mapping[k] === dbCol);
                return (
                  <tr key={dbfField} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-600">{dbfField}</td>
                    <td className="px-4 py-2.5 text-slate-400">→</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={mappedSrc ?? ''}
                        onChange={e => {
                          setMapping(prev => {
                            const next = { ...prev };
                            // Remove any existing mapping to this db column
                            for (const [k, v] of Object.entries(next)) {
                              if (v === dbCol) delete next[k];
                            }
                            if (e.target.value) next[e.target.value] = dbCol;
                            return next;
                          });
                        }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      >
                        <option value="">— Not mapped —</option>
                        {sourceFields.map(sf => (
                          <option key={sf} value={sf}>{sf}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={reset} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={runPreview}
            disabled={!mapping['POSCODE' in mapping ? 'POSCODE' : Object.keys(mapping).find(k => mapping[k] === 'position_code') ?? '']}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Eye className="w-4 h-4" /> Preview Import
          </button>
        </div>
      </div>
    );
  }

  // ── Preview Stage ────────────────────────────────────────────────
  if (stage === 'preview') {
    const validRows = parsedRows.filter(r => r._errors.length === 0);
    const errorRows = parsedRows.filter(r => r._errors.length > 0);
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Import Preview</h3>
            <p className="text-sm text-slate-500">{fileName} — {parsedRows.length} records</p>
          </div>
          <button onClick={() => setStage('mapping')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Back to Mapping
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <PreviewStat label="New" value={summary.newCount} icon={Plus} tone="emerald" />
          <PreviewStat label="Updated" value={summary.updateCount} icon={RefreshCw} tone="blue" />
          <PreviewStat label="Skipped" value={summary.skipCount} icon={X} tone="amber" />
          <PreviewStat label="Errors" value={summary.errorCount} icon={AlertTriangle} tone="rose" />
        </div>

        {/* Import mode selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-700 mb-3">Import Mode</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { id: 'add_new', label: 'Add New Only', desc: 'Skip existing position codes' },
              { id: 'update_existing', label: 'Update Existing', desc: 'Update salary grade, steps, and title' },
              { id: 'full_sync', label: 'Full Sync', desc: 'Insert new, update existing, mark missing as inactive' },
            ] as { id: ImportMode; label: string; desc: string }[]).map(m => (
              <button
                key={m.id}
                onClick={() => setImportMode(m.id)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  importMode === m.id
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-semibold text-slate-700">{m.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Error rows */}
        {errorRows.length > 0 && (
          <div className="bg-rose-50 rounded-xl border border-rose-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-rose-700">Validation Errors ({errorRows.length})</h4>
              <button
                onClick={() => {
                  const content = generateCsv(
                    ['Row', 'Position Code', 'Errors'],
                    errorRows.map(r => [String(r._rowNum), r.position_code, r._errors.join('; ')]),
                  );
                  downloadFile({ filename: `import_errors_${new Date().toISOString().slice(0, 10)}.csv`, content, mimeType: 'text/csv' });
                }}
                className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium"
              >
                <FileDown className="w-3.5 h-3.5" /> Download Error Report
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-rose-500 text-left">
                    <th className="py-1.5 pr-3">Row</th>
                    <th className="py-1.5 pr-3">Code</th>
                    <th className="py-1.5">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.slice(0, 50).map(r => (
                    <tr key={r._rowNum} className="border-t border-rose-100">
                      <td className="py-1.5 pr-3 text-rose-600">{r._rowNum}</td>
                      <td className="py-1.5 pr-3 font-mono">{r.position_code || '—'}</td>
                      <td className="py-1.5 text-rose-700">{r._errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Valid rows preview */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-700">Valid Records Preview ({validRows.length})</h4>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {validRows.slice(0, 100).map(r => (
                  <tr key={r._rowNum} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-600">{r.position_code}</td>
                    <td className="px-3 py-2 text-slate-700">{r.position_title || r.position_name}</td>
                    <td className="px-3 py-2 text-slate-500">{r.salary_grade}</td>
                    <td className="px-3 py-2"><CategoryBadge category={r.personnel_category} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => setStage('mapping')} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
          <button
            onClick={doImport}
            disabled={validRows.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileCheck2 className="w-4 h-4" /> Import {validRows.length} Positions
          </button>
        </div>
      </div>
    );
  }

  // ── Importing Stage ──────────────────────────────────────────────
  if (stage === 'importing') {
    const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <LoadingIndicator size={48} />
        <h3 className="text-lg font-bold text-slate-800 mb-1">Importing Positions…</h3>
        <p className="text-sm text-slate-500 mb-6">{progress?.message ?? 'Processing…'}</p>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div className="h-full bg-emerald-600 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-2">{progress?.current ?? 0} / {progress?.total ?? 0}</p>
      </div>
    );
  }

  // ── Done Stage ───────────────────────────────────────────────────
  if (stage === 'done' && result) {
    const isSuccess = result.failed === 0;
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${isSuccess ? 'bg-emerald-100' : 'bg-amber-100'}`}>
          {isSuccess ? <CheckCircle2 className="w-8 h-8 text-emerald-600" /> : <AlertTriangle className="w-8 h-8 text-amber-600" />}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">{isSuccess ? 'Import Complete' : 'Import Complete with Errors'}</h3>
        <p className="text-sm text-slate-500 mb-6">{fileName}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <ResultStat label="New" value={result.added} tone="emerald" />
          <ResultStat label="Updated" value={result.updated} tone="blue" />
          <ResultStat label="Skipped" value={result.skipped} tone="amber" />
          <ResultStat label="Errors" value={result.failed} tone="rose" />
        </div>

        {result.errors.length > 0 && (
          <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 mb-6 text-left max-h-32 overflow-y-auto">
            <p className="text-xs font-bold text-rose-700 mb-1">Error Details:</p>
            {result.errors.slice(0, 10).map((e, i) => (
              <p key={i} className="text-xs text-rose-600">{e}</p>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-2">
          <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Upload className="w-4 h-4" /> Import Another
          </button>
          <button onClick={onDone} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            <History className="w-4 h-4" /> View History
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── History Tab ────────────────────────────────────────────────────────

function HistoryTab() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('position_import_logs').select('*').order('created_at', { ascending: false });
    setLogs((data as ImportLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doRollback(log: ImportLog) {
    if (!confirm(`Rollback import "${log.filename}"? This will attempt to undo the changes made.`)) return;
    setRollingBack(log.id);
    try {
      await rollbackImport(log.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rollback failed');
    }
    setRollingBack(null);
  }

  function downloadLog(log: ImportLog) {
    const content = [
      `Position Import Log`,
      `========================`,
      `Date: ${new Date(log.created_at).toLocaleString()}`,
      `File: ${log.filename}`,
      `Imported By: ${log.uploaded_by}`,
      `Mode: ${log.import_mode}`,
      `Total Records: ${log.total_records}`,
      `New: ${log.new_records}`,
      `Updated: ${log.updated_records}`,
      `Skipped: ${log.skipped_records}`,
      `Errors: ${log.error_records}`,
      `Processing Time: ${log.processing_time_ms}ms`,
      `Status: ${log.status}`,
    ].join('\n');
    downloadFile({ filename: `position_import_log_${log.id}.txt`, content: new TextEncoder().encode(content), mimeType: 'text/plain' });
  }

  if (loading) return <div className="py-20 text-center text-slate-400 text-sm">Loading import history…</div>;

  if (logs.length === 0) {
    return (
      <div className="py-16 text-center">
        <History className="w-10 h-10 mx-auto mb-3 text-slate-200" />
        <p className="text-sm text-slate-500">No import history yet. Import positions to see logs here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">File Name</th>
              <th className="text-left px-4 py-3 font-medium">Imported By</th>
              <th className="text-center px-4 py-3 font-medium">Mode</th>
              <th className="text-center px-4 py-3 font-medium">Total</th>
              <th className="text-center px-4 py-3 font-medium">New</th>
              <th className="text-center px-4 py-3 font-medium">Updated</th>
              <th className="text-center px-4 py-3 font-medium">Errors</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{log.filename}</td>
                <td className="px-4 py-3 text-slate-600">{log.uploaded_by}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs text-slate-500">{log.import_mode}</span>
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{log.total_records}</td>
                <td className="px-4 py-3 text-center"><span className="text-xs font-semibold text-emerald-600">{log.new_records}</span></td>
                <td className="px-4 py-3 text-center"><span className="text-xs font-semibold text-blue-600">{log.updated_records}</span></td>
                <td className="px-4 py-3 text-center"><span className="text-xs font-semibold text-rose-600">{log.error_records}</span></td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                    log.status === 'Partial' ? 'bg-amber-50 text-amber-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>{log.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => downloadLog(log)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Download Log">
                      <FileDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => doRollback(log)}
                      disabled={rollingBack === log.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                      title="Rollback Import"
                    >
                      {rollingBack === log.id ? <LoadingIndicator size={40} /> : <RotateCcw className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────────────

interface PositionForm {
  position_code: string; old_position_code: string;
  position_title: string; position_name: string;
  salary_grade: number;
  step1: number; step2: number; step3: number; step4: number;
  step5: number; step6: number; step7: number; step8: number;
  personnel_category: PersonnelCategory;
  position_category_code: string;
  remarks: string;
  status: 'Active' | 'Inactive';
}

function emptyForm(): PositionForm {
  return {
    position_code: '', old_position_code: '', position_title: '', position_name: '',
    salary_grade: 0,
    step1: 0, step2: 0, step3: 0, step4: 0,
    step5: 0, step6: 0, step7: 0, step8: 0,
    personnel_category: 'Non-Teaching',
    position_category_code: '', remarks: '', status: 'Active',
  };
}

function CategoryBadge({ category }: { category: PersonnelCategory }) {
  const styles: Record<PersonnelCategory, string> = {
    'Teaching': 'bg-emerald-50 text-emerald-700',
    'Teaching Related': 'bg-blue-50 text-blue-700',
    'Non-Teaching': 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${styles[category]}`}>
      {category}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Award; tone: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone] ?? tones.slate}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Award; tone: string }) {
  const tones: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] ?? tones.emerald}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${tones[tone] ?? tones.emerald}`}>{value}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
