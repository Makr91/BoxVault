// webPush.js — BoxVault's own Web Push channel. BoxVault signs its OS toasts
// with its own VAPID keypair and delivers them to subscriptions registered on
// its own origin, so toasts keep working when the notification hub is down and
// carry BoxVault's identity rather than the auth server's. The hub is used
// only for the in-page bell feed (see notifyHub.js).
import webpush from 'web-push';
import { loadConfig, getConfigPath, readConfigFile } from './config-loader.js';
import { log } from './Logger.js';
import { writeConfig } from '../controllers/config/helpers.js';
import db from '../models/index.js';

// 404/410 = the push service dropped the endpoint; 403 = the subscription was
// minted against a different VAPID key and can never accept our messages.
const DEAD_STATUS_CODES = [403, 404, 410];

/**
 * Read the VAPID details needed to sign a push message.
 * @returns {Object|null} { publicKey, privateKey, subject } or null when the
 *   feature is disabled or the keypair has not been generated yet
 */
const getVapidDetails = () => {
  try {
    const section = loadConfig('app').notifications;

    if (!section || section.enabled === false) {
      return null;
    }

    const publicKey = section.vapid_public_key;
    const privateKey = section.vapid_private_key;

    if (!publicKey || !privateKey) {
      return null;
    }

    return {
      publicKey,
      privateKey,
      subject: section.vapid_subject || 'mailto:admin@localhost',
    };
  } catch (err) {
    log.app.warn('Could not read push notification config', { error: err.message });
    return null;
  }
};

/**
 * The public key browsers pass to PushManager.subscribe().
 * @returns {string|null} URL-safe base64 public key, or null when unavailable
 */
const getVapidPublicKey = () => getVapidDetails()?.publicKey || null;

/**
 * Generate and persist a VAPID keypair when one is not configured yet.
 * @returns {Promise<boolean>} True when the config was written
 */
const ensureVapidKeys = async () => {
  try {
    const config = readConfigFile('app');
    const section = { ...(config.notifications || {}) };

    if (section.vapid_public_key && section.vapid_private_key) {
      return false;
    }

    const keys = webpush.generateVAPIDKeys();
    section.vapid_public_key = keys.publicKey;
    section.vapid_private_key = keys.privateKey;

    await writeConfig(getConfigPath('app'), { ...config, notifications: section });
    log.app.info('Generated BoxVault VAPID keypair for push notifications');
    return true;
  } catch (err) {
    log.app.error('Failed to prepare VAPID keys; OS toasts stay disabled', {
      error: err.message,
    });
    return false;
  }
};

/**
 * Build the payload the service worker consumes. Kept small — push services
 * cap encrypted payloads at roughly 4KB.
 * @param {Object} notification - { title, body, navigate, tag, icon }
 * @returns {string} JSON payload
 */
const serializeNotification = ({ title, body, navigate, tag, icon }) =>
  JSON.stringify({
    title,
    body,
    icon,
    tag,
    data: { navigate },
  });

/**
 * Deliver an OS toast to every device the given users have registered.
 * Fire-and-forget: never throws, and prunes subscriptions the push service
 * reports as gone.
 * @param {number[]} userIds - BoxVault user IDs
 * @param {Object} notification - { title, body, navigate, tag, icon }
 * @returns {Promise<number>} Count of successfully delivered messages
 */
const sendPushToUsers = async (userIds, notification) => {
  try {
    const recipients = [...new Set(userIds || [])].filter(Boolean);

    if (recipients.length === 0 || !notification) {
      return 0;
    }

    const vapid = getVapidDetails();
    if (!vapid) {
      log.app.debug('Push notifications unavailable; skipping toast', { tag: notification.tag });
      return 0;
    }

    const { Op } = db.Sequelize;
    const subscriptions = await db.pushSubscription.findAll({
      where: { user_id: { [Op.in]: recipients } },
    });

    if (subscriptions.length === 0) {
      return 0;
    }

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = serializeNotification(notification);

    const results = await Promise.all(
      subscriptions.map(async subscription => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload
          );
          return true;
        } catch (err) {
          if (DEAD_STATUS_CODES.includes(err.statusCode)) {
            await subscription.destroy();
            log.app.debug('Pruned dead push subscription', {
              id: subscription.id,
              status: err.statusCode,
            });
          } else {
            log.app.warn('Push delivery failed', {
              id: subscription.id,
              status: err.statusCode,
              error: err.message,
            });
          }
          return false;
        }
      })
    );

    return results.filter(Boolean).length;
  } catch (err) {
    log.app.warn('Push fan-out failed', { error: err.message, tag: notification?.tag });
    return 0;
  }
};

export { ensureVapidKeys, getVapidPublicKey, sendPushToUsers };
