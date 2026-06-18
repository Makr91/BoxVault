import { Router } from 'express';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.get('/health', getHealth);

export default router;
