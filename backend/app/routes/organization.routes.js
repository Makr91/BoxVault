import { Router } from 'express';
import { authJwt, validateBody, verifyOrgAccess, sessionAuth } from '../middleware/index.js';
import { discoverOrganizations } from '../controllers/organization/discover.js';
import { findAllWithUsers } from '../controllers/organization/findallwithusers.js';
import { findOneWithUsers } from '../controllers/organization/findonewithusers.js';
import { findAll } from '../controllers/organization/findall.js';
import { findOne } from '../controllers/organization/findone.js';
import { create } from '../controllers/organization/create.js';
import { update } from '../controllers/organization/update.js';
import { delete as deleteOrg } from '../controllers/organization/delete.js';
import { suspendOrganization } from '../controllers/organization/suspend.js';
import { resumeOrganization } from '../controllers/organization/resume.js';
import { updateAccessMode } from '../controllers/organization/accessmode.js';
import { updateUserOrgRole } from '../controllers/organization/updateuserrole.js';
import { removeUserFromOrg } from '../controllers/organization/removeuser.js';
import { joinAsAdmin } from '../controllers/organization/joinasadmin.js';
import { loadConfig } from '../utils/config-loader.js';
import { problem } from '../utils/problem.js';
import db from '../models/index.js';

const { user: User } = db;

const router = Router();

/**
 * Gate on POST /organization: refuse while auth.local.local_allow_new_organizations
 * is false, unless the caller is a global admin.
 */
const allowNewOrganizations = async (req, res, next) => {
  const authConfig = loadConfig('auth');
  if (authConfig.auth?.local?.local_allow_new_organizations) {
    return next();
  }

  const user = await User.findByPk(req.userId);
  const roles = await user.getRoles();
  if (roles.some(role => role.name === 'admin')) {
    return next();
  }

  return problem(res, req, {
    status: 403,
    type: 'forbidden',
    title: req.__('auth.newOrganizationsDisabled'),
  });
};

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

router.get('/organization/:organization', sessionAuth, findOne);

router.post(
  '/organization',
  [authJwt.verifyToken, authJwt.isUser, allowNewOrganizations, validateBody('organization')],
  create
);

router.put(
  '/organization/:organization',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('organization', { partial: true }),
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
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('accessMode'),
  ],
  updateAccessMode
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
