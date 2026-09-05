import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { pb } from '@/lib/pb';
import { verifyTurnstileToken } from '@/lib/turnstile';
import type { UserProfile } from '@/types/auth';

// PocketBase-compatible auth types
interface PbUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  verified?: boolean;
  [key: string]: any;
}

interface PbSession {
  user: PbUser;
  access_token: string;
  [key: string]: any;
}

type User = PbUser;
type Session = PbSession;

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  needsMfa: boolean;
  mfaEmail: string | null;
  pendingMfaCode: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (identifier: string, password: string, rememberMe: boolean, turnstileToken?: string) => Promise<{ error: string | null; needsMfa?: boolean; mfaCode?: string }>;
  verifyMfa: (code: string) => Promise<{ error: string | null }>;
  resendMfa: () => Promise<{ error: string | null; mfaCode?: string }>;
  signUp: (data: SignUpData, turnstileToken?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  logAudit: (action: string, recordType?: string, recordId?: string, details?: Record<string, unknown>) => Promise<void>;
}

interface SignUpData {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  username?: string;
  officeAssignment: string;
  positionDesignation: string;
  employeeNumber: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const REMEMBER_ME_KEY = 'payrollpro_remember';
const SESSION_ACTIVE_KEY = 'payrollpro_session_active';

export const EMAIL_JUST_VERIFIED_KEY = 'scrivia_email_just_verified';
export const PENDING_SIGNUP_EMAIL_KEY = 'scrivia_pending_email';

const EMPTY_AUTH_STATE: AuthState = {
  user: null,
  profile: null,
  session: null,
  loading: false,
  needsMfa: false,
  mfaEmail: null,
  pendingMfaCode: null,
};

function hasVerificationToken(): boolean {
  const hash = window.location.hash;
  if (/type=recovery/.test(hash)) return false;
  return /(access_token|type=(signup|invite|magiclink|email_change|email|sms))/.test(hash);
}

function isPhoneIdentifier(value: string): boolean {
  return !value.includes('@') && /\d/.test(value);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 12) {
    return `+63${digits.slice(1)}`;
  }
  return digits;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    needsMfa: false,
    mfaEmail: null,
    pendingMfaCode: null,
  });

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mfaSessionRef = useRef<{ identifier: string; isPhone: boolean; password: string } | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const record = await pb.collection('profiles').getOne(userId);
      return record as unknown as UserProfile;
    } catch {
      return null;
    }
  }, []);

  const resolveVerifiedProfile = useCallback(async (user: User, profile: UserProfile): Promise<UserProfile> => {
    if (profile.email_verified || !user.email_confirmed_at) return profile;
    try {
      await pb.send('/api/auth/mark-verified', { method: 'POST' });
      const fresh = await fetchProfile(user.id);
      if (fresh) return fresh;
    } catch {
      // ignore
    }
    return { ...profile, email_verified: true };
  }, [fetchProfile]);

  const logAudit = useCallback(async (
    action: string,
    recordType?: string,
    recordId?: string,
    details?: Record<string, unknown>,
  ) => {
    try {
      const user = pb.authStore.model;
      if (!user) return;
      await pb.collection('audit_logs').create({
        user_id: user.id,
        user_email: user.email,
        action,
        record_type: recordType ?? null,
        record_id: recordId ?? null,
        details: details ?? null,
      });
    } catch {
      // ignore
    }
  }, []);

  const applySessionGate = useCallback(async (user: User): Promise<UserProfile | null> => {
    let profile = await fetchProfile(user.id);
    const fromVerificationLink = hasVerificationToken();

    if (profile) {
      profile = await resolveVerifiedProfile(user, profile);
    }
    if (fromVerificationLink && profile?.email_verified) {
      sessionStorage.setItem(EMAIL_JUST_VERIFIED_KEY, '1');
    }

    if (!profile || !profile.email_verified || profile.status !== 'approved') {
      pb.authStore.clear();
      return null;
    }
    return profile;
  }, [fetchProfile, resolveVerifiedProfile]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      (async () => {
        const user = pb.authStore.model;
        if (user) {
          try {
            await pb.collection('audit_logs').create({
              user_id: user.id,
              user_email: user.email,
              action: 'auto_logout_inactivity',
            });
          } catch { }
        }
        pb.authStore.clear();
        sessionStorage.removeItem(SESSION_ACTIVE_KEY);
        setState(s => ({ ...s, user: null, profile: null, session: null, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      })();
    }, INACTIVITY_TIMEOUT);
  }, []);

  const issueOtp = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { error } = await pb.send('/api/auth/mfa/issue', {
        method: 'POST',
        body: { p_email: email.toLowerCase() },
      });
      return !error;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Check if we have a valid auth store
      const token = pb.authStore.token;
      const model = pb.authStore.model;

      if (!mounted) return;

      if (token && model) {
        const isRemembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
        const sessionActive = sessionStorage.getItem(SESSION_ACTIVE_KEY);
        const fromVerificationLink = hasVerificationToken();

        if (!isRemembered && !sessionActive && !fromVerificationLink) {
          pb.authStore.clear();
          setState(EMPTY_AUTH_STATE);
          return;
        }

        const profile = await applySessionGate(model as unknown as User);
        if (!mounted) return;

        if (!profile) {
          setState(EMPTY_AUTH_STATE);
          return;
        }

        setState({ user: model as unknown as User, profile, session: { user: model as unknown as User, access_token: token }, loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null });
        resetInactivityTimer();
      } else {
        setState(EMPTY_AUTH_STATE);
      }
    })();

    const unsubscribe = pb.authStore.onChange(() => {
      const hasToken = !!pb.authStore.token;
      if (!hasToken && !mfaSessionRef.current) {
        setState({ user: null, profile: null, session: null, loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null });
      }
    });

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetInactivityTimer();
    activityEvents.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      mounted = false;
      unsubscribe();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      activityEvents.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [fetchProfile, resetInactivityTimer]);

  const signIn = useCallback(async (identifier: string, password: string, rememberMe: boolean, turnstileToken?: string): Promise<{ error: string | null; needsMfa?: boolean; mfaCode?: string }> => {
    try {
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return { error: 'Security verification failed. Please refresh the page and try again.' };
      }

      const isPhone = isPhoneIdentifier(identifier);
      let authData;
      try {
        authData = await pb.collection('profiles').authWithPassword(isPhone ? normalizePhone(identifier) : identifier, password);
      } catch (err: any) {
        await pb.collection('login_attempts').create({ email: identifier, success: false, failure_reason: err?.message ?? 'invalid_credentials' });
        await pb.send('/api/auth/record-failed-login', { method: 'POST', body: { p_email: identifier.toLowerCase() } });
        if (err?.message?.includes('confirm') || err?.message?.includes('verify')) {
          return { error: 'Your email address has not been verified yet. Check your inbox for the verification link and click it before signing in.' };
        }
        return { error: 'Invalid email/phone or password.' };
      }

      if (!authData.record) return { error: 'Invalid email/phone or password.' };

      let profile = await fetchProfile(authData.record.id);

      if (!profile) {
        pb.authStore.clear();
        return { error: 'Your account record could not be loaded. Please contact your administrator.' };
      }

      if (profile.status !== 'approved') {
        pb.authStore.clear();
        if (profile.status === 'pending_approval') {
          return { error: 'Your account is pending administrator approval. You will be notified once approved.' };
        }
        return { error: 'This account cannot sign in. Please contact your administrator.' };
      }

      profile = await resolveVerifiedProfile(authData.record as unknown as User, profile);

      if (!profile.email_verified) {
        pb.authStore.clear();
        return { error: 'Your email has not been verified yet. Check your inbox and click the verification link, or request a new one, before signing in.' };
      }

      if (profile?.mfa_enabled) {
        const issued = await issueOtp(authData.record.email ?? identifier);
        if (!issued) return { error: 'Unable to start verification. Please try again.' };

        mfaSessionRef.current = { identifier, isPhone, password };
        pb.authStore.clear();
        setState(prev => ({
          ...prev,
          needsMfa: true,
          mfaEmail: authData.record.email ?? identifier,
          pendingMfaCode: null,
          user: null,
          session: null,
          profile: null,
          loading: false,
        }));
        return { error: null, needsMfa: true };
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
      sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

      pb.collection('login_attempts').create({ email: identifier, user_id: authData.record.id, success: true }).catch(() => {});
      pb.send('/api/auth/record-successful-login', { method: 'POST' }).catch(() => {});

      setState(prev => ({ ...prev, user: authData.record as unknown as User, session: { user: authData.record as unknown as User, access_token: authData.token }, profile, needsMfa: false, mfaEmail: null, pendingMfaCode: null, loading: false }));
      resetInactivityTimer();
      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, [fetchProfile, issueOtp, resetInactivityTimer, resolveVerifiedProfile]);

  const verifyMfa = useCallback(async (code: string): Promise<{ error: string | null }> => {
    const email = state.mfaEmail;
    const pending = mfaSessionRef.current;
    if (!email || !pending) return { error: 'Session expired. Please log in again.' };

    try {
      const { data: result, error: rpcError } = await pb.send('/api/auth/mfa/verify', {
        method: 'POST',
        body: { p_email: email.toLowerCase(), p_code: code },
      });
      if (rpcError) return { error: 'Unable to verify the code. Please try again.' };

      const outcome = (result ?? {}) as { ok?: boolean; reason?: string; remaining?: number };
      if (!outcome.ok) {
        if (outcome.reason === 'too_many_attempts' || outcome.reason === 'expired') {
          mfaSessionRef.current = null;
          setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
          return { error: 'Verification failed. Please log in again.' };
        }
        const remaining = outcome.remaining;
        return {
          error: typeof remaining === 'number' && remaining > 0
            ? `Invalid code. ${remaining} attempt(s) remaining.`
            : 'Invalid code.',
        };
      }

      let authData;
      try {
        authData = await pb.collection('profiles').authWithPassword(
          pending.isPhone ? normalizePhone(pending.identifier) : pending.identifier,
          pending.password
        );
      } catch {
        mfaSessionRef.current = null;
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
        return { error: 'Session expired. Please log in again.' };
      }
      mfaSessionRef.current = null;
      if (!authData.record) {
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
        return { error: 'Session expired. Please log in again.' };
      }

      let profile = await fetchProfile(authData.record.id);
      if (!profile) {
        pb.authStore.clear();
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
        return { error: 'Your account record could not be loaded. Please contact your administrator.' };
      }
      if (profile.status !== 'approved') {
        pb.authStore.clear();
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
        return { error: 'This account cannot sign in. Please contact your administrator.' };
      }
      profile = await resolveVerifiedProfile(authData.record as unknown as User, profile);
      if (!profile.email_verified) {
        pb.authStore.clear();
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
        return { error: 'Your email has not been verified yet. Please verify your email before signing in.' };
      }

      sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

      pb.collection('login_attempts').create({ email, user_id: authData.record.id, success: true }).catch(() => {});
      pb.send('/api/auth/record-successful-login', { method: 'POST' }).catch(() => {});

      setState(prev => ({
        ...prev,
        user: authData.record as unknown as User,
        session: { user: authData.record as unknown as User, access_token: authData.token },
        profile,
        needsMfa: false,
        mfaEmail: null,
        pendingMfaCode: null,
        loading: false,
      }));
      resetInactivityTimer();
      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, [state.mfaEmail, fetchProfile, resetInactivityTimer, resolveVerifiedProfile]);

  const resendMfa = useCallback(async (): Promise<{ error: string | null; mfaCode?: string }> => {
    const email = state.mfaEmail;
    if (!email) return { error: 'Session expired. Please log in again.' };
    const issued = await issueOtp(email);
    if (!issued) return { error: 'Unable to send a new verification code.' };
    return { error: null };
  }, [state.mfaEmail, issueOtp]);

  const signUp = useCallback(async (data: SignUpData, turnstileToken?: string): Promise<{ error: string | null }> => {
    try {
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return { error: 'Security verification failed. Please refresh the page and try again.' };
      }

      try {
        await pb.collection('profiles').create({
          email: data.email,
          password: data.password,
          passwordConfirm: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          mobile_number: data.mobileNumber,
          username: data.username || null,
          office_assignment: data.officeAssignment,
          position_designation: data.positionDesignation,
          employee_number: data.employeeNumber,
        });
      } catch (err: any) {
        console.error('Sign-up failed', err);
        return { error: 'Unable to complete registration. Please check your details and try again.' };
      }
      localStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, data.email.toLowerCase());
      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred during registration.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    const user = pb.authStore.model;
    if (user) {
      try {
        await pb.collection('audit_logs').create({ user_id: user.id, user_email: user.email, action: 'logout' });
      } catch { }
    }
    pb.authStore.clear();
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    sessionStorage.removeItem(EMAIL_JUST_VERIFIED_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
    mfaSessionRef.current = null;
    setState(EMPTY_AUTH_STATE);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await fetchProfile(state.user.id);
    if (profile) setState(prev => ({ ...prev, profile }));
  }, [state.user, fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<{ error: string | null }> => {
    if (!state.user) return { error: 'Not authenticated.' };
    try {
      await pb.collection('profiles').update(state.user.id, updates);
    } catch (err: any) {
      console.error('Profile update failed', err);
      return { error: 'Unable to save your changes. Please try again.' };
    }
    await refreshProfile();
    return { error: null };
  }, [state.user, refreshProfile]);

  const value: AuthContextValue = {
    ...state,
    signIn, verifyMfa, resendMfa, signUp, signOut, refreshProfile, updateProfile, logAudit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}