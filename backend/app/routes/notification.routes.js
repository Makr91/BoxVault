import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { createSubscription, deleteSubscription } from '../controllers/notification.controller.js';

const router = Router();

router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/notifications/subscriptions',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  createSubscription
);

router.delete(
  '/notifications/subscriptions',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  deleteSubscription
);

export default router;
