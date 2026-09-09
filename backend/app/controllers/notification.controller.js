import axios from 'axios';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { notifyUnreadCount } from '../utils/events.js';
import { sendHubNotification } from '../utils/notifyHub.js';
import { resolveUserRecipients } from '../utils/notifyRecipients.js';
import { getVapidPublicKey, sendPushToUsers } from '../utils/webPush.js';
import { problem } from '../utils/problem.js';
import db from '../models/index.js';
import { getAuthServerUrl, extractOidcAccessToken } from './favorites/helpers.js';

const RETRY_AFTER_SECONDS = '60';

const buildNotificationsUrl = (req, path = '') =>
  `${getAuthServerUrl(req)}/api/notifications${path}`;

const buildAuthHeaders = oidcAccessToken => ({
  Authorization: `Bearer ${oidcAccessToken}`,
  'Content-Type': 'application/json',
});

const pushNotConfigured = (req, res) =>
  problem(res, req, {
    status: 503,
    type: 'send-failed',
    title: req.__('notifications.pushNotConfigured'),
  });

const respondAuthServerError = (req, res, error) => {
  const status = error.response?.status;

  log.error.error('Notification request to auth server failed', {
    error: error.message,
    status,
    data: error.response?.data,
  });

  if (status === 401) {
    return problem(res, req, {
      status: 401,
      type: 'authentication',
      title: req.__('auth.unauthorized'),
    });
  }
  if (status === 403) {
    return problem(res, req, { status: 403, type: 'forbidden', title: req.__('auth.forbidden') });
  }

  return problem(res, req, {
    status: 502,
    type: 'internal',
    title: req.__('users.preferencesDelegationFailed'),
  });
};

const pushUnreadCount = async (req, headers) => {
  try {
    const response = await axios.get(buildNotificationsUrl(req, '/unread-count'), { headers });
    notifyUnreadCount(req.userId, response.data?.count ?? 0);
  } catch (error) {
    log.app.warn('Unread count refresh failed', { error: error.message });
  }
};

/**
 * Forward one request to the identity provider with the session's OIDC access
 * token and answer its status and body unmapped: a 401 authentication problem
 * without a token, the provider's own 401 or 403 as an authentication or
 * forbidden problem, a 502 internal problem when the provider cannot be reached.
 * @param {import('express').Request} req - The request, with the session resolved
 * @param {import('express').Response} res - The response
 * @param {function(Object): Promise<{status: number, data: *}>} sendRequest - Sends the upstream request with the bearer headers
 * @param {{pushCount?: boolean}} [options] - Whether to push the unread count on the event stream afterwards
 * @returns {Promise<void>}
 */
export const proxyNotificationRequest = async (
  req,
  res,
  sendRequest,
  { pushCount = false } = {}
) => {
  const oidcAccessToken = extractOidcAccessToken(req);

  if (!oidcAccessToken) {
    return problem(res, req, {
      status: 401,
      type: 'authentication',
      title: req.__('auth.unauthorized'),
    });
  }

  const headers = buildAuthHeaders(oidcAccessToken);
  try {
    const response = await sendRequest(headers);
    res.status(response.status).json(response.data || {});
  } catch (error) {
    return respondAuthServerError(req, res, error);
  }
  if (pushCount) {
    await pushUnreadCount(req, headers);
  }
  return undefined;
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
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getVapidKey = (req, res) => {
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return pushNotConfigured(req, res);
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
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const createSubscription = async (req, res) => {
  if (!isValidSubscription(req.body)) {
    return problem(res, req, { status: 400, type: 'bad-request' });
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
    return problem(res, req, { status: 500, type: 'internal' });
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
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const deleteSubscription = async (req, res) => {
  const endpoint = req.body?.endpoint;

  if (typeof endpoint !== 'string' || endpoint === '') {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      errors: [{ pointer: '/endpoint', rule: 'required', params: {} }],
    });
  }

  try {
    await db.pushSubscription.destroy({ where: { endpoint, user_id: req.userId } });
    return res.status(204).send();
  } catch (err) {
    log.error.error('Failed to remove push subscription', { error: err.message });
    return problem(res, req, { status: 500, type: 'internal' });
  }
};

const testNotification = req => ({
  title: req.__('notifications.test.title'),
  body: req.__('notifications.test.body'),
  navigate: `${loadConfig('app').boxvault.origin}/`,
  tag: 'boxvault-test',
});

/**
 * @swagger
 * /api/notifications/test/toast:
 *   post:
 *     summary: Send the caller a test toast
 *     description: Delivers one OS toast through BoxVault's own Web Push stack to every subscription the calling user registered on this origin.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count of subscriptions the push service accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 delivered:
 *                   type: integer
 *       503:
 *         description: Push notifications are disabled or unconfigured
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const sendTestToast = async (req, res) => {
  if (!getVapidPublicKey()) {
    return pushNotConfigured(req, res);
  }
  const delivered = await sendPushToUsers([req.userId], testNotification(req));
  return res.json({ delivered });
};

/**
 * @swagger
 * /api/notifications/test/channel:
 *   post:
 *     summary: Send the caller a test Notification Channel Notification
 *     description: Writes one notification addressed to the calling user through the notification hub, the way every BoxVault event reaches the bell.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The hub accepted the write
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 delivered:
 *                   type: integer
 *       404:
 *         description: The caller has no identity-provider credential to address
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       503:
 *         description: The hub is disabled, unreachable or refused the write; Retry-After names when to try again
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds to wait before retrying
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const sendTestChannel = async (req, res) => {
  const [recipient] = await resolveUserRecipients([req.userId]);
  if (!recipient) {
    return problem(res, req, { status: 404, type: 'not-found' });
  }
  const accepted = await sendHubNotification({
    issuer: recipient.issuer,
    recipient: { user_uuid: recipient.uuid },
    notification: testNotification(req),
    type: 'SYSTEM',
    severity: 'INFO',
    idempotencyKey: `boxvault:test:${recipient.uuid}:${Date.now()}`,
  });
  if (!accepted) {
    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return problem(res, req, { status: 503, type: 'send-failed' });
  }
  return res.json({ delivered: 1 });
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
  proxyNotificationRequest(
    req,
    res,
    headers =>
      axios.post(buildNotificationsUrl(req, `/${encodeURIComponent(req.params.id)}/read`), null, {
        headers,
      }),
    { pushCount: true }
  );

export const markAllNotificationsRead = (req, res) =>
  proxyNotificationRequest(
    req,
    res,
    headers => axios.post(buildNotificationsUrl(req, '/read-all'), null, { headers }),
    { pushCount: true }
  );

export const deleteNotification = (req, res) =>
  proxyNotificationRequest(
    req,
    res,
    headers =>
      axios.delete(buildNotificationsUrl(req, `/${encodeURIComponent(req.params.id)}`), {
        headers,
      }),
    { pushCount: true }
  );

/**
 * @swagger
 * /api/notifications:
 *   delete:
 *     summary: Clear the caller's inbox
 *     description: Forwards to the notification hub's DELETE /api/notifications with the session's OIDC access token and answers the hub's status and body unmapped, then pushes the unread count on the event stream.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: The inbox is empty
 *       401:
 *         description: No OIDC access token on the session, or the hub refused the token
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The hub refused the request
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       502:
 *         description: The hub is unreachable
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const deleteAllNotifications = (req, res) =>
  proxyNotificationRequest(
    req,
    res,
    headers => axios.delete(buildNotificationsUrl(req), { headers }),
    { pushCount: true }
  );
