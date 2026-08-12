import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

// Apply rate limiting to this router

router.get('/health', getHealth);

export default router;
