import { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { ScriviaLogo, ScriviaWordmark } from '@/components/ScriviaLogo';
import { supabase } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';

export default function ResetPassword({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sends the access token in the URL hash after clicking the email link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      } else {
        // Try to get the session from the URL hash
        const hash = window.location.hash;
        if (hash.includes('access_token') || hash.includes('type=recovery')) {
          const { error } = await supabase.auth.getSession();
          if (!error) setReady(true);
        }
      }
      setReady(true);
    };
    checkSession();
  }, []);

  const pwValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSubmit = pwValidation.isValid && passwordsMatch && !loading && ready;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      console.error('Password update failed', error);
      setError('Unable to update your password. Please request a new reset link and try again.');
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-aurora-100 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-aurora-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Password Updated</h2>
          <p className="text-slate-600 mb-6">Your password has been successfully changed. You can now log in with your new password.</p>
          <button onClick={() => onSwitch('login')} className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-aurora">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const CheckItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? 'text-aurora-600' : 'text-slate-400'}`}>
      {ok ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
      {label}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <ScriviaLogo light className="w-10 h-10 shrink-0" />
            <ScriviaWordmark light />
          </div>
          <h2 className="text-lg font-semibold text-white">Reset Password</h2>
          <p className="text-sm text-slate-400 mt-1">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {!ready && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Verifying your reset link...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="Min 12 characters"
                required
                disabled={!ready}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 rounded-lg">
                <CheckItem ok={pwValidation.checks.length} label="12+ characters" />
                <CheckItem ok={pwValidation.checks.uppercase} label="Uppercase letter" />
                <CheckItem ok={pwValidation.checks.lowercase} label="Lowercase letter" />
                <CheckItem ok={pwValidation.checks.number} label="Number" />
                <CheckItem ok={pwValidation.checks.special} label="Special character" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:border-transparent text-sm ${
                confirmPassword.length > 0 && !passwordsMatch ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-aurora-500'
              }`}
              placeholder="Re-enter new password"
              required
              disabled={!ready}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
          >
            {loading ? 'Updating...' : 'Update Password'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
