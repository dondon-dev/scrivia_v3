/**
 * Auth controller — PocketBase-compatible record auth plus the app's own
 * /api/login, /api/register, /api/logout, /api/me endpoints and the
 * /api/auth/* RPC surface (delegated to rpc.service).
 */
const { db } = require('../config/db');
const { getTable } = require('../config/schema');
const { nowIso } = require('../lib/ids');
const { HttpError, badRequest, unauthorized, forbidden } = require('../lib/http');
const authSvc = require('../services/auth.service');
const mfa = require('../services/mfa.service');
const col = require('../services/collection.service');

function setProfileFields(id, patch) {
  const t = getTable('profiles');
  if (!t) return;
  const entries = Object.entries(patch).filter(([k, v]) => t.columns.has(k) && v !== undefined);
  if (entries.length === 0) return;
  // profiles text columns are NOT NULL DEFAULT '' — never write a literal null.
  const coerce = (k, v) => {
    if (v !== null) return v;
    const meta = t.colMeta && t.colMeta.get(k);
    if (!meta || !meta.notnull) return v;
    return /INT|REAL|NUM|DEC|FLOA|DOUB/.test((meta.type || '').toUpperCase()) ? 0 : '';
  };
  db.prepare(`UPDATE "profiles" SET ${entries.map(([k]) => `"${k}" = ?`).join(', ')} WHERE id = ?`)
    .run(...entries.map(([k, v]) => coerce(k, v)), id);
}

function loginAttempt(profile, email, success) {
  if (!getTable('login_attempts')) return;
  try {
    col.insertOne('login_attempts', {
      email,
      user_id: profile ? profile.id : null,
      success: success ? 1 : 0,
      failure_reason: success ? null : 'invalid_credentials',
      created_at: nowIso(),
    });
  } catch { /* best-effort */ }
}

/**
 * Compare a submitted password against the stored bcrypt hash.
 *
 * A verifier that cannot run (bcrypt missing, native binding unusable) or a
 * stored value that is not a valid bcrypt hash is an infrastructure/data fault,
 * NOT a wrong password. Reporting it as a wrong password hides the outage behind
 * a generic 401 *and* charges a failed-login strike on every attempt, which is
 * how accounts silently locked themselves out. Throw a 500 instead: the caller
 * never reaches the failed-attempt bookkeeping below, so no strike is recorded.
 */
function verifyPassword(password, stored) {
  let bcrypt;
  try {
    // eslint-disable-next-line global-require
    bcrypt = require('bcrypt');
  } catch {
    throw new HttpError(500, 'Password verification is unavailable on the server (the bcrypt module could not be loaded).');
  }
  // Normalize first: bcrypt throws on non-string input, and a malformed request
  // body must not be reported as a server fault.
  const candidate = typeof password === 'string' ? password : String(password ?? '');
  try {
    return bcrypt.compareSync(candidate, stored);
  } catch {
    throw new HttpError(500, 'Stored password could not be verified: it is not a usable bcrypt hash.');
  }
}

/** Shared credential + lockout + MFA gate logic. Returns { token, record }. */
function authenticateIdentity(identity, password, otp) {
  const table = getTable('profiles');
  if (!table) throw badRequest('profiles collection unavailable');

  const profile = authSvc.findAuthRecord('profiles', identity);
  // Verify the password first so a caller who does not know it learns nothing
  // about whether the account exists or is enrolled (matches the hook). Only an
  // account that exists reaches the verifier, so an unknown identity still
  // fails exactly as a wrong password would.
  const passwordOk = profile && profile.password ? verifyPassword(password, profile.password) : false;

  if (passwordOk && profile.locked_until) {
    const lockTime = new Date(profile.locked_until).getTime();
    if (Date.now() < lockTime) {
      const remaining = Math.ceil((lockTime - Date.now()) / 60000);
      throw new HttpError(423, `Account temporarily locked. Try again in ${remaining} minute(s).`);
    }
    setProfileFields(profile.id, { locked_until: null, failed_login_attempts: 0 });
    profile.locked_until = null;
  }

  if (!profile || !passwordOk) {
    if (profile) {
      const attempts = Number(profile.failed_login_attempts || 0) + 1;
      const patch = { failed_login_attempts: attempts, last_login_at: nowIso() };
      if (attempts >= 5) patch.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      setProfileFields(profile.id, patch);
      loginAttempt(profile, str(profile.email), false);
    }
    throw unauthorized('Invalid credentials');
  }

  // ── MFA gate ──────────────────────────────────────────────────────────────
  const row = mfa.rowFor(profile.id);
  const enrolled = !!(row && (row.verified === true || row.verified === 1));
  if (mfa.MFA_ENFORCED && enrolled) {
    const submitted = String(otp || '').trim();
    if (!submitted) throw new HttpError(401, 'MFA_REQUIRED: this account uses two-factor authentication. Sign in again with the current code from your authenticator app.');
    const totp = require('../services/totp');
    const secret = row.secret;
    const lastStep = Number(row.last_step || 0);
    const matchedStep = totp.verifyTotp(secret, submitted, Math.floor(Date.now() / 1000), { step: mfa.STEP, digits: mfa.DIGITS, window: mfa.WINDOW });
    let accepted = matchedStep > 0 && matchedStep > lastStep;
    let usedRecovery = false;
    let codes = null;
    if (!accepted) {
      const normalized = String(submitted).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalized.length === mfa.RECOVERY_LENGTH) {
        const hash = mfa.hashRecoveryCode(normalized, profile.id);
        codes = mfa.parseRecoveryCodes(row.recovery_codes);
        for (const c of codes) {
          if (c && c.u === false && c.h === hash) {
            c.u = true; c.at = nowIso(); usedRecovery = true; accepted = true; break;
          }
        }
      }
    }
    if (!accepted) {
      const failures = Number(row.failed_attempts || 0) + 1;
      mfaUpsert(profile.id, { failed_attempts: failures });
      throw new HttpError(401, 'MFA_INVALID: that verification code was not accepted.');
    }
    try {
      if (usedRecovery && codes) mfaUpsert(profile.id, { recovery_codes: JSON.stringify(codes) });
      if (!usedRecovery) mfaUpsert(profile.id, { last_step: matchedStep });
      mfaUpsert(profile.id, { failed_attempts: 0, last_used_at: nowIso() });
    } catch { /* never block a verified login */ }
  }

  // Success bookkeeping (matches the successful-login hook).
  setProfileFields(profile.id, { failed_login_attempts: 0, locked_until: null, last_login_at: nowIso() });
  loginAttempt(profile, str(profile.email), true);

  const token = authSvc.signToken(profile);
  return { token, record: authSvc.sanitizeRecord(profile) };
}

function mfaUpsert(userId, patch) {
  const t = getTable('user_mfa');
  if (!t) return;
  const existing = db.prepare('SELECT id FROM "user_mfa" WHERE user_id = ? LIMIT 1').get(userId);
  const keys = Object.keys(patch).filter((k) => t.columns.has(k));
  if (keys.length === 0) return;
  if (existing) {
    db.prepare(`UPDATE "user_mfa" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k]), existing.id);
  } else {
    const row = { id: `r${require('crypto').randomBytes(7).toString('hex')}`, user_id: userId };
    for (const k of keys) row[k] = patch[k];
    const all = Object.keys(row);
    db.prepare(`INSERT INTO "user_mfa" (${all.map((k) => `"${k}"`).join(',')}) VALUES (${all.map(() => '?').join(',')})`).run(...all.map((k) => row[k]));
  }
}

const str = (v) => (v === null || v === undefined ? '' : String(v));

async function authWithPassword(req, res) {
  const { collection } = req.params;
  const body = req.body || {};
  const identity = body.identity || body.email || body.username || '';
  const password = body.password || '';
  const otp = body.otp || body.code || '';
  if (!identity || !password) throw badRequest('Missing credentials and password');
  if (collection !== 'profiles' && collection !== 'users') throw badRequest(`Collection ${collection} is not an auth collection`);
  const result = authenticateIdentity(identity, password, otp);
  return res.json(result);
}

async function login(req, res) {
  const body = req.body || {};
  const identity = body.email || body.identity || body.username || '';
  const password = body.password || '';
  const otp = body.otp || body.code || '';
  if (!identity || !password) throw badRequest('Missing credentials and password');
  const { token, record } = authenticateIdentity(identity, password, otp);
  return res.json({ token, user: { id: record.id, email: record.email }, profile: record });
}

async function register(req, res) {
  const body = req.body || {};
  const email = str(body.email).toLowerCase();
  const password = str(body.password);
  if (!email || !password) throw badRequest('Email and password are required');
  const existing = authSvc.findAuthRecord('profiles', email);
  if (existing) throw forbidden('An account with this email already exists');
  const record = col.insertOne('profiles', {
    email,
    password,
    first_name: body.first_name || body.firstName || '',
    last_name: body.last_name || body.lastName || '',
    mobile_number: body.mobile_number || body.mobileNumber || '',
    username: body.username || null,
    office_assignment: body.office_assignment || body.officeAssignment || '',
    position_designation: body.position_designation || body.positionDesignation || '',
    employee_number: body.employee_number || body.employeeNumber || '',
    role: 'read_only',
    status: 'pending_approval',
    email_verified: 0,
    mfa_enabled: 0,
    failed_login_attempts: 0,
  });
  return res.status(201).json({ id: record.id, email: record.email });
}

async function me(req, res) {
  if (!req.auth) throw unauthorized('Authentication required');
  const profile = authSvc.getProfileById(req.auth.id);
  if (!profile) throw unauthorized('Profile not found');
  return res.json({ user: { id: profile.id, email: profile.email }, profile });
}

async function logout(_req, res) {
  // Stateless JWT — clearing is client-side. Kept for API parity.
  return res.json({ success: true });
}

module.exports = { authWithPassword, login, register, me, logout, authenticateIdentity };
