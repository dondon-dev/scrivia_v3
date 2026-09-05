import { useState, useEffect, useRef } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Building2, MapPin, Phone, Mail, Globe, Hash, FileText, Calendar,
  Pencil, Save, X, Upload, Printer, Download, Image as ImageIcon,
  User, Users, GraduationCap, Briefcase, Wallet, ShieldCheck,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Award,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { useOrg } from '@/lib/org';
import type { UserRole } from '@/types/auth';

interface DivisionOfficeRow {
  id: string;
  division_id: string | null;
  division_name: string;
  region: string;
  division_code: string;
  address: string;
  zip_code: string;
  contact_number: string;
  official_email: string;
  website: string;
  tin_number: string;
  agency_code: string;
  uacs_code: string;
  sds_name: string;
  sds_position: string;
  sds_email: string;
  sds_contact: string;
  sds_signature: string;
  sds_effective_date: string | null;
  asds_name: string;
  asds_position: string;
  asds_email: string;
  asds_contact: string;
  asds_signature: string;
  asds_effective_date: string | null;
  hrmo_name: string;
  hrmo_position: string;
  hrmo_contact: string;
  hrmo_email: string;
  hrmo_signature: string;
  payroll_officer_name: string;
  payroll_officer_position: string;
  payroll_officer_contact: string;
  payroll_officer_email: string;
  payroll_officer_signature: string;
  division_logo: string;
  show_division_logo: boolean;
  show_deped_logo: boolean;
  show_sds_name: boolean;
  show_payroll_signature: boolean;
  show_hrmo_signature: boolean;
  show_address: boolean;
  show_tin: boolean;
  updated_at: string;
}

const EMPTY_ROW: DivisionOfficeRow = {
  id: '', division_id: null, division_name: '', region: '', division_code: '', address: '',
  zip_code: '', contact_number: '', official_email: '', website: '',
  tin_number: '', agency_code: '', uacs_code: '',
  sds_name: '', sds_position: '', sds_email: '', sds_contact: '', sds_signature: '', sds_effective_date: null,
  asds_name: '', asds_position: '', asds_email: '', asds_contact: '', asds_signature: '', asds_effective_date: null,
  hrmo_name: '', hrmo_position: '', hrmo_contact: '', hrmo_email: '', hrmo_signature: '',
  payroll_officer_name: '', payroll_officer_position: '', payroll_officer_contact: '', payroll_officer_email: '', payroll_officer_signature: '',
  division_logo: '',
  show_division_logo: true, show_deped_logo: true, show_sds_name: true,
  show_payroll_signature: true, show_hrmo_signature: true, show_address: true, show_tin: true,
  updated_at: '',
};

interface OrgStats {
  totalElementary: number;
  totalHighSchool: number;
  totalUnits: number;
  totalEmployees: number;
  teachingPersonnel: number;
  nonTeachingPersonnel: number;
  activePayrolls: number;
  totalUsers: number;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';
const labelCls = 'block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5';

type EditLevel = 'none' | 'full' | 'hr';
function canEdit(role: UserRole): EditLevel {
  if (isSuperAdminRole(role)) return 'full';
  if (role === 'payroll_admin') return 'full';
  if (role === 'hr_administrator') return 'hr';
  return 'none';
}

export default function DivisionOffice() {
  const { profile } = useAuth();
  const { divisionId, selectedDivision, scoped, scopedCodes } = useOrg();
  const [row, setRow] = useState<DivisionOfficeRow>(EMPTY_ROW);
  const [draft, setDraft] = useState<DivisionOfficeRow>(EMPTY_ROW);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'officials' | 'settings' | 'preview'>('profile');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const sigTargetRef = useRef<'sds' | 'asds' | 'hrmo' | 'payroll' | null>(null);

  const editLevel = canEdit(profile?.role ?? 'read_only');
  const isSuper = isSuperAdminRole(profile?.role);
  // Payroll admins / HR admins can only manage their own division's profile.
  const ownsDivision = isSuper || (profile?.division_id != null && divisionId === profile.division_id);
  const canEditAll = editLevel === 'full' && ownsDivision;
  const canEditHr = (editLevel === 'full' || editLevel === 'hr') && ownsDivision;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(''); setSuccess('');
      // Load the profile for the selected division — or the legacy global row
      // (division_id NULL) when no specific division is selected.
      let query = supabase.from('division_office').select('*');
      query = divisionId
        ? query.eq('division_id', divisionId)
        : query.is('division_id', null);
      const { data, error: e } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (!active) return;
      if (e) { setError(e.message); setLoading(false); return; }
      if (data) {
        setRow(data as DivisionOfficeRow);
        setDraft(data as DivisionOfficeRow);
      } else {
        // Seed an empty row for this division so updates can target it
        const seed: { division_name: string; division_id: string | null } = {
          division_name: selectedDivision?.division_name ?? '',
          division_id: divisionId ?? null,
        };
        const { data: inserted, error: ie } = await supabase
          .from('division_office')
          .insert(seed)
          .select('*')
          .single();
        if (ie) { setError(ie.message); setLoading(false); return; }
        setRow(inserted as DivisionOfficeRow);
        setDraft(inserted as DivisionOfficeRow);
      }
      setLoading(false);

      // Org stats — scoped to the selected division when one is active.
      const divisionSchoolIds = new Set<string>();
      if (divisionId) {
        const { data: divSchools } = await supabase
          .from('schools')
          .select('id')
          .eq('division_id', divisionId);
        (divSchools ?? []).forEach((s) => divisionSchoolIds.add((s as { id: string }).id));
      }
      const scopedFilter = (rows: unknown[]) =>
        divisionSchoolIds.size
          ? rows.filter((r) => divisionSchoolIds.has((r as { id: string }).id))
          : rows;

      const scopeCodes = scopedCodes && scopedCodes.length > 0 ? scopedCodes : null;
      const scopeRpc = {
        p_division_ids: null as string[] | null,
        p_regcode: scopeCodes ? scopeCodes[0].regcode : null,
        p_divcodes: scopeCodes ? [...new Set(scopeCodes.map((c) => c.divcode))] : null,
      };
      // Only this division's open/draft payroll periods count — another
      // division's open period must never block or inflate this one.
      let payPeriodsQuery = supabase.from('pay_periods').select('id, status').in('status', ['open', 'draft']);
      if (scopeCodes && scopeCodes.length > 0) {
        const regs = [...new Set(scopeCodes.map((c) => c.regcode))];
        const divs = [...new Set(scopeCodes.map((c) => c.divcode))];
        payPeriodsQuery = payPeriodsQuery.in('regcode', regs).in('divcode', divs);
      }
      const [el, hs, units, allSchools, payPeriods, users] = await Promise.all([
        supabase.rpc('query_schools_with_stats', { p_school_type: 'Elementary', ...scopeRpc }),
        supabase.rpc('query_schools_with_stats', { p_school_type: 'Junior High School', ...scopeRpc }),
        supabase.rpc('query_schools_with_stats', { p_school_type: 'Implementing Unit', ...scopeRpc }),
        supabase.rpc('query_schools_with_stats', { p_school_type: null, ...scopeRpc }),
        payPeriodsQuery,
        divisionId
          ? supabase.from('profiles').select('status', { count: 'exact', head: false }).eq('division_id', divisionId)
          : supabase.from('profiles').select('status', { count: 'exact', head: false }),
      ]);
      if (!active) return;
      type SchoolStatRow = {
        id: string;
        total_employees: number; teaching_personnel: number;
        non_teaching_personnel: number; active_payroll_employees: number;
      };
      const schoolRows = scopedFilter(allSchools.data ?? []) as SchoolStatRow[];
      const sumKey = (rows: SchoolStatRow[], key: keyof SchoolStatRow) =>
        rows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
      setStats({
        totalElementary: scopedFilter(el.data ?? []).length,
        totalHighSchool: scopedFilter(hs.data ?? []).length,
        totalUnits: scopedFilter(units.data ?? []).length,
        totalEmployees: sumKey(schoolRows, 'total_employees'),
        teachingPersonnel: sumKey(schoolRows, 'teaching_personnel'),
        nonTeachingPersonnel: sumKey(schoolRows, 'non_teaching_personnel'),
        activePayrolls: (payPeriods.data as unknown[])?.length ?? 0,
        totalUsers: (users.data as unknown[])?.length ?? 0,
      });
    })();
    return () => { active = false; };
  }, [divisionId, selectedDivision?.division_name, scopedCodes]);

  function startEdit() {
    setDraft({ ...row });
    setEditing(true);
    setError(''); setSuccess('');
  }
  function cancelEdit() {
    setEditing(false);
    setDraft({ ...row });
  }

  async function save() {
    if (!draft.division_name.trim()) { setError('Division Name is required.'); return; }
    setSaving(true); setError(''); setSuccess('');
    const { data, error: e } = await supabase
      .from('division_office')
      .update(draft)
      .eq('id', row.id)
      .select('*')
      .single();
    setSaving(false);
    if (e) { setError(e.message); return; }
    setRow(data as DivisionOfficeRow);
    setDraft(data as DivisionOfficeRow);
    setEditing(false);
    setSuccess('Division profile updated successfully.');
    setTimeout(() => setSuccess(''), 3500);
  }

  function set<K extends keyof DivisionOfficeRow>(key: K, value: DivisionOfficeRow[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { setError('File too large (max 2MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (sigTargetRef.current) {
        const key = `${sigTargetRef.current}_signature` as keyof DivisionOfficeRow;
        setDraft(prev => ({ ...prev, [key]: dataUrl }));
        sigTargetRef.current = null;
      } else {
        setDraft(prev => ({ ...prev, division_logo: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function triggerLogoUpload() {
    sigTargetRef.current = null;
    logoInputRef.current?.click();
  }
  function triggerSigUpload(target: 'sds' | 'asds' | 'hrmo' | 'payroll') {
    sigTargetRef.current = target;
    sigInputRef.current?.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        <LoadingIndicator size={32} />
        Loading Division Office...
      </div>
    );
  }

  const display = editing ? draft : row;
  const isReadOnly = editLevel === 'none';

  return (
    <div className="space-y-6 animate-fade-in">
      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileSelect} />
      <input ref={sigInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileSelect} />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </span>
            Division Office
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-13">
            {scoped && selectedDivision
              ? `Profile for ${selectedDivision.division_name} — used across all payroll modules, reports, and remittances.`
              : 'Master organizational profile used across all payroll modules, reports, and remittances.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="btn-secondary">
                <X className="w-4 h-4" /> Cancel
              </button>
              <button onClick={save} disabled={saving} className="btn-primary">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              {!isReadOnly && (
                <button onClick={startEdit} className="btn-primary">
                  <Pencil className="w-4 h-4" /> Edit Division Profile
                </button>
              )}
              <button onClick={() => window.print()} className="btn-secondary">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={exportProfilePdf} className="btn-secondary">
                <Download className="w-4 h-4" /> Export PDF
              </button>
            </>
          )}
        </div>
      </div>

      {(error || success) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
          error ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
        }`}>
          {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {error || success}
        </div>
      )}

      {/* Org Statistics */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Elementary" value={stats.totalElementary} icon={Building2} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="High Schools" value={stats.totalHighSchool} icon={GraduationCap} color="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Units" value={stats.totalUnits} icon={Briefcase} color="text-amber-600 dark:text-amber-400" />
          <StatCard label="Employees" value={stats.totalEmployees} icon={Users} color="text-cyan-600 dark:text-cyan-400" />
          <StatCard label="Teaching" value={stats.teachingPersonnel} icon={GraduationCap} color="text-teal-600 dark:text-teal-400" />
          <StatCard label="Non-Teaching" value={stats.nonTeachingPersonnel} icon={Briefcase} color="text-violet-600 dark:text-violet-400" />
          <StatCard label="Active Payrolls" value={stats.activePayrolls} icon={Wallet} color="text-deped-600 dark:text-deped-400" />
          <StatCard label="Users" value={stats.totalUsers} icon={User} color="text-rose-600 dark:text-rose-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {([
          ['profile', 'Division Profile', FileText],
          ['officials', 'Division Officials', User],
          ['settings', 'Document Settings', ShieldCheck],
          ['preview', 'Live Preview', Building2],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'border-deped-600 text-deped-700 dark:text-deped-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <ProfileTab display={display} editing={editing} canEdit={canEditAll} set={set} onUploadLogo={triggerLogoUpload} />
      )}
      {activeTab === 'officials' && (
        <OfficialsTab display={display} editing={editing} canEdit={canEditAll || canEditHr} hrOnly={!canEditAll && canEditHr} set={set} onUploadSig={triggerSigUpload} />
      )}
      {activeTab === 'settings' && (
        <SettingsTab display={display} editing={editing} canEdit={canEditAll} set={set} />
      )}
      {activeTab === 'preview' && (
        <PreviewTab display={display} />
      )}

      {/* Sticky action bar */}
      {!editing && !isReadOnly && (
        <div className="sticky bottom-4 z-20 flex items-center gap-2 flex-wrap p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <button onClick={startEdit} className="btn-primary text-sm">
            <Pencil className="w-4 h-4" /> Edit Profile
          </button>
          <button onClick={triggerLogoUpload} className="btn-secondary text-sm" disabled={!canEditAll}>
            <ImageIcon className="w-4 h-4" /> Upload Division Logo
          </button>
          <button onClick={() => triggerSigUpload('sds')} className="btn-secondary text-sm" disabled={!canEditAll}>
            <Upload className="w-4 h-4" /> SDS Signature
          </button>
          <button onClick={() => triggerSigUpload('hrmo')} className="btn-secondary text-sm" disabled={!canEditHr}>
            <Upload className="w-4 h-4" /> HRMO Signature
          </button>
          <button onClick={() => triggerSigUpload('payroll')} className="btn-secondary text-sm" disabled={!canEditAll}>
            <Upload className="w-4 h-4" /> Payroll Officer Signature
          </button>
          <span className="ml-auto text-xs text-slate-400">
            Last updated: {display.updated_at ? new Date(display.updated_at).toLocaleDateString() : '—'}
          </span>
        </div>
      )}
    </div>
  );

  function exportProfilePdf() {
    window.print();
  }
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Users; color: string }) {
  return (
    <div className="enterprise-card p-3 flex flex-col items-center text-center">
      <Icon className={`w-5 h-5 mb-1.5 ${color}`} />
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular">{value}</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
    </div>
  );
}

interface TabProps {
  display: DivisionOfficeRow;
  editing: boolean;
  canEdit: boolean;
  set: <K extends keyof DivisionOfficeRow>(key: K, value: DivisionOfficeRow[K]) => void;
}

function ProfileTab({ display, editing, canEdit, set, onUploadLogo }: TabProps & { onUploadLogo: () => void }) {
  const [logoOpen, setLogoOpen] = useState(true);
  return (
    <div className="space-y-6">
      {/* Logo + Identity Card */}
      <div className="enterprise-card overflow-hidden">
        <CollapsibleHeader title="Division Identity" icon={Building2} open={logoOpen} onToggle={() => setLogoOpen(!logoOpen)} />
        {logoOpen && (
          <div className="p-5 flex flex-col sm:flex-row gap-5 items-start">
            <div className="flex flex-col items-center gap-3">
              <div className="w-28 h-28 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                {display.division_logo ? (
                  <img src={display.division_logo} alt="Division Logo" className="w-full h-full object-contain" />
                ) : (
                  <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                )}
              </div>
              {editing && canEdit && (
                <button onClick={onUploadLogo} className="text-xs text-deped-700 dark:text-deped-300 hover:underline flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> Upload Logo
                </button>
              )}
            </div>
            <div className="flex-1 w-full">
              <p className="text-xs text-slate-400 mb-1">Division Name</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{display.division_name || '—'}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{display.region || '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Code: <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{display.division_code || '—'}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Profile Fields */}
      <div className="enterprise-card p-5">
        <h3 className="section-heading text-sm mb-4">Division Profile Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Division Name" required icon={Building2}>
            {editing && canEdit ? (
              <input type="text" value={display.division_name} onChange={e => set('division_name', e.target.value)} className={inputCls} placeholder="Schools Division Office of Calamba City" />
            ) : <FieldValue value={display.division_name} />}
          </Field>
          <Field label="Region" icon={MapPin}>
            {editing && canEdit ? (
              <input type="text" value={display.region} onChange={e => set('region', e.target.value)} className={inputCls} placeholder="Region IV-A CALABARZON" />
            ) : <FieldValue value={display.region} />}
          </Field>
          <Field label="Division Code" icon={Hash}>
            {editing && canEdit ? (
              <input type="text" value={display.division_code} onChange={e => set('division_code', e.target.value)} className={inputCls} placeholder="043" />
            ) : <FieldValue value={display.division_code} />}
          </Field>
          <Field label="TIN Number" required icon={FileText}>
            {editing && canEdit ? (
              <input type="text" value={display.tin_number} onChange={e => set('tin_number', e.target.value)} className={inputCls} placeholder="000-000-000-000" />
            ) : <FieldValue value={display.tin_number} />}
          </Field>
          <Field label="Office Address" required icon={MapPin}>
            {editing && canEdit ? (
              <textarea value={display.address} onChange={e => set('address', e.target.value)} className={inputCls} rows={2} placeholder="Chipeco Avenue Extension, Brgy. Real, Calamba City, Laguna" />
            ) : <FieldValue value={display.address} />}
          </Field>
          <Field label="ZIP Code" icon={Hash}>
            {editing && canEdit ? (
              <input type="text" value={display.zip_code} onChange={e => set('zip_code', e.target.value)} className={inputCls} placeholder="4027" />
            ) : <FieldValue value={display.zip_code} />}
          </Field>
          <Field label="Contact Number" icon={Phone}>
            {editing && canEdit ? (
              <input type="text" value={display.contact_number} onChange={e => set('contact_number', e.target.value)} className={inputCls} placeholder="(049) 545-0000" />
            ) : <FieldValue value={display.contact_number} />}
          </Field>
          <Field label="Official Email Address" icon={Mail}>
            {editing && canEdit ? (
              <input type="email" value={display.official_email} onChange={e => set('official_email', e.target.value)} className={inputCls} placeholder="calamba@deped.ph" />
            ) : <FieldValue value={display.official_email} />}
          </Field>
          <Field label="Official Website" icon={Globe}>
            {editing && canEdit ? (
              <input type="text" value={display.website} onChange={e => set('website', e.target.value)} className={inputCls} placeholder="www.depedcalamba.ph" />
            ) : <FieldValue value={display.website} />}
          </Field>
          <Field label="Agency Code" icon={Hash}>
            {editing && canEdit ? (
              <input type="text" value={display.agency_code} onChange={e => set('agency_code', e.target.value)} className={inputCls} placeholder="DepEd" />
            ) : <FieldValue value={display.agency_code} />}
          </Field>
          <Field label="UACS Code" icon={Hash}>
            {editing && canEdit ? (
              <input type="text" value={display.uacs_code} onChange={e => set('uacs_code', e.target.value)} className={inputCls} placeholder="000000000000" />
            ) : <FieldValue value={display.uacs_code} />}
          </Field>
        </div>
      </div>
    </div>
  );
}

function OfficialsTab({ display, editing, canEdit, hrOnly, set, onUploadSig }: TabProps & { hrOnly: boolean; onUploadSig: (t: 'sds' | 'asds' | 'hrmo' | 'payroll') => void }) {
  return (
    <div className="space-y-6">
      <OfficialCard
        title="Schools Division Superintendent (SDS)"
        accent="from-deped-800 to-deped-600"
        name={display.sds_name}
        position={display.sds_position}
        email={display.sds_email}
        contact={display.sds_contact}
        signature={display.sds_signature}
        effectiveDate={display.sds_effective_date}
        editing={editing}
        canEdit={canEdit}
        set={set}
        prefix="sds"
        onUploadSig={onUploadSig}
        showDate
      />
      <OfficialCard
        title="Assistant Schools Division Superintendent (ASDS)"
        accent="from-slate-700 to-slate-500"
        name={display.asds_name}
        position={display.asds_position}
        email={display.asds_email}
        contact={display.asds_contact}
        signature={display.asds_signature}
        effectiveDate={display.asds_effective_date}
        editing={editing}
        canEdit={canEdit}
        set={set}
        prefix="asds"
        onUploadSig={onUploadSig}
        showDate
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OfficialCard
          title="Human Resource Management Officer (HRMO)"
          accent="from-blue-700 to-blue-500"
          name={display.hrmo_name}
          position={display.hrmo_position}
          email={display.hrmo_email}
          contact={display.hrmo_contact}
          signature={display.hrmo_signature}
          editing={editing}
          canEdit={canEdit || hrOnly}
          set={set}
          prefix="hrmo"
          onUploadSig={onUploadSig}
        />
        <OfficialCard
          title="Payroll Officer"
          accent="from-emerald-700 to-emerald-500"
          name={display.payroll_officer_name}
          position={display.payroll_officer_position}
          email={display.payroll_officer_email}
          contact={display.payroll_officer_contact}
          signature={display.payroll_officer_signature}
          editing={editing}
          canEdit={canEdit}
          set={set}
          prefix="payroll_officer"
          onUploadSig={onUploadSig}
        />
      </div>
    </div>
  );
}

interface OfficialCardProps {
  title: string;
  accent: string;
  name: string;
  position: string;
  email: string;
  contact: string;
  signature: string;
  effectiveDate?: string | null;
  editing: boolean;
  canEdit: boolean;
  set: <K extends keyof DivisionOfficeRow>(key: K, value: DivisionOfficeRow[K]) => void;
  prefix: 'sds' | 'asds' | 'hrmo' | 'payroll_officer';
  onUploadSig: (t: 'sds' | 'asds' | 'hrmo' | 'payroll') => void;
  showDate?: boolean;
}

function OfficialCard({ title, accent, name, position, email, contact, signature, effectiveDate, editing, canEdit, set, prefix, onUploadSig, showDate }: OfficialCardProps) {
  const sigKey = `${prefix}_signature` as keyof DivisionOfficeRow;
  const nameKey = `${prefix}_name` as keyof DivisionOfficeRow;
  const posKey = `${prefix}_position` as keyof DivisionOfficeRow;
  const emailKey = `${prefix}_email` as keyof DivisionOfficeRow;
  const contactKey = `${prefix}_contact` as keyof DivisionOfficeRow;
  const dateKey = `${prefix}_effective_date` as keyof DivisionOfficeRow;
  const sigTarget = prefix === 'payroll_officer' ? 'payroll' : prefix;

  return (
    <div className="enterprise-card overflow-hidden">
      <div className={`bg-gradient-to-r ${accent} text-white px-5 py-4 flex items-center gap-3`}>
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur shrink-0">
          <User className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
            {name ? <span className="text-xl font-bold text-deped-700 dark:text-deped-300">{name.charAt(0).toUpperCase()}</span> : <User className="w-7 h-7" />}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name" icon={User}>
              {editing && canEdit ? (
                <input type="text" value={name} onChange={e => set(nameKey, e.target.value)} className={inputCls} placeholder="Full name" />
              ) : <FieldValue value={name} />}
            </Field>
            <Field label="Position" icon={Award}>
              {editing && canEdit ? (
                <input type="text" value={position} onChange={e => set(posKey, e.target.value)} className={inputCls} placeholder="Position / Designation" />
              ) : <FieldValue value={position} />}
            </Field>
            <Field label="Email" icon={Mail}>
              {editing && canEdit ? (
                <input type="email" value={email} onChange={e => set(emailKey, e.target.value)} className={inputCls} placeholder="official@deped.ph" />
              ) : <FieldValue value={email} />}
            </Field>
            <Field label="Contact Number" icon={Phone}>
              {editing && canEdit ? (
                <input type="text" value={contact} onChange={e => set(contactKey, e.target.value)} className={inputCls} placeholder="09xx-xxx-xxxx" />
              ) : <FieldValue value={contact} />}
            </Field>
            {showDate && (
              <Field label="Effective Date" icon={Calendar}>
                {editing && canEdit ? (
                  <input type="date" value={effectiveDate ?? ''} onChange={e => set(dateKey, e.target.value || null)} className={inputCls} />
                ) : <FieldValue value={effectiveDate ?? ''} />}
              </Field>
            )}
          </div>
        </div>

        {/* Signature */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Digital Signature</p>
            {editing && canEdit && (
              <button onClick={() => onUploadSig(sigTarget)} className="text-xs text-deped-700 dark:text-deped-300 hover:underline flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            )}
          </div>
          <div className="h-20 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-center overflow-hidden">
            {signature ? (
              <img src={signature} alt="Signature" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">No signature uploaded</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ display, editing, canEdit, set }: TabProps) {
  const settings: { key: keyof DivisionOfficeRow; label: string }[] = [
    { key: 'show_division_logo', label: 'Show Division Logo' },
    { key: 'show_deped_logo', label: 'Show DepEd Logo' },
    { key: 'show_sds_name', label: 'Show SDS Name on Reports' },
    { key: 'show_payroll_signature', label: 'Show Payroll Officer Signature' },
    { key: 'show_hrmo_signature', label: 'Show HRMO Signature' },
    { key: 'show_address', label: 'Include Division Address' },
    { key: 'show_tin', label: 'Include TIN Number' },
  ];
  const appliesTo = ['Payroll Register', 'Payroll Reports', 'GSIS Reports', 'PhilHealth Reports', 'Pag-IBIG Reports', 'COA Reports', 'Certifications', 'Notices', 'Remittances'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="enterprise-card p-5">
        <h3 className="section-heading text-sm mb-4">Document Display Settings</h3>
        <div className="space-y-2">
          {settings.map(s => (
            <label key={s.key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={display[s.key] as boolean}
                disabled={!editing || !canEdit}
                onChange={e => set(s.key, e.target.checked as never)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-deped-600 focus:ring-deped-500/30"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{s.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="enterprise-card p-5">
        <h3 className="section-heading text-sm mb-4">Applies To</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          These settings automatically apply to the following generated documents:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {appliesTo.map(doc => (
            <div key={doc} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-deped-500 dark:text-deped-400 shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300">{doc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewTab({ display }: { display: DivisionOfficeRow }) {
  return (
    <div className="enterprise-card overflow-hidden max-w-3xl mx-auto">
      <div className="bg-gradient-to-br from-deped-800 via-deped-700 to-deped-600 text-white p-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {display.show_division_logo && display.division_logo && (
              <img src={display.division_logo} alt="Logo" className="w-16 h-16 rounded-xl bg-white/10 p-1.5 object-contain" />
            )}
            {display.show_deped_logo && (
              <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                <Building2 className="w-8 h-8" />
              </div>
            )}
          </div>
        </div>
        <h2 className="text-xl font-bold mt-4 uppercase tracking-wide text-center">{display.division_name || 'Division Name'}</h2>
        <p className="text-center text-deped-200 text-sm mt-1">{display.region}</p>
      </div>
      <div className="p-8 space-y-5">
        {display.show_address && display.address && (
          <PreviewRow label="Address" value={display.address} icon={MapPin} />
        )}
        {display.show_tin && display.tin_number && (
          <PreviewRow label="TIN" value={display.tin_number} icon={FileText} />
        )}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
          {display.show_sds_name && display.sds_name && (
            <PreviewOfficial label="Schools Division Superintendent" name={display.sds_name} sig={display.sds_signature} />
          )}
          {display.asds_name && (
            <PreviewOfficial label="Assistant SDS" name={display.asds_name} sig={display.asds_signature} />
          )}
          {display.show_hrmo_signature && display.hrmo_name && (
            <PreviewOfficial label="HRMO" name={display.hrmo_name} sig={display.hrmo_signature} />
          )}
          {display.show_payroll_signature && display.payroll_officer_name && (
            <PreviewOfficial label="Payroll Officer" name={display.payroll_officer_name} sig={display.payroll_officer_signature} />
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value, icon: Icon }: { label: string; value: string; icon: typeof MapPin }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 dark:text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function PreviewOfficial({ label, name, sig }: { label: string; name: string; sig: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{name}</p>
      </div>
      {sig && <img src={sig} alt="Signature" className="h-12 object-contain opacity-80" />}
    </div>
  );
}

function CollapsibleHeader({ title, icon: Icon, open, onToggle }: { title: string; icon: typeof Building2; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <span className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</span>
      </span>
      {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

function Field({ label, required, icon: Icon, children }: { label: string; required?: boolean; icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>
        {Icon && <Icon className="w-3 h-3 inline mr-1 text-slate-400" />}
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function FieldValue({ value }: { value: string }) {
  return <p className="text-sm text-slate-700 dark:text-slate-200 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 min-h-[38px]">{value || '—'}</p>;
}
