import { Router } from 'express';
import { reportClientErrors } from '../controllers/client_errors/report.js';

const router = Router();

router.post('/client-errors', reportClientErrors);

export default router;
