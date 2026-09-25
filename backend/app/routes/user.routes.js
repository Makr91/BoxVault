// user.routes.js
import { Router } from 'express';
import {
  authJwt,
  verifySignUp,
  verifyOrgAccess,
  oidcTokenRefresh,
  validateBody,
} from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { changePassword } from '../controllers/user/changepassword.js';
import { changeEmail } from '../controllers/user/changeemail.js';
import { changeName } from '../controllers/user/changename.js';
import { getUserProfile } from '../controllers/user/getuserprofile.js';
import { patchUser } from '../controllers/user/patch.js';
import { getUserOrganizations } from '../controllers/user/organizations.js';
import { updatePreferences } from '../controllers/user/preferences.js';
import { leaveOrganization } from '../controllers/user/leave.js';
import { setPrimaryOrganization } from '../controllers/user/setprimary.js';
import { isOnlyUserInOrg } from '../controllers/user/isonlyuserinorg.js';
import { findOne } from '../controllers/user/findone.js';
import { update } from '../controllers/user/update.js';
import { delete as deleteUser } from '../controllers/user/delete.js';
import { suspendUser } from '../controllers/auth/user/suspend.js';
import { resumeUser } from '../controllers/auth/user/resume.js';
import { listRoles, getUserRoles, setUserRoles } from '../controllers/auth/user/roles.js';
import { deleteUser as deleteUserAuth } from '../controllers/auth/user/delete.js';
import { signup } from '../controllers/auth/signup.js';
import { listUserWatches } from '../controllers/box/watch.js';
import { listUserIsoWatches } from '../controllers/iso/watch.js';
import { listUserDownloadWatches } from '../controllers/download/watch.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.put(
  '/users/:userId/change-password',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isSelfOrAdmin,
  validateBody('password'),
  changePassword
);
router.put(
  '/users/:userId/change-email',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isSelfOrAdmin,
  validateBody('email'),
  changeEmail
);
router.put(
  '/users/:userId/change-name',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isSelfOrAdmin,
  validateBody('displayName'),
  changeName
);
router.put(
  '/users/:userId/suspend',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  suspendUser
);
router.put(
  '/users/:userId/resume',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  resumeUser
);
router.get('/roles', apiLimiter, authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin, listRoles);
router.get(
  '/users/:userId/roles',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  getUserRoles
);
router.put(
  '/users/:userId/roles',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  validateBody('roles'),
  setUserRoles
);
router.delete(
  '/users/:userId',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isSelfOrAdmin,
  deleteUserAuth
);
router.get('/user', apiLimiter, authJwt.verifyToken, authJwt.isUser, getUserProfile);
router.patch(
  '/user',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  validateBody('profile', { partial: true }),
  patchUser
);

// Multi-organization user management (service accounts get their single organization)
router.get(
  '/user/organizations',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  getUserOrganizations
);

// Writes ride the acting user's OIDC token for federated accounts, so the
// token has to be fresh before the controller reaches for it.
router.patch(
  '/user/preferences',
  apiLimiter,
  oidcTokenRefresh,
  authJwt.verifyToken,
  authJwt.isUser,
  updatePreferences
);

router.get('/user/watches', apiLimiter, authJwt.verifyToken, authJwt.isUser, listUserWatches);

router.get(
  '/user/iso-watches',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  listUserIsoWatches
);

router.get(
  '/user/download-watches',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  listUserDownloadWatches
);

router.post(
  '/user/leave/:orgName',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  leaveOrganization
);

router.put(
  '/user/primary-organization/:orgName',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  setPrimaryOrganization
);

router.get(
  '/organizations/:organization/only-user',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  isOnlyUserInOrg
);
router.post(
  '/organization/:organization/users',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  verifyOrgAccess.isOrgAdminOrOwner,
  validateBody('register'),
  verifySignUp.checkRolesExisted,
  signup
);
router.get(
  '/organization/:organization/users/:userName',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  findOne
);
router.put(
  '/organization/:organization/users/:userName',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  authJwt.isAdmin,
  update
);
// Org-scoped membership removal (hierarchy check happens in the controller)
router.delete(
  '/organization/:organization/users/:username',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUser,
  verifyOrgAccess.isOrgAdminOrOwner,
  verifyOrgAccess.rejectExternallyManagedOrg,
  deleteUser
);

export default router;
