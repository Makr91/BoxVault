// config.routes.js

const { authJwt } = require('../middleware');
const configController = require('../controllers/config.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });
  app.get('/api/config/gravatar', configController.getGravatarConfig);
  app.get(
    '/api/config/:configName',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    configController.getConfig
  );
  app.put(
    '/api/config/:configName',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    configController.updateConfig
  );
  app.post(
    '/api/config/restart',
    [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
    configController.restartServer
  );
};
