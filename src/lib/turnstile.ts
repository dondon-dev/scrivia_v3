/**
 * Cloudflare Turnstile — bot protection for the auth forms.
 *
 * The widget only activates when VITE_TURNSTILE_SITE_KEY is configured AND
 * `VITE_TURNSTILE_ENABLED === 'true'`. Turnstile is currently disabled (the
 * master switch below defaults to off), so the app behaves exactly as before
 * (no widget, no blocking); enabling Cloudflare is purely additive.
 *
 * Token verification happens server-side via the Supabase Edge Function
 * `turnstile-verify` (see supabase/functions/turnstile-verify), which calls
 * Cloudflare's siteverify API with the secret key — the secret never reaches
 * the browser.
 */

import { pb } from '@/lib/pb';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export const TURNSTILE_SITE_KEY: string | undefined =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || undefined;

/**
 * Master switch — Turnstile is currently DISABLED.
 *
 * The widget only activates when BOTH a site key is configured AND
 * `VITE_TURNSTILE_ENABLED === 'true'`. It was switched off because the site
 * key's Cloudflare Hostnames list did not include the preview host
 * (`scriviacloud.freebuff.app`), so the widget failed to render and the auth
 * forms blocked login. To re-enable later:
 *   1. Set `VITE_TURNSTILE_ENABLED=true` in the environment keys, and
 *   2. In Cloudflare → Turnstile, add every host the app runs on (e.g.
 *      `scriviacloud.freebuff.app`, `scriviacloud.com`, `www.scriviacloud.com`,
 *      `localhost`) to the site key's Hostnames list.
 */
export const turnstileEnabled =
  Boolean(TURNSTILE_SITE_KEY) && import.meta.env.VITE_TURNSTILE_ENABLED === 'true';

/* ── global declarations for the injected widget API ─────────────────── */

interface TurnstileWidgetApi {
  render: (
    container: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'compact' | 'flexible';
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidgetApi;
    onTurnstileReady?: () => void;
  }
}

/* ── server-side verification ─────────────────────────────────────────── */

/**
 * Verify a Turnstile token via the PocketBase API endpoint `turnstile-verify`.
 * Returns true only when Cloudflare confirmed the token. Safe to call from
 * any auth screen — the secret key stays on the server.
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  try {
    const { data, error } = await pb.send('/api/turnstile-verify', {
      method: 'POST',
      body: { token },
    });
    return !error && !!data && data.success === true;
  } catch {
    return false;
  }
}

/* ── script loading (idempotent) ──────────────────────────────────────── */

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  if (typeof window === 'undefined') return Promise.resolve();

  scriptPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile"]',
    );
    if (existing) {
      if (window.turnstile) { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      return;
    }

    const script = document.createElement('script');
    script.src = `${SCRIPT_SRC}?render=explicit`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Render the Turnstile widget into `container`. Returns an object with
 * `reset()` and `remove()` for lifecycle control. If the site key is not
 * configured (or rendering fails), it resolves to null and login proceeds
 * normally.
 */
export async function renderTurnstile(
  container: HTMLElement,
  onToken: (token: string) => void,
  onError?: () => void,
): Promise<{ reset: () => void; remove: () => void } | null> {
  if (!turnstileEnabled || !TURNSTILE_SITE_KEY) return null;

  await loadTurnstileScript();

  // The widget API is injected by the script; poll briefly for it.
  let attempts = 0;
  while (!window.turnstile && attempts < 100) {
    await new Promise((r) => setTimeout(r, 50));
    attempts++;
  }
  if (!window.turnstile) return null;

  try {
    const widgetId = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: onToken,
      'expired-callback': () => onToken(''),
      'error-callback': () => onError?.(),
      theme: 'auto',
      size: 'flexible',
    });

    return {
      reset: () => window.turnstile?.reset(widgetId),
      remove: () => window.turnstile?.remove(widgetId),
    };
  } catch {
    return null;
  }
}
