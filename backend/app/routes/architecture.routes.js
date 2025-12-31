// architecture.routes.js
const { authJwt, verifyArchitecture } = require('../middleware');
const architecture = require('../controllers/architecture.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.get(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
    architecture.findAllByProvider
  );
  app.get(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
    architecture.findOne
  );
  app.post(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyArchitecture.validateArchitecture,
      verifyArchitecture.checkArchitectureDuplicate,
    ],
    architecture.create
  );
  app.put(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyArchitecture.validateArchitecture],
    architecture.update
  );
  app.delete(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    architecture.delete
  );
  app.delete(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    architecture.deleteAllByProvider
  );
};
