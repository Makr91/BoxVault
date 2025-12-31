// box.routes.js
const { authJwt, verifyBoxName } = require('../middleware');
const box = require('../controllers/box.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.get('/api/discover', box.discoverAll);
  app.get('/api/discover/:name', box.discoverAll);
  app.get('/api/organization/:organization/box', box.getOrganizationBoxDetails);
  app.get('/api/organization/:organization/box/:name', box.findOne);
  app.get('/api/organization/:organization/box/:name/metadata', box.findOne);
  app.get(
    '/:organization/boxes/:name/versions/:version/providers/:provider/:architecture/vagrant.box',
    box.downloadBox
  );

  // Administrative Actions
  app.post(
    '/api/organization/:organization/box',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyBoxName.validateBoxName,
      verifyBoxName.checkBoxDuplicate,
    ],
    box.create
  );
  app.put(
    '/api/organization/:organization/box/:name',
    [
      authJwt.verifyToken,
      authJwt.isUserOrServiceAccount,
      verifyBoxName.validateBoxName,
      verifyBoxName.checkBoxDuplicate,
    ],
    box.update
  );
  app.delete(
    '/api/organization/:organization/box/:name',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    box.delete
  );
  app.delete(
    '/api/organization/:organization/box',
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
    box.deleteAll
  );
};
