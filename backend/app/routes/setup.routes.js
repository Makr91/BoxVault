// setup.routes.js
import { Router } from 'express';
import {
  verifySetupToken,
  updateConfigs,
  getConfigs,
  isSetupComplete,
  uploadSSL,
} from '../controllers/setup.controller.js';

const router = Router();

// Apply rate limiting to this router

router.post('/setup/verify-token', verifySetupToken);
router.put('/setup', updateConfigs);
router.get('/setup', getConfigs);
router.get('/setup/status', isSetupComplete);
router.post('/setup/upload-ssl', uploadSSL);

export default router;
