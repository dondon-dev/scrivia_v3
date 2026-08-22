# Cloudflare Integration — PayRoll Pro (DepEd Payroll)

This project uses Cloudflare in two layers:

1. **Edge protection (CDN + WAF + DDoS)** — Cloudflare sits in front of the
   deployed site and blocks exploits, bots, and floods before they reach the app.
2. **Turnstile bot protection** — a human-check widget on the login form,
   verified server-side via a Supabase Edge Function.

---

## Part 1 — Edge protection (CDN / WAF / DDoS)

Configured in the Cloudflare dashboard (no code required). The app code is
unaffected; Cloudflare proxies the existing domain.

1. Create a free account at **cloudflare.com** and add your site's domain.
2. Cloudflare scans your DNS records; copy the two nameservers it gives you and
   update them at your domain registrar (this points traffic through Cloudflare).
3. In **DNS → Records**, make sure your site's A/AAAA records are **proxied**
   (orange cloud icon, not grey).
4. **Security → WAF** — the free plan includes the managed WAF rule set
   (blocks SQL injection, XSS, common exploit payloads). Leave it on.
5. **Security → DDoS** — always-on on the free plan.
6. **SSL/TLS → Overview** — set mode to **Full (strict)**.
7. **Security → Bots** — enable **Bot Fight Mode** on the free plan.
8. **Security → WAF → Rate limiting rules** — add a rule like:
   - If `URI Path` contains `/auth` and `Method` equals `POST` → **Block** when
     more than **20 requests per 60 seconds**.
9. Verify with **securityheaders.io** and **SSL Labs** after the DNS change
   propagates (can take minutes to hours).

### Keys for the Keys tab (edge layer)

These are only needed if you want to manage the zone programmatically later
(they are **not** read by the app code):

| Key | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (Account → API Tokens → Create Token, scope: Zone → Zone → Read + Zone Settings → Edit) |
| `CLOUDFLARE_ZONE_ID` | Zone ID shown on the domain's Overview page |

---

## Part 2 — Turnstile (auth-form bot protection)

Turnstile protects the **Sign In**, **Sign Up**, and **Forgot Password** forms:
any submission is blocked until a valid human-check token is verified
server-side.

1. Cloudflare dashboard → **Turnstile** → **Add site**:
   - Hostname: your deployed domain (add `localhost` for local testing).
   - Widget mode: **Managed**.
2. Copy the **Site Key** (public) and **Secret Key** (server-only).
3. Add the keys (Keys tab / env):

| Key | Where used |
| --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | Frontend — renders the widget on the login form (`src/lib/turnstile.ts`). |
| `TURNSTILE_SECRET_KEY` | Supabase Edge Function `turnstile-verify` — server-side `siteverify` call. |

4. Deploy the verification function:

   ```bash
   supabase functions deploy turnstile-verify --no-verify-jwt
   ```

5. Every auth form automatically shows the Turnstile widget **only when**
   `VITE_TURNSTILE_SITE_KEY` is set — until then the app behaves exactly as
   before. Once the key is set, a valid human-check token is required before
   the action runs (login, sign-up, password reset), and the token is
   verified against Cloudflare first.

### How verification works

```
Auth form → Turnstile widget issues token
         → supabase.functions.invoke('turnstile-verify', { token })
         → Edge Function calls https://challenges.cloudflare.com/turnstile/v0/siteverify
             with TURNSTILE_SECRET_KEY
         → only on success → the auth action proceeds
```

The secret key never reaches the browser.

---

## Files in this integration

- `src/lib/turnstile.ts` — widget loader/rendering + `verifyTurnstileToken` with graceful fallback.
- `src/components/TurnstileWidget.tsx` — shared widget component (mount, token callback, reset handle).
- `src/views/auth/Login.tsx`, `SignUp.tsx`, `ForgotPassword.tsx` — widget + token requirement + server verification.
- `src/lib/auth.tsx` — `signIn` / `signUp` verify the token via the Edge Function.
- `supabase/functions/turnstile-verify/index.ts` — server-side siteverify.
- `index.html` — CSP updated to allow `challenges.cloudflare.com`.
