import { useRef, useState } from 'react';
import { Eye, EyeOff, ArrowRight, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { ScriviaLogo, ScriviaWordmark } from '@/components/ScriviaLogo';
import { useAuth, PENDING_SIGNUP_EMAIL_KEY } from '@/lib/auth';
import { turnstileEnabled } from '@/lib/turnstile';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';

export default function Login({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return;

    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the security check to continue.');
      return;
    }

    setLoading(true);
    const { error, needsMfa } = await signIn(email.trim().toLowerCase(), password, rememberMe, turnstileToken || undefined);
    setLoading(false);
    if (error) {
      // Bot check failures need a fresh widget token next attempt.
      turnstileRef.current?.reset();
      setError(error);
      // Remember the address so the verify screen can prefill the resend form.
      if (/verif/i.test(error)) {
        localStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, email.trim().toLowerCase());
      }
    }
    // needsMfa is handled by the auth context changing state.needsMfa
  };

  // Email-verification errors get a direct path to the verify screen
  // (which has the resend-link option) instead of leaving the user stuck.
  const isEmailVerificationError = error !== null && /verif/i.test(error);

  return (
    <div className="login-wrapper">
      <div className="login-card bg-white shadow-2xl">
          <div className="bg-slate-900 px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <ScriviaLogo light className="w-10 h-10 shrink-0" />
              <ScriviaWordmark light />
            </div>
            <h2 className="text-lg font-semibold text-white">Sign In</h2>
            <p className="text-sm text-slate-400 mt-1">Enter your credentials to access the system</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="flex-1">{error}</span>
                {isEmailVerificationError && (
                  <button
                    type="button"
                    onClick={() => onSwitch('verify')}
                    className="shrink-0 text-xs font-semibold text-aurora-700 hover:underline underline-offset-2 self-center"
                  >
                    Verify Email
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone or Email</label>
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-aurora-500 focus:outline-none text-sm"
                placeholder="Phone number or email"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-aurora-500 focus:outline-none text-sm"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {turnstileEnabled && <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-aurora-600 focus:ring-aurora-500"
                />
                <span className="text-sm text-slate-600">Remember Me</span>
              </label>
              <button type="button" onClick={() => onSwitch('forgot')} className="text-sm text-aurora-600 font-medium hover:underline">
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="px-8 pb-6">
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-aurora-500" />
                <span>Secured with role-based access control</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 text-aurora-500" />
                <span>Auto-logout after 15 minutes of inactivity</span>
              </div>
            </div>
            <p className="text-center text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100">
              Don't have an account?{' '}
              <button type="button" onClick={() => onSwitch('signup')} className="text-aurora-600 font-semibold hover:underline">
                Sign Up
              </button>
            </p>
          </div>
        </div>
    </div>
  );
}
