const fs = require('fs');

// auth_security.pb.js cron
{
  const P = 'pocketbase_bin/pb_hooks/auth_security.pb.js';
  let s = fs.readFileSync(P, 'utf8');
  const before = s;
  s = s.replace(
    `const expired = $app.dao().findRecordsByFilter(otpCollection, "used = true || expires_at < {:now}", "-created", 1000, 0, { now: nowIso() });`,
    `const expired = $app.dao().findRecordsByFilter(otpCollection, "used = true || expires_at < {:now}", "-created", 1000, 0, { now: new Date().toISOString() });`
  );
  // login_attempts has no created_at alias column — use the system "created"
  s = s.replace(
    `$app.dao().findRecordsByFilter("login_attempts", "created_at < {:cutoff}"`,
    `$app.dao().findRecordsByFilter("login_attempts", "created < {:cutoff}"`
  );
  fs.writeFileSync(P, s);
  console.log('auth_security cron:', s === before ? 'NO CHANGE' : 'patched');
}

// dashboard.pb.js cron is self-contained (no helper refs) — nothing to do.
console.log('done');
