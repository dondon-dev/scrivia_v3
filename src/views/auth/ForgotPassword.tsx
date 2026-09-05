import { useRef, useState } from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import { ScriviaLogo, ScriviaWordmark } from '@/components/ScriviaLogo';
import { pb } from '@/lib/pb';
import { turnstileEnabled, verifyTurnstileToken } from '@/lib/turnstile';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';

export default function ForgotPassword({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;

    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the security check to continue.');
      return;
    }

    // Verify the human-check token server-side before requesting a reset.
    if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
      turnstileRef.current?.reset();
      setError('Security verification failed. Please refresh the page and try again.');
      return;
    }

    setLoading(true);
    try {
      // Call PocketBase hook to request password reset
      const { error } = await pb.send('/api/auth/request-password-reset', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), redirect_url: `${window.location.origin}/#reset` },
      });
      setLoading(false);

      // Always acknowledge identically so the screen cannot be used to discover
      // which email addresses have an account.
      if (error) console.error('Password reset request failed', error);
      setSent(true);
    } catch (err: any) {
      setLoading(false);
      console.error('Password reset request failed', err);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-aurora-100 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-aurora-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Check Your Email</h2>
          <p className="text-slate-600 mb-2">
            We've sent a password reset link to <span className="font-semibold text-slate-800">{email}</span>
          </p>
          <p className="text-sm text-slate-500 mb-6">
            The link will expire in 30 minutes. If you don't see it, check your spam folder.
          </p>
          <button onClick={() => onSwitch('login')} className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-aurora">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <ScriviaLogo light className="w-10 h-10 shrink-0" />
            <ScriviaWordmark light />
          </div>
          <h2 className="text-lg font-semibold text-white">Forgot Password</h2>
          <p className="text-sm text-slate-400 mt-1">Enter your email to receive a reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
              placeholder="juan.delacruz@deped.gov.ph"
              required
            />
          </div>

          {turnstileEnabled && <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>

          <p className="text-center text-sm text-slate-600">
            Remember your password?{' '}
            <button type="button" onClick={() => onSwitch('login')} className="text-aurora-600 font-semibold hover:underline">
              Sign In
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}