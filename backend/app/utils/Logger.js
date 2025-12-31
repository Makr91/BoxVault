/**
 * @fileoverview Centralized Logging System for BoxVault
 * @description Winston-based logging system for structured application logging
 * @author Mark Gilbert
 * @license GPL-3.0
 */

const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Get logging configuration (config should be loaded before Logger)
// This avoids circular dependency by having config loaded in main app before Logger import
let loggingConfig;
try {
  const { loadConfig } = require('./config-loader');
  const appConfig = loadConfig('app');
  loggingConfig = appConfig.logging || {};
} catch (e) {
  void e;
  // If config loading fails, use defaults
  loggingConfig = {};
}

// Extract values from config objects and merge with defaults
const extractedConfig = {
  level: loggingConfig.level?.value || 'info',
  console_enabled: loggingConfig.console_enabled?.value !== false,
  log_directory: loggingConfig.log_directory?.value || '/var/log/boxvault',
  performance_threshold_ms: loggingConfig.performance_threshold_ms?.value || 1000,
  categories: {},
};

// Extract category values
if (loggingConfig.categories) {
  for (const [category, config] of Object.entries(loggingConfig.categories)) {
    extractedConfig.categories[category] = config?.value || extractedConfig.level;
  }
}

// Ensure log directory exists
const logDir = extractedConfig.log_directory;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
}

/**
 * Common log format configuration
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, category, ...meta }) => {
    const categoryStr = category ? `[${category}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 0)}` : '';
    return `${timestamp} ${categoryStr} ${level}: ${message}${metaStr}`;
  })
);

/**
 * Create a logger for a specific category
 * @param {string} category - Log category name
 * @param {string} filename - Log filename (without extension)
 * @returns {winston.Logger} Configured winston logger
 */
const createCategoryLogger = (category, filename) => {
  const categoryLevel = extractedConfig.categories[category] || extractedConfig.level;
  const transports = [];

  // File transport for this category
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, `${filename}.log`),
      level: categoryLevel,
      format: logFormat,
      maxsize: 50 * 1024 * 1024, // 50MB max file size
      maxFiles: 5, // Keep 5 files
      tailable: true,
    })
  );

  // Console transport for development
  if (extractedConfig.console_enabled && process.env.NODE_ENV !== 'production') {
    transports.push(
      new winston.transports.Console({
        level: categoryLevel,
        format: consoleFormat,
      })
    );
  }

  return winston.createLogger({
    level: categoryLevel,
    format: logFormat,
    defaultMeta: { category, service: 'boxvault' },
    transports,
    exitOnError: false,
    silent: extractedConfig.level === 'silent',
  });
};

/**
 * Category-specific loggers for BoxVault
 */
const appLogger = createCategoryLogger('app', 'application');
const apiLogger = createCategoryLogger('api', 'api-requests');
const databaseLogger = createCategoryLogger('database', 'database');
const authLogger = createCategoryLogger('auth', 'auth');
const fileLogger = createCategoryLogger('file', 'file-operations');
const errorLogger = createCategoryLogger('error', 'errors');

/**
 * Helper function to safely log with fallback to stderr
 * @param {winston.Logger} logger - Winston logger instance
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
const safeLog = (logger, level, message, meta = {}) => {
  try {
    logger[level](message, meta);
  } catch (error) {
    // Fallback to stderr if winston fails
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    process.stderr.write(
      `${timestamp} [${level.toUpperCase()}] ${message}${metaStr} (Winston error: ${error.message})\n`
    );
  }
};

/**
 * Convenience logging functions for each category
 */
const log = {
  app: {
    info: (msg, meta) => safeLog(appLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(appLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(appLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(appLogger, 'debug', msg, meta),
  },

  api: {
    info: (msg, meta) => safeLog(apiLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(apiLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(apiLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(apiLogger, 'debug', msg, meta),
  },

  database: {
    info: (msg, meta) => safeLog(databaseLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(databaseLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(databaseLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(databaseLogger, 'debug', msg, meta),
  },

  auth: {
    info: (msg, meta) => safeLog(authLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(authLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(authLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(authLogger, 'debug', msg, meta),
  },

  file: {
    info: (msg, meta) => safeLog(fileLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(fileLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(fileLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(fileLogger, 'debug', msg, meta),
  },

  error: {
    info: (msg, meta) => safeLog(errorLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(errorLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(errorLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(errorLogger, 'debug', msg, meta),
  },
};

/**
 * Performance timing helper
 * @param {string} operation - Operation name
 * @returns {Object} Timer object with end() function
 */
const createTimer = operation => {
  const start = process.hrtime.bigint();
  return {
    end: (meta = {}) => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert nanoseconds to milliseconds

      // Log slow operations
      const thresholdMs = extractedConfig.performance_threshold_ms || 1000;
      if (duration >= thresholdMs) {
        log.app.warn(`Slow operation detected: ${operation}`, {
          operation,
          duration_ms: Math.round(duration * 100) / 100,
          threshold_ms: thresholdMs,
          ...meta,
        });
      }

      return Math.round(duration * 100) / 100;
    },
  };
};

/**
 * Request logging middleware helper
 * @param {string} requestId - Unique request identifier
 * @param {Object} req - Express request object
 * @returns {Object} Request logger with timing
 */
const createRequestLogger = (requestId, req) => {
  const start = Date.now();

  const logData = {
    requestId,
    method: req.method,
    path: req.path,
    user: req.entity?.name || req.user?.username,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
  };

  log.api.info('Request started', logData);

  return {
    success: (statusCode, meta = {}) => {
      const duration = Date.now() - start;
      log.api.info('Request completed', {
        ...logData,
        status: statusCode,
        duration_ms: duration,
        success: true,
        ...meta,
      });
    },

    error: (statusCode, error, meta = {}) => {
      const duration = Date.now() - start;
      log.api.error('Request failed', {
        ...logData,
        status: statusCode,
        duration_ms: duration,
        success: false,
        error,
        ...meta,
      });
    },
  };
};

module.exports = {
  log,
  createTimer,
  createRequestLogger,
  // Export individual loggers for direct use if needed
  appLogger,
  apiLogger,
  databaseLogger,
  authLogger,
  fileLogger,
  errorLogger,
};
