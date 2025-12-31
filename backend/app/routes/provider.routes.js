// provider.routes.js
const { authJwt, verifyProvider } = require('../middleware');
const provider = require('../controllers/provider.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.post(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyProvider.validateProvider,
      verifyProvider.checkProviderDuplicate,
    ],
    provider.create
  );

  app.get(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider',
    provider.findAllByVersion
  );
  app.get(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
    provider.findOne
  );

  app.put(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyProvider.validateProvider],
    provider.update
  );
  app.delete(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    provider.delete
  );
  app.delete(
    '/api/organization/:organization/box/:boxId/version/:versionNumber/provider',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    provider.deleteAllByVersion
  );
};
