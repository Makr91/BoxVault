import { Router } from 'express';
import { getBadge } from '../controllers/box/badge.js';

const router = Router();

router.get('/badge/:organization/:name.svg', getBadge);

export default router;
