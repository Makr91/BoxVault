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
 * @param {Object} req - Express request object to extract provider from JWT
 * @returns {string} Auth server base URL
 */
const getAuthServerUrl = req => {
  const token = req.headers['x-access-token'];

  try {
    const decoded = decode(token);
    const provider = decoded?.provider?.replace('oidc-', ''); // e.g., "oidc-startcloud" -> "startcloud"

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
 * Extract OIDC access token from BoxVault JWT or refreshed token
 * @param {Object} req - Express request object
 * @returns {string|null} OIDC access token or null
 */
const extractOidcAccessToken = req => {
  // Check if token was refreshed by middleware - this takes precedence
  if (req.oidcAccessToken) {
    return req.oidcAccessToken;
  }

  const token = req.headers['x-access-token'];

  const decoded = decode(token);
  return decoded?.oidc_access_token || null;
};

export { getAuthServerUrl, extractOidcAccessToken };
