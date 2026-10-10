const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');

// PocketBase-compatible record auth endpoint the frontend calls directly.
router.post('/collections/:collection/auth-with-password', asyncHandler(auth.authWithPassword));

// Application auth endpoints.
router.post('/login', asyncHandler(auth.login));
router.post('/register', asyncHandler(auth.register));
router.post('/logout', asyncHandler(auth.logout));
router.get('/me', requireAuth, asyncHandler(auth.me));

module.exports = router;
