const { authJwt, verifyOrganization } = require('../middleware');
const organization = require('../controllers/organization.controller');
module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });
  app.get(
    '/api/organizations-with-users',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    organization.findAllWithUsers
  );
  app.get(
    '/api/organization/:organizationName/users',
    [authJwt.verifyToken, authJwt.isUser],
    organization.findOneWithUsers
  );
  app.get('/api/organization', [authJwt.verifyToken, authJwt.isUser], organization.findAll);
  app.get(
    '/api/organization/:organizationName',
    [authJwt.verifyToken, authJwt.isUser],
    organization.findOne
  );
  app.post(
    '/api/organization',
    [
      authJwt.verifyToken,
      authJwt.isUser,
      verifyOrganization.validateOrganization,
      verifyOrganization.checkOrganizationDuplicate,
    ],
    organization.create
  );
  app.put(
    '/api/organization/:organizationName',
    [
      authJwt.verifyToken,
      authJwt.isUser,
      authJwt.isModeratorOrAdmin,
      verifyOrganization.validateOrganization,
    ],
    organization.update
  );
  app.delete(
    '/api/organization/:organizationName',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    organization.delete
  );
  app.put(
    '/api/organization/:organizationName/suspend',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    organization.suspendOrganization
  );
  app.put(
    '/api/organization/:organizationName/resume',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    organization.resumeOrganization
  );
};
