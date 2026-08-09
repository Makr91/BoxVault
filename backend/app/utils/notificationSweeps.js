import { X509Certificate } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';
import { sendHubNotification } from './notifyHub.js';
import { resolveGlobalAdminRecipients, resolveUserRecipients } from './notifyRecipients.js';
import { getSupportedLocales, t } from '../config/i18n.js';
import db from '../models/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Render one message key into every shipped language. The hub stores the map
 * and resolves it per recipient, so a sweep never has to know who it is
 * writing for.
 * @param {string} key - i18n message key
 * @param {Object} [replacements] - Interpolation values
 * @returns {Object} BCP 47 tag -> rendered string
 */
const localize = (key, replacements = {}) =>
  Object.fromEntries(getSupportedLocales().map(lang => [lang, t(key, lang, replacements)]));

const daysUntil = date => Math.ceil((new Date(date).getTime() - Date.now()) / DAY_MS);

const expiryThresholds = warnDays => [...new Set([warnDays, 7, 1])].filter(days => days > 0);

const sweepServiceAccountExpiry = async () => {
  const appConfig = loadConfig('app');
  const origin = appConfig.boxvault?.origin?.value || '';
  const warnDays = appConfig.monitoring?.sa_expiry_warning_days?.value ?? 14;
  const thresholds = expiryThresholds(warnDays);
  const { Op } = db.Sequelize;
  const horizon = new Date(Date.now() + (Math.max(...thresholds) + 1) * DAY_MS);

  const accounts = await db.service_account.findAll({
    where: { expiresAt: { [Op.gt]: new Date(), [Op.lte]: horizon } },
  });

  await Promise.all(
    accounts.map(async account => {
      const daysLeft = daysUntil(account.expiresAt);
      if (!thresholds.includes(daysLeft)) {
        return;
      }
      const recipients = await resolveUserRecipients([account.userId]);
      const notification = {
        title: localize('notifications.serviceAccountExpiry.title', {
          username: account.username,
        }),
        body: localize(
          daysLeft === 1
            ? 'notifications.serviceAccountExpiry.bodyOne'
            : 'notifications.serviceAccountExpiry.bodyOther',
          { days: daysLeft }
        ),
        navigate: `${origin}/profile`,
        tag: 'boxvault-sa-expiry',
      };
      await Promise.all(
        recipients.map(({ issuer, uuid }) =>
          sendHubNotification({
            issuer,
            recipient: { user_uuid: uuid },
            notification,
            type: 'ACCOUNT',
            severity: daysLeft <= 1 ? 'DANGER' : 'WARNING',
            idempotencyKey: `boxvault:sa-expiry:${account.id}:${daysLeft}`,
          })
        )
      );
    })
  );
};

const resolveCertPath = certPathValue => {
  if (isAbsolute(certPathValue)) {
    return certPathValue;
  }
  return join(global.__basedir || process.cwd(), 'app', 'config', 'ssl', certPathValue);
};

const sweepSslExpiry = async () => {
  const appConfig = loadConfig('app');
  const origin = appConfig.boxvault?.origin?.value || '';
  const warnDays = appConfig.monitoring?.ssl_expiry_warning_days?.value ?? 30;
  const thresholds = expiryThresholds(warnDays);
  const certPathValue = appConfig.ssl?.cert_path?.value;
  if (!certPathValue) {
    return;
  }
  const certPath = resolveCertPath(certPathValue);
  if (!existsSync(certPath)) {
    return;
  }

  const cert = new X509Certificate(readFileSync(certPath));
  const daysLeft = daysUntil(cert.validTo);
  if (!thresholds.includes(daysLeft)) {
    return;
  }

  const recipients = await resolveGlobalAdminRecipients();
  const notification = {
    title: localize('notifications.sslExpiry.title'),
    body: localize(
      daysLeft === 1 ? 'notifications.sslExpiry.bodyOne' : 'notifications.sslExpiry.bodyOther',
      { days: daysLeft, expiry: cert.validTo }
    ),
    navigate: `${origin}/admin`,
    tag: 'boxvault-ssl-expiry',
  };
  await Promise.all(
    recipients.map(({ issuer, uuid }) =>
      sendHubNotification({
        issuer,
        recipient: { user_uuid: uuid },
        notification,
        type: 'SYSTEM',
        severity: daysLeft <= 7 ? 'DANGER' : 'WARNING',
        idempotencyKey: `boxvault:ssl-expiry:${cert.validTo}:${daysLeft}`,
      })
    )
  );
};

const runNotificationSweeps = async () => {
  try {
    await sweepServiceAccountExpiry();
  } catch (err) {
    log.app.warn('Service-account expiry sweep failed', { error: err.message });
  }
  try {
    await sweepSslExpiry();
  } catch (err) {
    log.app.warn('SSL expiry sweep failed', { error: err.message });
  }
};

const startNotificationSweeps = () => {
  runNotificationSweeps();
  const timer = setInterval(runNotificationSweeps, DAY_MS);
  timer.unref();
  return timer;
};

export { startNotificationSweeps, runNotificationSweeps };
