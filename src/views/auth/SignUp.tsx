import { useRef, useState } from 'react';
import { Eye, EyeOff, Check, X, ArrowRight, Clock } from 'lucide-react';
import { ScriviaLogo, ScriviaWordmark } from '@/components/ScriviaLogo';
import { useAuth } from '@/lib/auth';
import { turnstileEnabled } from '@/lib/turnstile';
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';
import { validatePassword, validateEmail, validateMobile } from '@/lib/validation';

export default function SignUp({ onSwitch }: { onSwitch: (view: 'login' | 'signup' | 'forgot' | 'verify' | 'reset') => void }) {
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [office, setOffice] = useState('');
  const [position, setPosition] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const pwValidation = validatePassword(password);
  const emailsValid = validateEmail(email);
  const mobileValid = validateMobile(mobile);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const validationErrors: string[] = [];
  if (!firstName.trim()) validationErrors.push('First name is required');
  if (!lastName.trim()) validationErrors.push('Last name is required');
  if (!emailsValid) validationErrors.push('Please enter a valid email address');
  if (!mobileValid) validationErrors.push('Please enter a valid mobile number');
  if (!office.trim()) validationErrors.push('Office/School assignment is required');
  if (!position.trim()) validationErrors.push('Position/Designation is required');
  if (!employeeNumber.trim()) validationErrors.push('Employee number is required');
  if (!pwValidation.isValid) validationErrors.push('Password does not meet all requirements');
  if (!passwordsMatch) validationErrors.push('Passwords do not match');

  const canSubmit = validationErrors.length === 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (validationErrors.length > 0) {
      setError(validationErrors.join('\n'));
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the security check to continue.');
      return;
    }

    setLoading(true);
    const { error } = await signUp({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      mobileNumber: mobile.trim(),
      username: username.trim() || undefined,
      officeAssignment: office.trim(),
      positionDesignation: position.trim(),
      employeeNumber: employeeNumber.trim(),
      password,
    }, turnstileToken || undefined);
    setLoading(false);

    if (error) {
      turnstileRef.current?.reset();
      setError(error);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Submitted for Approval</h2>
          <p className="text-slate-600 mb-2">
            Your account has been submitted for approval.
          </p>
          <p className="text-sm text-slate-500 mb-2">
            A verification link has been sent to your email — click it to verify your account.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            After verifying, please wait for the System Administrator to review and approve your registration.
            You will receive an email once your account has been approved.
          </p>
          <button
            onClick={() => onSwitch('login')}
            className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-aurora"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const CheckItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? 'text-aurora-600' : 'text-slate-400'}`}>
      {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      {label}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-8 pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">              <ScriviaLogo light className="w-10 h-10 shrink-0" />
              <ScriviaWordmark light />
          </div>
          <h2 className="text-lg font-semibold text-white">Create Your Account</h2>
          <p className="text-sm text-slate-400 mt-1">Register to access the payroll system</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="Juan"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="Dela Cruz"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:border-transparent text-sm ${
                touched && !emailsValid ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-aurora-500'
              }`}
              placeholder="juan.delacruz@deped.gov.ph"
              required
            />
            {touched && !emailsValid && <p className="text-xs text-red-500 mt-1">Please enter a valid email address</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:border-transparent text-sm ${
                touched && !mobileValid ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-aurora-500'
              }`}
              placeholder="+63 917 123 4567"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Office / School Assignment</label>
            <input
              type="text"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
              placeholder="e.g. Cabanatuan City Elementary School"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Position / Designation</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="e.g. Teacher I"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee Number</label>
              <input
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="e.g. 1234567"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Username <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
              placeholder="jdelacruz"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aurora-500 focus:border-transparent text-sm"
                placeholder="Min 12 characters"
                required
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-3 py-2.5 pr-10 border rounded-lg focus:ring-2 focus:border-transparent text-sm ${
                  touched && !passwordsMatch ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-aurora-500'
                }`}
                placeholder="Re-enter password"
                required
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {touched && !passwordsMatch && confirmPassword.length > 0 && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          {turnstileEnabled && <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 aurora-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-aurora"
          >
            {loading ? 'Submitting...' : 'Submit for Approval'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <button type="button" onClick={() => onSwitch('login')} className="text-aurora-600 font-semibold hover:underline">
              Sign In
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
