const express = require('express');
const { authJwt, verifyOrganization, rateLimiter } = require('../middleware');
const organization = require('../controllers/organization.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get(
  '/organizations-with-users',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.findAllWithUsers
);

router.get(
  '/organization/:organizationName/users',
  [authJwt.verifyToken, authJwt.isUser],
  organization.findOneWithUsers
);

router.get('/organization', [authJwt.verifyToken, authJwt.isUser], organization.findAll);

router.get(
  '/organization/:organizationName',
  [authJwt.verifyToken, authJwt.isUser],
  organization.findOne
);

router.post(
  '/organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrganization.validateOrganization,
    verifyOrganization.checkOrganizationDuplicate,
  ],
  organization.create
);

router.put(
  '/organization/:organizationName',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    authJwt.isModeratorOrAdmin,
    verifyOrganization.validateOrganization,
  ],
  organization.update
);

router.delete(
  '/organization/:organizationName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.delete
);

router.put(
  '/organization/:organizationName/suspend',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.suspendOrganization
);

router.put(
  '/organization/:organizationName/resume',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.resumeOrganization
);

module.exports = router;
