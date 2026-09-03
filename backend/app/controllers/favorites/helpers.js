// helpers.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import jwt from 'jsonwebtoken';

const { decode } = jwt;

const getAuthConfig = () => {
  try {
    return loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load configuration: ${e.message}`);
    return {};
  }
};

/**
 * Get authentication server base URL from OIDC provider config
 * @param {Object} req - Express request object carrying the resolved provider or the session JWT
 * @returns {string} Auth server base URL
 */
const getAuthServerUrl = req => {
  try {
    const providerTag = req.authProvider || decode(req.headers['x-access-token'])?.provider;
    const provider = providerTag?.replace('oidc-', '');

    if (!provider) {
      throw new Error('No provider in JWT');
    }

    const authConfig = getAuthConfig();
    const oidcProviders = authConfig.auth?.oidc?.providers || {};
    const providerConfig = oidcProviders[provider];

    if (!providerConfig || !providerConfig.issuer?.value) {
      throw new Error(`Provider ${provider} not found in config`);
    }

    // Extract base URL from issuer
    const issuerUrl = new URL(providerConfig.issuer.value);
    return `${issuerUrl.protocol}//${issuerUrl.host}`;
  } catch (error) {
    log.error.error('Failed to get auth server URL:', error.message);
    throw error;
  }
};

/**
 * Extract the identity-provider access token of the session: the one the
 * request resolved or refreshed, else the one inside the session JWT
 * @param {Object} req - Express request object
 * @returns {string|null} OIDC access token or null
 */
const extractOidcAccessToken = req => {
  if (req.oidcAccessToken) {
    return req.oidcAccessToken;
  }
  return decode(req.headers['x-access-token'])?.oidc_access_token || null;
};

export { getAuthServerUrl, extractOidcAccessToken };
