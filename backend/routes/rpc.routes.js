const router = require('express').Router();
const rpc = require('../services/rpc.service');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');

// Single dispatcher for the whole custom RPC surface. Registered before the
// generic collection router so named endpoints (permissions, dashboard,
// payroll, employees/query, auth/*) win over `/:collection`.
router.use(
  optionalAuth,
  asyncHandler(async (req, res, next) => {
    const path = req.path.replace(/^\/+/, '');
    if (!rpc.hasHandler(path)) return next();
    const result = await rpc.dispatch(path, req);
    return res.json(result);
  }),
);

module.exports = router;
