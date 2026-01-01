// version.routes.js
const express = require('express');
const { authJwt, verifyVersion, rateLimiter } = require('../middleware');
const version = require('../controllers/version.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/organization/:organization/box/:boxId/version',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyVersion.validateVersion,
    verifyVersion.checkVersionDuplicate,
  ],
  version.create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyVersion.validateVersion,
    verifyVersion.checkVersionDuplicate,
  ],
  version.update
);

router.get('/organization/:organization/box/:boxId/version', version.findAllByBox);
router.get('/organization/:organization/box/:boxId/version/:versionNumber', version.findOne);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  version.delete
);

router.delete(
  '/organization/:organization/box/:boxId/version',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  version.deleteAllByBox
);

module.exports = router;
