/**
 * JWT auth middleware. Replaces PocketBase's bearer-token enforcement and its
 * hook-based role guards (`requireAuth`, `requireRole`).
 */
const { verifyToken, getProfileById } = require('../services/auth.service');
const { unauthorized, forbidden } = require('../lib/http');

function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  if (req.headers['x-auth-token']) return String(req.headers['x-auth-token']).trim();
  if (req.body && typeof req.body.token === 'string') return req.body.token;
  return null;
}

/** Attach req.auth when a valid token is present; never blocks. */
function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifyToken(token);
  if (payload) {
    req.auth = payload;
    req.profile = getProfileById(payload.id);
  }
  return next();
}

/** Require a valid token. */
function requireAuth(req, _res, next) {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return next(unauthorized('Authentication required'));
  req.auth = payload;
  req.profile = getProfileById(payload.id);
  return next();
}

function roleOf(req) {
  const raw = req.profile?.role || req.auth?.role || '';
  return String(raw).toLowerCase().trim();
}

/** Require one of the given roles (superuser/admin always allowed). */
function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized('Authentication required'));
    const role = roleOf(req);
    if (role === 'admin' || role === 'superuser' || role === 'super_admin') return next();
    if (allowed.length === 0 || allowed.includes(role)) return next();
    return next(forbidden('Insufficient permissions'));
  };
}

module.exports = { optionalAuth, requireAuth, requireRole, extractToken, roleOf };
