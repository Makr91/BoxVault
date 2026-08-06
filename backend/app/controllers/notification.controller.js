import axios from 'axios';
import { log } from '../utils/Logger.js';
import { getAuthServerUrl, extractOidcAccessToken } from './favorites/helpers.js';

const buildSubscriptionsUrl = req => `${getAuthServerUrl(req)}/api/notifications/subscriptions`;

const buildAuthHeaders = oidcAccessToken => ({
  Authorization: `Bearer ${oidcAccessToken}`,
  'Content-Type': 'application/json',
});

const respondAuthServerError = (res, error) => {
  const status = error.response?.status;

  log.error.error('Notification subscription request to auth server failed', {
    error: error.message,
    status,
    data: error.response?.data,
  });

  if (status === 401 || status === 403) {
    return res.status(status).json({ error: 'NOTIFICATIONS_NOT_AUTHORIZED' });
  }

  return res.status(502).json({ error: 'AUTH_SERVER_UNAVAILABLE' });
};

const proxySubscriptionRequest = async (req, res, sendRequest) => {
  const oidcAccessToken = extractOidcAccessToken(req);

  if (!oidcAccessToken) {
    return res.status(401).json({ error: 'OIDC_ACCESS_TOKEN_REQUIRED' });
  }

  try {
    const response = await sendRequest(
      buildSubscriptionsUrl(req),
      buildAuthHeaders(oidcAccessToken)
    );
    return res.status(response.status).json(response.data || {});
  } catch (error) {
    return respondAuthServerError(res, error);
  }
};

export const createSubscription = (req, res) =>
  proxySubscriptionRequest(req, res, (url, headers) => axios.post(url, req.body, { headers }));

export const deleteSubscription = (req, res) =>
  proxySubscriptionRequest(req, res, (url, headers) =>
    axios.delete(url, { headers, data: req.body })
  );
