import rateLimit from 'express-rate-limit';
import { getRateLimitConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { problem } from '../utils/problem.js';

/**
 * Rate limiter middleware instance (not factory)
 * Create ONE instance that is used everywhere
 */
const rateLimitConfig = getRateLimitConfig();

// Shared window for every limiter — driven by the rate_limiting.window_minutes knob
const windowMs = rateLimitConfig.window_minutes * 60 * 1000;

const throttled = (req, res) => {
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

  return problem(res, req, { status: 429, type: 'throttled', title: rateLimitConfig.message });
};

const rateLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: rateLimitConfig.skip_successful_requests,
  skipFailedRequests: rateLimitConfig.skip_failed_requests,
  handler: throttled,
});

// Explicit rate limiter for file operations (CodeQL requirement)
const fileOperationLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.file_operations_max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: throttled,
});

// Explicit rate limiter for architecture operations (CodeQL requirement)
const architectureOperationLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.architecture_operations_max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: throttled,
});

// Dedicated rate limiter for download-link generation
const getDownloadLinkLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.download_link_max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: throttled,
});

// Dedicated rate limiter for file downloads
const downloadLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.download_max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: throttled,
});

// Dedicated rate limiter for sign-in and sign-up
const authLimiter = rateLimit({
  windowMs,
  max: rateLimitConfig.auth_max_requests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: throttled,
});

export {
  rateLimiter,
  fileOperationLimiter,
  architectureOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
  authLimiter,
};
