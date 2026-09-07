// config.routes.js
import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { getGravatarProfile } from '../controllers/config/gravatar.js';
import { getTicketConfig } from '../controllers/config/ticket.js';
import { getHyperweaverConfig } from '../controllers/config/hyperweaver.js';
import { getConfig } from '../controllers/config/get.js';
import { getConfigSchema } from '../controllers/config/schema.js';
import { updateConfig } from '../controllers/config/update.js';
import { restartServer } from '../controllers/config/restart.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Server-side Gravatar proxy (#17) — the API key never leaves the server
router.get('/gravatar/profile/:emailHash', getGravatarProfile);
router.get('/config/ticket', getTicketConfig);
router.get('/config/hyperweaver', getHyperweaverConfig);
router.post(
  '/config/restart',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  restartServer
);
router.get(
  '/config/:configName/schema',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isAdmin],
  getConfigSchema
);
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

export default router;
