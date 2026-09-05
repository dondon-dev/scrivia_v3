const fs = require('fs');
const P = 'pocketbase_bin/pb_hooks/auth_security.pb.js';
const lines = fs.readFileSync(P, 'utf8').split('\n');

// Replace the onRecordAfterAuthWithPasswordRequest handler (1-indexed lines 438..481)
// with a v0.22-safe version:
//  - models.Record.set(key, value) returns void in v0.22 (batch set({}) is v0.23),
//    so updateRecord(authRecord.set({...})) handed `undefined` to Go -> panic -> 400.
//  - models.Record has no .email property in v0.22; use getString("email").
const START = 438, END = 481;

const replacement = `onRecordAfterAuthWithPasswordRequest((e) => {
  // This fires after successful password auth - record the successful login.
  // v0.22-safe rewrite: set(key, value) per field (batch set({}) does not exist
  // here and set() returns void), and read the email via getString("email").
  try {
    const record = e.record;
    if (!record) return;
    const email = record.getString("email") || "";
    if (!email) return;

    const authRecord = $app.dao().findFirstRecordByData("profiles", "email", email);
    if (!authRecord) return;

    // v0.22: e.httpContext is an echo.Context — request() is a METHOD.
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
      authRecord.set("failed_login_attempts", 0);
      authRecord.set("locked_until", null);
      authRecord.set("last_login_at", nowIso());
      if (remoteIp) authRecord.set("last_login_ip", remoteIp);
      $app.dao().updateRecord(authRecord);
    } catch (_) { /* best-effort */ }

    // Log successful login
    try {
      const col = $app.dao().findCollectionByNameOrId("login_attempts");
      const loginAttempt = new Record(col);
      loginAttempt.set("email", email);
      loginAttempt.set("user_id", authRecord.id());
      loginAttempt.set("success", true);
      if (remoteIp) loginAttempt.set("ip_address", remoteIp);
      if (userAgent) loginAttempt.set("user_agent", userAgent);
      loginAttempt.set("created_at", nowIso());
      $app.dao().saveRecord(loginAttempt);
    } catch (_) { /* audit row is best-effort */ }
  } catch (_) { /* never block a successful login */ }
});`;

const out = lines.slice(0, START - 1).concat(replacement.split('\n'), lines.slice(END));
fs.writeFileSync(P, out.join('\n'));
console.log('afterAuth handler replaced. New line count:', out.length);
