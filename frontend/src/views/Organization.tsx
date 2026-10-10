import { useState, useEffect, useMemo } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Search, Download, Table2, LayoutGrid, Building2, Users,
  GraduationCap, Briefcase, MapPin, Eye, ChevronRight, X, UserCog, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/pb';
import { useOrg } from '@/lib/org';
import { useAuth } from '@/lib/auth';
import { isSchoolScoped } from '@/lib/authz';
import type { SchoolWithStats, SchoolType } from '@/types/schools';
import SchoolManagement from '@/components/SchoolManagement';
import SHSAssignedSchoolsRoster from '@/components/SHSAssignedSchoolsRoster';

export function ElementarySchools() {
  return (
    <SchoolManagement
      schoolType="Elementary"
      title="Elementary Schools"
      description="Manage all Elementary Schools under the Schools Division Office."
      headerIcon={Building2}
      kpiExtraActivePayroll
    />
  );
}

export function HighSchools() {
  const [activeTab, setActiveTab] = useState<'Junior High School' | 'Senior High School'>('Junior High School');
  const tabs: { key: 'Junior High School' | 'Senior High School'; label: string }[] = [
    { key: 'Junior High School', label: 'Junior High Schools' },
    { key: 'Senior High School', label: 'Senior High Schools' },
  ];
  return (
    <div>
      <div className="mb-6 inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-deped-700 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'Junior High School' ? (
        <SchoolManagement
          schoolType="Junior High School"
          title="Junior High Schools"
          description="Manage all Junior High Schools under the Schools Division Office."
          headerIcon={GraduationCap}
        />
      ) : (
        <div className="space-y-6">
          <SHSAssignedSchoolsRoster />
          <SchoolManagement
            schoolType="Senior High School"
            title="Senior High Schools"
            description="Manage all Senior High Schools under the Schools Division Office."
            headerIcon={GraduationCap}
          />
        </div>
      )}
    </div>
  );
}

export function ImplementingUnits() {
  return (
    <SchoolManagement
      schoolType="Implementing Unit"
      title="Implementing Units"
      description="Manage all Implementing Units under the Division Office."
      headerIcon={Briefcase}
    />
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';

export function SchoolDirectory() {
  const [schools, setSchools] = useState<SchoolWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [drawerSchool, setDrawerSchool] = useState<SchoolWithStats | null>(null);
  // School-scoped roles (School Payroll Coordinator / School Head) may edit
  // the DETAIL fields of their own assigned school: school head, Administrative
  // Officer II, contact details, address, cluster. Code/type/status stay with
  // the division (SchoolManagement) — those change what the school IS, not
  // who to call. Server side, writes are additionally limited to the school
  // matching the caller's STACODE (schoolDetailWriteGuard in main.go).
  const { profile } = useAuth();
  const canEditOwnSchool = isSchoolScoped(profile?.role ?? 'read_only');
  const [editForm, setEditForm] = useState<Partial<SchoolWithStats> | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const { scopedDivisionIds, scopedCodes } = useOrg();
  // School-scoped roles (School Payroll Coordinator / School Head) see only
  // their assigned school in the directory. null = not school-scoped.
  // Mirrors the candidate variants used by the School dashboard.
  const assignedStacode = isSchoolScoped(profile?.role ?? 'read_only')
    ? (profile?.assigned_stacode?.trim() ?? '')
    : null;

  useEffect(() => {
    // No school assigned -> the directory is simply empty for this account.
    if (assignedStacode !== null && assignedStacode === '') { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('query_schools_with_stats', {
        p_school_type: null,
        p_division_ids: scopedDivisionIds,
        p_regcode: scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null,
        p_divcodes: scopedCodes && scopedCodes.length > 0 ? [...new Set(scopedCodes.map((c) => c.divcode))] : null,
      });
      let rows = (data as SchoolWithStats[]) ?? [];
      if (assignedStacode) {
        const candidates = new Set([
          assignedStacode,
          assignedStacode.padStart(3, '0'),
          String(parseInt(assignedStacode, 10) || 0),
        ].filter(Boolean));
        rows = rows.filter(s =>
          candidates.has(String(s.school_code ?? '').trim()) ||
          candidates.has(String((s as { stacode?: string | null }).stacode ?? '').trim()));
      }
      setSchools(rows);
      setLoading(false);
    })();
  }, [scopedDivisionIds, scopedCodes, assignedStacode]);

  const filtered = useMemo(() => {
    let r = schools;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      r = r.filter(s =>
        s.school_code.toLowerCase().includes(q) ||
        s.school_name.toLowerCase().includes(q) ||
        s.school_head.toLowerCase().includes(q)
      );
    }
    if (typeFilter) r = r.filter(s => s.school_type === typeFilter);
    if (statusFilter) r = r.filter(s => s.status === statusFilter);
    return r;
  }, [schools, search, typeFilter, statusFilter]);

  const types: SchoolType[] = ['Elementary', 'Junior High School', 'Senior High School', 'Implementing Unit'];

  // Save the editable detail fields of the coordinator's own school. Only the
  // fields a school may maintain about itself are sent; server-side the write
  // is additionally clamped to the school matching the caller's STACODE.
  async function saveSchoolDetails(id: string, patch: Partial<SchoolWithStats>) {
    setSaving(true);
    setEditError('');
    const payload: Record<string, unknown> = {
      school_head: patch.school_head ?? '',
      admin_officer_ii: patch.admin_officer_ii ?? '',
      contact_number: patch.contact_number ?? '',
      email: patch.email ?? '',
      address: patch.address ?? '',
      cluster: patch.cluster ?? '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('schools').update(payload).eq('id', id);
    if (error) {
      setEditError(error.message);
      setSaving(false);
      return;
    }
    setSchools(prev => prev.map(s => s.id === id ? { ...s, ...payload } as SchoolWithStats : s));
    setDrawerSchool(prev => prev && prev.id === id ? { ...prev, ...payload } as SchoolWithStats : prev);
    setEditForm(null);
    setSaving(false);
  }

  function exportCsv() {
    const headers = ['Code', 'Name', 'Type', 'Cluster', 'School Head', 'Administrative Officer II', 'Employees', 'Teaching', 'Non-Teaching', 'Status'];
    const body = filtered.map(r => [r.school_code, r.school_name, r.school_type, r.cluster, r.school_head, r.admin_officer_ii ?? '', r.total_employees, r.teaching_personnel, r.non_teaching_personnel, r.status].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'school_directory.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </span>
            School Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-13">
            {assignedStacode !== null
              ? assignedStacode === ''
                ? 'No school is assigned to your account yet — contact your system administrator.'
                : 'Your assigned school.'
              : 'Unified searchable directory of all schools and implementing units.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-deped-700 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <Table2 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('card')} className={`px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'card' ? 'bg-deped-700 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={exportCsv} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="enterprise-card p-4 sticky top-16 z-20">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search by School Code, Name, School Head, or Cluster..." value={search} onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-10'} />
          </div>
          <div className="flex gap-3">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputCls + ' min-w-[160px]'}>
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls + ' min-w-[120px]'}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <LoadingIndicator size={32} />
          Loading directory...
        </div>
      ) : filtered.length === 0 ? (
        <div className="enterprise-card py-16 text-center text-slate-400">No schools found.</div>
      ) : viewMode === 'table' ? (
        <div className="enterprise-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Cluster</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">School Head</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Administrative Officer II</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Employees</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} onClick={() => setDrawerSchool(s)} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{s.school_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{s.school_name}</td>
                    <td className="px-4 py-3"><TypeBadge type={s.school_type} /></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.cluster || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.school_head || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.admin_officer_ii || '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700 tabular">{s.total_employees}</td>
                    <td className="px-4 py-3 text-center"><DirStatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={e => { e.stopPropagation(); setDrawerSchool(s); }} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-deped-600 transition-colors"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div key={s.id} className="enterprise-card p-5 hover:shadow-card-hover cursor-pointer transition-all group" onClick={() => setDrawerSchool(s)}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-deped-600 to-deped-800 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {s.school_code}
                </div>
                <DirStatusBadge status={s.status} />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug mb-1">{s.school_name}</h3>
              <TypeBadge type={s.school_type} />
              <div className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {s.cluster || 'No cluster'}</p>
                <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> School Head: {s.school_head || '—'}</p>
                {s.admin_officer_ii && (
                  <p className="flex items-center gap-1.5"><UserCog className="w-3.5 h-3.5" /> Admin Officer II: {s.admin_officer_ii}</p>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-base font-bold text-slate-700 dark:text-slate-200 tabular">{s.total_employees}</p><p className="text-[10px] text-slate-400">Employees</p></div>
                <div><p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular">{s.teaching_personnel}</p><p className="text-[10px] text-slate-400">Teaching</p></div>
                <div><p className="text-base font-bold text-amber-600 dark:text-amber-400 tabular">{s.non_teaching_personnel}</p><p className="text-[10px] text-slate-400">Non-Teach</p></div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={e => { e.stopPropagation(); setDrawerSchool(s); }} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300">View Details</button>
                <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400 hover:bg-deped-100 dark:hover:bg-deped-900/50 transition-colors">View Employees</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {drawerSchool && (
        <DirectoryDrawer
          school={drawerSchool}
          onClose={() => setDrawerSchool(null)}
          canEdit={canEditOwnSchool && assignedStacode !== null && assignedStacode !== ''}
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={saveSchoolDetails}
          saving={saving}
          error={editError}
        />
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'Elementary': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Junior High School': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Senior High School': 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    'Implementing Unit': 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  };
  return <span className={`badge ${colors[type] ?? 'bg-slate-100 text-slate-600'}`}>{type}</span>;
}

function DirStatusBadge({ status }: { status: string }) {
  const active = status === 'Active';
  return (
    <span className={`badge ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-500'}`} />{status}
    </span>
  );
}

function DirectoryDrawer({
  school,
  onClose,
  canEdit,
  editForm,
  setEditForm,
  onSave,
  saving,
  error,
}: {
  school: SchoolWithStats;
  onClose: () => void;
  canEdit: boolean;
  editForm: Partial<SchoolWithStats> | null;
  setEditForm: (v: Partial<SchoolWithStats> | null) => void;
  onSave: (id: string, patch: Partial<SchoolWithStats>) => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const f = editForm ?? school;
  const editing = editForm !== null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full overflow-y-auto shadow-2xl animate-slide-in-right" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-deped-800 to-deped-700 text-white px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{school.school_name}</h3>
                <p className="text-sm text-deped-200">Code: {school.school_code}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-3 flex gap-2"><TypeBadge type={school.school_type} /><DirStatusBadge status={school.status} /></div>
        </div>
        <div className="p-6 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Information</h4>
              {canEdit && !editing && (
                <button
                  onClick={() => setEditForm({
                    school_head: school.school_head ?? '',
                    admin_officer_ii: school.admin_officer_ii ?? '',
                    contact_number: school.contact_number ?? '',
                    email: school.email ?? '',
                    address: school.address ?? '',
                    cluster: school.cluster ?? '',
                  })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400 hover:bg-deped-100 dark:hover:bg-deped-900/50 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit details
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <DirectoryField label="School Head" value={f.school_head ?? ''} onChange={v => setEditForm({ ...f, school_head: v })} />
                <DirectoryField label="Administrative Officer II" value={f.admin_officer_ii ?? ''} onChange={v => setEditForm({ ...f, admin_officer_ii: v })} />
                <DirectoryField label="Contact Number" value={f.contact_number ?? ''} onChange={v => setEditForm({ ...f, contact_number: v })} />
                <DirectoryField label="Email" value={f.email ?? ''} onChange={v => setEditForm({ ...f, email: v })} />
                <DirectoryField label="Address" value={f.address ?? ''} onChange={v => setEditForm({ ...f, address: v })} />
                <DirectoryField label="Cluster" value={f.cluster ?? ''} onChange={v => setEditForm({ ...f, cluster: v })} />
                <p className="text-[11px] text-slate-400">School code, type and status are maintained by the Division Office.</p>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => { setEditForm(null); }} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                  <button
                    onClick={() => onSave(school.id, f)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-deped-700 text-white hover:bg-deped-800 disabled:opacity-60 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>              </div>
            ) : (
            <div className="space-y-2.5 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Cluster</span><span className="text-slate-700 dark:text-slate-200">{school.cluster || '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Address</span><span className="text-slate-700 dark:text-slate-200">{school.address || '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">School Head</span><span className="text-slate-700 dark:text-slate-200">{school.school_head || '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Administrative Officer II</span><span className="text-slate-700 dark:text-slate-200">{school.admin_officer_ii || '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Contact</span><span className="text-slate-700 dark:text-slate-200">{school.contact_number || '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-700 dark:text-slate-200">{school.email || '—'}</span></p>
            </div>
            )}
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Employee Statistics</h4>
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Total" value={school.total_employees} icon={Users} color="text-blue-600" />
              <StatBox label="Teaching" value={school.teaching_personnel} icon={GraduationCap} color="text-emerald-600" />
              <StatBox label="Non-Teaching" value={school.non_teaching_personnel} icon={Briefcase} color="text-amber-600" />
              <StatBox label="Active Payroll" value={school.active_payroll_employees} icon={Users} color="text-violet-600" />
            </div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-sm font-medium text-slate-700 dark:text-slate-200 group">
                <span className="flex items-center gap-2.5"><Users className="w-4 h-4 text-deped-600" /> View Employees</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-deped-500" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-sm font-medium text-slate-700 dark:text-slate-200 group">
                <span className="flex items-center gap-2.5"><Building2 className="w-4 h-4 text-deped-600" /> View Details</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-deped-500" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Users; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/30">
      <Icon className={`w-5 h-5 mb-1.5 ${color}`} />
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function DirectoryField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

