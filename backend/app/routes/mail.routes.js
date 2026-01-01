const express = require('express');
const { authJwt, rateLimiter } = require('../middleware');
const mail = require('../controllers/mail.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post('/mail/test-smtp', [authJwt.verifyToken, authJwt.isAdmin], mail.testSmtp);
router.post(
  '/auth/resend-verification',
  [authJwt.verifyToken, authJwt.isUser],
  mail.resendVerificationMail
);

module.exports = router;
