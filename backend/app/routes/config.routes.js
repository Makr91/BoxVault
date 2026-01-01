// config.routes.js
const express = require('express');
const { authJwt, rateLimiter } = require('../middleware');
const configController = require('../controllers/config.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/config/gravatar', configController.getGravatarConfig);
router.get('/config/ticket', configController.getTicketConfig);
router.get(
  '/config/:configName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  configController.getConfig
);
router.put(
  '/config/:configName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  configController.updateConfig
);
router.post(
  '/config/restart',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  configController.restartServer
);

module.exports = router;
