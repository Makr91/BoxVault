import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { testSmtp } from '../controllers/mail/test.js';
import { resendVerificationMail } from '../controllers/mail/resend.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post('/mail/test-smtp', [authJwt.verifyToken, authJwt.isAdmin], testSmtp);
router.post(
  '/auth/resend-verification',
  [authJwt.verifyToken, authJwt.isUser],
  resendVerificationMail
);

export default router;
