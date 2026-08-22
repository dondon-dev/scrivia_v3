import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { verifyTurnstileToken } from '@/lib/turnstile';
import type { UserProfile } from '@/types/auth';

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

/** Set when a confirmation-link session successfully marks the profile verified. */
export const EMAIL_JUST_VERIFIED_KEY = 'scrivia_email_just_verified';
/** Email most recently used at sign-up / resend, so the verify screen can prefill. */
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

/**
 * True when the URL hash carries a freshly-issued confirmation token (Supabase
 * appends `#access_token=...&type=signup|invite|...` after the user clicks the
 * email link). Recovery links (`type=recovery`) are password-reset links, not
 * confirmation links, so they are deliberately excluded.
 */
function hasVerificationToken(): boolean {
  const hash = window.location.hash;
  if (/type=recovery/.test(hash)) return false;
  return /(access_token|type=(signup|invite|magiclink|email_change|email|sms))/.test(hash);
}

/**
 * True when the identifier looks like a phone number (contains digits and is
 * not an email address). Anything containing "@" is treated as an email.
 */
function isPhoneIdentifier(value: string): boolean {
  return !value.includes('@') && /\d/.test(value);
}

/**
 * Normalizes a phone number toward E.164 (what Supabase Auth expects):
 *  - keeps an existing "+" prefix as-is,
 *  - converts an international "00..." prefix to "+",
 *  - converts a PH local format leading "0" (e.g. 09171234567) to +63...,
 *  - otherwise returns the digits as typed.
 */
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data as UserProfile | null;
  }, []);

  /**
   * Resolves the authoritative email-verification state for a signed-in user.
   *
   * auth.users.email_confirmed_at is the ground truth: Supabase sets it when
   * the user clicks the confirmation link. profiles.email_verified is only a
   * derived copy that can go stale (e.g. when the mark_email_verified RPC is
   * missing because migrations were never pushed to the project), which would
   * otherwise lock already-verified users out forever. When the auth provider
   * says the email is confirmed, the account is verified — sync the derived
   * flag best-effort and proceed.
   */
  const resolveVerifiedProfile = useCallback(async (user: User, profile: UserProfile): Promise<UserProfile> => {
    if (profile.email_verified || !user.email_confirmed_at) return profile;
    // Best-effort sync of the derived flag — never a login blocker.
    const { error } = await supabase.rpc('mark_email_verified');
    if (!error) {
      const fresh = await fetchProfile(user.id);
      if (fresh) return fresh;
    }
    return { ...profile, email_verified: true };
  }, [fetchProfile]);

  const logAudit = useCallback(async (
    action: string,
    recordType?: string,
    recordId?: string,
    details?: Record<string, unknown>,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      record_type: recordType ?? null,
      record_id: recordId ?? null,
      details: details ?? null,
    });
  }, []);

  /**
   * Applies the session gate for a live session and returns the profile the
   * user may keep, or null after signing the session out.
   *
   * Critical: when the session just arrived from a confirmation link, the
   * profile is still `email_verified = false` and must be marked verified here
   * BEFORE the approval gate can sign out. Otherwise the link's token is
   * consumed by supabase-js and thrown away — the "I clicked the link but
   * nothing happened" bug that leaves accounts stuck unverified forever.
   */
  const applySessionGate = useCallback(async (user: User): Promise<UserProfile | null> => {
    let profile = await fetchProfile(user.id);
    const fromVerificationLink = hasVerificationToken();

    if (profile) {
      profile = await resolveVerifiedProfile(user, profile);
    }
    if (fromVerificationLink && profile?.email_verified) {
      // Let the verify screen show "Email Verified!" even though this session
      // is about to be signed out (pending approval users must not keep it).
      sessionStorage.setItem(EMAIL_JUST_VERIFIED_KEY, '1');
    }

    if (!profile || !profile.email_verified || profile.status !== 'approved') {
      await supabase.auth.signOut();
      return null;
    }
    return profile;
  }, [fetchProfile, resolveVerifiedProfile]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('audit_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action: 'auto_logout_inactivity',
          });
        }
        await supabase.auth.signOut();
        sessionStorage.removeItem(SESSION_ACTIVE_KEY);
        setState(s => ({ ...s, user: null, profile: null, session: null, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      })();
    }, INACTIVITY_TIMEOUT);
  }, []);

  // The verification code is generated, hashed and stored entirely server-side;
  // the browser never receives it.
  const issueOtp = useCallback(async (email: string): Promise<boolean> => {
    const { error } = await supabase.rpc('issue_mfa_code', { p_email: email.toLowerCase() });
    return !error;
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        const isRemembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
        const sessionActive = sessionStorage.getItem(SESSION_ACTIVE_KEY);
        const fromVerificationLink = hasVerificationToken();

        // A session that just arrived from a confirmation link is short-lived:
        // it exists only so the profile can be marked verified, so it must
        // survive the remember-me gate.
        if (!isRemembered && !sessionActive && !fromVerificationLink) {
          await supabase.auth.signOut();
          setState(EMPTY_AUTH_STATE);
          return;
        }

        const profile = await applySessionGate(session.user);
        if (!mounted) return;

        if (!profile) {
          setState(EMPTY_AUTH_STATE);
          return;
        }

        setState({ user: session.user, profile, session, loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null });
        resetInactivityTimer();
      } else {
        setState(EMPTY_AUTH_STATE);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      (async () => {
        if (event === 'SIGNED_OUT' || !session) {
          sessionStorage.removeItem(SESSION_ACTIVE_KEY);
          if (!mfaSessionRef.current) {
            setState({ user: null, profile: null, session: null, loading: false, needsMfa: false, mfaEmail: null, pendingMfaCode: null });
          }
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const profile = await applySessionGate(session.user);
          if (!mounted) return;
          if (!profile) {
            // applySessionGate already signed the session out (unverified,
            // pending approval, or missing profile); the SIGNED_OUT event that
            // follows resets the state.
            return;
          }
          setState(prev => ({
            ...prev,
            user: session.user,
            profile,
            session,
            loading: false,
          }));
          resetInactivityTimer();
        }
      })();
    });

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetInactivityTimer();
    activityEvents.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      activityEvents.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [fetchProfile, resetInactivityTimer]);

  const signIn = useCallback(async (identifier: string, password: string, rememberMe: boolean, turnstileToken?: string): Promise<{ error: string | null; needsMfa?: boolean; mfaCode?: string }> => {
    try {
      // Cloudflare Turnstile: when the login form produced a token, verify it
      // server-side before attempting authentication. If the site key is not
      // configured, the client never sends a token and this is skipped.
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return { error: 'Security verification failed. Please refresh the page and try again.' };
      }

      // The login form accepts an email address OR a phone number; Supabase
      // Auth has a dedicated phone path, so branch on the identifier shape.
      const isPhone = isPhoneIdentifier(identifier);
      const { data, error } = await supabase.auth.signInWithPassword(
        isPhone ? { phone: normalizePhone(identifier), password } : { email: identifier, password }
      );

      if (error) {
        await supabase.from('login_attempts').insert({ email: identifier, success: false, failure_reason: error.code ?? 'invalid_credentials' });
        await supabase.rpc('record_failed_login', { p_email: identifier.toLowerCase() });
        // Surface the two most common blocked states instead of a generic
        // 'invalid credentials' so the user knows what to do.
        if (error.code === 'email_not_confirmed') {
          return { error: 'Your email address has not been verified yet. Check your inbox for the verification link and click it before signing in.' };
        }
        return { error: 'Invalid email/phone or password.' };
      }

      if (!data.user) return { error: 'Invalid email/phone or password.' };

      let profile = await fetchProfile(data.user.id);

      // Profile could not be loaded (missing row, RLS, unapplied migration).
      // Continuing would silently dump the user back to the login screen after
      // a successful auth — fail loudly with an actionable message instead.
      if (!profile) {
        await supabase.auth.signOut();
        return { error: 'Your account record could not be loaded. Please contact your administrator.' };
      }

      if (profile.status !== 'approved') {
        await supabase.auth.signOut();
        if (profile.status === 'pending_approval') {
          return { error: 'Your account is pending administrator approval. You will be notified once approved.' };
        }
        return { error: 'This account cannot sign in. Please contact your administrator.' };
      }

      // auth.users.email_confirmed_at (set by Supabase when the link is
      // clicked) is the authoritative verification signal; the derived
      // profiles.email_verified flag can be stale, so resolve before gating.
      profile = await resolveVerifiedProfile(data.user, profile);

      // Without this check, signIn 'succeeds' and the onAuthStateChange guard
      // silently signs the user right back out — an invisible login loop.
      if (!profile.email_verified) {
        await supabase.auth.signOut();
        return { error: 'Your email has not been verified yet. Check your inbox and click the verification link, or request a new one, before signing in.' };
      }

      // Multi-factor: no session may exist until the code has been verified
      // server-side, so sign the just-created session out and hold the
      // credentials in memory only. The OTP is emailed to the account's
      // registered email (a phone sign-in still has an email to receive it).
      const accountEmail = data.user.email ?? identifier;
      if (profile?.mfa_enabled) {
        const issued = await issueOtp(accountEmail);
        if (!issued) return { error: 'Unable to start verification. Please try again.' };

        mfaSessionRef.current = { identifier, isPhone, password };
        await supabase.auth.signOut();
        setState(prev => ({
          ...prev,
          needsMfa: true,
          mfaEmail: accountEmail,
          pendingMfaCode: null,
          user: null,
          session: null,
          profile: null,
          loading: false,
        }));
        return { error: null, needsMfa: true };
      }

      // Set session keys before any RPC so the session is recognized as active
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
      sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

      // Logging — non-blocking, must not prevent login
      supabase.from('login_attempts').insert({ email: identifier, user_id: data.user.id, success: true }).then(() => {});
      supabase.rpc('record_successful_login').then(() => {});

      setState(prev => ({ ...prev, user: data.user, session: data.session, profile, needsMfa: false, mfaEmail: null, pendingMfaCode: null, loading: false }));
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

    const { data: result, error: rpcError } = await supabase.rpc('verify_mfa_code', {
      p_email: email.toLowerCase(),
      p_code: code,
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

    // Only now is a session created — reusing the same identifier type (email
    // or phone) the user signed in with.
    const { data, error } = await supabase.auth.signInWithPassword(
      pending.isPhone
        ? { phone: normalizePhone(pending.identifier), password: pending.password }
        : { email: pending.identifier, password: pending.password }
    );
    mfaSessionRef.current = null;
    if (error || !data.user) {
      setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      return { error: 'Session expired. Please log in again.' };
    }

    let profile = await fetchProfile(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      return { error: 'Your account record could not be loaded. Please contact your administrator.' };
    }
    if (profile.status !== 'approved') {
      await supabase.auth.signOut();
      setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      return { error: 'This account cannot sign in. Please contact your administrator.' };
    }
    // Authoritative check: the auth provider confirmed the email (see
    // resolveVerifiedProfile for why the derived flag alone is not enough).
    profile = await resolveVerifiedProfile(data.user, profile);
    if (!profile.email_verified) {
      await supabase.auth.signOut();
      setState(prev => ({ ...prev, needsMfa: false, mfaEmail: null, pendingMfaCode: null }));
      return { error: 'Your email has not been verified yet. Please verify your email before signing in.' };
    }

    sessionStorage.setItem(SESSION_ACTIVE_KEY, Date.now().toString());

    // Logging — non-blocking
    supabase.from('login_attempts').insert({ email, user_id: data.user.id, success: true }).then(() => {});
    supabase.rpc('record_successful_login').then(() => {});

    setState(prev => ({
      ...prev,
      user: data.user,
      session: data.session,
      profile,
      needsMfa: false,
      mfaEmail: null,
      pendingMfaCode: null,
      loading: false,
    }));
    resetInactivityTimer();
    return { error: null };
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
      // Cloudflare Turnstile: block bot sign-ups before calling Supabase.
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return { error: 'Security verification failed. Please refresh the page and try again.' };
      }

      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.firstName,
            last_name: data.lastName,
            mobile_number: data.mobileNumber,
            username: data.username || null,
            office_assignment: data.officeAssignment,
            position_designation: data.positionDesignation,
            employee_number: data.employeeNumber,
          },
          // Point the confirmation link back at this app regardless of the
          // Supabase project's configured Site URL / redirect allow-list.
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        console.error('Sign-up failed', error);
        return { error: 'Unable to complete registration. Please check your details and try again.' };
      }
      // Remember the address so the verify screen can prefill the resend form.
      localStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, data.email.toLowerCase());
      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred during registration.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('audit_logs').insert({ user_id: user.id, user_email: user.email, action: 'logout' });
    }
    await supabase.auth.signOut();
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
    const { error } = await supabase.from('profiles').update(updates).eq('id', state.user.id);
    if (error) {
      console.error('Profile update failed', error);
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
