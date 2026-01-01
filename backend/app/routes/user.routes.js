// user.routes.js
const express = require('express');
const { authJwt } = require('../middleware');
const { verifySignUp } = require('../middleware');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const user = require('../controllers/user.controller');
const auth = require('../controllers/auth.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/users/all', user.allAccess);
router.get('/users/user', [authJwt.verifyToken, authJwt.isUser], user.userBoard);
router.get('/users/admin', [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin], user.adminBoard);
router.get(
  '/users/roles',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  user.getUserRoles
);

router.put(
  '/users/:userId/change-password',
  [authJwt.verifyToken],
  authJwt.isUser,
  user.changePassword
);
router.put('/users/:userId/change-email', [authJwt.verifyToken], authJwt.isUser, user.changeEmail);
router.put(
  '/users/:userId/promote',
  [authJwt.verifyToken],
  authJwt.isUser,
  user.promoteToModerator
);
router.put(
  '/users/:userId/demote',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin],
  user.demoteToUser
);
router.put(
  '/users/:userId/suspend',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  auth.suspendUser
);
router.put(
  '/users/:userId/resume',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  auth.resumeUser
);
router.delete(
  '/users/:userId',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
  auth.deleteUser
);
router.get('/user', [authJwt.verifyToken, authJwt.isUser], user.getUserProfile);

router.get(
  '/organizations',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  user.organization
);
router.get(
  '/organizations/:organizationName/only-user',
  [authJwt.verifyToken],
  authJwt.isUser,
  user.isOnlyUserInOrg
);
router.post(
  '/organization/:organizationName/users',
  [
    authJwt.verifyToken,
    authJwt.isUser,
    verifySignUp.checkDuplicateUsernameOrEmail,
    verifySignUp.checkRolesExisted,
  ],
  auth.signup
);
router.get(
  '/organization/:organizationName/users/:userName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  user.findOne
);
router.put(
  '/organization/:organizationName/users/:userName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  user.update
);
router.delete(
  '/organization/:organizationName/users/:username',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  user.delete
);

module.exports = router;
