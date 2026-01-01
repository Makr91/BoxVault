// setup.routes.js
const express = require('express');
const setupController = require('../controllers/setup.controller');

const router = express.Router();

router.post('/setup/verify-token', setupController.verifySetupToken);
router.put('/setup', setupController.updateConfigs);
router.get('/setup', setupController.getConfigs);
router.get('/setup/status', setupController.isSetupComplete);
router.post('/setup/upload-ssl', setupController.uploadSSL);

module.exports = router;
