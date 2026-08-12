// user.routes.js
import { Router } from 'express';
import { authJwt, verifySignUp, verifyOrgAccess, oidcTokenRefresh } from '../middleware/index.js';
import {
  allAccess,
  userBoard,
  adminBoard,
  getUserRoles,
  changePassword,
  changeEmail,
  changeName,
  getUserProfile,
  getUserOrganizations,
  getPreferences,
  updatePreferences,
  leaveOrganization,
  getPrimaryOrganization,
  setPrimaryOrganization,
  isOnlyUserInOrg,
  findOne,
  update,
  delete as deleteUser,
} from '../controllers/user.controller.js';
import {
  suspendUser,
  resumeUser,
  deleteUser as deleteUserAuth,
  signup,
} from '../controllers/auth.controller.js';
import { listUserWatches } from '../controllers/box.controller.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/users/all', allAccess);
router.get('/users/user', [authJwt.verifyToken, authJwt.isUser], userBoard);
router.get('/users/admin', [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin], adminBoard);
router.get('/users/roles', [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin], getUserRoles);

router.put(
  '/users/:userId/change-password',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
  changePassword
);
router.put(
  '/users/:userId/change-email',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
  changeEmail
);
router.put(
  '/users/:userId/change-name',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
  changeName
);
router.put(
  '/users/:userId/suspend',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  suspendUser
);
router.put(
  '/users/:userId/resume',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  resumeUser
);
router.delete(
  '/users/:userId',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
  deleteUserAuth
);
router.get('/user', [authJwt.verifyToken, authJwt.isUser], getUserProfile);

// Multi-organization user management (service accounts get their single organization)
router.get(
  '/user/organizations',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  getUserOrganizations
);

// Writes ride the acting user's OIDC token for federated accounts, so the
// token has to be fresh before the controller reaches for it.
router.get('/user/preferences', [authJwt.verifyToken, authJwt.isUser], getPreferences);

router.patch(
  '/user/preferences',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  updatePreferences
);

router.get('/user/watches', [authJwt.verifyToken, authJwt.isUser], listUserWatches);

router.post('/user/leave/:orgName', [authJwt.verifyToken, authJwt.isUser], leaveOrganization);

router.get(
  '/user/primary-organization',
  [authJwt.verifyToken, authJwt.isUser],
  getPrimaryOrganization
);

router.put(
  '/user/primary-organization/:orgName',
  [authJwt.verifyToken, authJwt.isUser],
  setPrimaryOrganization
);

router.get(
  '/organizations/:organization/only-user',
  [authJwt.verifyToken],
  authJwt.isUser,
  isOnlyUserInOrg
);
router.post(
  '/organization/:organization/users',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifySignUp.checkDuplicateUsernameOrEmail,
    verifySignUp.checkRolesExisted,
  ],
  signup
);
router.get(
  '/organization/:organization/users/:userName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  findOne
);
router.put(
  '/organization/:organization/users/:userName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  update
);
// Org-scoped membership removal (hierarchy check happens in the controller)
router.delete(
  '/organization/:organization/users/:username',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.rejectExternallyManagedOrg,
  ],
  deleteUser
);

export default router;
