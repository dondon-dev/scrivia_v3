/**
 * Auth Provider — adapted for PocketBase.
 *
 * Drop-in replacement for the Supabase-based auth.tsx. The public API
 * (useAuth, signIn, signUp, signOut, etc.) is identical so every existing
 * component that calls useAuth() works without changes.
 */
import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from 'react';
import { pb, formatError } from '@/lib/pb';
import type { UserProfile } from '@/types/auth';

/** Set when a confirmation-link session successfully marks the profile verified. */
export const EMAIL_JUST_VERIFIED_KEY = 'scrivia_email_just_verified';
/** Email most recently used at sign-up / resend, so the verify screen can prefill. */
export const PENDING_SIGNUP_EMAIL_KEY = 'scrivia_pending_email';

interface AuthState {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  session: { access_token: string } | null;
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

const EMPTY_AUTH_STATE: AuthState = {
  user: null, profile: null, session: null,
  loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...EMPTY_AUTH_STATE, loading: true });
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

  const logAudit = useCallback(async (
    action: string, recordType?: string, recordId?: string, details?: Record<string, unknown>,
  ) => {
    const user = (pb.authStore as any).model;
    if (!user) return;
    try {
      await pb.collection('audit_logs').create({
        user_id: user.id,
        user_email: user.email,
        action,
        record_type: recordType ?? null,
        record_id: recordId ?? null,
        details: details ? JSON.stringify(details) : null,
      });
    } catch { /* non-blocking */ }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      (async () => {
        const user = (pb.authStore as any).model;
        if (user) {
          await logAudit('auto_logout_inactivity');
        }
        pb.authStore.clear();
        sessionStorage.removeItem(SESSION_ACTIVE_KEY);
        setState(EMPTY_AUTH_STATE);
      })();
    }, INACTIVITY_TIMEOUT);
  }, [logAudit]);

  // Initialize: check for existing session
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (pb.authStore.isValid) {
        const isRemembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
        const sessionActive = sessionStorage.getItem(SESSION_ACTIVE_KEY);

        if (!isRemembered && !sessionActive) {
          pb.authStore.clear();
          if (mounted) setState(EMPTY_AUTH_STATE);
          return;
        }

        const record = (pb.authStore as any).model;
        if (record) {
          const profile = await fetchProfile(record.id);
          if (!mounted) return;
          if (!profile || profile.status !== 'approved') {
            pb.authStore.clear();
            setState(EMPTY_AUTH_STATE);
            return;
          }
          setState({
            user: { id: record.id, email: record.email },
            profile,
            session: { access_token: pb.authStore.token },
            loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null,
          });
          resetInactivityTimer();
          return;
        }
      }
      if (mounted) setState(EMPTY_AUTH_STATE);
    })();

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange(() => {
      if (!mounted) return;
      const isValid = pb.authStore.isValid;
      const record = (pb.authStore as any).model;

      if (!isValid || !record) {
        setState(EMPTY_AUTH_STATE);
        return;
      }

      // Refresh profile on auth change
      fetchProfile(record.id).then((profile) => {
        if (!mounted) return;
        if (profile) {
          setState({
            user: { id: record.id, email: record.email },
            profile,
            session: { access_token: pb.authStore.token },
            loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null,
          });
          resetInactivityTimer();
        }
      });
    });

    // Activity listeners
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

  const signIn = useCallback(async (
    identifier: string, password: string, rememberMe: boolean, _turnstileToken?: string,
  ): Promise<{ error: string | null; needsMfa?: boolean }> => {
    try {
      // PocketBase auth
      const authData = await pb.collection('profiles').authWithPassword(identifier, password);

      if (!authData.record) {
        return { error: 'Invalid credentials.' };
      }

      const profile = await fetchProfile(authData.record.id);
      if (!profile) {
        pb.authStore.clear();
        return { error: 'Account record not found.' };
      }

      if (profile.status !== 'approved') {
        pb.authStore.clear();
        if (profile.status === 'pending_approval') {
          return { error: 'Account pending administrator approval.' };
        }
        return { error: 'This account cannot sign in.' };
      }

      // MFA check
      if (profile.mfa_enabled) {
        const mfaResult = await pb.send('/api/auth/mfa/issue', {
          method: 'POST', body: { email: identifier },
        });
        if (mfaResult) {
          mfaSessionRef.current = { identifier, isPhone: false, password };
          pb.authStore.clear();
          setState(prev => ({
            ...prev, needsMfa: true, mfaEmail: identifier,
            user: null, session: null, profile: null, loading: false,
          }));
          return { error: null, needsMfa: true };
        }
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
      sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

      // Log success
      pb.collection('login_attempts').create({
        email: identifier, user_id: authData.record.id, success: true,
      }).catch(() => {});

      setState({
        user: { id: authData.record.id, email: authData.record.email },
        profile,
        session: { access_token: pb.authStore.token },
        loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null,
      });
      resetInactivityTimer();
      return { error: null };
    } catch (err) {
      return { error: formatError(err) || 'Invalid credentials.' };
    }
  }, [fetchProfile, resetInactivityTimer]);

  const verifyMfa = useCallback(async (code: string): Promise<{ error: string | null }> => {
    const email = state.mfaEmail;
    const pending = mfaSessionRef.current;
    if (!email || !pending) return { error: 'Session expired. Please log in again.' };

    try {
      const result = await pb.send('/api/auth/mfa/verify', {
        method: 'POST', body: { email, code },
      }) as { ok?: boolean; reason?: string };

      if (!result.ok) {
        mfaSessionRef.current = null;
        setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null }));
        return { error: 'Verification failed. Please log in again.' };
      }

      // Complete auth
      return await signIn(pending.identifier, pending.password, true);
    } catch {
      return { error: 'Verification failed.' };
    }
  }, [state.mfaEmail, signIn]);

  const resendMfa = useCallback(async (): Promise<{ error: string | null }> => {
    const email = state.mfaEmail;
    if (!email) return { error: 'Session expired.' };
    try {
      await pb.send('/api/auth/mfa/issue', { method: 'POST', body: { email } });
      return { error: null };
    } catch {
      return { error: 'Unable to send verification code.' };
    }
  }, [state.mfaEmail]);

  const signUp = useCallback(async (data: SignUpData, _turnstileToken?: string): Promise<{ error: string | null }> => {
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
        role: 'read_only',
        status: 'pending_approval',
        email_verified: false,
      });
      return { error: null };
    } catch (err) {
      return { error: formatError(err) || 'Registration failed.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    const user = (pb.authStore as any).model;
    if (user) {
      await logAudit('logout');
    }
    pb.authStore.clear();
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
    mfaSessionRef.current = null;
    setState(EMPTY_AUTH_STATE);
  }, [logAudit]);

  const refreshProfile = useCallback(async () => {
    const user = (pb.authStore as any).model;
    if (!user) return;
    const profile = await fetchProfile(user.id);
    if (profile) setState(prev => ({ ...prev, profile }));
  }, [fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<{ error: string | null }> => {
    const user = (pb.authStore as any).model;
    if (!user) return { error: 'Not authenticated.' };
    try {
      await pb.collection('profiles').update(user.id, updates);
      await refreshProfile();
      return { error: null };
    } catch (err) {
      return { error: formatError(err) };
    }
  }, [refreshProfile]);

  const value: AuthContextValue = {
    ...state, signIn, verifyMfa, resendMfa, signUp, signOut,
    refreshProfile, updateProfile, logAudit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
