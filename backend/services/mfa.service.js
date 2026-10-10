/**
 * TOTP two-factor service (enrolment, status, recovery codes, reset).
 *
 * Ported from pb_hooks/mfa_totp.pb.js. Storage lives in the existing `user_mfa`
 * table (secret + SHA-256-hashed recovery codes); the `profiles.mfa_enabled`
 * flag only flips once enrolment is *verified*.
 *
 * MFA_ENFORCED mirrors the hook's master switch (currently false — every role
 * signs in with a password only). The enrolment endpoints still work so the
 * UI/register stay functional; set MFA_ENFORCED=true to re-arm the login gate.
 */
const crypto = require('crypto');
const totp = require('./totp');
const { db } = require('../config/db');
const { getTable } = require('../config/schema');
const { nowIso } = require('../lib/ids');
const { badRequest, forbidden, notFound, unauthorized } = require('../lib/http');
const { getProfileById, updateAuthRecord } = require('./auth.service');

const MFA_ENFORCED = false;

const PRIVILEGED = [
  'super_admin', 'payroll_admin', 'payroll_processor', 'payroll_preparer',
  'payroll_reviewer', 'payroll_approver', 'payroll_payer', 'hr_administrator',
];
const MFA_EXEMPT = ['super_admin'];

const STEP = 30;
const DIGITS = 6;
const WINDOW = 1;
const ISSUER = 'SCRIVIA CLOUD';
const VALID_MINUTES = 30;
const RECOVERY_COUNT = 10;
const RECOVERY_LENGTH = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function userMfaTable() {
  return getTable('user_mfa');
}

function rowFor(userId) {
  const table = userMfaTable();
  if (!table) return null;
  return db.prepare('SELECT * FROM "user_mfa" WHERE user_id = ? LIMIT 1').get(userId) || null;
}

function parseRecoveryCodes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hashRecoveryCode(code, userId) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return totp.sha256Hex(normalized + ':' + userId);
}

function randomSecret() {
  let s = '';
  while (s.length < 32) s += totp.B32_ALPHABET[crypto.randomInt(totp.B32_ALPHABET.length)];
  return s;
}

function randomRecoveryCode() {
  let s = '';
  while (s.length < RECOVERY_LENGTH) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
  return s;
}

function logEvent(type, severity, detail, actor) {
  const table = getTable('security_events');
  if (!table) return;
  try {
    db.prepare(
      'INSERT INTO "security_events" (id, event_type, severity, detail, source, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    ).run('r' + crypto.randomBytes(7).toString('hex'), type, severity, detail || '', 'mfa', actor || 'system', nowIso());
  } catch {
    /* best-effort audit */
  }
}

function ensureMfaTable() {
  if (!userMfaTable()) throw badRequest('user_mfa collection is unavailable');
}

function upsertRow(userId, patch) {
  ensureMfaTable();
  const existing = rowFor(userId);
  const cols = Object.keys(patch);
  if (!existing) {
    const id = 'r' + crypto.randomBytes(7).toString('hex');
    const fields = ['id', 'user_id', ...cols];
    const values = [id, userId, ...cols.map((c) => patch[c])];
    db.prepare(`INSERT INTO "user_mfa" (${fields.map((f) => `"${f}"`).join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...values);
    return rowFor(userId);
  }
  db.prepare(`UPDATE "user_mfa" SET ${cols.map((c) => `"${c}" = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => patch[c]), existing.id);
  return rowFor(userId);
}

/** Step 1 — issue a secret for the signed-in account. */
function enrol(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) throw unauthorized('Authentication required');
  if (profile.status !== 'approved') throw forbidden('Account not approved');
  ensureMfaTable();

  const row = rowFor(profileId);
  const alreadyVerified = !!(row && (row.verified === true || row.verified === 1));

  if (alreadyVerified) {
    const isSuper = String(profile.role || '').toLowerCase() === 'super_admin';
    if (!isSuper) {
      throw badRequest('already_enrolled', 'already_enrolled');
    }
  }

  const secret = randomSecret();
  const email = profile.email || '';
  upsertRow(profileId, {
    user_email: email,
    secret,
    account_label: email,
    verified: 0,
    recovery_codes: '[]',
    last_step: 0,
    failed_attempts: 0,
    verified_at: '',
    last_used_at: '',
    enrolled_at: nowIso(),
  });
  logEvent('mfa_enrolment_started', 'low', 'Enrolment started for ' + email, email);

  return {
    ok: true,
    algorithm: 'SHA256',
    digits: DIGITS,
    period: STEP,
    issuer: ISSUER,
    account: email,
    secret,
    formatted_secret: totp.formatSecret(secret),
    otpauth_uri: totp.otpauthUri(email, secret, ISSUER, DIGITS, STEP),
    valid_for_minutes: VALID_MINUTES,
  };
}

/** Step 2 — confirm a code, enable the factor and mint recovery codes. */
function verifyEnrolment(profileId, code) {
  const profile = getProfileById(profileId);
  if (!profile) throw unauthorized('Authentication required');
  ensureMfaTable();

  const codeStr = String(code || '').trim();
  if (!codeStr) throw badRequest('code required');

  const row = rowFor(profileId);
  if (!row) throw badRequest('no_pending_enrolment');
  if (row.verified === true || row.verified === 1) throw badRequest('already_enrolled');

  if (row.enrolled_at) {
    const ageMinutes = (Date.now() - new Date(row.enrolled_at).getTime()) / 60000;
    if (ageMinutes > VALID_MINUTES) throw badRequest('enrolment_expired');
  }

  const matchedStep = totp.verifyTotp(row.secret, codeStr, Math.floor(Date.now() / 1000), { step: STEP, digits: DIGITS, window: WINDOW });
  if (matchedStep < 0) {
    upsertRow(profileId, { failed_attempts: Number(row.failed_attempts || 0) + 1 });
    logEvent('mfa_enrolment_failed', 'medium', 'Invalid code during enrolment for ' + profile.email, profile.email);
    throw badRequest('invalid_code');
  }

  const plainCodes = [];
  const storedCodes = [];
  for (let i = 0; i < RECOVERY_COUNT; i += 1) {
    const plain = randomRecoveryCode();
    plainCodes.push(plain);
    storedCodes.push({ h: hashRecoveryCode(plain, profileId), u: false, at: '' });
  }

  const nowStamp = nowIso();
  upsertRow(profileId, {
    verified: 1,
    verified_at: nowStamp,
    recovery_codes: JSON.stringify(storedCodes),
    last_step: 0,
    failed_attempts: 0,
  });
  updateAuthRecord('profiles', profileId, { mfa_enabled: 1 });
  logEvent('mfa_enrolled', 'medium', 'Two-factor authentication enrolled for ' + profile.email, profile.email);

  return {
    ok: true,
    enrolled_at: row.enrolled_at || nowStamp,
    verified_at: nowStamp,
    recovery_codes: plainCodes,
    recovery_codes_note: 'Store these somewhere safe and offline. Each works once. They will not be shown again.',
  };
}

function status(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) throw unauthorized('Authentication required');
  const row = rowFor(profileId);
  const role = String(profile.role || '').toLowerCase();
  const verified = !!(row && (row.verified === true || row.verified === 1));
  let remaining = 0;
  if (verified && row) {
    const codes = parseRecoveryCodes(row.recovery_codes);
    remaining = codes.filter((c) => c && !c.u).length;
  }
  return {
    ok: true,
    email: profile.email,
    role,
    privileged: PRIVILEGED.includes(role),
    mfa_required: MFA_ENFORCED && PRIVILEGED.includes(role) && !MFA_EXEMPT.includes(role),
    enrolled: verified,
    pending_enrolment: !!(row && !verified),
    enrolled_at: row ? row.enrolled_at : '',
    verified_at: row ? row.verified_at : '',
    last_used_at: row ? row.last_used_at : '',
    recovery_codes_remaining: remaining,
    recovery_codes_total: verified ? RECOVERY_COUNT : 0,
    algorithm: 'SHA256',
    digits: DIGITS,
    period: STEP,
    available: true,
  };
}

function regenerateRecoveryCodes(profileId, { code, password } = {}) {
  const profile = getProfileById(profileId);
  if (!profile) throw unauthorized('Authentication required');
  const row = rowFor(profileId);
  if (!row || !(row.verified === true || row.verified === 1)) throw badRequest('not_enrolled');

  let proven = false;
  if (code) {
    proven = totp.verifyTotp(row.secret, String(code).trim(), Math.floor(Date.now() / 1000), { step: STEP, digits: DIGITS, window: WINDOW }) > Number(row.last_step || 0);
  } else if (password) {
    try {
      const bcrypt = require('bcrypt');
      const full = db.prepare('SELECT password FROM "profiles" WHERE id = ?').get(profileId);
      proven = !!(full && full.password && bcrypt.compareSync(password, full.password));
    } catch {
      proven = false;
    }
  }
  if (!proven) throw forbidden('verification_required');

  const plainCodes = [];
  const storedCodes = [];
  for (let i = 0; i < RECOVERY_COUNT; i += 1) {
    const plain = randomRecoveryCode();
    plainCodes.push(plain);
    storedCodes.push({ h: hashRecoveryCode(plain, profileId), u: false, at: '' });
  }
  upsertRow(profileId, { recovery_codes: JSON.stringify(storedCodes) });
  logEvent('mfa_recovery_codes_regenerated', 'medium', 'Recovery codes regenerated for ' + profile.email, profile.email);
  return { ok: true, recovery_codes: plainCodes };
}

function reset(callerId, { targetUserId, reason } = {}) {
  const caller = getProfileById(callerId);
  if (!caller) throw unauthorized('Authentication required');
  if (caller.status !== 'approved') throw forbidden('Account not approved');
  if (String(caller.role || '').toLowerCase() !== 'super_admin') throw forbidden('Insufficient permissions');

  const targetId = String(targetUserId || '').trim();
  if (!targetId) throw badRequest('p_target_user required');
  if (targetId === caller.id) throw badRequest('cannot_reset_self');

  const target = getProfileById(targetId);
  if (!target) throw notFound('User not found');

  const row = rowFor(targetId);
  if (row) {
    upsertRow(targetId, {
      verified: 0, secret: '', recovery_codes: '[]', last_step: 0, failed_attempts: 0,
      reset_by: caller.email, reset_reason: String(reason || ''),
    });
  }
  updateAuthRecord('profiles', targetId, { mfa_enabled: 0 });
  logEvent('mfa_reset', 'high', 'Second factor reset for ' + target.email + (reason ? ' — ' + reason : ''), caller.email);
  return { ok: true, email: target.email, mfa_enabled: false };
}

module.exports = {
  MFA_ENFORCED,
  enrol,
  verifyEnrolment,
  status,
  regenerateRecoveryCodes,
  reset,
  rowFor,
  parseRecoveryCodes,
  hashRecoveryCode,
  logEvent,
  STEP,
  DIGITS,
  WINDOW,
  RECOVERY_LENGTH,
};
