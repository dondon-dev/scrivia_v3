/**
 * Auth Provider — adapted for PocketBase.
 *
 * Drop-in replacement for the Supabase-based auth.tsx. The public API
 * (useAuth, signIn, signUp, signOut, etc.) is identical so every existing
 * component that calls useAuth() works without changes.
 *
 * ── Two-factor authentication ────────────────────────────────────────────────
 * The second factor is a TOTP code (RFC 6238, SHA-256) from an authenticator
 * app, NOT an e-mailed OTP. The gate lives in `pb_hooks/mfa_totp.pb.js` and runs
 * before PocketBase mints a token, so an enrolled account cannot obtain a
 * password-only session by any route — including by calling the API directly.
 *
 * The code travels in the auth request body as `otp` (that is the channel the
 * hook reads; see its `codeFromRequest`). Three consequences shape this file:
 *
 *   1. `signIn` cannot retry with a code, because the code is typed after the
 *      password is accepted. A rejection carrying `MFA_REQUIRED` parks the
 *      credentials in `mfaSessionRef` and moves the UI to the code screen.
 *   2. `verifyMfa` re-sends the password AND the code, and is the only place a
 *      session is established for an enrolled account. It must not call
 *      `signIn` (the previous implementation did, which re-triggered the gate
 *      and could never succeed).
 *   3. A privileged account that has NOT enrolled still gets a session, so it can
 *      reach the enrolment screen; that session is flagged with
 *      `needsMfaEnrolment` and the app refuses to show anything else until the
 *      factor is registered. The server records each such sign-in as
 *      `mfa_enrolment_required` so the gap is visible in the audit trail.
 */
import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from 'react';
import { pb, formatError } from '@/lib/pb';
import { toUserRole, isMfaPrivileged } from '@/lib/authz';
import type { UserProfile } from '@/types/auth';

/** Set when a confirmation-link session successfully marks the profile verified. */
export const EMAIL_JUST_VERIFIED_KEY = 'scrivia_email_just_verified';
/** Email most recently used at sign-up / resend, so the verify screen can prefill. */
export const PENDING_SIGNUP_EMAIL_KEY = 'scrivia_pending_email';

/** PocketBase's native record-auth endpoint — the one the MFA gate intercepts. */
const AUTH_ENDPOINT = '/api/collections/profiles/auth-with-password';

/** What `POST /api/auth/mfa/status` reports for the signed-in account. */
export interface MfaStatus {
  enrolled: boolean;
  privileged: boolean;
  recovery_codes_remaining: number;
  last_used_at?: string | null;
}

interface AuthState {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  session: { access_token: string } | null;
  loading: boolean;
  /** Password accepted, waiting for the authenticator code. */
  needsMfa: boolean;
  mfaEmail: string | null;
  /** Signed in, but a privileged account that has not registered a factor yet. */
  needsMfaEnrolment: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (identifier: string, password: string, rememberMe: boolean, turnstileToken?: string) => Promise<{ error: string | null; needsMfa?: boolean; needsMfaEnrolment?: boolean }>;
  verifyMfa: (code: string) => Promise<{ error: string | null }>;
  /** Abandon the code step and return to the login form. */
  cancelMfa: () => void;
  signUp: (data: SignUpData, turnstileToken?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  logAudit: (action: string, recordType?: string, recordId?: string, details?: Record<string, unknown>) => Promise<void>;
  /** Start TOTP enrolment for the signed-in account. Returns the shared secret. */
  enrolMfa: () => Promise<{ error: string | null; secret?: string; otpauthUri?: string }>;
  /** Prove the authenticator works; on success returns the single-use recovery codes. */
  confirmMfaEnrolment: (code: string) => Promise<{ error: string | null; recoveryCodes?: string[] }>;
  /** Clear the enrolment gate once the factor is registered (refreshes the profile). */
  completeMfaEnrolment: () => Promise<void>;
  regenerateRecoveryCodes: () => Promise<{ error: string | null; recoveryCodes?: string[] }>;
  mfaStatus: () => Promise<{ error: string | null; status?: MfaStatus }>;
  /** Super-admin: clear another account's factor so it can enrol again. */
  resetUserMfa: (userId: string) => Promise<{ error: string | null }>;
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

interface AuthResponse {
  token: string;
  record: { id: string; email: string };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const INACTIVITY_TIMEOUT = 10 * 60 * 1000;
const REMEMBER_ME_KEY = 'payrollpro_remember';
const SESSION_ACTIVE_KEY = 'payrollpro_session_active';

const EMPTY_AUTH_STATE: AuthState = {
  user: null, profile: null, session: null,
  loading: false, needsMfa: false, mfaEmail: null, needsMfaEnrolment: false,
};

/**
 * The server tags MFA refusals with a stable machine-readable prefix
 * (`MFA_REQUIRED: …`, `MFA_INVALID: …`, `MFA_UNAVAILABLE: …`) precisely so the
 * client can branch on the code rather than pattern-match prose that is free to
 * be reworded. Returns '' when the message carries no MFA code.
 */
function mfaErrorCode(err: unknown): string {
  const message = formatError(err) || '';
  const match = message.match(/\b(MFA_[A-Z_]+)\b/);
  return match ? match[1] : '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...EMPTY_AUTH_STATE, loading: true });
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Credentials parked between the password step and the code step. Held in a
   * ref, never in state: a password must not land in React state where a dev
   * tools inspection or an error report could capture it.
   */
  const mfaSessionRef = useRef<{ identifier: string; password: string; rememberMe: boolean } | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const record = await pb.collection('profiles').getOne(userId);
      // PocketBase stores email verification in its native `verified` auth field;
      // the app-level gate reads `email_verified`, so map it here (was previously
      // undefined for every record, blocking even verified accounts at sign-in).
      const rec = record as unknown as Record<string, unknown>;
      // Canonicalize the role here, once, at the auth boundary. Permissions,
      // labels, navigation and dashboard routing all key off `role`, so a stored
      // value with casing/space variance ("Payroll_Admin", "payroll admin ")
      // would otherwise resolve to zero permissions and show Access Denied on
      // every screen. Values that match no known role are left verbatim so they
      // still fail closed instead of being granted some other role's access.
      const rawRole = typeof rec.role === 'string' ? rec.role : null;
      const canonicalRole = toUserRole(rawRole);
      return {
        ...record,
        role: canonicalRole ?? (rec.role as UserProfile['role']),
        email_verified: rec.verified === true,
      } as unknown as UserProfile;
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
            loading: false, needsMfa: false, mfaEmail: null,
            // A restored session for an un-enrolled privileged account must still
            // be stopped at the enrolment screen; otherwise reloading the page
            // would be a way to walk past it.
            needsMfaEnrolment: isMfaPrivileged(profile.role) && !profile.mfa_enabled,
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
          // `needsMfaEnrolment` is carried over from the previous state: it is set
          // by the caller that just completed the sign-in, and the async profile
          // fetch here can resolve after it, which would otherwise silently drop
          // the gate and let an un-enrolled privileged account into the app.
          setState((prev) => ({
            user: { id: record.id, email: record.email },
            profile,
            session: { access_token: pb.authStore.token },
            loading: false, needsMfa: false, mfaEmail: null,
            needsMfaEnrolment: prev.needsMfaEnrolment,
          }));
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

  /** POST to the gated auth endpoint. `otp` is the second factor, when known. */
  const authenticate = useCallback(async (
    identifier: string, password: string, otp?: string,
  ): Promise<AuthResponse> => {
    const body: Record<string, string> = { identity: identifier, password };
    if (otp) body.otp = otp;
    // The gate needs the password *and* the code in the same request, so a
    // second attempt must not cancel the first mid-flight.
    return await pb.send(AUTH_ENDPOINT, {
      method: 'POST',
      body,
      requestKey: null,
    }) as unknown as AuthResponse;
  }, []);

  /**
   * Persist the session, load the profile and apply the account-status rules.
   * Shared by the plain sign-in and the post-code sign-in so the two paths can
   * never drift on what counts as a usable account.
   */
  const establishSession = useCallback(async (
    authData: AuthResponse, rememberMe: boolean,
  ): Promise<{ error: string | null; profile: UserProfile | null }> => {
    if (!authData?.token || !authData.record?.id) {
      // A 200 with an empty body (no token, no record id) means the server's
      // auth hook chain did not complete — e.g. stale pb_hooks loaded before
      // an edit was saved. Surfacing that beats the misleading
      // "Account record not found." that fetchProfile(undefined) would produce.
      return { error: 'Sign-in service returned an incomplete response. Please try again in a moment.', profile: null };
    }

    pb.authStore.save(authData.token, authData.record);

    const profile = await fetchProfile(authData.record.id);
    if (!profile) {
      pb.authStore.clear();
      return { error: 'Account record not found.', profile: null };
    }

    if (profile.status !== 'approved') {
      pb.authStore.clear();
      if (profile.status === 'pending_approval') {
        return { error: 'Account pending administrator approval.', profile: null };
      }
      return { error: 'This account cannot sign in.', profile: null };
    }

    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }
    sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

    // Log success
    pb.collection('login_attempts').create({
      email: authData.record.email, user_id: authData.record.id, success: true,
    }).catch(() => {});

    return { error: null, profile };
  }, [fetchProfile]);

  const signIn = useCallback(async (
    identifier: string, password: string, rememberMe: boolean, _turnstileToken?: string,
  ): Promise<{ error: string | null; needsMfa?: boolean; needsMfaEnrolment?: boolean }> => {
    let authData: AuthResponse;
    try {
      authData = await authenticate(identifier, password);
    } catch (err) {
      if (mfaErrorCode(err) === 'MFA_REQUIRED') {
        // Correct password, enrolled account, no code yet. Park the credentials
        // for the code step and make sure no half-session survives — the gate
        // never minted a token, but the auth store may still hold an old one.
        mfaSessionRef.current = { identifier, password, rememberMe };
        pb.authStore.clear();
        setState((prev) => ({
          ...prev,
          needsMfa: true, mfaEmail: identifier, needsMfaEnrolment: false,
          user: null, session: null, profile: null, loading: false,
        }));
        return { error: null, needsMfa: true };
      }
      return { error: formatError(err) || 'Invalid credentials.' };
    }

    const { error, profile } = await establishSession(authData, rememberMe);
    if (error || !profile) return { error: error ?? 'Sign-in failed.' };

    const session = { access_token: authData.token };
    const user = { id: authData.record.id, email: authData.record.email };

    // Un-enrolled privileged account: the session is real and the enrolment
    // endpoints need it, but the app must show nothing but the enrolment screen.
    if (isMfaPrivileged(profile.role) && !profile.mfa_enabled) {
      mfaSessionRef.current = null;
      setState({
        user, profile, session,
        loading: false, needsMfa: false, mfaEmail: null, needsMfaEnrolment: true,
      });
      resetInactivityTimer();
      return { error: null, needsMfaEnrolment: true };
    }

    setState({
      user, profile, session,
      loading: false, needsMfa: false, mfaEmail: null, needsMfaEnrolment: false,
    });
    resetInactivityTimer();
    return { error: null };
  }, [authenticate, establishSession, resetInactivityTimer]);

  const verifyMfa = useCallback(async (code: string): Promise<{ error: string | null }> => {
    const pending = mfaSessionRef.current;
    if (!pending) return { error: 'Session expired. Please log in again.' };

    let authData: AuthResponse;
    try {
      authData = await authenticate(pending.identifier, pending.password, code);
    } catch (err) {
      const mfaCode = mfaErrorCode(err);
      if (mfaCode === 'MFA_UNAVAILABLE') {
        return { error: formatError(err) };
      }
      if (mfaCode === 'MFA_INVALID') {
        return { error: 'That code was not accepted. Wait for the next code in your authenticator app, or use a recovery code.' };
      }
      return { error: formatError(err) || 'Verification failed. Please try again.' };
    }

    const { error, profile } = await establishSession(authData, pending.rememberMe);
    if (error || !profile) return { error: error ?? 'Verification failed.' };

    mfaSessionRef.current = null;
    setState({
      user: { id: authData.record.id, email: authData.record.email },
      profile,
      session: { access_token: authData.token },
      loading: false, needsMfa: false, mfaEmail: null,
      needsMfaEnrolment: isMfaPrivileged(profile.role) && !profile.mfa_enabled,
    });
    resetInactivityTimer();
    return { error: null };
  }, [authenticate, establishSession, resetInactivityTimer]);

  const cancelMfa = useCallback(() => {
    mfaSessionRef.current = null;
    setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null }));
  }, []);

  // ── Enrolment, recovery codes and status ──────────────────────────────────

  const refreshProfile = useCallback(async () => {
    const user = (pb.authStore as any).model;
    if (!user) return;
    const profile = await fetchProfile(user.id);
    if (profile) setState(prev => ({ ...prev, profile }));
  }, [fetchProfile]);

  const enrolMfa = useCallback(async (): Promise<{ error: string | null; secret?: string; otpauthUri?: string }> => {
    try {
      const res = await pb.send('/api/auth/mfa/enrol', { method: 'POST', body: {} }) as { secret?: string; otpauth_uri?: string };
      if (!res?.secret) return { error: 'The server did not return a setup key. Please try again.' };
      return { error: null, secret: res.secret, otpauthUri: res.otpauth_uri };
    } catch (err) {
      return { error: formatError(err) || 'Could not start two-factor enrolment.' };
    }
  }, []);

  const confirmMfaEnrolment = useCallback(async (code: string): Promise<{ error: string | null; recoveryCodes?: string[] }> => {
    try {
      const res = await pb.send('/api/auth/mfa/verify-enrolment', { method: 'POST', body: { code } }) as {
        ok?: boolean; recovery_codes?: string[]; error?: string;
      };
      if (!res?.ok) {
        return { error: res?.error || 'That code was not accepted. Check your phone\'s clock, then try the next code.' };
      }
      return { error: null, recoveryCodes: res.recovery_codes ?? [] };
    } catch (err) {
      const message = formatError(err) || '';
      if (message.includes('invalid_code')) {
        return { error: 'That code was not accepted. Check your phone\'s clock, then try the next code.' };
      }
      return { error: message || 'Could not complete enrolment.' };
    }
  }, []);

  const completeMfaEnrolment = useCallback(async () => {
    // Read the profile back first: `mfa_enabled` is what the gate checks, and the
    // gate must not be lifted on the strength of a client-side assumption.
    await refreshProfile();
    setState(prev => ({ ...prev, needsMfaEnrolment: false }));
  }, [refreshProfile]);

  const regenerateRecoveryCodes = useCallback(async (): Promise<{ error: string | null; recoveryCodes?: string[] }> => {
    try {
      const res = await pb.send('/api/auth/mfa/recovery-codes/regenerate', { method: 'POST', body: {} }) as { recovery_codes?: string[] };
      return { error: null, recoveryCodes: res?.recovery_codes ?? [] };
    } catch (err) {
      return { error: formatError(err) || 'Could not generate new recovery codes.' };
    }
  }, []);

  const mfaStatus = useCallback(async (): Promise<{ error: string | null; status?: MfaStatus }> => {
    try {
      const res = await pb.send('/api/auth/mfa/status', { method: 'POST', body: {} }) as MfaStatus;
      return { error: null, status: res };
    } catch (err) {
      return { error: formatError(err) || 'Could not read your two-factor status.' };
    }
  }, []);

  const resetUserMfa = useCallback(async (userId: string): Promise<{ error: string | null }> => {
    try {
      await pb.send('/api/auth/mfa/reset', { method: 'POST', body: { p_target_user: userId } });
      return { error: null };
    } catch (err) {
      return { error: formatError(err) || 'Could not reset two-factor authentication.' };
    }
  }, []);

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
    ...state, signIn, verifyMfa, cancelMfa, signUp, signOut,
    refreshProfile, updateProfile, logAudit,
    enrolMfa, confirmMfaEnrolment, completeMfaEnrolment,
    regenerateRecoveryCodes, mfaStatus, resetUserMfa,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
