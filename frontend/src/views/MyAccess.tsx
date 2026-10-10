import { useEffect, useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, Building2, Briefcase, Hash,
  KeyRound, Info, AlertTriangle, ShieldOff, Copy, Check, RefreshCw,
} from 'lucide-react';
import { useAuth, type MfaStatus } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { getScopeDescription, isSuperAdminRole, isMfaPrivileged } from '@/lib/authz';
import {
  ROLE_LABELS, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS,
  PERMISSION_GROUPS, PERMISSION_CATALOG,
} from '@/types/auth';

/**
 * "My Access & Permissions" — every signed-in user can see exactly what their
 * role can and cannot open. The granted set is the DB-merged permission matrix
 * (code defaults + any super_admin overrides), so this page always reflects
 * the live access control state.
 */
export default function MyAccess() {
  const { profile } = useAuth();
  const { rolePermissions, isGranted, isOverridden, loading } = usePermissions();

  if (!profile) return null;

  const granted = new Set(rolePermissions(profile.role));
  const allKeys = Object.keys(PERMISSION_CATALOG);
  const overrideCount = allKeys.filter((p) => isOverridden(profile.role, p)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-deped-600" />
            My Access &amp; Permissions
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Everything your account can open and do in the system — based on your role and its permissions.
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${ROLE_COLORS[profile.role]}`}>
          {ROLE_LABELS[profile.role]}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm">
          <Info className="w-4 h-4 shrink-0" />
          Synchronizing permission settings…
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Profile / scope column */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-deped-500 to-deped-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {profile.first_name?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{profile.first_name} {profile.last_name}</p>
                  <p className="text-xs text-slate-500 truncate">{profile.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${ROLE_COLORS[profile.role]}`}>
                  {ROLE_LABELS[profile.role]}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_COLORS[profile.status]}`}>
                  {STATUS_LABELS[profile.status]}
                </span>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              <DetailRow icon={Building2} label="Office / School" value={profile.office_assignment} />
              <DetailRow icon={Briefcase} label="Position" value={profile.position_designation} />
              <DetailRow icon={Hash} label="Assigned STACODE" value={profile.assigned_stacode} />
              <DetailRow icon={KeyRound} label="Employee No." value={profile.employee_number} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-deped-600" />
              <h3 className="text-sm font-semibold text-slate-700">Access Summary</h3>
            </div>
            <div className="flex items-end gap-2 mb-1">
              <p className="text-3xl font-bold text-slate-800 tabular-nums">{granted.size}</p>
              <p className="text-sm text-slate-500 mb-1">of {allKeys.length} permissions granted</p>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${allKeys.length ? Math.round((granted.size / allKeys.length) * 100) : 0}%` }}
              />
            </div>
            {overrideCount > 0 ? (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {overrideCount} permission{overrideCount > 1 ? 's' : ''} customized for this role by an administrator.
              </p>
            ) : (
              <p className="text-xs text-slate-400">Standard permissions for this role — no custom overrides.</p>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Data Scope</p>
            <p className="text-sm text-slate-700">{getScopeDescription(profile)}</p>
            {isSuperAdminRole(profile.role) && (
              <p className="text-xs text-slate-400 mt-2">
                As Super Administrator you can edit this matrix under Administration → User Management → Roles &amp; Permissions.
              </p>
            )}
          </div>

          <TwoFactorCard />
        </div>

        {/* Permissions column */}
        <div className="lg:col-span-2 space-y-6">
          {PERMISSION_GROUPS.map((group) => {
            const groupGranted = group.permissions.filter((p) => granted.has(p)).length;
            return (
              <div key={group.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                  <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {groupGranted}/{group.permissions.length} granted
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {group.permissions.map((perm) => {
                    const info = PERMISSION_CATALOG[perm];
                    const has = granted.has(perm);
                    const overridden = isOverridden(profile.role, perm);
                    return (
                      <div key={perm} className="flex items-start gap-3 px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${has ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {has ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-800">{info.label}</p>
                            {overridden && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                CUSTOMIZED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{info.description}</p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          has
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}>
                          {has ? 'GRANTED' : 'NO ACCESS'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The account's own second-factor state, plus the one action a user can safely
 * take on it: issuing a fresh set of recovery codes (which invalidates the old
 * set — the previous codes are the most likely thing to have leaked).
 *
 * Enrolment itself is not offered here. A privileged account cannot reach this
 * page without a factor, and a non-privileged one enrolling itself is an
 * administrative decision rather than a self-service one.
 */
function TwoFactorCard() {
  const { profile, mfaStatus, regenerateRecoveryCodes } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { error: err, status: s } = await mfaStatus();
      if (!active) return;
      if (err) setError(err);
      else setStatus(s ?? null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [mfaStatus]);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    const { error: err, recoveryCodes } = await regenerateRecoveryCodes();
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    setFreshCodes(recoveryCodes ?? []);
    setConfirming(false);
    const { status: s } = await mfaStatus();
    if (s) setStatus(s);
    setBusy(false);
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText((freshCodes ?? []).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Your browser blocked clipboard access. Select the codes and copy them manually.');
    }
  };

  const required = isMfaPrivileged(profile?.role);
  const enrolled = status?.enrolled ?? profile?.mfa_enabled ?? false;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <ShieldCheck className={`w-4 h-4 ${enrolled ? 'text-emerald-600' : 'text-slate-400'}`} />
        <h3 className="text-sm font-semibold text-slate-700">Two-Factor Authentication</h3>
      </div>

      <div className="px-5 py-4 space-y-3">
        {loading ? (
          <p className="text-xs text-slate-400">Reading your security settings…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Status</span>
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                enrolled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}>
                {enrolled ? <><ShieldCheck className="w-3 h-3" /> ENROLLED</> : <><ShieldOff className="w-3 h-3" /> NOT ENROLLED</>}
              </span>
            </div>

            {enrolled && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Recovery codes left</span>
                <span className="text-sm font-semibold tabular-nums text-slate-800">
                  {status ? status.recovery_codes_remaining : '—'}
                  <span className="text-slate-400 font-normal"> / 10</span>
                </span>
              </div>
            )}

            {!enrolled && required && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This role requires a second factor. You would not have reached this page without one —
                if you are seeing this, contact the System Custodian.
              </p>
            )}

            {!enrolled && !required && (
              <p className="text-xs text-slate-400 leading-relaxed">
                Your role does not require a second factor. Ask the System Custodian if you would like
                one enabled for your account.
              </p>
            )}

            {enrolled && !required && (
              <p className="text-xs text-slate-400 leading-relaxed">
                Your role is exempt from the second factor, so no code is asked at sign-in. The
                enrolment is kept on record and sign-in remains password-only.
              </p>
            )}

            {enrolled && status && status.recovery_codes_remaining <= 3 && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                You are running low on recovery codes. Generate a new set before you run out.
              </p>
            )}

            {enrolled && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-deped-700 bg-deped-50 rounded-lg hover:bg-deped-100"
              >
                <RefreshCw className="w-3 h-3" /> New recovery codes
              </button>
            )}

            {confirming && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This replaces all existing recovery codes. Any you have saved will stop working the
                  moment you continue — make sure you can save the new ones.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void regenerate()}
                    disabled={busy}
                    className="px-2.5 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busy ? 'Generating…' : 'Generate new codes'}
                  </button>
                </div>
              </div>
            )}

            {freshCodes && freshCodes.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Your new recovery codes
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {freshCodes.map((c) => (
                    <code key={c} className="font-mono text-xs text-slate-700 select-all">{c}</code>
                  ))}
                </div>
                <button
                  onClick={() => void copyCodes()}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-deped-600 hover:text-deped-700"
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy all</>}
                </button>
                <p className="mt-1.5 text-[11px] text-amber-700">
                  These are shown only now. Save them somewhere you can reach without your phone.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-xs text-rose-600 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 truncate">{value || <span className="text-slate-300">Not set</span>}</p>
      </div>
    </div>
  );
}
