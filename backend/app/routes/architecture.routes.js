// architecture.routes.js
const express = require('express');
const { authJwt, verifyArchitecture } = require('../middleware');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const architecture = require('../controllers/architecture.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  rateLimiterMiddleware(),
  architecture.findAllByProvider
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  rateLimiterMiddleware(),
  architecture.findOne
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  rateLimiterMiddleware(),
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyArchitecture.validateArchitecture,
  verifyArchitecture.checkArchitectureDuplicate,
  architecture.create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  rateLimiterMiddleware(),
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyArchitecture.validateArchitecture,
  architecture.update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  rateLimiterMiddleware(),
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  architecture.delete
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  rateLimiterMiddleware(),
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  architecture.deleteAllByProvider
);

module.exports = router;
