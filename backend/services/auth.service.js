/**
 * Authentication service.
 *
 * Existing users keep their bcrypt `$2a$...` password hashes, so a straight
 * bcrypt.compare authenticates everyone without a reset. On success we mint a
 * JWT that the frontend stores in place of the PocketBase auth token.
 */
const { db } = require('../config/db');
const { getTable } = require('../config/schema');
const { nowIso } = require('../lib/ids');
const { unauthorized, badRequest } = require('../lib/http');

const AUTH_COLLECTIONS = ['profiles', 'users'];

let jwt = null;
function getJwt() {
  if (jwt) return jwt;
  // eslint-disable-next-line global-require
  jwt = require('jsonwebtoken');
  return jwt;
}

const JWT_SECRET = process.env.JWT_SECRET || 'scrivia-payroll-jwt-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function hasColumn(table, col) {
  return table && table.columns.has(col);
}

/** Find an auth record by email / username / employee number. */
function findAuthRecord(collection, identity, { byId = false } = {}) {
  const table = getTable(collection);
  if (!table) return null;
  const id = String(identity || '').trim();
  if (!id) return null;

  if (byId) {
    return db.prepare(`SELECT * FROM ${quoteIdent(collection)} WHERE id = ?`).get(id) || null;
  }

  const clauses = [];
  const params = [];
  if (hasColumn(table, 'email')) {
    clauses.push('LOWER(email) = LOWER(?)');
    params.push(id);
  }
  if (hasColumn(table, 'username')) {
    clauses.push('LOWER(username) = LOWER(?)');
    params.push(id);
  }
  if (hasColumn(table, 'employee_number')) {
    clauses.push('LOWER(employee_number) = LOWER(?)');
    params.push(id);
  }
  if (hasColumn(table, 'empno')) {
    clauses.push('LOWER(empno) = LOWER(?)');
    params.push(id);
  }
  if (clauses.length === 0) return null;

  const sql = `SELECT * FROM ${quoteIdent(collection)} WHERE ${clauses.join(' OR ')} LIMIT 1`;
  return db.prepare(sql).get(...params) || null;
}

function sanitizeRecord(record) {
  if (!record) return null;
  const clone = { ...record };
  delete clone.password;
  delete clone.tokenKey;
  if (record.created !== undefined && clone.created_at === undefined) clone.created_at = record.created;
  if (record.updated !== undefined && clone.updated_at === undefined) clone.updated_at = record.updated;
  clone.collectionId = clone.collectionId || clone.collectionName || undefined;
  delete clone.collectionId;
  // Match PocketBase auth-record semantics: these are booleans, not 0/1.
  for (const k of ['verified', 'email_verified', 'emailVisibility', 'mfa_enabled']) {
    if (k in clone) {
      const v = clone[k];
      clone[k] = v === true || v === 1 || v === '1' || v === 'true';
    }
  }
  return clone;
}

function signToken(record) {
  const payload = {
    id: record.id,
    email: record.email || null,
    role: record.role || null,
  };
  return getJwt().sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return getJwt().verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Authenticate against a profiles/users row. */
function authenticate(collection, identity, password) {
  const table = getTable(collection);
  if (!table || !hasColumn(table, 'password')) {
    throw badRequest(`Collection ${collection} is not an auth collection`);
  }
  const record = findAuthRecord(collection, identity);
  if (!record) throw unauthorized('Invalid credentials');

  const stored = record.password;
  if (typeof stored !== 'string' || !stored) throw unauthorized('Invalid credentials');

  let ok = false;
  try {
    // eslint-disable-next-line global-require
    const bcrypt = require('bcrypt');
    ok = bcrypt.compareSync(password, stored);
  } catch {
    throw unauthorized('Password verification unavailable');
  }
  if (!ok) throw unauthorized('Invalid credentials');

  const token = signToken(record);
  return { token, record: sanitizeRecord(record) };
}

function getProfileById(id) {
  if (!id) return null;
  for (const c of AUTH_COLLECTIONS) {
    const table = getTable(c);
    if (!table) continue;
    const row = db.prepare(`SELECT * FROM ${quoteIdent(c)} WHERE id = ?`).get(id);
    if (row) return sanitizeRecord(row);
  }
  return null;
}

function updateAuthRecord(collection, id, patch) {
  const table = getTable(collection);
  if (!table) throw badRequest(`Unknown collection: ${collection}`);
  const entries = Object.entries(patch).filter(([k]) => table.columns.has(k));
  if (entries.length === 0) return getProfileById(id);
  const sets = entries.map(([k]) => `${quoteIdent(k)} = ?`).join(', ');
  const params = entries.map(([k, v]) => {
    const val = v && typeof v === 'object' ? JSON.stringify(v) : v;
    if (val !== null) return val;
    const meta = table.colMeta && table.colMeta.get(k);
    if (!meta || !meta.notnull) return val;
    return /INT|REAL|NUM|DEC|FLOA|DOUB/.test((meta.type || '').toUpperCase()) ? 0 : '';
  });
  db.prepare(`UPDATE ${quoteIdent(collection)} SET ${sets} WHERE id = ?`).run(...params, id);
  return getProfileById(id);
}

function touchFailedLogin(collection, id, attempts) {
  return updateAuthRecord(collection, id, { failed_login_attempts: attempts, last_failed_login: nowIso() });
}

module.exports = {
  AUTH_COLLECTIONS,
  findAuthRecord,
  authenticate,
  signToken,
  verifyToken,
  getProfileById,
  updateAuthRecord,
  sanitizeRecord,
  touchFailedLogin,
  quoteIdent,
};
