
// ── v0.22 JSVM helpers ──────────────────────────────────────────────────────
// PocketBase v0.22 has no Dao.countRecords and c.request().body() is not
// callable from the JSVM — use $apis.requestInfo(c).data instead.
function bodyOf(c) {
  try {
    const info = $apis.requestInfo(c);
    return info && info.data ? info.data : {};
  } catch (_) {
    return {};
  }
}

function countByFilter(collectionNameOrId, filter) {
  try {
    return $app.dao().findRecordsByFilter(collectionNameOrId, filter || "", "", 1000000, 0).length;
  } catch (_) {
    return 0;
  }
}

function collCount(col) {
  try {
    const name = typeof col === "string" ? col : col.name;
    return countByFilter(name, "");
  } catch (_) {
    return 0;
  }
}
// PocketBase Auth & Security Hooks
// Handles: login attempts, audit logs, account lockout, MFA, email verification

/// <reference path="../pb_data/types.d.ts" />

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MFA_CODE_EXPIRY_MINUTES = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function hashCode(code) {
  // Simple hash for MFA code storage (use proper crypto in production)
  return $security.sha256(code);
}

function generateMfaCode() {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Record Login Attempt ───────────────────────────────────────────────────
// Called from frontend after sign-in attempt (success or failure)
routerAdd("POST", "/api/auth/record-failed-login", (c) => {
  const { p_email } = bodyOf(c);
  if (!p_email) return c.json(400, { error: "p_email required" });

  const email = p_email.toLowerCase().trim();
  const profile = $app.dao().findFirstRecordByData("profiles", "email", email);
  if (!profile) return c.json(200, { ok: true }); // Don't reveal if email exists

  const attempts = (profile.get("failed_login_attempts")) + 1;
  const updates = {
    failed_login_attempts: attempts,
    last_login_at: nowIso(),
  };

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    updates.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
  }

  $app.dao().updateRecord(profile.set(updates));

  // Log the failed attempt
  const loginAttempt = new Record($app.dao().findCollectionByNameOrId("login_attempts"), {
    email,
    user_id: profile.id(),
    success: false,
    failure_reason: "invalid_credentials",
    ip_address: c.request().remoteAddr,
    user_agent: c.request().header.get("User-Agent"),
    created_at: nowIso(),
  });
  $app.dao().saveRecord(loginAttempt);

  return c.json(200, { ok: true, attempts, locked: attempts >= MAX_FAILED_ATTEMPTS });
});

routerAdd("POST", "/api/auth/record-successful-login", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile) return c.json(200, { ok: true });

  const updates = {
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: nowIso(),
    last_login_ip: c.request().remoteAddr,
  };
  $app.dao().updateRecord(profile.set(updates));

  const loginAttempt = new Record($app.dao().findCollectionByNameOrId("login_attempts"), {
    email: authRecord.email(),
    user_id: profile.id(),
    success: true,
    ip_address: c.request().remoteAddr,
    user_agent: c.request().header.get("User-Agent"),
    created_at: nowIso(),
  });
  $app.dao().saveRecord(loginAttempt);

  return c.json(200, { ok: true });
});

// ─── MFA Code Management ───────────────────────────────────────────────────
routerAdd("POST", "/api/auth/mfa/issue", (c) => {
  const { p_email } = bodyOf(c);
  if (!p_email) return c.json(400, { error: "p_email required" });

  const email = p_email.toLowerCase().trim();
  const profile = $app.dao().findFirstRecordByData("profiles", "email", email);
  if (!profile) return c.json(200, { ok: true }); // Don't reveal if email exists

  if (!profile.get("mfa_enabled")) {
    return c.json(400, { error: "MFA not enabled for this account" });
  }

  const code = generateMfaCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + MFA_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Store MFA code (invalidate any existing)
  const otpCollection = $app.dao().findCollectionByNameOrId("otp_codes");
  const existing = $app.dao().findFirstRecordByData(otpCollection, "email", email);
  if (existing) {
    $app.dao().deleteRecord(existing);
  }

  const otpRecord = new Record(otpCollection, {
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
    used: false,
  });
  $app.dao().saveRecord(otpRecord);

  // TODO: Send email with code (use $mails.sendRecordVerification or custom)
  // For now, return code in response (dev only - remove in production!)
  return c.json(200, { ok: true, code: code }); // REMOVE IN PRODUCTION
});

routerAdd("POST", "/api/auth/mfa/verify", (c) => {
  const { p_email, p_code } = bodyOf(c);
  if (!p_email || !p_code) return c.json(400, { error: "p_email and p_code required" });

  const email = p_email.toLowerCase().trim();
  const otpCollection = $app.dao().findCollectionByNameOrId("otp_codes");
  const otpRecord = $app.dao().findFirstRecordByData(otpCollection, "email", email);

  if (!otpRecord) {
    return c.json(400, { ok: false, reason: "not_found", remaining: 0 });
  }

  if (otpRecord.get("used")) {
    return c.json(400, { ok: false, reason: "already_used", remaining: 0 });
  }

  const expiresAt = new Date(otpRecord.get("expires_at")).getTime();
  if (Date.now() > expiresAt) {
    $app.dao().deleteRecord(otpRecord);
    return c.json(400, { ok: false, reason: "expired", remaining: 0 });
  }

  const codeHash = hashCode(p_code);
  if (codeHash !== otpRecord.get("code_hash")) {
    // Track failed attempts on the OTP record
    const attempts = (otpRecord.get("attempts") || 0) + 1;
    $app.dao().updateRecord(otpRecord.set("attempts", attempts));

    if (attempts >= 3) {
      $app.dao().deleteRecord(otpRecord);
      return c.json(400, { ok: false, reason: "too_many_attempts", remaining: 0 });
    }
    return c.json(400, { ok: false, reason: "invalid_code", remaining: 3 - attempts });
  }

  // Success - mark as used
  $app.dao().updateRecord(otpRecord.set("used", true));

  return c.json(200, { ok: true });
});

// ─── Email Verification ────────────────────────────────────────────────────
routerAdd("POST", "/api/auth/mark-verified", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile) return c.json(404, { error: "Profile not found" });

  if (profile.get("email_verified")) {
    return c.json(200, { ok: true, already: true });
  }

  $app.dao().updateRecord(profile.set("email_verified", true));

  // Log audit
  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: profile.id(),
    user_email: authRecord.email(),
    action: "email_verified",
    record_type: "profiles",
    record_id: profile.id(),
    details: { method: "confirmation_link" },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

// ─── Account Approval ───────────────────────────────────────────────────────
routerAdd("POST", "/api/auth/approve", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  // Check super_admin role
  const adminProfile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!adminProfile || adminProfile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can approve users" });
  }

  const { p_user_id } = bodyOf(c);
  if (!p_user_id) return c.json(400, { error: "p_user_id required" });

  const user = $app.dao().findRecordById("profiles", p_user_id);
  if (!user) return c.json(404, { error: "User not found" });

  $app.dao().updateRecord(user.set({
    status: "approved",
    approved_by: adminProfile.id,
    approved_at: nowIso(),
  }));

  // Log audit
  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: adminProfile.id,
    user_email: adminProfile.email,
    action: "user_approved",
    record_type: "profiles",
    record_id: user.id,
    details: { approved_email: user.email },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

routerAdd("POST", "/api/auth/reject", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const adminProfile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!adminProfile || adminProfile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can reject users" });
  }

  const { p_user_id, p_reason } = bodyOf(c);
  if (!p_user_id) return c.json(400, { error: "p_user_id required" });

  const user = $app.dao().findRecordById("profiles", p_user_id);
  if (!user) return c.json(404, { error: "User not found" });

  $app.dao().updateRecord(user.set({
    status: "rejected",
    rejected_by: adminProfile.id,
    rejected_at: nowIso(),
    rejection_reason: p_reason ?? null,
  }));

  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: adminProfile.id,
    user_email: adminProfile.email,
    action: "user_rejected",
    record_type: "profiles",
    record_id: user.id,
    details: { rejected_email: user.email, reason: p_reason },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

routerAdd("POST", "/api/auth/disable", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const adminProfile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!adminProfile || adminProfile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can disable users" });
  }

  const { p_user_id } = bodyOf(c);
  if (!p_user_id) return c.json(400, { error: "p_user_id required" });

  const user = $app.dao().findRecordById("profiles", p_user_id);
  if (!user) return c.json(404, { error: "User not found" });

  $app.dao().updateRecord(user.set({
    status: "disabled",
    disabled_by: adminProfile.id,
    disabled_at: nowIso(),
  }));

  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: adminProfile.id,
    user_email: adminProfile.email,
    action: "user_disabled",
    record_type: "profiles",
    record_id: user.id,
    details: { disabled_email: user.email },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

routerAdd("POST", "/api/auth/enable", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const adminProfile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!adminProfile || adminProfile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can enable users" });
  }

  const { p_user_id } = bodyOf(c);
  if (!p_user_id) return c.json(400, { error: "p_user_id required" });

  const user = $app.dao().findRecordById("profiles", p_user_id);
  if (!user) return c.json(404, { error: "User not found" });

  $app.dao().updateRecord(user.set({
    status: "approved",
    disabled_by: null,
    disabled_at: null,
  }));

  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: adminProfile.id,
    user_email: adminProfile.email,
    action: "user_enabled",
    record_type: "profiles",
    record_id: user.id,
    details: { enabled_email: user.email },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

// ─── Audit Log Helper (can be called from anywhere) ────────────────────────
routerAdd("POST", "/api/audit/log", (c) => {
  const authRecord = c.get("authRecord");
  const { action, record_type, record_id, details } = bodyOf(c);

  if (!action) return c.json(400, { error: "action required" });

  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: authRecord?.id ?? null,
    user_email: authRecord?.email ?? null,
    action,
    record_type: record_type ?? null,
    record_id: record_id ?? null,
    details: details ?? null,
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

// ─── Security Event Logging ────────────────────────────────────────────────
onRecordAfterCreateRequest((e) => {
  if (e.collection.name === "security_events") return;

  // Auto-log certain security-relevant events
  const record = e.record;
  const collection = e.collection;

  if (collection.name === "profiles" && record.get("status") === "approved") {
    const log = new Record($app.dao().findCollectionByNameOrId("security_events"), {
      event_type: "user_approved",
      severity: "medium",
      detail: `User ${record.get("email")} approved`,
      source: "profiles",
      created_by: record.get("approved_by") ?? null,
      created_at: nowIso(),
    });
    $app.dao().saveRecord(log);
  }
});

// ─── Login Attempt Cleanup (cron) ──────────────────────────────────────────
cronAdd("cleanup_login_attempts", "0 3 * * *", () => {
  // Delete login attempts older than 90 days
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const attempts = $app.dao().findRecordsByFilter("login_attempts", "created_at < {:cutoff}", "-created", 1000, 0, { cutoff });
  for (const a of attempts) {
    $app.dao().deleteRecord(a);
  }

  // Delete used/expired OTP codes
  const otpCollection = $app.dao().findCollectionByNameOrId("otp_codes");
  const expired = $app.dao().findRecordsByFilter(otpCollection, "used = true || expires_at < {:now}", "-created", 1000, 0, { now: nowIso() });
  for (const o of expired) {
    $app.dao().deleteRecord(o);
  }
});

// ─── Session Security ──────────────────────────────────────────────────────
onRecordAfterAuthWithPasswordRequest((e) => {
  // This fires after successful password auth - record the successful login
  const record = e.record;
  const authRecord = $app.dao().findFirstRecordByData("profiles", "email", record.email);

  if (authRecord) {
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
  }
});

// BISECT onRecordBeforeAuthWithPasswordRequest((e) => {
// BISECT   // Check if account is locked
// BISECT   // v0.22: read the submitted body via $apis.requestInfo — the old
// BISECT   // e.httpContext?.request?.body chain never resolved (request is a method),
// BISECT   // so the lockout check silently never ran.
// BISECT   let identifier = "";
// BISECT   try {
// BISECT     const info = $apis.requestInfo(e.httpContext);
// BISECT     const body = info && info.data ? info.data : {};
// BISECT     identifier = body.email || body.identity || body.phone || "";
// BISECT   } catch (_) {
// BISECT     return;
// BISECT   }
// BISECT   if (!identifier) return;
// BISECT 
// BISECT   const profile = $app.dao().findFirstRecordByData("profiles", "email", identifier.toLowerCase());
// BISECT   if (!profile) return; // Don't reveal if email exists
// BISECT 
// BISECT   const lockedUntil = profile.get("locked_until");
// BISECT   if (lockedUntil) {
// BISECT     const lockTime = new Date(lockedUntil).getTime();
// BISECT     if (Date.now() < lockTime) {
// BISECT       const remainingMs = lockTime - Date.now();
// BISECT       const remainingMin = Math.ceil(remainingMs / 60000);
// BISECT       throw new Error(`Account temporarily locked. Try again in ${remainingMin} minute(s).`);
// BISECT     } else {
// BISECT       // Lock expired - clear it
// BISECT       $app.dao().updateRecord(profile.set({
// BISECT         locked_until: null,
// BISECT         failed_login_attempts: 0,
// BISECT       }));
// BISECT     }
// BISECT   }
// BISECT });

// ─── Resend Email Verification ────────────────────────────────────────────────
routerAdd("POST", "/api/auth/resend-verification", (c) => {
  const { email, redirect_url } = bodyOf(c);
  if (!email) return c.json(400, { error: "email required" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", email.toLowerCase());
  if (!profile) return c.json(200, { ok: true }); // Don't reveal if email exists

  if (profile.get("email_verified")) {
    return c.json(400, { error: "Email already verified" });
  }

  // Generate verification token (PocketBase handles this internally)
  // We just need to trigger the verification email send
  // PocketBase sends verification email on auth record creation
  // For existing unverified users, we'd need to implement custom email sending
  // For now, return success
  return c.json(200, { ok: true });
});

// ─── Password Reset Request ───────────────────────────────────────────────────
routerAdd("POST", "/api/auth/request-password-reset", (c) => {
  const { email, redirect_url } = bodyOf(c);
  if (!email) return c.json(400, { error: "email required" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", email.toLowerCase());
  if (!profile) return c.json(200, { ok: true }); // Don't reveal if email exists

  // Generate reset token
  const token = $security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  const tokenHash = $security.sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

  const resetCollection = $app.dao().findCollectionByNameOrId("password_reset_tokens");
  const existing = $app.dao().findFirstRecordByData(resetCollection, "user_id", profile.id());
  if (existing) {
    $app.dao().deleteRecord(existing);
  }

  const resetRecord = new Record(resetCollection, {
    user_id: profile.id(),
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(resetRecord);

  // TODO: Send email with reset link containing token
  // For now, return success (dev only)
  return c.json(200, { ok: true, token }); // REMOVE token in production
});

// ─── Password Reset Confirm ───────────────────────────────────────────────────
routerAdd("POST", "/api/auth/confirm-password-reset", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const { password } = bodyOf(c);
  if (!password) return c.json(400, { error: "password required" });

  // Update password
  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile) return c.json(404, { error: "Profile not found" });

  try {
    profile.setPassword(password);
    $app.dao().saveRecord(profile);
  } catch (err) {
    return c.json(500, { error: "Failed to update password" });
  }

  // Mark reset token as used
  const resetCollection = $app.dao().findCollectionByNameOrId("password_reset_tokens");
  const resetRecord = $app.dao().findFirstRecordByData(resetCollection, "user_id", profile.id());
  if (resetRecord) {
    $app.dao().updateRecord(resetRecord.set("used", true));
  }

  // Log audit
  const auditLog = new Record($app.dao().findCollectionByNameOrId("audit_logs"), {
    user_id: profile.id(),
    user_email: profile.email,
    action: "password_reset",
    record_type: "profiles",
    record_id: profile.id(),
    details: { method: "reset_link" },
    ip_address: c.request().remoteAddr,
    created_at: nowIso(),
  });
  $app.dao().saveRecord(auditLog);

  return c.json(200, { ok: true });
});

// ─── Turnstile Verification ───────────────────────────────────────────────────
// Verifies a Cloudflare Turnstile token using the secret key from settings
routerAdd("POST", "/api/turnstile-verify", (c) => {
  const { token } = bodyOf(c);
  if (!token) return c.json(400, { error: "token required", success: false });

  const settings = $app.dao().findFirstRecordById("system_settings", "turnstile");
  if (!settings || !settings.get("turnstile_secret_key")) {
    return c.json(200, { success: false, error: "Turnstile not configured" });
  }

  const secretKey = settings.get("turnstile_secret_key");
  const ip = c.request().remoteAddr;

  try {
    const res = $http.send({
      url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}${ip ? `&remoteip=${encodeURIComponent(ip)}` : ""}`,
    });

    const result = res.json;
    return c.json(200, { success: result.success === true, ...result });
  } catch (err) {
    return c.json(500, { success: false, error: "Verification failed" });
  }
});