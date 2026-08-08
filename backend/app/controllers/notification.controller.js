import axios from 'axios';
import { log } from '../utils/Logger.js';
import { getVapidPublicKey } from '../utils/webPush.js';
import db from '../models/index.js';
import { getAuthServerUrl, extractOidcAccessToken } from './favorites/helpers.js';

const buildNotificationsUrl = (req, path = '') =>
  `${getAuthServerUrl(req)}/api/notifications${path}`;

const buildAuthHeaders = oidcAccessToken => ({
  Authorization: `Bearer ${oidcAccessToken}`,
  'Content-Type': 'application/json',
});

const respondAuthServerError = (res, error) => {
  const status = error.response?.status;

  log.error.error('Notification request to auth server failed', {
    error: error.message,
    status,
    data: error.response?.data,
  });

  if (status === 401 || status === 403) {
    return res.status(status).json({ error: 'NOTIFICATIONS_NOT_AUTHORIZED' });
  }

  return res.status(502).json({ error: 'AUTH_SERVER_UNAVAILABLE' });
};

const proxyNotificationRequest = async (req, res, sendRequest) => {
  const oidcAccessToken = extractOidcAccessToken(req);

  if (!oidcAccessToken) {
    return res.status(401).json({ error: 'OIDC_ACCESS_TOKEN_REQUIRED' });
  }

  try {
    const response = await sendRequest(buildAuthHeaders(oidcAccessToken));
    return res.status(response.status).json(response.data || {});
  } catch (error) {
    return respondAuthServerError(res, error);
  }
};

const buildListQuery = query => {
  const params = new URLSearchParams();
  for (const key of ['page', 'size', 'unreadOnly']) {
    if (typeof query[key] !== 'undefined') {
      params.set(key, query[key]);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

/**
 * @swagger
 * /api/notifications/vapid-key:
 *   get:
 *     summary: Get BoxVault's push public key
 *     description: Public VAPID key browsers pass to PushManager.subscribe(). BoxVault signs its own OS toasts; the notification hub is not involved.
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 *       503:
 *         description: Push notifications are disabled or unconfigured
 */
export const getVapidKey = (req, res) => {
  void req;
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return res.status(503).json({ error: 'PUSH_NOT_CONFIGURED' });
  }

  return res.json({ publicKey });
};

const isValidSubscription = body =>
  typeof body?.endpoint === 'string' &&
  body.endpoint.startsWith('https://') &&
  body.endpoint.length <= 512 &&
  typeof body?.keys?.p256dh === 'string' &&
  typeof body?.keys?.auth === 'string';

/**
 * @swagger
 * /api/notifications/subscriptions:
 *   post:
 *     summary: Register a Web Push subscription
 *     description: Stores a browser push endpoint against the calling user. Subscriptions are held by BoxVault, not the notification hub.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Subscription stored
 *       400:
 *         description: Malformed subscription
 *       500:
 *         description: Internal server error
 */
export const createSubscription = async (req, res) => {
  if (!isValidSubscription(req.body)) {
    return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });
  }

  const { endpoint, keys } = req.body;

  try {
    const existing = await db.pushSubscription.findOne({ where: { endpoint } });

    if (existing) {
      // A shared device can move between accounts; the endpoint follows the
      // browser, so the newest owner wins.
      await existing.update({ user_id: req.userId, p256dh: keys.p256dh, auth: keys.auth });
    } else {
      await db.pushSubscription.create({
        user_id: req.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
    }

    return res.status(204).send();
  } catch (err) {
    log.error.error('Failed to store push subscription', { error: err.message });
    return res.status(500).json({ error: 'SUBSCRIPTION_STORE_FAILED' });
  }
};

/**
 * @swagger
 * /api/notifications/subscriptions:
 *   delete:
 *     summary: Remove a Web Push subscription
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Subscription removed (or was already absent)
 *       400:
 *         description: Missing endpoint
 *       500:
 *         description: Internal server error
 */
export const deleteSubscription = async (req, res) => {
  const endpoint = req.body?.endpoint;

  if (typeof endpoint !== 'string' || endpoint === '') {
    return res.status(400).json({ error: 'ENDPOINT_REQUIRED' });
  }

  try {
    await db.pushSubscription.destroy({ where: { endpoint, user_id: req.userId } });
    return res.status(204).send();
  } catch (err) {
    log.error.error('Failed to remove push subscription', { error: err.message });
    return res.status(500).json({ error: 'SUBSCRIPTION_DELETE_FAILED' });
  }
};

export const listNotifications = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.get(`${buildNotificationsUrl(req)}${buildListQuery(req.query)}`, { headers })
  );

export const getUnreadCount = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.get(buildNotificationsUrl(req, '/unread-count'), { headers })
  );

export const markNotificationRead = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.post(buildNotificationsUrl(req, `/${encodeURIComponent(req.params.id)}/read`), null, {
      headers,
    })
  );

export const markAllNotificationsRead = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.post(buildNotificationsUrl(req, '/read-all'), null, { headers })
  );

export const deleteNotification = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.delete(buildNotificationsUrl(req, `/${encodeURIComponent(req.params.id)}`), { headers })
  );
