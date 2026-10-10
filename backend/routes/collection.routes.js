const router = require('express').Router();
const c = require('../controllers/collection.controller');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');

// Mounted at /api/db (see server.js) so collection names never collide with
// named RPC endpoints like `employees/query`.
router.use(optionalAuth);

router.post('/:collection/query', asyncHandler(c.query));
router.post('/:collection/upsert', asyncHandler(c.upsert));

router.post('/:collection', asyncHandler(c.create));
router.put('/:collection', asyncHandler(c.updateByFilter));
router.patch('/:collection', asyncHandler(c.updateByFilter));
router.delete('/:collection', asyncHandler(c.removeByFilter));

router.get('/:collection', asyncHandler(c.list));
router.get('/:collection/:id', asyncHandler(c.getOne));
router.put('/:collection/:id', asyncHandler(c.update));
router.patch('/:collection/:id', asyncHandler(c.update));
router.delete('/:collection/:id', asyncHandler(c.remove));

module.exports = router;
