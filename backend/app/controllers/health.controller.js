const { loadConfig } = require('../utils/config-loader');
const db = require('../models');
const fs = require('fs');
const path = require('path');
const { getSupportedLocales, getDefaultLocale } = require('../config/i18n');

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Get system health status including database connectivity, storage availability, supported languages, and logging configuration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Current server timestamp
 *                 version:
 *                   type: string
 *                   description: BoxVault version
 *                   example: "0.7.2"
 *                 environment:
 *                   type: string
 *                   description: Current environment
 *                   example: "production"
 *                 supported_languages:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of supported language codes
 *                   example: ["en", "es", "fr"]
 *                 default_language:
 *                   type: string
 *                   description: Default language code
 *                   example: "en"
 *                 frontend_logging:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     level:
 *                       type: string
 *                     categories:
 *                       type: object
 *                       properties:
 *                         app:
 *                           type: string
 *                         auth:
 *                           type: string
 *                         api:
 *                           type: string
 *                         file:
 *                           type: string
 *                         component:
 *                           type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: "ok"
 *                     storage:
 *                       type: string
 *                       example: "ok"
 *       500:
 *         description: Health check failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 message:
 *                   type: string
 *                   example: "Health check failed"
 *                 error:
 *                   type: string
 */
const getHealth = async (req, res) => {
  void req;
  try {
    const appConfig = loadConfig('app');

    const environment = process.env.NODE_ENV || 'development';

    let version = '0.0.0';
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
      );
      const { version: pkgVersion } = packageJson;
      version = pkgVersion;
    } catch (err) {
      void err;
    }

    const frontendLogging = appConfig.frontend_logging || {
      enabled: { value: true },
      level: { value: 'info' },
      categories: {
        app: { value: 'info' },
        auth: { value: 'info' },
        api: { value: 'info' },
        file: { value: 'info' },
        component: { value: 'debug' },
      },
    };

    const loggingConfig = {
      enabled: frontendLogging.enabled.value,
      level: frontendLogging.level.value,
      categories: {
        app: frontendLogging.categories.app?.value || 'info',
        auth: frontendLogging.categories.auth?.value || 'info',
        api: frontendLogging.categories.api?.value || 'info',
        file: frontendLogging.categories.file?.value || 'info',
        component: frontendLogging.categories.component?.value || 'debug',
      },
    };

    let dbStatus = 'ok';
    try {
      await db.sequelize.authenticate();
    } catch (error) {
      void error;
      dbStatus = 'error';
    }

    let storageStatus = 'ok';
    try {
      const storageDir = appConfig.boxvault.box_storage_directory.value;
      if (!fs.existsSync(storageDir)) {
        storageStatus = 'error';
      }
    } catch (error) {
      void error;
      storageStatus = 'unknown';
    }

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      environment,
      supported_languages: getSupportedLocales(),
      default_language: getDefaultLocale(),
      frontend_logging: loggingConfig,
      services: {
        database: dbStatus,
        storage: storageStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
      error: error.message,
    });
  }
};

module.exports = {
  getHealth,
};
