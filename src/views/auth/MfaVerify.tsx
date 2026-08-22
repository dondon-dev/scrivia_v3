import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { useAuth } from '@/lib/auth';

export default function MfaVerify({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const { verifyMfa, resendMfa, mfaEmail } = useAuth();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!mfaEmail) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">
          <p className="text-slate-600 mb-4">MFA session expired. Please log in again.</p>
          <button onClick={() => onSwitch('login')} className="text-aurora-600 font-semibold hover:underline">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d !== '')) {
      submitCode(newCode.join(''));
    }
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
      const newCode = pasted.split('').concat(Array(6 - pasted.length).fill(''));
      setCode(newCode);
      if (pasted.length === 6) submitCode(pasted);
      else inputRefs.current[pasted.length]?.focus();
    }
  };

  const submitCode = async (fullCode: string) => {
    if (fullCode.length !== 6) return;
    setLoading(true);
    setError(null);
    const { error } = await verifyMfa(fullCode);
    setLoading(false);
    if (error) {
      setError(error);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const { error, mfaCode } = await resendMfa();
    if (error) {
      setError(error);
    } else {
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setResendCooldown(30);
      if (mfaCode) {
        // In production this would be emailed
      }
    }
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
            Enter the 6-digit code sent to<br />
            <span className="font-medium text-slate-300">{mfaEmail}</span>
          </p>
        </div>

        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 text-center">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
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
            onClick={() => submitCode(code.join(''))}
            disabled={loading || code.some(d => !d)}
            className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>

          <div className="text-center">
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-sm text-slate-600 hover:text-aurora-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
            </button>
          </div>

          <div className="text-center pt-2 border-t border-slate-100">
            <button onClick={() => onSwitch('login')} className="text-sm text-slate-500 hover:text-slate-700">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
