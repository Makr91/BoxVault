// version.routes.js
const { authJwt, verifyVersion } = require('../middleware');
const version = require('../controllers/version.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.post(
    '/api/organization/:organization/box/:boxId/version',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyVersion.validateVersion,
      verifyVersion.checkVersionDuplicate,
    ],
    version.create
  );
  app.put(
    '/api/organization/:organization/box/:boxId/version/:versionNumber',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyVersion.validateVersion,
      verifyVersion.checkVersionDuplicate,
    ],
    version.update
  );
  app.get('/api/organization/:organization/box/:boxId/version', version.findAllByBox);
  app.get('/api/organization/:organization/box/:boxId/version/:versionNumber', version.findOne);
  app.delete(
    '/api/organization/:organization/box/:boxId/version/:versionNumber',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    version.delete
  );
  app.delete(
    '/api/organization/:organization/box/:boxId/version',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    version.deleteAllByBox
  );
};
