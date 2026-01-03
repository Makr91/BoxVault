const express = require('express');
const { authJwt, verifyOrganization, verifyOrgAccess, sessionAuth } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const organization = require('../controllers/organization.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Public organization discovery (uses sessionAuth to check if admin)
router.get('/organizations/discover', sessionAuth, organization.discoverOrganizations);

// Admin-only organization management (global)
router.get(
  '/organizations-with-users',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.findAllWithUsers
);

router.get(
  '/organization/:organization/users',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  organization.findOneWithUsers
);

router.get('/organization', [authJwt.verifyToken, authJwt.isUser], organization.findAll);

router.get(
  '/organization/:organization',
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
  '/organization/:organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgModeratorOrAdmin,
    verifyOrganization.validateOrganization,
  ],
  organization.update
);

router.delete(
  '/organization/:organization',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.delete
);

router.put(
  '/organization/:organization/suspend',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.suspendOrganization
);

router.put(
  '/organization/:organization/resume',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  organization.resumeOrganization
);

// Organization-specific user management
router.put(
  '/organization/:organization/access-mode',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  organization.updateAccessMode
);

router.get(
  '/organization/:organization/users/:userId/role',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  organization.getUserOrgRole
);

router.put(
  '/organization/:organization/users/:userId/role',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  organization.updateUserOrgRole
);

router.delete(
  '/organization/:organization/users/:userId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  organization.removeUserFromOrg
);

module.exports = router;
