const axios = require('axios');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require('jsonwebtoken');

let authConfig;
let appConfig;
try {
  authConfig = loadConfig('auth');
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load configuration: ${e.message}`);
}

/**
 * Get authentication server base URL from OIDC provider config
 * @param {Object} req - Express request object to extract provider from JWT
 * @returns {string} Auth server base URL
 */
const getAuthServerUrl = (req) => {
  const token = req.headers['x-access-token'];
  if (!token) {
    throw new Error('No access token provided');
  }
  
  try {
    // Decode JWT to get the provider user logged in with
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    const provider = decoded.provider?.replace('oidc-', ''); // e.g., "oidc-startcloud" -> "startcloud"
    
    if (!provider) {
      throw new Error('No provider in JWT');
    }
    
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
 * Extract OIDC access token from BoxVault JWT
 * @param {Object} req - Express request object
 * @returns {string|null} OIDC access token or null
 */
const extractOidcAccessToken = (req) => {
  const token = req.headers['x-access-token'];
  if (!token) return null;
  
  try {
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    return decoded.oidc_access_token || null;
  } catch (error) {
    log.error.error('Failed to decode JWT for OIDC token extraction:', error.message);
    return null;
  }
};

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get user's favorite applications
 *     description: Retrieve the current user's favorite applications (raw JSON)
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   clientId:
 *                     type: string
 *                   customLabel:
 *                     type: string
 *                   order:
 *                     type: integer
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to fetch favorites from auth server
 */
exports.getFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);
    
    if (!oidcAccessToken) {
      log.auth.warn('No OIDC access token available for favorites request');
      // Return empty array for non-OIDC users
      return res.status(200).json([]);
    }
    
    const authServerUrl = getAuthServerUrl(req);
    
    log.auth.debug('Fetching favorites from auth server', { 
      authServerUrl,
      hasToken: !!oidcAccessToken 
    });
    
    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Extract favorite_apps from userinfo claims and return raw favorites format
    const favoriteApps = response.data?.favorite_apps || [];
    // Convert enriched format back to raw format (just clientId, customLabel, order)
    const rawFavorites = favoriteApps.map(app => ({
      clientId: app.clientId,
      customLabel: app.customLabel,
      order: app.order
    }));
    
    res.status(200).json(rawFavorites);
  } catch (error) {
    log.error.error('Error fetching favorites from auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Return empty array on error to prevent frontend breakage
    res.status(200).json([]);
  }
};

/**
 * @swagger
 * /api/favorites/save:
 *   post:
 *     summary: Save user's favorite applications
 *     description: Save the current user's favorite applications
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 clientId:
 *                   type: string
 *                 customLabel:
 *                   type: string
 *                 order:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Favorites saved successfully
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to save favorites to auth server
 */
exports.saveFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);
    
    if (!oidcAccessToken) {
      return res.status(401).json({ 
        message: 'OIDC authentication required to manage favorites' 
      });
    }
    
    const authServerUrl = getAuthServerUrl(req);
    const favoritesJson = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    log.auth.debug('Saving favorites to auth server', { 
      authServerUrl,
      favoritesCount: Array.isArray(req.body) ? req.body.length : 'unknown'
    });
    
    const response = await axios.post(
      `${authServerUrl}/user/favorites/save`,
      favoritesJson,
      {
        headers: {
          'Authorization': `Bearer ${oidcAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.status(200).json({ message: 'Favorites saved successfully' });
  } catch (error) {
    log.error.error('Error saving favorites to auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    res.status(500).json({ 
      message: error.response?.data?.message || 'Failed to save favorites' 
    });
  }
};

/**
 * @swagger
 * /api/userinfo/claims:
 *   get:
 *     summary: Get enriched user claims including favorites
 *     description: Retrieve user claims with enriched favorite applications data
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sub:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 favorite_apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clientId:
 *                         type: string
 *                       clientName:
 *                         type: string
 *                       customLabel:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       iconUrl:
 *                         type: string
 *                       homeUrl:
 *                         type: string
 *                       order:
 *                         type: integer
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to fetch claims from auth server
 */
exports.getUserInfoClaims = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);
    
    if (!oidcAccessToken) {
      log.auth.warn('No OIDC access token available for claims request');
      // Return minimal claims for non-OIDC users
      return res.status(200).json({
        sub: req.userId,
        favorite_apps: []
      });
    }
    
    const authServerUrl = getAuthServerUrl(req);
    
    log.auth.debug('Fetching enriched claims from auth server', { 
      authServerUrl,
      hasToken: !!oidcAccessToken 
    });
    
    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.status(200).json(response.data);
  } catch (error) {
    log.error.error('Error fetching claims from auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Return minimal claims on error
    res.status(200).json({
      sub: req.userId,
      favorite_apps: []
    });
  }
};

/**
 * @swagger
 * /api/userinfo/favorites:
 *   get:
 *     summary: Get enriched favorite apps (lightweight endpoint)
 *     description: Get only the enriched favorite applications
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Failed to fetch from auth server
 */
exports.getEnrichedFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);
    
    if (!oidcAccessToken) {
      return res.status(200).json([]);
    }
    
    const authServerUrl = getAuthServerUrl(req);
    
    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.status(200).json(response.data?.favorite_apps || []);
  } catch (error) {
    log.error.error('Error fetching enriched favorites:', error.message);
    res.status(200).json([]);
  }
};

module.exports = {
  getFavorites: exports.getFavorites,
  saveFavorites: exports.saveFavorites,
  getUserInfoClaims: exports.getUserInfoClaims,
  getEnrichedFavorites: exports.getEnrichedFavorites,
};
