import { Router } from 'express';
import { reportClientErrors } from '../controllers/client_errors.controller.js';

const router = Router();

router.post('/client-errors', reportClientErrors);

export default router;
