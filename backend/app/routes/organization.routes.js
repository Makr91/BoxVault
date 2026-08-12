import { Router } from 'express';
import { authJwt, verifyOrganization, verifyOrgAccess, sessionAuth } from '../middleware/index.js';
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
  joinAsAdmin,
} from '../controllers/organization.controller.js';

const router = Router();

// Apply rate limiting to this router

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
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrganization.validateOrganization,
  ],
  update
);

// Org owners may delete their own organization; global admins any.
router.delete(
  '/organization/:organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgOwner,
    verifyOrgAccess.rejectExternallyManagedOrg,
  ],
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
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdminOrOwner],
  updateAccessMode
);

router.get(
  '/organization/:organization/users/:userId/role',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  getUserOrgRole
);

router.put(
  '/organization/:organization/users/:userId/role',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgOwner,
    verifyOrgAccess.rejectExternallyManagedOrg,
  ],
  updateUserOrgRole
);

// Org-scoped membership removal (hierarchy check happens in the controller)
router.delete(
  '/organization/:organization/members/:userId',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.rejectExternallyManagedOrg,
  ],
  removeUserFromOrg
);

// Global-admin self-join: a platform admin adds themselves to an org as admin
router.post(
  '/organization/:organization/join',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    authJwt.isAdmin,
    verifyOrgAccess.rejectExternallyManagedOrg,
  ],
  joinAsAdmin
);

export default router;
