// architecture.routes.js
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { authJwt, verifyArchitecture, sessionAuth } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const architecture = require('../controllers/architecture.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

// Explicit rate limiter for architecture operations (CodeQL requirement)
const architectureOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  sessionAuth,
  architecture.findAllByProvider
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  architectureOperationLimiter,
  sessionAuth,
  architecture.findOne
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyArchitecture.validateArchitecture,
  verifyArchitecture.checkArchitectureDuplicate,
  architecture.create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyArchitecture.validateArchitecture,
  architecture.update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  architecture.delete
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  architecture.deleteAllByProvider
);

module.exports = router;
