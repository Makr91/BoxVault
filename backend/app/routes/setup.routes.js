// setup.routes.js
import { Router } from 'express';
import { verifySetupToken } from '../controllers/setup/verify.js';
import { updateConfigs } from '../controllers/setup/update.js';
import { getConfigs } from '../controllers/setup/get.js';
import { getSchemas } from '../controllers/setup/schema.js';
import { isSetupComplete } from '../controllers/setup/check.js';
import { uploadSSL } from '../controllers/setup/upload.js';

const router = Router();

// Apply rate limiting to this router

router.post('/setup/verify-token', verifySetupToken);
router.put('/setup', updateConfigs);
router.get('/setup', getConfigs);
router.get('/setup/schema', getSchemas);
router.get('/setup/status', isSetupComplete);
router.post('/setup/upload-ssl', uploadSSL);

export default router;
