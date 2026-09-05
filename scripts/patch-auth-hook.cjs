const fs = require('fs');
const P = 'pocketbase_bin/pb_hooks/auth_security.pb.js';
let s = fs.readFileSync(P, 'utf8');

const before = s;

// Fix 1: after-auth handler — e.httpContext.request is a METHOD in v0.22.
// The old code treated it as a property and called .remoteAddr() on the
// function itself, panicking the JSVM on every successful login.
s = s.replace(
  `  if (authRecord) {
    // Reset failed attempts on successful login
    $app.dao().updateRecord(authRecord.set({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: nowIso(),
      last_login_ip: e.httpContext?.request?.remoteAddr() ?? null,
    }));

    // Log successful login
    const loginAttempt = new Record($app.dao().findCollectionByNameOrId("login_attempts"), {
      email: record.email,
      user_id: authRecord.id(),
      success: true,
      ip_address: e.httpContext?.request?.remoteAddr() ?? null,
      user_agent: e.httpContext?.request?.header()?.get("User-Agent") ?? null,
      created_at: nowIso(),
    });
    $app.dao().saveRecord(loginAttempt);
  }`,
  `  if (authRecord) {
    // v0.22: e.httpContext is an echo.Context — request() is a METHOD and must
    // be called. Accessing it as a property returns the function itself, and
    // calling .remoteAddr() on that panicked the JSVM (breaking every login).
    let remoteIp = null;
    let userAgent = null;
    try {
      const req = e.httpContext.request();
      remoteIp = req && req.remoteAddr ? req.remoteAddr() : null;
      const h = req && req.header ? req.header() : null;
      userAgent = h && h.get ? h.get("User-Agent") : null;
    } catch (_) {
      /* headers/IP are best-effort — never block a successful login */
    }

    // Reset failed attempts on successful login
    try {
      $app.dao().updateRecord(authRecord.set({
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: nowIso(),
        last_login_ip: remoteIp,
      }));
    } catch (_) { /* best-effort */ }

    // Log successful login
    try {
      const loginAttempt = new Record($app.dao().findCollectionByNameOrId("login_attempts"), {
        email: record.email,
        user_id: authRecord.id(),
        success: true,
        ip_address: remoteIp,
        user_agent: userAgent,
        created_at: nowIso(),
      });
      $app.dao().saveRecord(loginAttempt);
    } catch (_) { /* audit row is best-effort */ }
  }`
);

// Fix 2: before-auth handler — the e.httpContext?.request?.body chain never
// resolved (request is a method), so the lockout check silently never ran.
// Read the submitted body via $apis.requestInfo instead.
s = s.replace(
  `onRecordBeforeAuthWithPasswordRequest((e) => {
  // Check if account is locked
  const identifier = e.httpContext?.request?.body?.email ?? e.httpContext?.request?.body?.phone ?? "";
  if (!identifier) return;`,
  `onRecordBeforeAuthWithPasswordRequest((e) => {
  // Check if account is locked
  // v0.22: read the submitted body via $apis.requestInfo — the old
  // e.httpContext?.request?.body chain never resolved (request is a method),
  // so the lockout check silently never ran.
  let identifier = "";
  try {
    const info = $apis.requestInfo(e.httpContext);
    const body = info && info.data ? info.data : {};
    identifier = body.email || body.identity || body.phone || "";
  } catch (_) {
    return;
  }
  if (!identifier) return;`
);

if (s === before) {
  console.error('NO CHANGES APPLIED — patterns not found');
  process.exit(1);
}
fs.writeFileSync(P, s);
console.log('Patched OK. New size:', s.length);
// sanity: no leftover broken chains
console.log('leftover broken chains:', (s.match(/httpContext\?\.request\?\.body|httpContext\?\.request\?\.remoteAddr|httpContext\?\.request\?\.header/g) || []).length);
