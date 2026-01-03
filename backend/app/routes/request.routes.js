const express = require('express');
const { authJwt, verifyOrgAccess } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const request = require('../controllers/request.controller');

const router = express.Router();

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
  request.createJoinRequest
);

router.get('/user/requests', [authJwt.verifyToken, authJwt.isUser], request.getUserJoinRequests);

router.delete(
  '/user/requests/:requestId',
  [authJwt.verifyToken, authJwt.isUser],
  request.cancelJoinRequest
);

// Moderator/admin actions - manage join requests
router.get(
  '/organization/:organization/requests',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  request.getOrgJoinRequests
);

router.post(
  '/organization/:organization/requests/:requestId/approve',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  request.approveJoinRequest
);

router.post(
  '/organization/:organization/requests/:requestId/deny',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModerator],
  request.denyJoinRequest
);

module.exports = router;
