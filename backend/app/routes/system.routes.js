import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { getStorageInfo } from '../controllers/system/storage.js';
import { checkUpdate, applyUpdate } from '../controllers/app/updates.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/system/storage', apiLimiter, authJwt.verifyToken, authJwt.isAdmin, getStorageInfo);

router.get('/app/updates/check', apiLimiter, authJwt.verifyToken, authJwt.isAdmin, checkUpdate);

router.post('/app/updates/apply', apiLimiter, authJwt.verifyToken, authJwt.isAdmin, applyUpdate);

export default router;
