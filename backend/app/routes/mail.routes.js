const express = require('express');
const { authJwt } = require('../middleware');
const mail = require('../controllers/mail.controller');

const router = express.Router();

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
