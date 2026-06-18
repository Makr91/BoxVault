import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { uploadSSL } from '../controllers/ssl.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.post('/config/ssl/upload', [authJwt.verifyToken, authJwt.isAdmin], uploadSSL);

export default router;
