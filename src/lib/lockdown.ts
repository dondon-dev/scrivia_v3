/**
 * Emergency database lockdown + threat-event tracking.
 *
 * Purpose: if the system is under attack (e.g. repeated malicious file
 * uploads), the app auto-locks itself — all uploads, imports and syncs are
 * blocked and a red banner is shown app-wide. The database is unlocked only
 * with the hardcoded master key below (the emergency "hardcode to unlock"
 * requested by the operator).
 *
 * NOTE: because this key ships in the client bundle, it is NOT a substitute
 * for proper credentials — it is a last-resort emergency bypass. Change
 * MASTER_UNLOCK_KEY before going to production and treat the bundle as public.
 *
 * Lockdown state is mirrored to the `security_settings` table (single row id=1)
 * so it applies across browsers/sessions; threat events are logged to
 * `security_events`. All DB writes degrade gracefully if the migration has not
 * been applied yet.
 */

import { supabase } from './supabase';

export interface LockdownState {
  locked: boolean;
  reason: string | null;
  at: string | null;
}

interface ThreatEvent {
  at: string;
  detail: string;
  source: string;
}

/** Hardcoded emergency master unlock key — change before production. */
export const MASTER_UNLOCK_KEY = 'PAYROLLPRO-MASTER-UNLOCK-2026';

const STORAGE_KEY = 'payrollpro.lockdown';
const EVENTS_KEY = 'payrollpro.threatEvents';

/** Auto-lock after this many suspicious uploads within the window. */
const AUTO_LOCK_THRESHOLD = 3;
const AUTO_LOCK_WINDOW_MS = 10 * 60 * 1000;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
  try {
    window.dispatchEvent(new CustomEvent('payrollpro:lockdown-change'));
  } catch {
    /* non-DOM environment */
  }
}

export function getLockdown(): LockdownState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { locked: false, reason: null, at: null };
    const parsed = JSON.parse(raw) as Partial<LockdownState>;
    if (parsed.locked) {
      return { locked: true, reason: parsed.reason ?? 'Emergency lockdown active', at: parsed.at ?? new Date().toISOString() };
    }
  } catch {
    /* corrupted storage — treat as unlocked */
  }
  return { locked: false, reason: null, at: null };
}

export function isLockdownActive(): boolean {
  return getLockdown().locked;
}

export function isUploadBlocked(): { blocked: boolean; reason: string | null } {
  const state = getLockdown();
  if (!state.locked) return { blocked: false, reason: null };
  return {
    blocked: true,
    reason: `System is locked: ${state.reason ?? 'emergency lockdown active'}. Uploads and imports are disabled until the database is unlocked.`,
  };
}

export function activateLockdown(reason: string, source = 'manual'): void {
  const state: LockdownState = { locked: true, reason, at: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  emit();
  void persistToDb(state);
  void logEvent({ event_type: 'lockdown_activated', severity: 'critical', detail: reason, source });
}

/**
 * Unlock the database using the hardcoded master key.
 * Works for any signed-in user who possesses the key (it IS the credential).
 */
export function unlockDatabase(masterKey: string): { ok: boolean; error: string | null } {
  if (typeof masterKey !== 'string' || masterKey.trim().length === 0) {
    return { ok: false, error: 'Enter the master unlock key.' };
  }
  if (masterKey !== MASTER_UNLOCK_KEY) {
    return { ok: false, error: 'Invalid unlock key. The database remains locked.' };
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  emit();
  void persistToDb({ locked: false, reason: null, at: null });
  void logEvent({ event_type: 'lockdown_released', severity: 'medium', detail: 'Database unlocked with the master key', source: 'unlock' });
  return { ok: true, error: null };
}

/**
 * Record a detected threat (e.g. a blocked suspicious file upload).
 * Auto-locks the database when several detections happen inside the window.
 */
export function recordThreatEvent(detail: string, source = 'upload'): void {
  const event: ThreatEvent = { at: new Date().toISOString(), detail, source };
  let events: ThreatEvent[] = [];
  try {
    events = JSON.parse(localStorage.getItem(EVENTS_KEY) ?? '[]') as ThreatEvent[];
  } catch {
    events = [];
  }
  events.push(event);
  const cutoff = Date.now() - AUTO_LOCK_WINDOW_MS;
  events = events.filter((e) => Date.parse(e.at) >= cutoff);
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    /* storage unavailable */
  }
  void logEvent({ event_type: 'threat_detected', severity: 'high', detail, source });

  if (events.length >= AUTO_LOCK_THRESHOLD) {
    activateLockdown(
      `Automatic lockdown: ${events.length} suspicious file uploads detected in the last ${Math.round(AUTO_LOCK_WINDOW_MS / 60000)} minutes.`,
      'auto'
    );
  }
}

export function subscribeLockdown(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pull lockdown state from the database (called once per sign-in). */
export async function syncLockdownFromDb(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('security_settings')
      .select('lockdown_enabled,lockdown_reason,lockdown_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) return;
    if (data?.lockdown_enabled && !getLockdown().locked) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            locked: true,
            reason: data.lockdown_reason ?? 'Locked by an administrator',
            at: data.lockdown_at ?? new Date().toISOString(),
          })
        );
      } catch {
        /* storage unavailable */
      }
      emit();
    }
  } catch {
    /* security_settings table may not exist yet — non-fatal */
  }
}

async function persistToDb(state: LockdownState): Promise<void> {
  try {
    await supabase.from('security_settings').upsert(
      {
        id: 1,
        lockdown_enabled: state.locked,
        lockdown_reason: state.reason,
        lockdown_at: state.at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    /* non-fatal — local state still applies for this session */
  }
}

async function logEvent(ev: { event_type: string; severity: string; detail: string; source?: string }): Promise<void> {
  try {
    await supabase.from('security_events').insert(ev);
  } catch {
    /* non-fatal */
  }
}
