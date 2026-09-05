import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe, Building2, FolderOpen, Plus, Pencil, Trash2, X, Check, Users,
  School as SchoolIcon, Wallet, MapPin, RefreshCw, ChevronRight, ChevronDown,
  Folder, AlertTriangle, CheckCircle2, ArrowRight, Link2, UserCog, Power,
  ClipboardCopy, Table2,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import LoadingIndicator from '@/components/LoadingIndicator';
import regionsDivisionsSetupSql from '../../supabase/migrations/20260809090100_create_regions_divisions.sql?raw';
import regionsDivisionsFixSql from '../../supabase/migrations/20260809100000_fix_divisions_region_fk.sql?raw';

/** Full setup script: base migration + FK fix (SQL Editor paste path). */
const FULL_SETUP_SQL = `${regionsDivisionsSetupSql}

-- ============================================================================
-- Fix: self-healing upsert_division (resolves the region by id, then by code)
-- ============================================================================
${regionsDivisionsFixSql}`;
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { useOrg } from '@/lib/org';
import {
  DEFAULT_DIVISION_FEATURES, DIVISION_FEATURE_LABELS, DIVISION_FEATURE_KEYS,
  mergeFeatures, type Division, type Region,
} from '@/types/org';
import type { UserRole } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';

interface SchoolRow { id: string; school_code: string; school_name: string; status: string; division_id: string | null; }
interface UserRow { id: string; first_name: string; last_name: string; email: string; role: UserRole; division_id: string | null; }
interface EmpRow { division_id: string | null; status: string | null; }

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';
const labelCls = 'block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5';

/** Turn the cryptic PostgREST "function not in schema cache" error into an
 * actionable message — the function lives in the repo's migration files but
 * hasn't been pushed to the database yet (run `supabase db push`). */
function friendlyRpcError(error: { message?: string }): string {
  const m = error?.message ?? '';
  if (/could not find the function|in the schema cache|does not exist/i.test(m)) {
    return 'Database functions not deployed yet. Run `supabase db push` from the project folder, then try again.';
  }
  if (/violates foreign key constraint.*divisions_region_id_fkey/i.test(m)) {
    return 'The selected region no longer exists in the database (stale region id). Refresh the page to reload the regions list, then try again. If it persists, paste the Setup SQL into the Supabase SQL Editor to install the self-healing fix.';
  }
  return m;
}

export default function RegionsDivisions({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { profile } = useAuth();
  const org = useOrg();
  const isSuper = isSuperAdminRole(profile?.role);

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [empRows, setEmpRows] = useState<EmpRow[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [regionModal, setRegionModal] = useState<{ region?: Region } | null>(null);
  const [divisionModal, setDivisionModal] = useState<{ regionId: string; division?: Division } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [view, setView] = useState<'folders' | 'table'>('folders');
  const [setupOpen, setSetupOpen] = useState(false);

  // Table view — inline add rows
  const [newRegionCode, setNewRegionCode] = useState('');
  const [newRegionName, setNewRegionName] = useState('');
  const [newDivRegion, setNewDivRegion] = useState('');
  const [newDivCode, setNewDivCode] = useState('');
  const [newDivName, setNewDivName] = useState('');

  // Division folder — schools assignment
  const [schoolSearch, setSchoolSearch] = useState('');
  const [pendingAssign, setPendingAssign] = useState<Set<string>>(new Set());
  const [featureBusy, setFeatureBusy] = useState<string | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  // RPC failure — if it's the schema-cache "not deployed" error, surface the
  // one-click setup panel so the user can paste the migration into the SQL Editor.
  const rpcFail = (error: { message?: string }) => {
    const msg = friendlyRpcError(error);
    flash('err', msg);
    if (/not deployed yet|schema cache|does not exist/i.test(msg)) setSetupOpen(true);
    // Stale region id — reload the directory so the app re-adopts the DB's ids.
    if (/foreign key constraint/i.test(msg)) void org.refresh();
  };

  const copySetupSql = () => {
    void navigator.clipboard.writeText(FULL_SETUP_SQL).then(() => {
      flash('ok', 'Setup SQL copied — paste it into your Supabase SQL Editor and click Run.');
    });
  };

  // Table view — inline add
  const addRegionFromTable = async () => {
    if (!isSuper || busy || !newRegionCode.trim() || !newRegionName.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('upsert_region', {
      p_region_id: null,
      p_region_code: newRegionCode,
      p_region_name: newRegionName,
      p_sort_order: 0,
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', 'Region created.');
    setNewRegionCode('');
    setNewRegionName('');
    await org.refresh();
  };

  const addDivisionFromTable = async () => {
    if (!isSuper || busy || !newDivCode.trim() || !newDivName.trim() || !newDivRegion) return;
    const region = org.regions.find((r) => r.id === newDivRegion);
    setBusy(true);
    const { error } = await supabase.rpc('upsert_division', {
      p_division_id: null,
      p_region_id: newDivRegion,
      p_region_code: region?.region_code ?? '',
      p_division_code: newDivCode,
      p_division_name: newDivName,
      p_features: DEFAULT_DIVISION_FEATURES,
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', 'Division created.');
    setNewDivCode('');
    setNewDivName('');
    await org.refresh();
  };

  // Default the division quick-add row to the first region.
  useEffect(() => {
    if (!newDivRegion && org.regions.length > 0) setNewDivRegion(org.regions[0].id);
  }, [newDivRegion, org.regions]);

  const load = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [s, u, e] = await Promise.all([
        fetchAll<SchoolRow>(() => supabase.from('schools').select('id,school_code,school_name,status,division_id').order('school_name')),
        fetchAll<UserRow>(() => supabase.from('profiles').select('id,first_name,last_name,email,role,division_id').order('last_name')),
        fetchAll<EmpRow>(() => supabase.from('employees').select('division_id,status')),
      ]);
      setSchools(s);
      setUsers(u);
      setEmpRows(e);
    } catch { /* stats are best-effort */ }
    setLoadingStats(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const statsFor = useCallback((divisionId: string) => ({
    users: users.filter((u) => u.division_id === divisionId).length,
    schools: schools.filter((s) => s.division_id === divisionId).length,
    employees: empRows.filter((e) => e.division_id === divisionId).length,
    activeEmployees: empRows.filter((e) => e.division_id === divisionId && e.status === 'Active').length,
  }), [users, schools, empRows]);

  const selectedDivision = useMemo(
    () => org.divisions.find((d) => d.id === selectedDivisionId) ?? null,
    [org.divisions, selectedDivisionId],
  );
  const selectedRegion = useMemo(
    () => org.regions.find((r) => r.id === selectedDivision?.region_id) ?? null,
    [org.regions, selectedDivision],
  );

  const divisionsByRegion = useMemo(() => {
    const map: Record<string, Division[]> = {};
    for (const r of org.regions) map[r.id] = [];
    for (const d of org.divisions) {
      (map[d.region_id] ??= []).push(d);
    }
    return map;
  }, [org.regions, org.divisions]);

  // ── Region CRUD ──
  const saveRegion = async (input: { region_code: string; region_name: string; sort_order: number }, regionId?: string) => {
    if (!isSuper || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('upsert_region', {
      p_region_id: regionId ?? null,
      p_region_code: input.region_code,
      p_region_name: input.region_name,
      p_sort_order: input.sort_order,
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', regionId ? 'Region updated.' : 'Region created.');
    setRegionModal(null);
    await org.refresh();
  };

  const deleteRegion = async (region: Region) => {
    if (!isSuper || busy) return;
    if (!window.confirm(`Delete region "${region.region_name || region.region_code}"? Divisions must be removed first.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_region', { p_region_id: region.id });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', 'Region deleted.');
    await org.refresh();
  };

  // ── Division CRUD ──
  const saveDivision = async (input: { region_id: string; division_code: string; division_name: string }, divisionId?: string) => {
    if (!isSuper || busy) return;
    const region = org.regions.find((r) => r.id === input.region_id);
    setBusy(true);
    const { error } = await supabase.rpc('upsert_division', {
      p_division_id: divisionId ?? null,
      p_region_id: input.region_id,
      p_region_code: region?.region_code ?? '',
      p_division_code: input.division_code,
      p_division_name: input.division_name,
      p_features: divisionId ? mergeFeatures(org.divisions.find((d) => d.id === divisionId)?.features) : DEFAULT_DIVISION_FEATURES,
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', divisionId ? 'Division updated.' : 'Division created.');
    setDivisionModal(null);
    await org.refresh();
  };

  const deleteDivision = async (division: Division) => {
    if (!isSuper || busy) return;
    if (!window.confirm(`Delete division "${division.division_name || division.division_code}"? This is blocked while users, schools, or employees are assigned.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_division', { p_division_id: division.id });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', 'Division deleted.');
    if (selectedDivisionId === division.id) setSelectedDivisionId(null);
    await org.refresh();
  };

  // ── Features toggle ──
  const toggleFeature = async (feature: string, enabled: boolean) => {
    if (!isSuper || !selectedDivision || featureBusy) return;
    setFeatureBusy(feature);
    const features = mergeFeatures(selectedDivision.features);
    features[feature] = enabled;
    const region = org.regions.find((r) => r.id === selectedDivision.region_id);
    const { error } = await supabase.rpc('upsert_division', {
      p_division_id: selectedDivision.id,
      p_region_id: selectedDivision.region_id,
      p_region_code: region?.region_code ?? '',
      p_division_code: selectedDivision.division_code,
      p_division_name: selectedDivision.division_name,
      p_features: features,
    });
    setFeatureBusy(null);
    if (error) { rpcFail(error); return; }
    await org.refresh();
  };

  // ── Schools assignment ──
  const assignSchools = async () => {
    if (!isSuper || !selectedDivision || pendingAssign.size === 0) return;
    setBusy(true);
    const { error } = await supabase.rpc('assign_schools_to_division', {
      p_division_id: selectedDivision.id,
      p_school_ids: [...pendingAssign],
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    flash('ok', `${pendingAssign.size} school(s) assigned to ${selectedDivision.division_name}.`);
    setPendingAssign(new Set());
    await load();
  };

  const clearSchool = async (school: SchoolRow) => {
    if (!isSuper || !selectedDivision || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('clear_schools_from_division', {
      p_division_id: selectedDivision.id,
      p_school_ids: [school.id],
    });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    await load();
  };

  const syncEmployees = async () => {
    if (!isSuper || !selectedDivision || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('sync_employees_to_division', { p_division_id: selectedDivision.id });
    setBusy(false);
    if (error) { rpcFail(error); return; }
    const n = (data as { updated?: number } | null)?.updated ?? 0;
    flash('ok', n > 0 ? `${n} employee(s) mapped to this division from its schools.` : 'All employees already mapped.');
    await load();
  };

  const openDivisionProfile = () => {
    if (!selectedDivision) return;
    org.setRegion(selectedDivision.region_id);
    org.setDivision(selectedDivision.id);
    onNavigate('org_division');
  };

  const unassignedSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    return schools.filter((s) => !s.division_id && (!q || s.school_name.toLowerCase().includes(q) || s.school_code.toLowerCase().includes(q)));
  }, [schools, schoolSearch]);

  const assignedSchools = useMemo(() => {
    if (!selectedDivisionId) return [];
    return schools.filter((s) => s.division_id === selectedDivisionId);
  }, [schools, selectedDivisionId]);

  const divisionUsers = useMemo(() => {
    if (!selectedDivisionId) return [];
    return users.filter((u) => u.division_id === selectedDivisionId);
  }, [users, selectedDivisionId]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </span>
            Regions &amp; Divisions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            {isSuper
              ? 'Organize the payroll system by DepEd region and division. The REGCODE (regional code) and DIVCODE (division code) you encode here are the unique reference that groups one division\'s payroll — they must match the REGCODE/DIVCODE columns in the employee masterfile. Each division is its own folder with assigned users, schools, employees, and enabled functions.'
              : 'View-only directory of regions and divisions.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
            <button
              onClick={() => setView('folders')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${view === 'folders' ? 'bg-deped-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <Folder className="w-3.5 h-3.5" /> Folders
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${view === 'table' ? 'bg-deped-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <Table2 className="w-3.5 h-3.5" /> Table
            </button>
          </div>
          {isSuper && (
            <button onClick={() => setRegionModal({})} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> New Region
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
          notice.kind === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
        }`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {notice.text}
        </div>
      )}

      {setupOpen && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Database setup incomplete.</p>
            <p className="mt-0.5">
              The Regions &amp; Divisions tables and functions live in the migration{' '}
              <code className="font-mono text-[11px] bg-amber-100 px-1.5 py-0.5 rounded">20260809090100_create_regions_divisions.sql</code>.
              Run <strong>supabase db push</strong> from the project folder — or paste the script below into your
              Supabase SQL Editor and click Run (it also reloads the PostgREST schema cache so the app sees them immediately):
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={copySetupSql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors"
              >
                <ClipboardCopy className="w-3.5 h-3.5" /> Copy Setup SQL
              </button>
              <button onClick={() => setSetupOpen(false)} className="px-2 py-1.5 text-xs text-amber-700 hover:text-amber-900">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {!isSuper && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Only Super Administrators can create or modify regions and divisions.</span>
        </div>
      )}

      {loadingStats ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 card-base p-5 animate-pulse h-64" />
          <div className="lg:col-span-2 card-base p-5 animate-pulse h-64" />
        </div>
      ) : org.regions.length === 0 ? (
        <div className="card-base p-10 text-center">
          <Globe className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">No regions yet</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            {isSuper
              ? 'Create your first region (e.g., Region IV-A CALABARZON), then add its divisions. Each division becomes a folder you can populate with users, schools, and employees.'
              : 'A Super Administrator needs to configure regions and divisions before this directory is populated.'}
          </p>
          {isSuper && (
            <button onClick={() => setRegionModal({})} className="mt-4 btn-primary text-sm">
              <Plus className="w-4 h-4" /> Create Region
            </button>
          )}
        </div>
      ) : view === 'table' ? (
        <div className="space-y-4">
          {/* Regions table */}
          <div className="card-base overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Regions</h3>
              {isSuper && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newRegionCode}
                    onChange={(e) => setNewRegionCode(e.target.value.toUpperCase())}
                    placeholder="REGCODE"
                    className={`${inputCls} !w-24 font-mono`}
                  />
                  <input
                    value={newRegionName}
                    onChange={(e) => setNewRegionName(e.target.value)}
                    placeholder="Region name (e.g. Region IV-A CALABARZON)"
                    className={`${inputCls} !w-64`}
                  />
                  <button
                    onClick={addRegionFromTable}
                    disabled={busy || !newRegionCode.trim() || !newRegionName.trim()}
                    className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-2.5 font-medium">REGCODE</th>
                    <th className="px-5 py-2.5 font-medium">REGNAME</th>
                    <th className="px-5 py-2.5 font-medium">Sort</th>
                    <th className="px-5 py-2.5 font-medium">Divisions</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {org.regions.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-deped-700 dark:text-deped-300">{r.region_code}</td>
                      <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200">{r.region_name}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{r.sort_order}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{divisionsByRegion[r.id]?.length ?? 0}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {isSuper && (
                            <>
                              <button onClick={() => setDivisionModal({ regionId: r.id })} title="Add division" className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setRegionModal({ region: r })} title="Edit region" className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteRegion(r)} title="Delete region" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Divisions table */}
          <div className="card-base overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Divisions</h3>
              {isSuper && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newDivRegion}
                    onChange={(e) => setNewDivRegion(e.target.value)}
                    className={`${inputCls} !w-56`}
                  >
                    {org.regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.region_name || r.region_code}</option>
                    ))}
                  </select>
                  <input
                    value={newDivCode}
                    onChange={(e) => setNewDivCode(e.target.value.toUpperCase())}
                    placeholder="DIVCODE"
                    className={`${inputCls} !w-28 font-mono`}
                  />
                  <input
                    value={newDivName}
                    onChange={(e) => setNewDivName(e.target.value)}
                    placeholder="Division name"
                    className={`${inputCls} !w-64`}
                  />
                  <button
                    onClick={addDivisionFromTable}
                    disabled={busy || !newDivCode.trim() || !newDivName.trim() || !newDivRegion}
                    className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-2.5 font-medium">DIVCODE</th>
                    <th className="px-5 py-2.5 font-medium">DIVNAME</th>
                    <th className="px-5 py-2.5 font-medium">Region</th>
                    <th className="px-5 py-2.5 font-medium">Functions</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {org.divisions.map((d) => {
                    const region = org.regions.find((r) => r.id === d.region_id);
                    const feats = mergeFeatures(d.features);
                    const enabled = Object.values(feats).filter(Boolean).length;
                    return (
                      <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-2.5 font-mono text-xs font-semibold text-deped-700 dark:text-deped-300">{d.division_code}</td>
                        <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200">{d.division_name}</td>
                        <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{region?.region_name ?? '—'}</td>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Power className="w-3 h-3" /> {enabled}/{DIVISION_FEATURE_KEYS.length}
                          </span>
                        </td>
                        <td className="px-5 py-2.5"><StatusBadge status={d.status} /></td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {isSuper && (
                              <>
                                <button onClick={() => { setSelectedDivisionId(d.id); setView('folders'); }} title="Open folder" className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors">
                                  <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setDivisionModal({ regionId: d.region_id, division: d })} title="Edit division" className="p-1.5 rounded-lg text-slate-400 hover:text-deped-600 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteDivision(d)} title="Delete division" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left: regions → division folders */}
          <div className="lg:col-span-1 space-y-3">
            {org.regions.map((region) => {
              const divs = divisionsByRegion[region.id] ?? [];
              const expanded = expandedRegions[region.id] ?? true;
              return (
                <div key={region.id} className="card-base overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-deped-800 to-deped-700 text-white">
                    <button
                      onClick={() => setExpandedRegions((prev) => ({ ...prev, [region.id]: !expanded }))}
                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                    >
                      {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <Globe className="w-4 h-4 shrink-0 text-deped-200" />
                      <span className="font-semibold text-sm truncate">{region.region_name || region.region_code}</span>
                      <span className="text-[10px] text-deped-200 font-mono">{region.region_code}</span>
                      <span className="ml-auto text-[11px] bg-white/15 rounded-full px-2 py-0.5">{divs.length}</span>
                    </button>
                    {isSuper && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => setRegionModal({ region })} className="p-1.5 rounded-lg hover:bg-white/15" title="Edit region">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteRegion(region)} className="p-1.5 rounded-lg hover:bg-white/15 text-red-200" title="Delete region">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {divs.length === 0 && (
                        <div className="px-4 py-3 text-xs text-slate-400">No divisions yet.</div>
                      )}
                      {divs.map((div) => {
                        const st = statsFor(div.id);
                        const active = selectedDivisionId === div.id;
                        return (
                          <button
                            key={div.id}
                            onClick={() => setSelectedDivisionId(div.id)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${active ? 'bg-deped-50 dark:bg-deped-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                          >
                            <FolderOpen className={`w-4 h-4 shrink-0 ${active ? 'text-deped-600 dark:text-deped-400' : 'text-amber-500'}`} />
                            <span className="flex-1 min-w-0">
                              <span className={`block text-sm font-medium truncate ${active ? 'text-deped-800 dark:text-deped-200' : 'text-slate-700 dark:text-slate-200'}`}>
                                {div.division_name || div.division_code}
                              </span>
                              <span className="block text-[10px] text-slate-400 font-mono">{div.division_code} · {st.employees} emp · {st.schools} sch · {st.users} users</span>
                            </span>
                            {active && <Check className="w-4 h-4 text-deped-600 shrink-0" />}
                          </button>
                        );
                      })}
                      {isSuper && (
                        <button
                          onClick={() => setDivisionModal({ regionId: region.id })}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-deped-700 dark:text-deped-300 hover:bg-deped-50 dark:hover:bg-deped-900/30 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add division to {region.region_name || region.region_code}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: division folder detail */}
          <div className="lg:col-span-2">
            {!selectedDivision ? (
              <div className="card-base p-10 text-center">
                <Folder className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">Select a division folder</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                  Pick a division on the left to open its folder: manage its functions, assigned users, schools, and employee mapping.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Folder header */}
                <div className="card-base overflow-hidden">
                  <div className="px-5 py-4 bg-gradient-to-r from-deped-800 via-deped-700 to-deped-600 text-white flex flex-wrap items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-deped-200 uppercase tracking-wider">{selectedRegion?.region_name ?? 'Region'} · {selectedDivision.division_code}</p>
                      <h2 className="text-lg font-bold truncate">{selectedDivision.division_name}</h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSuper && (
                        <>
                          <button onClick={() => setDivisionModal({ regionId: selectedDivision.region_id, division: selectedDivision })} className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-1.5 transition-colors">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => deleteDivision(selectedDivision)} className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
                    <FolderStat icon={Users} label="Assigned Users" value={statsFor(selectedDivision.id).users} />
                    <FolderStat icon={SchoolIcon} label="Schools" value={statsFor(selectedDivision.id).schools} />
                    <FolderStat icon={Wallet} label="Employees" value={statsFor(selectedDivision.id).employees} />
                    <FolderStat icon={CheckCircle2} label="Active Employees" value={statsFor(selectedDivision.id).activeEmployees} color="text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {/* Actions */}
                  <div className="px-5 pb-5 flex flex-wrap gap-2">
                    <button onClick={openDivisionProfile} className="btn-primary text-sm">
                      <Link2 className="w-4 h-4" /> Open Division Profile
                    </button>
                    <button onClick={() => onNavigate('users')} className="btn-secondary text-sm">
                      <UserCog className="w-4 h-4" /> Manage Users
                    </button>
                    {isSuper && (
                      <button onClick={syncEmployees} disabled={busy} className="btn-secondary text-sm">
                        {busy ? <LoadingIndicator size={40} /> : <RefreshCw className="w-4 h-4" />} Map Employees from Schools
                      </button>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="card-base p-5">
                  <h3 className="section-heading text-sm mb-1">Enabled Functions for this Division</h3>
                  <p className="text-xs text-slate-400 mb-3">
                    These features define what this division's users can work with. (Enforcement is wired into the role dashboards and management UI.)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DIVISION_FEATURE_KEYS.map((key) => {
                      const enabled = mergeFeatures(selectedDivision.features)[key] ?? true;
                      return (
                        <button
                          key={key}
                          disabled={!isSuper || featureBusy === key}
                          onClick={() => toggleFeature(key, !enabled)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                            enabled
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                          } ${isSuper ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${enabled ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                            <Power className="w-4 h-4" />
                          </span>
                          <span className={`flex-1 text-left font-medium ${enabled ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-500 dark:text-slate-400'}`}>
                            {DIVISION_FEATURE_LABELS[key] ?? key}
                          </span>
                          {enabled ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-slate-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Users */}
                <div className="card-base overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Assigned Users</h3>
                    <span className="text-xs text-slate-400">{divisionUsers.length} user(s)</span>
                  </div>
                  {divisionUsers.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-slate-400">
                      No users assigned to this division yet. Assign users in User Management.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {divisionUsers.slice(0, 8).map((u) => (
                        <div key={u.id} className="px-5 py-2.5 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{u.first_name} {u.last_name}</p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 shrink-0 ml-3">
                            {ROLE_LABELS[u.role]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Schools assignment */}
                <div className="card-base overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Schools in this Division</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Assign schools to this division — their employees can then be mapped automatically.
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    {assignedSchools.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {assignedSchools.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-deped-50 dark:bg-deped-900/30 border border-deped-100 dark:border-deped-800">
                            <SchoolIcon className="w-4 h-4 text-deped-600 dark:text-deped-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{s.school_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{s.school_code}</p>
                            </div>
                            {isSuper && (
                              <button onClick={() => clearSchool(s)} disabled={busy} className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors" title="Remove from division">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No schools assigned yet.</p>
                    )}

                    {isSuper && (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                        <div className="relative max-w-sm mb-3">
                          <input
                            type="text"
                            value={schoolSearch}
                            onChange={(e) => setSchoolSearch(e.target.value)}
                            placeholder="Search unassigned schools..."
                            className={`${inputCls} pl-8`}
                          />
                          <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                          {unassignedSchools.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-400 text-center">No unassigned schools match.</div>
                          ) : (
                            unassignedSchools.map((s) => (
                              <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={pendingAssign.has(s.id)}
                                  onChange={(e) => {
                                    setPendingAssign((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(s.id); else next.delete(s.id);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-deped-600 focus:ring-deped-500/30"
                                />
                                <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1">{s.school_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{s.school_code}</span>
                              </label>
                            ))
                          )}
                        </div>
                        <button
                          onClick={assignSchools}
                          disabled={pendingAssign.size === 0 || busy}
                          className="mt-3 btn-primary text-sm disabled:opacity-50"
                        >
                          <ArrowRight className="w-4 h-4" /> Assign {pendingAssign.size > 0 ? `${pendingAssign.size} ` : ''}School(s)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Region modal */}
      {regionModal && (
        <RegionModal
          region={regionModal.region}
          busy={busy}
          onCancel={() => setRegionModal(null)}
          onSave={(input) => saveRegion(input, regionModal.region?.id)}
        />
      )}

      {/* Division modal */}
      {divisionModal && (
        <DivisionModal
          regions={org.regions}
          initialRegionId={divisionModal.regionId}
          division={divisionModal.division}
          busy={busy}
          onCancel={() => setDivisionModal(null)}
          onSave={(input) => saveDivision(input, divisionModal.division?.id)}
        />
      )}
    </div>
  );
}

// ── Small components ────────────────────────────────────────────────────────

function FolderStat({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3 text-center">
      <Icon className={`w-5 h-5 mx-auto mb-1 ${color ?? 'text-deped-600 dark:text-deped-400'}`} />
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular">{value}</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function RegionModal({ region, busy, onCancel, onSave }: {
  region?: Region;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { region_code: string; region_name: string; sort_order: number }) => void;
}) {
  const [code, setCode] = useState(region?.region_code ?? '');
  const [name, setName] = useState(region?.region_name ?? '');
  const [sort, setSort] = useState(region?.sort_order ?? 0);
  return (
    <ModalShell title={region ? 'Edit Region' : 'New Region'} onClose={onCancel}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Region Code (REGCODE) <span className="text-rose-500">*</span></label>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. IV-A" />
          <p className="text-[10px] text-slate-400 mt-1">
            Must match the <strong>REGCODE</strong> column in the employee masterfile — it is the regional grouping key used to scope payroll data.
          </p>
        </div>
        <div>
          <label className={labelCls}>Region Name <span className="text-rose-500">*</span></label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Region IV-A CALABARZON" />
        </div>
        <div>
          <label className={labelCls}>Sort Order</label>
          <input type="number" className={inputCls} value={sort} onChange={(e) => setSort(Number(e.target.value) || 0)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button
            onClick={() => onSave({ region_code: code, region_name: name, sort_order: sort })}
            disabled={busy || !code.trim() || !name.trim()}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Saving...' : region ? 'Save Changes' : 'Create Region'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function DivisionModal({ regions, initialRegionId, division, busy, onCancel, onSave }: {
  regions: Region[];
  initialRegionId: string;
  division?: Division;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { region_id: string; division_code: string; division_name: string }) => void;
}) {
  const [regionId, setRegionId] = useState(division?.region_id ?? initialRegionId);
  const [code, setCode] = useState(division?.division_code ?? '');
  const [name, setName] = useState(division?.division_name ?? '');
  return (
    <ModalShell title={division ? 'Edit Division' : 'New Division'} onClose={onCancel}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Region <span className="text-rose-500">*</span></label>
          <select className={inputCls} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.region_name || r.region_code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Division Code (DIVCODE) <span className="text-rose-500">*</span></label>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. CAL-042" />
          <p className="text-[10px] text-slate-400 mt-1">
            Must match the <strong>DIVCODE</strong> column in the employee masterfile. REGCODE + DIVCODE are the unique reference that group one division's payroll (Region → Division → Station).
          </p>
        </div>
        <div>
          <label className={labelCls}>Division Name <span className="text-rose-500">*</span></label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Schools Division Office of Calamba City" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button
            onClick={() => onSave({ region_id: regionId, division_code: code, division_name: name })}
            disabled={busy || !code.trim() || !name.trim() || !regionId}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Saving...' : division ? 'Save Changes' : 'Create Division'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'Active';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${active ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
      {status}
    </span>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-deped-50 dark:bg-deped-900/40 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-deped-600 dark:text-deped-400" />
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
