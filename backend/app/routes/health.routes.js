const express = require('express');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const healthController = require('../controllers/health.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiterMiddleware());

router.get('/health', healthController.getHealth);

module.exports = router;
