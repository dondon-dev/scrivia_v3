import { useState, useEffect, useCallback, useMemo } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Plus, Search, Pencil, Trash2, X, Download, Printer,
  Building2, Users, GraduationCap, Briefcase, Wallet, MapPin,
  Phone, Mail, ChevronRight, FileBarChart, ArrowUpDown,
  AlertCircle, School as SchoolIcon, FileUp, UserCog,
} from 'lucide-react';
import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { canImportDbf } from '@/lib/authz';
import type { SchoolWithStats, SchoolType } from '@/types/schools';
import SchoolImportModal from '@/components/SchoolImportModal';

interface SchoolForm {
  school_code: string;
  school_name: string;
  school_type: SchoolType;
  cluster: string;
  address: string;
  school_head: string;
  admin_officer_ii: string;
  contact_number: string;
  email: string;
  status: string;
}

const emptyForm = (type: SchoolType): SchoolForm => ({
  school_code: '',
  school_name: '',
  school_type: type,
  cluster: '',
  address: '',
  school_head: '',
  admin_officer_ii: '',
  contact_number: '',
  email: '',
  status: 'Active',
});

type SortKey = 'school_code' | 'school_name' | 'total_employees' | 'teaching_personnel' | 'non_teaching_personnel' | 'cluster';
type SortDir = 'asc' | 'desc';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: typeof Users;
  accent: string;
}

function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="kpi-card group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

interface StatusBadgeProps { status: string }
function StatusBadge({ status }: StatusBadgeProps) {
  const active = status === 'Active';
  return (
    <span className={`badge ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {status}
    </span>
  );
}

function exportCsv(rows: SchoolWithStats[], filename: string) {
  const headers = ['Code', 'Name', 'Type', 'Cluster', 'School Head', 'Administrative Officer II', 'Total Employees', 'Teaching', 'Non-Teaching', 'Active Payroll', 'Status'];
  const body = rows.map(r => [
    r.school_code, r.school_name, r.school_type, r.cluster, r.school_head, r.admin_officer_ii ?? '',
    r.total_employees, r.teaching_personnel, r.non_teaching_personnel,
    r.active_payroll_employees, r.status,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Merge back schools that have no division yet.
 *
 * The Organization lists are read through `query_schools_with_stats`, which
 * filters `division_id` by the active org scope. A school saved without a
 * division_id therefore exists in the database but is invisible from ANY
 * scoped view — the classic "I added it but it never shows up" report.
 * The rest of the app already treats rows without a division as shared
 * (see `matchesScopeOrGlobal`), so unscoped schools are always merged in and
 * flagged, and can then be assigned in Regions & Divisions.
 */
async function mergeUnscopedSchools(rows: SchoolWithStats[], types: SchoolType[]): Promise<SchoolWithStats[]> {
  let unscoped: SchoolWithStats[] = [];
  try {
    unscoped = await fetchAll<SchoolWithStats>('schools', "division_id = ''", 'school_name');
  } catch { return rows; }
  const known = new Set(rows.map((s) => s.id));
  let extra = unscoped.filter((s) => !known.has(s.id));
  if (types.length > 0) extra = extra.filter((s) => types.includes(s.school_type as SchoolType));
  if (extra.length === 0) return rows;
  // Employee counts are keyed by STACODE (= school_code). The stats RPC does the
  // same GROUP BY server-side, so mirror it for the merged rows.
  const codes = [...new Set(extra
    .flatMap((s) => [s.school_code, s.stacode])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean))];
  const counts = new Map<string, number>();
  try {
    const emps = codes.length > 0
      ? await chunkedIn<{ stacode: string }>('stacode', codes, (chunk) =>
          supabase.from('employees').select('stacode').in('stacode', chunk))
      : [];
    for (const e of emps) {
      const k = String(e.stacode ?? '').trim();
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  } catch { /* counts are best-effort */ }
  return [
    ...rows,
    ...extra.map((s) => {
      const total = counts.get(String(s.school_code ?? '').trim()) ?? counts.get(String(s.stacode ?? '').trim()) ?? 0;
      return {
        ...s,
        total_employees: total,
        teaching_personnel: 0,
        non_teaching_personnel: total,
        active_payroll_employees: 0,
        unscoped: true,
      };
    }),
  ];
}

interface SchoolManagementProps {
  schoolType?: SchoolType;
  schoolTypes?: SchoolType[];
  title: string;
  description: string;
  headerIcon: typeof SchoolIcon;
  kpiExtraActivePayroll?: boolean;
}

export default function SchoolManagement({
  schoolType,
  schoolTypes,
  title,
  description,
  headerIcon: HeaderIcon,
  kpiExtraActivePayroll = false,
}: SchoolManagementProps) {
  const effectiveTypes = useMemo(() => schoolTypes ?? (schoolType ? [schoolType] : []), [schoolTypes, schoolType]);
  const [schools, setSchools] = useState<SchoolWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('school_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SchoolWithStats | null>(null);
  const [form, setForm] = useState<SchoolForm>(emptyForm(effectiveTypes[0] ?? 'Elementary'));
  const [saving, setSaving] = useState(false);
  const [drawerSchool, setDrawerSchool] = useState<SchoolWithStats | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { profile } = useAuth();
  const canImport = canImportDbf(profile?.role ?? 'read_only');
  const { scopedDivisionIds, scopedCodes, selectedDivision, selectedRegion } = useOrg();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // When multiple school types are requested, pass null to the RPC and
    // filter client-side; for a single type the RPC can do it server-side.
    const rpcType = effectiveTypes.length === 1 ? effectiveTypes[0] : null;
    const { data, error: rpcError } = await supabase.rpc('query_schools_with_stats', {
      p_school_type: rpcType,
      p_division_ids: scopedDivisionIds,
      p_regcode: scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null,
      p_divcodes: scopedCodes && scopedCodes.length > 0 ? [...new Set(scopedCodes.map((c) => c.divcode))] : null,
    });
    if (!rpcError && data) {
      let rows = (data as SchoolWithStats[]) ?? [];
      if (effectiveTypes.length > 1) rows = rows.filter((s) => effectiveTypes.includes(s.school_type as SchoolType));
      // The RPC is division-scoped, so schools saved without a division_id would
      // never show up here — merge them back in (flagged as "No division").
      rows = await mergeUnscopedSchools(rows, effectiveTypes);
      setSchools(rows);
    } else {
      // Fallback: read directly from the schools collection when the RPC is unavailable
      const rows = await fetchAll<SchoolWithStats>(() =>
        supabase.from('schools').select('*'),
      );
      const filtered = effectiveTypes.length > 0
        ? rows.filter((s) => effectiveTypes.includes(s.school_type as SchoolType))
        : rows;
      setSchools(filtered.map((s) => ({
        ...s,
        total_employees: 0,
        teaching_personnel: 0,
        non_teaching_personnel: 0,
        active_payroll_employees: 0,
      })));
    }
    setLoading(false);
  }, [effectiveTypes, scopedDivisionIds, scopedCodes]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, clusterFilter, statusFilter]);

  const clusters = useMemo(() => {
    const set = new Set<string>();
    schools.forEach(s => { if (s.cluster) set.add(s.cluster); });
    return Array.from(set).sort();
  }, [schools]);

  const filtered = useMemo(() => {
    let r = schools;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      r = r.filter(s =>
        s.school_code.toLowerCase().includes(q) ||
        s.school_name.toLowerCase().includes(q)
      );
    }
    if (clusterFilter) r = r.filter(s => s.cluster === clusterFilter);
    if (statusFilter) r = r.filter(s => s.status === statusFilter);
    r = [...r].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [schools, search, clusterFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // KPI aggregates
  const kpis = useMemo(() => {
    return {
      totalSchools: schools.length,
      totalEmployees: schools.reduce((s, r) => s + r.total_employees, 0),
      teaching: schools.reduce((s, r) => s + r.teaching_personnel, 0),
      nonTeaching: schools.reduce((s, r) => s + r.non_teaching_personnel, 0),
      activePayroll: schools.reduce((s, r) => s + r.active_payroll_employees, 0),
    };
  }, [schools]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm(effectiveTypes[0] ?? 'Elementary'));
    setShowModal(true);
  }
  function openEdit(s: SchoolWithStats) {
    setEditing(s);
    setForm({
      school_code: s.school_code,
      school_name: s.school_name,
      school_type: s.school_type,
      cluster: s.cluster,
      address: s.address,
      school_head: s.school_head,
      admin_officer_ii: s.admin_officer_ii ?? '',
      contact_number: s.contact_number,
      email: s.email,
      status: s.status,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.school_code.trim() || !form.school_name.trim()) {
      setError('School Code and School Name are required');
      return;
    }
    setSaving(true);
    setError('');
    // Stamp the school into the uploader's division (carrying its region) and
    // give it a STACODE. The Organization lists come from a DIVISION-scoped RPC
    // and payroll/PAL match employees by STACODE, so a school saved without
    // either exists in the database yet never appears in the UI.
    const division_id = selectedDivision?.id ?? scopedDivisionIds?.[0] ?? editing?.division_id ?? '';
    const region_id = selectedRegion?.id ?? selectedDivision?.region_id ?? editing?.region_id ?? '';
    const activeScope = scopedCodes?.length === 1
      ? scopedCodes[0]
      : selectedDivision?.division_code && selectedRegion?.region_code
        ? { regcode: selectedRegion.region_code, divcode: selectedDivision.division_code }
        : null;
    const payload = {
      ...form,
      school_code: form.school_code.trim(),
      school_name: form.school_name.trim(),
      stacode: editing?.stacode || form.school_code.trim(),
      ...(division_id ? { division_id } : {}),
      ...(region_id ? { region_id } : {}),
      // A school added while one division is selected belongs to that same
      // REGCODE/DIVCODE scope, which keeps it visible to all code-scoped views.
      ...(activeScope ? { regcode: activeScope.regcode, divcode: activeScope.divcode } : {}),
    };
    if (editing) {
      const { error: e } = await supabase.from('schools').update(payload).eq('id', editing.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from('schools').insert(payload);
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function handleDelete(s: SchoolWithStats) {
    if (!confirm(`Delete ${s.school_name}? This will not affect employee records.`)) return;
    const { error: e } = await supabase.from('schools').delete().eq('id', s.id);
    if (e) { setError(e.message); return; }
    load();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              <HeaderIcon className="w-5 h-5" />
            </span>
            {title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-13">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add School
          </button>
          {canImport && (
            <button onClick={() => setShowImport(true)} className="btn-secondary">
              <FileUp className="w-4 h-4" /> Import
            </button>
          )}
          <button onClick={() => exportCsv(filtered, `${title.replace(/\s+/g, '_').toLowerCase()}.csv`)} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-4 ${kpiExtraActivePayroll ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <KpiCard label={schoolType === 'Implementing Unit' ? 'Total Units' : 'Total Schools'} value={kpis.totalSchools} icon={Building2} accent="bg-deped-50 text-deped-700 dark:bg-deped-900/30 dark:text-deped-400" />
        <KpiCard label="Total Employees" value={kpis.totalEmployees} icon={Users} accent="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
        <KpiCard label="Teaching Personnel" value={kpis.teaching} icon={GraduationCap} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <KpiCard label="Non-Teaching" value={kpis.nonTeaching} icon={Briefcase} accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
        {kpiExtraActivePayroll && (
          <KpiCard label="Active Payroll" value={kpis.activePayroll} icon={Wallet} accent="bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" />
        )}
      </div>

      {/* Search + Filters (sticky) */}
      <div className="enterprise-card p-4 sticky top-16 z-20">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by School Code or School Name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={inputCls + ' pl-10'}
            />
          </div>
          <div className="flex gap-3">
            <select value={clusterFilter} onChange={e => setClusterFilter(e.target.value)} className={inputCls + ' min-w-[140px]'}>
              <option value="">All Clusters</option>
              {clusters.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls + ' min-w-[120px]'}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Data Table */}
      <div className="enterprise-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Th label="Code" sortKey="school_code" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="Name" sortKey="school_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="Cluster" sortKey="cluster" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="School Head" />
                <Th label="Administrative Officer II" />
                <Th label="Employees" sortKey="total_employees" current={sortKey} dir={sortDir} onSort={toggleSort} center />
                <Th label="Teaching" sortKey="teaching_personnel" current={sortKey} dir={sortDir} onSort={toggleSort} center />
                <Th label="Non-Teach" sortKey="non_teaching_personnel" current={sortKey} dir={sortDir} onSort={toggleSort} center />
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  <div className="inline-flex items-center gap-2">
                    <LoadingIndicator size={40} />
                    Loading...
                  </div>
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  No {schoolType === 'Implementing Unit' ? 'units' : 'schools'} found.
                </td></tr>
              ) : pageRows.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setDrawerSchool(s)}
                  className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{s.school_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {s.school_name}
                    {s.unscoped && (
                      <span
                        title="Not assigned to a division yet — assign it in Regions & Divisions so it appears in division-scoped views."
                        className="ml-2 align-middle inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      >
                        <AlertCircle className="w-3 h-3" /> No division
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.cluster || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.school_head || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.admin_officer_ii || '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 tabular">{s.total_employees}</td>
                  <td className="px-4 py-3 text-center text-emerald-700 dark:text-emerald-400 tabular">{s.teaching_personnel}</td>
                  <td className="px-4 py-3 text-center text-amber-700 dark:text-amber-400 tabular">{s.non_teaching_personnel}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-deped-600 transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-500 hover:text-rose-600 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Prev</button>
              <span className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 tabular">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {editing ? 'Edit School' : 'Add School'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="School Code" required>
                  <input type="text" value={form.school_code} disabled={!!editing} onChange={e => setForm({ ...form, school_code: e.target.value })} className={inputCls + (editing ? ' opacity-60' : '')} placeholder="e.g. 101" />
                </FormField>
                <FormField label="Cluster">
                  <input type="text" value={form.cluster} onChange={e => setForm({ ...form, cluster: e.target.value })} className={inputCls} placeholder="e.g. Cluster I" />
                </FormField>
              </div>
              <FormField label="School Name" required>
                <input type="text" value={form.school_name} onChange={e => setForm({ ...form, school_name: e.target.value })} className={inputCls} placeholder="e.g. Calamba Elementary School" />
              </FormField>
              <FormField label="Address">
                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} placeholder="Barangay, Municipality" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="School Head">
                  <input type="text" value={form.school_head} onChange={e => setForm({ ...form, school_head: e.target.value })} className={inputCls} placeholder="Principal name" />
                </FormField>
                <FormField label="Contact Number">
                  <input type="text" value={form.contact_number} onChange={e => setForm({ ...form, contact_number: e.target.value })} className={inputCls} placeholder="09xx-xxx-xxxx" />
                </FormField>
              </div>
              <FormField label="Administrative Officer II">
                <input type="text" value={form.admin_officer_ii} onChange={e => setForm({ ...form, admin_officer_ii: e.target.value })} className={inputCls} placeholder="Administrative Officer II name" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Email">
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="school@deped.ph" />
                </FormField>
                <FormField label="Status">
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </FormField>
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add School'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organizational Hierarchy */}
      <SchoolHierarchy title={title} headerIcon={HeaderIcon} schools={schools} loading={loading} />

      {/* School Profile Drawer */}
      {drawerSchool && (
        <SchoolDrawer school={drawerSchool} onClose={() => setDrawerSchool(null)} />
      )}

      {/* Import Modal */}
      <SchoolImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        schoolType={effectiveTypes[0] ?? 'Elementary'}
        onImported={load}
      />
    </div>
  );
}

function SchoolHierarchy({ title, headerIcon: Icon, schools, loading }: {
  title: string;
  headerIcon: typeof SchoolIcon;
  schools: SchoolWithStats[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalEmp = schools.reduce((s, r) => s + r.total_employees, 0);

  return (
    <div className="enterprise-card overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400 flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Organizational Hierarchy — {title}</span>
          <span className="text-xs text-slate-400">({schools.length} · {totalEmp} employees)</span>
        </span>
        <span className="text-slate-400 text-sm">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="p-5">
          {loading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading hierarchy...</p>
          ) : schools.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No schools to display.</p>
          ) : (
            <div className="space-y-0.5">
              {schools.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-deped-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{s.school_name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{s.school_code}</span>
                  <span className="ml-auto text-xs text-slate-400 tabular">{s.total_employees} emp</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ label, sortKey, current, dir, onSort, center }: {
  label: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: SortDir;
  onSort?: (k: SortKey) => void;
  center?: boolean;
}) {
  if (!sortKey || !onSort) {
    return <th className={`px-4 py-3 ${center ? 'text-center' : 'text-left'} text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>{label}</th>;
  }
  const active = current === sortKey;
  return (
    <th className={`px-4 py-3 ${center ? 'text-center' : 'text-left'} text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>
      <button onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-deped-600' : 'opacity-40'}`} />
        {active && <span className="text-[10px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function SchoolDrawer({ school, onClose }: { school: SchoolWithStats; onClose: () => void }) {
  const stats = [
    { label: 'Total Employees', value: school.total_employees, icon: Users, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Teaching Personnel', value: school.teaching_personnel, icon: GraduationCap, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Non-Teaching', value: school.non_teaching_personnel, icon: Briefcase, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Active Payroll', value: school.active_payroll_employees, icon: Wallet, color: 'text-violet-600 dark:text-violet-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full overflow-y-auto shadow-2xl animate-slide-in-right" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-deped-800 to-deped-700 text-white px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{school.school_name}</h3>
                <p className="text-sm text-deped-200">Code: {school.school_code} · {school.school_type}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-3"><StatusBadge status={school.status} /></div>
        </div>

        <div className="p-6 space-y-6">
          {/* School Information */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">School Information</h4>
            <div className="space-y-2.5">
              <InfoRow icon={MapPin} label="Cluster" value={school.cluster || '—'} />
              <InfoRow icon={Building2} label="Address" value={school.address || '—'} />
              <InfoRow icon={Users} label="School Head" value={school.school_head || '—'} />
              <InfoRow icon={UserCog} label="Administrative Officer II" value={school.admin_officer_ii || '—'} />
              <InfoRow icon={Phone} label="Contact" value={school.contact_number || '—'} />
              <InfoRow icon={Mail} label="Email" value={school.email || '—'} />
            </div>
          </section>

          {/* Employee Statistics */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Employee Statistics</h4>
            <div className="grid grid-cols-2 gap-3">
              {stats.map(s => (
                <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/30">
                  <s.icon className={`w-5 h-5 mb-1.5 ${s.color}`} />
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular">{s.value}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <DrawerAction icon={Users} label="View Employees" />
              <DrawerAction icon={Wallet} label="View Payroll" />
              <DrawerAction icon={FileBarChart} label="View Reports" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}

function DrawerAction({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-deped-300 dark:hover:border-deped-700 transition-all text-sm font-medium text-slate-700 dark:text-slate-200 group">
      <span className="flex items-center gap-2.5"><Icon className="w-4 h-4 text-deped-600 dark:text-deped-400" /> {label}</span>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-deped-500 transition-colors" />
    </button>
  );
}
