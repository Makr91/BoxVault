// provider.routes.js
const express = require('express');
const { authJwt, verifyProvider, rateLimiter } = require('../middleware');
const provider = require('../controllers/provider.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyProvider.validateProvider,
    verifyProvider.checkProviderDuplicate,
  ],
  provider.create
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  provider.findAllByVersion
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  provider.findOne
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyProvider.validateProvider],
  provider.update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  provider.delete
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  provider.deleteAllByVersion
);

module.exports = router;
