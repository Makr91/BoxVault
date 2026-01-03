const express = require('express');
const { verifySignUp, authJwt } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const auth = require('../controllers/auth.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/auth/signup',
  [verifySignUp.checkDuplicateUsernameOrEmail, verifySignUp.checkRolesExisted],
  auth.signup
);
router.post('/auth/signin', auth.signin);
router.get('/auth/verify-mail/:token', auth.verifyMail);
router.get('/auth/validate-invitation/:token', auth.validateInvitationToken);
router.get(
  '/invitations/active/:organization',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isModerator],
  auth.getActiveInvitations
);
router.post(
  '/auth/invite',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin],
  auth.sendInvitation
);
router.delete(
  '/invitations/:invitationId',
  [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin],
  auth.deleteInvitation
);

// Token refresh endpoint - protected by verifyToken middleware
router.post('/auth/refresh-token', [authJwt.verifyToken], auth.refreshToken);

module.exports = router;
