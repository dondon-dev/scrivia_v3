/**
 * Turnstile integration health check (read-only).
 *
 * Verifies, without printing any secret values:
 *   1. Whether the `turnstile-verify` edge function is deployed.
 *   2. Whether `TURNSTILE_SECRET_KEY` is registered as a project secret
 *      (name listing only).
 *   3. A functional probe: invokes the function with a dummy token. A
 *      `verification_failed` response means the secret is configured and the
 *      function reaches Cloudflare; `server_not_configured` means the secret
 *      is missing; a 404 means the function is not deployed.
 *
 * Usage:
 *   bun scripts/check-turnstile.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN environment variable.');
  process.exit(1);
}
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');
if (!projectRef) {
  console.error('Missing SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const BASE = `https://api.supabase.com/v1/projects/${projectRef}`;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, body };
}

console.log(`Turnstile health check → project ${projectRef}\n`);

// 1) Deployed functions
const funcs = await api('/functions');
if (funcs.ok) {
  const list = (funcs.body as { slug: string; status: string; verify_jwt: boolean }[] ?? []);
  const ts = list.find((f) => f.slug === 'turnstile-verify');
  console.log(`Edge functions deployed: ${list.map((f) => f.slug).join(', ') || '(none)'}`);
  console.log(
    ts
      ? `turnstile-verify: deployed (status=${ts.status}, verify_jwt=${ts.verify_jwt})`
      : 'turnstile-verify: NOT deployed',
  );
} else {
  console.log(`functions list: HTTP ${funcs.status} ${JSON.stringify(funcs.body).slice(0, 200)}`);
}

// 2) Project secrets (names only — values are redacted by the API and never printed)
const sec = await api('/secrets');
if (sec.ok) {
  const names = (sec.body as { name: string }[] ?? []).map((s) => s.name);
  console.log(`\nProject secrets registered: ${names.join(', ') || '(none)'}`);
  console.log(`TURNSTILE_SECRET_KEY: ${names.includes('TURNSTILE_SECRET_KEY') ? 'present' : 'MISSING'}`);
} else {
  console.log(`secrets list: HTTP ${sec.status} ${JSON.stringify(sec.body).slice(0, 200)}`);
}

// 3) Client-side site key (PUBLIC, not a secret — it is embedded in every
//    rendered page, so displaying it is safe). Only when this is set does
//    the widget actually render on the auth forms.
const siteKey = process.env.VITE_TURNSTILE_SITE_KEY?.trim();
console.log(`\nClient env VITE_TURNSTILE_SITE_KEY: ${siteKey ? 'present' : 'MISSING'}`);
if (siteKey) console.log(`  site key (public): ${siteKey}`);

// 4) Functional probe — dummy token, expect verification_failed (secret works) or
//    server_not_configured (secret missing) or 404 (function absent)
const probe = await api('/functions/turnstile-verify/invoke', {
  method: 'POST',
  body: JSON.stringify({ token: '0000.dummy-token-for-health-check' }),
});
console.log(`\nProbe invoke turnstile-verify: HTTP ${probe.status}`);
if (probe.ok || probe.status === 500) {
  console.log(`  body: ${JSON.stringify(probe.body).slice(0, 200)}`);
} else {
  console.log(`  body: ${JSON.stringify(probe.body).slice(0, 200)}`);
}
