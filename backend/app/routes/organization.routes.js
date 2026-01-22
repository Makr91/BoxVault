import { Router } from 'express';
import { authJwt, verifyOrganization, verifyOrgAccess, sessionAuth } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  discoverOrganizations,
  findAllWithUsers,
  findOneWithUsers,
  findAll,
  findOne,
  create,
  update,
  delete as deleteOrg,
  suspendOrganization,
  resumeOrganization,
  updateAccessMode,
  getUserOrgRole,
  updateUserOrgRole,
  removeUserFromOrg,
} from '../controllers/organization.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Public organization discovery (uses sessionAuth to check if admin)
router.get('/organizations/discover', sessionAuth, discoverOrganizations);

// Admin-only organization management (global)
router.get(
  '/organizations-with-users',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  findAllWithUsers
);

router.get(
  '/organization/:organization/users',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  findOneWithUsers
);

router.get('/organization', [authJwt.verifyToken, authJwt.isUser], findAll);

router.get('/organization/:organization', [authJwt.verifyToken, authJwt.isUser], findOne);

router.post(
  '/organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrganization.validateOrganization,
    verifyOrganization.checkOrganizationDuplicate,
  ],
  create
);

router.put(
  '/organization/:organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgModeratorOrAdmin,
    verifyOrganization.validateOrganization,
  ],
  update
);

router.delete(
  '/organization/:organization',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  deleteOrg
);

router.put(
  '/organization/:organization/suspend',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  suspendOrganization
);

router.put(
  '/organization/:organization/resume',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  resumeOrganization
);

// Organization-specific user management
router.put(
  '/organization/:organization/access-mode',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  updateAccessMode
);

router.get(
  '/organization/:organization/users/:userId/role',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  getUserOrgRole
);

router.put(
  '/organization/:organization/users/:userId/role',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  updateUserOrgRole
);

router.delete(
  '/organization/:organization/members/:userId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  removeUserFromOrg
);

export default router;
