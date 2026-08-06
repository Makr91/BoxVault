import axios from 'axios';
import { log } from '../utils/Logger.js';
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

export const createSubscription = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.post(buildNotificationsUrl(req, '/subscriptions'), req.body, { headers })
  );

export const deleteSubscription = (req, res) =>
  proxyNotificationRequest(req, res, headers => {
    const endpoint = encodeURIComponent(req.body?.endpoint || '');
    return axios.delete(`${buildNotificationsUrl(req, '/subscriptions')}?endpoint=${endpoint}`, {
      headers,
    });
  });

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
