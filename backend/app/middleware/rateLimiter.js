const { rateLimit } = require('express-rate-limit');
const { getRateLimitConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

/**
 * Rate limiter middleware factory
 * @returns {Function} Configured rate limiter middleware
 */
const rateLimiterMiddleware = () => {
  const rateLimitConfig = getRateLimitConfig();

  return rateLimit({
    windowMs: rateLimitConfig.window_minutes * 60 * 1000,
    max: rateLimitConfig.max_requests,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: rateLimitConfig.skip_successful_requests,
    skipFailedRequests: rateLimitConfig.skip_failed_requests,
    handler: (req, res) => {
      // Log rate limit hit with Winston
      log.api.warn('Rate limit exceeded', {
        ip: req.ip,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        remaining: res.getHeader('X-RateLimit-Remaining') || 0,
        limit: res.getHeader('X-RateLimit-Limit') || rateLimitConfig.max_requests,
        resetTime: res.getHeader('X-RateLimit-Reset'),
        windowMinutes: rateLimitConfig.window_minutes,
      });

      // Return JSON error (BoxVault is API-focused)
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: rateLimitConfig.message,
      });
    },
  });
};

module.exports = {
  rateLimiterMiddleware,
};
