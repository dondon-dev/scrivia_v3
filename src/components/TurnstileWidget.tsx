import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { renderTurnstile, turnstileEnabled, TURNSTILE_SITE_KEY } from '@/lib/turnstile';

/**
 * Log a diagnostic breadcrumb for Turnstile failures. The most common cause
 * of a widget refusing to render is a hostname mismatch: Turnstile site keys
 * are bound to specific domains, and the current host (e.g. a preview URL)
 * must be listed in the site's Hostnames setting in the Cloudflare dashboard.
 */
function logTurnstileFailure(reason: string) {
  console.warn('[Turnstile] ' + reason, {
    siteKey: TURNSTILE_SITE_KEY,
    hostname: typeof window !== 'undefined' ? window.location.hostname : undefined,
    href: typeof window !== 'undefined' ? window.location.href : undefined,
    hint: 'Turnstile site keys are bound to specific hostnames — add the current domain (and localhost for local dev) to the site in the Cloudflare dashboard, and make sure the site key + secret key come from the same Turnstile site.',
  });
}

export interface TurnstileWidgetHandle {
  /** Clear the current token and re-render the challenge (after a failed submit). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
}

/**
 * Cloudflare Turnstile human-check widget shared by the auth forms.
 *
 * Renders nothing when the site key is not configured, so enabling Cloudflare
 * is purely additive. Exposes a `reset()` handle for re-challenging after a
 * failed submission.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken }, ref) {
    const [failed, setFailed] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlRef = useRef<{ reset: () => void; remove: () => void } | null>(null);

    useEffect(() => {
      if (!turnstileEnabled) return;
      const el = containerRef.current;
      if (!el) return;

      let cancelled = false;
      (async () => {
        const control = await renderTurnstile(
          el,
          (token) => { onToken(token); setFailed(false); },
          () => {
            setFailed(true);
            logTurnstileFailure('Widget reported a render error (check the Cloudflare-hosted widget logs in the browser console for the error code).');
          },
        );
        if (!cancelled) {
          controlRef.current = control;
          if (!control) {
            logTurnstileFailure('Widget could not be initialized — the Turnstile script did not load in time or rendering was blocked.');
          }
        }
      })();

      return () => {
        cancelled = true;
        controlRef.current?.remove();
        controlRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        onToken('');
        controlRef.current?.reset();
      },
    }), [onToken]);

    if (!turnstileEnabled) return null;

    return (
      <div>
        <div ref={containerRef} className="turnstile-widget w-full min-h-[65px] flex items-center justify-center" />
        {failed && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-1.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            Security check failed to load — please refresh and try again.
          </p>
        )}
      </div>
    );
  },
);
