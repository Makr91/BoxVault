import { isProduction, loadConfig } from '../../utils/config-loader.js';
import db from '../../models/index.js';
const { sequelize } = db;
import { existsSync, promises, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import nodemailer from 'nodemailer';
import { getSupportedLocales, getDefaultLocale } from '../../config/i18n.js';
import { getIsoStorageRoot } from '../iso/helpers.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { notifyHealth } from '../../utils/events.js';
import { sendHubNotification } from '../../utils/notifyHub.js';
import { resolveGlobalAdminRecipients } from '../../utils/notifyRecipients.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let lastAlertTime = 0;
let lastHealth = null;

const OIDC_PROBE_TTL_MS = 60 * 1000;
let oidcProbe = { expiresAt: 0, result: Promise.resolve({}) };

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
 *                     storage_boxes:
 *                       type: string
 *                       description: Coarse status word (Good/Warning/Error)
 *                       example: "Good"
 *                     storage_isos:
 *                       type: string
 *                       description: Coarse status word (Good/Warning/Error)
 *                       example: "Good"
 *                     oidc_providers:
 *                       type: string
 *                       description: Coarse aggregate status word (Good/Warning/Error), present only when OIDC providers are configured
 *                       example: "Good"
 *       500:
 *         description: Health check failed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const checkUrl = url =>
  new Promise(resolve => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, res => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve('ok');
      } else if (res.statusCode === 429) {
        resolve(`warning (${res.statusCode})`);
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
  if (!existsSync(dirPath)) {
    return { status: 'error', message: 'Path not found' };
  }
  if (!promises.statfs) {
    return { status: 'ok', message: 'ok' }; // Not supported on this Node version
  }

  try {
    const stats = await promises.statfs(dirPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize; // Available to non-privileged users
    const used = total - free;
    const percent = (used / total) * 100;
    const percentStr = percent.toFixed(1);
    const appConfig = loadConfig('app');
    const criticalThreshold = appConfig.monitoring?.disk_space_critical_threshold ?? 95;
    const warningThreshold = appConfig.monitoring?.disk_space_warning_threshold ?? 90;

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

const mapStatus = status => {
  if (status === 'ok') {
    return 'Good';
  }
  if (status === 'warning') {
    return 'Warning';
  }
  return 'Error';
};

const probeOidcProviders = async () => {
  const services = {};
  try {
    const authConfig = loadConfig('auth');
    if (authConfig?.auth?.oidc?.providers) {
      const { providers } = authConfig.auth.oidc;
      for (const [key, provider] of Object.entries(providers)) {
        if (provider.enabled === true && provider.issuer) {
          // Probe the discovery document OIDC actually depends on — issuer
          // roots legitimately answer 4xx (login walls) without OIDC being down.
          const issuerBase = provider.issuer.replace(/\/+$/, '');
          // eslint-disable-next-line no-await-in-loop
          services[`oidc_${key}`] = await checkUrl(
            `${issuerBase}/.well-known/openid-configuration`
          );
        }
      }
    }
  } catch {
    /* ignore */
  }
  return services;
};

/**
 * The OIDC probe results, shared by every caller for 60 seconds so an
 * unauthenticated health call cannot make this host hammer its issuers.
 * @returns {Promise<Object>} One status string per enabled provider
 */
const checkOidcProviders = () => {
  if (Date.now() < oidcProbe.expiresAt) {
    return oidcProbe.result;
  }
  oidcProbe = { expiresAt: Date.now() + OIDC_PROBE_TTL_MS, result: probeOidcProviders() };
  return oidcProbe.result;
};

const getVersionInfo = () => {
  try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
    return packageJson.version || '0.0.0';
  } catch (err) {
    void err;
    return '0.0.0';
  }
};

const getLoggingConfig = appConfig => {
  const frontendLogging = appConfig.frontend_logging || { enabled: true, level: 'info' };
  const categories = frontendLogging.categories || {};

  return {
    enabled: frontendLogging.enabled,
    level: frontendLogging.level,
    categories: {
      app: categories.app || 'info',
      auth: categories.auth || 'info',
      api: categories.api || 'info',
      file: categories.file || 'info',
      component: categories.component || 'debug',
    },
  };
};

const getDbStatus = async () => {
  try {
    await sequelize.authenticate();
    return 'ok';
  } catch (error) {
    void error;
    return 'Error';
  }
};

const sendDiskAlertEmail = async (boxDisk, isoDisk) => {
  const alertEmails = loadConfig('mail')?.smtp_settings?.alert_emails;
  if (!alertEmails || alertEmails.length === 0) {
    return;
  }
  try {
    const mailConfig = loadConfig('mail');
    const transporter = nodemailer.createTransport({
      host: mailConfig.smtp_connect.host,
      port: mailConfig.smtp_connect.port,
      secure: mailConfig.smtp_connect.secure,
      auth: {
        user: mailConfig.smtp_auth.user,
        pass: mailConfig.smtp_auth.password,
      },
      tls: {
        rejectUnauthorized: mailConfig.smtp_connect.reject_unauthorized,
      },
    });

    await transporter.sendMail({
      from: mailConfig.smtp_settings.from,
      to: alertEmails.join(', '),
      subject: 'Critical Disk Usage Alert',
      text: `High disk usage detected!\nBox: ${boxDisk.message}\nISO: ${isoDisk.message}`,
    });

    log.app.warn(
      `[ALERT] High disk usage detected! Sending alert email to ${alertEmails.join(
        ', '
      )}. Box: ${boxDisk.message}, ISO: ${isoDisk.message}`
    );
  } catch (e) {
    log.error.error('Failed to send alert email', e);
  }
};

const sendDiskAlertNotifications = async (boxDisk, isoDisk, appConfig) => {
  try {
    const recipients = await resolveGlobalAdminRecipients();
    const origin = appConfig.boxvault?.origin || '';
    const hourBucket = new Date().toISOString().slice(0, 13);
    await Promise.all(
      recipients.map(({ issuer, uuid }) =>
        sendHubNotification({
          issuer,
          recipient: { user_uuid: uuid },
          notification: {
            title: 'BoxVault disk space alert',
            body: `Box storage: ${boxDisk.message}. ISO storage: ${isoDisk.message}.`,
            navigate: `${origin}/admin`,
            tag: 'boxvault-disk',
          },
          type: 'SYSTEM',
          severity: 'WARNING',
          idempotencyKey: `boxvault:disk-alert:${hourBucket}:user:${uuid}`,
        })
      )
    );
  } catch (e) {
    log.app.warn('Disk-alert notification skipped', { error: e.message });
  }
};

const handleDiskAlerting = async (boxDisk, isoDisk, appConfig) => {
  if (boxDisk.status !== 'warning' && isoDisk.status !== 'warning') {
    return;
  }

  const alertFrequencyHours = appConfig.monitoring?.alert_frequency_hours ?? 24;
  const now = Date.now();
  // Alert at most once every X hours
  if (alertFrequencyHours === 0 || now - lastAlertTime > alertFrequencyHours * 60 * 60 * 1000) {
    await sendDiskAlertEmail(boxDisk, isoDisk);
    await sendDiskAlertNotifications(boxDisk, isoDisk, appConfig);
    lastAlertTime = now;
  }
};

const calculateOverallStatus = services => {
  const allStatuses = Object.values(services);
  if (allStatuses.some(s => String(s).includes('Error') || String(s).includes('Bad'))) {
    return 'error';
  }
  if (allStatuses.some(s => String(s).includes('Warning') || String(s).includes('Warn'))) {
    return 'warning';
  }
  return 'ok';
};

/**
 * The /api/health body: the overall status, the coarse state of every
 * service, and the host facts the UI reads on boot.
 * @returns {Promise<Object>} The health report
 */
const getHealthReport = async () => {
  const appConfig = loadConfig('app');

  const environment = isProduction ? 'production' : 'development';

  const version = getVersionInfo();
  const loggingConfig = getLoggingConfig(appConfig);

  const services = {
    database: await getDbStatus(),
  };

  // Check Storage
  const boxStorageDir = appConfig.boxvault?.box_storage_directory;
  const isoStorageDir = getIsoStorageRoot();
  const boxDisk = await checkDiskUsage(boxStorageDir);
  const isoDisk = await checkDiskUsage(isoStorageDir);
  services.storage_boxes = mapStatus(boxDisk.status);
  services.storage_isos = mapStatus(isoDisk.status);

  // Alerting Logic
  await handleDiskAlerting(boxDisk, isoDisk, appConfig);

  // Check OIDC Providers (#54): the public payload carries ONE coarse,
  // threshold-derived status word for the whole OIDC set — never counts,
  // per-provider detail, or issuer identities.
  const oidcServices = await checkOidcProviders();
  const oidcStatuses = Object.values(oidcServices);
  if (oidcStatuses.length > 0) {
    let oidcStatus = 'Good';
    if (oidcStatuses.some(s => String(s).startsWith('error'))) {
      oidcStatus = 'Error';
    } else if (oidcStatuses.some(s => String(s).startsWith('warning'))) {
      oidcStatus = 'Warning';
    }
    services.oidc_providers = oidcStatus;
  }

  const overallStatus = calculateOverallStatus(services);

  // Public payload stays coarse (#54): every services value is a bare status
  // word (ok/Good/Warning/Error). Disk percentages and per-provider OIDC
  // detail feed the overall status and internal alerting but are never
  // exposed.
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version,
    environment,
    supported_languages: getSupportedLocales(),
    default_language: getDefaultLocale(),
    frontend_logging: loggingConfig,
    services,
  };
};

const getHealth = async (req, res) => {
  try {
    return res.status(200).json(await getHealthReport());
  } catch (error) {
    log.error.error('Health check failed:', error);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('health.checkFailed'),
    });
  }
};

const healthChanged = (previous, next) =>
  previous === null ||
  previous.status !== next.status ||
  JSON.stringify(previous.services) !== JSON.stringify(next.services);

/**
 * Re-evaluate the health state and push it on the health topic when the
 * status or any service state differs from the last broadcast.
 * @returns {Promise<void>}
 */
const publishHealthChange = async () => {
  try {
    const { status, timestamp, services } = await getHealthReport();
    const health = { status, timestamp, services };
    if (healthChanged(lastHealth, health)) {
      lastHealth = health;
      notifyHealth(health);
    }
  } catch (error) {
    log.error.error('Health watch failed:', error);
  }
};

/**
 * Evaluate the health state now and again on the OIDC probe cadence,
 * broadcasting every change on the health topic.
 * @returns {NodeJS.Timeout} The interval timer
 */
const startHealthWatch = () => {
  publishHealthChange();
  const timer = setInterval(publishHealthChange, OIDC_PROBE_TTL_MS);
  timer.unref();
  return timer;
};

export { getHealth, getHealthReport, publishHealthChange, startHealthWatch };
