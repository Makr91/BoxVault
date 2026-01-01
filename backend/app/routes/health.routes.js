const express = require('express');
const { rateLimiter } = require('../middleware');
const healthController = require('../controllers/health.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.get('/health', healthController.getHealth);

module.exports = router;
