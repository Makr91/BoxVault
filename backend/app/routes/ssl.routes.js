const express = require('express');
const { authJwt } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const sslController = require('../controllers/ssl.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.post('/config/ssl/upload', [authJwt.verifyToken, authJwt.isAdmin], sslController.uploadSSL);

module.exports = router;
