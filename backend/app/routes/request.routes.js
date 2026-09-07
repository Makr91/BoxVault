import { Router } from 'express';
import { authJwt, oidcTokenRefresh, verifyOrgAccess, validateBody } from '../middleware/index.js';
import { createJoinRequest } from '../controllers/request/create.js';
import { getUserJoinRequests } from '../controllers/request/getUserRequests.js';
import { cancelJoinRequest } from '../controllers/request/cancel.js';
import { getOrgJoinRequests } from '../controllers/request/getOrgRequests.js';
import { approveJoinRequest } from '../controllers/request/approve.js';
import { denyJoinRequest } from '../controllers/request/deny.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// User actions - join requests
router.post(
  '/organization/:organization/requests',
  [authJwt.verifyToken, authJwt.isUser, validateBody('joinRequest')],
  createJoinRequest
);

router.get('/user/requests', [authJwt.verifyToken, authJwt.isUser], getUserJoinRequests);

router.delete(
  '/user/requests/:requestId',
  [authJwt.verifyToken, authJwt.isUser],
  cancelJoinRequest
);

// Admin/owner actions - manage join requests
router.get(
  '/organization/:organization/requests',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  getOrgJoinRequests
);

router.post(
  '/organization/:organization/requests/:requestId/approve',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  approveJoinRequest
);

router.post(
  '/organization/:organization/requests/:requestId/deny',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdmin],
  denyJoinRequest
);

export default router;
