import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, Copy, Check, ArrowRight, Download,
  Smartphone, LogOut, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { useAuth } from '@/lib/auth';

type Stage = 'starting' | 'scan' | 'confirm' | 'codes' | 'failed';

/** Group a base32 secret as 4-character blocks — the shape apps ask you to type. */
function groupSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(' ');
}

/**
 * Mandatory enrolment for a privileged account that has no second factor.
 *
 * App.tsx renders only this screen while `needsMfaEnrolment` is set, so a
 * payroll administrator, processor, preparer, reviewer, approver, payer or HR
 * administrator cannot reach a single payroll screen until the factor is
 * registered. That is deliberate: the finding this closes is precisely that the
 * division ran a ₱1.64 billion payroll through accounts holding no second
 * factor at all.
 *
 * The factor is a TOTP secret the server generates and stores; the client only
 * ever displays it. Confirmation is required before enrolment counts, so a
 * mis-scanned secret is caught here rather than at the next login.
 */
export default function MfaEnrol({ onSignedOut }: { onSignedOut?: () => void }) {
  const {
    enrolMfa, confirmMfaEnrolment, completeMfaEnrolment, signOut,
    profile, mfaEmail,
  } = useAuth();

  const [stage, setStage] = useState<Stage>('starting');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'uri' | 'codes' | null>(null);
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  const begin = useCallback(async () => {
    setStage('starting');
    setError(null);
    const { error: err, secret: s, otpauthUri: uri } = await enrolMfa();
    if (err || !s) {
      setError(err ?? 'The server did not return a setup key.');
      setStage('failed');
      return;
    }
    setSecret(s);
    setOtpauthUri(uri ?? '');
    setStage('scan');
  }, [enrolMfa]);

  useEffect(() => { void begin(); }, [begin]);

  useEffect(() => {
    if (stage === 'confirm') codeRef.current?.focus();
  }, [stage]);

  const copy = async (value: string, which: 'secret' | 'uri' | 'codes') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      setError('Your browser blocked clipboard access. Select the text and copy it manually.');
    }
  };

  const submitCode = async (value: string) => {
    if (loading || value.length !== 6) return;
    setLoading(true);
    setError(null);
    const { error: err, recoveryCodes: codes } = await confirmMfaEnrolment(value);
    setLoading(false);
    if (err) {
      setError(err);
      setCode('');
      codeRef.current?.focus();
      return;
    }
    setRecoveryCodes(codes ?? []);
    setStage('codes');
  };

  const downloadCodes = () => {
    const name = profile ? `${profile.first_name}_${profile.last_name}` : (mfaEmail ?? 'account');
    const body = [
      'SCRIVIA CLOUD — two-factor recovery codes',
      `Account: ${name} <${mfaEmail ?? ''}>`,
      `Generated: ${new Date().toLocaleString('en-PH')}`,
      '',
      'Each code works ONCE. Keep this file somewhere safe and offline.',
      'Anyone holding a code can sign in as you together with your password.',
      '',
      ...recoveryCodes.map((c) => `  ${c}`),
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scrivia-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = async () => {
    setLoading(true);
    await completeMfaEnrolment();
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    onSignedOut?.();
  };

  const roleLabel = profile?.role?.replace(/_/g, ' ') ?? 'privileged';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6 text-center">
          <ScriviaLogo light className="w-10 h-10 mx-auto mb-4" />
          <div className="w-14 h-14 rounded-full bg-aurora-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-aurora-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Set Up Two-Factor Authentication</h2>
          <p className="text-sm text-slate-400 mt-1">
            Required for the <span className="font-medium text-slate-300">{roleLabel}</span> role
          </p>
        </div>

        <div className="p-8 space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {stage === 'starting' && (
            <div className="flex items-center justify-center gap-3 py-10 text-slate-500 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating your setup key…
            </div>
          )}

          {stage === 'failed' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">Enrolment could not start</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Until this completes, this account must not be used for payroll work. Try again —
                    if it keeps failing, contact the System Custodian.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void begin()}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 flex items-center justify-center gap-2 shadow-aurora"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </div>
          )}

          {stage === 'scan' && (
            <>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deped-600 text-white text-xs font-bold">1</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Add this account to your authenticator app</p>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                    Open Google Authenticator, Microsoft Authenticator, Authy or any TOTP app, choose
                    <span className="font-medium text-slate-600"> Add account → Enter a setup key</span>, and type this key:
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Setup key</span>
                  <button
                    onClick={() => void copy(secret, 'secret')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-deped-600 hover:text-deped-700"
                  >
                    {copied === 'secret' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <p className="font-mono text-base sm:text-lg tracking-widest text-slate-800 break-all text-center select-all">
                  {groupSecret(secret)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs">
                  <div>
                    <dt className="text-slate-400">Account</dt>
                    <dd className="text-slate-600">Two-factor authentication</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Type</dt>
                    <dd className="text-slate-600">Time-based</dd>
                  </div>
                </dl>
              </div>

              {otpauthUri && (
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    Can’t type it? Use the setup link instead
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Paste this into an authenticator that accepts a setup link (some apps call it
                      “import” or “scan from clipboard”).
                    </p>
                    <code className="block rounded-lg bg-slate-100 p-2 text-[10px] break-all text-slate-600 select-all">
                      {otpauthUri}
                    </code>
                    <button
                      onClick={() => void copy(otpauthUri, 'uri')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-deped-600 hover:text-deped-700"
                    >
                      {copied === 'uri' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy setup link</>}
                    </button>
                  </div>
                </details>
              )}

              <button
                onClick={() => setStage('confirm')}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 flex items-center justify-center gap-2 shadow-aurora"
              >
                I’ve added it — Next <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {stage === 'confirm' && (
            <>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deped-600 text-white text-xs font-bold">2</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Enter the code your app shows now</p>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                    This proves the key was recorded correctly. The code changes every 30 seconds.
                  </p>
                </div>
              </div>

              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  setError(null);
                  if (digits.length === 6) void submitCode(digits);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitCode(code); }}
                placeholder="000000"
                className="w-full px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] border-2 border-slate-300 rounded-xl focus:outline-none focus:border-aurora-500"
                disabled={loading}
              />

              <button
                onClick={() => void submitCode(code)}
                disabled={loading || code.length !== 6}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
              >
                {loading ? 'Verifying…' : 'Verify and Enable'} {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => { setCode(''); setError(null); setStage('scan'); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                The key didn’t work — show it again
              </button>
            </>
          )}

          {stage === 'codes' && (
            <>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">
                  <Check className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Save your recovery codes</p>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                    If you lose your phone these are the only way in. Each one works <span className="font-medium text-slate-600">once</span>,
                    and you will not be shown them again.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {recoveryCodes.map((c) => (
                    <code key={c} className="font-mono text-sm text-slate-700 select-all">{c}</code>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-3">
                  <button
                    onClick={() => void copy(recoveryCodes.join('\n'), 'codes')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-deped-600 hover:text-deped-700"
                  >
                    {copied === 'codes' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy all</>}
                  </button>
                  <button
                    onClick={downloadCodes}
                    className="inline-flex items-center gap-1 text-xs font-medium text-deped-600 hover:text-deped-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Download .txt
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savedAcknowledged}
                  onChange={(e) => setSavedAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span className="text-xs text-amber-800 leading-relaxed">
                  I have saved these codes somewhere I can reach without my phone, and I understand they
                  are as sensitive as my password.
                </span>
              </label>

              <button
                onClick={() => void finish()}
                disabled={!savedAcknowledged || loading}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
              >
                {loading ? 'Finishing…' : 'Continue to the System'} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {(stage === 'scan' || stage === 'confirm') && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
              <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Two-factor authentication is required for {roleLabel} accounts because they can move
                payroll money or read sensitive personal information. It cannot be skipped.
              </p>
            </div>
          )}

          <div className="text-center pt-2 border-t border-slate-100">
            <button
              onClick={() => void handleSignOut()}
              className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
