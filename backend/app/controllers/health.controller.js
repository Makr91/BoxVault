const { loadConfig } = require('../utils/config-loader');
const db = require('../models');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getSupportedLocales, getDefaultLocale } = require('../config/i18n');
const { getIsoStorageRoot } = require('./iso/helpers');

let lastAlertTime = 0;

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
const checkUrl = url =>
  new Promise(resolve => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, res => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve('ok');
      } else {
        resolve(`error (${res.statusCode})`);
      }
    });
    req.on('error', () => resolve('error (unreachable)'));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve('error (timeout)');
    });
  });

const checkDiskUsage = async dirPath => {
  if (!fs.existsSync(dirPath)) {
    return { status: 'error', message: 'Path not found' };
  }
  if (!fs.promises.statfs) {
    return { status: 'ok', message: 'ok' }; // Not supported on this Node version
  }

  try {
    const stats = await fs.promises.statfs(dirPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize; // Available to non-privileged users
    const used = total - free;
    const percent = (used / total) * 100;
    const percentStr = percent.toFixed(1);
    const appConfig = loadConfig('app');
    const criticalThreshold = appConfig.monitoring?.disk_space_critical_threshold?.value || 95;
    const warningThreshold = appConfig.monitoring?.disk_space_warning_threshold?.value || 90;

    if (percent > criticalThreshold) {
      return { status: 'warning', message: `CRITICAL: ${percentStr}% used` };
    }
    if (percent > warningThreshold) {
      return { status: 'warning', message: `Warning: ${percentStr}% used` };
    }
    return { status: 'ok', message: `ok (${percentStr}%)` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

const checkOidcProviders = async () => {
  const services = {};
  try {
    const authConfig = loadConfig('auth');
    if (authConfig?.auth?.oidc?.providers) {
      const { providers } = authConfig.auth.oidc;
      for (const [key, provider] of Object.entries(providers)) {
        if (provider.enabled?.value && provider.issuer?.value) {
          // eslint-disable-next-line no-await-in-loop
          services[`oidc_${key}`] = await checkUrl(provider.issuer.value);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return services;
};

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

    const services = {
      database: dbStatus,
    };

    // Check Storage
    const boxStorageDir = appConfig.boxvault?.box_storage_directory?.value;
    const isoStorageDir = getIsoStorageRoot();

    const boxDisk = await checkDiskUsage(boxStorageDir);
    services.storage_boxes = boxDisk.message;

    const isoDisk = await checkDiskUsage(isoStorageDir, 'ISO Storage');
    services.storage_isos = isoDisk.message;

    // Alerting Logic
    if (boxDisk.status === 'warning' || isoDisk.status === 'warning') {
      const alertFrequencyHours = appConfig.monitoring?.alert_frequency_hours?.value || 24;
      const now = Date.now();
      // Alert at most once every X hours
      if (now - lastAlertTime > alertFrequencyHours * 60 * 60 * 1000) {
        const alertEmails = loadConfig('mail')?.smtp_settings?.alert_emails?.value;
        if (alertEmails && alertEmails.length > 0) {
          // Placeholder for email sending logic
          // In a real implementation, you would loop through alertEmails and call mailController.sendAlert()
          console.warn(
            `[ALERT] High disk usage detected! Sending alert email to ${alertEmails.join(
              ', '
            )}. Box: ${boxDisk.message}, ISO: ${isoDisk.message}`
          );
          lastAlertTime = now;
        }
      }
    }

    // Check OIDC Providers
    const oidcServices = await checkOidcProviders();
    Object.assign(services, oidcServices);

    const overallStatus = Object.values(services).some(s => String(s).startsWith('error'))
      ? 'error'
      : 'ok';

    return res.status(200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version,
      environment,
      supported_languages: getSupportedLocales(),
      default_language: getDefaultLocale(),
      frontend_logging: loggingConfig,
      services,
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
