// user.routes.js

const { authJwt } = require('../middleware');
const { verifySignUp } = require('../middleware');
const user = require('../controllers/user.controller');
const auth = require('../controllers/auth.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.get('/api/users/all', user.allAccess);
  app.get('/api/users/user', [authJwt.verifyToken, authJwt.isUser], user.userBoard);
  app.get(
    '/api/users/admin',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    user.adminBoard
  );
  app.get(
    '/api/users/roles',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    user.getUserRoles
  );

  app.put(
    '/api/users/:userId/change-password',
    [authJwt.verifyToken],
    authJwt.isUser,
    user.changePassword
  );
  app.put(
    '/api/users/:userId/change-email',
    [authJwt.verifyToken],
    authJwt.isUser,
    user.changeEmail
  );
  app.put(
    '/api/users/:userId/promote',
    [authJwt.verifyToken],
    authJwt.isUser,
    user.promoteToModerator
  );
  app.put(
    '/api/users/:userId/demote',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin],
    user.demoteToUser
  );
  app.put(
    '/api/users/:userId/suspend',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    auth.suspendUser
  );
  app.put(
    '/api/users/:userId/resume',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    auth.resumeUser
  );
  app.delete(
    '/api/users/:userId',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isSelfOrAdmin],
    auth.deleteUser
  );
  app.get('/api/user', [authJwt.verifyToken, authJwt.isUser], user.getUserProfile);

  app.get(
    '/api/organizations',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    user.organization
  );
  app.get(
    '/api/organizations/:organizationName/only-user',
    [authJwt.verifyToken],
    authJwt.isUser,
    user.isOnlyUserInOrg
  );
  app.post(
    '/api/organization/:organizationName/users',
    [
      authJwt.verifyToken,
      authJwt.isUser,
      verifySignUp.checkDuplicateUsernameOrEmail,
      verifySignUp.checkRolesExisted,
    ],
    auth.signup
  );
  app.get(
    '/api/organization/:organizationName/users/:userName',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    user.findOne
  );
  app.put(
    '/api/organization/:organizationName/users/:userName',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    user.update
  );
  app.delete(
    '/api/organization/:organizationName/users/:username',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    user.delete
  );
};
