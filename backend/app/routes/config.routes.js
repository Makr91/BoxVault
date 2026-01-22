// config.routes.js
import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  getGravatarConfig,
  getTicketConfig,
  getConfig,
  updateConfig,
  restartServer,
} from '../controllers/config.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/config/gravatar', getGravatarConfig);
router.get('/config/ticket', getTicketConfig);
router.get(
  '/config/:configName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  getConfig
);
router.put(
  '/config/:configName',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  updateConfig
);
router.post(
  '/config/restart',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  restartServer
);

export default router;
