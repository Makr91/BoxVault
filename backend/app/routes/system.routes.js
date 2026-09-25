import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { getStorageInfo } from '../controllers/system/storage.js';
import { getUpdateStatus } from '../controllers/system/update.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/system/storage', apiLimiter, authJwt.verifyToken, authJwt.isAdmin, getStorageInfo);

router.get(
  '/system/update-check',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isAdmin,
  getUpdateStatus
);

export default router;
