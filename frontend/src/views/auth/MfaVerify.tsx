import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, ArrowRight, KeyRound, Smartphone, AlertTriangle, LogOut } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { useAuth } from '@/lib/auth';

type Mode = 'totp' | 'recovery';

/**
 * Second-factor challenge shown after a correct password on an enrolled account.
 *
 * Two ways in, because a lost phone must not mean a lost payroll run:
 *   - the 6-digit code from the authenticator app (RFC 6238, SHA-256), or
 *   - one of the ten single-use recovery codes issued at enrolment.
 *
 * There is deliberately no "resend" action: the factor is generated on the
 * user's own device, so there is nothing for the server to re-send. The previous
 * implementation offered one because it e-mailed OTPs, which is the weaker flow
 * the gate replaced.
 */
export default function MfaVerify({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const { verifyMfa, cancelMfa, mfaEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (mode === 'totp') inputRefs.current[0]?.focus();
  }, [mode]);

  if (!mfaEmail) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">
          <p className="text-slate-600 mb-4">Your sign-in session expired. Please log in again.</p>
          <button onClick={backToLogin} className="text-aurora-600 font-semibold hover:underline">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  function backToLogin() {
    // Clearing the challenge is required: App.tsx renders only this screen while
    // `needsMfa` is set, so switching the view alone would leave the user stuck
    // here — which is exactly what the old "Back to Login" button did.
    cancelMfa();
    onSwitch('login');
  }

  const submit = async (value: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await verifyMfa(value);
    setLoading(false);
    if (err) {
      setError(err);
      setCode(['', '', '', '', '', '']);
      setRecovery('');
      inputRefs.current[0]?.focus();
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      const cleared = [...code];
      cleared[index] = '';
      setCode(cleared);
      return;
    }
    // Pasting a whole code into one box is common; spread it across the boxes.
    const next = [...code];
    for (let i = 0; i < digits.length && index + i < 6; i++) next[index + i] = digits[i];
    setCode(next);
    const lastFilled = Math.min(index + digits.length, 5);
    if (next.every(d => d !== '')) submit(next.join(''));
    else inputRefs.current[lastFilled]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const next = pasted.split('').concat(Array(6 - pasted.length).fill(''));
      setCode(next);
      if (pasted.length === 6) submit(pasted);
      else inputRefs.current[pasted.length]?.focus();
    }
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = recovery.trim();
    if (value.length < 10) {
      setError('A recovery code is 10 characters. Check for a missing or extra character.');
      return;
    }
    submit(value);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6 text-center">
          <ScriviaLogo light className="w-10 h-10 mx-auto mb-4" />
          <div className="w-14 h-14 rounded-full bg-aurora-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-aurora-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Two-Factor Authentication</h2>
          <p className="text-sm text-slate-400 mt-1">
            {mode === 'totp' ? (
              <>
                Enter the 6-digit code from your authenticator app for
                <br />
                <span className="font-medium text-slate-300">{mfaEmail}</span>
              </>
            ) : (
              <>
                Enter one of your saved recovery codes for
                <br />
                <span className="font-medium text-slate-300">{mfaEmail}</span>
              </>
            )}
          </p>
        </div>

        <div className="p-8 space-y-6">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'totp' ? (
            <>
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none transition-colors ${
                      error ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-aurora-500'
                    }`}
                    disabled={loading}
                  />
                ))}
              </div>

              <button
                onClick={() => submit(code.join(''))}
                disabled={loading || code.some(d => !d)}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
              >
                {loading ? 'Verifying…' : 'Verify Code'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                Your code changes every 30 seconds
              </p>
            </>
          ) : (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <label htmlFor="recovery-code" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Recovery code
                </label>
                <input
                  id="recovery-code"
                  type="text"
                  value={recovery}
                  onChange={(e) => { setRecovery(e.target.value.toUpperCase()); setError(null); }}
                  placeholder="XXXXX-XXXXX"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  className="w-full px-4 py-3 text-center font-mono text-lg tracking-widest border-2 border-slate-300 rounded-xl focus:outline-none focus:border-aurora-500 uppercase"
                  disabled={loading}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Each code works once. If you have none left, the System Custodian can reset your
                  two-factor authentication so you can enrol again.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || recovery.trim().length < 10}
                className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
              >
                {loading ? 'Verifying…' : 'Use Recovery Code'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          <div className="text-center">
            <button
              onClick={() => { setMode(mode === 'totp' ? 'recovery' : 'totp'); setError(null); }}
              className="text-sm text-slate-600 hover:text-aurora-600 inline-flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {mode === 'totp' ? 'Use a recovery code instead' : 'Use my authenticator app instead'}
            </button>
          </div>

          <div className="text-center pt-2 border-t border-slate-100">
            <button
              onClick={backToLogin}
              className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
