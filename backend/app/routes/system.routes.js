const express = require('express');
const { authJwt } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const systemController = require('../controllers/system.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get(
  '/system/storage',
  [authJwt.verifyToken, authJwt.isAdmin],
  systemController.getStorageInfo
);

module.exports = router;
