import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Users as UsersIcon, Shield, Mail, Phone, Lock, Unlock, Trash2, Search,
  Check, CheckCircle, XCircle, Clock, UserCheck, UserX, Ban, Eye, X, AlertTriangle,
  Building2, Briefcase, Hash, ChevronRight, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import LoadingIndicator from '@/components/LoadingIndicator';
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { usePermissions } from '@/lib/permissions';
import { useOrg } from '@/lib/org';
import { usePagination, Pagination } from '@/components/Pagination';
import type { Region, Division } from '@/types/org';
import {
  ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS, STACODE_SCOPED_ROLES,
  STATUS_LABELS, STATUS_COLORS, PERMISSION_CATALOG, PERMISSION_GROUPS,
  ROLE_PERMISSIONS, ALL_PERMISSIONS,
  type UserRole, type UserProfile, type UserStatus,
} from '@/types/auth';

const ALL_ROLES: UserRole[] = [
  'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
  'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
  'school_head', 'ess', 'read_only',
];

type TabKey = UserStatus | 'all';

interface ValidationState {
  [userId: string]: { loading: boolean; result: { valid: boolean; reason?: string; employee_name?: string; stacode?: string } | null };
}

export default function UserManagement({ initialTab }: { initialTab?: TabKey }) {
  const { profile: currentUser, logAudit } = useAuth();
  // SuperAdmin org-scope: when a Region/Division is selected, the user list
  // only shows users of that division (unassigned/pending users stay visible
  // so they can still be reviewed and assigned).
  const { scopedDivisionIds } = useOrg();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'pending_approval');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [rejectModal, setRejectModal] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validations, setValidations] = useState<ValidationState>({});
  // DB-backed editable permission matrix (code defaults + super_admin overrides)
  const {
    isGranted, isOverridden, setPermission, resetPermission,
    loading: permsLoading,
  } = usePermissions();
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);
  const canEditPermissions = isSuperAdmin;
  // Payroll Administrators may assign a school (STACODE) to school-scoped
  // accounts (School Head / School Payroll Coordinator) — nothing else.
  const canAssignSchool = isSuperAdmin || currentUser?.role === 'payroll_admin';

  const [regions, setRegions] = useState<Region[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const data = await fetchAll(() => supabase.from('profiles').select('*').order('created_at', { ascending: false }));
    setUsers(data as UserProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Region/division directory for assignment UI (independent of the current
  // org context so the admin can assign across all regions/divisions).
  useEffect(() => {
    (async () => {
      const [r, d] = await Promise.all([
        supabase.from('regions').select('*').order('sort_order', { ascending: true }),
        supabase.from('divisions').select('*').order('division_name', { ascending: true }),
      ]);
      if (!r.error) setRegions((r.data ?? []) as Region[]);
      if (!d.error) setDivisions((d.data ?? []) as Division[]);
    })();
  }, []);

  const stats = {
    total: users.length,
    pending: users.filter(u => u.status === 'pending_approval').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
    disabled: users.filter(u => u.status === 'disabled').length,
  };

  const filtered = users.filter(u => {
    const inDivisionScope = !scopedDivisionIds || scopedDivisionIds.length === 0 ||
      !u.division_id || scopedDivisionIds.includes(u.division_id);
    if (!inDivisionScope) return false;
    const matchesTab = activeTab === 'all' || u.status === activeTab;
    const matchesSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      (u.employee_number ?? '').includes(search);
    return matchesTab && matchesSearch;
  });

  const userPag = usePagination(filtered, 10, `${activeTab}-${search}`);

  const runValidation = async (user: UserProfile) => {
    if (!user.employee_number) return;
    setValidations(prev => ({ ...prev, [user.id]: { loading: true, result: null } }));
    const { data, error } = await supabase.rpc('validate_employee_for_approval', { p_employee_number: user.employee_number });
    setValidations(prev => ({
      ...prev,
      [user.id]: { loading: false, result: error ? { valid: false, reason: error.message } : data },
    }));
  };

  const handleApprove = async (user: UserProfile) => {
    setActionLoading(user.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('approve_user', { p_target_user: user.id });
    if (rpcError) {
      setError(`Failed to approve ${user.first_name} ${user.last_name}: ${rpcError.message}`);
    } else {
      setSuccess(`${user.first_name} ${user.last_name} has been approved. They can now log in.`);
      await logAudit('user_approved', 'profiles', user.id, { email: user.email });
      loadUsers();
    }
    setActionLoading(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActionLoading(rejectModal.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('reject_user', {
      p_target_user: rejectModal.id,
      p_reason: rejectReason.trim(),
    });
    if (rpcError) {
      setError(`Failed to reject ${rejectModal.first_name} ${rejectModal.last_name}: ${rpcError.message}`);
    } else {
      setSuccess(`${rejectModal.first_name} ${rejectModal.last_name} has been rejected.`);
      await logAudit('user_rejected', 'profiles', rejectModal.id, {
        email: rejectModal.email, reason: rejectReason.trim(),
      });
      loadUsers();
      setRejectModal(null);
      setRejectReason('');
    }
    setActionLoading(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleDisable = async (user: UserProfile) => {
    setActionLoading(user.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('disable_user', { p_target_user: user.id });
    if (rpcError) {
      setError(`Failed to disable ${user.first_name} ${user.last_name}: ${rpcError.message}`);
    } else {
      setSuccess(`${user.first_name} ${user.last_name} has been disabled.`);
      await logAudit('user_disabled', 'profiles', user.id, { email: user.email });
      loadUsers();
    }
    setActionLoading(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleEnable = async (user: UserProfile) => {
    setActionLoading(user.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('enable_user', { p_target_user: user.id });
    if (rpcError) {
      setError(`Failed to enable ${user.first_name} ${user.last_name}: ${rpcError.message}`);
    } else {
      setSuccess(`${user.first_name} ${user.last_name} has been re-enabled.`);
      await logAudit('user_enabled', 'profiles', user.id, { email: user.email });
      loadUsers();
    }
    setActionLoading(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const updateRole = async (userId: string, role: UserRole) => {
    const { error: rpcError } = await supabase.rpc('set_user_role', { p_target_user: userId, p_new_role: role });
    if (rpcError) { setError('Failed to update role: ' + rpcError.message); return; }
    loadUsers();
  };

  const toggleMfa = async (userId: string, enabled: boolean) => {
    const { error: rpcError } = await supabase.rpc('set_user_mfa', { p_target_user: userId, p_enabled: enabled });
    if (rpcError) { setError('Failed to toggle MFA: ' + rpcError.message); return; }
    loadUsers();
  };

  const unlockAccount = async (userId: string) => {
    const { error: rpcError } = await supabase.rpc('unlock_user_account', { p_target_user: userId });
    if (rpcError) { setError('Failed to unlock account: ' + rpcError.message); return; }
    loadUsers();
  };

  const handleAssignStacode = async (userId: string, stacode: string) => {
    const { error: rpcError } = await supabase.rpc('set_assigned_stacode', { p_target_user: userId, p_stacode: stacode });
    if (rpcError) { setError('Failed to assign STACODE: ' + rpcError.message); return; }
    setSuccess('STACODE assigned successfully.');
    loadUsers();
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleUpdateEmployeeNumber = async (userId: string, empNo: string) => {
    const { error: rpcError } = await supabase.rpc('set_employee_number', { p_target_user: userId, p_employee_number: empNo });
    if (rpcError) { setError('Failed to update employee number: ' + rpcError.message); return; }
    setSuccess('Employee number updated successfully.');
    await logAudit('user_employee_number_change', 'profiles', userId, { employee_number: empNo });
    loadUsers();
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleAssignDivision = async (userId: string, regionId: string | null, divisionId: string | null) => {
    const { error: rpcError } = await supabase.rpc('set_user_division', {
      p_target_user: userId,
      p_region_id: regionId,
      p_division_id: divisionId,
    });
    if (rpcError) {
      setError(/could not find the function|in the schema cache|does not exist/i.test(rpcError.message)
        ? 'Region/Division assignment is unavailable: the database functions are not deployed yet. Run `supabase db push` from the project folder, then try again.'
        : 'Failed to assign region/division: ' + rpcError.message);
      return;
    }
    setSuccess('Region/Division assigned. The user is now scoped to that division.');
    await logAudit('user_division_change', 'profiles', userId, { region_id: regionId, division_id: divisionId });
    loadUsers();
    setTimeout(() => setSuccess(null), 3500);
  };

  // Toggle one cell of the permissions matrix. If the new state equals the
  // code default we delete the override (restore default); otherwise we upsert.
  const togglePermission = async (role: UserRole, permission: string) => {
    if (!canEditPermissions) return;
    const currently = isGranted(role, permission);
    const next = !currently;
    const isDefault = (ROLE_PERMISSIONS[role] ?? []).includes(permission);
    const cellKey = `${role}:${permission}`;
    setActionLoading(cellKey);
    setError(null);
    const res = next === isDefault
      ? await resetPermission(role, permission)
      : await setPermission(role, permission, next);
    if (res.error) {
      setError(`Failed to update permission: ${res.error}`);
    } else {
      setSuccess(`“${PERMISSION_CATALOG[permission]?.label ?? permission}” ${next ? 'granted to' : 'revoked from'} ${ROLE_LABELS[role]}.`);
      await logAudit('role_permission_change', 'role_permissions', cellKey, {
        role, permission, granted: next, restored_default: next === isDefault,
      });
      setTimeout(() => setSuccess(null), 3500);
    }
    setActionLoading(null);
  };

  const tabs: { key: TabKey; label: string; count: number; icon: typeof Clock; color: string }[] = [
    { key: 'pending_approval', label: 'Pending', count: stats.pending, icon: Clock, color: 'text-amber-600' },
    { key: 'approved', label: 'Approved', count: stats.approved, icon: CheckCircle, color: 'text-emerald-600' },
    { key: 'rejected', label: 'Rejected', count: stats.rejected, icon: XCircle, color: 'text-rose-600' },
    { key: 'disabled', label: 'Disabled', count: stats.disabled, icon: Ban, color: 'text-slate-500' },
    { key: 'all', label: 'All Users', count: stats.total, icon: UsersIcon, color: 'text-slate-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Approval" value={stats.pending} icon={<Clock className="w-5 h-5" />} color="text-amber-600 bg-amber-50" />
        <StatCard label="Approved" value={stats.approved} icon={<CheckCircle className="w-5 h-5" />} color="text-emerald-600 bg-emerald-50" />
        <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-5 h-5" />} color="text-rose-600 bg-rose-50" />
        <StatCard label="Disabled" value={stats.disabled} icon={<Ban className="w-5 h-5" />} color="text-slate-500 bg-slate-100" />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or employee no..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={loadUsers}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <UsersIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No users in this category.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date Registered</th>
                  <th className="text-left px-4 py-3 font-medium">Employee No</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">School/Office</th>
                  <th className="text-left px-4 py-3 font-medium">Position</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userPag.pagedItems.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
                  const valState = validations[u.id];
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium">
                        {u.employee_number ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs shrink-0">
                            {u.first_name?.[0]?.toUpperCase() ?? u.email[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">
                              {u.first_name} {u.last_name}
                              {isSelf && <span className="text-xs text-emerald-600 ml-1">(You)</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[180px]">{u.email}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[160px]">
                        {u.office_assignment ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[120px]">
                        {u.position_designation ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${STATUS_COLORS[u.status]}`}>
                          {STATUS_LABELS[u.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isSuperAdmin && u.status === 'pending_approval' && (
                            <>
                              <button
                                onClick={() => runValidation(u)}
                                disabled={valState?.loading}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-50"
                                title="Validate against Masterfile"
                              >
                                {valState?.loading ? <LoadingIndicator size={40} /> : <ShieldCheck className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleApprove(u)}
                                disabled={actionLoading === u.id}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-50"
                                title="Approve"
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setRejectModal(u)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                                title="Reject"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {isSuperAdmin && u.status === 'approved' && !isSelf && (
                            <button
                              onClick={() => handleDisable(u)}
                              disabled={actionLoading === u.id}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                              title="Disable account"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          {isSuperAdmin && u.status === 'rejected' && (
                            <button
                              onClick={() => handleApprove(u)}
                              disabled={actionLoading === u.id}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-50"
                              title="Approve (override rejection)"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          {isSuperAdmin && u.status === 'disabled' && (
                            <button
                              onClick={() => handleEnable(u)}
                              disabled={actionLoading === u.id}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-50"
                              title="Re-enable account"
                            >
                              <Unlock className="w-4 h-4" />
                            </button>
                          )}
                          {isSuperAdmin && isLocked && (
                            <button
                              onClick={() => unlockAccount(u.id)}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"
                              title="Unlock account"
                            >
                              <Unlock className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={userPag.page} totalPages={userPag.totalPages} total={userPag.total} onPageChange={userPag.setPage} label="users" />
      </div>

      {/* Roles & Permissions matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-deped-600" />
              Roles &amp; Permissions Matrix
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {canEditPermissions
                ? 'Click a cell to grant or revoke. Changes apply to every user immediately.'
                : 'View-only — only Super Administrators can edit permissions.'}
            </p>
          </div>
          {canEditPermissions && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Live — affects all signed-in users
            </span>
          )}
        </div>
        {permsLoading ? (
          <div className="p-8 text-center text-slate-500">Loading permission matrix...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold min-w-[220px]">Permission</th>
                  {ALL_ROLES.map(role => (
                    <th key={role} className="text-center px-2 py-2.5 font-semibold">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border whitespace-nowrap ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSION_GROUPS.map(group => (
                  <Fragment key={group.id}>
                    <tr className="bg-slate-50/70">
                      <td colSpan={ALL_ROLES.length + 1} className="px-4 py-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                        {group.label}
                      </td>
                    </tr>
                    {group.permissions.map(perm => (
                      <tr key={perm} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-700">{PERMISSION_CATALOG[perm]?.label ?? perm}</p>
                          <p className="text-[11px] text-slate-400">{PERMISSION_CATALOG[perm]?.description}</p>
                        </td>
                        {ALL_ROLES.map(role => {
                          const granted = isGranted(role, perm);
                          const overridden = isOverridden(role, perm);
                          const busy = actionLoading === `${role}:${perm}`;
                          return (
                            <td key={role} className="text-center px-2 py-2">
                              <button
                                onClick={() => togglePermission(role, perm)}
                                disabled={!canEditPermissions || busy}
                                title={`${ROLE_LABELS[role]} — ${PERMISSION_CATALOG[perm]?.label ?? perm}: ${granted ? 'granted' : 'denied'}${overridden ? ' (customized)' : ' (default)'}`}
                                className={`relative inline-flex w-7 h-7 items-center justify-center rounded-md border transition-colors ${
                                  granted
                                    ? 'bg-emerald-500 border-emerald-600 text-white'
                                    : 'bg-white border-slate-300 text-slate-300'
                                } ${canEditPermissions && !busy ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'} ${busy ? 'opacity-50' : ''}`}
                              >
                                {granted ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
                                {overridden && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block" /> Granted</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white inline-block" /> Denied</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Customized (override)</span>
          <span className="ml-auto">Empty cells follow the system default. Super Admin always keeps User Management.</span>
        </div>
      </div>

      {/* Role descriptions (collapsible reference) */}
      <details className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <summary className="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
          Role Descriptions
        </summary>
        <div className="divide-y divide-slate-50 border-t border-slate-100">
          {ALL_ROLES.map(role => (
            <div key={role} className="flex items-start gap-3 px-4 py-2.5">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </span>
              <p className="text-xs text-slate-500 leading-relaxed pt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
              {STACODE_SCOPED_ROLES.includes(role) && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0 mt-0.5">
                  STACODE required
                </span>
              )}
            </div>
          ))}
        </div>
      </details>

      {/* User detail modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          currentUser={currentUser}
          canAssignSchool={canAssignSchool}
          validation={validations[selectedUser.id]}
          regions={regions}
          divisions={divisions}
          onClose={() => setSelectedUser(null)}
          onValidate={() => runValidation(selectedUser)}
          onRoleChange={updateRole}
          onAssignStacode={handleAssignStacode}
          onAssignDivision={handleAssignDivision}
          onToggleMfa={toggleMfa}
          onUpdateEmployeeNumber={handleUpdateEmployeeNumber}
        />
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center">
                <UserX className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Reject Registration</h3>
              <button onClick={() => setRejectModal(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                You are rejecting <span className="font-semibold text-slate-800">{rejectModal.first_name} {rejectModal.last_name}</span> ({rejectModal.email}).
                The applicant will be notified with the reason below.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rejection Reason <span className="text-rose-500">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  placeholder="e.g. Employee record not found in Masterfile"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setRejectModal(null); setRejectReason(''); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                  className="px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionLoading === rejectModal.id ? 'Rejecting...' : 'Reject User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function UserDetailModal({ user, currentUser, canAssignSchool, validation, regions, divisions, onClose, onValidate, onRoleChange, onAssignStacode, onAssignDivision, onToggleMfa, onUpdateEmployeeNumber }: {
  user: UserProfile;
  currentUser: UserProfile | null;
  canAssignSchool: boolean;
  validation: ValidationState[string] | undefined;
  regions: Region[];
  divisions: Division[];
  onClose: () => void;
  onValidate: () => void;
  onRoleChange: (userId: string, role: UserRole) => void;
  onAssignStacode: (userId: string, stacode: string) => void;
  onAssignDivision: (userId: string, regionId: string | null, divisionId: string | null) => void;
  onToggleMfa: (userId: string, enabled: boolean) => void;
  onUpdateEmployeeNumber: (userId: string, empNo: string) => void;
}) {
  const [editingRole, setEditingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const [stacodeInput, setStacodeInput] = useState(user.assigned_stacode ?? '');
  const [editingStacode, setEditingStacode] = useState(false);
  const [editingEmpNo, setEditingEmpNo] = useState(false);
  const [empNoInput, setEmpNoInput] = useState(user.employee_number ?? '');
  const [editingOrg, setEditingOrg] = useState(false);
  const [selRegion, setSelRegion] = useState<string | null>(user.region_id ?? null);
  const [selDivision, setSelDivision] = useState<string | null>(user.division_id ?? null);
  const isSelf = user.id === currentUser?.id;
  const canManage = isSuperAdminRole(currentUser?.role) && !isSelf;
  const canAssign = canAssignSchool && !isSelf;
  const needsStacode = STACODE_SCOPED_ROLES.includes(selectedRole);
  const userNeedsStacode = STACODE_SCOPED_ROLES.includes(user.role);

  // Live permissions summary for the selected role — updates in real time
  // while an admin is previewing a role change.
  const { rolePermissions, isGranted, isOverridden } = usePermissions();
  const granted = new Set(rolePermissions(selectedRole));
  const permTotal = ALL_PERMISSIONS.length;
  const permPct = permTotal ? Math.round((granted.size / permTotal) * 100) : 0;

  const DetailRow = ({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string | null | undefined }) => (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 truncate">{value || <span className="text-slate-300">Not provided</span>}</p>
      </div>
    </div>
  );

  const saveRole = () => {
    if (selectedRole !== user.role) {
      onRoleChange(user.id, selectedRole);
    }
    setEditingRole(false);
  };

  const saveStacode = () => {
    onAssignStacode(user.id, stacodeInput.trim());
  };

  const saveSchool = () => {
    onAssignStacode(user.id, stacodeInput.trim());
    setEditingStacode(false);
  };

  const saveEmpNo = () => {
    onUpdateEmployeeNumber(user.id, empNoInput.trim());
    setEditingEmpNo(false);
  };

  const saveOrg = () => {
    onAssignDivision(user.id, selRegion, selDivision);
    setEditingOrg(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold">
            {user.first_name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800">{user.first_name} {user.last_name}</h3>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${STATUS_COLORS[user.status]}`}>
            {STATUS_LABELS[user.status]}
          </span>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0 mb-4">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow icon={Phone} label="Mobile" value={user.mobile_number} />
            <div className="py-2.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Hash className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Employee No</p>
                    {canManage && !editingEmpNo && (
                      <button
                        onClick={() => setEditingEmpNo(true)}
                        className="text-xs font-medium text-emerald-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {!editingEmpNo ? (
                    <p className="text-sm text-slate-700 truncate">{user.employee_number || <span className="text-slate-300">Not provided</span>}</p>
                  ) : (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={empNoInput}
                        onChange={e => setEmpNoInput(e.target.value)}
                        placeholder="e.g. 042-123456"
                        className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        autoFocus
                      />
                      <button
                        onClick={saveEmpNo}
                        className="px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingEmpNo(false); setEmpNoInput(user.employee_number ?? ''); }}
                        className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DetailRow icon={Building2} label="Office/School" value={user.office_assignment} />
            <DetailRow icon={Briefcase} label="Position" value={user.position_designation} />
            <DetailRow icon={UsersIcon} label="Username" value={user.username} />
          </div>

          {/* Role assignment section */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">Role Assignment</h4>
              {canManage && !editingRole && (
                <button
                  onClick={() => setEditingRole(true)}
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  Change Role
                </button>
              )}
            </div>

            {!editingRole ? (
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${ROLE_COLORS[user.role]}`}>
                  {ROLE_LABELS[user.role]}
                </span>
                {user.assigned_stacode && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    STACODE {user.assigned_stacode}
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-3 mb-3">
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  {ALL_ROLES.map(role => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[selectedRole]}</p>

                {needsStacode && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Assigned STACODE</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={stacodeInput}
                        onChange={e => setStacodeInput(e.target.value)}
                        placeholder="e.g. 042"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                      <button
                        onClick={saveStacode}
                        className="px-3 py-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
                      >
                        Save STACODE
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Elementary: 001-499 | JHS: 500-699 | SHS: 700-701</p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setEditingRole(false); setSelectedRole(user.role); }}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveRole}
                    className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save Role
                  </button>
                </div>
              </div>
            )}

            {!canManage && isSelf && (
              <p className="text-xs text-slate-400 italic">You cannot change your own role.</p>
            )}
          </div>

          {/* School assignment (STACODE) — Super Admins and Payroll Admins can
              assign a school to School Head / School Payroll Coordinator accounts */}
          {canAssign && userNeedsStacode && (
            <div className="border-t border-slate-100 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700">School Assignment</h4>
                {!editingStacode && (
                  <button
                    onClick={() => { setStacodeInput(user.assigned_stacode ?? ''); setEditingStacode(true); }}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    {user.assigned_stacode ? 'Change School' : 'Assign School'}
                  </button>
                )}
              </div>
              {!editingStacode ? (
                user.assigned_stacode ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    STACODE {user.assigned_stacode}
                  </span>
                ) : (
                  <p className="text-xs text-slate-400 italic">No school assigned — this account currently has no data scope.</p>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">School STACODE</label>
                    <input
                      type="text"
                      value={stacodeInput}
                      onChange={e => setStacodeInput(e.target.value)}
                      placeholder="e.g. 042"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      autoFocus
                    />
                    <p className="text-xs text-slate-400 mt-1">Elementary: 001-499 | JHS: 500-699 | SHS: 700-701</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setEditingStacode(false); setStacodeInput(user.assigned_stacode ?? ''); }}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveSchool}
                      className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      Save School
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Region / Division assignment */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">Region / Division</h4>
              {canManage && !editingOrg && (
                <button
                  onClick={() => {
                    setSelRegion(user.region_id ?? null);
                    setSelDivision(user.division_id ?? null);
                    setEditingOrg(true);
                  }}
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  Assign
                </button>
              )}
            </div>

            {!editingOrg ? (
              <div className="flex flex-wrap items-center gap-2">
                {user.division_id || user.region_id ? (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {divisions.find(d => d.id === user.division_id)?.division_name ?? 'Unknown Division'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {regions.find(r => r.id === user.region_id)?.region_name ?? 'Unknown Region'}
                    </span>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">Not assigned to a division — sees only their role defaults.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Region</label>
                  <select
                    value={selRegion ?? ''}
                    onChange={e => { const v = e.target.value || null; setSelRegion(v); setSelDivision(null); }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="">— No region —</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>{r.region_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Division</label>
                  <select
                    value={selDivision ?? ''}
                    onChange={e => setSelDivision(e.target.value || null)}
                    disabled={!selRegion}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">— No division —</option>
                    {divisions.filter(d => d.region_id === selRegion).map(d => (
                      <option key={d.id} value={d.id}>{d.division_name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Users assigned to a division are scoped to its data (employees, schools, payroll).
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setEditingOrg(false); }}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveOrg}
                    className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save Assignment
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Permissions summary */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-slate-700">Permissions Summary</h4>
              <span className="text-xs text-slate-500 tabular-nums">
                {granted.size} of {permTotal} granted
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              What “{ROLE_LABELS[selectedRole]}” can access
              {selectedRole !== user.role && ' — previewing the role being selected'}.
            </p>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${permPct}%` }}
              />
            </div>
            <div className="space-y-2.5">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.permissions.map(perm => {
                      const has = granted.has(perm);
                      return (
                        <span
                          key={perm}
                          title={PERMISSION_CATALOG[perm]?.description ?? perm}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            has
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {has ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                          {PERMISSION_CATALOG[perm]?.label ?? perm}
                          {isOverridden(selectedRole, perm) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="Customized by an administrator" />
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {canManage && (
              <p className="text-[11px] text-slate-400 mt-3">
                Grant or revoke any of these under the Roles &amp; Permissions matrix.
              </p>
            )}
          </div>

          {/* DepEd Masterfile Validation */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">DepEd Masterfile Validation</h4>
              {user.employee_number && (
                <button
                  onClick={onValidate}
                  disabled={validation?.loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                >
                  {validation?.loading ? <LoadingIndicator size={40} /> : <ShieldCheck className="w-3 h-3" />}
                  {validation?.result ? 'Re-validate' : 'Validate'}
                </button>
              )}
            </div>

            {!user.employee_number && (
              <p className="text-sm text-slate-400 italic">No employee number provided.</p>
            )}

            {user.employee_number && !validation?.result && !validation?.loading && (
              <p className="text-sm text-slate-400 italic">Click "Validate" to check against the employee masterfile.</p>
            )}

            {validation?.loading && (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <LoadingIndicator size={40} /> Checking masterfile...
              </p>
            )}

            {validation?.result && (
              <div className={`p-3 rounded-lg border ${validation.result.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex items-start gap-2">
                  {validation.result.valid ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="text-sm">
                    {validation.result.valid ? (
                      <>
                        <p className="font-medium text-emerald-800">Verified DepEd Personnel</p>
                        <p className="text-emerald-700 text-xs mt-0.5">
                          {validation.result.employee_name} — STACODE {validation.result.stacode}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-rose-800">Validation Failed</p>
                        <p className="text-rose-700 text-xs mt-0.5">{validation.result.reason}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* MFA toggle */}
          {canManage && (
            <div className="border-t border-slate-100 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Two-Factor Authentication</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Email OTP verification at login</p>
                </div>
                <button
                  onClick={() => onToggleMfa(user.id, !user.mfa_enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user.mfa_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user.mfa_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Rejection reason */}
          {user.status === 'rejected' && user.rejection_reason && (
            <div className="border-t border-slate-100 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Rejection Reason</h4>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                {user.rejection_reason}
              </div>
            </div>
          )}

          {/* Action history */}
          {(user.approved_at || user.rejected_at || user.disabled_at) && (
            <div className="border-t border-slate-100 pt-4 mt-4 space-y-1.5">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Action History</h4>
              {user.approved_at && (
                <p className="text-xs text-slate-500">Approved: {new Date(user.approved_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              )}
              {user.rejected_at && (
                <p className="text-xs text-slate-500">Rejected: {new Date(user.rejected_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              )}
              {user.disabled_at && (
                <p className="text-xs text-slate-500">Disabled: {new Date(user.disabled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function roleBadgeClass(role: UserRole): string {
  return ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
}
