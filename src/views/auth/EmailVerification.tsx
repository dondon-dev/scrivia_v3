import { useState, useEffect } from 'react';
import { Mail, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { pb } from '@/lib/pb';
import { EMAIL_JUST_VERIFIED_KEY, PENDING_SIGNUP_EMAIL_KEY } from '@/lib/auth';
import LoadingIndicator from '@/components/LoadingIndicator';

export default function EmailVerification({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const [status, setStatus] = useState<'checking' | 'verified' | 'error'>('checking');
  const [resendEmail, setResendEmail] = useState(() => localStorage.getItem(PENDING_SIGNUP_EMAIL_KEY) ?? '');
  const [showResend, setShowResend] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const confirmVerified = () => {
      if (cancelled) return;
      setStatus('verified');
      setShowResend(false);
    };

    // Fast path: the auth provider already processed the confirmation link and
    // marked the profile verified (see applySessionGate in lib/auth.tsx).
    if (sessionStorage.getItem(EMAIL_JUST_VERIFIED_KEY) === '1') {
      confirmVerified();
      return;
    }

    // Attempt to verify now: the URL hash may carry the access token (fresh
    // link click in this tab), or the session may already exist. mark_email_verified
    // is idempotent and only succeeds once the auth provider confirmed the email.
    const tryConfirm = async () => {
      if (cancelled) return;
      if (sessionStorage.getItem(EMAIL_JUST_VERIFIED_KEY) === '1') {
        confirmVerified();
        return;
      }
      const token = pb.authStore.token;
      const model = pb.authStore.model;
      if (!token || !model) return;
      // PocketBase sets email_confirmed_at on the auth record when verification link is clicked
      if (!(model as any).verified && !(model as any).email_confirmed_at) return;
      try {
        await pb.send('/api/auth/mark-verified', { method: 'POST' });
      } catch {
        // ignore
      }
      sessionStorage.setItem(EMAIL_JUST_VERIFIED_KEY, '1');
      confirmVerified();
    };

    void tryConfirm();

    // Listen for auth state changes
    const unsubscribe = pb.authStore.onChange(() => {
      if (!cancelled) void tryConfirm();
    });
    const poll = setInterval(() => void tryConfirm(), 4000);

    const resendTimer = setTimeout(() => setShowResend(true), 2000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(resendTimer);
      unsubscribe();
    };
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    setResendError(null);
    const email = resendEmail.trim().toLowerCase();
    localStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, email);

    try {
      // Call PocketBase hook to resend verification email
      const { error } = await pb.send('/api/auth/resend-verification', {
        method: 'POST',
        body: { email, redirect_url: window.location.origin },
      });
      setResending(false);

      if (error) {
        const msg = error?.message?.toLowerCase() ?? '';
        if (msg.includes('rate') || msg.includes('too many')) {
          setResendError('Too many requests. Please wait a minute before trying again.');
        } else if (msg.includes('not found') || msg.includes('no user') || msg.includes('invalid')) {
          setResendError('No account found with that email address. Check the spelling or register a new account.');
        } else {
          setResendError(error.message || 'Unable to resend the verification email. Please try again.');
        }
        return;
      }
      setResendSent(true);
    } catch (err: any) {
      setResending(false);
      setResendError(err?.message || 'Unable to resend the verification email. Please try again.');
    }
  };

  const proceedToLogin = () => {
    sessionStorage.removeItem(EMAIL_JUST_VERIFIED_KEY);
    onSwitch('login');
  };

  if (status === 'verified') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-aurora-100 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-aurora-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Email Verified!</h2>
          <p className="text-slate-600 mb-6">Your email has been successfully verified. You can now log in to your account.</p>
          <button onClick={proceedToLogin} className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-aurora">
            Proceed to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6 text-center">
          <ScriviaLogo light className="w-10 h-10 mx-auto mb-4" />
          <div className="w-14 h-14 rounded-full bg-aurora-500/20 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-aurora-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Verify Your Email</h2>
          <p className="text-sm text-slate-400 mt-1">Check your inbox for the verification link</p>
        </div>

        <div className="p-8 space-y-5 text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Waiting for verification</p>
                <p className="text-blue-600">Click the link in your email to verify your account. This page will update automatically once verified.</p>
              </div>
            </div>
          </div>

          {showResend && !resendSent && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600 mb-3">Didn't receive an email?</p>
              <form onSubmit={handleResend} className="space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                  placeholder="Enter your email"
                  required
                />
                <button
                  type="submit"
                  disabled={resending || !resendEmail.trim()}
                  className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 text-sm"
                >
                  {resending ? <LoadingIndicator size={40} /> : <RefreshCw className="w-4 h-4" />}
                  {resending ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </form>
              {resendError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mt-3 flex items-start gap-2 text-left">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{resendError}</span>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-3">
                Can't find it? Check your spam or junk folder — verification emails sometimes land there.
              </p>
            </div>
          )}

          {resendSent && (
            <div className="bg-aurora-50 border border-aurora-200 text-aurora-700 text-sm rounded-lg p-3">
              Verification email resent to <span className="font-semibold">{resendEmail}</span>! Check your inbox (and spam folder).
            </div>
          )}

          <button onClick={() => onSwitch('login')} className="text-sm text-slate-500 hover:text-slate-700">
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}