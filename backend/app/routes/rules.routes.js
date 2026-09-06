import { Router } from 'express';
import { getRules } from '../controllers/rules.controller.js';

const router = Router();

router.get('/rules', getRules);

export default router;
