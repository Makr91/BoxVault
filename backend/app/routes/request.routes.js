import { Router } from 'express';
import { authJwt, verifyOrgAccess } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  createJoinRequest,
  getUserJoinRequests,
  cancelJoinRequest,
  getOrgJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
} from '../controllers/request.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// User actions - join requests
router.post(
  '/organization/:organization/requests',
  [authJwt.verifyToken, authJwt.isUser],
  createJoinRequest
);

router.get('/user/requests', [authJwt.verifyToken, authJwt.isUser], getUserJoinRequests);

router.delete(
  '/user/requests/:requestId',
  [authJwt.verifyToken, authJwt.isUser],
  cancelJoinRequest
);

// Moderator/admin actions - manage join requests
router.get(
  '/organization/:organization/requests',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  getOrgJoinRequests
);

router.post(
  '/organization/:organization/requests/:requestId/approve',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  approveJoinRequest
);

router.post(
  '/organization/:organization/requests/:requestId/deny',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  denyJoinRequest
);

export default router;
