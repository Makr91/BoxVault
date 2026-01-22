import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { getStorageInfo, getUpdateStatus } from '../controllers/system.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/system/storage', [authJwt.verifyToken, authJwt.isAdmin], getStorageInfo);

router.get('/system/update-check', [authJwt.verifyToken, authJwt.isAdmin], getUpdateStatus);

export default router;
